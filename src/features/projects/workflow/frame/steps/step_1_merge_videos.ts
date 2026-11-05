import { concatenateVideoFiles } from '@/features/projects/services/material/videoConcatenationService'
import { getVideoDuration } from '@/features/projects/services/material/frameInferencePipelineService'
import { localAssetStorageService } from '@/shared/services/localAssetStorageService'
import { throwIfAborted } from '@/shared/utils/abort'
import type { FrameWorkflowStep, MergeVideosOutput } from '../types'
import { mapProgressRange, updateWorkflowStepProgress } from '../utils/progress'

const saveVideoToOpfs = async ({
  projectId,
  kind,
  file,
  duration,
}: {
  projectId: string
  kind: string
  file: File
  duration?: number | null
}) => localAssetStorageService.saveProjectAsset({
  projectId,
  kind,
  file,
  name: file.name,
  type: file.type || 'video/mp4',
  duration,
})

export const step1MergeVideos: FrameWorkflowStep = {
  id: 'merge-videos',
  label: '合并视频',
  description: '把本次选择的视频整理成后续步骤可消费的单个视频文件，并读取基础时长信息。',
  progressWeight: 4,
  dependsOn: [],
  effects: ['browser-media'],
  frontendWork: [
    '读取浏览器中选择的 File 对象。',
    '如果只有一个视频，直接作为 mergedVideoFile 传给下游。',
    '如果有多个视频，调用前端 videoConcatenationService 在浏览器侧合并。',
    '把最终作为 source 的视频保存到浏览器 OPFS，避免后续只依赖临时 File 引用。',
    '使用 mediabunny 读取合并后视频时长，生成 mergedVideo 摘要。',
  ],
  buildInput: ({ files }) => ({ files }),
  run: async (input, context) => {
    throwIfAborted(context.signal, '视频合并已取消')
    const { files } = input as { files: File[] }
    if (!files.length) throw new Error('请先选择至少一个视频')

    updateWorkflowStepProgress(
      context,
      'merge-videos',
      5,
      files.length > 1 ? `准备合并 ${files.length} 个视频` : '只有一个视频，直接读取媒体信息',
      { current: 0, total: files.length }
    )
    const file = files.length > 1
      ? await concatenateVideoFiles(files, (progress) => {
        updateWorkflowStepProgress(
          context,
          'merge-videos',
          mapProgressRange(progress.percentage, 0, 100, 10, 88),
          progress.message,
          { current: progress.current, total: progress.total }
        )
        context.updateStepLog?.('merge-videos', '合并进度：', `合并进度：${progress.message}`)
      }, context.signal)
      : files[0]

    throwIfAborted(context.signal, '视频合并已取消')
    updateWorkflowStepProgress(context, 'merge-videos', 92, '正在读取合并视频时长')
    const duration = await getVideoDuration(file)
    throwIfAborted(context.signal, '视频合并已取消')
    updateWorkflowStepProgress(context, 'merge-videos', 96, '正在保存合并视频到 OPFS')
    const sourceVideoArtifact = await saveVideoToOpfs({
      projectId: context.projectId,
      kind: 'source_video',
      file,
      duration,
    })
    throwIfAborted(context.signal, '视频合并已取消')
    updateWorkflowStepProgress(context, 'merge-videos', 100, '合并视频已准备完成')

    return {
      file,
      video: {
        name: file.name,
        size: file.size,
        type: file.type || 'video/mp4',
        duration,
      },
      sourceVideoArtifact,
    } satisfies MergeVideosOutput
  },
  summarizeOutput: (output) => {
    const typed = output as MergeVideosOutput
    return typed.video
  },
}
