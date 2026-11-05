import type { AnchoredNarrationDraftItem, NarrationDraftItem, NarrationRepairPatch } from '@/features/projects/services/scriptGenerationServiceV2'
import type { MergeVideoContextOutput } from '../types'
import type { FrameDurationContract } from './frameDurationContract'
import type { FrameNarrationLayeredContext } from './frameNarrationContext'
import { isAdvertisementStoryEvent } from './frameSegmentSelector'

const MIN_CHARACTERS_PER_NARRATION_CHAPTER = 200
export interface NarrationChapterPlan {
  chapter_id: string
  start: number
  end: number
  target_characters: number
  objective: string
  opening_bridge: string
  closing_hook: string
  event_ids: string[]
  characters: string[]
  retrieval_keywords: string[]
}

export const buildNarrationChapterVideoConfig = <Config extends Record<string, unknown>>(
  videoConfig: Config,
  chapter: Pick<NarrationChapterPlan, 'target_characters'>,
): Config & { word_count: string } => ({
  ...videoConfig,
  word_count: String(chapter.target_characters),
})
export const buildNarrationChapterGenerationConstraints = (
  chapter: Pick<NarrationChapterPlan, 'target_characters'>,
  options: { guardBand?: boolean; strictFinalRetry?: boolean; itemCount?: number } = {},
) => {
  const acceptedTarget = Math.max(1, Math.round(chapter.target_characters))
  const minimum = Math.max(1, Math.round(acceptedTarget * 0.7))
  const acceptedMaximum = Math.max(1, Math.round(acceptedTarget * 1.3))
  const target = options.strictFinalRetry
    ? acceptedTarget
    : options.guardBand
    ? Math.max(minimum, Math.round(acceptedTarget * 0.85))
    : acceptedTarget
  const maximum = options.strictFinalRetry
    ? acceptedMaximum
    : options.guardBand
    ? Math.max(target, Math.floor(acceptedMaximum * 0.9))
    : acceptedMaximum
  const requiredItemCount = Math.max(1, Math.round(options.itemCount ?? (acceptedTarget >= 300 ? 3 : 2)))
  return {
    minimum, target, maximum,
    required_item_count: requiredItemCount,
    per_item_target_characters: Math.floor(target / requiredItemCount),
    per_item_maximum_characters: Math.floor(maximum / requiredItemCount),
    ...(options.strictFinalRetry ? { strict_final_retry: true } : {}),
  }
}

export const buildNarrationHumanizerCharacterRange = (
  chapter: Pick<NarrationChapterPlan, 'target_characters'>,
  itemCount: number,
  recoveryMode = false,
) => {
  const acceptedTarget = Math.max(1, Math.round(chapter.target_characters))
  const minimum = Math.max(1, Math.round(acceptedTarget * 0.7))
  const target = recoveryMode ? Math.max(minimum, Math.round(acceptedTarget * 0.8)) : acceptedTarget
  const maximum = recoveryMode
    ? Math.max(target, Math.round(acceptedTarget * 1.05))
    : Math.max(target, Math.round(acceptedTarget * 1.3))
  const safeItemCount = Math.max(1, Math.round(itemCount))
  return {
    minimum, target, maximum,
    per_item_maximum_characters: Math.floor(maximum / safeItemCount),
  }
}

export const balanceNarrationChapterTargets = (
  outline: NarrationOutline,
  contract: FrameDurationContract,
): NarrationOutline => {
  if (outline.chapters.length <= 1) return outline
  const desiredTotal = Math.min(
    contract.maxCharacters,
    Math.max(contract.targetCharacters, outline.chapters.length * MIN_CHARACTERS_PER_NARRATION_CHAPTER),
  )
  const baseTarget = Math.floor(desiredTotal / outline.chapters.length)
  const remainder = desiredTotal - (baseTarget * outline.chapters.length)
  return {
    ...outline,
    chapters: outline.chapters.map((chapter, index) => ({
      ...chapter,

      target_characters: baseTarget + (index < remainder ? 1 : 0),
    })),
  }
}
export interface NarrationOutline {
  summary: string
  chapters: NarrationChapterPlan[]
}
export interface NarrationOutlineCorrection {
  previous_outline: unknown
  validation_feedback: string
}


export interface NarrationEvidenceItem {
  evidence_id: string
  kind: 'subtitle' | 'visual' | 'event'
  start: number
  end: number
  text: string
  speaker_id?: number | string
}

export interface NarrationChapterEvidence {
  chapter_id: string
  exact: NarrationEvidenceItem[]
  adjacent: NarrationEvidenceItem[]
  callbacks: NarrationEvidenceItem[]
  evidence_gaps: string[]
}

export interface NarrationRollingMemory {
  previous_summary: string
  covered_event_ids: string[]
  character_state: string[]
  unresolved_threads: string[]
}

export interface NarrationChapterResult {
  chapter: NarrationChapterPlan
  evidence: NarrationChapterEvidence
  items: AnchoredNarrationDraftItem[]
  summary: string
  memory: NarrationRollingMemory
  model: string
  attempts: number
  humanizerAttempts?: number
  humanizerFallback?: boolean
}

export interface NarrationGlobalIssue {
  code: string
  severity: 'low' | 'medium' | 'high'
  message: string
  item_ids: number[]
  evidence_refs: string[]
}

export interface NarrationGlobalReview {
  passed: boolean
  issues: NarrationGlobalIssue[]
  coverage: Array<{ event_id: string; covered: boolean; item_ids: number[] }>
  evidence_gaps: string[]
  patches: NarrationRepairPatch[]
  degraded?: boolean
  skipped_reason?: string
}

export interface NarrationPipelineCheckpoint {
  outline: NarrationOutline
  chapters: NarrationChapterResult[]
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

const CHECKPOINT_PREFIX = 'narrato.narration-pipeline.v2:'

export const narrationPipelineCheckpointKey = (workflowRunId?: string, workflowInputHash?: string): string | null => (
  workflowRunId && workflowInputHash ? `${CHECKPOINT_PREFIX}${workflowRunId}:${workflowInputHash}` : null
)

export const loadNarrationPipelineCheckpoint = (key: string | null): NarrationPipelineCheckpoint | null => {
  if (!key || typeof localStorage === 'undefined') return null
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null')
    if (!parsed || typeof parsed !== 'object' || !parsed.outline || !Array.isArray(parsed.chapters)) return null
    return parsed as NarrationPipelineCheckpoint
  } catch {
    return null
  }
}

export const saveNarrationPipelineCheckpoint = (key: string | null, checkpoint: NarrationPipelineCheckpoint): void => {
  if (!key || typeof localStorage === 'undefined') return
  localStorage.setItem(key, JSON.stringify(checkpoint))
}

export const clearNarrationPipelineCheckpoint = (key: string | null): void => {
  if (!key || typeof localStorage === 'undefined') return
  localStorage.removeItem(key)
}

const record = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
)

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
const number = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? value : Number(value)
const strings = (value: unknown): string[] => Array.isArray(value) ? value.map(text).filter(Boolean) : []
const unique = <T>(items: T[]): T[] => [...new Set(items)]
const overlaps = (start: number, end: number, range: Pick<NarrationChapterPlan, 'start' | 'end'>) => end >= range.start && start <= range.end
const tokens = (value: string): string[] => unique((value.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []))
export const countNarrationCharacters = (value: string): number => (value.match(/[\p{L}\p{N}]/gu) ?? []).length
export const narrationItemsPerChapterRange = () => ({
  minimum: 2,
  maximum: 3,
})

export const chapterCountForDuration = (targetDurationMs: number): number => (
  Math.max(1, Math.ceil(targetDurationMs / 60_000))
)

const MIN_CHARACTERS_PER_SELECTED_EVENT = 80
const MAX_SELECTED_EVENTS = 6
const STORY_EVENT_PRIORITY_ORDER = ['high', 'medium', 'low'] as const
type StoryEventPriority = typeof STORY_EVENT_PRIORITY_ORDER[number]

export const chapterCountForSelectedEvents = (selectedEventCount: number): number => (
  selectedEventCount <= 3 ? 1 : 2
)

export interface PreparedNarrationStoryEvent extends Record<string, unknown> {
  event_id: string
  start: number
  end: number
  description: string
  participants: string[]
  evidence: string[]
  selection_priority: StoryEventPriority
  selection_rank: number
}

export interface PreparedNarrationStoryEvents {
  totalEventCount: number
  validEventCount: number
  excludedInvalidEventCount: number
  maxSelectedEventCount: number
  selectedEvents: PreparedNarrationStoryEvent[]
  rankedValidEvents: PreparedNarrationStoryEvent[]
  coverageAnchors: FrameNarrationLayeredContext['cacheContext']['coverage_anchors']
  excludedEvents: Array<{
    event_id: string
    reason: 'missing_start' | 'missing_end' | 'negative_start' | 'reversed_range' | 'out_of_bounds' | 'missing_description' | 'opening_or_ending_song' | 'advertisement'
  }>
}

const storyEventPriority = (value: unknown): StoryEventPriority => {
  const normalized = text(value).toLocaleLowerCase()
  if (/critical|核心|关键|最高|高潮|climax|high|重要|主要|高|major/.test(normalized)) return 'high'
  if (/medium|一般|中|normal/.test(normalized)) return 'medium'
  return 'low'
}

const openingOrEndingSongPattern = /片(?:头|尾)(?:主题)?(?:曲|音乐)|(?:opening|ending)\s*(?:theme|song|music)/i

const STORY_EVENT_EXCLUSION_REASON_LABELS: Record<string, string> = {
  missing_start: '缺少开始时间',
  missing_end: '缺少结束时间',
  negative_start: '开始时间为负',
  reversed_range: '结束时间早于开始时间',
  out_of_bounds: '超出素材时长',
  missing_description: '缺少事件描述',
  opening_or_ending_song: '判定为片头/片尾曲',
}

export const describeStoryEventExclusions = (
  excludedEvents: Array<{ event_id: string; reason: string }>,
  totalEventCount: number,
): string => {
  const counts = new Map<string, number>()
  for (const item of excludedEvents) {
    counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1)
  }
  const parts = [...counts.entries()].map(([reason, count]) => (
    `${STORY_EVENT_EXCLUSION_REASON_LABELS[reason] ?? reason} ${count} 条`
  ))
  const detail = parts.length > 0 ? `：${parts.join('、')}` : ''
  return `剧情理解共 ${totalEventCount} 条事件全部未通过有效性检查${detail}`
}

const invalidStoryEventReason = (
  event: { start: number; end: number; description: string; type?: unknown },
  sourceDurationSeconds: number,
): PreparedNarrationStoryEvents['excludedEvents'][number]['reason'] | null => {
  if (!Number.isFinite(event.start)) return 'missing_start'
  if (!Number.isFinite(event.end)) return 'missing_end'
  if (event.start < 0) return 'negative_start'
  if (event.end <= event.start) return 'reversed_range'
  if (event.end > sourceDurationSeconds + 1) return 'out_of_bounds'
  if (!event.description) return 'missing_description'
  if (isAdvertisementStoryEvent(event as Record<string, unknown>)) return 'advertisement'
  const normalizedType = text(event.type).toLocaleLowerCase()
  if (normalizedType === 'opening_song' || normalizedType === 'ending_song' || openingOrEndingSongPattern.test(event.description)) {
    return 'opening_or_ending_song'
  }
  return null
}

const storyEventQualityScore = (event: Record<string, unknown>): number => {
  const score = (value: unknown): number => {
    const parsed = number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  const evidence = strings(event.evidence)
  return score(event.turning_value) * 5
    + score(event.causal_importance) * 4
    + Math.max(score(event.evidence_completeness), evidence.length > 0 ? 1 : 0) * 3
    + score(event.visual_clarity) * 2
    - score(event.duplicate_score) * 4
}

export const prepareNarrationStoryEvents = (
  layered: FrameNarrationLayeredContext,
  contract: FrameDurationContract,
): PreparedNarrationStoryEvents => {
  const sourceDurationSeconds = layered.cacheContext.context_strategy.source_duration_seconds
  const indexedEvents = layered.cacheContext.story_event_index.map((rawEvent, index) => {
    const event = rawEvent as unknown as Record<string, unknown>
    const start = number(event.start)
    const end = number(event.end)
    return {
      ...event,
      event_id: text(event.event_id) || `event-${String(index + 1).padStart(3, '0')}`,
      start,
      end,
      description: text(event.description),
      participants: strings(event.participants),
      evidence: strings(event.evidence),
      selection_priority: storyEventPriority(event.importance),
      source_index: index,
    }
  })
  const excludedEvents = indexedEvents.flatMap(event => {
    const reason = invalidStoryEventReason(event, sourceDurationSeconds)
    return reason ? [{ event_id: event.event_id, reason }] : []
  })
  const excludedIds = new Set(excludedEvents.map(event => event.event_id))
  const validEvents = indexedEvents.filter(event => !excludedIds.has(event.event_id))
  const desiredEventCount = Math.floor(contract.targetCharacters / MIN_CHARACTERS_PER_SELECTED_EVENT)
  const maxSelectedEventCount = Math.min(validEvents.length, Math.max(1, Math.min(MAX_SELECTED_EVENTS, desiredEventCount)))
  const priorityWeight = new Map(STORY_EVENT_PRIORITY_ORDER.map((priority, index) => [priority, index]))
  const rankedEvents = [...validEvents].sort((left, right) => (
    (priorityWeight.get(left.selection_priority) ?? STORY_EVENT_PRIORITY_ORDER.length)
      - (priorityWeight.get(right.selection_priority) ?? STORY_EVENT_PRIORITY_ORDER.length)
    || storyEventQualityScore(right) - storyEventQualityScore(left)
    || left.start - right.start
    || left.source_index - right.source_index
  ))
  const rankedValidEvents = rankedEvents
    .map(({ source_index: _sourceIndex, ...event }, index) => ({
      ...event,
      selection_rank: index + 1,
    })) as PreparedNarrationStoryEvent[]
  const selectedEvents = rankedValidEvents
    .slice(0, maxSelectedEventCount)
    .sort((left, right) => left.start - right.start || left.selection_rank - right.selection_rank)
  const coverageAnchors = layered.cacheContext.coverage_anchors.filter(anchor => (
    selectedEvents.some(event => overlaps(anchor.start, anchor.end, event))
  ))
  const rawEventCount = number(layered.cacheContext.context_strategy.raw_story_event_count)
  const totalEventCount = Number.isFinite(rawEventCount) && rawEventCount >= indexedEvents.length
    ? Math.floor(rawEventCount)
    : indexedEvents.length

  return {
    totalEventCount,
    validEventCount: validEvents.length,
    excludedInvalidEventCount: totalEventCount - validEvents.length,
    maxSelectedEventCount,
    selectedEvents,
    rankedValidEvents,
    coverageAnchors,
    excludedEvents,
  }
}

export interface NarrationChapterEventRebalance {
  chapter: NarrationChapterPlan
  selectedEvents: PreparedNarrationStoryEvent[]
  action: 'none' | 'removed_lowest_priority_event' | 'added_next_priority_event'
  eventId?: string
}
export const shouldReuseRejectedNarrationDraft = (
  action: NarrationChapterEventRebalance['action'],
  hasExplicitRebalanceFeedback = false,
): boolean => action === 'none' || hasExplicitRebalanceFeedback

export const canRecoverNarrationChapterWithHumanizer = (issues: string[]): boolean => (
  issues.length > 0 && issues.every((issue) => {
    const match = issue.match(/^chapter character budget exceeded:\s*(\d+)\s*>\s*(\d+)$/)
    if (!match) return false
    const actual = Number(match[1])
    const maximum = Number(match[2])
    if (!Number.isFinite(actual) || !Number.isFinite(maximum) || maximum <= 0 || actual <= maximum) return false
    return actual - maximum <= Math.ceil(maximum * 0.2)
  })
)



export const rebalanceNarrationChapterEvents = (options: {
  chapter: NarrationChapterPlan
  selectedEvents: PreparedNarrationStoryEvent[]
  rankedValidEvents: PreparedNarrationStoryEvent[]
  validationIssues: string[]
}): NarrationChapterEventRebalance => {
  const overBudgetIssue = options.validationIssues.find(issue => issue.startsWith('chapter character budget exceeded'))
  const overBudgetMatch = overBudgetIssue?.match(/exceeded:\s*(\d+)\s*>\s*(\d+)/)
  const overBudgetCharacters = overBudgetMatch ? Number(overBudgetMatch[1]) - Number(overBudgetMatch[2]) : Number.POSITIVE_INFINITY
  const overBudgetMaximum = overBudgetMatch ? Number(overBudgetMatch[2]) : 0
  const materiallyOverBudget = Boolean(overBudgetIssue) && (
    overBudgetCharacters > Math.max(10, Math.round(overBudgetMaximum * 0.1))
  )
  const underBudget = options.validationIssues.some(issue => issue.startsWith('chapter character budget below minimum'))
  if (materiallyOverBudget && options.chapter.event_ids.length > 1) {
    const removable = options.chapter.event_ids
      .map(eventId => options.selectedEvents.find(event => event.event_id === eventId))
      .filter((event): event is PreparedNarrationStoryEvent => Boolean(event))
      .sort((left, right) => right.selection_rank - left.selection_rank)[0]
    if (removable) {
      return {
        chapter: {
          ...options.chapter,
          event_ids: options.chapter.event_ids.filter(eventId => eventId !== removable.event_id),
        },
        selectedEvents: options.selectedEvents.filter(event => event.event_id !== removable.event_id),
        action: 'removed_lowest_priority_event',
        eventId: removable.event_id,
      }
    }
  }
  if (underBudget && options.selectedEvents.length < MAX_SELECTED_EVENTS) {
    const selectedIds = new Set(options.selectedEvents.map(event => event.event_id))
    const candidate = options.rankedValidEvents.find(event => (
      !selectedIds.has(event.event_id)
      && event.start >= options.chapter.start
      && event.end <= options.chapter.end
    ))
    if (candidate) {
      const selectedEvents = [...options.selectedEvents, candidate]
        .sort((left, right) => left.start - right.start || left.selection_rank - right.selection_rank)
      const chapterEvents = selectedEvents
        .filter(event => options.chapter.event_ids.includes(event.event_id) || event.event_id === candidate.event_id)
        .map(event => event.event_id)
      return {
        chapter: { ...options.chapter, event_ids: chapterEvents },
        selectedEvents,
        action: 'added_next_priority_event',
        eventId: candidate.event_id,
      }
    }
  }
  return { chapter: options.chapter, selectedEvents: options.selectedEvents, action: 'none' }
}

export const buildNarrationOutlineRequest = (
  layered: FrameNarrationLayeredContext,
  contract: FrameDurationContract,
  correction?: NarrationOutlineCorrection,
) => {
  const sourceDurationSeconds = layered.cacheContext.context_strategy.source_duration_seconds
  const prepared = prepareNarrationStoryEvents(layered, contract)
  const narrativeContextRecord = record(layered.videoContext.narrative_context)
  const narrativeContext = narrativeContextRecord
    ? { ...narrativeContextRecord, events: prepared.selectedEvents }
    : { events: prepared.selectedEvents }
  const chapterCount = chapterCountForSelectedEvents(prepared.selectedEvents.length)
  return {
    operation: 'narration_outline',
    contract: {
      target_duration_ms: contract.targetDurationMs,
      target_characters: contract.targetCharacters,
      chapter_count: chapterCount,
      chapter_output_seconds_range: [45, 75],
      source_duration_seconds: sourceDurationSeconds,
      chapter_range_unit: 'source_timeline_seconds',
      valid_chapter_range: [0, sourceDurationSeconds],
    },
    narrative_context: narrativeContext,
    story_event_index: prepared.selectedEvents,
    coverage_anchors: prepared.coverageAnchors,
    selection_policy: {
      match_basis: 'target_characters_and_narration_ratio',
      target_characters: contract.targetCharacters,
      narration_ratio: contract.narrationRatio,
      minimum_characters_per_selected_event: MIN_CHARACTERS_PER_SELECTED_EVENT,
      priority_order: [...STORY_EVENT_PRIORITY_ORDER],
      require_all_events: false,
      total_event_count: prepared.totalEventCount,
      valid_event_count: prepared.validEventCount,
      excluded_invalid_event_count: prepared.excludedInvalidEventCount,
      selected_event_count: prepared.selectedEvents.length,
      omitted_event_count: prepared.validEventCount - prepared.selectedEvents.length,
      instruction: 'Only build chapters from story_event_index. Omitted events are intentionally uncovered because the user character budget has higher priority than full-story coverage.',
    },
    ...(correction ? correction : {}),
  }
}

export const parseNarrationOutline = (
  value: unknown,
  contract: FrameDurationContract,
  sourceDurationSeconds: number,
  allowedEventIds?: Iterable<string>,
): NarrationOutline => {
  const root = record(value)
  const rawChapters = Array.isArray(root?.chapters) ? root.chapters : []
  const chapters = rawChapters.map((raw, index): NarrationChapterPlan => {
    const item = record(raw)
    if (!item) throw new Error(`narration outline chapter ${index + 1} is invalid`)
    return {
      chapter_id: text(item.chapter_id) || `chapter-${String(index + 1).padStart(2, '0')}`,
      start: number(item.start),
      end: number(item.end),
      target_characters: Math.round(number(item.target_characters)),
      objective: text(item.objective),
      opening_bridge: text(item.opening_bridge),
      closing_hook: text(item.closing_hook),
      event_ids: strings(item.event_ids),
      characters: strings(item.characters),
      retrieval_keywords: strings(item.retrieval_keywords),
    }
  })
  const selectedEventCount = allowedEventIds ? new Set(allowedEventIds).size : 0
  const plannedChapterCount = selectedEventCount > 0 ? chapterCountForSelectedEvents(selectedEventCount) : chapterCountForDuration(contract.targetDurationMs)
  if (chapters.length !== plannedChapterCount) {
    throw new Error(`narration outline chapter count ${chapters.length} does not match planned ${plannedChapterCount}`)
  }
  const ids = new Set<string>()
  const allowedEvents = allowedEventIds ? new Set(allowedEventIds) : null
  chapters.forEach((chapter, index) => {
    if (!chapter.chapter_id || ids.has(chapter.chapter_id)) throw new Error(`narration outline chapter identity is invalid at ${index + 1}`)
    ids.add(chapter.chapter_id)
    if (!Number.isFinite(chapter.start) || !Number.isFinite(chapter.end) || chapter.start < 0 || chapter.end <= chapter.start || chapter.end > sourceDurationSeconds + 1) {
      throw new Error(`narration outline chapter range is invalid at ${chapter.chapter_id}: start=${chapter.start}, end=${chapter.end}, source_duration_seconds=${sourceDurationSeconds}`)
    }
    if (index > 0 && chapter.start < chapters[index - 1].start) throw new Error('narration outline chapters are not chronological')
    if (chapter.target_characters <= 0 || !chapter.objective) throw new Error(`narration outline chapter is incomplete at ${chapter.chapter_id}`)
    const outsideSelectedEvents = allowedEvents
      ? chapter.event_ids.filter(eventId => !allowedEvents.has(eventId))
      : []
    if (outsideSelectedEvents.length > 0) {
      throw new Error(`narration outline chapter ${chapter.chapter_id} references events outside selected story events: ${outsideSelectedEvents.join(', ')}`)
    }
  })
  if (allowedEvents) {
    const assignedEventIds = chapters.flatMap(chapter => chapter.event_ids)
    const missingEventIds = [...allowedEvents].filter(eventId => !assignedEventIds.includes(eventId))
    const duplicatedEventIds = [...new Set(assignedEventIds.filter((eventId, index) => assignedEventIds.indexOf(eventId) !== index))]
    if (missingEventIds.length > 0) {
      throw new Error(`narration outline omitted selected story events: ${missingEventIds.join(', ')}`)
    }
    if (duplicatedEventIds.length > 0) {
      throw new Error(`narration outline duplicated selected story events: ${duplicatedEventIds.join(', ')}`)
    }
  }
  const budget = chapters.reduce((sum, chapter) => sum + chapter.target_characters, 0)
  if (Math.abs(budget - contract.targetCharacters) > Math.max(2, chapters.length)) {
    throw new Error(`narration outline character budget ${budget} does not match ${contract.targetCharacters}`)
  }
  return { summary: text(root?.summary), chapters }
}

export const requestValidNarrationOutline = async <Response>(options: {
  contract: FrameDurationContract
  sourceDurationSeconds: number
  allowedEventIds?: Iterable<string>
  request: (correction?: NarrationOutlineCorrection) => Promise<Response>
  resultFromResponse: (response: Response) => unknown
  onInvalid?: (message: string) => void
}): Promise<{ outline: NarrationOutline; response: Response; attempts: number }> => {
  let correction: NarrationOutlineCorrection | undefined
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await options.request(correction)
    const rawOutline = options.resultFromResponse(response)
    try {
      return {
        outline: parseNarrationOutline(rawOutline, options.contract, options.sourceDurationSeconds, options.allowedEventIds),
        response,
        attempts: attempt,
      }
    } catch (error) {
      if (attempt === 2) throw error
      const message = error instanceof Error ? error.message : String(error)
      options.onInvalid?.(message)
      correction = {
        previous_outline: rawOutline,
        validation_feedback: [
          `The previous outline was rejected: ${message}.`,
          `Regenerate the complete outline using source timeline seconds and keep every chapter inside [0, ${options.sourceDurationSeconds}].`,
        ].join(' '),
      }
    }
  }
  throw new Error('narration outline correction exhausted')
}

const evidenceIndex = (merged: MergeVideoContextOutput, layered: FrameNarrationLayeredContext): NarrationEvidenceItem[] => {
  const subtitles = merged.pipelineResult.subtitleResult.segments.map((segment, index) => ({
    evidence_id: `subtitle-${segment.id || index + 1}`,
    kind: 'subtitle' as const,
    start: segment.startTime,
    end: segment.endTime,
    text: segment.text,
    ...(segment.speakerId !== undefined ? { speaker_id: segment.speakerId } : {}),
  }))
  const visuals = merged.pipelineResult.analyses.map((analysis, index) => ({
    evidence_id: `visual-${String(index + 1).padStart(3, '0')}`,
    kind: 'visual' as const,
    start: analysis.decision.start,
    end: analysis.decision.end,
    text: text(analysis.response.analysis?.summary) || text(analysis.response.content),
  })).filter(item => item.text)
  const events = layered.cacheContext.story_event_index.flatMap((event, index) => (
    event.start === undefined || event.end === undefined ? [] : [{
      evidence_id: event.event_id || `event-${String(index + 1).padStart(3, '0')}`,
      kind: 'event' as const,
      start: event.start,
      end: event.end,
      text: event.description,
    }]
  ))
  return [...subtitles, ...visuals, ...events]
}

export const retrieveNarrationEvidence = (
  merged: MergeVideoContextOutput,
  layered: FrameNarrationLayeredContext,
  chapter: NarrationChapterPlan,
): NarrationChapterEvidence => {
  const index = evidenceIndex(merged, layered)
  const queryTokens = tokens([...chapter.characters, ...chapter.retrieval_keywords, chapter.objective].join(' '))
  const queryTerms = unique([...chapter.characters, ...chapter.retrieval_keywords].map(item => item.trim().toLocaleLowerCase()).filter(Boolean))
  const score = (item: NarrationEvidenceItem) => {
    const itemTokens = new Set(tokens(item.text))
    const normalizedText = item.text.toLocaleLowerCase()
    const keywordScore = (queryTokens.filter(token => itemTokens.has(token)).length + queryTerms.filter(term => normalizedText.includes(term)).length) * 10
    const overlapScore = overlaps(item.start, item.end, chapter) ? 100 : 0
    return overlapScore + keywordScore + (item.kind === 'event' ? 8 : item.kind === 'visual' ? 4 : 0)
  }
  const exact = index.filter(item => overlaps(item.start, item.end, chapter)).sort((a, b) => a.start - b.start)
  const exactIds = new Set(exact.map(item => item.evidence_id))
  const adjacent = index.filter(item => !exactIds.has(item.evidence_id) && item.end >= chapter.start - 12 && item.start <= chapter.end + 12)
    .sort((a, b) => a.start - b.start).slice(0, 12)
  const used = new Set([...exactIds, ...adjacent.map(item => item.evidence_id)])
  const callbacks = index.filter(item => !used.has(item.evidence_id) && score(item) >= 10)
    .sort((a, b) => score(b) - score(a) || a.start - b.start).slice(0, 10)
  // Chapter plans may contain model-generated event IDs. Resolve them against
  // both the stable pipeline ID and the source event's original ID, then check
  // source evidence by time range instead of requiring an ID namespace match.
  const sourceEvents = layered.cacheContext.story_event_index.map((event, index) => ({
    event,
    eventId: event.event_id || `event-${String(index + 1).padStart(3, '0')}`,
  }))
  const evidence_gaps = chapter.event_ids.filter(eventId => {
    const sourceEvent = sourceEvents.find(({ event, eventId: stableId }) => eventId === stableId || eventId === String(event.event_id))
    if (!sourceEvent || sourceEvent.event.start === undefined || sourceEvent.event.end === undefined) return true
    const { start, end } = sourceEvent.event
    return !index.some(item => item.kind !== 'event' && overlaps(item.start, item.end, { start, end }))
  })
  return { chapter_id: chapter.chapter_id, exact, adjacent, callbacks, evidence_gaps }
}

export const validateNarrationChapterItems = (
  items: NarrationDraftItem[],
  chapter: NarrationChapterPlan,
  evidence: NarrationChapterEvidence,
): string[] => {
  const issues: string[] = []
  const itemCountRange = narrationItemsPerChapterRange()
  if (items.length < itemCountRange.minimum || items.length > itemCountRange.maximum) {
    issues.push(`chapter narration item count ${items.length} outside ${itemCountRange.minimum}-${itemCountRange.maximum}`)
  }
  if (items.length === 0) issues.push('chapter returned no narration items')
  if (items.some(item => !item.text.trim())) issues.push('chapter contains empty narration text')
  const chapterCharacters = items.reduce((total, item) => total + countNarrationCharacters(item.text), 0)
  const minimumCharacters = Math.round(chapter.target_characters * 0.7)
  const maximumCharacters = Math.round(chapter.target_characters * 1.3)
  if (chapter.target_characters > 0 && chapterCharacters < minimumCharacters) {
    issues.push(`chapter character budget below minimum: ${chapterCharacters} < ${minimumCharacters}`)
  }
  if (chapter.target_characters > 0 && chapterCharacters > maximumCharacters) {
    issues.push(`chapter character budget exceeded: ${chapterCharacters} > ${maximumCharacters}`)
  }
  const normalized = items.map(item => item.text.replace(/\s+/g, '').toLocaleLowerCase())
  if (new Set(normalized).size !== normalized.length) issues.push('chapter contains duplicate narration items')
  if (evidence.exact.length === 0) issues.push('chapter has no exact source evidence')
  return issues
}


export const validateNarrationHumanizedItems = (
  originalItems: NarrationDraftItem[],
  humanizedItems: NarrationDraftItem[],
  chapter: NarrationChapterPlan,
  enforceCharacterLimit = true,
  graceRatio = 1,
): string[] => {
  const issues: string[] = []
  if (humanizedItems.length !== originalItems.length) {
    issues.push(`humanized narration item count changed: ${humanizedItems.length} != ${originalItems.length}`)
  }
  const originalIds = originalItems.map(item => item._id)
  const humanizedIds = humanizedItems.map(item => item._id)
  if (originalIds.length !== humanizedIds.length || originalIds.some((id, index) => id !== humanizedIds[index])) {
    issues.push('humanized narration item ids or order changed')
  }
  if (humanizedItems.some(item => !item.text.trim())) {
    issues.push('humanized narration contains empty text')
  }
  const humanizedCharacters = humanizedItems.reduce(
    (total, item) => total + countNarrationCharacters(item.text),
    0,
  )
  const minimumCharacters = Math.round(chapter.target_characters * 0.7)
  const maximumCharacters = Math.round(chapter.target_characters * 1.3)
  if (enforceCharacterLimit && chapter.target_characters > 0 && humanizedCharacters < minimumCharacters) {
    issues.push(`humanized chapter character budget below minimum: ${humanizedCharacters} < ${minimumCharacters}`)
  }
  if (enforceCharacterLimit && chapter.target_characters > 0 && humanizedCharacters > maximumCharacters * graceRatio) {
    issues.push(`humanized chapter character budget exceeded: ${humanizedCharacters} > ${maximumCharacters}`)
  }
  const normalized = humanizedItems.map(item => item.text.replace(/\s+/g, '').toLocaleLowerCase())
  if (new Set(normalized).size !== normalized.length) {
    issues.push('humanized narration contains duplicate items')
  }
  return issues
}

export const humanizeNarrationChapter = async <T extends NarrationDraftItem>(options: {
  draftItems: T[]
  chapter: NarrationChapterPlan
  request: (input: {
    profile: 'flash' | 'pro'
    draftItems: NarrationDraftItem[]
    validationFeedback: string[]
  }) => Promise<{ items: NarrationDraftItem[]; model: string }>
  onInvalid?: (profile: 'flash' | 'pro', issues: string[]) => void
  graceRatio?: number
}): Promise<{
  items: T[]
  model: string
  attempts: number
  fallback: boolean
  grace?: boolean
}> => {
  let validationFeedback: string[] = []
  let retryDraftItems: NarrationDraftItem[] = options.draftItems
  const failures: string[] = []
  const profiles = ['flash', 'pro'] as const
  // When every profile attempt fails solely on the chapter ceiling, the closest
  // attempt within the grace band is accepted instead of failing the chapter:
  // MiniMax cannot count characters precisely, and the global duration contract
  // absorbs a small overshoot downstream.
  const graceRatio = options.graceRatio ?? 1
  let bestGraceItems: NarrationDraftItem[] | null = null
  let bestGraceModel = ''
  let bestGraceOvershoot = Number.POSITIVE_INFINITY
  for (let index = 0; index < profiles.length; index += 1) {
    const profile = profiles[index]
    try {
      const response = await options.request({ profile, validationFeedback, draftItems: retryDraftItems })
      const issues = validateNarrationHumanizedItems(options.draftItems, response.items, options.chapter)
      if (issues.length === 0) {
        const items = options.draftItems.map((item, itemIndex) => ({
          ...item,
          text: response.items[itemIndex].text,
        }))
        return { items, model: response.model, attempts: index + 1, fallback: false }
      }
      failures.push(`${profile}: ${issues.join('; ')}`)
      validationFeedback = issues
      if (issues.every(issue => issue.startsWith('humanized chapter character budget'))) {
        const overshootMatch = issues[0].match(/exceeded:\s*(\d+)\s*>\s*(\d+)/)
        if (overshootMatch) {
          const overshoot = Number(overshootMatch[1]) / Number(overshootMatch[2])
          if (overshoot < bestGraceOvershoot) {
            bestGraceOvershoot = overshoot
            bestGraceItems = response.items
            bestGraceModel = response.model
          }
        }
        retryDraftItems = response.items
      }
      options.onInvalid?.(profile, issues)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      validationFeedback = [`Humanizer request failed: ${message}`]
      failures.push(`${profile}: ${message}`)
      options.onInvalid?.(profile, validationFeedback)
    }
  }

  const fallbackIssues = validateNarrationHumanizedItems(
    options.draftItems,
    options.draftItems,
    options.chapter,
    true,
  )
  if (fallbackIssues.length === 0) {
    return { items: options.draftItems, model: 'draft-fallback', attempts: profiles.length, fallback: true }
  }
  if (bestGraceItems && bestGraceOvershoot <= graceRatio) {
    const items = options.draftItems.map((item, itemIndex) => ({
      ...item,
      text: bestGraceItems[itemIndex].text,
    }))
    return { items, model: bestGraceModel, attempts: profiles.length, fallback: false, grace: true }
  }
  throw new Error(
    `Humanizer failed and original draft is structurally invalid: ${fallbackIssues.join('; ')}. Attempts: ${failures.join(' | ')}`,
  )
}

export const parseNarrationGlobalReview = (value: unknown): NarrationGlobalReview => {
  const root = record(value)
  if (!root || typeof root.passed !== 'boolean') throw new Error('narration global review is invalid')
  const issues = (Array.isArray(root.issues) ? root.issues : []).map((raw): NarrationGlobalIssue => {
    const item = record(raw) ?? {}
    const severity = text(item.severity)
    return {
      code: text(item.code) || 'unknown',
      severity: severity === 'low' || severity === 'medium' || severity === 'high' ? severity : 'high',
      message: text(item.message),
      item_ids: Array.isArray(item.item_ids) ? item.item_ids.map(Number).filter(Number.isInteger) : [],
      evidence_refs: strings(item.evidence_refs),
    }
  })
  const patches = (Array.isArray(root.patches) ? root.patches : []).flatMap((raw) => {
    const item = record(raw)
    const id = Number(item?._id)
    const patchText = text(item?.text)
    return Number.isInteger(id) && id > 0 && patchText ? [{ _id: id, text: patchText }] : []
  })
  return {
    passed: root.passed,
    issues,
    coverage: (Array.isArray(root.coverage) ? root.coverage : []).flatMap((raw) => {
      const item = record(raw)
      return item && text(item.event_id) ? [{
        event_id: text(item.event_id),
        covered: item.covered === true,
        item_ids: Array.isArray(item.item_ids) ? item.item_ids.map(Number).filter(Number.isInteger) : [],
      }] : []
    }),
    evidence_gaps: strings(root.evidence_gaps),
    patches,
  }
}

const FINAL_NARRATION_COMPRESSION_TRIGGER_RATIO = 1.75

export const shouldCompressFinalNarration = (
  items: NarrationDraftItem[],
  contract: FrameDurationContract,
): boolean => {
  const characters = items.reduce(
    (total, item) => total + countNarrationCharacters(item.text),
    0,
  )
  return characters > Math.round(contract.targetCharacters * FINAL_NARRATION_COMPRESSION_TRIGGER_RATIO)
}

export const validateFinalNarrationCompression = (
  originalItems: NarrationDraftItem[],
  compressedItems: NarrationDraftItem[],
  contract: FrameDurationContract,
): string[] => {
  const issues: string[] = []
  if (compressedItems.length !== originalItems.length) {
    issues.push(`compressed narration item count changed: ${compressedItems.length} != ${originalItems.length}`)
  }
  const originalIds = originalItems.map(item => item._id)
  const compressedIds = compressedItems.map(item => item._id)
  if (
    originalIds.length !== compressedIds.length
    || originalIds.some((id, index) => id !== compressedIds[index])
  ) {
    issues.push('compressed narration item ids or order changed')
  }
  if (compressedItems.some(item => !item.text.trim())) {
    issues.push('compressed narration contains empty text')
  }
  const characters = compressedItems.reduce(
    (total, item) => total + countNarrationCharacters(item.text),
    0,
  )
  if (characters < contract.minCharacters || characters > contract.maxCharacters) {
    issues.push(
      `compressed narration characters ${characters} outside ${contract.minCharacters}-${contract.maxCharacters}`,
    )
  }
  return issues
}

export const mergeFinalNarrationCompression = <T extends NarrationDraftItem>(
  originalItems: T[],
  compressedItems: NarrationDraftItem[],
): T[] => {
  if (
    compressedItems.length !== originalItems.length
    || originalItems.some((item, index) => item._id !== compressedItems[index]?._id)
  ) {
    throw new Error('compressed narration item ids or order changed')
  }
  return originalItems.map((item, index) => ({
    ...item,
    text: compressedItems[index].text,
  }))
}

export const compressFinalNarration = async <T extends NarrationDraftItem>(options: {
  items: T[]
  contract: FrameDurationContract
  request: (input: {
    attempt: number
    validationFeedback: string[]
  }) => Promise<NarrationDraftItem[]>
  onInvalid?: (attempt: number, issues: string[]) => void
}): Promise<{ items: T[]; compressed: boolean; attempts: number }> => {
  if (!shouldCompressFinalNarration(options.items, options.contract)) {
    return { items: options.items, compressed: false, attempts: 0 }
  }

  let validationFeedback: string[] = []
  const failures: string[] = []
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const compressedItems = await options.request({ attempt, validationFeedback })
      const issues = validateFinalNarrationCompression(
        options.items,
        compressedItems,
        options.contract,
      )
      if (issues.length === 0) {
        return {
          items: mergeFinalNarrationCompression(options.items, compressedItems),
          compressed: true,
          attempts: attempt,
        }
      }
      validationFeedback = issues
      failures.push(`attempt ${attempt}: ${issues.join('; ')}`)
      options.onInvalid?.(attempt, issues)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      validationFeedback = [`compression request failed: ${message}`]
      failures.push(`attempt ${attempt}: ${message}`)
      options.onInvalid?.(attempt, validationFeedback)
    }
  }

  throw new Error(`final narration compression failed: ${failures.join(' | ')}`)
}

export const requestNarrationGlobalReviewWithFallback = async <Response>(options: {
  request: () => Promise<Response>
  resultFromResponse: (response: Response) => unknown
}): Promise<{ review: NarrationGlobalReview; response: Response | null }> => {
  let response: Response
  try {
    response = await options.request()
  } catch (error) {
    const details = record(error)
    const reason = text(details?.code) || 'provider_error'
    return {
      response: null,
      review: {
        passed: true,
        degraded: true,
        skipped_reason: reason,
        issues: [{
          code: 'global_review_unavailable',
          severity: 'medium',
          message: '全局模型审查不可用，已保留通过本地结构和证据校验的文案。',
          item_ids: [],
          evidence_refs: [],
        }],
        coverage: [],
        evidence_gaps: [],
        patches: [],
      },
    }
  }
  return {
    response,
    review: parseNarrationGlobalReview(options.resultFromResponse(response)),
  }
}

export const validateNarrationGlobalResult = (
  review: NarrationGlobalReview,
  itemIds: Set<number>,
  anchoredItems: Array<{ _id: number; event_ids?: string[] }> = [],
): string[] => {
  const issues: string[] = []
  const locallyCoveredEventIds = new Set(anchoredItems
    .filter(item => itemIds.has(item._id))
    .flatMap(item => item.event_ids ?? []))

  if (review.issues.some(issue => issue.severity === 'high')) issues.push('global review contains high severity issues')
  if (review.coverage.some(item => !item.covered && !locallyCoveredEventIds.has(item.event_id))) {
    issues.push('global review reports uncovered story events')
  }
  if (review.evidence_gaps.length > 0) issues.push('global review reports evidence gaps')
  if (review.patches.some(patch => !itemIds.has(patch._id))) issues.push('global review patch references an unknown item')
  return issues
}

export const narrationRepairItemIds = (
  review: NarrationGlobalReview,
  itemIds: Set<number>,
): number[] => {
  const requestedIds = new Set([
    ...review.patches.map(patch => patch._id),
    ...review.issues
      .filter(issue => issue.severity === 'high')
      .flatMap(issue => issue.item_ids),
  ])
  if (requestedIds.size === 0 && !review.passed) {
    return [...itemIds]
  }
  return [...itemIds].filter(id => requestedIds.has(id))
}

export const flattenNarrationChapters = (chapters: NarrationChapterResult[]) => {
  let id = 0
  return chapters.flatMap(chapter => chapter.items.map(item => ({ ...item, _id: ++id })))
}

/**
 * Builds the narration global review request. The review is a quality gate
 * only: character and duration budgets are soft guidance decided during
 * generation, so sending the strict contract bounds here makes the reviewer
 * fail a slightly longer draft instead of focusing on narrative quality.
 */
export const buildNarrationGlobalReviewInput = (options: {
  outline: NarrationOutline
  storyEventIndex: Array<Record<string, unknown>>
  chapters: NarrationChapterResult[]
  items: Array<{ _id: number; text: string; chapter_id: string; evidence_refs: string[] }>
}) => ({
  operation: 'narration_global_review',
  outline: options.outline,
  story_event_index: options.storyEventIndex,
  chapters: options.chapters.map(chapter => ({
    chapter_id: chapter.chapter.chapter_id,
    summary: chapter.summary,
    evidence_gaps: chapter.evidence.evidence_gaps,
    evidence: chapter.evidence,
  })),
  items: options.items,
})
