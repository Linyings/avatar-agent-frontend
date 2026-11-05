import type { FrameInferenceAnalysisItem } from '@/features/projects/services/material/frameInferencePipelineService'
import type { TimelineViewDecision } from '@/shared/services/aiToolsService'
import type { MergeVideoContextOutput } from '../types'
import type { FrameDurationContract } from './frameDurationContract'

type SubtitleSegment = MergeVideoContextOutput['pipelineResult']['subtitleResult']['segments'][number]

interface NarrativeEventIndexItem {
  event_id?: string
  start?: number
  end?: number
  type?: string
  description: string
  importance?: string
  participants: string[]
  evidence: string[]
}

interface EvidenceCandidate {
  start: number
  end: number
  center: number
  score: number
  label: string
}

interface EvidenceRange {
  start: number
  end: number
}

export interface FrameNarrationLayeredContext {
  videoContext: {
    context_schema: 'frame_narration_dynamic_context_v1'
    narrative_context: unknown
    narrative_updated_at?: unknown
  }
  cacheContext: {
    cache_schema: 'frame_narration_layered_context_v1'
    language: string
    context_strategy: {
      selection: 'duration_budgeted_evidence'
      target_output_duration_ms: number
      source_duration_seconds: number
      evidence_budget_seconds: number
      requested_window_count: number
      selected_window_count: number
      full_subtitle_segments: number
      selected_subtitle_segments: number
      coverage_anchor_count: number
      global_narrative_location: 'video_context.narrative_context'
      raw_story_event_count?: number
      context_story_event_count?: number
      excluded_story_event_count?: number
    }
    story_event_index: NarrativeEventIndexItem[]
    evidence_windows: Array<{
      id: string
      start: number
      end: number
      focus: string[]
      narrative_events: NarrativeEventIndexItem[]
      decisions: Array<{
        start: number
        end: number
        priority: string
        trigger_type: string
        reason: string
        expected_question?: string
      }>
      visual_evidence: Array<{
        start: number
        end: number
        summary: string
      }>
      subtitles: Array<{
        start: number
        end: number
        text: string
        speaker_id?: number | string
      }>
    }>
    coverage_anchors: Array<{
      start: number
      end: number
      text: string
      speaker_id?: number | string
    }>
  }
}

const MIN_WINDOWS = 6
const MAX_WINDOWS = 32
const OUTPUT_SECONDS_PER_WINDOW = 30
const EVIDENCE_MULTIPLIER = 2
const MIN_WINDOW_SECONDS = 20

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
)

const finiteNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
)

const stringList = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.map(item => textValue(item)).filter(Boolean)
    : []
)

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.min(maximum, Math.max(minimum, value))
)

const overlaps = (start: number, end: number, range: EvidenceRange): boolean => (
  end > range.start && start < range.end
)

const priorityScore = (priority: unknown): number => {
  switch (textValue(priority).toLowerCase()) {
    case 'high':
      return 90
    case 'medium':
      return 60
    case 'low':
      return 30
    default:
      return 45
  }
}

const eventScore = (importance: unknown): number => {
  switch (textValue(importance).toLowerCase()) {
    case 'high':
      return 110
    case 'medium':
      return 80
    case 'low':
      return 50
    default:
      return 70
  }
}

const rawNarrativeEvents = (merged: MergeVideoContextOutput): unknown[] => {
  const analysis = asRecord(merged.pipelineResult.narrativeUnderstanding?.analysis) ?? {}
  return Array.isArray(analysis.events)
    ? analysis.events
    : merged.pipelineResult.narrativeUnderstanding?.events ?? []
}

const narrativeEvents = (rawEvents: unknown[]): NarrativeEventIndexItem[] => {
  return rawEvents
    .map((value) => {
      const event = asRecord(value)
      if (!event) return null
      const description = textValue(event.description ?? event.summary ?? event.event)
      if (!description) return null
      const start = finiteNumber(event.start)
      const end = finiteNumber(event.end)
      return {
        ...(textValue(event.event_id ?? event.id) ? { event_id: textValue(event.event_id ?? event.id) } : {}),
        ...(start !== null ? { start } : {}),
        ...(end !== null ? { end } : {}),
        ...(textValue(event.type) ? { type: textValue(event.type) } : {}),
        description,
        ...(textValue(event.importance) ? { importance: textValue(event.importance) } : {}),
        participants: stringList(event.participants),
        evidence: stringList(event.evidence),
      } satisfies NarrativeEventIndexItem
    })
    .filter((event): event is NarrativeEventIndexItem => event !== null)
}

const sourceDuration = (
  merged: MergeVideoContextOutput,
  events: NarrativeEventIndexItem[],
): number => {
  const segments = merged.pipelineResult.subtitleResult.segments
  const decisions = merged.pipelineResult.decision.decisions
  const candidates = [
    merged.pipelineResult.subtitleResult.totalDuration,
    merged.pipelineResult.transcription.duration,
    merged.pipelineResult.mergedVideo?.duration,
    ...segments.map(segment => segment.endTime),
    ...decisions.map(decision => decision.end),
    ...events.map(event => event.end ?? 0),
  ].map(value => finiteNumber(value) ?? 0)
  return Math.max(1, ...candidates)
}

const candidateFromRange = (
  startValue: unknown,
  endValue: unknown,
  score: number,
  label: string,
): EvidenceCandidate | null => {
  const start = finiteNumber(startValue)
  const end = finiteNumber(endValue)
  if (start === null || end === null || end <= start) return null
  return { start, end, center: start + ((end - start) / 2), score, label }
}

const evidenceCandidates = (
  events: NarrativeEventIndexItem[],
  decisions: TimelineViewDecision[],
  analyses: FrameInferenceAnalysisItem[],
): EvidenceCandidate[] => {
  const candidates: EvidenceCandidate[] = []
  events.forEach((event) => {
    const candidate = candidateFromRange(
      event.start,
      event.end,
      eventScore(event.importance),
      event.description,
    )
    if (candidate) candidates.push(candidate)
  })
  analyses.forEach((analysis) => {
    const summary = textValue(analysis.response.analysis?.summary) || textValue(analysis.response.content)
    const candidate = candidateFromRange(
      analysis.decision.start,
      analysis.decision.end,
      priorityScore(analysis.decision.priority) + 10,
      summary || analysis.decision.reason,
    )
    if (candidate) candidates.push(candidate)
  })
  decisions.forEach((decision) => {
    const candidate = candidateFromRange(
      decision.start,
      decision.end,
      priorityScore(decision.priority),
      decision.reason,
    )
    if (candidate) candidates.push(candidate)
  })
  return candidates
}

const mergeRanges = (ranges: EvidenceRange[]): EvidenceRange[] => {
  const sorted = [...ranges].sort((left, right) => left.start - right.start)
  const merged: EvidenceRange[] = []
  sorted.forEach((range) => {
    const previous = merged[merged.length - 1]
    if (!previous || range.start > previous.end + 1) {
      merged.push({ ...range })
      return
    }
    previous.end = Math.max(previous.end, range.end)
  })
  return merged
}

const selectEvidenceRanges = (
  durationSeconds: number,
  contract: FrameDurationContract,
  candidates: EvidenceCandidate[],
) => {
  const targetOutputSeconds = contract.targetDurationMs / 1_000
  const requestedWindowCount = clamp(
    Math.round(targetOutputSeconds / OUTPUT_SECONDS_PER_WINDOW),
    MIN_WINDOWS,
    MAX_WINDOWS,
  )
  const windowCount = Math.min(
    requestedWindowCount,
    Math.max(1, Math.ceil(durationSeconds / MIN_WINDOW_SECONDS)),
  )
  const evidenceBudgetSeconds = Math.min(
    durationSeconds,
    Math.max(targetOutputSeconds * EVIDENCE_MULTIPLIER, windowCount * MIN_WINDOW_SECONDS),
  )
  const windowSeconds = evidenceBudgetSeconds / windowCount
  const bucketSeconds = durationSeconds / windowCount
  const ranges: EvidenceRange[] = []

  for (let index = 0; index < windowCount; index += 1) {
    const bucketStart = bucketSeconds * index
    const bucketEnd = index === windowCount - 1 ? durationSeconds : bucketSeconds * (index + 1)
    const candidate = candidates
      .filter(item => item.center >= bucketStart && item.center <= bucketEnd)
      .sort((left, right) => right.score - left.score || left.center - right.center)[0]
    const center = candidate?.center ?? bucketStart + ((bucketEnd - bucketStart) / 2)
    let start = Math.max(0, center - (windowSeconds / 2))
    let end = Math.min(durationSeconds, start + windowSeconds)
    start = Math.max(0, end - windowSeconds)
    ranges.push({ start, end })
  }

  return {
    requestedWindowCount,
    evidenceBudgetSeconds,
    ranges: mergeRanges(ranges),
  }
}

const subtitlePayload = (segment: SubtitleSegment) => ({
  start: segment.startTime,
  end: segment.endTime,
  text: segment.text,
  ...(segment.speakerId !== undefined ? { speaker_id: segment.speakerId } : {}),
})

const decisionPayload = (decision: TimelineViewDecision) => ({
  start: decision.start,
  end: decision.end,
  priority: decision.priority,
  trigger_type: decision.trigger_type,
  reason: decision.reason,
  ...(decision.expected_question ? { expected_question: decision.expected_question } : {}),
})

const coverageAnchors = (
  segments: SubtitleSegment[],
  durationSeconds: number,
  requestedWindowCount: number,
) => {
  if (segments.length === 0) return []
  const anchors = new Map<string, SubtitleSegment>()
  for (let index = 0; index <= requestedWindowCount; index += 1) {
    const position = durationSeconds * (index / requestedWindowCount)
    const nearest = segments.reduce((best, segment) => {
      const center = segment.startTime + ((segment.endTime - segment.startTime) / 2)
      const distance = Math.abs(center - position)
      return !best || distance < best.distance ? { segment, distance } : best
    }, null as { segment: SubtitleSegment; distance: number } | null)
    if (nearest) anchors.set(nearest.segment.id, nearest.segment)
  }
  return [...anchors.values()]
    .sort((left, right) => left.startTime - right.startTime)
    .map(subtitlePayload)
}

export const buildFrameNarrationLayeredContext = (
  merged: MergeVideoContextOutput,
  contract: FrameDurationContract,
  language?: string | null,
): FrameNarrationLayeredContext => {
  const rawEvents = rawNarrativeEvents(merged)
  const events = narrativeEvents(rawEvents)
  const durationSeconds = sourceDuration(merged, events)
  const decisions = merged.pipelineResult.decision.decisions
  const analyses = merged.pipelineResult.analyses
  const candidates = evidenceCandidates(events, decisions, analyses)
  const selection = selectEvidenceRanges(durationSeconds, contract, candidates)
  const segments = merged.pipelineResult.subtitleResult.segments
  const selectedSegmentIds = new Set<string>()

  const evidenceWindows = selection.ranges.map((range, index) => {
    const subtitles = segments
      .filter(segment => overlaps(segment.startTime, segment.endTime, range))
      .map((segment) => {
        selectedSegmentIds.add(segment.id)
        return subtitlePayload(segment)
      })
    const windowCandidates = candidates.filter(candidate => overlaps(candidate.start, candidate.end, range))
    return {
      id: `evidence-${String(index + 1).padStart(2, '0')}`,
      start: Number(range.start.toFixed(3)),
      end: Number(range.end.toFixed(3)),
      focus: [...new Set(windowCandidates
        .sort((left, right) => right.score - left.score)
        .map(candidate => candidate.label)
        .filter(Boolean))].slice(0, 5),
      narrative_events: events.filter(event => (
        event.start !== undefined
        && event.end !== undefined
        && overlaps(event.start, event.end, range)
      )),
      decisions: decisions
        .filter(decision => overlaps(decision.start, decision.end, range))
        .map(decisionPayload),
      visual_evidence: analyses
        .filter(analysis => overlaps(analysis.decision.start, analysis.decision.end, range))
        .map(analysis => ({
          start: analysis.decision.start,
          end: analysis.decision.end,
          summary: textValue(analysis.response.analysis?.summary) || textValue(analysis.response.content),
        }))
        .filter(item => item.summary),
      subtitles,
    }
  })

  const sourceVideoContext = merged.videoContext as typeof merged.videoContext & {
    narrative_context?: unknown
    narrative_updated_at?: unknown
  }
  const narrativeContext = sourceVideoContext.narrative_context
    ?? merged.pipelineResult.narrativeUnderstanding.analysis

  const anchors = coverageAnchors(segments, durationSeconds, selection.requestedWindowCount)
  return {
    videoContext: {
      context_schema: 'frame_narration_dynamic_context_v1',
      narrative_context: narrativeContext,
      ...(sourceVideoContext.narrative_updated_at !== undefined
        ? { narrative_updated_at: sourceVideoContext.narrative_updated_at }
        : {}),
    },
    cacheContext: {
      cache_schema: 'frame_narration_layered_context_v1',
      language: language || merged.pipelineResult.subtitleResult.language || '',
      context_strategy: {
        selection: 'duration_budgeted_evidence',
        target_output_duration_ms: contract.targetDurationMs,
        source_duration_seconds: Number(durationSeconds.toFixed(3)),
        evidence_budget_seconds: Number(selection.evidenceBudgetSeconds.toFixed(3)),
        requested_window_count: selection.requestedWindowCount,
        selected_window_count: evidenceWindows.length,
        full_subtitle_segments: segments.length,
        selected_subtitle_segments: selectedSegmentIds.size,
        coverage_anchor_count: anchors.length,
        global_narrative_location: 'video_context.narrative_context',
        raw_story_event_count: rawEvents.length,
        context_story_event_count: events.length,
        excluded_story_event_count: rawEvents.length - events.length,
      },
      story_event_index: events,
      evidence_windows: evidenceWindows,
      coverage_anchors: anchors,
    },
  }
}

export const buildFrameNarrationLayeredContextPrompt = (
  context: FrameNarrationLayeredContext,
): string => {
  const strategy = context.cacheContext.context_strategy
  return [
    '## Layered source context contract (high priority)',
    '- Use video_context.narrative_context as the global story map for characters, relationships, chronology, conflicts, and emotional turns.',
    '- Use story_event_index as the complete set of events selected for narration. Cover only the strongest events that fit the user character budget; do not restore omitted events.',
    '- Treat evidence_windows as the exact subtitle and visual evidence for concrete wording. Never invent a detail that is absent from the global story map or evidence windows.',
    '- Use coverage_anchors only to preserve transitions around selected events; they do not require full-source coverage.',
    '- Omitted raw subtitles are intentionally outside the evidence budget. Do not infer dialogue or visual details from an omission.',
    `- The source is ${strategy.source_duration_seconds.toFixed(1)} seconds; ${strategy.selected_subtitle_segments}/${strategy.full_subtitle_segments} exact subtitle segments were selected across ${strategy.selected_window_count} evidence windows for a ${Math.round(strategy.target_output_duration_ms / 1_000)}-second output.`,
  ].join('\n')
}
