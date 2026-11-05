import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { step7AnalyzeTimelineImages } from '../../steps/step_7_analyze_timeline_images'
import { makeRuntimeContext, makeTimelineImagesOutput, makeTimelineAnalysisResponse, makeMergedOutput, makeValidateSubtitlesOutput, successRecord } from './fixtures'

const mocks = vi.hoisted(() => ({ upload: vi.fn(), analyze: vi.fn(), generate: vi.fn() }))
vi.mock('@/shared/services/dashscopeTempFileService', () => ({ dashscopeTempFileService: { uploadImageFile: mocks.upload } }))
vi.mock('@/shared/services/aiToolsService', () => ({ aiToolsService: { analyzeTimelineViewImage: mocks.analyze } }))
vi.mock('@/features/projects/services/timelineViewImageService', () => ({
  generateTimelineViewImage: mocks.generate,
  isTimelineViewImageDecodeError: () => false,
}))

const identity = {
  workflowRunId: '0185f76a-9e4d-7ed6-9ef7-9f34e7e1b6fe',
  workflowStepId: 'analyze-timeline-images.batch-v2',
  workflowInputHash: 'a'.repeat(64),
  clientInstanceId: 'web.test',
}
const makeContext = () => ({ ...makeRuntimeContext(), projectId: '0185f76a-9e4d-7ed6-9ef7-9f34e7e1b6fd', workflowRequestIdentity: identity })
const images = () => [1, 2, 3].map(index => {
  const item = makeTimelineImagesOutput().images[0]
  return { ...item, decisionIndex: index, decision: { ...item.decision, start: index * 10, end: index * 10 + 5 } }
})

describe('timeline image recovery', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetAllMocks()
    mocks.upload.mockResolvedValue({ objectKey: 'image.png', ossUrl: 'oss://image.png' })
    mocks.analyze.mockResolvedValue(makeTimelineAnalysisResponse())
    mocks.generate.mockResolvedValue({ file: new File(['regenerated'], 'timeline.png', { type: 'image/png' }) })
  })
  afterEach(() => vi.useRealTimers())

  it('uses distinct stable child executions without completing the batch through an image request', async () => {
    await step7AnalyzeTimelineImages.run({ images: images() }, makeContext())
    const identities = mocks.analyze.mock.calls.map(([, options]) => options.workflowIdentity)
    expect(new Set(identities.map(item => item.workflowStepId)).size).toBe(3)
    for (const child of identities) {
      expect(child.workflowStepId).toMatch(/^analyze-timeline-images\.batch-v2\.image-/)
      expect(child.workflowStepId.length).toBeLessThanOrEqual(128)
      expect(child.workflowInputHash).toBe(identity.workflowInputHash)
    }
  })

  it('saves each completed image and resumes only unfinished images after an interruption', async () => {
    const input = { images: images() }
    mocks.analyze.mockResolvedValueOnce(makeTimelineAnalysisResponse()).mockRejectedValueOnce(Object.assign(new Error('permission denied'), { status: 403 }))
    await expect(step7AnalyzeTimelineImages.run(input, makeContext())).rejects.toThrow('2/3')
    expect(mocks.analyze).toHaveBeenCalledTimes(2)
    mocks.analyze.mockClear()
    mocks.upload.mockClear()
    const result = await step7AnalyzeTimelineImages.run(input, makeContext()) as { analyses: unknown[] }
    expect(result.analyses).toHaveLength(3)
    expect(mocks.analyze).toHaveBeenCalledTimes(2)
    expect(mocks.upload).toHaveBeenCalledTimes(2)
    expect(mocks.analyze.mock.calls[0][0].start).toBe(20)
  })

  it('retries a missing stream result using the same image identity and upload', async () => {
    vi.useFakeTimers()
    mocks.analyze.mockRejectedValueOnce(new Error('流式视觉辅助图分析已结束，但未收到最终结果'))
    const result = step7AnalyzeTimelineImages.run({ images: images().slice(0, 1) }, makeContext())
    const assertion = expect(result).resolves.toMatchObject({ analyses: [expect.any(Object)] })
    await vi.waitFor(() => expect(mocks.analyze).toHaveBeenCalledTimes(1))
    await vi.runAllTimersAsync()
    await assertion
    expect(mocks.analyze).toHaveBeenCalledTimes(2)
    expect(mocks.upload).toHaveBeenCalledTimes(1)
    expect(mocks.analyze.mock.calls[0][1].workflowIdentity).toEqual(mocks.analyze.mock.calls[1][1].workflowIdentity)
  })

  it('regenerates a missing image from the original video instead of repeatedly failing', async () => {
    const input = { images: images().slice(0, 1) }
    input.images[0].file = {} as File
    const context = makeContext()
    context.records = {
      'merge-videos': successRecord('merge-videos', makeMergedOutput()),
      'validate-subtitles': successRecord('validate-subtitles', makeValidateSubtitlesOutput()),
      'decide-timeline-view': successRecord('decide-timeline-view', { decisions: [input.images[0].decision] }),
    }
    await expect(step7AnalyzeTimelineImages.run(input, context)).resolves.toMatchObject({ analyses: [expect.any(Object)] })
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    expect(mocks.generate.mock.calls[0][0]).toMatchObject({ start: 10, end: 15 })
  })

  it('does not reuse results when the analysis prompt changes', async () => {
    const input = { images: images().slice(0, 1), prompt: 'first' }
    await step7AnalyzeTimelineImages.run(input, makeContext())
    await step7AnalyzeTimelineImages.run({ ...input, prompt: 'second' }, makeContext())
    expect(mocks.analyze).toHaveBeenCalledTimes(2)
    expect(mocks.analyze.mock.calls[0][1].workflowIdentity.workflowStepId).not.toBe(mocks.analyze.mock.calls[1][1].workflowIdentity.workflowStepId)
  })

  it('stops after two retries and preserves the original error with the image number', async () => {
    vi.useFakeTimers()
    mocks.analyze.mockRejectedValue(new Error('Failed to fetch'))
    const result = step7AnalyzeTimelineImages.run({ images: images() }, makeContext())
    const assertion = expect(result).rejects.toThrow('时间线图 1/3 分析失败：Failed to fetch')
    await vi.waitFor(() => expect(mocks.analyze).toHaveBeenCalledTimes(1))
    await vi.runAllTimersAsync()
    await assertion
    expect(mocks.analyze).toHaveBeenCalledTimes(3)
    expect(mocks.upload).toHaveBeenCalledTimes(1)
  })

  it('cancels a retry delay immediately and does not call the model again', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    mocks.analyze.mockRejectedValue(new Error('Failed to fetch'))
    const result = step7AnalyzeTimelineImages.run({ images: images() }, { ...makeContext(), signal: controller.signal })
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(mocks.analyze).toHaveBeenCalledTimes(1))
    controller.abort()
    await assertion
    await vi.runAllTimersAsync()
    expect(mocks.analyze).toHaveBeenCalledTimes(1)
  })

  it('does not retry or cache an empty model result as success', async () => {
    mocks.analyze.mockResolvedValue(makeTimelineAnalysisResponse({ content: '', analysis: null }))
    await expect(step7AnalyzeTimelineImages.run({ images: images() }, makeContext())).rejects.toThrow('未返回有效分析结果')
    expect(mocks.analyze).toHaveBeenCalledTimes(1)
  })
})
