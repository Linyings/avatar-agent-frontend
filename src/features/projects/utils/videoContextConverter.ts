/**
 * 字幕与 video_context 数据格式转换工具
 */

import type { SubtitleExtractionResult, SubtitleSegment } from '@/features/projects/types/material'
import type { VideoContext } from '@/features/projects/types/project'

interface VideoContextItem {
  id?: string
  start_time: number
  end_time: number
  subtitle: string
  visual: string
  speaker_id?: number | string
}

/**
 * 将字幕数据转换为 video_context 格式
 */
export function convertSubtitlesToVideoContext(
  subtitles: SubtitleExtractionResult
): VideoContext {
  const items: { [key: string]: VideoContextItem } = {}

  subtitles.segments.forEach((segment: SubtitleSegment, index: number) => {
    const key = String(index + 1)
    items[key] = {
      start_time: segment.startTime,
      end_time: segment.endTime,
      subtitle: segment.text,
      visual: '',
      ...(segment.speakerId !== undefined ? { speaker_id: segment.speakerId } : {})
    }
  })

  return {
    items,
    total_segments: subtitles.segments.length,
    subtitle_segments: subtitles.segments.length,
    visual_segments: 0,
    merged_at: Date.now()
  }
}

/**
 * 从 video_context 重建字幕数据
 */
export function convertVideoContextToSubtitles(
  videoContext: VideoContext
): SubtitleExtractionResult {
  const sortedItems = Object.entries(videoContext.items)
    .map(([id, item]) => ({ id, item }))
    .sort((a, b) => a.item.start_time - b.item.start_time)

  const segments: SubtitleSegment[] = sortedItems
    .filter(({ item }) => item.subtitle && item.subtitle.trim() !== '')
    .map(({ id, item }) => ({
      id,
      startTime: item.start_time,
      endTime: item.end_time,
      text: item.subtitle,
      confidence: 0.95,
      speakerId: item.speaker_id
    }))

  return {
    segments,
    language: 'zh-CN',
    totalDuration: segments.length > 0 ? segments[segments.length - 1].endTime : 0,
    processingTime: 0,
    confidence: 0.95
  }
}

/**
 * 检查 video_context 是否只包含字幕（没有画面分析）
 */
export function isInitialVideoContext(videoContext: VideoContext): boolean {
  const hasVisualData = Object.values(videoContext.items).some(
    item => item.visual && item.visual.trim() !== ''
  )
  return !hasVisualData
}

/**
 * 合并现有 video_context 与新的画面分析结果
 */
export function mergeVisualAnalysisToVideoContext(
  existing: VideoContext,
  gapAnalysis: { [gapId: string]: string }
): VideoContext {
  const updatedItems = { ...existing.items }

  Object.entries(gapAnalysis).forEach(([gapId, visual]) => {
    if (updatedItems[gapId] && visual && visual.trim() !== '') {
      updatedItems[gapId] = {
        ...updatedItems[gapId],
        visual: visual.trim()
      }
    }
  })

  const visualSegments = Object.values(updatedItems).filter(
    item => item.visual && item.visual.trim() !== ''
  ).length

  return {
    ...existing,
    items: updatedItems,
    visual_segments: visualSegments,
    merged_at: Date.now()
  }
}
