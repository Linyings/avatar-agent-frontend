import { dashscopeTempFileService } from '@/shared/services/dashscopeTempFileService'
import { aiToolsService } from '@/shared/services/aiToolsService'
import type { FrameInferenceAnalysisItem } from '@/features/projects/services/material/frameInferencePipelineService'
import { isAbortError, throwIfAborted } from '@/shared/utils/abort'
import { createWorkflowStepResultStore } from '@/shared/workflowRuns/workflowCheckpointStore'
import { getFrameWorkflowBackendProjectId, type FrameWorkflowStep, type GenerateTimelineImagesOutput } from '../types'
import { hasTimelineAnalysisResult, recoverTimelineImageFile, retryTimelineAnalysis, timelineImageIdentity } from '../services/timelineImageRecovery'
import { requireOutput } from '../utils/records'
import { updateWorkflowStepProgress } from '../utils/progress'
import { streamPreview, sumAnalysisTokens } from '../utils/workflowValue'

export const step7AnalyzeTimelineImages: FrameWorkflowStep = {
  id: 'analyze-timeline-images',
  label: '分析时间线图',
  description: '把前端生成的时间线图片临时上传，并调用后端视觉分析能力生成视觉摘要。',
  progressWeight: 11,
  dependsOn: ['generate-timeline-images'],
  effects: ['network', 'temp-upload'],
  frontendWork: [
    '读取 generate-timeline-images 输出的图片 File。',
    '逐张上传到 DashScope 临时文件服务，拿到 ossUrl。',
    '把 ossUrl、时间范围、抽帧数和 prompt 传给视觉分析接口，并监听 SSE 完成事件。',
    '聚合每个 decision 的图片信息和模型分析响应。',
  ],
  backendRoutes: [
    {
      method: 'POST',
      path: '/api/v1/tools/timeline-view/analyze',
      handler: 'Timeline View 图片分析工具',
      purpose: '根据时间线图片生成视觉摘要、问题点、原始模型响应和 token 用量。',
    },
  ],
  buildInput: ({ records, config }) => {
    const generated = requireOutput<GenerateTimelineImagesOutput>(records, 'generate-timeline-images')
    return {
      images: generated.images,
      prompt: config.analysisPrompt,
    }
  },
  run: async (input, context) => {
    throwIfAborted(context.signal, '视觉辅助图分析已取消')
    const { images, prompt } = input as { images: GenerateTimelineImagesOutput['images']; prompt?: string }
    const analyses: FrameInferenceAnalysisItem[] = []
    const totalImages = images.length
    const resultStore = createWorkflowStepResultStore()

    if (totalImages === 0) {
      updateWorkflowStepProgress(context, 'analyze-timeline-images', 100, '没有需要分析的时间线图')
      return { analyses }
    }

    for (let index = 0; index < images.length; index += 1) {
      throwIfAborted(context.signal, '视觉辅助图分析已取消')
      const item = images[index]
      try {
        const imageIdentity = await timelineImageIdentity(context.workflowRequestIdentity, context.projectId, item, prompt)
        const resultScope = imageIdentity ? {
          projectId: context.projectId,
          workflowRunId: imageIdentity.workflowRunId,
          workflowInputHash: imageIdentity.workflowInputHash,
          stepId: imageIdentity.workflowStepId,
        } : undefined
        if (resultScope) {
          const cached = await resultStore.getStepResult(resultScope).catch(() => null) as FrameInferenceAnalysisItem | null
          if (cached && hasTimelineAnalysisResult(cached.response)) {
            analyses.push(cached)
            updateWorkflowStepProgress(context, 'analyze-timeline-images', ((index + 1) / totalImages) * 100,
              `已恢复视觉分析 ${index + 1}/${totalImages}`)
            continue
          }
        }
        const updateImageProgress = (itemProgress: number, message: string) => {
          updateWorkflowStepProgress(
            context,
            'analyze-timeline-images',
            ((index + itemProgress / 100) / totalImages) * 100,
            message,
            { current: index + 1, total: totalImages }
          )
        }
        updateImageProgress(5, `正在准备视觉分析 ${index + 1}/${totalImages}`)
        const imageFile = await recoverTimelineImageFile(item, context)
        updateImageProgress(18, `正在上传时间线图 ${index + 1}/${totalImages}`)
        const uploadResult = imageIdentity
          ? await dashscopeTempFileService.uploadImageFile(
            imageFile,
            undefined,
            undefined,
            context.signal,
            imageIdentity
          )
          : await dashscopeTempFileService.uploadImageFile(imageFile, undefined, undefined, context.signal)
        updateImageProgress(36, `已上传时间线图，等待视觉模型 ${index + 1}/${totalImages}`)
        context.appendStepLog?.(
          'analyze-timeline-images',
          `已开始监听视觉辅助图分析流式输出：${item.decisionIndex} / ${images.length}`
        )
        const response = await retryTimelineAnalysis(async () => {
          const result = await aiToolsService.analyzeTimelineViewImage({
            projectId: getFrameWorkflowBackendProjectId(context),
            imageOssUrl: uploadResult.ossUrl,
            start: item.decision.start,
            end: item.decision.end,
            nFrames: item.nFrames,
            prompt,
          }, {
            signal: context.signal,
            workflowIdentity: imageIdentity,
            onEvent: (event) => {
              if (event.type === 'stage') {
                updateImageProgress(58, event.message || `视觉模型正在分析 ${index + 1}/${totalImages}`)
                context.appendStepLog?.('analyze-timeline-images', `流式阶段：${event.message || event.stage}`)
                return
              }
              if (event.type === 'completed') {
                const summary = event.response.analysis?.summary ?? event.response.content
                updateImageProgress(92, `视觉分析完成 ${index + 1}/${totalImages}`)
                context.appendStepLog?.(
                  'analyze-timeline-images',
                  `流式完成：模型 ${event.response.model || '未知'}，Token ${event.response.tokens_consumed || 0}，摘要：${streamPreview(String(summary || ''))}`
                )
                return
              }
              if (event.type === 'error') {
                context.appendStepLog?.('analyze-timeline-images', `流式错误：${event.message}`)
              }
            },
          })
          if (!hasTimelineAnalysisResult(result)) throw new Error('视觉模型未返回有效分析结果，请重试当前图片。')
          return result
        }, context, `${index + 1}/${totalImages}`)
        throwIfAborted(context.signal, '视觉辅助图分析已取消')

        const analysis: FrameInferenceAnalysisItem = {
          decisionIndex: item.decisionIndex,
          decision: item.decision,
          image: {
            name: item.image.name,
            size: item.image.size,
            objectKey: uploadResult.objectKey,
            ossUrl: uploadResult.ossUrl,
          },
          response,
        }
        analyses.push(analysis)
        if (resultScope) {
          try {
            await resultStore.saveStepResult(resultScope, { ...analysis, response: { ...response, raw_result: null } })
          } catch (error) {
            context.appendStepLog?.('analyze-timeline-images', '浏览器无法保存本张图片结果；刷新后可能需要重新分析。')
            console.warn('[TimelineAnalysis] 无法保存图片分析断点', error)
          }
        }
        updateImageProgress(100, `已完成视觉分析 ${index + 1}/${totalImages}`)
      } catch (error) {
        if (isAbortError(error) || context.signal?.aborted) throw error
        const message = error instanceof Error ? error.message : '未知错误'
        const wrapped = new Error(`时间线图 ${index + 1}/${totalImages} 分析失败：${message}。点击继续可恢复已保存的图片结果。`, { cause: error })
        const detail = error as { status?: number; code?: string; detail?: unknown }
        throw Object.assign(wrapped, { status: detail?.status, code: detail?.code, detail: detail?.detail })
      }
    }

    updateWorkflowStepProgress(context, 'analyze-timeline-images', 100, `已完成 ${analyses.length} 个视觉片段分析`)
    return { analyses }
  },
  summarizeOutput: (output) => {
    const analyses = (output as { analyses: FrameInferenceAnalysisItem[] }).analyses
    return {
      analyses: analyses.length,
      tokens: sumAnalysisTokens(analyses),
    }
  },
}
