import type {
  ApiSubtitleData,
  MergedFrameGroup,
  OcrImageInput,
  UploadedFrameGroup
} from '@/features/projects/types/material'
import { DEFAULT_FRAME_EXTRACTION_OPTIONS, DEFAULT_FRAME_MERGE_OPTIONS } from '@/features/projects/types/material'
import type { ProjectSubtitleItem } from '@/features/projects/types/project'

const sanitizeId = (value: string): string => {
  return value.replace(/[^a-zA-Z0-9_-]/g, '') || 'ocr_segment'
}

const toFixedNumber = (value: number, fractionDigits = 3): number => {
  return Number(value.toFixed(fractionDigits))
}

const DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i
const HTTP_URL_PATTERN = /^https?:\/\//i

const extractStorageKeyFromUrl = (url: string): string => {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname || ''
    return path.startsWith('/') ? path.slice(1) : path
  } catch (_error) {
    return url
  }
}

export const buildOcrSubtitlePayload = (
  groups: UploadedFrameGroup[]
): Record<string, ProjectSubtitleItem> => {
  const timestamp = Date.now()

  return groups.reduce<Record<string, ProjectSubtitleItem>>((acc, group, index) => {
    const segmentId = `ocr_${sanitizeId(group.id)}_${timestamp}_${index}`
    acc[segmentId] = {
      start_time: toFixedNumber(group.startTime),
      end_time: toFixedNumber(group.endTime),
      subtitle: '',
      ocr_img_url: group.r2Url
    }
    return acc
  }, {})
}

export const buildGroupsFromOcrSubtitle = (
  apiData: ApiSubtitleData | null
): UploadedFrameGroup[] => {
  if (!apiData?.subtitle) {
    return []
  }

  const defaultFrameCount = DEFAULT_FRAME_EXTRACTION_OPTIONS.framesPerGroup

  return Object.entries(apiData.subtitle)
    .filter(([, segment]) => Boolean(segment.ocr_img_url))
    .map(([segmentId, segment]) => {
      const start = typeof segment.start_time === 'number' ? segment.start_time : 0
      const end = typeof segment.end_time === 'number' ? segment.end_time : start
      const url = segment.ocr_img_url as string

      return {
        id: segmentId,
        startTime: start,
        endTime: end,
        frameCount: defaultFrameCount,
        frames: [],
        mergedImageUrl: url,
        mergedBlob: undefined,
        layout: {
          columns: 1,
          rows: defaultFrameCount,
          padding: DEFAULT_FRAME_MERGE_OPTIONS.padding,
          orientation: 'vertical' as const
        },
        r2Url: url,
        uploadId: `history-${segmentId}`,
        storageKey: extractStorageKeyFromUrl(url),
        uploadedAt: undefined,
        isHistory: true
      }
    })
    .sort((a, b) => a.startTime - b.startTime)
}

export const buildOcrImageInputFromGroup = (
  group: Pick<MergedFrameGroup, 'mergedImageUrl'> & Partial<Pick<UploadedFrameGroup, 'r2Url'>>
): OcrImageInput | null => {
  const candidates = [group.mergedImageUrl, group.r2Url].filter(
    (value): value is string => Boolean(value && value.trim())
  )

  for (const candidate of candidates) {
    const trimmed = candidate.trim()
    const dataUrlMatch = trimmed.match(DATA_URL_PATTERN)

    if (dataUrlMatch) {
      const [, mimeType, base64Data] = dataUrlMatch
      return {
        type: 'base64',
        data: base64Data,
        mime_type: mimeType
      }
    }

    if (HTTP_URL_PATTERN.test(trimmed)) {
      return {
        type: 'url',
        data: trimmed,
        mime_type: 'image/jpeg'
      }
    }
  }

  return null
}

/**
 * 解析并合并OCR识别结果的时间戳和文本
 *
 * @param timestamps - OCR API返回的时间戳数组，如 ["75.50", "76.00"]
 * @param text - 对应的文本数组，可能包含空字符串
 * @param frameInterval - 采样间隔（秒），默认0.5秒
 * @returns 合并后的字幕片段数组
 *
 * @example
 * ```ts
 * const timestamps = ["75.50", "76.00", "76.50", "77.00"]
 * const text = ["你好", "你好", "", "再见"]
 * const result = mergeOcrTimestamps(timestamps, text, 0.5)
 * // 结果:
 * // [
 * //   { start_time: 75.5, end_time: 76.0, subtitle: "你好" },
 * //   { start_time: 77.0, end_time: 77.5, subtitle: "再见" }
 * // ]
 * ```
 */
export const mergeOcrTimestamps = (
  timestamps: string[],
  text: string[],
  frameInterval: number = DEFAULT_FRAME_EXTRACTION_OPTIONS.frameInterval
): ProjectSubtitleItem[] => {
  // 1. 配对时间戳和文本，过滤空字符串
  interface ParsedPair {
    time: number
    text: string
  }

  const pairs: ParsedPair[] = timestamps
    .map((timestamp, index) => {
      // 解析时间戳，去除"s"后缀
      const timeStr = timestamp.replace(/s$/i, '').trim()
      const time = parseFloat(timeStr)

      return {
        time: isNaN(time) ? 0 : time,
        text: text[index] || ''
      }
    })
    .filter(pair => pair.text.trim() !== '') // 过滤空字符串

  // 2. 按时间戳升序排序
  pairs.sort((a, b) => a.time - b.time)

  // 3. 合并相同的连续文本
  const result: ProjectSubtitleItem[] = []
  let currentSegment: ProjectSubtitleItem | null = null

  for (const pair of pairs) {
    const normalizedText = pair.text.trim()

    // 判断是否可以合并到当前片段
    if (
      currentSegment &&
      currentSegment.subtitle === normalizedText &&
      pair.time > currentSegment.start_time // 确保时间递增
    ) {
      // 扩展当前片段的结束时间
      currentSegment.end_time = pair.time
    } else {
      // 保存上一个片段
      if (currentSegment) {
        result.push(currentSegment)
      }

      // 开始新片段
      currentSegment = {
        start_time: toFixedNumber(pair.time),
        end_time: toFixedNumber(pair.time + frameInterval), // 默认单次出现
        subtitle: normalizedText
      }
    }
  }

  // 保存最后一个片段
  if (currentSegment) {
    result.push(currentSegment)
  }

  return result
}

/**
 * 将合并后的字幕数组转换为与ASR相同的API格式
 *
 * @param subtitles - 合并后的字幕片段数组
 * @returns 符合API格式的字幕数据对象
 *
 * @example
 * ```ts
 * const subtitles = [
 *   { start_time: 75.5, end_time: 76.0, subtitle: "你好" },
 *   { start_time: 77.0, end_time: 77.5, subtitle: "再见" }
 * ]
 * const result = buildOcrSubtitleFromRecognition(subtitles)
 * // 结果:
 * // {
 * //   "1": { start_time: 75.5, end_time: 76.0, subtitle: "你好" },
 * //   "2": { start_time: 77.0, end_time: 77.5, subtitle: "再见" }
 * // }
 * ```
 */
export const buildOcrSubtitleFromRecognition = (
  subtitles: ProjectSubtitleItem[]
): Record<string, ProjectSubtitleItem> => {
  const result: Record<string, ProjectSubtitleItem> = {}

  subtitles.forEach((subtitle, index) => {
    // 使用数字递增作为segment ID，与ASR格式一致
    const segmentId = String(index + 1)
    result[segmentId] = {
      start_time: toFixedNumber(subtitle.start_time),
      end_time: toFixedNumber(subtitle.end_time),
      subtitle: subtitle.subtitle
    }
  })

  return result
}
