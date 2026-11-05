import { beforeEach, describe, expect, it, vi } from 'vitest'
import { step3Transcribe } from '../../steps/step_3_transcribe'
import type { ExtractAudioOutput, FrameWorkflowRuntimeContext, TranscribeOutput } from '../../types'
import type { ElevenLabsScribeResponse } from '@/features/projects/services/material/frameInferencePipelineService'

const mocks = vi.hoisted(() => ({
  transcribeWithFunASR: vi.fn(),
}))

vi.mock('@/shared/services/aiToolsService', () => ({
  aiToolsService: {
    transcribeWithFunASR: mocks.transcribeWithFunASR,
  },
}))

const makeTranscription = (overrides: Partial<ElevenLabsScribeResponse> = {}): ElevenLabsScribeResponse => ({
  success: true,
  provider: 'funasr',
  model: 'fun-asr',
  raw_result: {},
  packed_transcript: '[0.00-1.20] 你好世界。[1.50-2.50] 第二句。',
  phrases: [
    { text: '你好世界。', start: 0, end: 1.2, confidence: 0.98, speaker_id: 'speaker_0' },
    { text: '第二句。', start: 1.5, end: 2.5, confidence: 0.96, speaker_id: 'speaker_1' },
  ],
  words: [
    { text: '你好', start: 0, end: 0.4, type: 'word', confidence: 0.98, speaker_id: 'speaker_0' },
    { text: '世界。', start: 0.5, end: 1.2, type: 'word', confidence: 0.98, speaker_id: 'speaker_0' },
    { text: '第二句。', start: 1.5, end: 2.5, type: 'word', confidence: 0.96, speaker_id: 'speaker_1' },
  ],
  audio_events: [],
  text_content: '你好世界。第二句。',
  language_code: 'zh-CN',
  duration: 2.5,
  tokens_consumed: 321,
  updated_at: '2026-05-12T00:00:00.000Z',
  ...overrides,
})

const makeAudioOutput = (file?: File): ExtractAudioOutput => ({
  ...(file ? { file } : {}),
  audio: {
    name: file?.name ?? 'source.mp3',
    size: file?.size ?? 5,
    type: file?.type ?? 'audio/mpeg',
  },
})

const makeContext = (extracted?: ExtractAudioOutput, signal?: AbortSignal): FrameWorkflowRuntimeContext => ({
  projectId: 'project-1',
  files: [],
  config: {
    outputLanguage: 'zh-CN',
    defaultNFrames: 10,
    maxDecisions: 8,
  },
  records: extracted
    ? {
      'extract-audio': {
        id: 'extract-audio',
        status: 'success',
        output: extracted,
      },
    }
    : {},
  signal,
  updateStepProgress: vi.fn(),
})

describe('workflow/frame/steps/step_3_transcribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transcribeWithFunASR.mockResolvedValue(makeTranscription())
  })

  it('buildInput 会读取音频 File 和输出语言', () => {
    const audioFile = new File(['audio'], 'source.mp3', { type: 'audio/mpeg' })

    expect(step3Transcribe.buildInput(makeContext(makeAudioOutput(audioFile)))).toEqual({
      audioFile,
      outputLanguage: 'zh-CN',
    })
  })

  it('缺少 extract-audio 输出时会阻止继续执行', () => {
    expect(() => step3Transcribe.buildInput(makeContext())).toThrow('缺少依赖步骤 extract-audio')
  })

  it('音频临时 File 已释放时会提示重新执行提取音频', () => {
    expect(() => step3Transcribe.buildInput(makeContext(makeAudioOutput()))).toThrow(
      '提取出的临时音频文件已释放，请从“提取音频”步骤重新执行'
    )
  })

  it('调用 FunASR 转录服务并把响应转换成字幕 payload 和初始 video_context', async () => {
    const audioFile = new File(['audio'], 'source.mp3', { type: 'audio/mpeg' })
    const signal = new AbortController().signal
    const context = makeContext(makeAudioOutput(audioFile), signal)

    const output = await step3Transcribe.run({
      audioFile,
      outputLanguage: 'zh-CN',
    }, context) as TranscribeOutput

    expect(mocks.transcribeWithFunASR).toHaveBeenCalledWith(audioFile, 'zh-CN', {
      projectId: 'project-1',
      signal,
      onPolling: expect.any(Function),
    })
    expect(output.subtitleResult).toMatchObject({
      language: 'zh-CN',
      totalDuration: 2.5,
      segments: [
        {
          id: '1',
          startTime: 0,
          endTime: 1.2,
          text: '你好世界。',
          speakerId: 'speaker_0',
        },
        {
          id: '2',
          startTime: 1.5,
          endTime: 2.5,
          text: '第二句。',
          speakerId: 'speaker_1',
        },
      ],
    })
    expect(output.subtitlePayload).toEqual({
      '1': { start_time: 0, end_time: 1.2, subtitle: '你好世界。', speaker_id: 'speaker_0' },
      '2': { start_time: 1.5, end_time: 2.5, subtitle: '第二句。', speaker_id: 'speaker_1' },
    })
    expect(output.initialVideoContext).toMatchObject({
      total_segments: 2,
      subtitle_segments: 2,
      visual_segments: 0,
      items: {
        '1': { start_time: 0, end_time: 1.2, subtitle: '你好世界。', visual: '', speaker_id: 'speaker_0' },
        '2': { start_time: 1.5, end_time: 2.5, subtitle: '第二句。', visual: '', speaker_id: 'speaker_1' },
      },
    })
    expect(output.initialVideoContext.merged_at).toEqual(expect.any(Number))
  })

  it('summarizeOutput 会展示语言、字幕段数量和 token 用量', async () => {
    const audioFile = new File(['audio'], 'source.mp3', { type: 'audio/mpeg' })
    const output = await step3Transcribe.run({
      audioFile,
      outputLanguage: 'zh-CN',
    }, makeContext(makeAudioOutput(audioFile))) as TranscribeOutput

    expect(step3Transcribe.summarizeOutput(output)).toEqual({
      language: 'zh-CN',
      segments: 2,
      tokens: 321,
    })
  })

  it('转录结果没有可用字幕片段时会抛错', async () => {
    const audioFile = new File(['audio'], 'empty.mp3', { type: 'audio/mpeg' })
    mocks.transcribeWithFunASR.mockResolvedValue(makeTranscription({
      phrases: [],
      words: [],
      text_content: '',
      packed_transcript: '',
      tokens_consumed: 0,
    }))

    await expect(step3Transcribe.run({
      audioFile,
      outputLanguage: 'zh-CN',
    }, makeContext(makeAudioOutput(audioFile)))).rejects.toThrow('转录结果中没有可用的字幕片段')
  })
})
