import ProjectService from '@/features/projects/services/projectService'
import { localAssetStorageService } from '@/shared/services/localAssetStorageService'
import type { FrameInferencePipelineResult } from '@/features/projects/services/material/frameInferencePipelineService'
import type { ProjectMetadata } from '@/features/projects/types/project'
import type { ComposeFinalVideoOutput, FrameWorkflowStep, MergeVideosOutput, PersistProjectOutput } from '../types'
import { makeFrameConfigMetadata } from '../constants'
import { saveFrameWorkflowProjectPreview } from '../persistence/projectPreview'
import { requireOutput } from '../utils/records'
import { updateWorkflowStepProgress } from '../utils/progress'

export const step13PersistProject: FrameWorkflowStep = {
  id: 'persist-project',
  label: '应用到项目',
  description: '把当前成功 run 的结果显式写入项目字段；这是调试页里唯一会修改项目数据的步骤。',
  progressWeight: 1,
  dependsOn: ['compose-final-video'],
  effects: ['network', 'mutates-project'],
  frontendWork: [
    '读取 compose-final-video 输出的完整 pipelineResult。',
    '准备 subtitle、video_context、ai_analysis_script.items、frame_workflow 和关键中间分析结果。',
    '准备 project_metadata.inference_mode 和 frame_inference_config。',
    '从 merge-videos 输出截取项目预览图并写入浏览器本地缓存。',
    '只有点击“存储已生成字段”时才执行，dry-run 会跳过。',
  ],
  backendRoutes: [
    {
      method: 'PUT',
      path: '/api/v1/projects/:projectId/workflow/steps/subtitles',
      handler: 'Project workflow subtitles 保存',
      purpose: '保存通用模式生成的字幕时间轴。',
    },
    {
      method: 'PUT',
      path: '/api/v1/projects/:projectId/workflow/steps/video-source',
      handler: 'Project workflow video-source 保存',
      purpose: '保存合并后的 video_context。',
    },
    {
      method: 'PUT',
      path: '/api/v1/projects/:projectId/workflow/steps/script',
      handler: 'Project workflow script 保存',
      purpose: '保存 ai_analysis_script 的通用模式调试结果、视觉判断、时间线分析和剧情理解。',
    },
    {
      method: 'PUT',
      path: '/api/v1/projects/:projectId',
      handler: 'Project update',
      purpose: '保存 project_metadata 里的通用模式配置和完成时间。',
    },
  ],
  buildInput: ({ records, config, projectMetadata, projectName }) => {
    const merged = requireOutput<MergeVideosOutput>(records, 'merge-videos')
    const composed = requireOutput<ComposeFinalVideoOutput>(records, 'compose-final-video')
    return {
      projectName,
      merged,
      pipelineResult: composed.pipelineResult,
      finalVideo: composed.finalVideo,
      projectMetadata: {
        ...(projectMetadata ?? {}),
        inference_mode: 'frame',
        frame_inference_config: makeFrameConfigMetadata(config, merged.video.duration),
        frame_inference_completed_at: new Date().toISOString(),
      },
    }
  },
  run: async (input, context) => {
    const { projectName, merged, pipelineResult, projectMetadata } = input as {
      projectName?: string
      merged: MergeVideosOutput
      pipelineResult: FrameInferencePipelineResult
      projectMetadata: ProjectMetadata
    }
    updateWorkflowStepProgress(context, 'persist-project', 15, '正在写入通用模式生成字段')
    const project = await ProjectService.getProject(context.projectId)
    const now = new Date().toISOString()
    const sourceVideoArtifact = merged.sourceVideoArtifact ?? await localAssetStorageService.saveProjectAsset({
      projectId: context.projectId,
      kind: 'source_video',
      file: merged.file,
      name: merged.file.name,
      type: merged.file.type || 'video/mp4',
      duration: merged.video.duration,
    })
    const aiAnalysisScript = {
      frame_workflow: pipelineResult,
      timeline_decision: pipelineResult.decision,
      timeline_analyses: pipelineResult.analyses,
      narrative_understanding: pipelineResult.narrativeUnderstanding,
      items: pipelineResult.voiceoverResult?.items ?? pipelineResult.scriptResponse?.items ?? [],
      audioStates: pipelineResult.voiceoverResult?.audioStates ?? {},
    }
    const nextWorkflow = {
      ...project.workflow,
      status: 'completed' as const,
      current_step: 'step_14_completed' as const,
      current_step_id: null,
      current_step_index: 14,
      revision: project.workflow.revision + 1,
      steps: {
        ...project.workflow.steps,
        step_13_persist_project: {
          status: 'success' as const,
          completed_at: now,
          updated_at: now,
          summary: { written_fields: 7 },
        },
        step_14_completed: {
          status: 'success' as const,
          completed_at: now,
          updated_at: now,
        },
      },
      stages: {
        ...project.workflow.stages,
        source_video: {
          data: {
            video_context: pipelineResult.videoContext,
            merged_video: pipelineResult.mergedVideo,
          },
          updated_at: now,
        },
        subtitles: {
          data: pipelineResult.subtitlePayload,
          updated_at: now,
        },
        config: {
          data: makeFrameConfigMetadata(context.config, merged.video.duration),
          updated_at: now,
        },
        script: {
          data: { ai_analysis_script: aiAnalysisScript },
          updated_at: now,
        },
        voiceover: {
          data: pipelineResult.voiceoverResult ?? null,
          updated_at: now,
        },
        final_video: {
          data: pipelineResult.finalVideoResult ?? null,
          updated_at: now,
        },
      },
    }
    updateWorkflowStepProgress(context, 'persist-project', 65, '正在更新项目元数据')
    const projectResult = await ProjectService.updateProject(context.projectId, {
      ...(projectName ? { name: projectName } : {}),
      status: 'completed',
      workflow: nextWorkflow,
      artifacts: {
        ...project.artifacts,
        source_video: sourceVideoArtifact,
        final_video: pipelineResult.finalVideoResult?.artifact ?? null,
      },
      metadata: projectMetadata,
    })
    updateWorkflowStepProgress(context, 'persist-project', 88, '正在保存项目预览图')
    const previewSaved = await saveFrameWorkflowProjectPreview(context.projectId, merged)
    updateWorkflowStepProgress(context, 'persist-project', 100, '项目写入已完成')

    return {
      workflowResult: nextWorkflow,
      projectResult,
      previewSaved,
      writtenFields: [
        'workflow.stages.subtitles',
        'workflow.stages.source_video',
        'workflow.stages.script.data.ai_analysis_script',
        'artifacts.source_video',
        'artifacts.final_video',
        'metadata',
      ],
    } satisfies PersistProjectOutput
  },
  summarizeOutput: (output) => ({
    writtenFields: (output as PersistProjectOutput).writtenFields,
  }),
}
