import { makeFrameConfigMetadata } from '../constants'
import type {
  ComposeFinalVideoOutput,
  FrameWorkflowRuntimeContext,
  FrameWorkflowStep,
  ExtractAudioOutput,
  GenerateNarrationScriptOutput,
  GenerateTimelineImagesOutput,
  GenerateVoiceoverOutput,
  MatchNarrationVisualsOutput,
  MergeVideoContextOutput,
  MergeVideosOutput,
  TranscribeOutput,
  ValidateSubtitlesOutput,
} from '../types'
import type { FrameInferencePipelineResult } from '@/features/projects/services/material/frameInferencePipelineService'
import type { ProjectWorkflow } from '@/features/projects/types/project'

type StagePatch = Partial<ProjectWorkflow['stages']>

const buildAiAnalysisScript = (pipelineResult: FrameInferencePipelineResult) => {
  const items = pipelineResult.voiceoverResult?.items ?? pipelineResult.scriptResponse?.items
  const audioStates = pipelineResult.voiceoverResult?.audioStates
  return {
    frame_workflow: pipelineResult,
    timeline_decision: pipelineResult.decision,
    timeline_analyses: pipelineResult.analyses,
    narrative_understanding: pipelineResult.narrativeUnderstanding,
    ...(items ? { items } : {}),
    ...(audioStates ? { audioStates } : {}),
    ...(pipelineResult.narrationDraftItems ? { narration_draft: pipelineResult.narrationDraftItems } : {}),
    ...(pipelineResult.approvedNarrationDraftItems ? { approved_narration_draft: pipelineResult.approvedNarrationDraftItems } : {}),
  }
}

export const buildFrameWorkflowStagePatch = (
  step: FrameWorkflowStep,
  output: unknown,
  context: FrameWorkflowRuntimeContext
): StagePatch => {
  switch (step.id) {
    case 'merge-videos': {
      const typed = output as MergeVideosOutput
      return {
        source_video: {
          data: {
            merged_video: typed.video,
            source_video_artifact: typed.sourceVideoArtifact ?? null,
          },
        },
        config: {
          data: makeFrameConfigMetadata(context.config, typed.video.duration),
        },
      }
    }
    case 'extract-audio': {
      const typed = output as ExtractAudioOutput
      return {
        source_video: {
          data: {
            extracted_audio: typed.audio,
          },
        },
      }
    }
    case 'transcribe': {
      const typed = output as TranscribeOutput
      return {
        subtitles: {
          data: typed.subtitlePayload,
          subtitle_result: typed.subtitleResult,
          transcription: typed.transcription,
        },
        source_video: {
          data: {
            video_context: typed.initialVideoContext,
          },
        },
      }
    }
    case 'validate-subtitles': {
      const typed = output as ValidateSubtitlesOutput
      return {
        subtitles: {
          data: typed.subtitlePayload,
          subtitle_result: typed.subtitleResult,
          transcription: typed.transcription,
          validation: typed.validation,
        },
        source_video: {
          data: {
            video_context: typed.initialVideoContext,
          },
        },
      }
    }
    case 'merge-video-context': {
      const typed = output as MergeVideoContextOutput
      return {
        source_video: {
          data: {
            merged_video: typed.pipelineResult.mergedVideo,
            video_context: typed.videoContext,
          },
        },
        script: {
          data: {
            ai_analysis_script: buildAiAnalysisScript(typed.pipelineResult),
          },
        },
      }
    }
    case 'decide-timeline-view':
      return {
        script: {
          data: {
            timeline_decision: output,
          },
        },
      }
    case 'generate-timeline-images': {
      const typed = output as GenerateTimelineImagesOutput
      return {
        source_video: {
          data: {
            timeline_images: typed.images,
          },
        },
      }
    }
    case 'analyze-timeline-images':
      return {
        script: {
          data: {
            timeline_analyses: (output as { analyses?: unknown }).analyses ?? [],
          },
        },
      }
    case 'understand-narrative':
      return {
        script: {
          data: {
            narrative_understanding: output,
          },
        },
      }
    case 'generate-narration-script': {
      const typed = output as GenerateNarrationScriptOutput
      return {
        script: {
          data: {
            ai_analysis_script: buildAiAnalysisScript(typed.pipelineResult),
          },
        },
      }
    }
    case 'match-narration-visuals': {
      const typed = output as MatchNarrationVisualsOutput
      return {
        script: {
          data: {
            ai_analysis_script: buildAiAnalysisScript(typed.pipelineResult),
          },
        },
      }
    }
    case 'generate-voiceover': {
      const typed = output as GenerateVoiceoverOutput
      return {
        script: {
          data: {
            ai_analysis_script: buildAiAnalysisScript(typed.pipelineResult),
          },
        },
        voiceover: {
          data: typed.voiceoverResult,
        },
      }
    }
    case 'compose-final-video': {
      const typed = output as ComposeFinalVideoOutput
      return {
        script: {
          data: {
            ai_analysis_script: buildAiAnalysisScript(typed.pipelineResult),
          },
        },
        voiceover: {
          data: typed.pipelineResult.voiceoverResult ?? null,
        },
        final_video: {
          data: typed.pipelineResult.finalVideoResult ?? typed.finalVideo ?? null,
        },
      }
    }
    default:
      return {}
  }
}
