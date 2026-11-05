import ProjectService from '@/features/projects/services/projectService'
import VideoProcessingService from '@/features/projects/services/material/videoProcessingService'
import type { MergeVideosOutput } from '../types'
import { resolveMergedVideoFile } from '../utils/media'

export const saveFrameWorkflowProjectPreview = async (
  projectId: string,
  merged: MergeVideosOutput
) => {
  try {
    const file = await resolveMergedVideoFile(merged)
    const thumbnailBlob = await VideoProcessingService.captureVideoThumbnail(file, undefined, 500)
    await ProjectService.uploadProjectPreview(projectId, thumbnailBlob)
    return true
  } catch (error) {
    console.warn('[FrameWorkflow] 保存项目本地预览图失败，已跳过', error)
    return false
  }
}