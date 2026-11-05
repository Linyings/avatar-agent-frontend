import { describe, expect, it, vi } from 'vitest'
import type { DecideTimelineViewRequest, DecideTimelineViewResponse } from '@/shared/services/aiToolsService'
import {
  buildChunkCandidates,
  decideTimelineViewChunked,
  mergeChunkDecisions,
  packTranscriptToPhrases,
  splitPhrasesIntoChunks,
  type PackedTimelinePhrase,
} from '../../services/timelineDecisionOrchestrator'

const makeResponse = (
  request: DecideTimelineViewRequest,
  requestId: string
): DecideTimelineViewResponse => {
  const segment = (request.segments?.[0] ?? { start: 0, end: 4 }) as { start?: number; end?: number }
  const decision = {
    start: segment.start ?? 0,
    end: segment.end ?? 4,
    priority: 'high',
    trigger_type: 'candidate_cut',
    reason: `model decision ${requestId}`,
    expected_question: '画面是否需要复核？',
    n_frames: request.defaultNFrames ?? 8,
  }
  return {
    success: true,
    provider: 'test',
    model: 'test-model',
    content: '{}',
    analysis: {
      summary: 'ok',
      needs_timeline_view: true,
      decisions: [decision],
      skipped: [],
      confidence: 'high',
      global_notes: [],
    },
    decisions: [decision],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 3,
      total_tokens: 13,
    },
    request_id: requestId,
    tokens_consumed: 13,
    updated_at: '2026-05-05T00:00:00.000Z',
  }
}

const makeLongPhrases = (durationSeconds = 7200): PackedTimelinePhrase[] => (
  Array.from({ length: Math.ceil(durationSeconds / 30) }, (_, index) => ({
    id: `phrase-${index + 1}`,
    start: index * 30,
    end: index * 30 + 5,
    text: `第 ${index + 1} 句台词？`,
    speakerId: index % 2 ? 'b' : 'a',
    source: 'phrase',
  }))
)

describe('workflow/frame/services/timelineDecisionOrchestrator', () => {
  it('按 phrases、words、subtitle、segments 的优先级 pack 转录文本', () => {
    expect(packTranscriptToPhrases({
      transcription: {
        phrases: [{ start: 1, end: 2, text: '优先句子', speaker_id: 'speaker_0' }],
        words: [{ start: 0, end: 0.2, text: 'word' }],
      } as never,
      subtitleResult: {
        segments: [{ startTime: 3, endTime: 4, text: '字幕句' }],
      } as never,
      segments: [{ start: 5, end: 6, text: '兜底段' }],
    })).toMatchObject([
      { start: 1, end: 2, text: '优先句子', source: 'phrase', speakerId: 'speaker_0' },
    ])

    expect(packTranscriptToPhrases({
      transcription: {
        words: [
          { start: 0, end: 0.2, text: '你好', speaker_id: 'a' },
          { start: 0.25, end: 0.5, text: '吗？', speaker_id: 'a' },
          { start: 1.2, end: 1.5, text: '回来', speaker_id: 'b' },
        ],
      } as never,
    })).toMatchObject([
      { start: 0, end: 0.5, text: '你好 吗？', source: 'word' },
      { start: 1.2, end: 1.5, text: '回来', source: 'word' },
    ])
  })

  it('长视频会分片并从停顿、说话人切换和提示词生成候选点', () => {
    const phrases = makeLongPhrases()
    const chunks = splitPhrasesIntoChunks(phrases, { windowSeconds: 300, overlapSeconds: 30 })

    expect(chunks.length).toBeGreaterThan(10)
    expect(chunks[1].start).toBe(270)

    const { candidates, observedGaps } = buildChunkCandidates(chunks[0], {
      prompt: '台词',
      defaultNFrames: 6,
    })

    expect(observedGaps.length).toBeGreaterThan(0)
    expect(candidates.some((item) => item.source_signals.includes('silence_gap'))).toBe(true)
    expect(candidates.some((item) => item.source_signals.includes('speaker_change'))).toBe(true)
    expect(candidates.some((item) => item.source_signals.includes('prompt_keyword'))).toBe(true)
  })

  it('长转录不会把全片 transcript 一次性发送给后端，而是逐片携带候选点', async () => {
    const phrases = makeLongPhrases()
    const fullTranscript = phrases.map((item) => item.text).join('\n')
    const requests: DecideTimelineViewRequest[] = []
    const decideTimelineView = vi.fn(async (request: DecideTimelineViewRequest) => {
      requests.push(request)
      return makeResponse(request, `req-${requests.length}`)
    })

    const response = await decideTimelineViewChunked({
      transcription: { phrases } as never,
      videoContext: fullTranscript,
      transcript: fullTranscript,
      maxDecisions: 8,
      defaultNFrames: 6,
      prompt: '台词',
    }, {
      decideTimelineView,
      longTranscriptThresholdSeconds: 60,
      windowSeconds: 300,
      overlapSeconds: 30,
      sleep: vi.fn().mockResolvedValue(undefined),
      now: () => new Date('2026-05-05T00:00:00.000Z'),
    })

    expect(decideTimelineView).toHaveBeenCalledTimes(response.chunk_request_ids.length)
    expect(response.chunk_request_ids.length).toBeLessThanOrEqual(response.strategy.max_model_chunks)
    expect(response.chunk_request_ids.length).toBeLessThanOrEqual(response.strategy.chunk_count)
    expect(response.strategy.mode).toBe('chunked_frontend')
    expect(response.decisions.length).toBeGreaterThan(0)
    expect(response.chunk_request_ids.length).toBe(requests.length)
    expect(requests.every((request) => (request.transcript?.length ?? 0) < fullTranscript.length)).toBe(true)
    expect(requests.every((request) => (request.segments?.length ?? 0) < phrases.length)).toBe(true)
    expect(requests.every((request) => Array.isArray(request.candidateCuts))).toBe(true)
    expect(requests.every((request) => Array.isArray(request.observedGaps))).toBe(true)
  })

  it('分片模型错误会标记为 failed 且不生成兜底决策', async () => {
    const decideTimelineView = vi.fn(async () => {
      throw new Error('模型连接失败')
    })

    const phrases = makeLongPhrases(130)
    const response = await decideTimelineViewChunked({
      transcription: { phrases } as never,
      transcript: phrases.map((item) => item.text).join('\n'),
      maxDecisions: 4,
      defaultNFrames: 5,
    }, {
      decideTimelineView,
      longTranscriptThresholdSeconds: 60,
      windowSeconds: 60,
      overlapSeconds: 0,
      maxConcurrentChunks: 1,
      retryDelayMs: 1,
      sleep: vi.fn().mockResolvedValue(undefined),
    })

    expect(response.strategy.mode).toBe('chunked_frontend')
    expect(response.failed_chunks.length).toBe(response.chunk_request_ids.length || response.strategy.chunk_count)
    expect(decideTimelineView).toHaveBeenCalledTimes(response.failed_chunks.length)
    expect(response.decisions).toHaveLength(0)
    expect(response.failed_chunks.every((chunk) => chunk.status === 'failed')).toBe(true)
    expect(response.failed_chunks.every((chunk) => chunk.error?.includes('模型连接失败'))).toBe(true)
  })

  it('分片失败进度只标记当前分片，不会串到下一个分片', async () => {
    const decideTimelineView = vi.fn(async () => {
      throw new Error('模型连接失败')
    })
    const progressEvents: Array<{ current_chunk?: string; chunks?: Array<{ chunk_id?: string; error?: string }> }> = []
    const phrases = makeLongPhrases(130)

    await decideTimelineViewChunked({
      transcription: { phrases } as never,
      transcript: phrases.map((item) => item.text).join('\n'),
      maxDecisions: 4,
      defaultNFrames: 5,
    }, {
      decideTimelineView,
      longTranscriptThresholdSeconds: 60,
      windowSeconds: 60,
      overlapSeconds: 0,
      maxConcurrentChunks: 1,
      retryDelayMs: 1,
      sleep: vi.fn().mockResolvedValue(undefined),
      onProgress: (progress) => {
        progressEvents.push({
          current_chunk: progress.current_chunk,
          chunks: progress.chunks?.map((chunk) => ({
            chunk_id: chunk.chunk_id,
            error: chunk.error,
          })),
        })
      },
    })

    const firstRetryProgress = progressEvents.find((event) => (
      event.current_chunk === 'chunk-001'
      && event.chunks?.some((chunk) => chunk.chunk_id === 'chunk-001' && chunk.error?.includes('模型连接失败'))
    ))

    expect(firstRetryProgress).toBeDefined()
    expect(firstRetryProgress?.chunks?.find((chunk) => chunk.chunk_id === 'chunk-002')?.error).toBeUndefined()
  })

  it('合并决策时同一时间段只基于模型结果去重', () => {
    const decisions = mergeChunkDecisions([
      {
        chunk_id: 'chunk-001',
        index: 0,
        start: 0,
        end: 10,
        status: 'failed',
        attempt_count: 1,
        candidates: [],
        observed_gaps: [],
        decisions: [],
      },
      {
        chunk_id: 'chunk-002',
        index: 1,
        start: 0,
        end: 10,
        status: 'model_success',
        attempt_count: 1,
        candidates: [],
        observed_gaps: [],
        decisions: [
          { start: 2, end: 6, priority: 'medium', trigger_type: 'candidate_cut', reason: 'model', source: 'model' },
        ],
      },
    ], 3)

    expect(decisions).toHaveLength(1)
    expect(decisions[0]).toMatchObject({ reason: 'model', source: 'model' })
  })
})
