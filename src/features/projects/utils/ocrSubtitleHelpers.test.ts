import { describe, it, expect } from 'vitest'
import {
  mergeOcrTimestamps,
  buildOcrSubtitleFromRecognition,
  buildOcrImageInputFromGroup
} from './ocrSubtitleHelpers'
import type { ProjectSubtitleItem } from '../types/project'

describe('OCR字幕处理工具', () => {
  describe('mergeOcrTimestamps', () => {
    it('应该正确合并连续相同的字幕', () => {
      const timestamps = ['75.50', '76.00', '76.50']
      const text = ['你现在跟我走', '你现在跟我走', '你现在跟我走']

      const result = mergeOcrTimestamps(timestamps, text, 0.5)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        start_time: 75.5,
        end_time: 76.5, // 最后一次出现的时间戳
        subtitle: '你现在跟我走'
      })
    })

    it('应该过滤空字符串并中断合并', () => {
      const timestamps = ['75.50', '76.00', '76.50', '77.00', '77.50', '78.00']
      const text = ['你现在跟我走', '你现在跟我走', '', '他死了', '我负责', '我负责']

      const result = mergeOcrTimestamps(timestamps, text, 0.5)

      expect(result).toHaveLength(3)

      // 第一个片段：连续的"你现在跟我走"
      expect(result[0]).toEqual({
        start_time: 75.5,
        end_time: 76.0,
        subtitle: '你现在跟我走'
      })

      // 第二个片段：单独的"他死了"
      expect(result[1]).toEqual({
        start_time: 77.0,
        end_time: 77.5, // 单次出现，+0.5秒
        subtitle: '他死了'
      })

      // 第三个片段：连续的"我负责"
      expect(result[2]).toEqual({
        start_time: 77.5,
        end_time: 78.0,
        subtitle: '我负责'
      })
    })

    it('应该正确处理单次出现的字幕', () => {
      const timestamps = ['110.50', '111.00', '111.50']
      const text = ['冷冻一厂务科的王日新', '冷冻一厂务科的王日新', '是你吧']

      const result = mergeOcrTimestamps(timestamps, text, 0.5)

      expect(result).toHaveLength(2)

      expect(result[0]).toEqual({
        start_time: 110.5,
        end_time: 111.0,
        subtitle: '冷冻一厂务科的王日新'
      })

      expect(result[1]).toEqual({
        start_time: 111.5,
        end_time: 112.0, // 单次出现，+0.5秒
        subtitle: '是你吧'
      })
    })

    it('应该按时间戳排序（乱序输入）', () => {
      const timestamps = ['78.00', '75.50', '77.00', '76.00']
      const text = ['再见', '你好', '世界', '你好']

      const result = mergeOcrTimestamps(timestamps, text, 0.5)

      // 应该先排序再合并
      expect(result[0]).toEqual({
        start_time: 75.5,
        end_time: 76.0,
        subtitle: '你好'
      })

      expect(result[1]).toEqual({
        start_time: 77.0,
        end_time: 77.5,
        subtitle: '世界'
      })

      expect(result[2]).toEqual({
        start_time: 78.0,
        end_time: 78.5,
        subtitle: '再见'
      })
    })

    it('应该处理全部为空字符串的情况', () => {
      const timestamps = ['75.50', '76.00', '76.50']
      const text = ['', '', '']

      const result = mergeOcrTimestamps(timestamps, text, 0.5)

      expect(result).toHaveLength(0)
    })

    it('应该处理只有空格的文本', () => {
      const timestamps = ['75.50', '76.00', '76.50']
      const text = ['   ', '', '你好']

      const result = mergeOcrTimestamps(timestamps, text, 0.5)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        start_time: 76.5,
        end_time: 77.0,
        subtitle: '你好'
      })
    })

    it('应该正确处理带"s"后缀的时间戳', () => {
      const timestamps = ['75.50s', '76.00s', '76.50s']
      const text = ['你好', '你好', '你好']

      const result = mergeOcrTimestamps(timestamps, text, 0.5)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        start_time: 75.5,
        end_time: 76.5,
        subtitle: '你好'
      })
    })

    it('应该处理复杂的混合场景', () => {
      // 模拟真实的OCR识别结果
      const timestamps = [
        '110.50', '111.00', '111.50', '112.00', '112.50', '113.00',
        '113.50', '114.00', '114.50', '115.00'
      ]
      const text = [
        '冷冻一厂务科的王日新',
        '冷冻一厂务科的王日新',
        '是你吧',
        '是你吧',
        '',
        '年底优秀员工的评选活动',
        '年底优秀员工的评选活动',
        '年底优秀员工的评选活动',
        '年底优秀员工的评选活动',
        '年底优秀员工的评选活动'
      ]

      const result = mergeOcrTimestamps(timestamps, text, 0.5)

      expect(result).toHaveLength(3)

      expect(result[0]).toEqual({
        start_time: 110.5,
        end_time: 111.0,
        subtitle: '冷冻一厂务科的王日新'
      })

      expect(result[1]).toEqual({
        start_time: 111.5,
        end_time: 112.0,
        subtitle: '是你吧'
      })

      expect(result[2]).toEqual({
        start_time: 113.0,
        end_time: 115.0,
        subtitle: '年底优秀员工的评选活动'
      })
    })

    it('应该处理无效的时间戳（NaN）', () => {
      const timestamps = ['invalid', '76.00', '76.50']
      const text = ['错误', '你好', '你好']

      const result = mergeOcrTimestamps(timestamps, text, 0.5)

      // invalid 被解析为 0，"错误" 会被合并到时间 0
      // "你好" 会被合并到 76.00-76.50
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('buildOcrSubtitleFromRecognition', () => {
    it('应该正确转换为ASR格式（数字ID）', () => {
      const subtitles: ProjectSubtitleItem[] = [
        { start_time: 75.5, end_time: 76.0, subtitle: '你好' },
        { start_time: 77.0, end_time: 77.5, subtitle: '再见' }
      ]

      const result = buildOcrSubtitleFromRecognition(subtitles)

      expect(result).toEqual({
        '1': { start_time: 75.5, end_time: 76.0, subtitle: '你好' },
        '2': { start_time: 77.0, end_time: 77.5, subtitle: '再见' }
      })
    })

    it('应该处理空数组', () => {
      const result = buildOcrSubtitleFromRecognition([])

      expect(result).toEqual({})
    })

    it('应该保留3位小数精度', () => {
      const subtitles: ProjectSubtitleItem[] = [
        { start_time: 75.12345, end_time: 76.67890, subtitle: '测试' }
      ]

      const result = buildOcrSubtitleFromRecognition(subtitles)

      expect(result['1'].start_time).toBeCloseTo(75.123, 3)
      expect(result['1'].end_time).toBeCloseTo(76.679, 3)
    })

    it('应该从1开始递增ID', () => {
      const subtitles: ProjectSubtitleItem[] = [
        { start_time: 1.0, end_time: 2.0, subtitle: '第一条' },
        { start_time: 2.0, end_time: 3.0, subtitle: '第二条' },
        { start_time: 3.0, end_time: 4.0, subtitle: '第三条' }
      ]

      const result = buildOcrSubtitleFromRecognition(subtitles)

      expect(Object.keys(result)).toEqual(['1', '2', '3'])
    })
  })

  describe('buildOcrImageInputFromGroup', () => {
    it('应该将 Data URL 转换为 base64 OCR 输入', () => {
      const result = buildOcrImageInputFromGroup({
        mergedImageUrl: 'data:image/png;base64,ZmFrZS1wbmc='
      })

      expect(result).toEqual({
        type: 'base64',
        data: 'ZmFrZS1wbmc=',
        mime_type: 'image/png'
      })
    })

    it('应该兼容历史 R2 URL 数据', () => {
      const result = buildOcrImageInputFromGroup({
        mergedImageUrl: 'https://r2.narratoai.cn/ocr/group-2.jpg',
        r2Url: 'https://r2.narratoai.cn/ocr/group-2.jpg'
      })

      expect(result).toEqual({
        type: 'url',
        data: 'https://r2.narratoai.cn/ocr/group-2.jpg',
        mime_type: 'image/jpeg'
      })
    })

    it('应该在缺少可用图片地址时返回 null', () => {
      const result = buildOcrImageInputFromGroup({
        mergedImageUrl: 'blob:http://localhost/123'
      })

      expect(result).toBeNull()
    })
  })

  describe('完整流程测试', () => {
    it('应该正确处理从OCR API到ASR格式的完整流程', () => {
      // 模拟OCR API响应（用户截图的数据）
      const timestamps = [
        '75.50', '76.00', '76.50', '77.00', '77.50', '78.00', '78.50', '79.00', '79.50', '80.00'
      ]
      const text = [
        '你现在跟我走',
        '你现在跟我走',
        '',
        '他死了',
        '我负责',
        '我负责',
        '',
        '',
        '走',
        '走'
      ]

      // Step 1: 合并字幕
      const mergedSubtitles = mergeOcrTimestamps(timestamps, text, 0.5)

      expect(mergedSubtitles).toHaveLength(4)

      // Step 2: 转换为ASR格式
      const asrFormat = buildOcrSubtitleFromRecognition(mergedSubtitles)

      expect(asrFormat).toEqual({
        '1': {
          start_time: 75.5,
          end_time: 76.0,
          subtitle: '你现在跟我走'
        },
        '2': {
          start_time: 77.0,
          end_time: 77.5,
          subtitle: '他死了'
        },
        '3': {
          start_time: 77.5,
          end_time: 78.0,
          subtitle: '我负责'
        },
        '4': {
          start_time: 79.5,
          end_time: 80.0,
          subtitle: '走'
        }
      })
    })
  })
})
