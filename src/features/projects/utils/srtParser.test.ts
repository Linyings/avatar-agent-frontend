/**
 * SRT 解析工具单元测试
 */

import { describe, it, expect } from 'vitest'
import {
  validateSRTFormat,
  parseSRT,
  convertSRTToSubtitleResult,
  detectLanguage,
  formatSecondsToSRTTime,
  convertSegmentsToSRT
} from './srtParser'

describe('srtParser', () => {
  describe('validateSRTFormat', () => {
    it('应该验证有效的 SRT 格式', () => {
      const validSRT = `1
00:00:10,000 --> 00:00:15,500
第一段字幕内容

2
00:00:15,500 --> 00:00:20,000
第二段字幕内容`

      const result = validateSRTFormat(validSRT)
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('应该拒绝空内容', () => {
      const result = validateSRTFormat('')
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('SRT 文件内容为空')
    })

    it('应该拒绝内容过少', () => {
      const result = validateSRTFormat('1\n')
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('SRT 文件格式不正确，内容过少')
    })

    it('应该拒绝缺少序号', () => {
      const invalidSRT = `00:00:10,000 --> 00:00:15,500
字幕内容
多余内容`

      const result = validateSRTFormat(invalidSRT)
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('SRT 文件格式不正确，缺少序号')
    })

    it('应该拒绝时间轴格式错误', () => {
      const invalidSRT = `1
00:10:00 - 00:15:00
字幕内容`

      const result = validateSRTFormat(invalidSRT)
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('SRT 文件格式不正确，时间轴格式错误')
    })
  })

  describe('parseSRT', () => {
    it('应该正确解析标准 SRT 格式', () => {
      const srt = `1
00:00:10,000 --> 00:00:15,500
第一段字幕内容

2
00:00:15,500 --> 00:00:20,000
第二段字幕内容`

      const segments = parseSRT(srt)

      expect(segments).toHaveLength(2)

      expect(segments[0]).toEqual({
        id: '1',
        startTime: 10.0,
        endTime: 15.5,
        text: '第一段字幕内容',
        confidence: 1.0
      })

      expect(segments[1]).toEqual({
        id: '2',
        startTime: 15.5,
        endTime: 20.0,
        text: '第二段字幕内容',
        confidence: 1.0
      })
    })

    it('应该正确解析多行字幕文本', () => {
      const srt = `1
00:00:10,000 --> 00:00:15,500
第一行
第二行
第三行`

      const segments = parseSRT(srt)

      expect(segments).toHaveLength(1)
      expect(segments[0].text).toBe('第一行\n第二行\n第三行')
    })

    it('应该正确转换时间格式', () => {
      const srt = `1
01:30:45,678 --> 01:35:50,123
字幕内容`

      const segments = parseSRT(srt)

      expect(segments).toHaveLength(1)
      // 1小时30分45秒678毫秒 = 5445.678秒，保留两位小数 = 5445.68
      expect(segments[0].startTime).toBe(5445.68)
      // 1小时35分50秒123毫秒 = 5750.123秒，保留两位小数 = 5750.12
      expect(segments[0].endTime).toBe(5750.12)
    })

    it('应该跳过空文本的字幕块', () => {
      const srt = `1
00:00:10,000 --> 00:00:15,500
第一段字幕

2
00:00:15,500 --> 00:00:20,000


3
00:00:20,000 --> 00:00:25,000
第三段字幕`

      const segments = parseSRT(srt)

      expect(segments).toHaveLength(2)
      expect(segments[0].id).toBe('1')
      expect(segments[1].id).toBe('3')
    })

    it('应该处理空行分隔的字幕块', () => {
      const srt = `1
00:00:10,000 --> 00:00:15,500
第一段字幕


2
00:00:15,500 --> 00:00:20,000
第二段字幕`

      const segments = parseSRT(srt)

      expect(segments).toHaveLength(2)
    })

    it('应该处理特殊字符', () => {
      const srt = `1
00:00:10,000 --> 00:00:15,500
包含特殊字符：<i>斜体</i>、"引号"、【方括号】`

      const segments = parseSRT(srt)

      expect(segments).toHaveLength(1)
      expect(segments[0].text).toContain('<i>斜体</i>')
    })
  })

  describe('convertSRTToSubtitleResult', () => {
    it('应该转换为 SubtitleExtractionResult 格式', () => {
      const srt = `1
00:00:10,000 --> 00:00:15,500
第一段字幕

2
00:00:15,500 --> 00:00:20,000
第二段字幕`

      const result = convertSRTToSubtitleResult(srt, 30)

      expect(result.segments).toHaveLength(2)
      expect(result.language).toBe('zh-CN')
      expect(result.totalDuration).toBe(30)
      expect(result.confidence).toBe(1.0)
      expect(result.processingTime).toBe(0)
    })

    it('应该使用最后字幕的结束时间作为总时长（如果更大）', () => {
      const srt = `1
00:00:10,000 --> 00:01:00,000
长时间字幕`

      const result = convertSRTToSubtitleResult(srt, 30)

      expect(result.totalDuration).toBe(60) // 使用字幕的结束时间
    })

    it('应该抛出错误当格式无效', () => {
      const invalidSRT = 'invalid content'

      expect(() => {
        convertSRTToSubtitleResult(invalidSRT, 30)
      }).toThrow()
    })

    it('应该抛出错误当没有有效字幕', () => {
      // 创建一个能通过验证但解析后没有有效字幕的 SRT
      // 使用只包含空格的文本，会被 trim() 后变成空字符串
      const emptySRT = `1
00:00:10,000 --> 00:00:15,500


2
00:00:15,500 --> 00:00:20,000
  `

      expect(() => {
        convertSRTToSubtitleResult(emptySRT, 30)
      }).toThrow('SRT 文件格式不正确，缺少字幕文本')
    })
  })

  describe('detectLanguage', () => {
    it('应该检测中文', () => {
      const segments = [
        {
          id: '1',
          startTime: 0,
          endTime: 5,
          text: '这是中文字幕内容',
          confidence: 1.0
        }
      ]

      const language = detectLanguage(segments)
      expect(language).toBe('zh-CN')
    })

    it('应该检测英文', () => {
      const segments = [
        {
          id: '1',
          startTime: 0,
          endTime: 5,
          text: 'This is English subtitle',
          confidence: 1.0
        }
      ]

      const language = detectLanguage(segments)
      expect(language).toBe('en')
    })

    it('应该处理空数组', () => {
      const language = detectLanguage([])
      expect(language).toBe('zh-CN') // 默认中文
    })

    it('应该检测中英混合（中文为主）', () => {
      const segments = [
        {
          id: '1',
          startTime: 0,
          endTime: 5,
          text: '这是主要的中文内容和一些英文 English words',
          confidence: 1.0
        }
      ]

      const language = detectLanguage(segments)
      expect(language).toBe('zh-CN')
    })
  })

  describe('formatSecondsToSRTTime', () => {
    it('应该格式化为标准 SRT 时间戳', () => {
      expect(formatSecondsToSRTTime(3661.235)).toBe('01:01:01,235')
    })

    it('应该处理负数和非法值', () => {
      expect(formatSecondsToSRTTime(-1)).toBe('00:00:00,000')
      expect(formatSecondsToSRTTime(Number.NaN)).toBe('00:00:00,000')
    })
  })

  describe('convertSegmentsToSRT', () => {
    it('应该把字幕段落转换为 SRT 文本', () => {
      const srt = convertSegmentsToSRT([
        {
          id: 'seg-a',
          startTime: 1.2,
          endTime: 3.45,
          text: '第一段字幕',
          confidence: 1
        },
        {
          id: 'seg-b',
          startTime: 4,
          endTime: 5.678,
          text: '第二段字幕\n第二行',
          confidence: 1
        }
      ])

      expect(srt).toBe(`1
00:00:01,200 --> 00:00:03,450
第一段字幕

2
00:00:04,000 --> 00:00:05,678
第二段字幕
第二行`)
    })
  })
})
