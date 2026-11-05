export interface FrameDurationContractConfig {
  outputDurationMs?: number | null
  narrationRatio?: number | null
  wordCount?: string | number | null
}

export interface FrameDurationItem {
  text?: unknown
  org?: unknown
  start?: unknown
  end?: unknown
}

export interface FrameDurationContract {
  targetDurationMs: number
  minDurationMs: number
  maxDurationMs: number
  narrationRatio: number
  targetNarrationDurationMs: number
  targetOriginalDurationMs: number
  targetCharacters: number
  minCharacters: number
  maxCharacters: number
}

export interface FrameDurationAssessment {
  valid: boolean
  narrationCharacters: number
  timelineDurationMs: number
  narrationDurationMs: number
  originalDurationMs: number
  narrationDurationRatio: number
  issues: string[]
}

export type FrameNarrationRepairMode = 'quality' | 'contract'

export interface FrameNarrationRepairPlan {
  sourceItems: Array<FrameDurationItem & { _id?: unknown }>
  videoContext: {
    operation: 'repair_existing_script'
    repair_mode: FrameNarrationRepairMode
    contract?: {
      target_duration_ms: number
      min_duration_ms: number
      max_duration_ms: number
      target_characters: number
      min_characters: number
      max_characters: number
      narration_ratio: number
    }
    diagnostics: {
      narration_characters?: number
      timeline_duration_ms?: number
      narration_duration_ms?: number
      original_duration_ms?: number
      narration_duration_ratio?: number
      issues: string[]
    }
    current_items: Array<FrameDurationItem & { _id?: unknown }>
    evidence_context: unknown
  }
}

export interface FrameNarrationRepairPatch {
  _id?: unknown
  text?: unknown
  start?: unknown
  end?: unknown
}

export const FRAME_DURATION_MIN_RATIO = 0.8
export const FRAME_DURATION_MAX_RATIO = 1.2
export const FRAME_NARRATION_CHARACTER_MIN_RATIO = 0.7
export const FRAME_NARRATION_CHARACTER_MAX_RATIO = 1.3
const NARRATION_RATIO_TOLERANCE = 0.15
const DEFAULT_TARGET_DURATION_MS = 4 * 60_000
const DEFAULT_NARRATION_RATIO = 0.5
const DEFAULT_TARGET_CHARACTERS = 800
const TARGET_NARRATION_CHARACTERS_PER_SECOND = 5

const finitePositive = (value: unknown): number | null => {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const clampRatio = (value: unknown): number => {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN
  if (!Number.isFinite(parsed)) return DEFAULT_NARRATION_RATIO
  return Math.min(1, Math.max(0, parsed))
}

const countCharacters = (value: unknown): number => (
  typeof value === 'string' ? (value.match(/[\p{L}\p{N}]/gu) ?? []).length : 0
)

const protectedTextTokens = (value: string): string[] => (
  value.match(/[A-Za-z][A-Za-z0-9_-]*|\d+(?:\.\d+)?(?:%|％)?|《[^》]{1,40}》/gu) ?? []
).map(token => token.toLocaleLowerCase()).sort()

const itemDurationMs = (item: FrameDurationItem): number => {
  const start = Number(item.start)
  const end = Number(item.end)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  return Math.round((end - start) * 1_000)
}

export const createFrameDurationContract = (
  config: FrameDurationContractConfig,
): FrameDurationContract => {
  const targetDurationMs = Math.round(finitePositive(config.outputDurationMs) ?? DEFAULT_TARGET_DURATION_MS)
  const narrationRatio = clampRatio(config.narrationRatio)
  const requestedCharacters = Math.round(finitePositive(config.wordCount) ?? DEFAULT_TARGET_CHARACTERS)
  const targetNarrationDurationMs = Math.round(targetDurationMs * narrationRatio)
  const durationCharacterBudget = Math.max(1, Math.round(
    (targetNarrationDurationMs / 1_000) * TARGET_NARRATION_CHARACTERS_PER_SECOND,
  ))
  const targetCharacters = Math.min(requestedCharacters, durationCharacterBudget)
  return {
    targetDurationMs,
    minDurationMs: Math.round(targetDurationMs * FRAME_DURATION_MIN_RATIO),
    maxDurationMs: Math.round(targetDurationMs * FRAME_DURATION_MAX_RATIO),
    narrationRatio,
    targetNarrationDurationMs,
    targetOriginalDurationMs: Math.round(targetDurationMs * (1 - narrationRatio)),
    targetCharacters,
    minCharacters: Math.round(targetCharacters * FRAME_NARRATION_CHARACTER_MIN_RATIO),
    maxCharacters: Math.round(targetCharacters * FRAME_NARRATION_CHARACTER_MAX_RATIO),
  }
}

export const assessFrameNarrationDraft = (
  items: FrameDurationItem[],
  contract: FrameDurationContract,
): FrameDurationAssessment => {
  const narrationCharacters = items.reduce((total, item) => total + countCharacters(item.text), 0)
  const issues: string[] = []
  if (narrationCharacters < contract.minCharacters) {
    issues.push(`narration characters ${narrationCharacters} below ${contract.minCharacters}`)
  }
  if (narrationCharacters > contract.maxCharacters) {
    issues.push(`narration characters ${narrationCharacters} above ${contract.maxCharacters}`)
  }
  return {
    valid: issues.length === 0,
    narrationCharacters,
    timelineDurationMs: 0,
    narrationDurationMs: 0,
    originalDurationMs: 0,
    narrationDurationRatio: 0,
    issues,
  }
}

export const assessFrameTimeline = (
  items: FrameDurationItem[],
  contract: FrameDurationContract,
): FrameDurationAssessment => {
  const draftAssessment = assessFrameNarrationDraft(items, contract)
  let narrationDurationMs = 0
  let originalDurationMs = 0
  items.forEach((item) => {
    const durationMs = itemDurationMs(item)
    if (countCharacters(item.text) > 0) narrationDurationMs += durationMs
    else if (countCharacters(item.org) > 0) originalDurationMs += durationMs
  })
  const timelineDurationMs = narrationDurationMs + originalDurationMs
  const narrationDurationRatio = timelineDurationMs > 0 ? narrationDurationMs / timelineDurationMs : 0
  const issues = [...draftAssessment.issues]
  if (timelineDurationMs < contract.minDurationMs) {
    issues.push(`timeline duration ${timelineDurationMs}ms below ${contract.minDurationMs}ms`)
  }
  if (timelineDurationMs > contract.maxDurationMs) {
    issues.push(`timeline duration ${timelineDurationMs}ms above ${contract.maxDurationMs}ms`)
  }
  if (
    timelineDurationMs > 0
    && Math.abs(narrationDurationRatio - contract.narrationRatio) > NARRATION_RATIO_TOLERANCE
  ) {
    issues.push(
      `narration duration ratio ${narrationDurationRatio.toFixed(3)} outside target ${contract.narrationRatio.toFixed(3)}`,
    )
  }
  return {
    valid: issues.length === 0,
    narrationCharacters: draftAssessment.narrationCharacters,
    timelineDurationMs,
    narrationDurationMs,
    originalDurationMs,
    narrationDurationRatio,
    issues,
  }
}

export const buildFrameNarrationRepairPlan = <T extends FrameDurationItem & { _id?: unknown }>(
  items: T[],
  assessment: FrameDurationAssessment,
  contract: FrameDurationContract,
  evidenceContext: unknown,
  mode: FrameNarrationRepairMode,
): FrameNarrationRepairPlan => {
  if (items.length === 0) throw new Error('narration repair requires at least one script item')
  return {
    sourceItems: items.map(item => ({ ...item })),
    videoContext: {
      operation: 'repair_existing_script',
      repair_mode: mode,
      ...(mode === 'contract' ? {
        contract: {
          target_duration_ms: contract.targetDurationMs,
          min_duration_ms: contract.minDurationMs,
          max_duration_ms: contract.maxDurationMs,
          target_characters: contract.targetCharacters,
          min_characters: contract.minCharacters,
          max_characters: contract.maxCharacters,
          narration_ratio: contract.narrationRatio,
        },
        diagnostics: {
          narration_characters: assessment.narrationCharacters,
          timeline_duration_ms: assessment.timelineDurationMs,
          narration_duration_ms: assessment.narrationDurationMs,
          original_duration_ms: assessment.originalDurationMs,
          narration_duration_ratio: assessment.narrationDurationRatio,
          issues: [...assessment.issues],
        },
      } : {
        diagnostics: { issues: [] },
      }),
      current_items: items.map(item => ({ ...item })),
      evidence_context: evidenceContext,
    },
  }
}

export const applyFrameNarrationRepair = <T extends FrameDurationItem & { _id?: unknown }>(
  plan: FrameNarrationRepairPlan,
  repairPatches: FrameNarrationRepairPatch[],
): T[] => {
  const sourceById = new Map<number, { item: FrameDurationItem & { _id?: unknown }; index: number }>()
  plan.sourceItems.forEach((item, index) => {
    const id = Number(item._id)
    if (!Number.isInteger(id) || sourceById.has(id)) {
      throw new Error(`narration repair source has invalid item identity at position ${index + 1}`)
    }
    sourceById.set(id, { item, index })
  })

  const patchedIds = new Set<number>()
  const result = plan.sourceItems.map(item => ({ ...item })) as T[]
  repairPatches.forEach((item) => {
    const id = Number(item._id)
    const sourceEntry = sourceById.get(id)
    if (!Number.isInteger(id) || !sourceEntry || patchedIds.has(id)) {
      throw new Error(`narration repair returned invalid or duplicate item identity ${String(item._id)}`)
    }
    const source = sourceEntry.item
    const hasStart = item.start !== undefined
    const hasEnd = item.end !== undefined
    if (hasStart !== hasEnd) {
      throw new Error(`narration repair returned partial timing in item ${id}`)
    }
    if (hasStart && (
      typeof item.start !== 'number'
      || typeof item.end !== 'number'
      || !Number.isFinite(item.start)
      || !Number.isFinite(item.end)
      || item.end <= item.start
    )) {
      throw new Error(`narration repair returned invalid timing in item ${id}`)
    }
    const sourceHasNarration = typeof source.text === 'string' && countCharacters(source.text) > 0
    const repairedText = typeof item.text === 'string' ? item.text : source.text
    const repairedHasNarration = typeof repairedText === 'string' && countCharacters(repairedText) > 0
    if (sourceHasNarration !== repairedHasNarration) {
      throw new Error(`narration repair changed item role in item ${id}`)
    }
    if (
      plan.videoContext.repair_mode === 'quality'
      && (hasStart || hasEnd)
    ) {
      throw new Error(`narration quality repair changed timing in item ${id}`)
    }
    if (
      typeof source.text === 'string'
      && typeof item.text === 'string'
      && protectedTextTokens(source.text).join('\n') !== protectedTextTokens(item.text).join('\n')
    ) {
      throw new Error(`narration repair changed protected facts in item ${id}`)
    }
    patchedIds.add(id)
    result[sourceEntry.index] = {
      ...source,
      ...(typeof item.text === 'string' ? { text: item.text } : {}),
      ...(hasStart ? { start: item.start, end: item.end } : {}),
      _id: source._id,
      org: source.org,
    } as T
  })
  return result
}

const seconds = (milliseconds: number): string => (milliseconds / 1_000).toFixed(1)

export const buildFrameDurationPrompt = (
  contract: FrameDurationContract,
  previous?: FrameDurationAssessment,
): string => {
  const lines = [
    '## Output duration contract (highest priority)',
    `- Final edited timeline target: ${seconds(contract.targetDurationMs)} seconds.`,
    `- Accepted total timeline range: ${seconds(contract.minDurationMs)}-${seconds(contract.maxDurationMs)} seconds.`,
    `- Narration target: ${contract.targetCharacters} non-whitespace characters and about ${seconds(contract.targetNarrationDurationMs)} seconds.`,
    `- Original-audio target: about ${seconds(contract.targetOriginalDurationMs)} seconds.`,
    '- Calculate duration by summing every item end-start. The narration/original ratio is based on duration, never item count.',
    '- Use only events, dialogue, and visual evidence present in the supplied video context. Do not invent content to fill time.',
    '- Treat the target duration as the planning center, not an exact quota. Any result inside the accepted range is valid.',
    '- Within the accepted range, prioritize factual accuracy, complete causal links, coherent narration, and natural pacing over matching the target second exactly.',
    '- Never omit a key plot turn or add repetitive filler solely to move the timeline closer to the target.',
    '- Before returning JSON, verify the character count, total duration, and duration ratio against this contract.',
  ]
  if (previous) {
    lines.push(
      '## Previous attempt diagnostics (regenerate the complete result)',
      `- Narration characters: ${previous.narrationCharacters}.`,
      `- Total timeline: ${seconds(previous.timelineDurationMs)} seconds.`,
      `- Narration timeline: ${seconds(previous.narrationDurationMs)} seconds.`,
      `- Original-audio timeline: ${seconds(previous.originalDurationMs)} seconds.`,
      `- Validation issues: ${previous.issues.join('; ')}.`,
    )
  }
  return lines.join('\n')
}

export const buildFrameNarrationRepairPrompt = (
  contract: FrameDurationContract,
  assessment: FrameDurationAssessment,
  mode: FrameNarrationRepairMode,
  existingPrompt?: string | null,
  includeTimeline = true,
): string => [
  existingPrompt?.trim(),
  [
    '## Evidence-constrained Pro script repair (highest priority)',
    `- Repair mode: ${mode === 'quality' ? 'quality editing' : 'duration contract correction'}.`,
    '- Edit the supplied current_items; do not restart the story from scratch.',
    '- The supplied evidence_context is authoritative. Correct unsupported claims and never invent events, motives, dialogue, names, conclusions, or visual details.',
    '- Preserve the complete causal chain, key plot turns, chronology, character relationships, suspense, emotional progression, point of view, and requested narration style.',
    '- Return only items that actually need changes. Omitted items are preserved locally without any modification.',
    `- Every returned item must use an existing _id and include ${includeTimeline ? 'text plus start/end only when timing changes' : 'only the revised text'}. Never return a new or duplicate _id.`,
    '- Never return org. Original dialogue is immutable and is preserved locally from current_items.',
    '- Keep each item role unchanged: narration items stay narration, and original-audio items stay original audio.',
    ...(mode === 'quality'
      ? ['- The current timeline already passes the contract. Keep every start and end value exactly unchanged.']
      : []),
    '- Keep protected names, numbers, quoted terms, and factual identifiers in their original item. Do not move facts between items.',
    '- Rewrite narration text only where needed. Adjust start/end only when required by the duration contract and only within intervals supported by the evidence.',
    `- Current narration characters: ${assessment.narrationCharacters}; accepted range: ${contract.minCharacters}-${contract.maxCharacters}.`,
    `- Current timeline: ${seconds(assessment.timelineDurationMs)} seconds; accepted range: ${seconds(contract.minDurationMs)}-${seconds(contract.maxDurationMs)} seconds.`,
    `- Target narration ratio: ${contract.narrationRatio.toFixed(2)} with tolerance ${NARRATION_RATIO_TOLERANCE.toFixed(2)}.`,
    `- Current validation issues: ${assessment.issues.length > 0 ? assessment.issues.join('; ') : 'none; perform quality editing without changing valid timing'}.`,
    `- Return exactly one JSON object containing the minimal patch set: ${includeTimeline ? '{"items":[{"_id":1,"text":"...","start":0,"end":1}]}' : '{"items":[{"_id":1,"text":"..."}]}'}.`,
    '- Do not return analysis, comments, Markdown, or fields outside items.',
  ].join('\n'),
].filter(Boolean).join('\n\n')

export const mergeFrameDurationPrompt = (
  customPrompt: string | null | undefined,
  contract: FrameDurationContract,
  previous?: FrameDurationAssessment,
): string => [customPrompt?.trim(), buildFrameDurationPrompt(contract, previous)]
  .filter(Boolean)
  .join('\n\n')

export const formatFrameDurationFailure = (
  assessment: FrameDurationAssessment,
  contract: FrameDurationContract,
): string => (
  `duration contract failed: target=${contract.targetDurationMs}ms, actual=${assessment.timelineDurationMs}ms, `
  + `characters=${assessment.narrationCharacters}/${contract.targetCharacters}, issues=${assessment.issues.join('; ')}`
)
