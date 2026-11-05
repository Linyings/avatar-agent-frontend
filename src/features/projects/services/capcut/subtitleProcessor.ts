/**
 * 剪映草稿生成 - 字幕处理工具
 * 负责字幕分行和样式处理
 */

import { SUBTITLE_MAX_CHARS_PER_LINE } from './constants'

/**
 * 移除导入剪映时展示在字幕中的标点符号。
 * 只处理字幕文本，不影响原始脚本和配音内容。
 */
export function removeSubtitlePunctuation(text: string): string {
  return text
    .replace(/\p{P}+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 将文本按字符数智能分行
 * 优先在标点符号处换行，确保阅读流畅
 *
 * @param text 要分行的文本
 * @param maxChars 每行最多字符数
 * @returns 分行后的文本数组
 */
export function splitTextIntoLines(
  text: string,
  maxChars: number = SUBTITLE_MAX_CHARS_PER_LINE
): string[] {
  if (!text || text.trim().length === 0) {
    return []
  }

  const lines: string[] = []
  let currentLine = ''

  // 标点符号列表（优先换行）
  const primaryPunctuations = ['。', '！', '？', '.', '!', '?']
  const secondaryPunctuations = ['，', '、', '；', ',', ';']

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    currentLine += char

    // 检查是否达到最大字符数
    if (currentLine.length >= maxChars) {
      // 优先在主要标点符号后换行
      if (primaryPunctuations.includes(char)) {
        lines.push(currentLine)
        currentLine = ''
      }
      // 次要标点符号也可以换行
      else if (secondaryPunctuations.includes(char)) {
        lines.push(currentLine)
        currentLine = ''
      }
      // 超过最大字符数，强制换行
      else if (currentLine.length > maxChars) {
        lines.push(currentLine)
        currentLine = ''
      }
    }
    // 即使未达到最大字符数，也在主要标点符号后换行（如果已经有一定长度）
    else if (
      primaryPunctuations.includes(char) &&
      currentLine.length >= maxChars * 0.6
    ) {
      lines.push(currentLine)
      currentLine = ''
    }
  }

  // 添加剩余部分
  if (currentLine.trim().length > 0) {
    lines.push(currentLine)
  }

  return lines
}

/**
 * 计算字幕行的均匀时长分配
 *
 * @param totalDuration 总时长（微秒）
 * @param lineCount 行数
 * @returns 每行的时长（微秒）
 */
export function calculateLineDuration(
  totalDuration: number,
  lineCount: number
): number {
  if (lineCount <= 0) {
    return totalDuration
  }

  return Math.floor(totalDuration / lineCount)
}

/**
 * 生成字幕行的时间轴信息
 *
 * @param startTime 起始时间（微秒）
 * @param totalDuration 总时长（微秒）
 * @param lineCount 行数
 * @returns 每行的起始时间和时长
 */
export function generateSubtitleTimeline(
  startTime: number,
  totalDuration: number,
  lineCount: number
): Array<{ start: number; duration: number }> {
  if (lineCount <= 0) {
    return []
  }

  const lineDuration = calculateLineDuration(totalDuration, lineCount)
  const timeline: Array<{ start: number; duration: number }> = []

  for (let i = 0; i < lineCount; i++) {
    timeline.push({
      start: startTime + i * lineDuration,
      duration: lineDuration
    })
  }

  return timeline
}
