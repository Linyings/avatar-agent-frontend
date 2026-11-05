/**
 * 剪映草稿生成 - 轨道构建器
 * 负责创建轨道并管理片段
 */

import { generateUUID } from './constants'
import type { Track, VideoSegment, AudioSegment, TextSegment } from './types'

/**
 * 创建轨道
 *
 * @param trackType 轨道类型 ('video' | 'audio' | 'text')
 * @param segments 片段数组
 * @param trackName 轨道名称
 * @param renderIndex 渲染索引
 * @param isMuted 是否静音（默认否）
 */
export function createTrack(
  trackType: 'video' | 'audio' | 'text',
  segments: Array<VideoSegment | AudioSegment | TextSegment>,
  trackName: string,
  renderIndex: number,
  isMuted: boolean = false
): Track {
  const trackId = generateUUID()

  // 为每个片段设置 render_index
  segments.forEach(segment => {
    segment.render_index = renderIndex
  })

  return {
    id: trackId,
    type: trackType,
    name: trackName,
    segments,
    attribute: isMuted ? 1 : 0, // 0: 不静音, 1: 静音
    flag: 0,
    is_default_name: false
  }
}
