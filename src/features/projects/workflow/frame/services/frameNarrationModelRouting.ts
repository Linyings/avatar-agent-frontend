import type { NarrativeUnderstandingResponse } from '@/shared/services/aiToolsService'
import type {
  FrameNarrationModelRouting,
  FrameQualityGateOutput,
  MergeVideoContextOutput,
} from '../types'
import type { FrameNarrationLayeredContext } from './frameNarrationContext'

const arrayLength = (value: unknown): number => Array.isArray(value) ? value.length : 0

const narrativeArrayLength = (
  narrative: NarrativeUnderstandingResponse,
  key: 'characters' | 'relationships' | 'events' | 'conflicts' | 'open_questions',
): number => {
  const analysisValue = narrative.analysis?.[key]
  if (Array.isArray(analysisValue)) return analysisValue.length
  return arrayLength(narrative[key as keyof NarrativeUnderstandingResponse])
}

const addThresholdScore = (
  value: number,
  mediumThreshold: number,
  highThreshold: number,
): number => {
  if (value > highThreshold) return 20
  if (value > mediumThreshold) return 10
  return 0
}

export const assessFrameNarrationModelRouting = (
  merged: MergeVideoContextOutput,
  narrativeGate: FrameQualityGateOutput<NarrativeUnderstandingResponse> | undefined,
  layeredContext: FrameNarrationLayeredContext,
): FrameNarrationModelRouting => {
  const narrative = merged.pipelineResult.narrativeUnderstanding
  const strategy = layeredContext.cacheContext.context_strategy
  const characters = narrativeArrayLength(narrative, 'characters')
  const relationships = narrativeArrayLength(narrative, 'relationships')
  const events = narrativeArrayLength(narrative, 'events')
  const conflicts = narrativeArrayLength(narrative, 'conflicts')
  const openQuestions = narrativeArrayLength(narrative, 'open_questions')
  const highPriorityDecisions = merged.pipelineResult.decision.decisions
    .filter(decision => decision.priority === 'high').length
  const qualityRefined = Boolean(narrativeGate?.attempts.some(attempt => attempt.kind === 'refine'))
  const summary = typeof narrative.analysis?.summary === 'string'
    ? narrative.analysis.summary.trim()
    : ''
  const evidenceComplete = Boolean(
    narrative.success
    && summary
    && characters > 0
    && events > 0
    && strategy.selected_window_count > 0
    && strategy.selected_subtitle_segments > 0
    && layeredContext.cacheContext.story_event_index.length > 0
  )

  let score = 0
  const reasons: string[] = []
  const forceProReasons: string[] = []

  const scoredSignals: Array<[number, string]> = [
    [addThresholdScore(characters, 3, 6), `${characters} characters`],
    [addThresholdScore(relationships, 3, 6), `${relationships} relationships`],
    [addThresholdScore(events, 7, 12), `${events} story events`],
    [addThresholdScore(conflicts, 0, 3), `${conflicts} conflicts`],
    [addThresholdScore(highPriorityDecisions, 3, 6), `${highPriorityDecisions} high-priority visual decisions`],
    [addThresholdScore(strategy.selected_subtitle_segments, 80, 160), `${strategy.selected_subtitle_segments} evidence subtitles`],
  ]
  scoredSignals.forEach(([points, reason]) => {
    if (points > 0) {
      score += points
      reasons.push(`${reason} (+${points})`)
    }
  })

  if (strategy.source_duration_seconds > 1_800) {
    score += strategy.source_duration_seconds > 3_600 ? 10 : 5
    reasons.push(`long source ${Math.round(strategy.source_duration_seconds)}s`)
  }
  if (strategy.target_output_duration_ms > 300_000) {
    forceProReasons.push(`long output ${Math.round(strategy.target_output_duration_ms / 1_000)}s`)
  }
  if (!narrativeGate || narrativeGate.status !== 'accepted') {
    forceProReasons.push('narrative quality gate is unavailable or not accepted')
  }
  if (qualityRefined) {
    forceProReasons.push('narrative understanding required refinement')
  }
  if (openQuestions > 0) {
    forceProReasons.push(`${openQuestions} unresolved narrative questions`)
  }
  if (!evidenceComplete) {
    forceProReasons.push('narrative or evidence context is incomplete')
  }

  reasons.push(...forceProReasons)
  const complexityLevel = forceProReasons.length > 0 || score >= 50
    ? 'high'
    : score >= 30
      ? 'medium'
      : 'low'
  const initialProfile = complexityLevel === 'low' ? 'flash' : 'pro'

  return {
    initialProfile,
    finalProfile: initialProfile,
    complexityLevel,
    score,
    reasons: reasons.length > 0 ? reasons : ['complete evidence with low relationship and timeline complexity'],
    escalated: false,
    metrics: {
      sourceDurationSeconds: strategy.source_duration_seconds,
      outputDurationSeconds: strategy.target_output_duration_ms / 1_000,
      characters,
      relationships,
      events,
      conflicts,
      openQuestions,
      highPriorityDecisions,
      evidenceWindows: strategy.selected_window_count,
      selectedSubtitleSegments: strategy.selected_subtitle_segments,
      qualityRefined,
      evidenceComplete,
    },
  }
}
