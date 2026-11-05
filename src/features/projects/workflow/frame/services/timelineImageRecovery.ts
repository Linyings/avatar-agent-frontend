import { createAbortError, isAbortError, throwIfAborted } from '@/shared/utils/abort'
import type { WorkflowRequestIdentity } from '@/shared/workflowRuns/identity'
import type { TimelineViewAnalysisResponse } from '@/shared/services/aiToolsService'
import { createFrameWorkflowInputHash } from '../runner/workflowRunLifecycle'
import { step6GenerateTimelineImages } from '../steps/step_6_generate_timeline_images'
import type { FrameWorkflowRuntimeContext, GenerateTimelineImagesOutput } from '../types'
import { resolveTimelineImageFile, TimelineImageUnavailableError } from '../utils/media'

export const timelineImageIdentity = async (
  identity: WorkflowRequestIdentity | undefined,
  projectId: string,
  item: GenerateTimelineImagesOutput['images'][number],
  prompt?: string,
): Promise<WorkflowRequestIdentity | undefined> => {
  if (!identity) return undefined
  const fingerprint = await createFrameWorkflowInputHash({
    projectId, files: [],
    config: { decisionIndex: item.decisionIndex, decision: item.decision, nFrames: item.nFrames, prompt: prompt?.trim() || '' },
  })
  return { ...identity, workflowStepId: `${identity.workflowStepId}.image-${fingerprint}` }
}

export const hasTimelineAnalysisResult = (response?: Partial<TimelineViewAnalysisResponse>): boolean => (
  response?.success === true && Boolean(
    response.content?.trim() || (response.analysis && Object.keys(response.analysis).length > 0)
  )
)

const retryable = (error: unknown) => {
  if (isAbortError(error)) return false
  const value = error as { status?: number; retryable?: boolean; detail?: { retryable?: boolean; code?: string }; message?: string }
  if ([400, 401, 402, 403, 404, 422].includes(value?.status ?? 0)) return false
  if (value?.status === 409) return value.detail?.code === 'step_execution_in_progress' && value.detail.retryable === true
  if (value?.retryable === false || value?.detail?.retryable === false) return false
  return value?.retryable === true || value?.detail?.retryable === true
    || value?.status === 429 || (value?.status ?? 0) >= 500
    || /failed to fetch|networkerror|network request failed|load failed|network error|未收到最终结果/i.test(value?.message ?? '')
}

const waitForRetry = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  throwIfAborted(signal)
  const onAbort = () => {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
    reject(createAbortError('视觉辅助图分析已取消'))
  }
  const timer = setTimeout(() => {
    signal?.removeEventListener('abort', onAbort)
    resolve()
  }, ms)
  signal?.addEventListener('abort', onAbort, { once: true })
})

export const retryTimelineAnalysis = async <T>(
  operation: () => Promise<T>, context: FrameWorkflowRuntimeContext, imageLabel: string,
): Promise<T> => {
  const delays = [3000, 8000]
  for (let attempt = 0; ; attempt += 1) {
    throwIfAborted(context.signal, '视觉辅助图分析已取消')
    try {
      return await operation()
    } catch (error) {
      if (attempt >= delays.length || !retryable(error)) throw error
      context.appendStepLog?.('analyze-timeline-images', `图片 ${imageLabel} 分析暂时失败，${delays[attempt] / 1000} 秒后重试（${attempt + 1}/${delays.length}）。`)
      await waitForRetry(delays[attempt], context.signal)
    }
  }
}

export const recoverTimelineImageFile = async (
  item: GenerateTimelineImagesOutput['images'][number], context: FrameWorkflowRuntimeContext,
): Promise<File> => {
  try {
    return await resolveTimelineImageFile(item)
  } catch (error) {
    if (!(error instanceof TimelineImageUnavailableError)) throw error
    throwIfAborted(context.signal, '视觉辅助图分析已取消')
    context.appendStepLog?.('analyze-timeline-images', `图片 ${item.decisionIndex} 缓存不可用，正在从原视频重新生成。`)
    let input: Record<string, unknown>
    try {
      input = step6GenerateTimelineImages.buildInput(context) as Record<string, unknown>
    } catch {
      throw new Error('时间线图片和原视频恢复信息不完整，请重新选择原视频并执行“生成时间线图”。')
    }
    const generated = await step6GenerateTimelineImages.run({
      ...input, decisions: [item.decision], defaultNFrames: item.nFrames,
      imageIndexOffset: item.decisionIndex - 1,
    }, { ...context, updateStepProgress: undefined }) as GenerateTimelineImagesOutput
    const recovered = generated.images[0]
    if (!recovered) throw new Error('时间线图片重新生成失败，请重新选择原视频后继续。')
    item.file = recovered.file
    item.previewStorageKey = recovered.previewStorageKey
    return recovered.file
  }
}
