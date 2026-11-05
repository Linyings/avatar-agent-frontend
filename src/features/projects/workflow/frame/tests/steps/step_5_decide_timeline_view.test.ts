import { beforeEach, describe, expect, it, vi } from 'vitest'
import { step5DecideTimelineView } from '../../steps/step_5_decide_timeline_view'
import type { FrameWorkflowRuntimeContext, MergeVideosOutput, ValidateSubtitlesOutput } from '../../types'
import type { ChunkedTimelineDecisionResponse, TimelineDecisionProgress } from '../../services/timelineDecisionOrchestrator'

const mocks = vi.hoisted(() => ({
  decideTimelineViewChunked: vi.fn(),
}))

vi.mock('../../services/timelineDecisionOrchestrator', () => ({
  decideTimelineViewChunked: mocks.decideTimelineViewChunked,
}))

const makeMergedOutput = (duration = 125): MergeVideosOutput => ({
  file: new File(['video'], 'source.mp4', { type: 'video/mp4' }),
  video: {
    name: 'source.mp4',
    size: 5,
    type: 'video/mp4',
    duration,
  },
})

const makeTranscribeOutput = (): ValidateSubtitlesOutput => ({
  transcription: {
    success: true,
    provider: 'elevenlabs',
    model: 'scribe_v1',
    raw_result: {},
    packed_transcript: '[0.00-1.20] 开场。[1.50-3.00] 冲突出现。',
    phrases: [],
    words: [],
    audio_events: [],
    text_content: '开场。冲突出现。',
    language_code: 'zh-CN',
    duration: 3,
    tokens_consumed: 88,
    updated_at: '2026-05-12T00:00:00.000Z',
  },
  subtitleResult: {
    language: 'zh-CN',
    totalDuration: 3,
    processingTime: 0,
    confidence: 0.95,
    segments: [
      { id: '1', startTime: 0, endTime: 1.2, text: '开场。', confidence: 0.95, speakerId: 'speaker_0' },
      { id: '2', startTime: 1.5, endTime: 3, text: '冲突出现。', confidence: 0.95, speakerId: 'speaker_1' },
    ],
  },
  subtitlePayload: {
    '1': { start_time: 0, end_time: 1.2, subtitle: '开场。', speaker_id: 'speaker_0' },
    '2': { start_time: 1.5, end_time: 3, subtitle: '冲突出现。', speaker_id: 'speaker_1' },
  },
  initialVideoContext: {
    items: {
      '1': { start_time: 0, end_time: 1.2, subtitle: '开场。', visual: '', speaker_id: 'speaker_0' },
      '2': { start_time: 1.5, end_time: 3, subtitle: '冲突出现。', visual: '', speaker_id: 'speaker_1' },
    },
    total_segments: 2,
    subtitle_segments: 2,
    visual_segments: 0,
    merged_at: 1,
  },
  validation: {
    status: 'completed',
    model: 'flash-test',
    request_id: 'subtitle-validation-request-1',
    tokens_consumed: 44,
    corrections_count: 0,
    updated_at: '2026-05-12T00:00:00.000Z',
  },
})

const makeContext = ({
  merged,
  transcribed,
  signal,
}: {
  merged?: MergeVideosOutput | null
  transcribed?: ValidateSubtitlesOutput | null
  signal?: AbortSignal
} = {}): FrameWorkflowRuntimeContext => {
  const effectiveMerged = merged === undefined ? makeMergedOutput() : merged
  const effectiveTranscribed = transcribed === undefined ? makeTranscribeOutput() : transcribed

  return {
    projectId: 'project-1',
    files: [],
    config: {
      outputLanguage: 'zh-CN',
      defaultNFrames: 10,
      maxDecisions: 8,
      decisionPrompt: '只关注冲突点',
    },
    records: {
      ...(effectiveMerged
        ? {
          'merge-videos': {
            id: 'merge-videos' as const,
            status: 'success' as const,
            output: effectiveMerged,
          },
        }
        : {}),
      ...(effectiveTranscribed
        ? {
          'validate-subtitles': {
            id: 'validate-subtitles' as const,
            status: 'success' as const,
            output: effectiveTranscribed,
          },
        }
        : {}),
    },
    signal,
    updateStepProgress: vi.fn(),
    updateStepLog: vi.fn(),
  }
}

const makeDecisionResponse = (): ChunkedTimelineDecisionResponse => ({
  success: true,
  provider: 'openai',
  model: 'gpt-test',
  content: '{"decisions":[]}',
  analysis: {
    summary: '需要分析冲突片段',
    needs_timeline_view: true,
  },
  decisions: [
    {
      start: 1.5,
      end: 3,
      reason: '冲突出现',
      expected_question: '发生了什么冲突？',
      priority: 'high',
      trigger_type: 'plot',
      n_frames: 15,
    },
  ],
  request_id: 'decision-request-1',
  usage: { total_tokens: 123 },
  tokens_consumed: 123,
  updated_at: '2026-05-12T00:00:00.000Z',
  strategy: {
    mode: 'chunked_frontend',
    window_seconds: 90,
    overlap_seconds: 10,
    max_decisions: 3,
    per_chunk_max_decisions: 3,
    max_model_chunks: 8,
    max_concurrent_chunks: 3,
    chunk_count: 2,
    source_window_count: 2,
    model_window_count: 2,
    candidate_segment_count: 1,
    failed_count: 1,
    skipped_count: 1,
  },
  chunks: [
    {
      chunk_id: 'chunk-1',
      index: 0,
      start: 0,
      end: 90,
      status: 'model_success',
      attempt_count: 1,
      candidates: [],
      observed_gaps: [],
      decisions: [],
    },
  ],
  failed_chunks: [
    {
      chunk_id: 'chunk-2',
      index: 1,
      start: 90,
      end: 125,
      status: 'failed',
      attempt_count: 2,
      candidates: [],
      observed_gaps: [],
      decisions: [],
      error: '模型失败',
    },
  ],
  chunk_request_ids: ['request-1'],
})

describe('workflow/frame/steps/step_5_decide_timeline_view', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.decideTimelineViewChunked.mockResolvedValue(makeDecisionResponse())
  })

  it('buildInput 会把视频时长、转录文本和字幕段整理成决策请求', () => {
    const transcribed = makeTranscribeOutput()
    const context = makeContext({
      merged: makeMergedOutput(125),
      transcribed,
    })

    const input = step5DecideTimelineView.buildInput(context)

    expect(input).toMatchObject({
      transcription: transcribed.transcription,
      subtitleResult: transcribed.subtitleResult,
      videoContext: '[0.00-1.20] 开场。[1.50-3.00] 冲突出现。',
      transcript: '开场。冲突出现。',
      maxDecisions: 3,
      defaultNFrames: 15,
      prompt: '只关注冲突点',
      segments: [
        { start: 0, end: 1.2, text: '开场。' },
        { start: 1.5, end: 3, text: '冲突出现。' },
      ],
    })
  })

  it('缺少上游输出时会阻止继续执行', () => {
    expect(() => step5DecideTimelineView.buildInput(makeContext({ merged: null }))).toThrow('缺少依赖步骤 merge-videos')
    expect(() => step5DecideTimelineView.buildInput(makeContext({ transcribed: null }))).toThrow('缺少依赖步骤 validate-subtitles')
  })

  it('run 会注入 projectId 调用分片决策编排器，并把进度写回当前步骤', async () => {
    const controller = new AbortController()
    const context = makeContext({ signal: controller.signal })
    const input = step5DecideTimelineView.buildInput(context)
    const { analysisWindowSeconds, ...requestInput } = input as Record<string, unknown> & {
      analysisWindowSeconds: number
    }
    mocks.decideTimelineViewChunked.mockImplementation(async (_input, options) => {
      options.onProgress?.({
        stage: 'chunk_success',
        message: '已完成分片 1/2',
        current_chunk: 'chunk-1',
        completed_chunks: 1,
        total_chunks: 2,
        percentage: 50,
      } satisfies TimelineDecisionProgress)
      return makeDecisionResponse()
    })

    const output = await step5DecideTimelineView.run(input, context)

    expect(mocks.decideTimelineViewChunked).toHaveBeenCalledWith(
      expect.objectContaining({
        ...requestInput,
        projectId: 'project-1',
      }),
      expect.objectContaining({
        signal: controller.signal,
        onProgress: expect.any(Function),
        windowSeconds: analysisWindowSeconds,
      })
    )
    expect(context.updateStepProgress).toHaveBeenCalledWith('decide-timeline-view', {
      percentage: 50,
      message: '已完成分片 1/2',
      current_chunk: 'chunk-1',
      completed_chunks: 1,
      total_chunks: 2,
    })
    expect(context.updateStepLog).toHaveBeenCalledWith(
      'decide-timeline-view',
      '分片进度：',
      '分片进度：已完成分片 1/2'
    )
    expect(output).toEqual(makeDecisionResponse())
  })

  it('进度没有百分比时只写入 message 和分片计数', async () => {
    const context = makeContext()
    const input = step5DecideTimelineView.buildInput(context)
    mocks.decideTimelineViewChunked.mockImplementation(async (_input, options) => {
      options.onProgress?.({
        stage: 'chunking',
        message: '正在拆分转录文本',
        total_chunks: 2,
      } satisfies TimelineDecisionProgress)
      return makeDecisionResponse()
    })

    await step5DecideTimelineView.run(input, context)

    expect(context.updateStepProgress).toHaveBeenCalledWith('decide-timeline-view', {
      message: '正在拆分转录文本',
      current_chunk: undefined,
      completed_chunks: 0,
      total_chunks: 2,
    })
  })

  it('已取消时不会调用分片决策编排器', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(step5DecideTimelineView.run(
      step5DecideTimelineView.buildInput(makeContext()),
      makeContext({ signal: controller.signal })
    )).rejects.toThrow('视觉片段判断已取消')

    expect(mocks.decideTimelineViewChunked).not.toHaveBeenCalled()
  })

  it('summarizeOutput 会汇总决策数、token、策略和失败分片', () => {
    expect(step5DecideTimelineView.summarizeOutput(makeDecisionResponse())).toEqual({
      decisions: 1,
      tokens: 123,
      strategy: 'chunked_frontend',
      chunks: 2,
      source_windows: 2,
      ai_windows: 2,
      candidate_segments: 1,
      failed_chunks: 1,
      skipped_chunks: 1,
    })
  })
})
