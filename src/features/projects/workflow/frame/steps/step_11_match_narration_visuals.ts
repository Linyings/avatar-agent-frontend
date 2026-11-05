import { scriptGenerationServiceV2, type BaseGenerateScriptStreamEvent, type GenerateScriptResponse, type MatchNarrationVisualsRequest } from '@/features/projects/services/scriptGenerationServiceV2'
import { buildFrameScriptGenerationConfig } from '@/features/projects/services/material/frameInferencePipelineService'
import { throwIfAborted } from '@/shared/utils/abort'
import { getFrameWorkflowBackendProjectId, type FrameWorkflowRuntimeContext, type FrameWorkflowStep, type GenerateNarrationScriptOutput, type MatchNarrationVisualsOutput, type MergeVideoContextOutput } from '../types'
import { requireOutput } from '../utils/records'
import { updateWorkflowStepProgress } from '../utils/progress'
import { appendStreamPreviewChunk, streamPreview } from '../utils/workflowValue'
import { buildFrameWorkflowCacheContext } from '../utils/cacheContext'

type MatchNarrationVisualsStepInput =
  | { passthrough: true }
  | (MatchNarrationVisualsRequest & { passthrough?: false })

const scopedIdentity = (context: FrameWorkflowRuntimeContext, suffix: string) => context.workflowRequestIdentity
  ? { ...context.workflowRequestIdentity, workflowStepId: 'match-narration-visuals.' + suffix }
  : undefined

const normalizeNarrationText = (text: string): string => text.replace(/\s+/g, '').trim()
const rangesOverlap = (leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): boolean => (
  Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart) > 0.01
)


const MATCH_NARRATION_RATIO_TOLERANCE = 0.1
const MAX_MIX_ROLE_SWITCHES = 4
const MAX_ORIGINAL_TO_NARRATION_GAP_SECONDS = 30

interface MatchedNarrationMixAssessment {
  issues: string[]
  estimatedNarrationDurationSeconds: number
  originalDurationSeconds: number
  estimatedNarrationRatio: number
}


const requestedNarrationRatio = (videoConfig: MatchNarrationVisualsRequest['video_config']): number | undefined => {
  const raw = Number(videoConfig?.narration_ratio)
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : undefined
}
interface ExcludedSourceRange {
  start: number
  end: number
}

const MAX_SYNTHESIZED_ORIGINAL_BLOCK_SECONDS = 40
const MAX_SYNTHESIZED_ORIGINAL_BLOCKS = 2
const MIN_SYNTHESIZED_ORIGINAL_BLOCK_SECONDS = 12
const MIN_DETECTABLE_SILENT_SECONDS = 8
const LYRIC_MIN_SUBTITLE_SECONDS = 8
const LYRIC_ABSOLUTE_MIN_SUBTITLE_SECONDS = 12
const LYRIC_MAX_CHARS_PER_SECOND = 4
const OP_ED_PAD_BEFORE_SECONDS = 10
const OP_ED_PAD_AFTER_SECONDS = 25
const OP_ED_MARKER_MERGE_GAP_SECONDS = 60
// The shared schema requires non-empty org text to classify an item as original
// footage. U+2063 is invisible, so it cannot leak an internal label into subtitles.
const SYNTHESIZED_ORIGINAL_MARKER = '\u2063'

type SubtitleSpan = ExcludedSourceRange

const parseExcludedSourceRanges = (metadata: unknown): SubtitleSpan[] => {
  if (!metadata || typeof metadata !== 'object' || !Array.isArray((metadata as Record<string, unknown>).excluded_source_ranges)) {
    return []
  }
  return ((metadata as Record<string, unknown>).excluded_source_ranges as unknown[]).flatMap(value => {
    if (!value || typeof value !== 'object') return []
    const range = value as Record<string, unknown>
    const start = Number(range.start)
    const end = Number(range.end)
    if (
      (range.type !== 'opening_song' && range.type !== 'ending_song')
      || !Number.isFinite(start)
      || !Number.isFinite(end)
      || start < 0
      || end <= start
    ) return []
    return [{ start, end }]
  }).sort((left, right) => left.start - right.start || left.end - right.end)
}

const mergeRanges = (ranges: SubtitleSpan[]): SubtitleSpan[] => {
  const sorted = ranges
    .filter(range => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end)
  const merged: SubtitleSpan[] = []
  for (const range of sorted) {
    const last = merged.at(-1)
    if (last && range.start <= last.end + 0.01) {
      last.end = Math.max(last.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

const subtractRanges = (gap: SubtitleSpan, excluded: SubtitleSpan[]): SubtitleSpan[] => {
  let pieces: SubtitleSpan[] = [{ start: gap.start, end: gap.end }]
  for (const range of excluded) {
    pieces = pieces.flatMap(piece => {
      if (range.end <= piece.start + 0.01 || range.start >= piece.end - 0.01) return [piece]
      const fragments: SubtitleSpan[] = []
      if (piece.start < range.start - 0.01) fragments.push({ start: piece.start, end: range.start })
      if (piece.end > range.end + 0.01) fragments.push({ start: range.end, end: piece.end })
      return fragments
    })
  }
  return pieces
}

const coverageFraction = (range: SubtitleSpan, contentRanges: SubtitleSpan[]): number => {
  if (!contentRanges.length) return 0
  const length = range.end - range.start
  if (length <= 0) return 0
  let covered = 0
  for (const content of contentRanges) {
    const overlap = Math.min(range.end, content.end) - Math.max(range.start, content.start)
    if (overlap > 0) covered += overlap
  }
  return Math.min(1, covered / length)
}

// The merged video context stores one chunk per subtitle line (array or
// numeric-keyed map), each carrying start_time/end_time plus the transcript
// text. These spans double as "content coverage" evidence: a source span
// without any of them is silent.
const collectVideoContextSubtitleItems = (videoContext: unknown): Array<{ start: number; end: number; text: string }> => {
  if (!videoContext || typeof videoContext !== 'object') return []
  const rawItems = (videoContext as Record<string, unknown>).items
  const list = Array.isArray(rawItems)
    ? rawItems
    : rawItems && typeof rawItems === 'object'
      ? Object.values(rawItems as Record<string, unknown>)
      : []
  const items: Array<{ start: number; end: number; text: string }> = []
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    const start = Number(item.start_time ?? item.startTime ?? item.start)
    const end = Number(item.end_time ?? item.endTime ?? item.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    items.push({ start, end, text: typeof item.subtitle === 'string' ? item.subtitle : '' })
  }
  return items.sort((left, right) => left.start - right.start || left.end - right.end)
}

// Leading/trailing spans without a single subtitle line are the OP/ED pattern:
// the model never sees them (its video context starts at the first line), so
// the client detects them deterministically and treats them as excluded.
export const computeSilentSourceRanges = (
  subtitleSpans: SubtitleSpan[],
  sourceDurationSeconds: unknown,
): SubtitleSpan[] => {
  if (subtitleSpans.length === 0) return []
  const firstStart = subtitleSpans[0].start
  const lastEnd = subtitleSpans.reduce((max, span) => Math.max(max, span.end), 0)
  const duration = Number(sourceDurationSeconds)
  const ranges: SubtitleSpan[] = []
  if (firstStart >= MIN_DETECTABLE_SILENT_SECONDS) ranges.push({ start: 0, end: firstStart })
  if (Number.isFinite(duration) && duration > 0 && duration - lastEnd >= MIN_DETECTABLE_SILENT_SECONDS) {
    ranges.push({ start: lastEnd, end: duration })
  }
  return ranges
}

// OP/ED theme songs get transcribed by ASR just like dialogue, so silent-range
// detection cannot see them. Sung lyrics show up as abnormally long subtitle
// segments with low character density; a source span around such markers is an
// opening/ending song and must never appear in the final cut.
export const computeOpeningEndingSongRanges = (
  subtitleItems: Array<{ start: number; end: number; text: string }>,
  sourceDurationSeconds: unknown,
): SubtitleSpan[] => {
  const markers = subtitleItems.filter(item => {
    const duration = item.end - item.start
    if (duration >= LYRIC_ABSOLUTE_MIN_SUBTITLE_SECONDS) return true
    if (duration < LYRIC_MIN_SUBTITLE_SECONDS) return false
    const characters = item.text.replace(/\s/g, '').length
    return characters / duration < LYRIC_MAX_CHARS_PER_SECOND
  })
  if (markers.length === 0) return []
  const groups: SubtitleSpan[] = []
  for (const marker of markers) {
    const last = groups.at(-1)
    if (last && marker.start - last.end <= OP_ED_MARKER_MERGE_GAP_SECONDS) {
      last.end = Math.max(last.end, marker.end)
    } else {
      groups.push({ start: marker.start, end: marker.end })
    }
  }
  const duration = Number(sourceDurationSeconds)
  return groups.map(group => ({
    start: Math.max(0, group.start - OP_ED_PAD_BEFORE_SECONDS),
    end: Math.min(
      Number.isFinite(duration) && duration > 0 ? duration : group.end + OP_ED_PAD_AFTER_SECONDS,
      group.end + OP_ED_PAD_AFTER_SECONDS,
    ),
  }))
}

// Original-footage items carry the source audio, so an item overlapping a
// protected range (opening/ending song, model-reported exclusion) would leak
// that audio into the cut. Hard ranges drop the item. Soft ranges (silent
// spans detected from subtitle gaps) only trim the silent part away so the
// dialogue-bearing remainder survives instead of the whole clip being lost;
// the fallback then refills any missing original seconds.
export const MIN_ORIGINAL_FRAGMENT_SECONDS = 4
export const stripOriginalItemsOverlappingRanges = (
  items: GenerateScriptResponse['items'],
  excludedRanges: SubtitleSpan[],
  minimumOverlapSeconds = 1,
  softRanges: SubtitleSpan[] = [],
): { items: GenerateScriptResponse['items']; droppedCount: number; trimmedCount: number } => {
  if (excludedRanges.length === 0 && softRanges.length === 0) return { items, droppedCount: 0, trimmedCount: 0 }
  const kept: GenerateScriptResponse['items'] = []
  let droppedCount = 0
  let trimmedCount = 0
  let nextFragmentId = Math.max(0, ...items.map(item => Number(item._id) || 0)) + 1
  for (const item of items) {
    const isOriginal = !normalizeNarrationText(item.text) && Boolean(item.org?.trim())
    if (!isOriginal) {
      kept.push(item)
      continue
    }
    // Soft trim: cut silent spans out of the clip and keep dialogue-adjacent pieces.
    let pieces: SubtitleSpan[] = [{ start: item.start, end: item.end }]
    for (const range of softRanges) {
      pieces = pieces.flatMap(piece => {
        if (range.end <= piece.start + 0.01 || range.start >= piece.end - 0.01) return [piece]
        const fragments: SubtitleSpan[] = []
        if (piece.start < range.start - 0.01) fragments.push({ start: piece.start, end: range.start })
        if (piece.end > range.end + 0.01) fragments.push({ start: range.end, end: piece.end })
        return fragments
      })
    }
    const viablePieces = pieces.filter(piece => piece.end - piece.start >= MIN_ORIGINAL_FRAGMENT_SECONDS)
    if (viablePieces.length === 0) {
      droppedCount += 1
      continue
    }
    if (viablePieces.length > 1 || viablePieces[0].start !== item.start || viablePieces[0].end !== item.end) {
      trimmedCount += 1
    }
    const survivors = viablePieces.flatMap(piece => {
      const overlap = excludedRanges.reduce((total, range) => (
        total + Math.max(0, Math.min(piece.end, range.end) - Math.max(piece.start, range.start))
      ), 0)
      if (overlap > minimumOverlapSeconds) return []
      return [piece]
    })
    if (survivors.length === 0) {
      droppedCount += 1
      continue
    }
    for (const piece of survivors) {
      kept.push(piece.start === item.start && piece.end === item.end
        ? item
        : { ...item, _id: nextFragmentId++, start: piece.start, end: piece.end })
    }
  }
  return { items: kept, droppedCount, trimmedCount }
}

const buildClientExclusionPrompt = (
  silentRanges: SubtitleSpan[],
  openingEndingRanges: SubtitleSpan[],
  advertisementRanges: SubtitleSpan[] = [],
): string => {
  const lines: string[] = [
    '素材禁用区间提示（客户端按转录字幕自动检测，最高优先级）：',
  ]
  if (openingEndingRanges.length > 0) {
    lines.push(`- 以下区间检测到片头曲/片尾曲歌词字幕，属于片头/片尾，严禁出现在成片中：${openingEndingRanges.map(range => `${range.start.toFixed(2)}-${range.end.toFixed(2)} 秒`).join('、')}。`)
  }
  if (advertisementRanges.length > 0) {
    lines.push(`- 以下区间检测到博彩广告、插播推广、二维码或网站/App 引流，严禁作为解说画面或原片：${advertisementRanges.map(range => `${range.start.toFixed(2)}-${range.end.toFixed(2)} 秒`).join('、')}。`)
  }
  if (silentRanges.length > 0) {
    lines.push(`- 以下区间在转录字幕中完全没有任何对白，属于片头曲/片尾曲或纯音乐画面：${silentRanges.map(range => `${range.start.toFixed(2)}-${range.end.toFixed(2)} 秒`).join('、')}。`)
  }
  lines.push(
    '- 任何解说画面与 org 原片片段都不得落入这些区间，也不得用这些区间补足时长。',
    '- 挑选原片片段时必须选择有对白字幕覆盖的剧情区间。',
    '- 请在 metadata.excluded_source_ranges 中把这些区间标记为 opening_song、ending_song、advertisement、gambling_ad 或 website_promotion。',
  )
  return lines.join('\n')
}

const joinCustomPrompts = (...parts: Array<string | undefined>): string | undefined => {
  const joined = parts.map(part => part?.trim()).filter(Boolean).join('\n\n')
  return joined || undefined
}

export const synthesizeAdjacentOriginalMix = (
  narrationItems: GenerateScriptResponse['items'],
  targetNarrationRatio: number,
  metadata?: GenerateScriptResponse['metadata'],
  options: { excludedRanges?: SubtitleSpan[]; contentRanges?: SubtitleSpan[]; plannedOriginalCount?: number } = {},
): GenerateScriptResponse['items'] => {
  const orderedNarration = narrationItems
    .filter(item => normalizeNarrationText(item.text) && Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
    .sort((left, right) => left.start - right.start || left.end - right.end)
  if (orderedNarration.length === 0) return []

  const narrationSeconds = orderedNarration.reduce((total, item) => total + item.end - item.start, 0)
  const desiredOriginalSeconds = narrationSeconds * (1 - targetNarrationRatio) / targetNarrationRatio
  // 按选段计划补齐原片段数：兜底不是只补到"结构不报错"，而是回到计划的原片条数。
  const plannedOriginalCount = Math.max(0, Math.floor(options.plannedOriginalCount ?? 0))
  const blockLimit = Math.max(MAX_SYNTHESIZED_ORIGINAL_BLOCKS, plannedOriginalCount)
  const cappedOriginalSeconds = Math.min(
    desiredOriginalSeconds,
    MAX_SYNTHESIZED_ORIGINAL_BLOCK_SECONDS * blockLimit,
  )
  const excluded = mergeRanges([
    ...parseExcludedSourceRanges(metadata),
    ...(options.excludedRanges ?? []),
  ])

  // Candidate gaps sit before and between narration windows. The span after the
  // last narration never qualifies: the timeline must end with narration.
  const gaps: SubtitleSpan[] = []
  let cursor = 0
  for (const item of orderedNarration) {
    if (item.start - cursor > 0.01) gaps.push({ start: cursor, end: item.start })
    cursor = Math.max(cursor, item.end)
  }
  const candidates = gaps
    .flatMap(gap => subtractRanges(gap, excluded))
    .filter(range => range.end - range.start >= MIN_SYNTHESIZED_ORIGINAL_BLOCK_SECONDS)
    .map(range => {
      // The block is always cut from the tail of the free range so its footage
      // runs straight into the next narration window.
      const blockLength = Math.min(MAX_SYNTHESIZED_ORIGINAL_BLOCK_SECONDS, range.end - range.start)
      const block: SubtitleSpan = { start: range.end - blockLength, end: range.end }
      return {
        block,
        // A block whose footage runs straight into the next narration window
        // keeps the picture continuous at the switch point.
        seamless: orderedNarration.some(item => Math.abs(item.start - range.end) <= 0.05),
        coverage: coverageFraction(block, options.contentRanges ?? []),
      }
    })
    .sort((left, right) => (
      Number(right.seamless) - Number(left.seamless)
      || right.coverage - left.coverage
      || (right.block.end - right.block.start) - (left.block.end - left.block.start)
    ))

  const blocks: SubtitleSpan[] = []
  let remainingSeconds = cappedOriginalSeconds
  for (const candidate of candidates) {
    if (remainingSeconds <= 0.01 || blocks.length >= blockLimit) break
    const blockLength = candidate.block.end - candidate.block.start
    const takeSeconds = Math.min(
      blockLength,
      Math.max(remainingSeconds, MIN_SYNTHESIZED_ORIGINAL_BLOCK_SECONDS),
    )
    blocks.push({ start: candidate.block.end - takeSeconds, end: candidate.block.end })
    remainingSeconds -= takeSeconds
  }
  if (blocks.length === 0) return orderedNarration

  blocks.sort((left, right) => left.start - right.start)
  let nextOriginalId = Math.max(0, ...orderedNarration.map(item => Number(item._id) || 0)) + 1
  const originalItems: GenerateScriptResponse['items'] = blocks.map(block => ({
    _id: nextOriginalId++,
    text: '',
    start: block.start,
    end: block.end,
    org: SYNTHESIZED_ORIGINAL_MARKER,
  }))
  // Blocks may sit between narration windows now, so playback order is by start.
  return [...originalItems, ...orderedNarration].sort((left, right) => left.start - right.start || left.end - right.end)
}
export const synthesizeAnchoredNarrationItems = (
  requiredItems: MatchNarrationVisualsRequest['script_items'],
  validItems: GenerateScriptResponse['items'] = [],
): GenerateScriptResponse['items'] => {
  const validById = new Map(validItems.map(item => [Number(item._id), item]))
  let previousEnd = Number.NEGATIVE_INFINITY
  return requiredItems.flatMap(required => {
    const valid = validById.get(Number(required._id))
    if (
      valid
      && valid.start >= previousEnd - 0.01
      && valid.start >= required.source_start - 0.01
      && valid.end <= required.source_end + 0.01
      && valid.end > valid.start
    ) {
      previousEnd = valid.end
      return [{ ...valid, _id: required._id, text: required.text, org: '' }]
    }

    const start = Math.max(required.source_start, previousEnd)
    const estimatedVoiceSeconds = Math.max(2, normalizeNarrationText(required.text).length / 5)
    const end = Math.min(required.source_end, start + estimatedVoiceSeconds)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start + 0.01) return []
    previousEnd = end
    return [{
      _id: required._id,
      text: required.text,
      start,
      end,
      org: '',
    }]
  })
}

export const assessMatchedNarrationMix = (
  items: GenerateScriptResponse['items'],
  targetNarrationRatio: number | undefined,
  options: { allowLeadingNarration?: boolean; allowNarrationOnly?: boolean } = {},
): MatchedNarrationMixAssessment => {
  const narrationItems = items.filter(item => normalizeNarrationText(item.text))
  const originalItems = items.filter(item => !normalizeNarrationText(item.text) && item.org?.trim())
  const estimatedNarrationDurationSeconds = narrationItems.reduce((total, item) => total + Math.max(0, item.end - item.start), 0)
  const originalDurationSeconds = originalItems.reduce(
    (total, item) => total + Math.max(0, item.end - item.start),
    0,
  )
  const totalDurationSeconds = estimatedNarrationDurationSeconds + originalDurationSeconds
  const estimatedNarrationRatio = totalDurationSeconds > 0
    ? estimatedNarrationDurationSeconds / totalDurationSeconds
    : 0
  const issues: string[] = []
  if (targetNarrationRatio == null) {
    return { issues, estimatedNarrationDurationSeconds, originalDurationSeconds, estimatedNarrationRatio }
  }
  const narrationOnly = options.allowNarrationOnly || targetNarrationRatio >= 1
  if (!narrationOnly && originalItems.length === 0) issues.push('时间线缺少原片声片段')
  if (Math.abs(estimatedNarrationRatio - targetNarrationRatio) > MATCH_NARRATION_RATIO_TOLERANCE) {
    issues.push(`预计解说占比 ${Math.round(estimatedNarrationRatio * 100)}%，目标 ${Math.round(targetNarrationRatio * 100)}%`)
  }
  const roleBlocks = items.reduce<Array<{ role: 'narration' | 'original'; start: number; end: number }>>((blocks, item) => {
    const role = normalizeNarrationText(item.text) ? 'narration' : 'original'
    const previous = blocks.at(-1)
    if (previous?.role === role) {
      previous.end = item.end
    } else {
      blocks.push({ role, start: item.start, end: item.end })
    }
    return blocks
  }, [])
  const compressedRoles = roleBlocks.map(block => block.role)
  if (compressedRoles[0] !== 'original' && !options.allowLeadingNarration && !narrationOnly) issues.push('时间线必须先播放原片，再进入解说')
  if (compressedRoles[compressedRoles.length - 1] !== 'narration') issues.push('时间线结尾应由解说收束')
  if (Math.max(0, compressedRoles.length - 1) > MAX_MIX_ROLE_SWITCHES) {
    issues.push(`原片与解说切换次数超过 ${MAX_MIX_ROLE_SWITCHES} 次`)
  }
  roleBlocks.forEach((block, index) => {
    if (block.role !== 'original') return
    const nextNarration = roleBlocks.slice(index + 1).find(candidate => candidate.role === 'narration')
    if (!nextNarration || nextNarration.start - block.end > MAX_ORIGINAL_TO_NARRATION_GAP_SECONDS) {
      issues.push(`原片区间 ${block.start}-${block.end} 后缺少紧邻解说`)
    }
  })
  return { issues, estimatedNarrationDurationSeconds, originalDurationSeconds, estimatedNarrationRatio }
}

interface AnchoredTimelineValidation {
  items: GenerateScriptResponse['items']
  validNarrationItems: GenerateScriptResponse['items']
  invalidItems: MatchNarrationVisualsRequest['script_items']
  originalItems: GenerateScriptResponse['items']
  droppedCount: number
  trimmedCount: number
}

export const validateAnchoredMatchedTimeline = (
  requiredItems: MatchNarrationVisualsRequest['script_items'],
  matchedItems: GenerateScriptResponse['items'],
): AnchoredTimelineValidation => {
  const usedMatchedIndexes = new Set<number>()
  const validByRequiredId = new Map<number, GenerateScriptResponse['items'][number]>()

  requiredItems.forEach(required => {
    const candidates = matchedItems.flatMap((candidate, index) => {
      if (usedMatchedIndexes.has(index) || !normalizeNarrationText(candidate.text)) return []
      const exactText = normalizeNarrationText(candidate.text) === normalizeNarrationText(required.text)
      const sameId = Number(candidate._id) === Number(required._id)
      return exactText || sameId ? [{ candidate, index, exactText }] : []
    }).sort((left, right) => Number(right.exactText) - Number(left.exactText))
    const match = candidates[0]
    if (!match) return
    usedMatchedIndexes.add(match.index)
    const { candidate } = match
    const validRange = Number.isFinite(candidate.start)
      && Number.isFinite(candidate.end)
      && candidate.end > candidate.start
      && candidate.start >= required.source_start - 0.01
      && candidate.end <= required.source_end + 0.01
    if (!validRange) return
    validByRequiredId.set(required._id, { ...candidate, _id: required._id, text: required.text, org: '' })
  })

  let previousEnd = Number.NEGATIVE_INFINITY
  requiredItems.forEach(required => {
    const candidate = validByRequiredId.get(required._id)
    if (!candidate) return
    if (candidate.start < previousEnd - 0.01) {
      validByRequiredId.delete(required._id)
      return
    }
    previousEnd = candidate.end
  })

  const validNarrationItems = requiredItems.flatMap(required => {
    const item = validByRequiredId.get(required._id)
    return item ? [item] : []
  })
  const invalidItems = requiredItems.filter(required => !validByRequiredId.has(required._id))
  const narrationRanges = validNarrationItems.map(item => ({ start: item.start, end: item.end }))
  const rawOriginalItems = matchedItems.filter(item => (
    !normalizeNarrationText(item.text)
    && item.org?.trim()
    && Number.isFinite(item.start)
    && Number.isFinite(item.end)
    && item.end > item.start
  ))
  const splitOriginalItems = rawOriginalItems.flatMap(item => {
    let pieces = [{ start: item.start, end: item.end }]
    narrationRanges.forEach(range => {
      pieces = pieces.flatMap(piece => {
        if (!rangesOverlap(piece.start, piece.end, range.start, range.end)) return [piece]
        const fragments: Array<{ start: number; end: number }> = []
        if (piece.start < range.start - 0.01) fragments.push({ start: piece.start, end: range.start })
        if (piece.end > range.end + 0.01) fragments.push({ start: range.end, end: piece.end })
        return fragments
      })
    })
    return pieces.map(piece => ({ ...item, start: piece.start, end: piece.end }))
  }).sort((left, right) => left.start - right.start || left.end - right.end)

  let nextOriginalId = Math.max(0, ...requiredItems.map(item => item._id)) + 1
  let previousOriginalEnd = Number.NEGATIVE_INFINITY
  const originalItems = splitOriginalItems.flatMap(item => {
    const start = Math.max(item.start, previousOriginalEnd)
    if (item.end - start <= 0.01) return []
    previousOriginalEnd = item.end
    return [{ ...item, _id: nextOriginalId++, start }]
  })
  const items = [...validNarrationItems, ...originalItems]
    .sort((left, right) => left.start - right.start || left.end - right.end)

  return { items, validNarrationItems, invalidItems, originalItems, droppedCount: 0, trimmedCount: 0 }
}

const sanitizeTimelineAgainstExclusions = (
  validation: AnchoredTimelineValidation,
  excludedRanges: SubtitleSpan[],
  softRanges: SubtitleSpan[] = [],
): AnchoredTimelineValidation => {
  const { items, droppedCount, trimmedCount } = stripOriginalItemsOverlappingRanges(validation.items, excludedRanges, 1, softRanges)
  if (droppedCount === 0 && trimmedCount === 0) return validation
  return { ...validation, items, droppedCount, trimmedCount }
}

const buildNarrationCoverageRepairPrompt = (customPrompt: string | undefined, missingItems: MatchNarrationVisualsRequest['script_items']): string => {
  const missingIds = missingItems.map((item) => item._id).join(', ')
  const repairRule = [
    '\u753b\u9762\u5339\u914d\u81ea\u52a8\u4fee\u590d\u8981\u6c42\uff08\u6700\u9ad8\u4f18\u5148\u7ea7\uff09\uff1a',
    `- \u4e0a\u4e00\u6b21\u7ed3\u679c\u9057\u6f0f\u4e86 script_items ID: ${missingIds}\u3002`,
    '- \u8f93\u51fa\u5fc5\u987b\u9010\u5b57\u4fdd\u7559 script_items \u4e2d\u6bcf\u4e00\u6761\u975e\u7a7a text\uff0c\u4e14\u6bcf\u6761\u6070\u597d\u51fa\u73b0\u4e00\u6b21\u3002',
    '- \u4e0d\u5f97\u5220\u9664\u3001\u5408\u5e76\u6216\u6539\u5199\u4efb\u4f55\u4e00\u6761\u5df2\u5ba1\u6838\u89e3\u8bf4\u6587\u6848\u3002',
    '- \u53ef\u4ee5\u63d2\u5165 org \u539f\u7247\u6bb5\uff0c\u4f46\u5fc5\u987b\u4e3a\u6bcf\u6761\u89e3\u8bf4\u6587\u6848\u5339\u914d\u6709\u6548\u4e14\u4e0d\u91cd\u53e0\u7684\u753b\u9762\u65f6\u95f4\u6bb5\u3002',
    '- 每条解说只能在自身 source_start-source_end 证据窗口内选画面，不得借用其他条目的时间区间。',
  ].join('\n')
  return [customPrompt?.trim(), repairRule].filter(Boolean).join('\n\n')
}


const buildNarrationMixRepairPrompt = (
  customPrompt: string | undefined,
  assessment: MatchedNarrationMixAssessment,
  targetNarrationRatio: number,
  options: { allowLeadingNarration?: boolean } = {},
): string => {
  const targetOriginalSeconds = assessment.estimatedNarrationDurationSeconds
    * (1 - targetNarrationRatio)
    / targetNarrationRatio
  const repairRule = [
    '原片与解说比例自动修复要求（最高优先级）：',
    `- 上一次时间线的问题：${assessment.issues.join('；')}。`,
    `- 目标解说占比为 ${Math.round(targetNarrationRatio * 100)}%，目标原片占比为 ${Math.round((1 - targetNarrationRatio) * 100)}%。`,
    `- 当前解说预计播放 ${assessment.estimatedNarrationDurationSeconds.toFixed(1)} 秒，请安排约 ${targetOriginalSeconds.toFixed(1)} 秒原片声。`,
    '- 必须至少输出一个 text 为空且 org 非空的原片段；不得返回全解说时间线。',
    options.allowLeadingNarration
      ? '- 素材开头是片头/无对白区间时，允许时间线直接以解说块开场；原片片段放在后续解说之间有对白覆盖的剧情区间。'
      : '- 成片先播放连续原片，再进入对该原片的解说；允许分成 1-2 个“原片块 -> 解说块”，总切换不超过 4 次。',
    '- 原片与紧随其后的解说必须来自相邻剧情，时间顺序单调递增；不得为了凑时长跳到无关画面。',
    '- 每条解说的 text、_id 和 source_start-source_end 证据窗口保持不变，画面仍须在自己的证据窗口内。',
    '- 总成片时长只是软目标，不得牺牲声画匹配、剧情衔接或解说质量来硬凑时长。',
    '- 原片段使用新的临时 _id（不得与解说 _id 冲突）；输出数组必须按播放顺序排列，不得按 _id 排序时间线。',
  ].join('\n')
  return [customPrompt?.trim(), repairRule].filter(Boolean).join('\n\n')
}

export const step11MatchNarrationVisuals: FrameWorkflowStep = {
  id: 'match-narration-visuals',
  label: '画面匹配',
  description: '把已生成或已审核的解说文案匹配到原视频画面，产出可配音和合成的时间线脚本。',
  progressWeight: 6,
  dependsOn: ['generate-narration-script'],
  effects: ['network'],
  frontendWork: ['读取全局校验通过或用户确认后的文案草稿，调用后端画面匹配接口。', '返回标准 _id、text、start、end、org 脚本 items，供配音步骤使用。'],
  backendRoutes: [
    {
      method: 'POST',
      path: '/api/v1/tools/match-narration-visuals-stream',
      handler: 'OpenAI 画面匹配流式生成工具',
      purpose: '执行短剧 Prompt 第二阶段，将审核后的解说文案匹配到画面时间线。',
    },
  ],
  buildInput: ({ records, config }) => {
    const generated = requireOutput<GenerateNarrationScriptOutput>(records, 'generate-narration-script')
    if (generated.pipelineResult.selectionPlan?.narrationCount === 0) {
      return { passthrough: true }
    }
    const merged = requireOutput<MergeVideoContextOutput>(records, 'merge-video-context')
    const scriptItems = generated.approvedDraftItems?.length ? generated.approvedDraftItems : generated.draftItems
    if (!scriptItems?.length) {
      throw new Error('缺少已审核的解说文案草稿，请先完成文案审核')
    }

    const missingAnchors = scriptItems.some(item => {
      const anchored = item as Partial<MatchNarrationVisualsRequest['script_items'][number]>
      return !anchored.chapter_id
        || !Array.isArray(anchored.event_ids)
        || !Array.isArray(anchored.evidence_refs)
        || !Number.isFinite(anchored.source_start)
        || !Number.isFinite(anchored.source_end)
        || Number(anchored.source_end) <= Number(anchored.source_start)
    })
    if (missingAnchors) throw new Error('旧检查点缺少声画时间锚点，请从“生成解说文案”重新执行')
    // 骨架的实际解说占比（按时长）作为匹配校验基准：用户的解说率已在选段阶段
    // 按条数生效，这里只校验模型没有破坏骨架结构。
    const selectionPlan = generated.pipelineResult.selectionPlan
    const skeletonNarrationRatio = selectionPlan
      && selectionPlan.narrationSeconds + selectionPlan.originalSeconds > 0
      ? selectionPlan.narrationSeconds / (selectionPlan.narrationSeconds + selectionPlan.originalSeconds)
      : undefined
    return {
      video_config: {
        ...buildFrameScriptGenerationConfig(config),
        ...(skeletonNarrationRatio !== undefined ? { narration_ratio: skeletonNarrationRatio } : {}),
      },
      video_context: merged.videoContext,
      cache_context: buildFrameWorkflowCacheContext({
        transcription: merged.pipelineResult.transcription,
        subtitleResult: merged.pipelineResult.subtitleResult,
        decision: merged.pipelineResult.decision,
        analyses: merged.pipelineResult.analyses,
        language: config.outputLanguage,
      }),
      model_profile: 'pro' as const,
      script_items: scriptItems as MatchNarrationVisualsRequest['script_items'],
      ...(config.customPrompt?.trim() ? { custom_prompt: config.customPrompt.trim() } : {}),
    }
  },
  run: async (input, context) => {
    const typedInput = input as MatchNarrationVisualsStepInput
    throwIfAborted(context.signal, '画面匹配已取消')
    const generated = requireOutput<GenerateNarrationScriptOutput>(context.records, 'generate-narration-script')
    if (typedInput.passthrough) {
      const scriptResponse = generated.scriptResponse ?? generated.pipelineResult.scriptResponse
      if (!scriptResponse) throw new Error('纯原片模式缺少本地时间线')
      context.appendStepLog?.('match-narration-visuals', '解说率为 0%，已跳过模型画面匹配并沿用原片骨架。')
      updateWorkflowStepProgress(context, 'match-narration-visuals', 100, '纯原片时间线已确认')
      return {
        scriptResponse,
        passthrough: true,
        pipelineResult: {
          ...generated.pipelineResult,
          approvedNarrationDraftItems: [],
          scriptResponse,
        },
      } satisfies MatchNarrationVisualsOutput
    }
    const subtitleItems = collectVideoContextSubtitleItems(typedInput.video_context)
    const subtitleSpans = subtitleItems.map(item => ({ start: item.start, end: item.end }))
    const sourceDurationSeconds = (typedInput.cache_context as { context_strategy?: { source_duration_seconds?: unknown } } | undefined)?.context_strategy?.source_duration_seconds
    const silentRanges = computeSilentSourceRanges(subtitleSpans, sourceDurationSeconds)
    const openingEndingRanges = computeOpeningEndingSongRanges(subtitleItems, sourceDurationSeconds)
    const advertisementRanges = generated.pipelineResult.selectionPlan?.advertisementRanges ?? []
    const clientExcludedRanges = mergeRanges([...silentRanges, ...openingEndingRanges, ...advertisementRanges])
    const clientExclusionPrompt = silentRanges.length > 0 || openingEndingRanges.length > 0 || advertisementRanges.length > 0
      ? buildClientExclusionPrompt(silentRanges, openingEndingRanges, advertisementRanges)
      : undefined
    const baseCustomPrompt = joinCustomPrompts(typedInput.custom_prompt, clientExclusionPrompt)
    const allowLeadingNarration = silentRanges.some(range => range.start <= 0.01)

    let streamedThinking = ''
    let streamedAnswer = ''
    updateWorkflowStepProgress(context, 'match-narration-visuals', 5, '正在提交画面匹配请求')
    context.appendStepLog?.('match-narration-visuals', '已开始监听画面匹配流式输出')

    let scriptResponse: GenerateScriptResponse
    let modelTimelineAvailable = true
    try {
      scriptResponse = await scriptGenerationServiceV2.matchNarrationVisualsStream(
      {
        ...typedInput,
        ...(baseCustomPrompt ? { custom_prompt: baseCustomPrompt } : {}),
        project_id: getFrameWorkflowBackendProjectId(context),
      },
      {
        signal: context.signal,
        workflowIdentity: scopedIdentity(context, 'initial'),
        onEvent: (event: BaseGenerateScriptStreamEvent<unknown>) => {
          if (event.type === 'stage') {
            updateWorkflowStepProgress(context, 'match-narration-visuals', 10, event.message || event.stage)
            context.appendStepLog?.('match-narration-visuals', `流式阶段：${event.message || event.stage}`)
            return
          }
          if (event.type === 'thinking_delta') {
            streamedThinking = appendStreamPreviewChunk(streamedThinking, event.delta)
            context.updateStepLog?.('match-narration-visuals', '模型思考流：', `模型思考流：${streamPreview(streamedThinking)}`)
            updateWorkflowStepProgress(context, 'match-narration-visuals', Math.min(45, 15 + streamedThinking.length / 80), '正在接收画面匹配思考流')
            return
          }
          if (event.type === 'answer_delta') {
            streamedAnswer = appendStreamPreviewChunk(streamedAnswer, event.delta)
            context.updateStepLog?.('match-narration-visuals', '模型输出：', `模型输出：${streamPreview(streamedAnswer, 800)}`)
            updateWorkflowStepProgress(context, 'match-narration-visuals', Math.min(92, 50 + streamedAnswer.length / 60), '正在接收画面匹配结果')
            return
          }
          if (event.type === 'usage') {
            updateWorkflowStepProgress(context, 'match-narration-visuals', 95, `Token 用量：${event.usage.total_tokens}`)
            context.appendStepLog?.('match-narration-visuals', `Token 用量：${event.usage.total_tokens}`)
            return
          }
          if (event.type === 'completed') {
            updateWorkflowStepProgress(context, 'match-narration-visuals', 100, `已匹配 ${event.items.length} 条脚本`)
            context.appendStepLog?.('match-narration-visuals', `流式完成：匹配 ${event.items.length} 条脚本，模型 ${event.model || '未知'}`)
            return
          }
          if (event.type === 'error') {
            context.appendStepLog?.('match-narration-visuals', `流式错误：${event.message}`)
          }
        },
      },
      )
    } catch (initialError) {
      if (context.signal?.aborted) throw initialError
      modelTimelineAvailable = false
      const message = initialError instanceof Error ? initialError.message : String(initialError)
      context.appendStepLog?.('match-narration-visuals', `画面匹配模型不可用（${message}），已改用本地骨架时间线（解说锚点 + 对白区间原片块）继续，不再阻塞流程。`)
      const localRatio = requestedNarrationRatio(typedInput.video_config) ?? 0.5
      const localNarrationItems = typedInput.script_items.map(item => ({
        _id: item._id,
        text: item.text,
        start: item.source_start,
        end: item.source_end,
        org: '',
      }))
      const localItems = synthesizeAdjacentOriginalMix(
        localNarrationItems,
        localRatio,
        undefined,
        {
          excludedRanges: clientExcludedRanges,
          contentRanges: subtitleSpans,
          plannedOriginalCount: generated.pipelineResult?.selectionPlan?.originalCount,
        },
      )
      scriptResponse = {
        items: localItems,
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        model: 'local-skeleton',
        request_id: 'local-skeleton',
      } as GenerateScriptResponse
    }
    const initialMetadata = scriptResponse.metadata
    let matchTokens = scriptResponse.usage.total_tokens || 0
    let timelineValidation = validateAnchoredMatchedTimeline(typedInput.script_items, scriptResponse.items)
    if (timelineValidation.invalidItems.length > 0 && modelTimelineAvailable) {
      const invalidIds = timelineValidation.invalidItems.map(item => item._id).join(', ')
      context.appendStepLog?.('match-narration-visuals', `画面匹配有 ${timelineValidation.invalidItems.length} 段缺失、越界或重叠（ID: ${invalidIds}），正在仅修复这些段落。`)
      updateWorkflowStepProgress(context, 'match-narration-visuals', 96, '正在自动修复未通过锚点校验的解说画面')
      throwIfAborted(context.signal, '画面匹配已取消')
      let repairedResponse: GenerateScriptResponse
      try {
        repairedResponse = await scriptGenerationServiceV2.matchNarrationVisualsStream(
        {
          ...typedInput,
          script_items: timelineValidation.invalidItems,
          project_id: getFrameWorkflowBackendProjectId(context),
          custom_prompt: buildNarrationCoverageRepairPrompt(baseCustomPrompt, timelineValidation.invalidItems),
        },
        {
          signal: context.signal,
          workflowIdentity: scopedIdentity(context, 'coverage-repair-1'),
        },
      )
        matchTokens += repairedResponse.usage.total_tokens || 0
      } catch (coverageError) {
        if (context.signal?.aborted) throw coverageError
        const message = coverageError instanceof Error ? coverageError.message : String(coverageError)
        context.appendStepLog?.('match-narration-visuals', '覆盖率修复模型调用失败（' + message + '），直接使用 PC 本地锚点兜底。')
        repairedResponse = {
          items: [],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          model: 'local',
          request_id: 'local-coverage-repair',
        } as GenerateScriptResponse
      }
      timelineValidation = validateAnchoredMatchedTimeline(
        typedInput.script_items,
        [...timelineValidation.validNarrationItems, ...timelineValidation.originalItems, ...repairedResponse.items],
      )
      if (timelineValidation.invalidItems.length > 0) {
        const fallbackItems = synthesizeAnchoredNarrationItems(
          typedInput.script_items,
          timelineValidation.validNarrationItems,
        )
        timelineValidation = validateAnchoredMatchedTimeline(typedInput.script_items, fallbackItems)
        if (timelineValidation.invalidItems.length > 0) {
          context.appendStepLog?.(
            'match-narration-visuals',
            `${timelineValidation.invalidItems.length} 段解说经修复与本地兜底仍无法放入自身证据窗口，已丢弃并继续（ID: ${timelineValidation.invalidItems.map(item => item._id).join(', ')}），不再阻塞流程。`,
          )
        }
        context.appendStepLog?.(
          'match-narration-visuals',
          '模型锚点修复仍越界，PC 本地锚点兜底已按每段文案自己的 source_start-source_end 证据窗口重建画面区间。',
        )
      }
      scriptResponse = { ...repairedResponse, metadata: initialMetadata ?? repairedResponse.metadata, items: timelineValidation.items }
    } else if (timelineValidation.invalidItems.length > 0) {
      const fallbackItems = synthesizeAnchoredNarrationItems(
        typedInput.script_items,
        timelineValidation.validNarrationItems,
      )
      timelineValidation = validateAnchoredMatchedTimeline(typedInput.script_items, fallbackItems)
      scriptResponse = { ...scriptResponse, items: timelineValidation.items }
      context.appendStepLog?.('match-narration-visuals', '模型不可用，本地骨架锚点已按每段文案自己的证据窗口重建画面区间。')
    } else {
      scriptResponse = { ...scriptResponse, items: timelineValidation.items }
    }

    // 片头/片尾曲与模型排除区间是硬约束（整段剔除）；无对白区间只做软收缩，
    // 保留对白边界的碎片，避免模型选中的原片段被整段误杀。
    const hardExcludedRanges = mergeRanges([
      ...parseExcludedSourceRanges(initialMetadata ?? scriptResponse.metadata),
      ...openingEndingRanges,
      ...advertisementRanges,
    ])
    const sanitizedTimeline = sanitizeTimelineAgainstExclusions(timelineValidation, hardExcludedRanges, silentRanges)
    if (sanitizedTimeline.items !== timelineValidation.items) {
      const originalBefore = timelineValidation.items.filter(item => !normalizeNarrationText(item.text) && item.org?.trim()).length
      const originalAfter = sanitizedTimeline.items.filter(item => !normalizeNarrationText(item.text) && item.org?.trim()).length
      context.appendStepLog?.(
        'match-narration-visuals',
        `原片段保护：剔除 ${sanitizedTimeline.droppedCount} 个落入片头/片尾或广告区间的原片段，收缩 ${sanitizedTimeline.trimmedCount} 个含无对白区间的原片段（原片段数 ${originalBefore} → ${originalAfter}），缺失部分由后续步骤补足。`,
      )
    }
    timelineValidation = sanitizedTimeline
    scriptResponse = { ...scriptResponse, items: timelineValidation.items }

    const narrationOnly = generated.pipelineResult.selectionPlan?.originalCount === 0
    if (narrationOnly && timelineValidation.originalItems.length > 0) {
      timelineValidation = {
        ...timelineValidation,
        items: timelineValidation.validNarrationItems,
        originalItems: [],
      }
      scriptResponse = { ...scriptResponse, items: timelineValidation.items }
    }
    const narrationRatio = narrationOnly ? 1 : requestedNarrationRatio(typedInput.video_config)
    const mixOptions = {
      allowLeadingNarration: allowLeadingNarration || narrationOnly,
      allowNarrationOnly: narrationOnly,
    }
    let mixAssessment = assessMatchedNarrationMix(timelineValidation.items, narrationRatio, mixOptions)
    if (mixAssessment.issues.length > 0 && narrationRatio != null) {
      context.appendStepLog?.(
        'match-narration-visuals',
        `原片/解说结构未通过校验：${mixAssessment.issues.join('；')}。正在自动重建连续混合时间线。`,
      )
      updateWorkflowStepProgress(context, 'match-narration-visuals', 97, '正在自动修复原片与解说的比例和衔接')
      throwIfAborted(context.signal, '画面匹配已取消')
      let mixRepairedResponse: GenerateScriptResponse
      try {
        mixRepairedResponse = await scriptGenerationServiceV2.matchNarrationVisualsStream(
        {
          ...typedInput,
          project_id: getFrameWorkflowBackendProjectId(context),
          custom_prompt: buildNarrationMixRepairPrompt(baseCustomPrompt, mixAssessment, narrationRatio, { allowLeadingNarration }),
        },
        {
          signal: context.signal,
          workflowIdentity: scopedIdentity(context, 'mix-repair-1'),
        },
      )
        matchTokens += mixRepairedResponse.usage.total_tokens || 0
      } catch (mixRepairError) {
        if (context.signal?.aborted) throw mixRepairError
        const message = mixRepairError instanceof Error ? mixRepairError.message : String(mixRepairError)
        context.appendStepLog?.('match-narration-visuals', '比例修复模型调用失败（' + message + '），跳过模型修复，直接使用本地兜底时间线。')
        mixRepairedResponse = {
          items: [],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          model: 'local',
          request_id: 'local-mix-repair',
          metadata: initialMetadata,
        } as GenerateScriptResponse
      }
      let mixTimelineValidation = validateAnchoredMatchedTimeline(typedInput.script_items, mixRepairedResponse.items)
      if (mixTimelineValidation.invalidItems.length > 0) {
        context.appendStepLog?.(
          'match-narration-visuals',
          `模型比例修复返回了越界段落（ID: ${mixTimelineValidation.invalidItems.map(item => item._id).join(', ')}），将保留此前已通过的证据锚点并由 PC 本地重建原片块。`,
        )
        mixTimelineValidation = timelineValidation
      }
      mixTimelineValidation = sanitizeTimelineAgainstExclusions(mixTimelineValidation, hardExcludedRanges, silentRanges)
      mixAssessment = assessMatchedNarrationMix(mixTimelineValidation.items, narrationRatio, mixOptions)
      if (mixAssessment.issues.length > 0) {
        const plannedOriginalCount = generated.pipelineResult?.selectionPlan?.originalCount
        const synthesizedItems = synthesizeAdjacentOriginalMix(
          mixTimelineValidation.validNarrationItems,
          narrationRatio,
          initialMetadata ?? mixRepairedResponse.metadata,
          { excludedRanges: clientExcludedRanges, contentRanges: subtitleSpans, plannedOriginalCount },
        )
        const fallbackValidation = validateAnchoredMatchedTimeline(typedInput.script_items, synthesizedItems)
        const fallbackAssessment = assessMatchedNarrationMix(fallbackValidation.items, narrationRatio, mixOptions)
        if (fallbackValidation.invalidItems.length > 0 || fallbackAssessment.issues.length > 0) {
          const issues = fallbackAssessment.issues.length > 0 ? fallbackAssessment.issues : mixAssessment.issues
          context.appendStepLog?.(
            'match-narration-visuals',
            `画面匹配自动修复后结构仍有偏差（${issues.join('；')}），按当前最佳时间线继续，不再阻塞流程。`,
          )
        }
        timelineValidation = fallbackValidation
        mixAssessment = fallbackAssessment
        scriptResponse = {
          ...mixRepairedResponse,
          metadata: initialMetadata ?? mixRepairedResponse.metadata,
          items: fallbackValidation.items,
        }
        context.appendStepLog?.(
          'match-narration-visuals',
          `模型修复仍未提供有效原片，PC 本地兜底已从有对白覆盖的剧情区间补入 ${fallbackAssessment.originalDurationSeconds.toFixed(1)} 秒原片（按选段计划补齐至 ${plannedOriginalCount ?? MAX_SYNTHESIZED_ORIGINAL_BLOCKS} 块），解说占比约 ${Math.round(fallbackAssessment.estimatedNarrationRatio * 100)}%。`,
        )
      } else {
        timelineValidation = mixTimelineValidation
        scriptResponse = {
          ...mixRepairedResponse,
          metadata: initialMetadata ?? mixRepairedResponse.metadata,
          items: mixTimelineValidation.items,
        }
      }
    }
    // 永不阻塞的时长保障：模型遗漏的解说块按原片播放补回，时间线长度不缩水
    const coveredNarrationIds = new Set(
      timelineValidation.items
        .filter(item => typeof item.text === 'string' && item.text.trim() !== '')
        .map(item => Number(item._id)),
    )
    const missingNarrationItems = typedInput.script_items.filter(item => !coveredNarrationIds.has(Number(item._id)))
    if (missingNarrationItems.length > 0) {
      let nextOriginalId = Math.max(0, ...timelineValidation.items.map(item => Number(item._id) || 0)) + 1
      for (const missing of missingNarrationItems) {
        timelineValidation.items.push({
          _id: nextOriginalId++,
          text: '',
          start: missing.source_start,
          end: missing.source_end,
          org: '⁣',
        })
      }
      timelineValidation.items.sort((left, right) => left.start - right.start || left.end - right.end)
      context.appendStepLog?.(
        'match-narration-visuals',
        `${missingNarrationItems.length} 段解说被模型遗漏，已按原片播放补回（无解说覆盖），时间线长度保持完整。`,
      )
    }
    context.appendStepLog?.(
      'match-narration-visuals',
      `PC 已按各自证据窗口校验 ${typedInput.script_items.length} 段解说，未按字数重切时间线；最终时间线 ${timelineValidation.items.length} 段。`,
    )
    updateWorkflowStepProgress(context, 'match-narration-visuals', 100, '画面匹配已按事件证据时间顺序校验完成')
    return {
      scriptResponse,
      pipelineResult: {
        ...generated.pipelineResult,
        approvedNarrationDraftItems: generated.approvedDraftItems ?? generated.draftItems,
        scriptResponse,
        tokens: {
          ...generated.pipelineResult.tokens,
          script: (generated.pipelineResult.tokens.script || 0) + matchTokens,
          total: (generated.pipelineResult.tokens.total || 0) + matchTokens,
        },
      },
    } satisfies MatchNarrationVisualsOutput
  },
  summarizeOutput: (output) => {
    const typedOutput = output as MatchNarrationVisualsOutput
    return {
      script_items: typedOutput.scriptResponse.items.length,
      passthrough: Boolean(typedOutput.passthrough),
      tokens: typedOutput.passthrough ? 0 : typedOutput.scriptResponse.usage.total_tokens || 0,
      model: typedOutput.scriptResponse.model,
    }
  },
}
