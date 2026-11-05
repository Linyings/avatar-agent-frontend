import type { FrameDebugStepId, FrameWorkflowStep } from './types'
import { step1MergeVideos } from './steps/step_1_merge_videos'
import { step2ExtractAudio } from './steps/step_2_extract_audio'
import { step3Transcribe } from './steps/step_3_transcribe'
import { step4ValidateSubtitles } from './steps/step_4_validate_subtitles'
import { step5DecideTimelineView } from './steps/step_5_decide_timeline_view'
import { step6GenerateTimelineImages } from './steps/step_6_generate_timeline_images'
import { step7AnalyzeTimelineImages } from './steps/step_7_analyze_timeline_images'
import { step8UnderstandNarrative } from './steps/step_8_understand_narrative'
import { step9MergeVideoContext } from './steps/step_9_merge_video_context'
import { step10GenerateNarrationScript } from './steps/step_10_generate_narration_script'
import { step11MatchNarrationVisuals } from './steps/step_11_match_narration_visuals'
import { step11GenerateVoiceover } from './steps/step_11_generate_voiceover'
import { step12ComposeFinalVideo } from './steps/step_12_compose_final_video'
import { step13PersistProject } from './steps/step_13_persist_project'

export const frameWorkflowSteps: FrameWorkflowStep[] = [
  step1MergeVideos,
  step2ExtractAudio,
  step3Transcribe,
  step4ValidateSubtitles,
  step5DecideTimelineView,
  step6GenerateTimelineImages,
  step7AnalyzeTimelineImages,
  step8UnderstandNarrative,
  step9MergeVideoContext,
  step10GenerateNarrationScript,
  step11MatchNarrationVisuals,
  step11GenerateVoiceover,
  step12ComposeFinalVideo,
  step13PersistProject,
]

export const frameWorkflowStepIds = frameWorkflowSteps.map((step) => step.id)

export const getFrameWorkflowStep = (stepId: FrameDebugStepId) => {
  const step = frameWorkflowSteps.find((item) => item.id === stepId)
  if (!step) throw new Error(`未知通用模式调试步骤: ${stepId}`)
  return step
}
