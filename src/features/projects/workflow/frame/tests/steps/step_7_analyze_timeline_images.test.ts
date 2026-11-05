import { beforeEach, describe, expect, it, vi } from 'vitest'
import { step7AnalyzeTimelineImages } from '../../steps/step_7_analyze_timeline_images'
import type { GenerateTimelineImagesOutput } from '../../types'
import {
  makeAnalysisItem,
  makeDecision,
  makeRuntimeContext,
  makeTimelineAnalysisResponse,
  makeTimelineImagesOutput,
  successRecord,
} from './fixtures'

const mocks = vi.hoisted(() => ({
  uploadImageFile: vi.fn(),
  analyzeTimelineViewImage: vi.fn(),
}))

vi.mock('@/shared/services/dashscopeTempFileService', () => ({
  dashscopeTempFileService: {
    uploadImageFile: mocks.uploadImageFile,
  },
}))

vi.mock('@/shared/services/aiToolsService', () => ({
  aiToolsService: {
    analyzeTimelineViewImage: mocks.analyzeTimelineViewImage,
  },
}))

describe('workflow/frame/steps/step_7_analyze_timeline_images', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.uploadImageFile.mockResolvedValue({
      objectKey: 'timeline/object-key.png',
      ossUrl: 'oss://timeline/object-key.png',
    })
    mocks.analyzeTimelineViewImage.mockResolvedValue(makeTimelineAnalysisResponse())
  })

  it('buildInput 会读取时间线图片和分析 prompt', () => {
    const generated = makeTimelineImagesOutput()
    const context = makeRuntimeContext({
      config: { analysisPrompt: '重点关注人物动作' },
      records: {
        'generate-timeline-images': successRecord('generate-timeline-images', generated),
      },
    })

    expect(step7AnalyzeTimelineImages.buildInput(context)).toEqual({
      images: generated.images,
      prompt: '重点关注人物动作',
    })
  })

  it('缺少时间线图片输出时会阻止继续执行', () => {
    expect(() => step7AnalyzeTimelineImages.buildInput(makeRuntimeContext())).toThrow(
      '缺少依赖步骤 generate-timeline-images'
    )
  })

  it('没有图片时会跳过上传和模型分析', async () => {
    const context = makeRuntimeContext({ updateStepProgress: vi.fn() })

    const output = await step7AnalyzeTimelineImages.run({ images: [] }, context)

    expect(output).toEqual({ analyses: [] })
    expect(mocks.uploadImageFile).not.toHaveBeenCalled()
    expect(mocks.analyzeTimelineViewImage).not.toHaveBeenCalled()
    expect(context.updateStepProgress).toHaveBeenCalledWith('analyze-timeline-images', {
      percentage: 100,
      message: '没有需要分析的时间线图',
    })
  })

  it('run 会上传图片、调用视觉分析流式接口并聚合分析结果', async () => {
    const controller = new AbortController()
    const imageFile = new File(['timeline'], 'timeline-1.png', { type: 'image/png' })
    const decision = makeDecision({ start: 1, end: 2.5, n_frames: 6 })
    const response = makeTimelineAnalysisResponse({ tokens_consumed: 99 })
    const context = makeRuntimeContext({
      signal: controller.signal,
      updateStepProgress: vi.fn(),
      appendStepLog: vi.fn(),
    })
    mocks.analyzeTimelineViewImage.mockImplementation(async (_input, options) => {
      options.onEvent?.({ type: 'stage', stage: 'vision', message: '视觉模型分析中' })
      options.onEvent?.({ type: 'completed', response })
      return response
    })

    const output = await step7AnalyzeTimelineImages.run({
      images: [{
        decisionIndex: 1,
        decision,
        nFrames: 6,
        file: imageFile,
        image: { name: imageFile.name, size: imageFile.size, type: imageFile.type },
      }],
      prompt: '重点关注冲突动作',
    } satisfies GenerateTimelineImagesOutput & { prompt: string }, context) as { analyses: ReturnType<typeof makeAnalysisItem>[] }

    expect(mocks.uploadImageFile).toHaveBeenCalledWith(imageFile, undefined, undefined, controller.signal)
    expect(mocks.analyzeTimelineViewImage).toHaveBeenCalledWith({
      projectId: 'project-1',
      imageOssUrl: 'oss://timeline/object-key.png',
      start: 1,
      end: 2.5,
      nFrames: 6,
      prompt: '重点关注冲突动作',
    }, expect.objectContaining({
      signal: controller.signal,
      onEvent: expect.any(Function),
    }))
    expect(output.analyses).toEqual([{
      decisionIndex: 1,
      decision,
      image: {
        name: 'timeline-1.png',
        size: imageFile.size,
        objectKey: 'timeline/object-key.png',
        ossUrl: 'oss://timeline/object-key.png',
      },
      response,
    }])
    expect(context.appendStepLog).toHaveBeenCalledWith(
      'analyze-timeline-images',
      '已开始监听视觉辅助图分析流式输出：1 / 1'
    )
  })

  it('passes the stable workflow identity to both the temporary upload and vision request', async () => {
    const identity = {
      workflowRunId: '0185f76a-9e4d-7ed6-9ef7-9f34e7e1b6fd',
      workflowStepId: 'analyze-timeline-images',
      workflowInputHash: 'a'.repeat(64),
      clientInstanceId: 'web.tab-1',
    }
    const context = {
      ...makeRuntimeContext(),
      projectId: '0185f76a-9e4d-7ed6-9ef7-9f34e7e1b6fe',
      workflowRequestIdentity: identity,
    }
    const image = makeTimelineImagesOutput().images[0]

    await step7AnalyzeTimelineImages.run({ images: [image] }, context)

    const childIdentity = { ...identity, workflowStepId: expect.stringMatching(/^analyze-timeline-images\.image-[a-f0-9]{64}$/) }
    expect(mocks.uploadImageFile).toHaveBeenCalledWith(image.file, undefined, undefined, undefined, childIdentity)
    expect(mocks.analyzeTimelineViewImage).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      workflowIdentity: childIdentity,
    }))
  })

  it('已取消时不会上传图片', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(step7AnalyzeTimelineImages.run(
      makeTimelineImagesOutput(),
      makeRuntimeContext({ signal: controller.signal })
    )).rejects.toThrow('视觉辅助图分析已取消')

    expect(mocks.uploadImageFile).not.toHaveBeenCalled()
  })

  it('summarizeOutput 会汇总分析数量和 token', () => {
    expect(step7AnalyzeTimelineImages.summarizeOutput({
      analyses: [
        makeAnalysisItem({ response: makeTimelineAnalysisResponse({ tokens_consumed: 20 }) }),
        makeAnalysisItem({ response: makeTimelineAnalysisResponse({ tokens_consumed: 30 }) }),
      ],
    })).toEqual({
      analyses: 2,
      tokens: 50,
    })
  })
})
