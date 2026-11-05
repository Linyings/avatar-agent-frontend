import { beforeEach, describe, expect, it, vi } from 'vitest'
import { step6GenerateTimelineImages } from '../../steps/step_6_generate_timeline_images'
import type { GenerateTimelineImagesOutput } from '../../types'
import {
  makeDecision,
  makeDecisionOutput,
  makeMergedOutput,
  makeRecords,
  makeRuntimeContext,
  makeValidateSubtitlesOutput,
  successRecord,
} from './fixtures'

const mocks = vi.hoisted(() => ({
  generateTimelineViewImage: vi.fn(),
}))

vi.mock('@/features/projects/services/timelineViewImageService', () => ({
  generateTimelineViewImage: mocks.generateTimelineViewImage,
  isTimelineViewImageDecodeError: (error: unknown) => (
    error instanceof Error && /decod/i.test(error.message)
  ),
  TIMELINE_IMAGE_BROWSER_DECODE_ERROR: '当前浏览器无法解码该视频。请切换到最新版 Google Chrome 或 Microsoft Edge 后重试。',
}))

describe('workflow/frame/steps/step_6_generate_timeline_images', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.generateTimelineViewImage.mockResolvedValue({
      file: new File(['timeline'], 'timeline-1.png', { type: 'image/png' }),
    })
  })

  it('buildInput 会整理合并视频、转录词级时间轴和时间线决策', () => {
    const merged = makeMergedOutput()
    const transcribed = makeValidateSubtitlesOutput()
    const decision = makeDecisionOutput([makeDecision({ n_frames: 9 })])
    const context = makeRuntimeContext({
      records: makeRecords({
        'merge-videos': successRecord('merge-videos', merged),
        'validate-subtitles': successRecord('validate-subtitles', transcribed),
        'decide-timeline-view': successRecord('decide-timeline-view', decision),
      }),
    })

    const input = step6GenerateTimelineImages.buildInput(context) as {
      merged: unknown
      transcript: { words: Array<{ text: string; start: number; end: number }> }
      decisions: unknown[]
      defaultNFrames: number
    }

    expect(input.merged).toBe(merged)
    expect(input.transcript.words).toEqual([
      { text: '开场。', start: 0, end: 1.2, type: 'word' },
      { text: '冲突出现。', start: 1.5, end: 3, type: 'word' },
    ])
    expect(input.decisions).toEqual(decision.decisions)
    expect(input.defaultNFrames).toBe(15)
  })

  it('缺少上游输出时会阻止继续执行', () => {
    expect(() => step6GenerateTimelineImages.buildInput(makeRuntimeContext())).toThrow('缺少依赖步骤 merge-videos')
  })

  it('没有时间线决策时不会触发浏览器抽帧', async () => {
    const context = makeRuntimeContext({ updateStepProgress: vi.fn() })

    const output = await step6GenerateTimelineImages.run({
      merged: makeMergedOutput(),
      transcript: { words: [] },
      decisions: [],
      defaultNFrames: 15,
    }, context) as GenerateTimelineImagesOutput

    expect(output).toEqual({ images: [] })
    expect(mocks.generateTimelineViewImage).not.toHaveBeenCalled()
    expect(context.updateStepProgress).toHaveBeenCalledWith('generate-timeline-images', {
      percentage: 100,
      message: '没有需要生成的时间线图',
    })
  })

  it('run 会按每个 decision 生成时间线图并映射局部进度', async () => {
    const controller = new AbortController()
    const sourceVideo = new File(['video'], 'source.mp4', { type: 'video/mp4' })
    const generatedFile = new File(['timeline'], 'timeline-1.png', { type: 'image/png' })
    const decision = makeDecision({ start: 2, end: 4, n_frames: 7 })
    const context = makeRuntimeContext({
      signal: controller.signal,
      updateStepProgress: vi.fn(),
    })
    mocks.generateTimelineViewImage.mockImplementation(async (_input, options) => {
      expect(options).toBeUndefined()
      return { file: generatedFile }
    })

    const output = await step6GenerateTimelineImages.run({
      mergedVideoFile: sourceVideo,
      transcript: { words: [{ text: '冲突', start: 2, end: 4 }] },
      decisions: [decision],
      defaultNFrames: 15,
    }, context) as GenerateTimelineImagesOutput

    expect(mocks.generateTimelineViewImage).toHaveBeenCalledWith(expect.objectContaining({
      video: sourceVideo,
      start: 2,
      end: 4,
      nFrames: 7,
      transcript: { words: [{ text: '冲突', start: 2, end: 4 }] },
      signal: controller.signal,
      onProgress: expect.any(Function),
    }))
    expect(output.images).toEqual([
      {
        decisionIndex: 1,
        decision,
        nFrames: 7,
        file: generatedFile,
        image: {
          name: 'timeline-1.png',
          size: generatedFile.size,
          type: 'image/png',
        },
      },
    ])
    expect(context.updateStepProgress).toHaveBeenLastCalledWith('generate-timeline-images', {
      percentage: 100,
      message: '已生成 1 张时间线图',
    })
  })

  it('浏览器解码失败时提示用户切换 Chrome 或 Edge', async () => {
    const sourceVideo = new File(['video'], 'source.mp4', { type: 'video/mp4' })
    const context = makeRuntimeContext({ updateStepProgress: vi.fn() })
    mocks.generateTimelineViewImage.mockRejectedValue(new Error('Decoding error'))

    await expect(step6GenerateTimelineImages.run({
      mergedVideoFile: sourceVideo,
      transcript: { words: [] },
      decisions: [makeDecision()],
      defaultNFrames: 15,
    }, context)).rejects.toThrow('当前浏览器无法解码该视频。请切换到最新版 Google Chrome 或 Microsoft Edge 后重试。')
  })

  it('summarizeOutput 只暴露可序列化的图片摘要', () => {
    const imageFile = new File(['timeline'], 'timeline-1.png', { type: 'image/png' })

    expect(step6GenerateTimelineImages.summarizeOutput({
      images: [{
        decisionIndex: 1,
        decision: makeDecision(),
        nFrames: 15,
        file: imageFile,
        image: { name: imageFile.name, size: imageFile.size, type: imageFile.type },
      }],
    })).toEqual({
      images: [{ name: 'timeline-1.png', size: imageFile.size, type: 'image/png' }],
    })
  })
})
