import type { SubtitleExtractionResult, SubtitleSegment } from '../types/material'
import type { ProjectSubtitleItem } from '../types/project'

interface SubtitleTaskContentItem {
  start_time?: number
  end_time?: number
  start?: number
  end?: number
  speaker_id?: number | string
  original_subtitle?: string
  translated_subtitle?: string
  subtitle?: string
  text?: string
  confidence?: number
  words?: Array<{
    word: string
    start: number
    end: number
    confidence?: number
  }>
}

interface SubtitleTaskResponse {
  success: boolean
  status?: string
  task_id?: string
  content?: Record<string, SubtitleTaskContentItem> | string | null
  processing_time?: number
  language?: string
}

interface BuildOptions {
  language?: string
  fallbackText?: 'original_subtitle' | 'translated_subtitle' | 'subtitle' | 'text'
}

const SRT_TIME_REGEX = /(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/

const DEFAULT_CONFIDENCE = 0.8

export const buildSubtitleExtractionResult = (
  response: SubtitleTaskResponse,
  options: BuildOptions = {}
): SubtitleExtractionResult | null => {
  if (!response || !response.success || response.status !== 'completed') {
    return null
  }

  const { language, fallbackText = 'original_subtitle' } = options
  const rawContent = response.content

  const segments = Array.isArray(rawContent)
    ? buildFromArray(rawContent, fallbackText)
    : typeof rawContent === 'string'
      ? buildFromString(rawContent)
      : buildFromRecord(rawContent ?? {}, fallbackText)

  if (!segments.length) {
    return null
  }

  const totalDuration = segments.reduce((max, segment) => Math.max(max, segment.endTime), 0)
  const confidences = segments
    .map(segment => segment.confidence)
    .filter((value): value is number => typeof value === 'number')
  const confidence = confidences.length
    ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
    : DEFAULT_CONFIDENCE

  return {
    segments,
    language: language ?? response.language ?? 'zh',
    totalDuration,
    processingTime: response.processing_time ?? 0,
    confidence
  }
}

export const buildSubtitlePayload = (
  segments: SubtitleSegment[]
): Record<string, { start_time: number; end_time: number; subtitle: string; speaker_id?: number | string }> => {
  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime)

  return sorted.reduce<Record<string, { start_time: number; end_time: number; subtitle: string; speaker_id?: number | string }>>((acc, segment, index) => {
    // segment.startTime 和 endTime 单位为秒，直接保存秒
    // 统一使用秒作为时间单位，保留小数精度（如 0.13, 1.05）
    const startTime = Math.max(0, segment.startTime)
    const endTime = Math.max(startTime, segment.endTime)
    acc[String(index + 1)] = {
      start_time: startTime,
      end_time: endTime,
      subtitle: segment.text,
      ...(segment.speakerId !== undefined ? { speaker_id: segment.speakerId } : {})
    }
    return acc
  }, {})
}

interface PayloadOptions {
  language?: string
  confidence?: number
}

export const buildSubtitleExtractionResultFromPayload = (
  payload: Record<string, ProjectSubtitleItem>,
  options: PayloadOptions = {}
): SubtitleExtractionResult | null => {
  const entries = Object.entries(payload)
  if (!entries.length) {
    return null
  }

  const segments: SubtitleSegment[] = entries
    .map(([key, value]) => ({
      id: key,
      startTime: Math.max(0, value.start_time ?? 0),  // 已经是秒，无需转换
      endTime: Math.max(0, value.end_time ?? 0),      // 已经是秒，无需转换
      text: value.subtitle ?? '',
      confidence: options.confidence ?? 1,
      speakerId: typeof value.speaker_id === 'number' || typeof value.speaker_id === 'string'
        ? value.speaker_id
        : undefined
    }))
    .filter(segment => Boolean(segment.text))
    .sort((a, b) => a.startTime - b.startTime)

  if (!segments.length) {
    return null
  }

  const totalDuration = segments.reduce((max, segment) => Math.max(max, segment.endTime), 0)
  const confidence = segments.reduce((sum, segment) => sum + (segment.confidence ?? 1), 0) / segments.length

  return {
    segments,
    language: options.language ?? 'zh',
    totalDuration,
    processingTime: 0,
    confidence
  }
}

const buildFromArray = (
  entries: SubtitleTaskContentItem[],
  fallbackText: BuildOptions['fallbackText']
): SubtitleSegment[] => {
  return entries
    .map((item, index) => buildSegment(item, index.toString(), fallbackText))
    .filter((segment): segment is SubtitleSegment => Boolean(segment))
    .sort((a, b) => a.startTime - b.startTime)
}

const buildFromRecord = (
  record: Record<string, SubtitleTaskContentItem>,
  fallbackText: BuildOptions['fallbackText']
): SubtitleSegment[] => {
  return Object.entries(record)
    .map(([key, value]) => buildSegment(value, key, fallbackText))
    .filter((segment): segment is SubtitleSegment => Boolean(segment))
    .sort((a, b) => a.startTime - b.startTime)
}

const buildFromString = (content: string): SubtitleSegment[] => {
  try {
    const parsed = JSON.parse(content) as Record<string, SubtitleTaskContentItem> | SubtitleTaskContentItem[]
    if (Array.isArray(parsed)) {
      return buildFromArray(parsed, 'original_subtitle')
    }
    return buildFromRecord(parsed, 'original_subtitle')
  } catch (_error) {
    return parseSRT(content)
  }
}

const buildSegment = (
  item: SubtitleTaskContentItem,
  id: string,
  fallbackText: BuildOptions['fallbackText']
): SubtitleSegment | null => {
  if (!item) {
    return null
  }

  const start = typeof item.start_time === 'number' ? item.start_time : item.start
  const end = typeof item.end_time === 'number' ? item.end_time : item.end

  if (typeof start !== 'number' || typeof end !== 'number') {
    return null
  }

  const text = item.original_subtitle
    ?? item.translated_subtitle
    ?? item.subtitle
    ?? item.text
    ?? (fallbackText ? (item as Record<string, string | undefined>)[fallbackText] : undefined)

  if (!text) {
    return null
  }

  const confidence = resolveConfidence(item)

  return {
    id,
    startTime: start, // 接口已返回秒数，无需转换
    endTime: end,     // 接口已返回秒数，无需转换
    text,
    confidence,
    speakerId: typeof item.speaker_id === 'number' || typeof item.speaker_id === 'string'
      ? item.speaker_id
      : undefined
  }
}

const resolveConfidence = (item: SubtitleTaskContentItem): number | undefined => {
  if (typeof item.confidence === 'number') {
    return clampConfidence(item.confidence)
  }

  if (Array.isArray(item.words) && item.words.length) {
    const confidences = item.words
      .map(word => (typeof word.confidence === 'number' ? clampConfidence(word.confidence) : undefined))
      .filter((value): value is number => typeof value === 'number')

    if (confidences.length) {
      return confidences.reduce((sum, value) => sum + value, 0) / confidences.length
    }
  }

  return DEFAULT_CONFIDENCE
}

const clampConfidence = (value: number): number => {
  if (Number.isNaN(value)) {
    return DEFAULT_CONFIDENCE
  }
  if (value > 1) {
    return value / 100
  }
  if (value < 0 || value > 1) {
    return DEFAULT_CONFIDENCE
  }
  return value
}

const parseSRT = (srt: string): SubtitleSegment[] => {
  const blocks = srt.replace(/\r\n/g, '\n').split(/\n\s*\n/)

  return blocks
    .map((block): SubtitleSegment | null => {
      const lines = block.trim().split('\n')
      if (lines.length < 2) {
        return null
      }

      const timeMatch = lines[1].match(SRT_TIME_REGEX)
      if (!timeMatch) {
        return null
      }

      const start = timeArrayToSeconds(timeMatch.slice(1, 5))
      const end = timeArrayToSeconds(timeMatch.slice(5, 9))
      const text = lines.slice(2).join('\n').trim()

      if (!text) {
        return null
      }

      return {
        id: (lines[0] || '0').trim(),
        startTime: start,
        endTime: end,
        text,
        confidence: DEFAULT_CONFIDENCE
      }
    })
    .filter((segment): segment is SubtitleSegment => segment !== null)
    .sort((a, b) => a.startTime - b.startTime)
}

const timeArrayToSeconds = (parts: string[]): number => {
  const [hours, minutes, seconds, milliseconds] = parts.map(Number)
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
}

export type { SubtitleTaskContentItem, SubtitleTaskResponse }
