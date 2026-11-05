/**
 * 时间戳校准工具函数
 * 处理音频时长与视频片段时长的比较和校准逻辑
 */

import type {
  ScriptItem,
  TTSAudioState,
  TimestampCalibrationItem,
  CalibrationResult,
  CalibrationOptions
} from '@/shared/types'
import { getAudioDuration, getAudioDurationFromUrl, calculateDurationDifference, isWithinTolerance } from './audioUtils'
import {
  parseTimestamp,
  adjustSubsequentTimestamps,
  ensureTimeFields,
  createTimestampFromMs
} from './timestampUtils'

/**
 * 默认校准选项
 */
export const DEFAULT_CALIBRATION_OPTIONS: CalibrationOptions = {
  toleranceSeconds: 0.5, // 容忍0.5秒的时长差异
  autoAdjustSubsequent: true // 自动调整后续片段
}

/**
 * 检查脚本项是否需要时间戳校准
 * @param scriptItems 脚本项数组
 * @param ttsAudioStates TTS音频状态
 * @param options 校准选项
 * @returns 校准结果
 */
export async function checkTimestampCalibration(
  scriptItems: ScriptItem[],
  ttsAudioStates: TTSAudioState,
  options: CalibrationOptions = DEFAULT_CALIBRATION_OPTIONS
): Promise<CalibrationResult> {
  const calibrationItems: TimestampCalibrationItem[] = []
  let totalDifference = 0

  // 只检查解说片段（OST === 0）
  const narrativeItems = scriptItems.filter(item => item.OST === 0)

  for (const item of narrativeItems) {
    const audioState = ttsAudioStates[item._id]

    // 检查是否有有效的音频
    if (!audioState?.success) {
      continue
    }

    try {
      // 确保时间字段完整性（支持新旧格式）
      const normalizedItem = ensureTimeFields(item)

      // 获取原始视频片段时长（优先使用 start_time/end_time）
      const originalDuration = (normalizedItem.end_time - normalizedItem.start_time) / 1000

      // 获取音频实际时长
      let audioDuration: number | undefined

      if (typeof audioState.duration === 'number' && isFinite(audioState.duration)) {
        audioDuration = audioState.duration
      } else if (audioState.audioBlob) {
        audioDuration = await getAudioDuration(audioState.audioBlob)
      } else if (audioState.audioUrl) {
        audioDuration = await getAudioDurationFromUrl(audioState.audioUrl)
      }

      if (audioDuration === undefined) {
        continue
      }

      // 计算时长差异
      const difference = calculateDurationDifference(originalDuration, audioDuration)
      const needsCalibration = !isWithinTolerance(originalDuration, audioDuration, options.toleranceSeconds)

      if (needsCalibration) {
        totalDifference += difference
      }

      calibrationItems.push({
        _id: item._id,
        timestamp: normalizedItem.timestamp,
        originalDuration,
        audioDuration,
        difference,
        needsCalibration
      })

    } catch (error) {
      // 添加错误项，但标记为不需要校准
      calibrationItems.push({
        _id: item._id,
        timestamp: item.timestamp || '',
        originalDuration: 0,
        audioDuration: 0,
        difference: 0,
        needsCalibration: false
      })
    }
  }

  const hasItemsToCalibrate = calibrationItems.some(item => item.needsCalibration)

  return {
    hasItemsToCalibrate,
    items: calibrationItems,
    totalDifference
  }
}

/**
 * 执行时间戳校准
 * @param scriptItems 原始脚本项数组
 * @param calibrationItems 需要校准的项目
 * @param options 校准选项
 * @returns 校准后的脚本项数组
 */
export function performTimestampCalibration(
  scriptItems: ScriptItem[],
  calibrationItems: TimestampCalibrationItem[],
  options: CalibrationOptions = DEFAULT_CALIBRATION_OPTIONS
): ScriptItem[] {
  // 创建需要校准的项目映射
  const calibrationMap = new Map<number, number>()
  
  calibrationItems
    .filter(item => item.needsCalibration)
    .forEach(item => {
      calibrationMap.set(item._id, item.audioDuration)
    })

  if (calibrationMap.size === 0) {
    return scriptItems // 没有需要校准的项目
  }

  // 🎯 高精度校准：确保音频时长与视频片段时长精确一致
  let updatedItems = scriptItems.map(item => {
    const newDuration = calibrationMap.get(item._id)
    if (newDuration !== undefined) {
      try {
        // 确保时间字段完整性
        const normalizedItem = ensureTimeFields(item)

        // 🎯 高精度修复：使用精确的音频时长，避免浮点数累积误差
        const preciseAudioDuration = parseFloat(newDuration.toFixed(6))

        // 计算新的结束时间（毫秒）
        const newEndTimeMs = normalizedItem.start_time + Math.round(preciseAudioDuration * 1000)

        // 更新 timestamp 字符串
        const updatedTimestamp = createTimestampFromMs(normalizedItem.start_time, newEndTimeMs)

        // 更新所有时间字段
        return {
          ...item,
          timestamp: updatedTimestamp,
          start_time: normalizedItem.start_time,
          end_time: newEndTimeMs,
          start: normalizedItem.start_time / 1000,
          end: newEndTimeMs / 1000
        }
      } catch (error) {
        console.error('校准时间戳失败:', error, item)
        return item
      }
    }
    return item
  })

  // 如果需要调整后续片段时间
  if (options.autoAdjustSubsequent) {
    // 过滤出有 timestamp 的项目进行调整
    const itemsWithTimestamp = updatedItems.filter((item): item is ScriptItem & { timestamp: string } =>
      item.timestamp !== undefined
    )
    if (itemsWithTimestamp.length > 0) {
      const adjusted = adjustSubsequentTimestamps(itemsWithTimestamp, calibrationMap)
      // 按顺序合并回原数组，避免 _id 异常或重复时错误覆盖整行文本
      let adjustedIndex = 0
      updatedItems = updatedItems.map(item => {
        if (item.timestamp === undefined) {
          return item
        }

        const adjustedItem = adjusted[adjustedIndex]
        adjustedIndex += 1
        return adjustedItem || item
      })
    }
  }

  return updatedItems
}

/**
 * 获取校准统计信息
 * @param calibrationResult 校准结果
 * @returns 统计信息
 */
export function getCalibrationStats(calibrationResult: CalibrationResult) {
  const { items } = calibrationResult
  const totalItems = items.length
  const itemsNeedingCalibration = items.filter(item => item.needsCalibration).length
  
  const avgDifference = totalItems > 0 
    ? items.reduce((sum, item) => sum + item.difference, 0) / totalItems 
    : 0
  
  const maxDifference = items.length > 0 
    ? Math.max(...items.map(item => item.difference)) 
    : 0

  const minDifference = items.length > 0 
    ? Math.min(...items.map(item => item.difference)) 
    : 0

  return {
    totalItems,
    itemsNeedingCalibration,
    calibrationRate: totalItems > 0 ? itemsNeedingCalibration / totalItems : 0,
    avgDifference,
    maxDifference,
    minDifference,
    totalDifference: calibrationResult.totalDifference
  }
}

/**
 * 验证校准结果是否合理
 * @param originalItems 原始脚本项
 * @param calibratedItems 校准后的脚本项
 * @returns 验证结果
 */
export function validateCalibrationResult(originalItems: ScriptItem[], calibratedItems: ScriptItem[]): {
  isValid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  if (originalItems.length !== calibratedItems.length) {
    errors.push('校准前后脚本项数量不一致')
  }

  // 检查时间戳的连续性和合理性
  for (let i = 0; i < calibratedItems.length - 1; i++) {
    const current = calibratedItems[i]
    const next = calibratedItems[i + 1]

    try {
      const currentTimestamp = current.timestamp || ''
      const nextTimestamp = next.timestamp || ''
      if (!currentTimestamp || !nextTimestamp) {
        errors.push(`片段 ${current._id} 或 ${next._id} 缺少时间戳`)
        continue
      }
      const currentEnd = parseTimestamp(currentTimestamp).end
      const nextStart = parseTimestamp(nextTimestamp).start

      if (currentEnd > nextStart) {
        warnings.push(`片段 ${current._id} 和 ${next._id} 时间重叠`)
      }

      if (nextStart - currentEnd > 5) { // 如果间隔超过5秒
        warnings.push(`片段 ${current._id} 和 ${next._id} 之间间隔过大 (${nextStart - currentEnd} 秒)`)
      }
    } catch {
      errors.push(`片段 ${current._id} 或 ${next._id} 的时间戳格式无效`)
    }
  }

  // 检查负时长
  calibratedItems.forEach(item => {
    try {
      const timestamp = item.timestamp || ''
      if (!timestamp) {
        errors.push(`片段 ${item._id} 缺少时间戳`)
        return
      }
      const { start, end } = parseTimestamp(timestamp)
      if (end <= start) {
        errors.push(`片段 ${item._id} 的结束时间不大于开始时间`)
      }
      if (start < 0) {
        errors.push(`片段 ${item._id} 的开始时间为负数`)
      }
    } catch {
      errors.push(`片段 ${item._id} 的时间戳格式无效`)
    }
  })

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * 创建校准摘要报告
 * @param calibrationResult 校准结果
 * @param originalItems 原始脚本项
 * @param calibratedItems 校准后的脚本项（可选）
 * @returns 摘要报告
 */
export function createCalibrationSummary(
  calibrationResult: CalibrationResult,
  originalItems: ScriptItem[],
  calibratedItems?: ScriptItem[]
) {
  const stats = getCalibrationStats(calibrationResult)
  const needCalibrationItems = calibrationResult.items.filter(item => item.needsCalibration)
  
  let validation: ReturnType<typeof validateCalibrationResult> | null = null
  if (calibratedItems) {
    validation = validateCalibrationResult(originalItems, calibratedItems)
  }

  return {
    summary: {
      totalScriptItems: originalItems.length,
      narrativeItems: originalItems.filter(item => item.OST === 0).length,
      itemsChecked: stats.totalItems,
      itemsNeedingCalibration: stats.itemsNeedingCalibration,
      calibrationRate: Math.round(stats.calibrationRate * 100),
      totalTimeDifference: Math.round(stats.totalDifference * 100) / 100,
      avgDifference: Math.round(stats.avgDifference * 100) / 100,
      maxDifference: Math.round(stats.maxDifference * 100) / 100
    },
    needCalibrationItems: needCalibrationItems.map(item => ({
      id: item._id,
      timestamp: item.timestamp,
      originalDuration: Math.round(item.originalDuration * 100) / 100,
      audioDuration: Math.round(item.audioDuration * 100) / 100,
      difference: Math.round(item.difference * 100) / 100
    })),
    validation: validation ? {
      isValid: validation.isValid,
      errorCount: validation.errors.length,
      warningCount: validation.warnings.length,
      errors: validation.errors,
      warnings: validation.warnings
    } : null
  }
}
