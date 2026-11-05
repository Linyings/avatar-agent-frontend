import type { SubtitleValidationMetadata, TimelineViewDecision } from '@/shared/services/aiToolsService'
import type { AnchoredNarrationDraftItem, GenerateScriptResponse, TokenUsage } from '@/features/projects/services/scriptGenerationServiceV2'
import type { ComposeFrameFinalVideoResult, ElevenLabsScribeResponse, FrameInferenceConfig, FrameInferencePipelineResult, FrameVoiceoverResult } from '@/features/projects/services/material/frameInferencePipelineService'
import type { FrameWorkflowStepId, ProjectArtifact, ProjectMetadata } from '@/features/projects/types/project'
import type { buildSubtitlePayload } from '@/features/projects/utils/subtitleTransform'
import type { convertSubtitlesToVideoContext } from '@/features/projects/utils/videoContextConverter'
import type { WorkflowRequestIdentity } from '@/shared/workflowRuns/identity'
import type {
  FrameQualityGateAttempt,
  FrameQualityGateOutcome,
  FrameQualityGateStage,
  FrameWorkflowIntentSnapshot,
} from './qualityGateTypes'
import type { NarrationChapterResult, NarrationGlobalReview, NarrationOutline } from './services/frameNarrationPipeline'

export type FrameDebugStepId = FrameWorkflowStepId
export type FrameWorkflowEffect = 'network' | 'browser-media' | 'temp-upload' | 'mutates-project'
export type FrameDebugStepStatus = 'idle' | 'running' | 'success' | 'error' | 'skipped' | 'cancelled' | 'interrupted'

export interface FrameWorkflowContext {
  projectId: string
  // A PC task uses projectId only as its local OPFS/checkpoint namespace.
  // Set this to null to avoid sending a non-project identifier to the API.
  backendProjectId?: string | null
  files: File[]
  config: FrameInferenceConfig
  projectName?: string
  projectMetadata?: ProjectMetadata | null
  workflowRequestIdentity?: WorkflowRequestIdentity
}

export const getFrameWorkflowBackendProjectId = (
  context: Pick<FrameWorkflowContext, 'projectId' | 'backendProjectId'>
): string | undefined => (
  context.backendProjectId === undefined ? context.projectId : context.backendProjectId ?? undefined
)

export interface FrameQualityGateUsage {
  model?: string
  tokensConsumed?: number
  requestId?: string
}

export interface FrameQualityGateOutput<T> extends FrameQualityGateOutcome<T> {
  stage: FrameQualityGateStage
  usage: FrameQualityGateUsage
}

const finiteConfigNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const buildFrameWorkflowIntentSnapshot = (
  config: FrameInferenceConfig
): FrameWorkflowIntentSnapshot => {
  const selectionRatio = Math.min(1, Math.max(0.05, config.selectionRatio ?? 0.3))
  const narrationRatio = Math.min(1, Math.max(0, config.narrationRatio ?? 0.5))
  const originalRatio = config.originalRatio === undefined
    ? (1 - narrationRatio) * 100
    : Math.min(100, Math.max(0, finiteConfigNumber(config.originalRatio)))
  return {
    outputLanguage: config.outputLanguage?.trim() || '',
    narrationStyleId: config.narrationStyleId?.trim() || '',
    narrationStyleTitle: config.narrationStyleTitle?.trim() || '',
    outputDurationMs: Math.max(0, Math.round(finiteConfigNumber(config.outputDurationMs))),
    selectionRatio,
    narrationRatio,
    originalRatio,
    wordCount: Math.max(0, Math.round(finiteConfigNumber(config.wordCount))),
  }
}

export const summarizeFrameQualityGateUsage = <T>(
  attempts: FrameQualityGateAttempt<T>[]
): FrameQualityGateUsage => {
  const latest = attempts[attempts.length - 1]
  return {
    model: latest?.model,
    tokensConsumed: attempts.reduce((total, attempt) => total + (attempt.tokensConsumed ?? 0), 0),
    requestId: latest?.requestId,
  }
}

export const toFrameQualityGateOutput = <T>(
  stage: FrameQualityGateStage,
  outcome: FrameQualityGateOutcome<T>
): FrameQualityGateOutput<T> => ({
  ...outcome,
  stage,
  usage: summarizeFrameQualityGateUsage(outcome.attempts),
})

export const requireAcceptedFrameQualityGateOutput = <T>(
  output: FrameQualityGateOutput<T>,
  stepId: FrameDebugStepId,
): T => {
  if (output.status !== 'accepted' || output.acceptedOutput === undefined) {
    throw new Error(`质量闸门 ${stepId} 未产出可继续执行的结果`)
  }
  return output.acceptedOutput
}

export interface FrameDebugStepRecord<Input = unknown, Output = unknown> {
  id: FrameDebugStepId
  status: FrameDebugStepStatus
  input?: Input
  output?: Output
  outputSummary?: Record<string, unknown>
  progress?: Record<string, unknown>
  error?: string
  startedAt?: string
  completedAt?: string
  durationMs?: number
  logs?: string[]
}

export type FrameDebugStepRecords = Partial<Record<FrameDebugStepId, FrameDebugStepRecord>>

export interface FrameWorkflowRuntimeContext extends FrameWorkflowContext {
  records: FrameDebugStepRecords
  signal?: AbortSignal
  appendStepLog?: (stepId: FrameDebugStepId, log: string) => void
  updateStepLog?: (stepId: FrameDebugStepId, logPrefix: string, log: string) => void
  updateStepProgress?: (
    stepId: FrameDebugStepId,
    progress: Record<string, unknown>,
    outputSummary?: Record<string, unknown>
  ) => void
}

export interface FrameWorkflowStep<Input = unknown, Output = unknown> {
  id: FrameDebugStepId
  label: string
  description: string
  progressWeight?: number
  dependsOn: FrameDebugStepId[]
  effects: FrameWorkflowEffect[]
  frontendWork: string[]
  backendRoutes?: Array<{
    method: 'GET' | 'POST' | 'PUT'
    path: string
    handler: string
    purpose: string
  }>
  buildInput: (context: FrameWorkflowRuntimeContext) => Input
  run: (input: Input, context: FrameWorkflowRuntimeContext) => Promise<Output>
  summarizeOutput: (output: Output) => Record<string, unknown>
}

export interface MergeVideosOutput {
  file: File
  video: FrameInferencePipelineResult['mergedVideo']
  sourceVideoArtifact?: ProjectArtifact | null
}

export interface ExtractAudioOutput {
  file?: File
  audio: FrameInferencePipelineResult['extractedAudio']
}

export interface TranscribeOutput {
  transcription: ElevenLabsScribeResponse
  subtitleResult: FrameInferencePipelineResult['subtitleResult']
  subtitlePayload: ReturnType<typeof buildSubtitlePayload>
  initialVideoContext: ReturnType<typeof convertSubtitlesToVideoContext>
}

export interface ValidateSubtitlesOutput extends TranscribeOutput {
  validation: SubtitleValidationMetadata
}

export interface GenerateTimelineImagesOutput {
  images: Array<{
    decisionIndex: number
    decision: TimelineViewDecision
    nFrames: number
    file: File
    previewStorageKey?: string
    image: {
      name: string
      size: number
      type: string
    }
  }>
}

export interface MergeVideoContextOutput {
  videoContext: FrameInferencePipelineResult['videoContext']
  pipelineResult: FrameInferencePipelineResult
}

export type FrameNarrationModelProfile = 'flash' | 'pro'
export type FrameNarrationComplexityLevel = 'low' | 'medium' | 'high'

export interface FrameSelectionPlanSegment {
  event_id: string
  start: number
  end: number
  description: string
  priority: 'high' | 'medium' | 'low'
  quality: number
  dialogueDensity: number
}

export interface FrameSelectionPlanRawSegment {
  event_id: string
  start: number | null
  end: number | null
  description: string
  priority: 'high' | 'medium' | 'low'
}

export interface FrameSelectionPlanExclusion {
  event_id: string
  reason: string
}

export interface FrameNarrationModelRouting {
  initialProfile: FrameNarrationModelProfile
  finalProfile: FrameNarrationModelProfile
  complexityLevel: FrameNarrationComplexityLevel
  score: number
  reasons: string[]
  escalated: boolean
  metrics: {
    sourceDurationSeconds: number
    outputDurationSeconds: number
    characters: number
    relationships: number
    events: number
    conflicts: number
    openQuestions: number
    highPriorityDecisions: number
    evidenceWindows: number
    selectedSubtitleSegments: number
    qualityRefined: boolean
    evidenceComplete: boolean
  }
}

export interface FrameSelectionPlan {
  selectionRatio: number
  narrationRatio: number
  rawSegmentCount: number
  validSegmentCount: number
  excludedSegmentCount: number
  keepCount: number
  targetCharacters: number
  narrationCount: number
  originalCount: number
  narrationSeconds: number
  originalSeconds: number
  estimatedDurationMs: number
  openingEndingRanges: Array<{ start: number; end: number }>
  advertisementRanges: Array<{ start: number; end: number; type: 'advertisement' }>
  rawSegments: FrameSelectionPlanRawSegment[]
  validSegments: FrameSelectionPlanSegment[]
  selectedSegments: FrameSelectionPlanSegment[]
  narrationSegments: FrameSelectionPlanSegment[]
  originalSegments: FrameSelectionPlanSegment[]
  excludedSegments: FrameSelectionPlanExclusion[]
}

export interface GenerateNarrationScriptOutput {
  scriptResponse?: GenerateScriptResponse
  draftItems?: AnchoredNarrationDraftItem[]
  approvedDraftItems?: AnchoredNarrationDraftItem[]
  reviewRequired?: boolean
  modelRouting?: FrameNarrationModelRouting
  narrationPipeline?: {
    outline: NarrationOutline
    chapters: NarrationChapterResult[]
    globalReview: NarrationGlobalReview
    usage: TokenUsage
  }
  pipelineResult: FrameInferencePipelineResult & { selectionPlan?: FrameSelectionPlan }
}

export interface MatchNarrationVisualsOutput {
  scriptResponse: GenerateScriptResponse
  passthrough?: boolean
  pipelineResult: FrameInferencePipelineResult
}

export interface GenerateVoiceoverOutput {
  timelineReviewApproved?: boolean
  voiceoverResult: FrameVoiceoverResult
  pipelineResult: FrameInferencePipelineResult
}

export interface ComposeFinalVideoOutput extends ComposeFrameFinalVideoResult {
  pipelineResult: FrameInferencePipelineResult
}

export interface PersistProjectOutput {
  workflowResult: unknown
  projectResult: unknown
  writtenFields: string[]
  previewSaved?: boolean
}

export interface NarrativeQuestionAnswerPair {
  question: string
  answer: string
}

export type FrameWorkflowProjectFieldKey =
  | 'video_url'
  | 'subtitle'
  | 'video_context'
  | 'ai_analysis_script.frame_workflow'
  | 'ai_analysis_script.timeline_decision'
  | 'ai_analysis_script.timeline_analyses'
  | 'ai_analysis_script.narrative_understanding'
  | 'project_metadata'

export interface FrameDebugRun {
  id: string
  projectId: string
  mode: 'dry-run' | 'apply'
  status: 'idle' | 'running' | 'success' | 'error' | 'cancelled'
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  records: FrameDebugStepRecords
  startStepId?: FrameDebugStepId
  error?: string
  applied?: boolean
  persistedFields?: FrameWorkflowProjectFieldKey[]
  deletedFields?: FrameWorkflowProjectFieldKey[]
  workflowRunId?: string
  workflowInputHash?: string
  finalResultReadyAt?: string
  billingStatus?: 'pending' | 'confirmed' | 'released'
}

export interface RunFrameWorkflowOptions {
  context: FrameWorkflowContext
  existingRun?: FrameDebugRun | null
  startStepId?: FrameDebugStepId
  editedInputs?: Partial<Record<FrameDebugStepId, unknown>>
  mode?: 'dry-run' | 'apply'
  steps?: FrameWorkflowStep[]
  now?: () => Date
  signal?: AbortSignal
  onRunUpdate?: (run: FrameDebugRun) => void
  runUpdateThrottleMs?: number
}

export interface FrameWorkflowProjectSnapshot {
  projectName?: string
  aiAnalysisScript?: Record<string, unknown> | null
  projectMetadata?: ProjectMetadata | null
}
