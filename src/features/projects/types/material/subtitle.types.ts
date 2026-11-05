// 字幕相关类型定义

import type { SubtitleExtractionSettings as SharedSubtitleExtractionSettings } from '@/shared/types'

export interface SubtitleSegment {
  id: string
  startTime: number
  endTime: number
  text: string
  confidence?: number
  speakerId?: number | string
}

export type SubtitleExtractionSettings = SharedSubtitleExtractionSettings

export interface SubtitleExtractionResult {
  segments: SubtitleSegment[]
  language: string
  totalDuration: number
  processingTime: number
  confidence: number
}

export interface SubtitleProcessingStatus {
  isProcessing: boolean
  progress: number
  stage: 'analyzing' | 'transcribing' | 'post_processing' | 'completed' | 'failed'
  error?: string
  message?: string
}

export interface SubtitleGap {
  startTime: number
  endTime: number
  duration: number
  type: 'silence' | 'music' | 'noise'
}

// API返回的字幕数据格式
export interface ApiSubtitleSegment {
  start_time: number  // 秒（保留小数，如 0.13, 4.33）
  end_time: number    // 秒（保留小数，如 1.05, 5.77）
  subtitle: string
  speaker_id?: number | string
  ocr_img_url?: string | null  // OCR 图片 URL（R2 存储）
}

// API返回的字幕数据结构（实际格式）
export interface ApiSubtitleData {
  subtitle: {
    [segmentId: string]: ApiSubtitleSegment
  }
}

const finiteNumberOrZero = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : 0
)

// 工具函数：将API数据转换为前端使用的格式
export function convertApiSubtitleToResult(apiData: ApiSubtitleData | null): SubtitleExtractionResult | null {
  if (!apiData || !apiData.subtitle || Object.keys(apiData.subtitle).length === 0) {
    return null
  }

  // 正确访问嵌套的字幕数据
  const subtitleData = apiData.subtitle
  const segmentValues = Object.values(subtitleData)

  // 检测是否为 OCR 模式（所有段都有 ocr_img_url 但 subtitle 为空）
  const hasOcrUrls = segmentValues.some(seg => seg.ocr_img_url)
  const allEmptySubtitles = segmentValues.every(seg => !seg.subtitle || seg.subtitle.trim() === '')

  if (hasOcrUrls && allEmptySubtitles) {
    // OCR 模式：返回特殊标记的结果
    return {
      segments: [],
      language: 'ocr',  // 特殊标记，用于识别 OCR 模式
      totalDuration: 0,
      processingTime: 0,
      confidence: 1.0
    }
  }

  // 正常 ASR 模式：转换字幕段
  const segments = Object.entries(subtitleData).map(([id, data]) => ({
    id,
    startTime: finiteNumberOrZero(data.start_time), // 已经是秒数，直接使用
    endTime: finiteNumberOrZero(data.end_time),     // 已经是秒数，直接使用
    text: data.subtitle,
    confidence: 0.95, // 默认置信度
    speakerId: typeof data.speaker_id === 'number' || typeof data.speaker_id === 'string'
      ? data.speaker_id
      : undefined
  }))

  // 按开始时间排序
  segments.sort((a, b) => a.startTime - b.startTime)

  return {
    segments,
    language: 'zh-CN', // 默认中文
    totalDuration: segments.length > 0 ? segments[segments.length - 1].endTime : 0,
    processingTime: 0,
    confidence: 0.95
  }
}
