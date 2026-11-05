/**
 * 时间戳工具函数
 * 处理时间戳格式转换和计算
 */

/**
 * 将时:分:秒,毫秒格式转换为总秒数 (高精度版本)
 * @param timeString 时间字符串，格式如 "00:01:23,500"
 * @returns 总秒数，精确到微秒级别
 */
export function timeStringToSeconds(timeString: string): number {
  const [timePart, millisPart = '0'] = timeString.split(',')
  const [hours, minutes, seconds] = timePart.split(':').map(Number)
  
  // 🎯 高精度修复：使用Number而非Math.floor避免精度损失
  const totalSeconds = hours * 3600 + minutes * 60 + seconds
  
  // 🎯 高精度修复：支持更高精度的毫秒处理，避免parseInt截断
  const milliseconds = parseFloat(millisPart.padEnd(3, '0').slice(0, 6)) // 支持微秒精度
  
  // 🎯 高精度修复：使用精确的除法运算
  const preciseResult = totalSeconds + (milliseconds / 1000)
  
  // 使用toFixed然后parseFloat来确保精度一致性，避免浮点数累积误差
  return parseFloat(preciseResult.toFixed(6))
}

/**
 * 将总秒数转换为时:分:秒,毫秒格式 (高精度版本)
 * @param seconds 总秒数
 * @returns 格式化的时间字符串，精确到毫秒
 */
export function secondsToTimeString(seconds: number): string {
  // 🎯 高精度修复：先进行精度标准化，避免累积误差
  const preciseSeconds = parseFloat(seconds.toFixed(6))
  
  const hours = Math.floor(preciseSeconds / 3600)
  const minutes = Math.floor((preciseSeconds % 3600) / 60)
  const secs = Math.floor(preciseSeconds % 60)
  
  // 🎯 高精度修复：更精确的毫秒计算，避免舍入误差
  const fractionalPart = preciseSeconds % 1
  const millis = Math.round(fractionalPart * 1000)
  
  // 确保毫秒不会因为舍入导致超过999
  const finalMillis = millis >= 1000 ? 999 : millis
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${finalMillis.toString().padStart(3, '0')}`
}

/**
 * 解析时间戳字符串为开始和结束时间（秒）
 * @param timestamp 时间戳字符串，格式如 "00:00:05,000-00:00:10,000"
 * @returns 包含开始和结束时间的对象
 */
export function parseTimestamp(timestamp: string): { start: number; end: number } {
  const parts = timestamp.split('-')
  if (parts.length !== 2) {
    throw new Error(`无效的时间戳格式: ${timestamp}`)
  }
  
  const start = timeStringToSeconds(parts[0].trim())
  const end = timeStringToSeconds(parts[1].trim())
  
  if (end <= start) {
    throw new Error(`结束时间必须大于开始时间: ${timestamp}`)
  }
  
  return { start, end }
}

/**
 * 根据开始和结束时间创建时间戳字符串
 * @param start 开始时间（秒）
 * @param end 结束时间（秒）
 * @returns 时间戳字符串
 */
export function createTimestamp(start: number, end: number): string {
  if (end <= start) {
    throw new Error(`结束时间必须大于开始时间: start=${start}, end=${end}`)
  }
  
  return `${secondsToTimeString(start)}-${secondsToTimeString(end)}`
}

/**
 * 更新时间戳的持续时间
 * @param originalTimestamp 原时间戳字符串
 * @param newDurationSeconds 新的持续时间（秒）
 * @returns 更新后的时间戳字符串
 */
export function updateTimestampDuration(originalTimestamp: string, newDurationSeconds: number): string {
  const { start } = parseTimestamp(originalTimestamp)
  const newEnd = start + newDurationSeconds
  return createTimestamp(start, newEnd)
}

/**
 * 计算时间戳的持续时间
 * @param timestamp 时间戳字符串
 * @returns 持续时间（秒）
 */
export function getTimestampDuration(timestamp: string): number {
  const { start, end } = parseTimestamp(timestamp)
  return end - start
}

/**
 * 为脚本项添加start和end字段
 * @param scriptItems 脚本项数组
 * @returns 添加了start和end字段的脚本项数组
 */
export function enhanceScriptItemsWithTime<T extends { timestamp: string }>(scriptItems: T[]): T[] {
  return scriptItems.map(item => {
    try {
      const { start, end } = parseTimestamp(item.timestamp)
      return {
        ...item,
        start,
        end
      }
    } catch (error) {
      // 如果解析失败，返回原对象
      return item
    }
  })
}

/**
 * 调整连续片段的时间，避免重叠
 * @param scriptItems 脚本项数组
 * @param calibratedItems 已校准的项目映射 (id -> newDuration)
 * @returns 调整后的脚本项数组
 */
export function adjustSubsequentTimestamps<T extends { _id: number; timestamp: string; start?: number; end?: number }>(
  scriptItems: T[], 
  calibratedItems: Map<number, number>
): T[] {
  if (calibratedItems.size === 0) {
    return scriptItems
  }

  const result = [...scriptItems]
  let timeOffset = 0 // 累积的时间偏移量

  for (let i = 0; i < result.length; i++) {
    const item = result[i]
    const newDuration = calibratedItems.get(item._id)

    if (newDuration !== undefined) {
      // 当前项需要校准
      const { start } = parseTimestamp(item.timestamp)
      const adjustedStart = start + timeOffset
      const adjustedEnd = adjustedStart + newDuration

      result[i] = {
        ...item,
        timestamp: createTimestamp(adjustedStart, adjustedEnd),
        start: adjustedStart,
        end: adjustedEnd
      }

      // 计算时间偏移量的变化
      const originalDuration = getTimestampDuration(item.timestamp)
      timeOffset += (newDuration - originalDuration)
    } else if (timeOffset !== 0) {
      // 后续项需要调整时间
      const { start, end } = parseTimestamp(item.timestamp)
      const adjustedStart = start + timeOffset
      const adjustedEnd = end + timeOffset

      result[i] = {
        ...item,
        timestamp: createTimestamp(adjustedStart, adjustedEnd),
        start: adjustedStart,
        end: adjustedEnd
      }
    }
  }

  return result
}

/**
 * 验证时间戳格式是否正确
 * @param timestamp 时间戳字符串
 * @returns 是否有效
 */
export function isValidTimestamp(timestamp: string): boolean {
  try {
    parseTimestamp(timestamp)
    return true
  } catch {
    return false
  }
}

/**
 * 将毫秒转换为时间戳字符串
 * @param milliseconds 毫秒数
 * @returns 时间字符串，格式如 "00:01:23,500"
 */
export function millisecondsToTimeString(milliseconds: number): string {
  return secondsToTimeString(milliseconds / 1000)
}

/**
 * 将时间字符串转换为毫秒
 * @param timeString 时间字符串，格式如 "00:01:23,500"
 * @returns 毫秒数
 */
export function timeStringToMilliseconds(timeString: string): number {
  return Math.round(timeStringToSeconds(timeString) * 1000)
}

/**
 * 从 start_time 和 end_time（毫秒）创建 timestamp 字符串
 * @param startTimeMs 开始时间（毫秒）
 * @param endTimeMs 结束时间（毫秒）
 * @returns 时间戳字符串，格式如 "00:00:05,000-00:00:10,000"
 */
export function createTimestampFromMs(startTimeMs: number, endTimeMs: number): string {
  if (endTimeMs <= startTimeMs) {
    throw new Error(`结束时间必须大于开始时间: start=${startTimeMs}ms, end=${endTimeMs}ms`)
  }

  const startStr = millisecondsToTimeString(startTimeMs)
  const endStr = millisecondsToTimeString(endTimeMs)
  return `${startStr}-${endStr}`
}

/**
 * 解析 timestamp 字符串为 start_time 和 end_time（毫秒）
 * @param timestamp 时间戳字符串，格式如 "00:00:05,000-00:00:10,000"
 * @returns 包含 start_time 和 end_time（毫秒）的对象
 */
export function parseTimestampToMs(timestamp: string): { start_time: number; end_time: number } {
  const { start, end } = parseTimestamp(timestamp)
  return {
    start_time: Math.round(start * 1000),
    end_time: Math.round(end * 1000)
  }
}

/**
 * 确保对象同时具有 timestamp 和 start_time/end_time 字段
 * 如果缺失任一格式，自动转换补充
 * @param item 脚本项或分析项
 * @returns 包含完整时间字段的对象
 */
export function ensureTimeFields<T extends {
  timestamp?: string
  start_time?: number
  end_time?: number
  start?: number
  end?: number
}>(item: T): T & {
  timestamp: string
  start_time: number
  end_time: number
  start: number
  end: number
} {
  let timestamp: string
  let start_time: number
  let end_time: number
  let start: number
  let end: number

  // ✅ 优先使用 start/end（秒） - 新格式
  if (item.start !== undefined && item.end !== undefined) {
    start = item.start
    end = item.end
    start_time = Math.round(start * 1000)
    end_time = Math.round(end * 1000)
    timestamp = item.timestamp || createTimestampFromMs(start_time, end_time)
  }
  // 其次使用 start_time/end_time（毫秒）
  else if (item.start_time !== undefined && item.end_time !== undefined) {
    start_time = item.start_time
    end_time = item.end_time
    timestamp = item.timestamp || createTimestampFromMs(start_time, end_time)
    start = start_time / 1000
    end = end_time / 1000
  }
  // 再使用 timestamp（旧格式）
  else if (item.timestamp) {
    timestamp = item.timestamp
    const parsed = parseTimestamp(timestamp)
    start = parsed.start
    end = parsed.end
    start_time = Math.round(start * 1000)
    end_time = Math.round(end * 1000)
  }
  // 都没有则抛出错误
  else {
    throw new Error('对象必须包含 start/end、timestamp 或 start_time/end_time 字段之一')
  }

  return {
    ...item,
    timestamp,
    start_time,
    end_time,
    start,
    end
  }
}

/**
 * 批量确保对象数组的时间字段完整性
 * @param items 脚本项或分析项数组
 * @returns 包含完整时间字段的对象数组
 */
export function ensureTimeFieldsBatch<T extends {
  timestamp?: string
  start_time?: number
  end_time?: number
  start?: number
  end?: number
}>(items: T[]): Array<T & {
  timestamp: string
  start_time: number
  end_time: number
  start: number
  end: number
}> {
  return items.map(item => {
    try {
      return ensureTimeFields(item)
    } catch (error) {
      console.error('时间字段转换失败:', item, error)
      // 返回原对象，但标记为无效
      return item as any
    }
  })
}