import {
  generateTimelineViewImage,
  isTimelineViewImageDecodeError,
  TIMELINE_IMAGE_BROWSER_DECODE_ERROR,
} from '@/features/projects/services/timelineViewImageService'
import { FRAME_INFERENCE_DEFAULT_N_FRAMES, type FrameInferencePipelineResult } from '@/features/projects/services/material/frameInferencePipelineService'
import type { TimelineViewDecision } from '@/shared/services/aiToolsService'
import { throwIfAborted } from '@/shared/utils/abort'
import type { FrameWorkflowStep, GenerateTimelineImagesOutput, MergeVideosOutput, ValidateSubtitlesOutput } from '../types'
import { resolveMergedVideoFile } from '../utils/media'
import { requireOutput } from '../utils/records'
import { updateWorkflowStepProgress } from '../utils/progress'
import { persistTimelineImageAsset } from '../debug/storage'

export const step6GenerateTimelineImages: FrameWorkflowStep = {
  id: 'generate-timeline-images',
  label: '生成时间线图',
  description: '在浏览器侧按决策时间段截取多帧，并拼成给视觉模型看的时间线图片。',
  progressWeight: 8,
  dependsOn: ['merge-videos', 'validate-subtitles', 'decide-timeline-view'],
  effects: ['browser-media'],
  frontendWork: [
    '读取 mergedVideoFile、转录 words 和 timeline decisions。',
    '按每个 decision 的 start/end/nFrames 抽取视频帧。',
    '把多帧和字幕上下文合成为时间线图片 File。',
    '保存时间线图片到浏览器存储，供刷新后恢复使用。',
  ],
  buildInput: ({ records }) => {
    const merged = requireOutput<MergeVideosOutput>(records, 'merge-videos')
    const transcribed = requireOutput<ValidateSubtitlesOutput>(records, 'validate-subtitles')
    const decision = requireOutput<FrameInferencePipelineResult['decision']>(records, 'decide-timeline-view')

    return {
      merged,
      transcript: {
        words: transcribed.subtitleResult.segments.map((segment) => ({
          text: segment.text,
          start: segment.startTime,
          end: segment.endTime,
          type: 'word',
        })),
      },
      decisions: Array.isArray(decision.decisions) ? decision.decisions : [],
      defaultNFrames: FRAME_INFERENCE_DEFAULT_N_FRAMES,
    }
  },
  run: async (input, context) => {
    throwIfAborted(context.signal, '时间线图生成已取消')
    const { mergedVideoFile, merged, transcript, decisions, defaultNFrames, imageIndexOffset = 0 } = input as {
      mergedVideoFile?: File
      merged?: MergeVideosOutput
      transcript: { words: Array<{ text: string; start: number; end: number; type?: string }> }
      decisions: TimelineViewDecision[]
      defaultNFrames: number
      imageIndexOffset?: number
    }
    const sourceFile = mergedVideoFile instanceof File
      ? mergedVideoFile
      : merged
        ? await resolveMergedVideoFile(merged)
        : null
    if (!sourceFile) {
      throw new Error('合并视频 File 已丢失，请先重新执行“合并视频”')
    }
    const images: GenerateTimelineImagesOutput['images'] = []
    const assetRunId = context.workflowRequestIdentity?.workflowRunId ?? `timeline-${crypto.randomUUID()}`
    const totalDecisions = decisions.length

    if (totalDecisions === 0) {
      updateWorkflowStepProgress(context, 'generate-timeline-images', 100, '没有需要生成的时间线图')
      return { images } satisfies GenerateTimelineImagesOutput
    }

    for (let index = 0; index < decisions.length; index += 1) {
      throwIfAborted(context.signal, '时间线图生成已取消')
      const decision = decisions[index]
      const nFrames = Math.max(1, Math.round(decision.n_frames || defaultNFrames))
      const baseProgress = (index / totalDecisions) * 100
      updateWorkflowStepProgress(
        context,
        'generate-timeline-images',
        baseProgress,
        `正在生成时间线图 ${index + 1}/${totalDecisions}`,
        { current: index + 1, total: totalDecisions }
      )
      let generated: Awaited<ReturnType<typeof generateTimelineViewImage>>
      try {
        generated = await generateTimelineViewImage({
          video: sourceFile,
          start: decision.start,
          end: decision.end,
          nFrames,
          transcript,
          signal: context.signal,
          onProgress: (percentage, label) => {
            updateWorkflowStepProgress(
              context,
              'generate-timeline-images',
              ((index + percentage / 100) / totalDecisions) * 100,
              `${label}：${index + 1}/${totalDecisions}`,
              { current: index + 1, total: totalDecisions }
            )
          },
        })
      } catch (error) {
        if (isTimelineViewImageDecodeError(error)) {
          throw new Error(TIMELINE_IMAGE_BROWSER_DECODE_ERROR)
        }
        throw error
      }
      throwIfAborted(context.signal, '时间线图生成已取消')

      let previewStorageKey: string | undefined
      try {
        previewStorageKey = await persistTimelineImageAsset(context.projectId, assetRunId, index + imageIndexOffset, generated.file)
      } catch (error) {
        // Continue with the live File; recovery can regenerate it from source.
        console.warn('[TimelineImages] 无法保存图片缓存，恢复时将重新生成', error)
      }
      images.push({
        decisionIndex: index + imageIndexOffset + 1,
        decision,
        nFrames,
        file: generated.file,
        ...(previewStorageKey ? { previewStorageKey } : {}),
        image: {
          name: generated.file.name,
          size: generated.file.size,
          type: generated.file.type || 'image/png',
        },
      })
    }

    updateWorkflowStepProgress(context, 'generate-timeline-images', 100, `已生成 ${images.length} 张时间线图`)
    return { images } satisfies GenerateTimelineImagesOutput
  },
  summarizeOutput: (output) => ({
    images: (output as GenerateTimelineImagesOutput).images.map((item) => item.image),
  }),
}
