import ProjectService from '@/features/projects/services/projectService'
import { makeFrameConfigMetadata } from '../constants'
import { getFrameWorkflowResult } from '../runner/result'
import type { FrameDebugRun, FrameWorkflowContext, FrameWorkflowProjectFieldKey, FrameWorkflowProjectSnapshot, GenerateNarrationScriptOutput, GenerateVoiceoverOutput, MatchNarrationVisualsOutput, MergeVideoContextOutput, MergeVideosOutput, TranscribeOutput } from '../types'
import { cloneRecords, hasMeaningfulPersistenceValue, successfulOutput } from '../utils/records'
import { saveFrameWorkflowProjectPreview } from './projectPreview'

const uniqueFrameFields = (fields: FrameWorkflowProjectFieldKey[]) => [...new Set(fields)]

export const collectFrameWorkflowProjectFields = (
  context: FrameWorkflowContext,
  run: FrameDebugRun
) => {
  const currentResult = getFrameWorkflowResult(run)
  const transcribeOutput = successfulOutput<TranscribeOutput>(run, 'transcribe')
  const mergeOutput = successfulOutput<MergeVideoContextOutput>(run, 'merge-video-context')
  const generatedOutput = successfulOutput<GenerateNarrationScriptOutput>(run, 'generate-narration-script')
  const matchedOutput = successfulOutput<MatchNarrationVisualsOutput>(run, 'match-narration-visuals')
  const voiceoverOutput = successfulOutput<GenerateVoiceoverOutput>(run, 'generate-voiceover')
  const decisionOutput = successfulOutput<unknown>(run, 'decide-timeline-view')
  const analysisOutput = successfulOutput<{ analyses?: unknown }>(run, 'analyze-timeline-images')
  const narrativeOutput = successfulOutput<unknown>(run, 'understand-narrative')

  const workflowUpdates: Parameters<typeof ProjectService.saveWorkflowFields>[1] = {}
  const aiAnalysisScript: Record<string, unknown> = {}
  const persistedFields: FrameWorkflowProjectFieldKey[] = []

  const finalVideoUrl = currentResult?.finalVideoResult?.artifact?.key
  if (hasMeaningfulPersistenceValue(finalVideoUrl)) {
    workflowUpdates.video_url = finalVideoUrl
    persistedFields.push('video_url')
  }

  const subtitle = currentResult?.subtitlePayload ?? transcribeOutput?.subtitlePayload
  if (hasMeaningfulPersistenceValue(subtitle)) {
    workflowUpdates.subtitle = subtitle
    persistedFields.push('subtitle')
  }

  const videoContext = currentResult?.videoContext ?? mergeOutput?.videoContext
  if (hasMeaningfulPersistenceValue(videoContext)) {
    workflowUpdates.video_context = videoContext
    persistedFields.push('video_context')
  }

  if (hasMeaningfulPersistenceValue(currentResult)) {
    aiAnalysisScript.frame_workflow = currentResult
    persistedFields.push('ai_analysis_script.frame_workflow')
  }

  const timelineDecision = currentResult?.decision ?? decisionOutput
  if (hasMeaningfulPersistenceValue(timelineDecision)) {
    aiAnalysisScript.timeline_decision = timelineDecision
    persistedFields.push('ai_analysis_script.timeline_decision')
  }

  const timelineAnalyses = currentResult?.analyses ?? analysisOutput?.analyses
  if (hasMeaningfulPersistenceValue(timelineAnalyses)) {
    aiAnalysisScript.timeline_analyses = timelineAnalyses
    persistedFields.push('ai_analysis_script.timeline_analyses')
  }

  const narrativeUnderstanding = currentResult?.narrativeUnderstanding ?? narrativeOutput
  if (hasMeaningfulPersistenceValue(narrativeUnderstanding)) {
    aiAnalysisScript.narrative_understanding = narrativeUnderstanding
    persistedFields.push('ai_analysis_script.narrative_understanding')
  }

  const scriptItems = currentResult?.voiceoverResult?.items
    ?? currentResult?.scriptResponse?.items
    ?? voiceoverOutput?.voiceoverResult.items
    ?? matchedOutput?.scriptResponse.items
    ?? generatedOutput?.scriptResponse?.items
  if (hasMeaningfulPersistenceValue(scriptItems)) {
    aiAnalysisScript.items = scriptItems
  }

  const audioStates = currentResult?.voiceoverResult?.audioStates ?? voiceoverOutput?.voiceoverResult.audioStates
  if (hasMeaningfulPersistenceValue(audioStates)) {
    aiAnalysisScript.audioStates = audioStates
  }

  if (Object.keys(aiAnalysisScript).length > 0) {
    workflowUpdates.ai_analysis_script = aiAnalysisScript
  }

  const hasGeneratedProjectData = persistedFields.length > 0
  const projectMetadata = hasGeneratedProjectData
    ? {
      ...(context.projectMetadata ?? {}),
      inference_mode: 'frame' as const,
      frame_inference_config: makeFrameConfigMetadata(context.config),
      frame_inference_completed_at: new Date().toISOString(),
    }
    : null
  if (projectMetadata) {
    persistedFields.push('project_metadata')
  }

  return {
    workflowUpdates,
    projectMetadata,
    persistedFields: uniqueFrameFields(persistedFields),
  }
}

export const applyFrameWorkflowRunToProject = async (
  context: FrameWorkflowContext,
  run: FrameDebugRun,
  editedInput?: unknown
) => {
  const collected = editedInput && typeof editedInput === 'object'
    ? editedInput as ReturnType<typeof collectFrameWorkflowProjectFields>
    : collectFrameWorkflowProjectFields(context, run)

  if (collected.persistedFields.length === 0) {
    throw new Error('当前 run 还没有可存储的字段，请先成功执行至少一个会产出项目字段的步骤')
  }

  const workflowResult = Object.keys(collected.workflowUpdates).length > 0
    ? await ProjectService.saveWorkflowFields(context.projectId, collected.workflowUpdates)
    : null
  const projectResult = collected.projectMetadata
    ? await ProjectService.updateProject(context.projectId, {
      ...(context.projectName ? { name: context.projectName } : {}),
      metadata: collected.projectMetadata,
    })
    : null
  const mergedOutput = successfulOutput<MergeVideosOutput>(run, 'merge-videos')
  const previewSaved = mergedOutput
    ? await saveFrameWorkflowProjectPreview(context.projectId, mergedOutput)
    : false
  const completedAt = new Date().toISOString()
  const records = cloneRecords(run.records)
  records['persist-project'] = {
    id: 'persist-project',
    status: 'success',
    input: collected,
    output: {
      workflowResult,
      projectResult,
      previewSaved,
      writtenFields: collected.persistedFields,
    },
    outputSummary: {
      writtenFields: collected.persistedFields,
    },
    startedAt: completedAt,
    completedAt,
    durationMs: 0,
    logs: [
      '开始执行：应用到项目',
      `写入字段：${collected.persistedFields.join(', ')}`,
      ...(previewSaved ? ['已保存项目本地预览图。'] : []),
      '执行成功：已生成 应用到项目 的输出摘要。',
    ],
  }

  return {
    ...run,
    mode: 'apply',
    status: 'success',
    updatedAt: completedAt,
    completedAt,
    records,
    applied: true,
    persistedFields: uniqueFrameFields([...(run.persistedFields ?? []), ...collected.persistedFields]),
    deletedFields: (run.deletedFields ?? []).filter((field) => !collected.persistedFields.includes(field)),
  } satisfies FrameDebugRun
}

export const deleteFrameWorkflowProjectFields = async (
  context: FrameWorkflowContext,
  fields: FrameWorkflowProjectFieldKey[],
  snapshot: FrameWorkflowProjectSnapshot = {}
) => {
  const deletedFields = uniqueFrameFields(fields)
  if (deletedFields.length === 0) {
    throw new Error('请选择要删除的项目字段')
  }

  const workflowUpdates: Parameters<typeof ProjectService.saveWorkflowFields>[1] = {}
  const scriptKeys: Partial<Record<FrameWorkflowProjectFieldKey, string>> = {
    'ai_analysis_script.frame_workflow': 'frame_workflow',
    'ai_analysis_script.timeline_decision': 'timeline_decision',
    'ai_analysis_script.timeline_analyses': 'timeline_analyses',
    'ai_analysis_script.narrative_understanding': 'narrative_understanding',
  }
  const scriptFields = deletedFields.filter((field) => scriptKeys[field])

  if (deletedFields.includes('subtitle')) {
    workflowUpdates.subtitle = null
  }
  if (deletedFields.includes('video_url')) {
    workflowUpdates.video_url = null
  }
  if (deletedFields.includes('video_context')) {
    workflowUpdates.video_context = null
  }
  if (scriptFields.length > 0) {
    const nextScript = { ...(snapshot.aiAnalysisScript ?? {}) }
    scriptFields.forEach((field) => {
      delete nextScript[scriptKeys[field] as string]
    })
    workflowUpdates.ai_analysis_script = nextScript
  }

  const nextMetadata = deletedFields.includes('project_metadata')
    ? { ...(snapshot.projectMetadata ?? context.projectMetadata ?? {}) }
    : null
  if (nextMetadata) {
    delete nextMetadata.frame_inference_config
    delete nextMetadata.frame_inference_completed_at
    if (nextMetadata.inference_mode === 'frame') {
      delete nextMetadata.inference_mode
    }
  }

  const workflowResult = Object.keys(workflowUpdates).length > 0
    ? await ProjectService.saveWorkflowFields(context.projectId, workflowUpdates)
    : null
  const projectResult = nextMetadata
    ? await ProjectService.updateProject(context.projectId, {
      ...(snapshot.projectName ? { name: snapshot.projectName } : {}),
      metadata: nextMetadata,
    })
    : null

  return {
    workflowResult,
    projectResult,
    deletedFields,
  }
}
