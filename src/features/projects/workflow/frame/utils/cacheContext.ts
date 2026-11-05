import type { FrameInferenceAnalysisItem, FrameInferencePipelineResult } from '@/features/projects/services/material/frameInferencePipelineService'
import type { ValidateSubtitlesOutput } from '../types'

interface BuildFrameWorkflowCacheContextInput {
  transcription: ValidateSubtitlesOutput['transcription']
  subtitleResult: ValidateSubtitlesOutput['subtitleResult']
  decision: FrameInferencePipelineResult['decision']
  analyses: FrameInferenceAnalysisItem[]
  language?: string | null
}

export const buildFrameWorkflowCacheContext = ({
  transcription,
  subtitleResult,
  decision,
  analyses,
  language,
}: BuildFrameWorkflowCacheContextInput) => ({
  cache_schema: 'frame_workflow_shared_context_v2',
  language: language || transcription.language_code || subtitleResult.language || '',
  subtitle_timeline: buildSubtitleTimeline(subtitleResult.segments)
    || transcription.packed_transcript
    || transcription.text_content,
  decisions: decision.decisions.map((item) => ({
    start: item.start,
    end: item.end,
    priority: item.priority,
    trigger_type: item.trigger_type,
    reason: item.reason,
    expected_question: item.expected_question,
    n_frames: item.n_frames,
  })),
  visual_analyses: analyses.map((item) => ({
    start: item.decision.start,
    end: item.decision.end,
    priority: item.decision.priority,
    trigger_type: item.decision.trigger_type,
    reason: item.decision.reason,
    summary: item.response.analysis?.summary ?? item.response.content,
    visual_events: item.response.analysis?.visual_events,
    concerns: item.response.analysis?.concerns,
    recommendations: item.response.analysis?.recommendations,
  })),
})

const buildSubtitleTimeline = (segments: BuildFrameWorkflowCacheContextInput['subtitleResult']['segments']) => (
  segments
    .map((segment) => {
      const speaker = segment.speakerId !== undefined && segment.speakerId !== null && String(segment.speakerId).trim() !== ''
        ? ` ${segment.speakerId}:`
        : ''
      return `[${segment.startTime.toFixed(2)}-${segment.endTime.toFixed(2)}]${speaker} ${segment.text}`
    })
    .join('\n')
)
