import { FRAME_INFERENCE_DEFAULT_N_FRAMES, resolveFrameInferenceMaxDecisions, type FrameInferenceConfig } from '@/features/projects/services/material/frameInferencePipelineService'
import type { FrameWorkflowStepKey } from '@/features/projects/types/project'
import type { FrameDebugStepId } from './types'

export const frameStepKeyById: Record<FrameDebugStepId, FrameWorkflowStepKey> = {
  'merge-videos': 'step_1_merge_videos',
  'extract-audio': 'step_2_extract_audio',
  transcribe: 'step_3_transcribe',
  'validate-subtitles': 'step_4_validate_subtitles',
  'decide-timeline-view': 'step_5_decide_timeline_view',
  'generate-timeline-images': 'step_6_generate_timeline_images',
  'analyze-timeline-images': 'step_7_analyze_timeline_images',
  'understand-narrative': 'step_8_understand_narrative',
  'merge-video-context': 'step_9_merge_video_context',
  'generate-narration-script': 'step_10_generate_narration_script',
  'match-narration-visuals': 'step_10_match_narration_visuals',
  'generate-voiceover': 'step_11_generate_voiceover',
  'compose-final-video': 'step_12_compose_final_video',
  'persist-project': 'step_13_persist_project',
}

export const makeFrameConfigMetadata = (config: FrameInferenceConfig, _sourceDurationSeconds?: number | null) => ({
  output_language: config.outputLanguage,
  selection_ratio: config.selectionRatio ?? 0.3,
  output_duration_ms: config.outputDurationMs ?? null,
  narration_ratio: config.narrationRatio ?? 0.5,
  original_ratio: config.originalRatio ?? 50,
  default_n_frames: FRAME_INFERENCE_DEFAULT_N_FRAMES,
  max_decisions: resolveFrameInferenceMaxDecisions(config.outputDurationMs),
  decision_prompt: config.decisionPrompt ?? null,
  analysis_prompt: config.analysisPrompt ?? null,
  narration_style_id: config.narrationStyleId ?? null,
  narration_style_title: config.narrationStyleTitle ?? null,
  word_count: config.wordCount ?? null,
  person_view: config.personView ?? 'third_person',
  clip_mode: config.clipMode ?? 'smart_mix',
  voice: config.voice ?? null,
  voice_name: config.voiceName ?? null,
  background_music: config.backgroundMusic ?? null,
  background_music_id: config.backgroundMusicId ?? null,
  background_music_url: config.backgroundMusicUrl ?? null,
  review_narration_script: Boolean(config.reviewNarrationScript),
})
