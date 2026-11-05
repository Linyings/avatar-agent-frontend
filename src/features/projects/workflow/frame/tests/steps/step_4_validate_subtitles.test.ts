import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  chunkSubtitleSegments,
  mergeSubtitleValidationResponses,
  step4ValidateSubtitles,
} from '../../steps/step_4_validate_subtitles'
import type { FrameWorkflowRuntimeContext, ValidateSubtitlesOutput } from '../../types'
import { makeTranscribeOutput, successRecord } from './fixtures'

const mocks = vi.hoisted(() => ({
  validateSubtitlesStream: vi.fn(),
}))

vi.mock('@/shared/services/aiToolsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/services/aiToolsService')>()
  return {
    ...actual,
    aiToolsService: {
      validateSubtitlesStream: mocks.validateSubtitlesStream,
    },
  }
})

const makeContext = (): FrameWorkflowRuntimeContext => ({
  projectId: 'project-1',
  files: [],
  config: {
    outputLanguage: 'zh-CN',
    defaultNFrames: 10,
    maxDecisions: 8,
  },
  records: {
    transcribe: successRecord('transcribe', makeTranscribeOutput()),
  },
  updateStepProgress: vi.fn(),
  appendStepLog: vi.fn(),
  updateStepLog: vi.fn(),
})

describe('workflow/frame/steps/step_4_validate_subtitles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.validateSubtitlesStream.mockResolvedValue({
      success: true,
      provider: 'openai',
      model: 'flash-test',
      content: '{}',
      analysis: { corrections_count: 2 },
      subtitles: {},
      segments: [
        { id: '1', start: 0, end: 1.2, text: '开场。', speaker_id: 'speaker_0' },
        { id: '2', text: '冲突出现了。', speaker_id: 'speaker_0' },
      ],
      validation: {
        status: 'completed',
        model: 'flash-test',
        request_id: 'request-1',
        tokens_consumed: 44,
        corrections_count: 2,
        updated_at: '2026-05-12T00:00:00.000Z',
      },
      usage: { total_tokens: 44 },
      request_id: 'request-1',
      tokens_consumed: 44,
      updated_at: '2026-05-12T00:00:00.000Z',
    })
  })

  it('buildInput 只提交校对所需的字幕段，避免重复发送全文和逐词时间线', () => {
    const input = step4ValidateSubtitles.buildInput(makeContext()) as {
      language: string
      segments: Array<{ id: string; start: number; end: number; text: string; speaker_id?: string }>
    }

    expect(input).not.toHaveProperty('transcript')
    expect(input).not.toHaveProperty('videoContext')
    expect(input).not.toHaveProperty('phrases')
    expect(input).not.toHaveProperty('words')
    expect(input.language).toBe('zh-CN')
    expect(input.segments).toEqual([
      { id: '1', start: 0, end: 1.2, text: '开场。', speaker_id: 'speaker_0', confidence: 0.95 },
      { id: '2', start: 1.5, end: 3, text: '冲突出现。', speaker_id: 'speaker_1', confidence: 0.95 },
    ])
  })

  it('run 会接受文本和 speaker 修正，并在缺少模型时间戳时回退到原始时间戳', async () => {
    const context = makeContext()

    const output = await step4ValidateSubtitles.run(step4ValidateSubtitles.buildInput(context), context) as ValidateSubtitlesOutput

    expect(mocks.validateSubtitlesStream).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1' }),
      expect.objectContaining({ onEvent: expect.any(Function) })
    )
    expect(output.subtitleResult.segments).toEqual([
      { id: '1', startTime: 0, endTime: 1.2, text: '开场。', confidence: 0.95, speakerId: 'speaker_0' },
      { id: '2', startTime: 1.5, endTime: 3, text: '冲突出现了。', confidence: 0.95, speakerId: 'speaker_0' },
    ])
    expect(output.subtitlePayload).toEqual({
      '1': { start_time: 0, end_time: 1.2, subtitle: '开场。', speaker_id: 'speaker_0' },
      '2': { start_time: 1.5, end_time: 3, subtitle: '冲突出现了。', speaker_id: 'speaker_0' },
    })
    expect(output.initialVideoContext.items['2']).toMatchObject({
      start_time: 1.5,
      end_time: 3,
      subtitle: '冲突出现了。',
      speaker_id: 'speaker_0',
    })
    expect(output.transcription.text_content).toBe('开场。冲突出现了。')
    expect(output.validation).toMatchObject({ status: 'completed', corrections_count: 2 })
  })

  it('run 会忽略额外条目并只恢复目标字幕，避免模型结构异常阻塞工作流', async () => {
    mocks.validateSubtitlesStream.mockResolvedValue({
      success: true,
      provider: 'openai',
      model: 'flash-test',
      content: '{}',
      analysis: { corrections_count: 2 },
      subtitles: {},
      segments: [
        { id: '1', start: 0, end: 0.7, text: '少废话。', speaker_id: 'speaker_0' },
        { id: '1b', start: 0.7, end: 1.2, text: '小谢不傻。', speaker_id: 'speaker_1' },
        { id: '2', start: 1.5, end: 3, text: '你投不投？', speaker_id: 'speaker_1' },
      ],
      validation: {
        status: 'completed',
        model: 'flash-test',
        request_id: 'request-1',
        tokens_consumed: 44,
        corrections_count: 2,
        updated_at: '2026-05-12T00:00:00.000Z',
      },
      usage: { total_tokens: 44 },
      request_id: 'request-1',
      tokens_consumed: 44,
      updated_at: '2026-05-12T00:00:00.000Z',
    })

    const context = makeContext()
    const output = await step4ValidateSubtitles.run(
      step4ValidateSubtitles.buildInput(context),
      context
    ) as ValidateSubtitlesOutput

    expect(mocks.validateSubtitlesStream).toHaveBeenCalledTimes(1)
    expect(output.subtitleResult.segments).toEqual([
      { id: '1', startTime: 0, endTime: 0.7, text: '少废话。', confidence: 0.95, speakerId: 'speaker_0' },
      { id: '2', startTime: 1.5, endTime: 3, text: '你投不投？', confidence: 0.95, speakerId: 'speaker_1' },
    ])
    expect(output.validation).toMatchObject({ status: 'completed', fallback_segments: 0 })
  })

  it('单个分片失败时只重试该分片一次，并在第二次成功后继续', async () => {
    const context = makeContext()
    mocks.validateSubtitlesStream
      .mockRejectedValueOnce(new Error('request timed out'))
      .mockResolvedValueOnce({
        success: true,
        provider: 'openai',
        model: 'flash-test',
        content: '{}',
        analysis: { corrections_count: 0 },
        subtitles: {},
        segments: [
          { id: '1', start: 0, end: 1.2, text: '开场。', speaker_id: 'speaker_0' },
          { id: '2', start: 1.5, end: 3, text: '冲突出现。', speaker_id: 'speaker_1' },
        ],
        validation: {
          status: 'completed', model: 'flash-test', request_id: 'request-retry', tokens_consumed: 1,
          corrections_count: 0, updated_at: '2026-05-12T00:00:00.000Z',
        },
        usage: { total_tokens: 1 },
        request_id: 'request-retry',
        tokens_consumed: 1,
        updated_at: '2026-05-12T00:00:00.000Z',
      })

    await expect(step4ValidateSubtitles.run(step4ValidateSubtitles.buildInput(context), context)).resolves.toMatchObject({
      subtitleResult: { segments: expect.any(Array) },
    })
    expect(mocks.validateSubtitlesStream).toHaveBeenCalledTimes(2)
  })

  it('按 20 条和 90 秒上限切分，并只提供前后两条上下文', () => {
    const source = Array.from({ length: 45 }, (_, index) => ({
      id: String(index + 1),
      start: index * 4,
      end: index * 4 + 2,
      text: `字幕${index + 1}`,
    }))

    const chunks = chunkSubtitleSegments(source)

    expect(chunks.map((chunk) => chunk.targetSegments.length)).toEqual([20, 20, 5])
    expect(chunks[0].contextSegments.map((segment) => segment.id)).toEqual(['21', '22'])
    expect(chunks[1].contextSegments.map((segment) => segment.id)).toEqual(['19', '20', '41', '42'])
    expect(chunks[2].contextSegments.map((segment) => segment.id)).toEqual(['39', '40'])
    for (const chunk of chunks) {
      const targetIds = new Set(chunk.targetSegments.map((segment) => String(segment.id)))
      expect(chunk.contextSegments.every((segment) => !targetIds.has(String(segment.id)))).toBe(true)
    }

    expect(chunks[0].targetSegments.at(-1)?.start).toBe(76)
    expect(chunks[1].targetSegments.at(-1)?.start).toBe(156)
  })

  it('按字幕 ID 严格恢复原始顺序，并拒绝重复或缺失 ID', () => {
    const source = [
      { id: '1', start: 0, end: 1, text: '一' },
      { id: '2', start: 1, end: 2, text: '二' },
    ]
    const response = (segments: typeof source) => ({
      success: true,
      provider: 'openai',
      model: 'flash-test',
      content: '{}',
      analysis: {},
      subtitles: {},
      segments,
      validation: { status: 'completed' as const, model: 'flash-test', request_id: '', tokens_consumed: 1, corrections_count: 0, updated_at: '' },
      usage: { total_tokens: 1 },
      request_id: '',
      tokens_consumed: 1,
      updated_at: '',
    })

    expect(mergeSubtitleValidationResponses([response([source[1], source[0]])], source).segments.map((segment) => segment.id)).toEqual(['1', '2'])
    expect(() => mergeSubtitleValidationResponses([response([source[0], source[0]])], source)).toThrow('字幕校对分片合并失败')
  })
})
