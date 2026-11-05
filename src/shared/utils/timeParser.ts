/**
 * 时间戳解析工具函数
 * 处理脚本中的时间戳格式："00:00:05,000-00:00:10,000"
 */

export interface TimeRange {
  startTime: number // 秒
  endTime: number   // 秒
  duration: number  // 秒
}

/**
 * 解析时间字符串为秒数
 * @param timeStr 时间字符串，格式：HH:MM:SS,mmm 或 MM:SS,mmm
 * @returns 秒数（包含毫秒）
 */
export function parseTimeToSeconds(timeStr: string): number {
  try {
    // 移除空白字符
    timeStr = timeStr.trim()
    
    // 分割时间和毫秒部分
    const [timePart, millisPart = '000'] = timeStr.split(/[,.]/)
    
    // 分割时、分、秒
    const timeParts = timePart.split(':')
    
    let hours = 0
    let minutes = 0
    let seconds = 0
    
    if (timeParts.length === 3) {
      // HH:MM:SS 格式
      hours = parseInt(timeParts[0], 10) || 0
      minutes = parseInt(timeParts[1], 10) || 0
      seconds = parseInt(timeParts[2], 10) || 0
    } else if (timeParts.length === 2) {
      // MM:SS 格式
      minutes = parseInt(timeParts[0], 10) || 0
      seconds = parseInt(timeParts[1], 10) || 0
    } else {
      throw new Error(`Invalid time format: ${timeStr}`)
    }
    
    // 解析毫秒
    const milliseconds = parseInt(millisPart.padEnd(3, '0').slice(0, 3), 10) || 0
    
    // 转换为总秒数
    const totalSeconds = hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
    
    return totalSeconds
  } catch (error) {
    console.error('Failed to parse time string:', timeStr, error)
    return 0
  }
}

/**
 * 将秒数转换为时间字符串
 * @param seconds 秒数
 * @param includeMillis 是否包含毫秒
 * @returns 时间字符串
 */
export function secondsToTimeString(seconds: number, includeMillis: boolean = true): string {
  const totalMs = Math.round(seconds * 1000)
  const ms = totalMs % 1000
  const totalSecs = Math.floor(totalMs / 1000)
  
  const hours = Math.floor(totalSecs / 3600)
  const minutes = Math.floor((totalSecs % 3600) / 60)
  const secs = totalSecs % 60
  
  const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  
  if (includeMillis) {
    return `${timeStr},${ms.toString().padStart(3, '0')}`
  }
  
  return timeStr
}

/**
 * 解析时间戳范围字符串
 * @param timestampStr 时间戳字符串，格式："00:00:05,000-00:00:10,000"
 * @returns TimeRange 对象
 */
export function parseTimestampRange(timestampStr: string): TimeRange {
  try {
    // 分割开始和结束时间
    const [startTimeStr, endTimeStr] = timestampStr.split('-')
    
    if (!startTimeStr || !endTimeStr) {
      throw new Error(`Invalid timestamp range format: ${timestampStr}`)
    }
    
    const startTime = parseTimeToSeconds(startTimeStr)
    const endTime = parseTimeToSeconds(endTimeStr)
    
    if (startTime >= endTime) {
      throw new Error(`Invalid time range: start time (${startTime}) must be less than end time (${endTime})`)
    }
    
    const duration = endTime - startTime
    
    return {
      startTime,
      endTime,
      duration
    }
  } catch (error) {
    console.error('Failed to parse timestamp range:', timestampStr, error)
    return {
      startTime: 0,
      endTime: 0,
      duration: 0
    }
  }
}

/**
 * 验证时间戳是否有效
 * @param timestampStr 时间戳字符串
 * @returns 是否有效
 */
export function validateTimestamp(timestampStr: string): boolean {
  try {
    const timeRange = parseTimestampRange(timestampStr)
    return timeRange.duration > 0
  } catch {
    return false
  }
}

/**
 * 检查时间戳范围是否有重叠
 * @param timestamps 时间戳字符串数组
 * @returns 重叠的时间戳对
 */
export function findOverlappingTimestamps(timestamps: string[]): Array<[string, string]> {
  const overlaps: Array<[string, string]> = []
  const ranges = timestamps.map(ts => ({ timestamp: ts, ...parseTimestampRange(ts) }))
  
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const range1 = ranges[i]
      const range2 = ranges[j]
      
      // 检查是否有重叠
      if (range1.startTime < range2.endTime && range2.startTime < range1.endTime) {
        overlaps.push([range1.timestamp, range2.timestamp])
      }
    }
  }
  
  return overlaps
}

/**
 * 检查时间戳序列是否按时间顺序排列
 * @param timestamps 时间戳字符串数组
 * @returns 是否按顺序排列
 */
export function areTimestampsInOrder(timestamps: string[]): boolean {
  const ranges = timestamps.map(parseTimestampRange)
  
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].startTime < ranges[i - 1].endTime) {
      return false
    }
  }
  
  return true
}

/**
 * 计算时间戳序列的总时长
 * @param timestamps 时间戳字符串数组
 * @returns 总时长（秒）
 */
export function calculateTotalDuration(timestamps: string[]): number {
  return timestamps.reduce((total, timestamp) => {
    const range = parseTimestampRange(timestamp)
    return total + range.duration
  }, 0)
}

/**
 * 查找时间戳序列中的间隙
 * @param timestamps 时间戳字符串数组
 * @returns 间隙数组，每个间隙包含开始时间和结束时间
 */
export function findTimestampGaps(timestamps: string[]): Array<{ start: number; end: number; duration: number }> {
  const gaps: Array<{ start: number; end: number; duration: number }> = []
  const ranges = timestamps.map(parseTimestampRange).sort((a, b) => a.startTime - b.startTime)
  
  for (let i = 1; i < ranges.length; i++) {
    const prevEnd = ranges[i - 1].endTime
    const currentStart = ranges[i].startTime
    
    if (currentStart > prevEnd) {
      gaps.push({
        start: prevEnd,
        end: currentStart,
        duration: currentStart - prevEnd
      })
    }
  }
  
  return gaps
}

/**
 * 调整时间戳以消除间隙（向前移动后续片段）
 * @param timestamps 时间戳字符串数组
 * @returns 调整后的时间戳数组
 */
export function adjustTimestampsToRemoveGaps(timestamps: string[]): string[] {
  const ranges = timestamps.map((ts, index) => ({ 
    original: ts, 
    index, 
    ...parseTimestampRange(ts) 
  })).sort((a, b) => a.startTime - b.startTime)
  
  let currentTime = 0
  const adjusted: Array<{ index: number; timestamp: string }> = []
  
  for (const range of ranges) {
    const newStart = currentTime
    const newEnd = currentTime + range.duration
    
    adjusted.push({
      index: range.index,
      timestamp: `${secondsToTimeString(newStart)}-${secondsToTimeString(newEnd)}`
    })
    
    currentTime = newEnd
  }
  
  // 按原始顺序返回调整后的时间戳
  adjusted.sort((a, b) => a.index - b.index)
  return adjusted.map(item => item.timestamp)
}