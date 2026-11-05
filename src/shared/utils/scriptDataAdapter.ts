/**
 * 脚本数据格式转换工具
 * 用于在新旧AI生成格式之间转换，并统一修复脚本项标识符。
 */

import type { ScriptItem } from '../types'

type ScriptItemLike = ScriptItem & { id?: number | string; _id?: number | string }

const isSessionObjectUrl = (value?: string): boolean => (
  typeof value === 'string' && value.startsWith('blob:')
)

/**
 * 格式化时间戳字符串
 * @param startSec 开始时间(秒)
 * @param endSec 结束时间(秒)
 * @returns 格式化的时间戳字符串 "HH:MM:SS,mmm-HH:MM:SS,mmm"
 */
export function formatTimestamp(startSec: number, endSec: number): string {
  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 1000)

    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`
  }

  return `${formatTime(startSec)}-${formatTime(endSec)}`
}

/**
 * 解析时间戳字符串
 * @param timestamp 时间戳字符串 "HH:MM:SS,mmm-HH:MM:SS,mmm"
 * @returns { start: number, end: number } 开始和结束时间(秒)
 */
export function parseTimestamp(timestamp: string): { start: number; end: number } {
  const parseTime = (timeStr: string): number => {
    const [time, ms] = timeStr.split(',')
    const [hrs, mins, secs] = time.split(':').map(Number)

    return hrs * 3600 + mins * 60 + secs + Number(ms) / 1000
  }

  const [startStr, endStr] = timestamp.split('-')
  return {
    start: parseTime(startStr),
    end: parseTime(endStr)
  }
}

const parseCandidateId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed)
    }
  }

  return null
}

/**
 * 统一脚本项 ID：兼容后端返回的 id / _id，并确保结果唯一且可用。
 */
export function normalizeScriptItemIds<T extends ScriptItemLike>(items: T[]): ScriptItem[] {
  const usedIds = new Set<number>()

  return items.map((item, index) => {
    const rawId = item._id ?? item.id
    let nextId = parseCandidateId(rawId)

    if (nextId === null || nextId <= 0 || usedIds.has(nextId)) {
      nextId = index + 1
      while (usedIds.has(nextId)) {
        nextId += 1
      }
    }

    usedIds.add(nextId)

    return {
      ...item,
      _id: nextId
    } as ScriptItem
  })
}

/**
 * 将新格式AI数据转换为前端使用的格式
 * 新格式特征:
 * - text: 解说文案(解说片段) 或 空字符串(原片片段)
 * - org: 原片字幕(原片片段) 或 空字符串(解说片段)
 * - start, end: 时间(秒)
 *
 * @param newFormatItem 新格式的脚本项
 * @returns 转换后的脚本项
 */
export function convertNewToFrontend(newFormatItem: ScriptItem): ScriptItem {
  const { _id, text, start, end, org, audio_url, audio, local_audio_key, audio_storage, local_audio_missing, duration } = newFormatItem
  const audioDuration = duration ?? (newFormatItem as { audio_duration?: number }).audio_duration

  // 判断是否为原片
  const isOriginal = (!text || text.trim() === '') && (org && org.trim() !== '')

  // 构建前端使用的完整数据
  return {
    _id,

    // 新格式字段(保留)
    text: text || '',
    start,
    end,
    org: org || '',

    // 计算旧格式字段(供UI组件使用)
    timestamp: formatTimestamp(start, end),
    picture: org || '画面描述', // 原片字幕作为画面描述,否则使用默认值
    narration: text || '', // 解说文案
    OST: isOriginal ? 1 : 0, // 0=解说, 1=原片

    // 计算毫秒时间
    start_time: Math.round(start * 1000),
    end_time: Math.round(end * 1000),

    // 音频字段
    audio_url: audio_url || audio,
    audio: audio_url || audio,
    local_audio_key,
    audio_storage,
    local_audio_missing,
    duration: audioDuration
  }
}

/**
 * 将前端数据转换为新格式(用于保存到后端)
 * @param frontendItem 前端格式的脚本项
 * @returns 新格式的脚本项
 */
export function convertFrontendToNew(frontendItem: ScriptItem): ScriptItem {
  const { _id, text, start, end, org, narration, picture, OST, audio_url, audio, local_audio_key, audio_storage, duration } = frontendItem

  // 如果已经有新格式字段,优先使用
  const isOriginal = OST === 1

  // 构建基础返回对象
  const result: ScriptItem = {
    _id,
    text: isOriginal ? '' : (text || narration || ''),
    start,
    end,
    org: isOriginal ? (org || picture || '') : ''
  }

  // 只保留 audio 字段，优先使用 audio_url（R2存储的URL）
  const audioValue = audio_url || audio
  if (audioValue) {
    if (isSessionObjectUrl(audioValue)) {
      if (!local_audio_key) {
        result.audio = audioValue
      }
    } else {
      result.audio = audioValue
    }
  }

  if (local_audio_key) {
    result.local_audio_key = local_audio_key
    result.audio_storage = audio_storage ?? 'local'
  }

  if (duration !== undefined) {
    result.duration = duration
  }

  return result
}

/**
 * 批量转换新格式到前端格式
 * @param items 新格式脚本项数组
 * @returns 前端格式脚本项数组
 */
export function convertNewToFrontendBatch(items: ScriptItem[]): ScriptItem[] {
  return normalizeScriptItemIds(items).map(convertNewToFrontend)
}

/**
 * 批量转换前端格式到新格式
 * @param items 前端格式脚本项数组
 * @returns 新格式脚本项数组
 */
export function convertFrontendToNewBatch(items: ScriptItem[]): ScriptItem[] {
  return normalizeScriptItemIds(items).map(convertFrontendToNew)
}

/**
 * 检测数据格式版本
 * @param item 脚本项
 * @returns 'new' | 'legacy' | 'mixed'
 */
export function detectDataFormat(item: ScriptItemLike): 'new' | 'legacy' | 'mixed' {
  const hasNewFields = item.text !== undefined || item.org !== undefined
  const hasLegacyFields = item.narration !== undefined || item.picture !== undefined

  if (hasNewFields && !hasLegacyFields) return 'new'
  if (!hasNewFields && hasLegacyFields) return 'legacy'
  return 'mixed'
}

/**
 * 智能转换:自动检测格式并转换为前端格式
 * @param item 任意格式的脚本项
 * @returns 前端格式脚本项
 */
export function smartConvertToFrontend(item: ScriptItemLike): ScriptItem {
  const format = detectDataFormat(item)
  const normalizedItem = normalizeScriptItemIds([item])[0]

  if (format === 'new') {
    return convertNewToFrontend(normalizedItem)
  } else if (format === 'legacy') {
    // 旧格式数据,补充新格式字段
    const isOriginal = normalizedItem.OST === 1
    return {
      ...normalizedItem,
      text: isOriginal ? '' : (normalizedItem.narration || ''),
      start: normalizedItem.start || 0,
      end: normalizedItem.end || 0,
      org: isOriginal ? (normalizedItem.picture || '') : ''
    }
  } else {
    // 混合格式,已经包含所有字段
    return normalizedItem
  }
}

/**
 * 智能批量转换
 * @param items 任意格式脚本项数组
 * @returns 前端格式脚本项数组
 */
export function smartConvertToFrontendBatch(items: ScriptItem[]): ScriptItem[] {
  const normalizedItems = normalizeScriptItemIds(items)
  return normalizedItems.map(item => {
    const format = detectDataFormat(item)

    if (format === 'new') {
      return convertNewToFrontend(item)
    } else if (format === 'legacy') {
      const isOriginal = item.OST === 1
      return {
        ...item,
        text: isOriginal ? '' : (item.narration || ''),
        start: item.start || 0,
        end: item.end || 0,
        org: isOriginal ? (item.picture || '') : ''
      }
    }

    return item
  })
}
