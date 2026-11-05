import { localAssetStorageService } from '@/shared/services/localAssetStorageService'
import type { Project, ProjectArtifact, ProjectWorkflowStepState } from '@/features/projects/types/project'
import { frameStepKeyById } from '../constants'
import { frameWorkflowSteps } from '../registry'
import { hasAnchoredNarrationDraftItems } from '../services/frameNarrationReview'
import type {
  ExtractAudioOutput,
  FrameDebugRun,
  FrameDebugStepId,
  FrameDebugStepRecord,
  FrameDebugStepStatus,
  GenerateNarrationScriptOutput,
  GenerateTimelineImagesOutput,
  GenerateVoiceoverOutput,
  MatchNarrationVisualsOutput,
  MergeVideoContextOutput,
  MergeVideosOutput,
  TranscribeOutput,
  ValidateSubtitlesOutput,
} from '../types'

export interface FrameWorkflowResumeSummary {
  available: boolean
  completedCount: number
  totalCount: number
  nextStepId: FrameDebugStepId
  nextStepLabel: string
  interruptedStepId: FrameDebugStepId | null
  interruptedStepLabel: string | null
  resumeStepId: FrameDebugStepId
  resumeStepLabel: string
}

export interface FrameWorkflowRecoveryAssetState {
  sourceArtifact: ProjectArtifact | null
  sourceAssetAvailable: boolean
  requiresSourceSelection: boolean
}

export interface FrameWorkflowRecoveryBuild {
  run: FrameDebugRun
  summary: FrameWorkflowResumeSummary
}

const stepLabelById = (stepId: FrameDebugStepId) => (
  frameWorkflowSteps.find(step => step.id === stepId)?.label ?? stepId
)

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const asRecord = (value: unknown) => isRecord(value) ? value : null

const readStepState = (project: Project, stepId: FrameDebugStepId) => {
  const stepKey = frameStepKeyById[stepId]
  return project.workflow.steps?.[stepKey]
}

const persistedStepStatus = (state?: ProjectWorkflowStepState): FrameDebugStepStatus | null => {
  if (!state?.status) return null
  return state.status === 'running' ? 'interrupted' : state.status
}

const isPersistedComplete = (state?: ProjectWorkflowStepState) => (
  state?.status === 'success' || state?.status === 'skipped'
)

const firstIncompletePersistedStepId = (project: Project) => (
  frameWorkflowSteps.find(step => !isPersistedComplete(readStepState(project, step.id)))?.id
    ?? frameWorkflowSteps[frameWorkflowSteps.length - 1].id
)

const readScriptData = (project: Project) => (
  asRecord(project.workflow.stages.script?.data) ?? {}
)

const readSourceData = (project: Project) => (
  asRecord(project.workflow.stages.source_video?.data) ?? {}
)

const readFrameWorkflowResult = (project: Project) => {
  const scriptData = readScriptData(project)
  const aiAnalysisScript = asRecord(scriptData.ai_analysis_script)
  const frameWorkflow = aiAnalysisScript?.frame_workflow
  return isRecord(frameWorkflow) ? frameWorkflow : null
}

const readProjectArtifact = (value: unknown): ProjectArtifact | null => {
  const record = asRecord(value)
  if (!record || typeof record.key !== 'string' || !record.key.trim()) return null
  return record as unknown as ProjectArtifact
}

export const getFrameWorkflowSourceArtifact = (project: Project): ProjectArtifact | null => {
  const sourceData = readSourceData(project)
  return readProjectArtifact(project.artifacts.source_video)
    ?? readProjectArtifact(sourceData.source_video_artifact)
    ?? readProjectArtifact(sourceData.sourceVideoArtifact)
}

const makeSuccessRecord = <Output>(
  stepId: FrameDebugStepId,
  state: ProjectWorkflowStepState | undefined,
  output?: Output
): FrameDebugStepRecord<unknown, Output> => ({
  id: stepId,
  status: state?.status === 'skipped' ? 'skipped' : 'success',
  ...(output !== undefined ? { output } : {}),
  ...(state?.summary ? { outputSummary: state.summary } : {}),
  ...(state?.progress ? { progress: state.progress } : {}),
  ...(state?.started_at ? { startedAt: state.started_at } : {}),
  ...(state?.completed_at ? { completedAt: state.completed_at } : {}),
  ...(typeof state?.duration_ms === 'number' ? { durationMs: state.duration_ms } : {}),
  logs: ['已从项目 workflow 快照恢复步骤状态。'],
})

const makeNonSuccessRecord = (
  stepId: FrameDebugStepId,
  status: FrameDebugStepStatus,
  state: ProjectWorkflowStepState | undefined
): FrameDebugStepRecord => ({
  id: stepId,
  status,
  ...(state?.summary ? { outputSummary: state.summary } : {}),
  ...(state?.progress ? { progress: state.progress } : {}),
  ...(state?.error ? { error: String(state.error) } : {}),
  ...(state?.started_at ? { startedAt: state.started_at } : {}),
  ...(state?.completed_at ? { completedAt: state.completed_at } : {}),
  ...(typeof state?.duration_ms === 'number' ? { durationMs: state.duration_ms } : {}),
  logs: [
    status === 'interrupted'
      ? '上次页面会话中断，当前步骤将重新执行。'
      : '已从项目 workflow 快照恢复步骤状态。',
  ],
})

const readMergedVideoOutput = (project: Project, frameWorkflow: Record<string, unknown> | null): MergeVideosOutput | undefined => {
  const sourceData = readSourceData(project)
  const video = asRecord(frameWorkflow?.mergedVideo) ?? asRecord(sourceData.merged_video)
  if (!video) return undefined

  return {
    video: video as MergeVideosOutput['video'],
    sourceVideoArtifact: getFrameWorkflowSourceArtifact(project),
  } as MergeVideosOutput
}

const readExtractAudioOutput = (project: Project, frameWorkflow: Record<string, unknown> | null): ExtractAudioOutput | undefined => {
  const sourceData = readSourceData(project)
  const audio = asRecord(frameWorkflow?.extractedAudio)
    ?? asRecord(sourceData.extracted_audio)
    ?? asRecord(readStepState(project, 'extract-audio')?.summary)
  return audio ? { audio: audio as ExtractAudioOutput['audio'] } : undefined
}

const readTranscribeOutput = (project: Project, frameWorkflow: Record<string, unknown> | null): TranscribeOutput | undefined => {
  const subtitlesStage = project.workflow.stages.subtitles
  const sourceData = readSourceData(project)
  const transcription = asRecord(frameWorkflow?.transcription) ?? asRecord(subtitlesStage?.transcription)
  const subtitleResult = asRecord(frameWorkflow?.subtitleResult) ?? asRecord(subtitlesStage?.subtitle_result)
  const subtitlePayload = frameWorkflow?.subtitlePayload ?? subtitlesStage?.data
  const initialVideoContext = frameWorkflow?.videoContext ?? sourceData.video_context
  if (!transcription || !subtitleResult || !subtitlePayload || !initialVideoContext) return undefined

  return {
    transcription: transcription as unknown as TranscribeOutput['transcription'],
    subtitleResult: subtitleResult as unknown as TranscribeOutput['subtitleResult'],
    subtitlePayload: subtitlePayload as TranscribeOutput['subtitlePayload'],
    initialVideoContext: initialVideoContext as TranscribeOutput['initialVideoContext'],
  }
}

const readValidateSubtitlesOutput = (project: Project, frameWorkflow: Record<string, unknown> | null): ValidateSubtitlesOutput | undefined => {
  const transcribed = readTranscribeOutput(project, frameWorkflow)
  if (!transcribed) return undefined
  const validation = asRecord(frameWorkflow?.subtitleValidation) ?? asRecord(project.workflow.stages.subtitles?.validation)
  return {
    ...transcribed,
    validation: (validation ?? {}) as unknown as ValidateSubtitlesOutput['validation'],
  }
}

const readDecisionOutput = (project: Project, frameWorkflow: Record<string, unknown> | null) => {
  const scriptData = readScriptData(project)
  const aiAnalysisScript = asRecord(scriptData.ai_analysis_script)
  return frameWorkflow?.decision ?? scriptData.timeline_decision ?? aiAnalysisScript?.timeline_decision
}

const readTimelineImagesOutput = (project: Project): GenerateTimelineImagesOutput | undefined => {
  const sourceData = readSourceData(project)
  const images = sourceData.timeline_images
  return Array.isArray(images) ? { images: images as GenerateTimelineImagesOutput['images'] } : undefined
}

const readAnalysesOutput = (project: Project, frameWorkflow: Record<string, unknown> | null) => {
  const scriptData = readScriptData(project)
  const aiAnalysisScript = asRecord(scriptData.ai_analysis_script)
  const analyses = frameWorkflow?.analyses ?? scriptData.timeline_analyses ?? aiAnalysisScript?.timeline_analyses
  return Array.isArray(analyses) ? { analyses } : undefined
}

const readNarrativeOutput = (project: Project, frameWorkflow: Record<string, unknown> | null) => {
  const scriptData = readScriptData(project)
  const aiAnalysisScript = asRecord(scriptData.ai_analysis_script)
  return frameWorkflow?.narrativeUnderstanding ?? scriptData.narrative_understanding ?? aiAnalysisScript?.narrative_understanding
}

const readTokenCount = (value: unknown) => {
  const record = asRecord(value)
  const tokenValue = record?.tokens_consumed
  return typeof tokenValue === 'number' && Number.isFinite(tokenValue) ? tokenValue : 0
}

const sumAnalysisTokens = (analyses: unknown[]) => analyses.reduce<number>((total, item) => (
  total + readTokenCount(asRecord(item)?.response)
), 0)

const readPipelineResultOutput = (project: Project, frameWorkflow: Record<string, unknown> | null) => {
  if (frameWorkflow) return frameWorkflow

  const merged = readMergedVideoOutput(project, null)
  const extracted = readExtractAudioOutput(project, null)
  const transcribed = readValidateSubtitlesOutput(project, null)
  const decision = readDecisionOutput(project, null)
  const analyses = readAnalysesOutput(project, null)?.analyses
  const narrativeUnderstanding = readNarrativeOutput(project, null)
  const videoContext = readSourceData(project).video_context

  if (!merged || !extracted || !transcribed || !decision || !Array.isArray(analyses) || !narrativeUnderstanding || !videoContext) {
    return null
  }

  const transcriptionTokens = readTokenCount(transcribed.transcription)
  const validationTokens = readTokenCount(transcribed.validation)
  const decisionTokens = readTokenCount(decision)
  const analysisTokens = sumAnalysisTokens(analyses)
  const narrativeTokens = readTokenCount(narrativeUnderstanding)

  return {
    mergedVideo: merged.video,
    extractedAudio: extracted.audio,
    transcription: transcribed.transcription,
    subtitleResult: transcribed.subtitleResult,
    subtitlePayload: transcribed.subtitlePayload,
    subtitleValidation: transcribed.validation,
    videoContext,
    decision,
    analyses,
    narrativeUnderstanding,
    tokens: {
      transcription: transcriptionTokens,
      validation: validationTokens,
      decision: decisionTokens,
      analysis: analysisTokens,
      narrative: narrativeTokens,
      total: transcriptionTokens + validationTokens + decisionTokens + analysisTokens + narrativeTokens,
    },
  }
}

const readMergeVideoContextOutput = (project: Project, frameWorkflow: Record<string, unknown> | null): MergeVideoContextOutput | undefined => {
  const sourceData = readSourceData(project)
  const videoContext = frameWorkflow?.videoContext ?? sourceData.video_context
  const pipelineResult = readPipelineResultOutput(project, frameWorkflow)
  if (!pipelineResult || !videoContext) return undefined
  return {
    videoContext: videoContext as MergeVideoContextOutput['videoContext'],
    pipelineResult: pipelineResult as unknown as MergeVideoContextOutput['pipelineResult'],
  }
}

const readGenerateNarrationOutput = (
  frameWorkflow: Record<string, unknown> | null,
  narrationRatio: number,
): GenerateNarrationScriptOutput | undefined => {
  const scriptResponse = asRecord(frameWorkflow?.scriptResponse)
  const draftItems = Array.isArray(frameWorkflow?.narrationDraftItems)
    ? frameWorkflow.narrationDraftItems as GenerateNarrationScriptOutput['draftItems']
    : undefined
  const approvedDraftItems = Array.isArray(frameWorkflow?.approvedNarrationDraftItems)
    ? frameWorkflow.approvedNarrationDraftItems as GenerateNarrationScriptOutput['approvedDraftItems']
    : undefined
  const anchoredItems = approvedDraftItems?.length ? approvedDraftItems : draftItems
  if (
    narrationRatio > 0
    && (scriptResponse || anchoredItems?.length)
    && !hasAnchoredNarrationDraftItems(anchoredItems)
  ) {
    return undefined
  }
  if (!frameWorkflow || (!scriptResponse && !draftItems?.length)) return undefined
  return {
    ...(scriptResponse ? { scriptResponse: scriptResponse as unknown as GenerateNarrationScriptOutput['scriptResponse'] } : {}),
    ...(draftItems ? { draftItems } : {}),
    ...(approvedDraftItems ? { approvedDraftItems } : {}),
    reviewRequired: Boolean(draftItems?.length && !scriptResponse),
    pipelineResult: frameWorkflow as unknown as GenerateNarrationScriptOutput['pipelineResult'],
  }
}

const readMatchNarrationVisualsOutput = (frameWorkflow: Record<string, unknown> | null): MatchNarrationVisualsOutput | undefined => {
  const scriptResponse = asRecord(frameWorkflow?.scriptResponse)
  if (!frameWorkflow || !scriptResponse) return undefined
  return {
    scriptResponse: scriptResponse as unknown as MatchNarrationVisualsOutput['scriptResponse'],
    pipelineResult: frameWorkflow as unknown as MatchNarrationVisualsOutput['pipelineResult'],
  }
}

const readGenerateVoiceoverOutput = (frameWorkflow: Record<string, unknown> | null): GenerateVoiceoverOutput | undefined => {
  const voiceoverResult = asRecord(frameWorkflow?.voiceoverResult)
  if (!frameWorkflow || !voiceoverResult) return undefined
  return {
    voiceoverResult: voiceoverResult as unknown as GenerateVoiceoverOutput['voiceoverResult'],
    pipelineResult: frameWorkflow as unknown as GenerateVoiceoverOutput['pipelineResult'],
  }
}

const buildRecoveredOutputs = (project: Project) => {
  const frameWorkflow = readFrameWorkflowResult(project)
  const frameConfig = asRecord(project.metadata?.frame_inference_config)
  const configuredNarrationRatio = frameConfig?.narration_ratio ?? frameConfig?.narrationRatio
  const narrationRatio = typeof configuredNarrationRatio === 'number' && Number.isFinite(configuredNarrationRatio)
    ? Math.max(0, Math.min(1, configuredNarrationRatio))
    : 0.5
  const narrationOutput = readGenerateNarrationOutput(frameWorkflow, narrationRatio)
  const hasPersistedNarrationPayload = Boolean(
    asRecord(frameWorkflow?.scriptResponse)
      || (Array.isArray(frameWorkflow?.narrationDraftItems) && frameWorkflow.narrationDraftItems.length)
      || (Array.isArray(frameWorkflow?.approvedNarrationDraftItems) && frameWorkflow.approvedNarrationDraftItems.length),
  )
  const legacyNarrationInvalid = narrationRatio > 0 && hasPersistedNarrationPayload && !narrationOutput
  return {
    'merge-videos': readMergedVideoOutput(project, frameWorkflow),
    'extract-audio': readExtractAudioOutput(project, frameWorkflow),
    transcribe: readTranscribeOutput(project, frameWorkflow),
    'validate-subtitles': readValidateSubtitlesOutput(project, frameWorkflow),
    'decide-timeline-view': readDecisionOutput(project, frameWorkflow),
    'generate-timeline-images': readTimelineImagesOutput(project),
    'analyze-timeline-images': readAnalysesOutput(project, frameWorkflow),
    'understand-narrative': readNarrativeOutput(project, frameWorkflow),
    'merge-video-context': readMergeVideoContextOutput(project, frameWorkflow),
    'generate-narration-script': narrationOutput,
    'match-narration-visuals': legacyNarrationInvalid ? undefined : readMatchNarrationVisualsOutput(frameWorkflow),
    'generate-voiceover': legacyNarrationInvalid ? undefined : readGenerateVoiceoverOutput(frameWorkflow),
    'compose-final-video': undefined,
    'persist-project': undefined,
  } satisfies Partial<Record<FrameDebugStepId, unknown>>
}

export const getFrameWorkflowResumeSummary = (project: Project): FrameWorkflowResumeSummary => {
  const completedCount = frameWorkflowSteps.filter(step => isPersistedComplete(readStepState(project, step.id))).length
  const totalCount = frameWorkflowSteps.length
  const nextStepId = firstIncompletePersistedStepId(project)
  const interruptedStepId = frameWorkflowSteps.find(step => readStepState(project, step.id)?.status === 'running')?.id ?? null
  const available = project.workflow.mode === 'frame'
    && project.status === 'processing'
    && completedCount > 0
    && completedCount < totalCount

  return {
    available,
    completedCount,
    totalCount,
    nextStepId,
    nextStepLabel: stepLabelById(nextStepId),
    interruptedStepId,
    interruptedStepLabel: interruptedStepId ? stepLabelById(interruptedStepId) : null,
    resumeStepId: nextStepId,
    resumeStepLabel: stepLabelById(nextStepId),
  }
}

export const buildRecoverableFrameWorkflowRun = (project: Project): FrameWorkflowRecoveryBuild | null => {
  const summary = getFrameWorkflowResumeSummary(project)
  if (!summary.available) return null

  const recoveredOutputs = buildRecoveredOutputs(project)
  const records: FrameDebugRun['records'] = {}
  const firstIncompleteIndex = frameWorkflowSteps.findIndex(step => step.id === summary.nextStepId)

  frameWorkflowSteps.forEach((step) => {
    const state = readStepState(project, step.id)
    const status = persistedStepStatus(state)
    if (!status) return

    const output = recoveredOutputs[step.id]

    records[step.id] = status === 'success' || status === 'skipped'
      ? makeSuccessRecord(step.id, state, output)
      : makeNonSuccessRecord(step.id, status, state)
  })

  let resumeIndex = Math.max(0, firstIncompleteIndex)
  let shouldInspectDependencies = true
  while (shouldInspectDependencies) {
    shouldInspectDependencies = false
    const resumeStep = frameWorkflowSteps[resumeIndex]
    const missingDependencyId = resumeStep?.dependsOn.find((dependencyId) => {
      const dependencyState = readStepState(project, dependencyId)
      return isPersistedComplete(dependencyState) && recoveredOutputs[dependencyId] === undefined
    })
    if (!missingDependencyId) break
    const dependencyIndex = frameWorkflowSteps.findIndex(step => step.id === missingDependencyId)
    if (dependencyIndex >= 0 && dependencyIndex < resumeIndex) {
      resumeIndex = dependencyIndex
      shouldInspectDependencies = true
    }
  }
  const resumeStepId = frameWorkflowSteps[resumeIndex]?.id ?? summary.nextStepId
  const now = new Date().toISOString()

  return {
    summary: {
      ...summary,
      resumeStepId,
      resumeStepLabel: stepLabelById(resumeStepId),
    },
    run: {
      id: `frame-recovered-${project.id}-${project.workflow.revision || 0}`,
      projectId: project.id,
      mode: 'apply',
      status: 'cancelled',
      createdAt: project.created_at,
      updatedAt: project.updated_at || now,
      records,
      startStepId: resumeStepId,
      error: summary.interruptedStepLabel
        ? `任务已中断，可从“${stepLabelById(resumeStepId)}”继续。`
        : undefined,
    },
  }
}

export const inspectFrameWorkflowRecoveryAssets = async (project: Project): Promise<FrameWorkflowRecoveryAssetState> => {
  const sourceArtifact = getFrameWorkflowSourceArtifact(project)
  if (!sourceArtifact?.key) {
    return {
      sourceArtifact: null,
      sourceAssetAvailable: false,
      requiresSourceSelection: true,
    }
  }

  let sourceAssetAvailable = false
  try {
    sourceAssetAvailable = await localAssetStorageService.hasProjectAsset(sourceArtifact.key)
  } catch {
    sourceAssetAvailable = false
  }

  return {
    sourceArtifact,
    sourceAssetAvailable,
    requiresSourceSelection: !sourceAssetAvailable,
  }
}

export const hydrateRecoveredFrameWorkflowRunWithFiles = (
  run: FrameDebugRun,
  files: File[]
): FrameDebugRun => {
  if (files.length === 0) return run
  const mergeRecord = run.records['merge-videos']
  const output = mergeRecord?.output as MergeVideosOutput | undefined
  if (
    !mergeRecord
    || !output
    || (typeof File !== 'undefined' && output.file instanceof File)
    || output.sourceVideoArtifact?.key
  ) {
    return run
  }

  const video = output.video
  const matchedFile = files.find(file => file.name === video.name && file.size === video.size) ?? (files.length === 1 ? files[0] : null)
  if (!matchedFile) return run

  return {
    ...run,
    records: {
      ...run.records,
      'merge-videos': {
        ...mergeRecord,
        output: {
          ...output,
          file: matchedFile,
        },
      },
    },
  }
}
