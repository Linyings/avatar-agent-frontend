import {
  aiToolsService,
  type DecideTimelineViewRequest,
  type DecideTimelineViewResponse,
  type DecideTimelineViewStreamEvent,
  type TimelineViewDecision,
} from '@/shared/services/aiToolsService'
import { throwIfAborted } from '@/shared/utils/abort'
import { buildDecisionSegments } from '@/features/projects/services/material/frameInferencePipelineService'
import type { TranscribeOutput } from '../types'
import { appendStreamPreviewChunk } from '../utils/workflowValue'

type Usage = DecideTimelineViewResponse['usage']
type TimelineDecisionRequester = (
  request: DecideTimelineViewRequest,
  options?: { signal?: AbortSignal; onEvent?: (event: DecideTimelineViewStreamEvent) => void; chunkId?: string }
) => Promise<DecideTimelineViewResponse>

type TimelineDecisionProgressStage =
  | 'packing'
  | 'chunking'
  | 'chunk_start'
  | 'chunk_retry'
  | 'chunk_success'
  | 'chunk_failed'
  | 'chunk_skipped'
  | 'complete'

export interface PackedTimelinePhrase {
  id: string
  start: number
  end: number
  text: string
  speakerId?: string | number
  confidence?: number
  source: 'phrase' | 'word' | 'audio_event' | 'subtitle' | 'segment'
}

export interface TimelineDecisionChunk {
  id: string
  index: number
  start: number
  end: number
  phrases: PackedTimelinePhrase[]
  candidate_count?: number
}

export interface TimelineDecisionCandidate {
  id: string
  chunk_id: string
  start: number
  end: number
  reason: string
  expected_question: string
  source_signals: string[]
  confidence: number
  priority: 'high' | 'medium' | 'low'
  trigger_type: string
  n_frames: number
  source_phrase_ids: string[]
  nearby_text?: string
  cut_time?: number
}

export interface TimelineObservedGap {
  chunk_id: string
  start: number
  end: number
  duration: number
}

export interface ChunkDecisionResult {
  chunk_id: string
  index: number
  start: number
  end: number
  status: 'model_success' | 'failed' | 'skipped'
  attempt_count: number
  candidates: TimelineDecisionCandidate[]
  observed_gaps: TimelineObservedGap[]
  decisions: TimelineViewDecision[]
  request?: DecideTimelineViewRequest
  request_id?: string
  usage?: Usage
  tokens_consumed?: number
  error?: string
}

export interface TimelineDecisionProgress {
  stage: TimelineDecisionProgressStage
  message: string
  total_chunks?: number
  completed_chunks?: number
  current_chunk?: string
  current_attempt?: number
  percentage?: number
  stream_output_preview?: string
  stream_thinking_preview?: string
  stream_output_chars?: number
  stream_thinking_chars?: number
  chunks?: Array<{
    chunk_id: string
    index: number
    start: number
    end: number
    status: 'pending' | 'running' | 'model_success' | 'failed' | 'skipped'
    candidates: number
    decisions?: number
    attempt_count?: number
    error?: string
  }>
}

export interface ChunkedTimelineDecisionResponse extends DecideTimelineViewResponse {
  strategy: {
    mode: 'single_call' | 'chunked_frontend'
    window_seconds: number
    overlap_seconds: number
    max_decisions: number
    per_chunk_max_decisions: number
    max_model_chunks: number
    max_concurrent_chunks: number
    chunk_count: number
    source_window_count?: number
    model_window_count?: number
    candidate_segment_count?: number
    failed_count: number
    skipped_count: number
  }
  chunks: ChunkDecisionResult[]
  failed_chunks: ChunkDecisionResult[]
  chunk_request_ids: string[]
}

export interface DecideTimelineViewChunkedInput extends DecideTimelineViewRequest {
  transcription?: TranscribeOutput['transcription']
  subtitleResult?: TranscribeOutput['subtitleResult']
}

export interface DecideTimelineViewChunkedOptions {
  signal?: AbortSignal
  windowSeconds?: number
  overlapSeconds?: number
  longTranscriptThresholdSeconds?: number
  maxAttempts?: number
  maxConcurrentChunks?: number
  maxModelChunks?: number
  retryDelayMs?: number
  now?: () => Date
  decideTimelineView?: TimelineDecisionRequester
  decideTimelineViewStream?: TimelineDecisionRequester
  sleep?: (ms: number) => Promise<void>
  onProgress?: (progress: TimelineDecisionProgress) => void
}

const DEFAULT_WINDOW_SECONDS = 90
const DEFAULT_OVERLAP_SECONDS = 10
const DEFAULT_LONG_THRESHOLD_SECONDS = 360
const DEFAULT_MAX_CONCURRENT_CHUNKS = 3
const DEFAULT_RETRY_DELAY_MS = 750
const DEFAULT_N_FRAMES = 15
const MAX_CANDIDATES_PER_CHUNK_REQUEST = 12

const streamPreview = (value: string, maxLength = 240) => {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (!compact) return ''
  return compact.length > maxLength ? `${compact.slice(-maxLength)}...` : compact
}

const toRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
)

const toNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

const toText = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
)

const speakerId = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

const priorityScore = (value: unknown) => {
  const key = toText(value).toLowerCase()
  if (key === 'high') return 3
  if (key === 'medium') return 2
  if (key === 'low') return 1
  return 0
}

const clampRange = (
  start: number,
  end: number,
  min: number,
  max: number,
  maxDuration = 10
) => {
  let nextStart = Math.max(min, start)
  let nextEnd = Math.min(max, end)
  if (nextEnd - nextStart > maxDuration) {
    const center = (nextStart + nextEnd) / 2
    nextStart = Math.max(min, center - maxDuration / 2)
    nextEnd = Math.min(max, nextStart + maxDuration)
  }
  return { start: nextStart, end: nextEnd }
}

const phraseContext = (phrases: PackedTimelinePhrase[], phraseIds: string[]) => (
  phrases
    .filter((phrase) => phraseIds.includes(phrase.id))
    .map((phrase) => `[${phrase.start.toFixed(2)}-${phrase.end.toFixed(2)}] ${phrase.text}`)
    .join(' / ')
)

const normalizePhraseRecord = (
  item: unknown,
  index: number,
  source: PackedTimelinePhrase['source']
): PackedTimelinePhrase | null => {
  const record = toRecord(item)
  if (!record) return null
  const rawText = toText(record.text ?? record.word)
  const text = record.type === 'audio_event' && rawText && !rawText.startsWith('(')
    ? `(${rawText})`
    : rawText
  const start = toNumber(record.start ?? record.startTime)
  const end = toNumber(record.end ?? record.endTime)
  if (!text || start === null || end === null || end <= start) return null
  return {
    id: `${source}-${index + 1}`,
    start,
    end,
    text,
    speakerId: speakerId(record.speaker_id ?? record.speakerId ?? record.speaker),
    confidence: toNumber(record.confidence) ?? undefined,
    source,
  }
}

export const packTranscriptToPhrases = (
  input: Pick<DecideTimelineViewChunkedInput, 'transcription' | 'subtitleResult' | 'segments'>
): PackedTimelinePhrase[] => {
  const rawPhrases = input.transcription?.phrases
  if (Array.isArray(rawPhrases)) {
    const phrases = rawPhrases
      .map((item, index) => normalizePhraseRecord(item, index, 'phrase'))
      .filter((item): item is PackedTimelinePhrase => Boolean(item))
    if (phrases.length > 0) return phrases
  }

  const rawWords = input.transcription?.words
  if (Array.isArray(rawWords)) {
    const words = rawWords
      .map((item, index) => {
        const type = toText(toRecord(item)?.type)
        return normalizePhraseRecord(item, index, type === 'audio_event' ? 'audio_event' : 'word')
      })
      .filter((item): item is PackedTimelinePhrase => Boolean(item))
    const grouped = groupWordsIntoPhrases(words)
    if (grouped.length > 0) return grouped
  }

  const subtitleSegments = input.subtitleResult?.segments
  if (Array.isArray(subtitleSegments)) {
    const phrases = subtitleSegments
      .map((item, index) => normalizePhraseRecord(item, index, 'subtitle'))
      .filter((item): item is PackedTimelinePhrase => Boolean(item))
    if (phrases.length > 0) return phrases
  }

  if (Array.isArray(input.segments)) {
    return input.segments
      .map((item, index) => normalizePhraseRecord(item, index, 'segment'))
      .filter((item): item is PackedTimelinePhrase => Boolean(item))
  }

  return []
}

export const groupWordsIntoPhrases = (words: PackedTimelinePhrase[]): PackedTimelinePhrase[] => {
  const phrases: PackedTimelinePhrase[] = []
  let current: PackedTimelinePhrase[] = []

  const flush = () => {
    if (current.length === 0) return
    const text = current.map((word) => word.text).join(' ').replace(/\s+/g, ' ').trim()
    if (text) {
      const confidenceValues = current
        .map((word) => word.confidence)
        .filter((value): value is number => typeof value === 'number')
      phrases.push({
        id: `word-phrase-${phrases.length + 1}`,
        start: current[0].start,
        end: current[current.length - 1].end,
        text,
        speakerId: current[0].speakerId,
        confidence: confidenceValues.length
          ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
          : undefined,
        source: 'word',
      })
    }
    current = []
  }

  words.forEach((word, index) => {
    current.push(word)
    const next = words[index + 1]
    const gap = next ? next.start - word.end : Number.POSITIVE_INFINITY
    const speakerChanged = next?.speakerId !== undefined
      && word.speakerId !== undefined
      && next.speakerId !== word.speakerId
    if (speakerChanged || gap >= 0.5 || /[.!?。！？]$/.test(word.text) || current.length >= 18) {
      flush()
    }
  })

  flush()
  return phrases
}

export const splitPhrasesIntoChunks = (
  phrases: PackedTimelinePhrase[],
  options: { windowSeconds?: number; overlapSeconds?: number } = {}
): TimelineDecisionChunk[] => {
  if (phrases.length === 0) return []
  const windowSeconds = options.windowSeconds ?? DEFAULT_WINDOW_SECONDS
  const overlapSeconds = Math.min(options.overlapSeconds ?? DEFAULT_OVERLAP_SECONDS, windowSeconds / 2)
  const start = phrases[0].start
  const end = Math.max(...phrases.map((phrase) => phrase.end))
  const chunks: TimelineDecisionChunk[] = []
  let chunkStart = start

  while (chunkStart < end) {
    const chunkEnd = Math.min(chunkStart + windowSeconds, end)
    const chunkPhrases = phrases.filter((phrase) => phrase.end > chunkStart && phrase.start < chunkEnd)
    if (chunkPhrases.length > 0) {
      chunks.push({
        id: `chunk-${String(chunks.length + 1).padStart(3, '0')}`,
        index: chunks.length,
        start: chunkStart,
        end: chunkEnd,
        phrases: chunkPhrases,
      })
    }
    if (chunkEnd >= end) break
    chunkStart = chunkEnd - overlapSeconds
  }

  return chunks
}

export const buildChunkCandidates = (
  chunk: TimelineDecisionChunk,
  options: { prompt?: string; defaultNFrames?: number } = {}
) => {
  const candidates: TimelineDecisionCandidate[] = []
  const observedGaps: TimelineObservedGap[] = []
  const defaultNFrames = options.defaultNFrames ?? DEFAULT_N_FRAMES
  const promptTerms = (options.prompt ?? '')
    .split(/[\s,，。.!?！？、]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)

  const addCandidate = (
    start: number,
    end: number,
    reason: string,
    signals: string[],
    confidence: number,
    phraseIds: string[],
    triggerType: string,
    priority: TimelineDecisionCandidate['priority'] = confidence >= 0.75 ? 'high' : confidence >= 0.5 ? 'medium' : 'low'
  ) => {
    if (end <= start) return
    candidates.push({
      id: `${chunk.id}-candidate-${candidates.length + 1}`,
      chunk_id: chunk.id,
      start,
      end,
      reason,
      expected_question: '这里是否需要借助画面确认剪辑/解说判断？',
      source_signals: signals,
      confidence,
      priority,
      trigger_type: triggerType,
      n_frames: defaultNFrames,
      source_phrase_ids: phraseIds,
      nearby_text: phraseContext(chunk.phrases, phraseIds),
      cut_time: (start + end) / 2,
    })
  }

  chunk.phrases.forEach((phrase, index) => {
    const next = chunk.phrases[index + 1]
    if (next) {
      const gap = next.start - phrase.end
      if (gap >= 0.15) {
        observedGaps.push({
          chunk_id: chunk.id,
          start: phrase.end,
          end: next.start,
          duration: gap,
        })
      }

      if (gap >= 0.4) {
        const range = clampRange(phrase.end - 1.2, next.start + 1.2, chunk.start, chunk.end, 10)
        addCandidate(
          range.start,
          range.end,
          `检测到 ${gap.toFixed(2)}s 停顿，符合 video-use 的安全候选点规则（silence >= 400ms）。`,
          ['silence_gap'],
          gap >= 1.2 ? 0.88 : 0.76,
          [phrase.id, next.id],
          'candidate_cut',
          gap >= 1.2 ? 'high' : 'medium'
        )
      }

      if (phrase.speakerId !== undefined && next.speakerId !== undefined && phrase.speakerId !== next.speakerId) {
        const range = clampRange(phrase.end - 1.5, next.start + 1.5, chunk.start, chunk.end, 10)
        addCandidate(
          range.start,
          range.end,
          '检测到说话人切换，属于 speaker handoff，需要确认画面承接关系。',
          ['speaker_change'],
          gap >= 0.25 ? 0.72 : 0.62,
          [phrase.id, next.id],
          'continuity',
          'medium'
        )
      }
    }

    if (/[!?！？]/.test(phrase.text)) {
      const range = clampRange(phrase.start - 1, phrase.end + 1, chunk.start, chunk.end, 8)
      addCandidate(
        range.start,
        range.end,
        '字幕包含疑问或强情绪标点，可能是视觉判断点。',
        ['punctuation_emphasis'],
        0.5,
        [phrase.id],
        'subtitle',
        'medium'
      )
    }

    if (phrase.source === 'audio_event' || /\((laugh|laughs|sigh|applause|music|cry|哭|笑|掌声|叹气)/i.test(phrase.text)) {
      const range = clampRange(phrase.start - 1, phrase.end + 2, chunk.start, chunk.end, 8)
      addCandidate(
        range.start,
        range.end,
        '转录中包含音频事件，video-use 会把笑声/叹气/掌声等作为需要保留或复核的节拍。',
        ['audio_event'],
        0.78,
        [phrase.id],
        'audio_event',
        'high'
      )
    }

    if (promptTerms.some((term) => phrase.text.includes(term))) {
      const range = clampRange(phrase.start - 1, phrase.end + 1, chunk.start, chunk.end, 8)
      addCandidate(
        range.start,
        range.end,
        '字幕命中用户提示词，优先进行视觉复核。',
        ['prompt_keyword'],
        0.82,
        [phrase.id],
        'user_prompt',
        'high'
      )
    }
  })

  const deduped = dedupeCandidates(candidates)
  return { candidates: deduped, observedGaps }
}

const dedupeCandidates = (candidates: TimelineDecisionCandidate[]) => {
  const selected: TimelineDecisionCandidate[] = []

  for (const candidate of [...candidates].sort((a, b) => b.confidence - a.confidence || a.start - b.start)) {
    const existing = selected.find((item) => rangesOverlap(candidate, item, 0.65))
    if (!existing) {
      selected.push(candidate)
      continue
    }

    existing.source_signals = [...new Set([...existing.source_signals, ...candidate.source_signals])]
    existing.source_phrase_ids = [...new Set([...existing.source_phrase_ids, ...candidate.source_phrase_ids])]
    if (!existing.reason.includes(candidate.reason)) {
      existing.reason = `${existing.reason} / ${candidate.reason}`
    }
    existing.confidence = Math.max(existing.confidence, candidate.confidence)
    existing.priority = priorityScore(existing.priority) >= priorityScore(candidate.priority)
      ? existing.priority
      : candidate.priority
  }

  return selected
}

const candidateRank = (candidate: TimelineDecisionCandidate) => (
  priorityScore(candidate.priority) * 10
  + candidate.confidence
  + (candidate.source_signals.includes('silence_gap') ? 2 : 0)
  + (candidate.source_signals.includes('audio_event') ? 2 : 0)
  + (candidate.source_signals.includes('prompt_keyword') ? 3 : 0)
)

const selectCandidatesForRequest = (candidates: TimelineDecisionCandidate[], limit = MAX_CANDIDATES_PER_CHUNK_REQUEST) => (
  [...candidates]
    .sort((a, b) => candidateRank(b) - candidateRank(a) || a.start - b.start)
    .slice(0, limit)
    .sort((a, b) => a.start - b.start)
)

export const mergeChunkDecisions = (
  results: ChunkDecisionResult[],
  maxDecisions: number
): TimelineViewDecision[] => {
  const all = results.flatMap((result) => result.decisions)
    .map((decision) => ({
      ...decision,
      start: toNumber(decision.start) ?? 0,
      end: toNumber(decision.end) ?? 0,
    }))
    .filter((decision) => decision.end > decision.start)

  const sorted = all.sort((a, b) => decisionRank(b) - decisionRank(a) || a.start - b.start)
  const selected: TimelineViewDecision[] = []

  for (const decision of sorted) {
    const existingIndex = selected.findIndex((item) => rangesOverlap(decision, item, 0.5))
    if (existingIndex < 0) {
      selected.push(decision)
      continue
    }
    const existing = selected[existingIndex]
    if (decisionRank(decision) > decisionRank(existing)) {
      selected[existingIndex] = decision
    }
  }

  return selected
    .sort((a, b) => decisionRank(b) - decisionRank(a) || a.start - b.start)
    .slice(0, Math.max(1, maxDecisions))
    .sort((a, b) => a.start - b.start)
}

const decisionRank = (decision: TimelineViewDecision) => {
  const confidence = typeof decision.candidate_confidence === 'number' ? decision.candidate_confidence : 0
  return priorityScore(decision.priority) * 10 + confidence
}

const rangesOverlap = (
  a: { start: number; end: number },
  b: { start: number; end: number },
  ratio = 0.5
) => {
  const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start)
  if (overlap <= 0) return false
  const shortest = Math.min(a.end - a.start, b.end - b.start)
  return shortest > 0 && overlap / shortest >= ratio
}

const usageSum = (results: ChunkDecisionResult[]): Usage => {
  const sumField = (field: keyof Usage) => results.reduce((sum, result) => (
    sum + (typeof result.usage?.[field] === 'number' ? result.usage[field]! : 0)
  ), 0)
  return {
    prompt_tokens: sumField('prompt_tokens'),
    completion_tokens: sumField('completion_tokens'),
    total_tokens: sumField('total_tokens'),
  }
}

const buildChunkRequest = (
  input: DecideTimelineViewChunkedInput,
  chunk: TimelineDecisionChunk,
  candidates: TimelineDecisionCandidate[],
  observedGaps: TimelineObservedGap[],
  perChunkMaxDecisions: number
): DecideTimelineViewRequest => {
  const selectedCandidates = selectCandidatesForRequest(candidates)
  const segments = chunk.phrases.map((phrase) => ({
    start: phrase.start,
    end: phrase.end,
    text: phrase.text,
    speaker_id: phrase.speakerId,
  }))
  const packedLines = segments.map((segment) => (
    `[${segment.start.toFixed(2)}-${segment.end.toFixed(2)}]${segment.speaker_id ? ` S${String(segment.speaker_id).replace(/^speaker_/, '')}` : ''} ${segment.text}`
  ))
  return {
    videoContext: [
      `Packed phrase-level transcript chunk ${chunk.id}. Phrases are grouped on silence >= 0.5s or speaker change.`,
      ...packedLines,
    ].join('\n'),
    transcript: packedLines.join('\n'),
    segments,
    candidateCuts: selectedCandidates,
    observedGaps,
    maxDecisions: perChunkMaxDecisions,
    defaultNFrames: input.defaultNFrames,
    prompt: input.prompt,
    projectId: input.projectId,
  }
}

const normalizeModelDecisions = (
  response: DecideTimelineViewResponse,
  chunk: TimelineDecisionChunk,
  candidates: TimelineDecisionCandidate[]
): TimelineViewDecision[] => {
  const raw = Array.isArray(response.decisions) && response.decisions.length > 0
    ? response.decisions
    : Array.isArray(response.analysis?.decisions)
      ? response.analysis.decisions
      : []
  return raw.map((decision) => ({
    ...decision,
    start: Math.max(chunk.start, toNumber(decision.start) ?? chunk.start),
    end: Math.min(chunk.end, toNumber(decision.end) ?? chunk.end),
    source: 'model',
    chunk_id: chunk.id,
    candidate_confidence: nearestCandidateConfidence(decision, candidates),
  })).filter((decision) => decision.end > decision.start)
}

const nearestCandidateConfidence = (
  decision: TimelineViewDecision,
  candidates: TimelineDecisionCandidate[]
) => {
  const match = candidates.find((candidate) => rangesOverlap(decision, candidate, 0.2))
  return match?.confidence
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const runAttempt = async (
  request: DecideTimelineViewRequest,
  decide: TimelineDecisionRequester,
  onEvent?: (event: DecideTimelineViewStreamEvent) => void,
  signal?: AbortSignal,
  chunkId?: string,
) => {
  throwIfAborted(signal, '视觉片段判断已取消')
  return decide(request, { onEvent, signal, chunkId })
}

const runChunk = async (
  input: DecideTimelineViewChunkedInput,
  chunk: TimelineDecisionChunk,
  candidates: TimelineDecisionCandidate[],
  observedGaps: TimelineObservedGap[],
  perChunkMaxDecisions: number,
  options: Required<Pick<DecideTimelineViewChunkedOptions, 'maxAttempts' | 'retryDelayMs' | 'decideTimelineView' | 'sleep'>>
    & {
      onAttempt?: (attempt: number) => void
      onRetry?: (error: unknown) => void
      onStreamEvent?: (event: DecideTimelineViewStreamEvent) => void
      signal?: AbortSignal
    }
): Promise<ChunkDecisionResult> => {
  const request = buildChunkRequest(input, chunk, candidates, observedGaps, perChunkMaxDecisions)
  let lastError: unknown

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    throwIfAborted(options.signal, '视觉片段判断已取消')
    try {
      options.onAttempt?.(attempt)
      const response = await runAttempt(request, options.decideTimelineView, options.onStreamEvent, options.signal, chunk.id)
      const decisions = normalizeModelDecisions(response, chunk, candidates)
      return {
        chunk_id: chunk.id,
        index: chunk.index,
        start: chunk.start,
        end: chunk.end,
        status: 'model_success',
        attempt_count: attempt,
        candidates,
        observed_gaps: observedGaps,
        decisions,
        request,
        request_id: response.request_id,
        usage: response.usage,
        tokens_consumed: response.tokens_consumed,
      }
    } catch (error) {
      lastError = error
      if (attempt < options.maxAttempts) {
        options.onRetry?.(error)
        await options.sleep(options.retryDelayMs)
        throwIfAborted(options.signal, '视觉片段判断已取消')
      }
    }
  }

  return {
    chunk_id: chunk.id,
    index: chunk.index,
    start: chunk.start,
    end: chunk.end,
    status: 'failed',
    attempt_count: options.maxAttempts,
    candidates,
    observed_gaps: observedGaps,
    decisions: [],
    request,
    error: lastError instanceof Error ? lastError.message : String(lastError ?? '模型分片判断失败'),
  }
}

interface PreparedTimelineChunk {
  chunk: TimelineDecisionChunk
  candidates: TimelineDecisionCandidate[]
  observedGaps: TimelineObservedGap[]
}

const chunkModelScore = (prepared: PreparedTimelineChunk) => {
  const bestCandidate = prepared.candidates.reduce((best, candidate) => (
    Math.max(best, candidateRank(candidate))
  ), 0)
  return bestCandidate
    + prepared.candidates.length * 0.05
    + prepared.observedGaps.length * 0.01
}

const resolveMaxModelChunks = (
  chunkCount: number,
  maxDecisions: number,
  override?: number
) => {
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
    return Math.min(chunkCount, Math.round(override))
  }
  return Math.min(chunkCount, maxDecisions)
}

const selectChunksForModel = (
  preparedChunks: PreparedTimelineChunk[],
  maxModelChunks: number
) => {
  const candidates = preparedChunks
    .filter((prepared) => prepared.candidates.length > 0)
    .sort((a, b) => a.chunk.start - b.chunk.start)
  if (candidates.length <= maxModelChunks) {
    return new Set(candidates.map((prepared) => prepared.chunk.id))
  }

  const selected = new Set<string>()
  for (let slot = 0; slot < maxModelChunks; slot += 1) {
    const startIndex = Math.floor(slot * candidates.length / maxModelChunks)
    const endIndex = Math.max(startIndex + 1, Math.floor((slot + 1) * candidates.length / maxModelChunks))
    const best = candidates
      .slice(startIndex, endIndex)
      .sort((a, b) => chunkModelScore(b) - chunkModelScore(a) || a.chunk.start - b.chunk.start)[0]
    if (best) selected.add(best.chunk.id)
  }

  if (selected.size < maxModelChunks) {
    candidates
      .filter((prepared) => !selected.has(prepared.chunk.id))
      .sort((a, b) => chunkModelScore(b) - chunkModelScore(a) || a.chunk.start - b.chunk.start)
      .slice(0, maxModelChunks - selected.size)
      .forEach((prepared) => selected.add(prepared.chunk.id))
  }
  return selected
}

const makeSkippedChunkResult = (
  prepared: PreparedTimelineChunk,
  reason: string
): ChunkDecisionResult => ({
  chunk_id: prepared.chunk.id,
  index: prepared.chunk.index,
  start: prepared.chunk.start,
  end: prepared.chunk.end,
  status: 'skipped',
  attempt_count: 0,
  candidates: prepared.candidates,
  observed_gaps: prepared.observedGaps,
  decisions: [],
  error: reason,
})

const runWithConcurrency = async <T>(
  items: T[],
  maxConcurrent: number,
  worker: (item: T) => Promise<void>
) => {
  const limit = Math.max(1, Math.min(items.length || 1, Math.round(maxConcurrent)))
  let cursor = 0
  const runners = Array.from({ length: limit }, async () => {
    while (cursor < items.length) {
      const current = items[cursor]
      cursor += 1
      await worker(current)
    }
  })
  await Promise.all(runners)
}

export const decideTimelineViewChunked = async (
  input: DecideTimelineViewChunkedInput,
  options: DecideTimelineViewChunkedOptions = {}
): Promise<ChunkedTimelineDecisionResponse> => {
  throwIfAborted(options.signal, '视觉片段判断已取消')
  const phrases = packTranscriptToPhrases(input)
  const duration = phrases.length > 0 ? Math.max(...phrases.map((phrase) => phrase.end)) - phrases[0].start : 0
  const windowSeconds = options.windowSeconds ?? DEFAULT_WINDOW_SECONDS
  const overlapSeconds = options.overlapSeconds ?? Math.min(DEFAULT_OVERLAP_SECONDS, Math.round(windowSeconds / 9))
  const chunks = splitPhrasesIntoChunks(phrases, { windowSeconds, overlapSeconds })
  const maxDecisions = Math.max(1, Math.round(input.maxDecisions ?? 8))
  const perChunkMaxDecisions = Math.min(4, Math.max(2, Math.ceil(maxDecisions / Math.max(1, chunks.length)) + 1))
  const maxAttempts = Math.max(1, Math.round(options.maxAttempts ?? 1))
  const maxConcurrentChunks = Math.max(1, Math.round(options.maxConcurrentChunks ?? DEFAULT_MAX_CONCURRENT_CHUNKS))
  const maxModelChunks = resolveMaxModelChunks(chunks.length, maxDecisions, options.maxModelChunks)
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  const decideTimelineView = options.decideTimelineView
    ?? options.decideTimelineViewStream
    ?? aiToolsService.decideTimelineViewStream.bind(aiToolsService)
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? (() => new Date())
  const longThreshold = options.longTranscriptThresholdSeconds ?? DEFAULT_LONG_THRESHOLD_SECONDS
  options.onProgress?.({
    stage: 'packing',
    message: `已 pack ${phrases.length} 个 phrase-level 片段，按 silence >= 0.5s 或 speaker change 分组。`,
    percentage: 5,
  })

  if (chunks.length <= 1 || duration <= longThreshold) {
    options.onProgress?.({
      stage: 'chunking',
      message: '当前内容未超过长文本阈值，使用单次模型决策。',
      total_chunks: 1,
      completed_chunks: 0,
      percentage: 15,
    })
    let streamOutput = ''
    let streamThinking = ''
    const singleCallRequest: DecideTimelineViewRequest = {
      videoContext: input.videoContext,
      transcript: input.transcript,
      segments: input.segments ?? (input.subtitleResult ? buildDecisionSegments(input.subtitleResult) : undefined),
      observedGaps: input.observedGaps,
      candidateCuts: input.candidateCuts,
      renderedCuts: input.renderedCuts,
      maxDecisions: input.maxDecisions,
      defaultNFrames: input.defaultNFrames,
      prompt: input.prompt,
      projectId: input.projectId,
    }
    const response = await runAttempt(singleCallRequest, decideTimelineView, (event) => {
        if (event.type !== 'answer_delta' && event.type !== 'thinking_delta') return
        if (event.type === 'thinking_delta') {
          streamThinking = appendStreamPreviewChunk(streamThinking, event.delta)
        } else {
          streamOutput = appendStreamPreviewChunk(streamOutput, event.delta)
        }
        const preview = streamPreview(event.type === 'thinking_delta' ? streamThinking : streamOutput)
        options.onProgress?.({
          stage: 'chunk_start',
          message: preview
            ? `单次决策流式${event.type === 'thinking_delta' ? '思考' : '输出'}：${preview}`
            : `单次决策流式${event.type === 'thinking_delta' ? '思考' : '输出'}中。`,
          total_chunks: 1,
          completed_chunks: 0,
          current_chunk: chunks[0]?.id ?? 'chunk-001',
          percentage: 60,
          stream_output_preview: streamPreview(streamOutput, 600),
          stream_thinking_preview: streamPreview(streamThinking, 600),
          stream_output_chars: streamOutput.length,
          stream_thinking_chars: streamThinking.length,
        })
    }, options.signal)
    const decisions = Array.isArray(response.decisions) ? response.decisions : []
    const result: ChunkDecisionResult = {
      chunk_id: chunks[0]?.id ?? 'chunk-001',
      index: 0,
      start: chunks[0]?.start ?? 0,
      end: chunks[0]?.end ?? duration,
      status: 'model_success',
      attempt_count: 1,
      candidates: [],
      observed_gaps: [],
      decisions,
      request: singleCallRequest,
      request_id: response.request_id,
      usage: response.usage,
      tokens_consumed: response.tokens_consumed,
    }
    return enrichResponse(response, {
      mode: 'single_call',
      windowSeconds,
      overlapSeconds,
      maxDecisions,
      perChunkMaxDecisions,
      maxModelChunks: 1,
      maxConcurrentChunks: 1,
      chunks: result ? [result] : [],
      now,
    })
  }

  const results: ChunkDecisionResult[] = []
  const progressChunks: NonNullable<TimelineDecisionProgress['chunks']> = chunks.map((chunk) => ({
    chunk_id: chunk.id,
    index: chunk.index,
    start: chunk.start,
    end: chunk.end,
    status: 'pending',
    candidates: 0,
  }))
  const emitProgress = (progress: Omit<TimelineDecisionProgress, 'chunks'>) => {
    options.onProgress?.({
      ...progress,
      chunks: progressChunks.map((chunk) => ({ ...chunk })),
    })
  }
  const chunkProgressIndex = (chunk: TimelineDecisionChunk) => {
    const matchedIndex = progressChunks.findIndex((item) => item.chunk_id === chunk.id)
    return matchedIndex >= 0 ? matchedIndex : chunk.index
  }
  const updateChunkProgress = (chunk: TimelineDecisionChunk, patch: Partial<NonNullable<TimelineDecisionProgress['chunks']>[number]>) => {
    const index = chunkProgressIndex(chunk)
    const current = progressChunks[index]
    if (!current) return
    progressChunks[index] = {
      ...current,
      ...patch,
      chunk_id: current.chunk_id,
      index: current.index,
    }
  }
  const readChunkProgress = (chunk: TimelineDecisionChunk) => progressChunks[chunkProgressIndex(chunk)]

  emitProgress({
    stage: 'chunking',
    message: `已按 ${windowSeconds}s 扫描窗口覆盖全片，共 ${chunks.length} 个素材窗口；将按目标成片筛选最多 ${maxModelChunks} 个窗口交给 AI。`,
    total_chunks: chunks.length,
    completed_chunks: 0,
    percentage: 10,
  })

  const preparedChunks: PreparedTimelineChunk[] = chunks.map((chunk) => {
    const { candidates, observedGaps } = buildChunkCandidates(chunk, {
      prompt: input.prompt,
      defaultNFrames: input.defaultNFrames,
    })
    updateChunkProgress(chunk, { candidates: candidates.length })
    return { chunk, candidates, observedGaps }
  })
  const selectedChunkIds = selectChunksForModel(preparedChunks, maxModelChunks)
  const modelChunks = preparedChunks.filter((prepared) => selectedChunkIds.has(prepared.chunk.id))
  const skippedChunks = preparedChunks.filter((prepared) => !selectedChunkIds.has(prepared.chunk.id))
  const completedCount = () => progressChunks.filter((chunk) => (
    chunk.status === 'model_success' || chunk.status === 'failed' || chunk.status === 'skipped'
  )).length

  skippedChunks.forEach((prepared) => {
    const reason = prepared.candidates.length === 0
      ? '没有可提交给模型的候选点，已跳过该分片。'
      : `超出本次模型请求预算（最多 ${maxModelChunks} 个候选分片），已跳过低优先级分片。`
    const result = makeSkippedChunkResult(prepared, reason)
    results.push(result)
    updateChunkProgress(prepared.chunk, {
      status: 'skipped',
      candidates: prepared.candidates.length,
      decisions: 0,
      attempt_count: 0,
      error: reason,
    })
  })

  if (skippedChunks.length > 0) {
    emitProgress({
      stage: 'chunk_skipped',
      message: `已跳过 ${skippedChunks.length} 个无候选或低优先级分片，模型只处理 ${modelChunks.length} 个候选分片。`,
      total_chunks: chunks.length,
      completed_chunks: completedCount(),
      percentage: Math.min(30, 12 + Math.round((completedCount() / chunks.length) * 18)),
    })
  }

  await runWithConcurrency(modelChunks, maxConcurrentChunks, async (prepared) => {
    throwIfAborted(options.signal, '视觉片段判断已取消')
    const { chunk, candidates, observedGaps } = prepared
    let streamOutput = ''
    let streamThinking = ''
    updateChunkProgress(chunk, {
      status: 'running',
      candidates: candidates.length,
    })
    emitProgress({
      stage: 'chunk_start',
      message: `${chunk.id} 正在执行：${chunk.phrases.length} 个 packed phrases，${candidates.length} 个候选点，${observedGaps.length} 个 observed gaps。`,
      total_chunks: chunks.length,
      completed_chunks: completedCount(),
      current_chunk: chunk.id,
      percentage: Math.min(92, 12 + Math.round((completedCount() / chunks.length) * 78)),
    })

    const result = await runChunk(input, chunk, candidates, observedGaps, perChunkMaxDecisions, {
      maxAttempts,
      retryDelayMs,
      decideTimelineView,
      sleep,
      signal: options.signal,
      onAttempt: (attempt) => {
        updateChunkProgress(chunk, {
          attempt_count: attempt,
          status: 'running',
        })
        emitProgress({
          stage: 'chunk_start',
          message: maxAttempts > 1
            ? `${chunk.id} 第 ${attempt} 次请求模型，最多 ${maxAttempts} 次。`
            : `${chunk.id} 正在请求模型。`,
          total_chunks: chunks.length,
          completed_chunks: completedCount(),
          current_chunk: chunk.id,
          current_attempt: attempt,
          percentage: Math.min(92, 14 + Math.round((completedCount() / chunks.length) * 78)),
        })
      },
      onStreamEvent: (event) => {
        if (event.type !== 'answer_delta' && event.type !== 'thinking_delta') return
        if (event.type === 'thinking_delta') {
          streamThinking = appendStreamPreviewChunk(streamThinking, event.delta)
        } else {
          streamOutput = appendStreamPreviewChunk(streamOutput, event.delta)
        }
        const preview = streamPreview(event.type === 'thinking_delta' ? streamThinking : streamOutput)
        updateChunkProgress(chunk, {
          attempt_count: readChunkProgress(chunk)?.attempt_count ?? 1,
          status: 'running',
        })
        emitProgress({
          stage: 'chunk_start',
          message: preview
            ? `${chunk.id} 流式${event.type === 'thinking_delta' ? '思考' : '输出'}：${preview}`
            : `${chunk.id} 流式响应中，已收到${event.type === 'thinking_delta' ? '思考' : '输出'}片段。`,
          total_chunks: chunks.length,
          completed_chunks: completedCount(),
          current_chunk: chunk.id,
          percentage: Math.min(92, 14 + Math.round((completedCount() / chunks.length) * 78)),
          stream_output_preview: streamPreview(streamOutput, 600),
          stream_thinking_preview: streamPreview(streamThinking, 600),
          stream_output_chars: streamOutput.length,
          stream_thinking_chars: streamThinking.length,
        })
      },
      onRetry: (error) => {
        updateChunkProgress(chunk, {
          attempt_count: 1,
          error: error instanceof Error ? error.message : String(error ?? '模型请求失败'),
        })
        emitProgress({
          stage: 'chunk_retry',
          message: `${chunk.id} 第 1 次请求失败，${retryDelayMs}ms 后重试。`,
          total_chunks: chunks.length,
          completed_chunks: completedCount(),
          current_chunk: chunk.id,
          current_attempt: 1,
          percentage: Math.min(92, 14 + Math.round((completedCount() / chunks.length) * 78)),
        })
      },
    })
    results.push(result)
    updateChunkProgress(chunk, {
      status: result.status,
      candidates: result.candidates.length,
      decisions: result.decisions.length,
      attempt_count: result.attempt_count,
      error: result.error,
    })
    emitProgress({
      stage: result.status === 'failed' ? 'chunk_failed' : 'chunk_success',
      message: result.status === 'failed'
        ? `${chunk.id} 模型请求失败，已记录诊断并跳过，不生成本地兜底决策。`
        : `${chunk.id} 模型成功，返回 ${result.decisions.length} 个局部决策。`,
      total_chunks: chunks.length,
      completed_chunks: completedCount(),
      current_chunk: chunk.id,
      percentage: Math.min(95, 12 + Math.round((completedCount() / chunks.length) * 80)),
    })
  })

  results.sort((a, b) => a.index - b.index)
  const decisions = mergeChunkDecisions(results, maxDecisions)
  const usage = usageSum(results)
  const requestIds = results.map((result) => result.request_id).filter((id): id is string => Boolean(id))
  const failedChunks = results.filter((result) => result.status === 'failed')
  const skippedCount = results.filter((result) => result.status === 'skipped').length
  const summary = {
    summary: `已扫描 ${results.length} 个素材窗口，AI 分析 ${modelChunks.length} 个候选窗口，生成 ${decisions.length} 个剪辑候选片段。`,
    needs_timeline_view: decisions.length > 0,
    decisions,
    skipped: [],
    confidence: failedChunks.length > 0 ? 'medium' : 'high',
    global_notes: failedChunks.length > 0
      ? [`${failedChunks.length} 个分片模型请求失败，已跳过；未生成本地兜底决策。`]
      : [],
  }
  emitProgress({
    stage: 'complete',
    message: `视觉判断完成：扫描 ${results.length} 个素材窗口，AI 分析 ${modelChunks.length} 个窗口，生成 ${decisions.length} 个剪辑候选，失败 ${failedChunks.length} 个。`,
    total_chunks: chunks.length,
    completed_chunks: completedCount(),
    percentage: 100,
  })

  return {
    success: true,
    provider: 'frontend-orchestrator',
    model: 'chunked-timeline-decision',
    content: JSON.stringify(summary),
    analysis: summary,
    decisions,
    usage,
    request_id: `chunked:${requestIds.join(',') || now().getTime()}`,
    tokens_consumed: usage.total_tokens ?? 0,
    updated_at: now().toISOString(),
    strategy: {
      mode: 'chunked_frontend',
      window_seconds: windowSeconds,
      overlap_seconds: overlapSeconds,
      max_decisions: maxDecisions,
      per_chunk_max_decisions: perChunkMaxDecisions,
      max_model_chunks: maxModelChunks,
      max_concurrent_chunks: maxConcurrentChunks,
      chunk_count: modelChunks.length,
      source_window_count: results.length,
      model_window_count: modelChunks.length,
      candidate_segment_count: decisions.length,
      failed_count: failedChunks.length,
      skipped_count: skippedCount,
    },
    chunks: results,
    failed_chunks: failedChunks,
    chunk_request_ids: requestIds,
  }
}

const enrichResponse = (
  response: DecideTimelineViewResponse,
  input: {
    mode: 'single_call'
    windowSeconds: number
    overlapSeconds: number
    maxDecisions: number
    perChunkMaxDecisions: number
    maxModelChunks: number
    maxConcurrentChunks: number
    chunks: ChunkDecisionResult[]
    now: () => Date
  }
): ChunkedTimelineDecisionResponse => {
  const decisions = Array.isArray(response.decisions) ? response.decisions : []
  return {
    ...response,
    analysis: {
      ...(response.analysis ?? {}),
      decisions,
    },
    decisions,
    updated_at: response.updated_at ?? input.now().toISOString(),
    strategy: {
      mode: input.mode,
      window_seconds: input.windowSeconds,
      overlap_seconds: input.overlapSeconds,
      max_decisions: input.maxDecisions,
      per_chunk_max_decisions: input.perChunkMaxDecisions,
      max_model_chunks: input.maxModelChunks,
      max_concurrent_chunks: input.maxConcurrentChunks,
      chunk_count: input.chunks.length,
      source_window_count: input.chunks.length,
      model_window_count: input.chunks.length,
      candidate_segment_count: decisions.length,
      failed_count: 0,
      skipped_count: 0,
    },
    chunks: input.chunks,
    failed_chunks: [],
    chunk_request_ids: response.request_id ? [response.request_id] : [],
  }
}
