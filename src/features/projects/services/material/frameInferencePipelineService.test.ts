import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildFrameScriptGenerationConfig,
  buildFrameSubtitleExtractionResult,
  FRAME_INFERENCE_DEFAULT_N_FRAMES,
  generateFrameNarrationVoiceover,
  hydrateFrameVoiceoverAudioStates,
  isRetriableFrameAudioCompositionError,
  mergeFrameAnalysesIntoVideoContext,
  resolveFrameInferenceMaxDecisions,
  resolveFrameOutputDurationRecommendation,
  resolveFrameOutputPlan,
  type ElevenLabsScribeResponse,
  type FrameInferenceAnalysisItem,
} from './frameInferencePipelineService'

const mocks = vi.hoisted(() => ({
  getAudioBlob: vi.fn(),
  saveNarrationAudio: vi.fn(),
  loadTTSService: vi.fn(),
  generateTTSWithVoiceUri: vi.fn(),
  getAudioDuration: vi.fn(),
}))

vi.mock('@/shared/services/localAudioStorageService', () => ({
  localAudioStorageService: {
    getAudioBlob: mocks.getAudioBlob,
    saveNarrationAudio: mocks.saveNarrationAudio,
  },
}))

vi.mock('@/shared/services/ttsServiceLoader', () => ({
  loadTTSService: mocks.loadTTSService,
}))

vi.mock('@/shared/utils/audioUtils', () => ({
  getAudioDuration: mocks.getAudioDuration,
}))

describe('frameInferencePipelineService', () => {
  beforeEach(() => {
    mocks.loadTTSService.mockResolvedValue({
      generateTTSWithVoiceUri: mocks.generateTTSWithVoiceUri,
    })
    mocks.saveNarrationAudio.mockResolvedValue('project:project-1:narration:1')
    mocks.getAudioDuration.mockResolvedValue(1)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('按每分钟一个视觉片段并固定每段 15 帧', () => {
    expect(FRAME_INFERENCE_DEFAULT_N_FRAMES).toBe(15)
    expect(resolveFrameInferenceMaxDecisions()).toBe(4)
    expect(resolveFrameInferenceMaxDecisions(60_000)).toBe(1)
    expect(resolveFrameInferenceMaxDecisions(90_000)).toBe(2)
    expect(resolveFrameInferenceMaxDecisions(10 * 60_000)).toBe(10)
    expect([
      resolveFrameOutputDurationRecommendation(4 * 60_000),
      resolveFrameOutputDurationRecommendation(5 * 60_000),
      resolveFrameOutputDurationRecommendation(15 * 60_000),
      resolveFrameOutputDurationRecommendation(20 * 60_000),
      resolveFrameOutputDurationRecommendation(30 * 60_000),
      resolveFrameOutputDurationRecommendation(40 * 60_000),
      resolveFrameOutputDurationRecommendation(60 * 60_000),
      resolveFrameOutputDurationRecommendation(90 * 60_000),
      resolveFrameOutputDurationRecommendation(120 * 60_000),
    ]).toEqual([
      { minMs: 1 * 60_000, maxMs: 2 * 60_000 },
      { minMs: 2 * 60_000, maxMs: 4 * 60_000 },
      { minMs: 2 * 60_000, maxMs: 5 * 60_000 },
      { minMs: 2 * 60_000, maxMs: 5 * 60_000 },
      { minMs: 2 * 60_000, maxMs: 8 * 60_000 },
      { minMs: 2 * 60_000, maxMs: 8 * 60_000 },
      { minMs: 2 * 60_000, maxMs: 12 * 60_000 },
      { minMs: 2 * 60_000, maxMs: 12 * 60_000 },
      { minMs: 2 * 60_000, maxMs: 15 * 60_000 },
    ])
    expect(resolveFrameOutputPlan(5 * 60_000, 47 * 60_000)).toMatchObject({
      targetDurationMs: 5 * 60_000,
      visualSegmentCount: 5,
      analysisWindowSeconds: 300,
    })
  })

  it('优先使用 scribe phrases 构建字幕结果', () => {
    const response: ElevenLabsScribeResponse = {
      success: true,
      provider: 'elevenlabs',
      model: 'scribe_v2',
      raw_result: {},
      packed_transcript: 'hello world',
      phrases: [
        { text: '第一句', start: 0, end: 1.2, confidence: 0.9, speaker_id: 'speaker_0' },
        { text: '第二句', start: 1.5, end: 2.8, confidence: 0.8, speaker_id: 'speaker_1' },
      ],
      words: [],
      audio_events: [],
      text_content: '第一句 第二句',
      language_code: 'zh',
      duration: 2.8,
      tokens_consumed: 12,
      updated_at: '2026-05-03T00:00:00.000Z',
    }

    const result = buildFrameSubtitleExtractionResult(response)

    expect(result.segments).toHaveLength(2)
    expect(result.segments[0]).toMatchObject({
      id: '1',
      startTime: 0,
      endTime: 1.2,
      text: '第一句',
      speakerId: 'speaker_0',
    })
    expect(result.segments[1].speakerId).toBe('speaker_1')
    expect(result.totalDuration).toBe(2.8)
  })

  it('从 scribe words 构建字幕时按说话人变化切段并保留标签', () => {
    const response: ElevenLabsScribeResponse = {
      success: true,
      provider: 'elevenlabs',
      model: 'scribe_v2',
      raw_result: {},
      packed_transcript: '你好 我 来了',
      phrases: [],
      words: [
        { text: '你好', start: 0, end: 0.4, speaker_id: 'speaker_0' },
        { text: '我', start: 0.5, end: 0.7, speaker_id: 'speaker_1' },
        { text: '来了', start: 0.8, end: 1.1, speaker_id: 'speaker_1' },
      ],
      audio_events: [],
      text_content: '你好 我 来了',
      language_code: 'zh',
      duration: 1.1,
      tokens_consumed: 5,
      updated_at: '2026-05-03T00:00:00.000Z',
    }

    const result = buildFrameSubtitleExtractionResult(response)

    expect(result.segments).toHaveLength(2)
    expect(result.segments[0]).toMatchObject({
      text: '你好',
      speakerId: 'speaker_0',
    })
    expect(result.segments[1]).toMatchObject({
      text: '我 来了',
      speakerId: 'speaker_1',
    })
  })

  it('将视觉分析摘要合并回 video_context', () => {
    const base = {
      items: {
        '1': { start_time: 0, end_time: 2, subtitle: '片段一', visual: '' },
        '2': { start_time: 2, end_time: 4, subtitle: '片段二', visual: '' },
      },
      total_segments: 2,
      subtitle_segments: 2,
      visual_segments: 0,
      merged_at: 1,
    }

    const analyses: FrameInferenceAnalysisItem[] = [
      {
        decisionIndex: 1,
        decision: {
          start: 1,
          end: 3,
          priority: 'high',
          trigger_type: 'gap',
          reason: '需要视觉辅助',
        },
        image: {
          name: 'timeline.png',
          size: 123,
          objectKey: 'tmp/timeline.png',
          ossUrl: 'oss://tmp/timeline.png',
        },
        response: {
          success: true,
          provider: 'dashscope',
          model: 'qwen',
          timeline_image_url: 'oss://tmp/timeline.png',
          timeline_image_size: 0,
          range: { start: 1, end: 3, duration: 2 },
          n_frames: 10,
          content: '分析完成',
          analysis: { summary: '这里出现了关键视觉转场' },
          raw_result: {},
          usage: {},
          request_id: 'req_1',
          tokens_consumed: 9,
          updated_at: '2026-05-03T00:00:00.000Z',
        },
      },
    ]

    const merged = mergeFrameAnalysesIntoVideoContext(base, analyses)

    expect(merged.visual_segments).toBe(2)
    expect(merged.items['1'].visual).toContain('关键视觉转场')
    expect(merged.items['2'].visual).toContain('关键视觉转场')
  })

  it('逐帧脚本生成配置复用解说风格模板参数', () => {
    expect(buildFrameScriptGenerationConfig({
      outputLanguage: 'zh-CN',
      defaultNFrames: 10,
      maxDecisions: 8,
      narrationStyleId: '电影电视剧',
      wordCount: '1200',
    })).toMatchObject({
      model_level: 'frame',
      target_language: 'zh-CN',
      style_mode: '电影电视剧',
      word_count: '1200',
      clip_mode: 'smart_mix',
      person_view: 'third_person',
    })
  })

  it('合成前会从 local_audio_key 恢复刷新后丢失的配音 Blob', async () => {
    const audioBlob = new Blob(['voice'], { type: 'audio/mpeg' })
    mocks.getAudioBlob.mockResolvedValue(audioBlob)
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:restored-voice'),
    })

    const states = await hydrateFrameVoiceoverAudioStates([
      {
        _id: 1,
        text: '这里需要解说',
        start: 0,
        end: 2,
        org: '',
        OST: 0,
        local_audio_key: 'project:project-1:narration:1',
        duration: 2,
      },
    ], {
      1: {
        success: true,
        audioUrl: '[object-url-stripped]',
        duration: 2,
      },
    })

    expect(mocks.getAudioBlob).toHaveBeenCalledWith('project:project-1:narration:1')
    expect(states[1]).toMatchObject({
      success: true,
      audioBlob,
      audioUrl: 'blob:restored-voice',
      duration: 2,
    })
  })

  it('识别可重试的 AudioData 空帧合成错误', () => {
    expect(isRetriableFrameAudioCompositionError(
      new Error("Failed to construct 'AudioData': numberOfFrames must be greater than 0.")
    )).toBe(true)
    expect(isRetriableFrameAudioCompositionError(new Error('视频轨道解码失败'))).toBe(false)
  })

  it('生成配音时遇到空音频会按片段重试后保存有效结果', async () => {
    const emptyAudio = new Blob([], { type: 'audio/mpeg' })
    const validAudio = new Blob(['voice'], { type: 'audio/mpeg' })
    const progress = vi.fn()
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:voice-1'),
      revokeObjectURL: vi.fn(),
    })
    mocks.generateTTSWithVoiceUri
      .mockResolvedValueOnce({ success: true, audioBlob: emptyAudio })
      .mockResolvedValueOnce({ success: true, audioBlob: validAudio, duration: 1.2 })

    const result = await generateFrameNarrationVoiceover({
      projectId: 'project-1',
      scriptItems: [
        { _id: 1, text: '这里需要解说', start: 0, end: 2, org: '', OST: 0 },
      ],
      voiceUri: 'voice://basic',
      onProgress: progress,
    })

    expect(mocks.generateTTSWithVoiceUri).toHaveBeenCalledTimes(2)
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({
      message: '正在重试片段 1 配音 2/3',
    }))
    expect(mocks.saveNarrationAudio).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      itemId: 1,
      blob: validAudio,
      duration: 1.2,
    }))
    expect(result.audioStates[1]).toMatchObject({
      success: true,
      audioBlob: validAudio,
      audioUrl: 'blob:voice-1',
      duration: 1.2,
    })
  })

  it('为每个解说片段使用独立且稳定的工作流子步骤身份', async () => {
    const firstAudio = new Blob(['voice-one'], { type: 'audio/mpeg' })
    const secondAudio = new Blob(['voice-two'], { type: 'audio/mpeg' })
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:voice'),
      revokeObjectURL: vi.fn(),
    })
    mocks.generateTTSWithVoiceUri
      .mockResolvedValueOnce({ success: true, audioBlob: firstAudio, duration: 1 })
      .mockResolvedValueOnce({ success: true, audioBlob: secondAudio, duration: 1 })

    await generateFrameNarrationVoiceover({
      projectId: 'project-1',
      scriptItems: [
        { _id: 1, text: '第一段解说', start: 0, end: 2, org: '', OST: 0 },
        { _id: 2, text: '第二段解说', start: 2, end: 4, org: '', OST: 0 },
      ],
      voiceUri: 'voice://basic',
      workflowIdentity: {
        workflowRunId: '11111111-1111-4111-8111-111111111111',
        workflowStepId: 'generate-voiceover',
        workflowInputHash: 'a'.repeat(64),
        clientInstanceId: 'web.test-client',
      },
    })

    const firstIdentity = mocks.generateTTSWithVoiceUri.mock.calls[0][2]?.workflowIdentity
    const secondIdentity = mocks.generateTTSWithVoiceUri.mock.calls[1][2]?.workflowIdentity
    expect(firstIdentity).toMatchObject({ workflowStepId: 'generate-voiceover' })
    expect(secondIdentity).toMatchObject({ workflowStepId: 'generate-voiceover:2' })
  })

  it('生成配音时会重试无法解析时长的音频', async () => {
    const firstAudio = new Blob(['bad-duration'], { type: 'audio/mpeg' })
    const secondAudio = new Blob(['good-duration'], { type: 'audio/mpeg' })
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:voice-1'),
      revokeObjectURL: vi.fn(),
    })
    mocks.generateTTSWithVoiceUri
      .mockResolvedValueOnce({ success: true, audioBlob: firstAudio })
      .mockResolvedValueOnce({ success: true, audioBlob: secondAudio })
    mocks.getAudioDuration
      .mockRejectedValueOnce(new Error('decode failed'))
      .mockResolvedValueOnce(2.4)

    const result = await generateFrameNarrationVoiceover({
      projectId: 'project-1',
      scriptItems: [
        { _id: 1, text: '这里需要解说', start: 0, end: 2, org: '', OST: 0 },
      ],
      voiceUri: 'voice://basic',
    })

    expect(mocks.generateTTSWithVoiceUri).toHaveBeenCalledTimes(2)
    expect(mocks.saveNarrationAudio).toHaveBeenCalledWith(expect.objectContaining({
      blob: secondAudio,
      duration: 2.4,
    }))
    expect(result.audioStates[1]?.duration).toBe(2.4)
  })
})
