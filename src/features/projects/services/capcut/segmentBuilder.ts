/**
 * 剪映草稿生成 - 片段构建器
 * 负责创建视频、音频、文本片段对象
 */

import { generateUUID, SUBTITLE_POSITION_Y } from './constants'
import type { VideoSegment, AudioSegment, TextSegment } from './types'

/**
 * 创建视频片段
 *
 * @param materialId 素材ID
 * @param sourceStart 源开始时间（微秒）
 * @param sourceEnd 源结束时间（微秒）
 * @param targetStart 目标开始时间（微秒）
 * @param volume 音量（0-1，0为静音）
 * @param segmentId 可选的片段ID
 */
export function createVideoSegment(
  materialId: string,
  sourceStart: number,
  sourceEnd: number,
  targetStart: number,
  volume: number = 1.0,
  segmentId?: string
): VideoSegment {
  const id = segmentId || generateUUID()
  const sourceDuration = sourceEnd - sourceStart

  return {
    id,
    material_id: materialId,
    target_timerange: {
      start: targetStart,
      duration: sourceDuration
    },
    source_timerange: {
      start: sourceStart,
      duration: sourceDuration
    },
    speed: 1.0,
    volume,
    enable_adjust: true,
    enable_color_curves: true,
    enable_color_match_adjust: false,
    enable_color_wheels: true,
    enable_lut: true,
    enable_smart_color_adjust: false,
    extra_material_refs: [],
    hdr_settings: {
      intensity: 1.0,
      mode: 1,
      nits: 1000
    },
    uniform_scale: {
      on: true,
      value: 1.0
    },
    clip: {
      alpha: 1.0,
      flip: {
        horizontal: false,
        vertical: false
      },
      rotation: 0.0,
      scale: {
        x: 1.0,
        y: 1.0
      },
      transform: {
        x: 0.0,
        y: 0.0
      }
    },
    common_keyframes: []
  }
}

/**
 * 创建音频片段
 *
 * @param materialId 素材ID
 * @param sourceStart 源开始时间（微秒）
 * @param sourceDuration 源时长（微秒）
 * @param targetStart 目标开始时间（微秒）
 * @param segmentId 可选的片段ID
 */
export function createAudioSegment(
  materialId: string,
  sourceStart: number,
  sourceDuration: number,
  targetStart: number,
  volume: number = 1.0,
  segmentId?: string
): AudioSegment {
  const id = segmentId || generateUUID()

  return {
    id,
    material_id: materialId,
    target_timerange: {
      start: targetStart,
      duration: sourceDuration
    },
    source_timerange: {
      start: sourceStart,
      duration: sourceDuration
    },
    speed: 1.0,
    volume,
    extra_material_refs: [],
    clip: null,
    hdr_settings: null,
    common_keyframes: []
  }
}

/**
 * 创建文本片段（字幕）
 *
 * @param materialId 素材ID
 * @param start 开始时间（微秒）
 * @param duration 时长（微秒）
 * @param segmentId 可选的片段ID
 */
export function createTextSegment(
  materialId: string,
  start: number,
  duration: number,
  segmentId?: string
): TextSegment {
  const id = segmentId || generateUUID()

  return {
    id,
    material_id: materialId,
    target_timerange: {
      start,
      duration
    },
    source_timerange: null,
    speed: 1.0,
    volume: 1.0,
    extra_material_refs: [],
    clip: {
      alpha: 1.0,
      flip: {
        horizontal: false,
        vertical: false
      },
      rotation: 0.0,
      scale: {
        x: 1.0,
        y: 1.0
      },
      transform: {
        x: 0.0,
        y: SUBTITLE_POSITION_Y // 字幕垂直位置
      }
    },
    common_keyframes: []
  }
}
