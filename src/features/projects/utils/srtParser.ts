/**
 * SRT 字幕文件解析工具
 *
 * 功能：
 * - 解析标准 SRT 格式字幕文件
 * - 转换为 SubtitleExtractionResult 格式
 * - 验证 SRT 格式
 */

import type { SubtitleExtractionResult, SubtitleSegment } from '../types/material'

/**
 * SRT 时间格式正则表达式
 * 格式：HH:MM:SS,mmm --> HH:MM:SS,mmm
 */
const SRT_TIME_REGEX = /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/

/**
 * 将 SRT 时间格式转换为秒（保留两位小数）
 * @param hours 小时
 * @param minutes 分钟
 * @param seconds 秒
 * @param milliseconds 毫秒
 * @returns 总秒数（保留两位小数）
 */
function srtTimeToSeconds(
  hours: string,
  minutes: string,
  seconds: string,
  milliseconds: string
): number {
  const h = parseInt(hours, 10)
  const m = parseInt(minutes, 10)
  const s = parseInt(seconds, 10)
  const ms = parseInt(milliseconds, 10)

  const totalSeconds = h * 3600 + m * 60 + s + ms / 1000

  // 保留两位小数
  return Math.round(totalSeconds * 100) / 100
}

/**
 * 将秒数格式化为 SRT 时间戳
 * 格式：HH:MM:SS,mmm
 */
export function formatSecondsToSRTTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const totalMilliseconds = Math.round(safeSeconds * 1000)
  const hours = Math.floor(totalMilliseconds / 3600000)
  const minutes = Math.floor((totalMilliseconds % 3600000) / 60000)
  const secs = Math.floor((totalMilliseconds % 60000) / 1000)
  const milliseconds = totalMilliseconds % 1000

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`
}

/**
 * 将字幕段落转换为 SRT 文件内容
 */
export function convertSegmentsToSRT(segments: SubtitleSegment[]): string {
  return segments
    .map((segment, index) => {
      const sequence = index + 1
      const text = segment.text.trim()

      return [
        sequence,
        `${formatSecondsToSRTTime(segment.startTime)} --> ${formatSecondsToSRTTime(segment.endTime)}`,
        text
      ].join('\n')
    })
    .join('\n\n')
}

/**
 * 验证 SRT 文件格式
 * @param content SRT 文件内容
 * @returns 验证结果
 */
export function validateSRTFormat(content: string): {
  isValid: boolean
  error?: string
} {
  if (!content || content.trim().length === 0) {
    return {
      isValid: false,
      error: 'SRT 文件内容为空'
    }
  }

  const lines = content.trim().split('\n')

  // 检查是否至少有一个字幕块（序号 + 时间轴 + 文本）
  if (lines.length < 3) {
    return {
      isValid: false,
      error: 'SRT 文件格式不正确，内容过少'
    }
  }

  // 检查第一个块的格式
  const firstBlock = content.trim().split('\n\n')[0]
  const firstBlockLines = firstBlock.split('\n')

  // 第一行应该是数字（序号）
  if (!/^\d+$/.test(firstBlockLines[0].trim())) {
    return {
      isValid: false,
      error: 'SRT 文件格式不正确，缺少序号'
    }
  }

  // 第二行应该包含时间轴
  if (!SRT_TIME_REGEX.test(firstBlockLines[1])) {
    return {
      isValid: false,
      error: 'SRT 文件格式不正确，时间轴格式错误'
    }
  }

  // 应该至少有字幕文本
  if (firstBlockLines.length < 3) {
    return {
      isValid: false,
      error: 'SRT 文件格式不正确，缺少字幕文本'
    }
  }

  return { isValid: true }
}

/**
 * 解析 SRT 文件内容
 * @param srtContent SRT 文件内容
 * @returns 解析后的字幕段落数组
 */
export function parseSRT(srtContent: string): SubtitleSegment[] {
  const segments: SubtitleSegment[] = []

  // 按空行分割字幕块
  const blocks = srtContent
    .trim()
    .split(/\n\s*\n/)
    .filter(block => block.trim().length > 0)

  for (const block of blocks) {
    const lines = block.split('\n').map(line => line.trim())

    // 跳过空块
    if (lines.length < 3) {
      continue
    }

    // 第一行：序号
    const id = lines[0]

    // 第二行：时间轴
    const timeLine = lines[1]
    const timeMatch = timeLine.match(SRT_TIME_REGEX)

    if (!timeMatch) {
      console.warn(`跳过格式错误的字幕块: ${id}`)
      continue
    }

    // 解析开始时间和结束时间
    const startTime = srtTimeToSeconds(
      timeMatch[1], // 小时
      timeMatch[2], // 分钟
      timeMatch[3], // 秒
      timeMatch[4]  // 毫秒
    )

    const endTime = srtTimeToSeconds(
      timeMatch[5], // 小时
      timeMatch[6], // 分钟
      timeMatch[7], // 秒
      timeMatch[8]  // 毫秒
    )

    // 第三行及之后：字幕文本（可能多行）
    const text = lines.slice(2).join('\n')

    // 跳过空文本
    if (!text || text.trim().length === 0) {
      continue
    }

    segments.push({
      id,
      startTime,
      endTime,
      text: text.trim(),
      confidence: 1.0 // SRT 文件假设为人工校对，置信度为 1
    })
  }

  return segments
}

/**
 * 将 SRT 内容转换为 SubtitleExtractionResult 格式
 * @param srtContent SRT 文件内容
 * @param videoDuration 视频总时长（秒）
 * @returns SubtitleExtractionResult 对象
 */
export function convertSRTToSubtitleResult(
  srtContent: string,
  videoDuration: number
): SubtitleExtractionResult {
  // 验证格式
  const validation = validateSRTFormat(srtContent)
  if (!validation.isValid) {
    throw new Error(validation.error || 'SRT 格式验证失败')
  }

  // 解析 SRT
  const segments = parseSRT(srtContent)

  if (segments.length === 0) {
    throw new Error('SRT 文件中没有有效的字幕内容')
  }

  // 计算实际的总时长（使用最后一个字幕的结束时间或视频时长，取较大值）
  const lastSegmentEndTime = segments[segments.length - 1].endTime
  const totalDuration = Math.max(lastSegmentEndTime, videoDuration)

  return {
    segments,
    language: 'zh-CN', // 默认中文，可以根据内容检测优化
    totalDuration,
    processingTime: 0, // 手动上传，无处理时间
    confidence: 1.0 // 人工校对的字幕，置信度为 1
  }
}

/**
 * 读取 SRT 文件
 * @param file 文件对象
 * @returns Promise<string> 文件内容
 */
export function readSRTFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    // 检查文件扩展名
    if (!file.name.toLowerCase().endsWith('.srt')) {
      reject(new Error('仅支持 .srt 格式的字幕文件'))
      return
    }

    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        resolve(content)
      } catch (error) {
        reject(new Error('文件读取失败'))
      }
    }

    reader.onerror = () => {
      reject(new Error('文件读取失败'))
    }

    // 尝试使用 UTF-8 读取
    reader.readAsText(file, 'UTF-8')
  })
}

/**
 * 检测 SRT 内容的语言（简单实现）
 * @param segments 字幕段落
 * @returns 语言代码
 */
export function detectLanguage(segments: SubtitleSegment[]): string {
  if (segments.length === 0) {
    return 'zh-CN'
  }

  // 简单检测：统计中文字符
  const sampleText = segments
    .slice(0, 10)
    .map(s => s.text)
    .join('')

  const chineseCharCount = (sampleText.match(/[\u4e00-\u9fa5]/g) || []).length
  const totalCharCount = sampleText.length

  // 如果中文字符占比超过 30%，认为是中文
  if (chineseCharCount / totalCharCount > 0.3) {
    return 'zh-CN'
  }

  // 默认返回英文
  return 'en'
}
