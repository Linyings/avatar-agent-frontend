import { beforeEach, describe, expect, it, vi } from 'vitest'
import { step12ComposeFinalVideo } from '../../steps/step_12_compose_final_video'
import type { ComposeFinalVideoOutput } from '../../types'
import {
  makeFinalVideoResult,
  makeGenerateVoiceoverOutput,
  makeMergedOutput,
  makeRuntimeContext,
  successRecord,
} from './fixtures'

const mocks = vi.hoisted(() => ({
  resolveFrameVoiceSelection: vi.fn(),
  hydrateFrameVoiceoverAudioStates: vi.fn(),
  calibrateFrameScriptItems: vi.fn(),
  composeFrameFinalVideo: vi.fn(),
}))

vi.mock('@/features/projects/services/material/frameInferencePipelineService', () => ({
  resolveFrameVoiceSelection: mocks.resolveFrameVoiceSelection,
  hydrateFrameVoiceoverAudioStates: mocks.hydrateFrameVoiceoverAudioStates,
  calibrateFrameScriptItems: mocks.calibrateFrameScriptItems,
  composeFrameFinalVideo: mocks.composeFrameFinalVideo,
}))

describe('workflow/frame/steps/step_12_compose_final_video', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveFrameVoiceSelection.mockResolvedValue({
      uri: 'voice://basic',
      name: '基础音色',
      type: 'basic',
      serviceLevel: 'basic',
    })
    mocks.hydrateFrameVoiceoverAudioStates.mockImplementation(async (_items, states) => states)
    mocks.calibrateFrameScriptItems.mockImplementation(async (items) => items)
    mocks.composeFrameFinalVideo.mockResolvedValue({
      file: new File(['final'], 'final.mp4', { type: 'video/mp4' }),
      finalVideo: makeFinalVideoResult(),
    })
  })

  const makeContext = () => {
    const merged = makeMergedOutput()
    const generated = makeGenerateVoiceoverOutput()
    const context = makeRuntimeContext({
      config: {
        voice: 'voice://basic',
        backgroundMusic: 'none',
        backgroundMusicUrl: null,
      },
      records: {
        'merge-videos': successRecord('merge-videos', merged),
        'generate-voiceover': successRecord('generate-voiceover', generated),
      },
      updateStepProgress: vi.fn(),
    })

    return { context, merged, generated }
  }

  it('buildInput 会读取合并视频、配音脚本和背景音乐配置', () => {
    const { context, merged, generated } = makeContext()

    expect(step12ComposeFinalVideo.buildInput(context)).toEqual({
      mergedVideo: merged.video,
      scriptItems: generated.voiceoverResult.items,
      voiceUri: 'voice://basic',
      backgroundMusic: 'none',
      backgroundMusicUrl: null,
    })
  })
  it('composes the approved timeline without recalibration', async () => {
    const { context, generated } = makeContext()
    generated.timelineReviewApproved = true
    generated.voiceoverResult.items[0] = { ...generated.voiceoverResult.items[0], start: 12, end: 29 }
    await step12ComposeFinalVideo.run(step12ComposeFinalVideo.buildInput(context), context)
    expect(mocks.calibrateFrameScriptItems).not.toHaveBeenCalled()
    expect(mocks.composeFrameFinalVideo).toHaveBeenCalledWith(expect.objectContaining({
      scriptItems: expect.arrayContaining([expect.objectContaining({ start: 12, end: 29 })]),
    }))
  })

  it('缺少上游输出时会阻止继续执行', () => {
    expect(() => step12ComposeFinalVideo.buildInput(makeRuntimeContext())).toThrow('缺少依赖步骤 merge-videos')
  })

  it('run 会校准配音时间线并调用最终视频合成', async () => {
    const { context, merged, generated } = makeContext()
    const finalFile = new File(['final'], 'final.mp4', { type: 'video/mp4' })
    const finalVideo = makeFinalVideoResult({ name: 'final.mp4' })
    mocks.composeFrameFinalVideo.mockImplementation(async (input) => {
      input.onProgress?.({ step: 'compose', percentage: 98, message: '正在合成最终视频' })
      input.onProgress?.({ step: 'upload', percentage: 99, message: '正在保存最终视频到本地 OPFS 50%' })
      return { file: finalFile, finalVideo }
    })

    const output = await step12ComposeFinalVideo.run(
      step12ComposeFinalVideo.buildInput(context),
      context
    ) as ComposeFinalVideoOutput

    expect(mocks.resolveFrameVoiceSelection).toHaveBeenCalledWith('voice://basic')
    expect(mocks.hydrateFrameVoiceoverAudioStates).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ _id: 1 })]),
      generated.voiceoverResult.audioStates
    )
    expect(mocks.composeFrameFinalVideo).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      sourceVideoFile: merged.file,
      sourceVideoDuration: merged.video.duration,
      scriptItems: expect.arrayContaining([expect.objectContaining({ _id: 1 })]),
      ttsAudioStates: generated.voiceoverResult.audioStates,
      config: context.config,
      signal: context.signal,
      onProgress: expect.any(Function),
    }))
    expect(output.file).toBe(finalFile)
    expect(output.finalVideo).toBe(finalVideo)
    expect(output.pipelineResult.finalVideoResult).toBe(finalVideo)
    expect(output.pipelineResult.voiceoverResult?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ _id: 1, text: '解说第一句' }),
    ]))
    expect(context.updateStepProgress).toHaveBeenLastCalledWith('compose-final-video', {
      percentage: 100,
      message: '最终视频合成已完成',
    })
  })

  it('当前音色和已生成配音音色不一致时会要求重新配音', async () => {
    const { context } = makeContext()
    mocks.resolveFrameVoiceSelection.mockResolvedValue({
      uri: 'voice://other',
      name: '另一个音色',
      type: 'basic',
      serviceLevel: 'basic',
    })

    await expect(step12ComposeFinalVideo.run(step12ComposeFinalVideo.buildInput(context), context)).rejects.toThrow(
      '当前选择的配音音色（另一个音色）和已生成配音（基础音色）不一致'
    )
    expect(mocks.composeFrameFinalVideo).not.toHaveBeenCalled()
  })

  it('summarizeOutput 会展示最终视频 artifact 和背景音乐', () => {
    expect(step12ComposeFinalVideo.summarizeOutput({
      file: new File(['final'], 'final.mp4', { type: 'video/mp4' }),
      finalVideo: makeFinalVideoResult({
        backgroundMusic: { label: '钢琴', url: 'https://example.com/piano.mp3' },
      }),
      pipelineResult: makeGenerateVoiceoverOutput().pipelineResult,
    })).toEqual({
      final_video: 'projects/project-1/final_video/final.mp4',
      size: 10,
      duration: 3,
      background_music: '钢琴',
    })
  })
})
