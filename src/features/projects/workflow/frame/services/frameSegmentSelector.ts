// 确定性选段器：从剧情理解输出的有效片段池中，按用户的两条进度条
// （素材选取比例 s₁、解说率 s₂）与片段优先级，用纯代码选出解说集与
// 原片集，并聚合成时间线骨架。字数只作为软引导，绝不作为失败条件。

export type SegmentPriority = 'high' | 'medium' | 'low'

export interface SegmentCandidate {
  event_id: string
  start: number
  end: number
  description: string
  priority: SegmentPriority
  quality: number
  /** 字/秒；原片集需要避开哑片段。 */
  dialogueDensity: number
}

export interface SegmentExclusion {
  event_id: string
  reason: 'missing_start' | 'missing_end' | 'negative_start' | 'reversed_range' | 'out_of_bounds' | 'missing_description' | 'opening_or_ending_song' | 'advertisement'
}

export interface TimelineSkeletonItem {
  type: 'narration' | 'original'
  start: number
  end: number
  eventId: string
  description: string
  priority: SegmentPriority
  /** 该选中事件的独立文案预算；不得由素材窗口时长推导。 */
  softCharacters: number
}

export interface SegmentSelectionResult {
  rawCount: number
  pool: SegmentCandidate[]
  exclusions: SegmentExclusion[]
  keepCount: number
  narrationSegments: SegmentCandidate[]
  originalSegments: SegmentCandidate[]
  skeleton: TimelineSkeletonItem[]
  estimatedDurationMs: number
}

export const NARRATION_CHARACTERS_PER_SELECTED_EVENT = 80
const SEGMENT_EXCLUSION_REASON_LABELS: Record<string, string> = {
  missing_start: '缺少开始时间',
  missing_end: '缺少结束时间',
  negative_start: '开始时间为负',
  reversed_range: '结束时间早于开始时间',
  out_of_bounds: '超出素材时长',
  missing_description: '缺少事件描述',
  opening_or_ending_song: '判定为片头/片尾曲',
  advertisement: '判定为广告或推广内容',
}

export const describeSegmentExclusions = (exclusions: SegmentExclusion[]): string => {
  if (exclusions.length === 0) return ''
  const counts = new Map<string, number>()
  for (const item of exclusions) counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1)
  return [...counts.entries()].map(([reason, count]) => (
    `${SEGMENT_EXCLUSION_REASON_LABELS[reason] ?? reason} ${count} 条`
  )).join('、')
}

const openingOrEndingSongPattern = /片(?:头|尾)(?:主题)?(?:曲|音乐)|(?:opening|ending)\s*(?:theme|song|music)/i
const advertisementTypePattern = /^(?:ad|ads|advertisement|commercial|promotion|promo|sponsor|inserted_ad|gambling_ad|website_promotion)$/i
const advertisementTextPatterns = [
  /博彩|赌场|投注|下注|彩票|彩金|送彩金|体验金|娱乐城|真人荷官|casino|gambl(?:e|ing)|betting/i,
  /(?:扫码|扫描|点击|访问|登录|注册|下载|打开|关注|搜索).{0,20}(?:二维码|网站|网址|平台|APP|应用|公众号|链接)/i,
  /(?:https?:\/\/|www\.|[a-z0-9-]+\.(?:com|cn|net|org)\b)/i,
  /(?:插播广告|广告时间|推广内容|商务合作|本节目由.{0,20}(?:赞助|提供)|sponsored\s+by|paid\s+promotion)/i,
]

const stringList = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : typeof value === 'string'
      ? [value]
      : []
)

export const isAdvertisementStoryEvent = (event: Record<string, unknown>): boolean => {
  const type = typeof event.type === 'string' ? event.type.trim() : ''
  if (advertisementTypePattern.test(type)) return true
  const searchable = [
    typeof event.description === 'string' ? event.description : '',
    ...stringList(event.evidence),
  ].join(' ')
  return advertisementTextPatterns.some(pattern => pattern.test(searchable))
}


export interface AdvertisementRange {
  start: number
  end: number
  type: 'advertisement'
}

export const computeAdvertisementRanges = (input: {
  events: Array<Record<string, unknown>>
  subtitleSegments: Array<{ startTime: number; endTime: number; text: string }>
  sourceDurationSeconds: number
}): AdvertisementRange[] => {
  const rawRanges = [
    ...input.events.flatMap(event => {
      if (!isAdvertisementStoryEvent(event)) return []
      const start = Number(event.start)
      const end = Number(event.end)
      return Number.isFinite(start) && Number.isFinite(end) && end > start
        ? [{ start, end }]
        : []
    }),
    ...input.subtitleSegments.flatMap(segment => (
      advertisementTextPatterns.some(pattern => pattern.test(segment.text))
        ? [{ start: segment.startTime, end: segment.endTime }]
        : []
    )),
  ].map(range => ({
    start: Math.max(0, range.start - 1),
    end: Math.min(input.sourceDurationSeconds, range.end + 1),
    type: 'advertisement' as const,
  })).filter(range => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end)

  return rawRanges.reduce<AdvertisementRange[]>((merged, range) => {
    const previous = merged.at(-1)
    if (previous && range.start <= previous.end + 2) {
      previous.end = Math.max(previous.end, range.end)
      return merged
    }
    merged.push({ ...range })
    return merged
  }, [])
}
const LYRIC_MIN_SUBTITLE_SECONDS = 8
const LYRIC_ABSOLUTE_MIN_SUBTITLE_SECONDS = 12
const LYRIC_MAX_CHARS_PER_SECOND = 4
const OP_ED_PAD_BEFORE_SECONDS = 10
const OP_ED_PAD_AFTER_SECONDS = 25
const OP_ED_MARKER_MERGE_GAP_SECONDS = 60

export const MIN_NARRATION_WINDOW_SECONDS = 30

// 片头/片尾曲的歌词字幕特征：异常长且字密度低的字幕段。ASR 会把歌词当成
// 字幕转录，静音检测对它失效，这里按特征识别出 OP/ED 区间。
// 关键约束：片头曲只可能出现在素材开头，片尾曲只可能出现在素材结尾。
// 素材中段的长字幕是慢节奏对白或情绪停顿，不是歌曲，不产生排除区间。
const OP_ED_BOUNDARY_RATIO = 0.15

export const computeOpeningEndingSongRanges = (
  subtitleItems: Array<{ start: number; end: number; text: string }>,
  sourceDurationSeconds: number,
): Array<{ start: number; end: number }> => {
  const duration = Number(sourceDurationSeconds)
  const markers = subtitleItems.filter(item => {
    const duration = item.end - item.start
    if (duration >= LYRIC_ABSOLUTE_MIN_SUBTITLE_SECONDS) return true
    if (duration < LYRIC_MIN_SUBTITLE_SECONDS) return false
    const characters = item.text.replace(/\s/g, '').length
    return characters / duration < LYRIC_MAX_CHARS_PER_SECOND
  })
  if (markers.length === 0) return []
  const groups: Array<{ start: number; end: number }> = []
  for (const marker of markers) {
    const last = groups.at(-1)
    if (last && marker.start - last.end <= OP_ED_MARKER_MERGE_GAP_SECONDS) {
      last.end = Math.max(last.end, marker.end)
    } else {
      groups.push({ start: marker.start, end: marker.end })
    }
  }
  // 只保留位于素材开头或结尾的歌词组：中间的慢节奏对白不是片头片尾
  const headLimit = duration * OP_ED_BOUNDARY_RATIO
  const tailStart = duration * (1 - OP_ED_BOUNDARY_RATIO)
  return groups
    .filter(group => group.end <= headLimit || group.start >= tailStart)
    .map(group => ({
      start: Math.max(0, group.start - OP_ED_PAD_BEFORE_SECONDS),
      end: Math.min(
        Number.isFinite(duration) && duration > 0 ? duration : group.end + OP_ED_PAD_AFTER_SECONDS,
        group.end + OP_ED_PAD_AFTER_SECONDS,
      ),
    }))
}
const clampRatio = (value: number): number => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))

const toPriority = (value: unknown): SegmentPriority => (
  value === 'high' || value === 'low' ? value : 'medium'
)

export interface NormalizeStorySegmentsInput {
  events: Array<Record<string, unknown>>
  subtitleSegments: Array<{ startTime: number; endTime: number; text: string }>
  sourceDurationSeconds: number
  /** 片头/片尾、广告等禁用区间（秒）：与这些区间有重叠的片段直接剔除。 */
  excludedRanges?: Array<{ start: number; end: number; type?: string }>
}

// 阶段A：时间戳校验与剔除。片段（剧情事件）必须有有效时间戳区间与描述；
// 片头/片尾曲事件直接剔除，不进入成片。
export const normalizeStorySegments = (input: NormalizeStorySegmentsInput): {
  pool: SegmentCandidate[]
  exclusions: SegmentExclusion[]
  rawCount: number
} => {
  const rawCount = input.events.length
  const evidenceByRange = input.subtitleSegments
  const pool: SegmentCandidate[] = []
  const exclusions: SegmentExclusion[] = []
  input.events.forEach((raw, index) => {
    const eventId = typeof raw.event_id === 'string' && raw.event_id.trim()
      ? raw.event_id
      : `event-${String(index + 1).padStart(3, '0')}`
    const exclude = (reason: SegmentExclusion['reason']) => exclusions.push({ event_id: eventId, reason })
    const description = typeof raw.description === 'string' ? raw.description.trim() : ''
    const start = Number(raw.start)
    const end = Number(raw.end)
    if (!Number.isFinite(start)) return exclude('missing_start')
    if (!Number.isFinite(end)) return exclude('missing_end')
    if (start < 0) return exclude('negative_start')
    if (end <= start) return exclude('reversed_range')
    if (end > input.sourceDurationSeconds + 1) return exclude('out_of_bounds')
    if (!description) return exclude('missing_description')
    const overlappingSubtitleText = evidenceByRange
      .filter(segment => segment.startTime < end && segment.endTime > start)
      .map(segment => segment.text)
      .join(' ')
    if (
      isAdvertisementStoryEvent(raw)
      || advertisementTextPatterns.some(pattern => pattern.test(overlappingSubtitleText))
    ) return exclude('advertisement')
    const type = typeof raw.type === 'string' ? raw.type.toLocaleLowerCase() : ''
    if (type === 'opening_song' || type === 'ending_song' || openingOrEndingSongPattern.test(description)) {
      return exclude('opening_or_ending_song')
    }
    const overlappingExcluded = (input.excludedRanges ?? []).find(range => (
      start < range.end && end > range.start
    ))
    if (overlappingExcluded) {
      return exclude(overlappingExcluded.type === 'advertisement' ? 'advertisement' : 'opening_or_ending_song')
    }
    const windowSeconds = end - start
    const subtitleCharacters = evidenceByRange
      .filter(segment => segment.startTime < end && segment.endTime > start)
      .reduce((total, segment) => total + segment.text.replace(/\s/g, '').length, 0)
    const evidenceList = Array.isArray(raw.evidence)
      ? raw.evidence.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      : []
    const importance = toPriority(raw.importance)
    const priorityWeight = importance === 'high' ? 3 : importance === 'medium' ? 2 : 1
    pool.push({
      event_id: eventId,
      start,
      end,
      description,
      priority: importance,
      quality: priorityWeight * 10 + evidenceList.length * 2 + Math.min(5, description.length / 20),
      dialogueDensity: windowSeconds > 0 ? subtitleCharacters / windowSeconds : 0,
    })
  })
  return { pool, exclusions, rawCount }
}

const rankSegments = (pool: SegmentCandidate[]): SegmentCandidate[] => [...pool].sort((left, right) => {
  const priorityWeight = (candidate: SegmentCandidate) => candidate.priority === 'high' ? 3 : candidate.priority === 'medium' ? 2 : 1
  return priorityWeight(right) - priorityWeight(left)
    || right.quality - left.quality
    || left.start - right.start
    || left.event_id.localeCompare(right.event_id)
})

export interface SelectSegmentsInput {
  pool: SegmentCandidate[]
  /** 成片时长进度条：入选条数占全部片段的比例，0.05~1，默认 0.30。 */
  selectionRatio: number
  /** 解说率进度条：入选池中解说条数占比，0~1，默认 0.50。 */
  narrationRatio: number
  /** 片头/片尾等禁用区间（秒，可选）：扩窗与骨架不得落入。 */
  excludedRanges?: Array<{ start: number; end: number }>
}

// 阶段B：确定性选段。按条数（而非时长）选段：N × selectionRatio 条进池，
// 再按 narrationRatio 劈成解说集和原片集。无任何时长驱动的补齐或裁减。
export const selectSegmentsForCut = (input: SelectSegmentsInput): SegmentSelectionResult => {
  const ranked = rankSegments(input.pool)
  const total = ranked.length
  const selectionRatio = clampRatio(input.selectionRatio)
  const narrationRatio = clampRatio(input.narrationRatio)

  const keepCount = total === 0 ? 0 : Math.max(1, Math.ceil(total * selectionRatio))
  let keep = ranked.slice(0, keepCount)
  let leftover = ranked.slice(keepCount)

  const narrationCount = keep.length === 0
    ? 0
    : narrationRatio <= 0
      ? 0
      : narrationRatio >= 1
        ? keep.length
        : Math.max(1, Math.floor(keep.length * narrationRatio))
  let narrationSegments = keep.slice(0, narrationCount)
  let originalSegments = keep.slice(narrationCount)

  // 对白密度修正：原片块播的是原声，哑片段（几乎无人说话）移出入选池，
  // 并从落选池按优先级递补。池内完全没有对白数据时跳过修正（无法区分）。
  const maxDensity = input.pool.reduce((max, item) => Math.max(max, item.dialogueDensity), 0)
  const keptIds = new Set(keep.map(item => item.event_id))
  const droppedIds = new Set<string>()
  const nextOriginal: SegmentCandidate[] = []
  for (const segment of originalSegments) {
    if (maxDensity >= 0.5 && segment.dialogueDensity < 0.5) {
      droppedIds.add(segment.event_id)
      continue
    }
    nextOriginal.push(segment)
  }
  if (droppedIds.size > 0 && narrationRatio < 1) {
    for (const candidate of leftover) {
      if (nextOriginal.length >= keep.length - narrationSegments.length) break
      if (keptIds.has(candidate.event_id) || droppedIds.has(candidate.event_id)) continue
      if (candidate.dialogueDensity < 0.5) {
        droppedIds.add(candidate.event_id)
        continue
      }
      nextOriginal.push(candidate)
      keptIds.add(candidate.event_id)
    }
    originalSegments = nextOriginal
    keep = [...narrationSegments, ...originalSegments]
  }

  const narrationIdsFinal = new Set(narrationSegments.map(item => item.event_id))
  const skeleton: TimelineSkeletonItem[] = [...narrationSegments, ...originalSegments]
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .map(segment => ({
      type: narrationIdsFinal.has(segment.event_id) ? 'narration' as const : 'original' as const,
      start: segment.start,
      end: segment.end,
      eventId: segment.event_id,
      description: segment.description,
      priority: segment.priority,
      softCharacters: NARRATION_CHARACTERS_PER_SELECTED_EVENT,
    }))

  // 解说窗口保底 30 秒：短事件向前后缓冲扩窗（不越过相邻片段边界），
  // 给解说音频留出延展余量，避免窗口过窄导致的长顺延。
  const minNarrationWindowSeconds = 30
  for (let index = 0; index < skeleton.length; index += 1) {
    const item = skeleton[index]
    if (item.type !== 'narration') continue
    const windowSeconds = item.end - item.start
    if (windowSeconds >= minNarrationWindowSeconds) continue
    const prevBoundary = index > 0 ? skeleton[index - 1].end : item.start
    const nextBoundary = index + 1 < skeleton.length ? skeleton[index + 1].start : item.end
    let expand = minNarrationWindowSeconds - windowSeconds
    const excluded = input.excludedRanges ?? []
    const overlapsExcluded = (start: number, end: number) => excluded.some(range => start < range.end && end > range.start)
    const backwardRoom = Math.max(0, item.start - prevBoundary)
    const backward = Math.min(expand / 2, backwardRoom)
    if (backward > 0 && !overlapsExcluded(item.start - backward, item.start)) {
      item.start = Math.max(prevBoundary, item.start - backward)
      expand -= backward
    }
    const forward = Math.min(expand, Math.max(0, nextBoundary - item.end))
    if (forward > 0 && !overlapsExcluded(item.end, item.end + forward)) {
      item.end = Math.min(nextBoundary, item.end + forward)
    }
  }

  const estimatedDurationMs = Math.round(skeleton.reduce((total, item) => total + (item.end - item.start), 0) * 1000)
  return {
    rawCount: total,
    pool: input.pool,
    exclusions: [],
    keepCount: keep.length,
    narrationSegments,
    originalSegments,
    skeleton,
    estimatedDurationMs,
  }
}
