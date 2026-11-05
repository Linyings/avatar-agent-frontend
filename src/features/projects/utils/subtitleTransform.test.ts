import { describe, it, expect } from 'vitest'

import type { SubtitleExtractionResult } from '../types/material'
import {
  buildSubtitleExtractionResult,
  buildSubtitlePayload,
  buildSubtitleExtractionResultFromPayload
} from './subtitleTransform'

describe('buildSubtitleExtractionResult', () => {
  it('应该从JSON字幕内容生成结构化结果', () => {
    const taskResponse = {
      success: true,
      status: 'completed',
      task_id: 'task-123',
      content: {
        '0': {
          start_time: 0,
          end_time: 2.5,
          original_subtitle: '欢迎来到NarratoAI',
          confidence: 0.92,
        },
        '1': {
          start_time: 2.5,
          end_time: 5.1,
          original_subtitle: '字幕识别功能已准备就绪',
          confidence: 0.88,
        },
      },
      processing_time: 12.4,
    }

    const result = buildSubtitleExtractionResult(taskResponse, {
      language: 'zh-CN',
      fallbackText: 'subtitle',
    }) as SubtitleExtractionResult

    expect(result.segments).toHaveLength(2)
    expect(result.segments[0]).toMatchObject({
      id: '0',
      startTime: 0,
      endTime: 2.5,
      text: '欢迎来到NarratoAI',
      confidence: 0.92,
    })
    expect(result.segments[1]).toMatchObject({
      id: '1',
      startTime: 2.5,
      endTime: 5.1,
      text: '字幕识别功能已准备就绪',
      confidence: 0.88,
    })
    expect(result.language).toBe('zh-CN')
    expect(result.totalDuration).toBeCloseTo(5.1)
    expect(result.processingTime).toBe(12.4)
    expect(result.confidence).toBeCloseTo(0.9, 2)
  })

  it('应该支持SRT字符串内容作为回退', () => {
    const taskResponse = {
      success: true,
      status: 'completed',
      task_id: 'task-456',
      content: `1\n00:00:00,000 --> 00:00:03,000\n第一行字幕\n\n2\n00:00:03,000 --> 00:00:05,500\n第二行字幕`,
      processing_time: 8.6,
    }

    const result = buildSubtitleExtractionResult(taskResponse, {
      language: 'zh-CN',
      fallbackText: 'original_subtitle',
    }) as SubtitleExtractionResult

    expect(result.segments).toHaveLength(2)
    expect(result.segments[0].text).toBe('第一行字幕')
    expect(result.segments[0].startTime).toBeCloseTo(0)
    expect(result.segments[0].endTime).toBeCloseTo(3)
    expect(result.segments[1].text).toBe('第二行字幕')
    expect(result.totalDuration).toBeCloseTo(5.5)
    expect(result.processingTime).toBe(8.6)
  })

  it('应该在缺失置信度时给出默认值', () => {
    const taskResponse = {
      success: true,
      status: 'completed',
      task_id: 'task-789',
      content: {
        '0': {
          start_time: 1.2,
          end_time: 4.2,
          original_subtitle: '只返回了文本内容',
        },
      },
    }

    const result = buildSubtitleExtractionResult(taskResponse, {
      language: 'zh-CN',
      fallbackText: 'original_subtitle',
    }) as SubtitleExtractionResult

    expect(result.segments[0].confidence).toBeCloseTo(0.8, 1)
    expect(result.confidence).toBeCloseTo(0.8, 1)
    expect(result.totalDuration).toBeCloseTo(4.2)
  })

  it('应该构建项目接口要求的字幕Payload', () => {
    const segments = [
      {
        id: 'seg-1',
        startTime: 1.234,
        endTime: 3.456,
        text: '第一句',
        speakerId: 2
      },
      {
        id: 'seg-2',
        startTime: 4.5,
        endTime: 6.7,
        text: '第二句'
      }
    ]

    const payload = buildSubtitlePayload(segments)

    expect(Object.keys(payload)).toEqual(['1', '2'])
    expect(payload['1']).toEqual({
      start_time: 1.234,  // 统一使用秒
      end_time: 3.456,
      subtitle: '第一句',
      speaker_id: 2
    })
    expect(payload['2']).toEqual({
      start_time: 4.5,    // 统一使用秒
      end_time: 6.7,
      subtitle: '第二句'
    })
  })

  it('应该在字幕Payload中保留字符串说话人标签', () => {
    const payload = buildSubtitlePayload([
      {
        id: 'seg-1',
        startTime: 0,
        endTime: 1,
        text: '字符串说话人标签',
        speakerId: 'speaker_0'
      }
    ])

    expect(payload['1']).toMatchObject({
      subtitle: '字符串说话人标签',
      speaker_id: 'speaker_0'
    })
  })

  it('应该从项目字幕字段恢复结构化结果', () => {
    const payload = {
      '10': {
        start_time: 1.5,   // 统一使用秒
        end_time: 2.8,
        subtitle: '恢复后的第一句',
        speaker_id: 7
      },
      '2': {
        start_time: 3,     // 统一使用秒
        end_time: 6,
        subtitle: '第二句'
      }
    }

    const result = buildSubtitleExtractionResultFromPayload(payload, { language: 'zh-CN' })

    expect(result?.segments).toHaveLength(2)
    expect(result?.segments[0]).toMatchObject({
      id: '10',
      startTime: 1.5,
      endTime: 2.8,
      text: '恢复后的第一句',
      speakerId: 7
    })
    expect(result?.segments[1]).toMatchObject({
      id: '2',
      startTime: 3,
      endTime: 6,
      text: '第二句'
    })
    expect(result?.totalDuration).toBeCloseTo(6)
    expect(result?.language).toBe('zh-CN')
  })

  it('应该在托管 ASR 结果中保留说话人编号', () => {
    const taskResponse = {
      success: true,
      status: 'completed',
      task_id: 'task-speaker',
      content: {
        '1': {
          start_time: 0.3,
          end_time: 1.8,
          subtitle: '你好，今天我们来看字幕。',
          speaker_id: 'speaker_1'
        }
      }
    }

    const result = buildSubtitleExtractionResult(taskResponse, {
      language: 'zh-CN',
      fallbackText: 'subtitle'
    }) as SubtitleExtractionResult

    expect(result.segments).toHaveLength(1)
    expect(result.segments[0]).toMatchObject({
      text: '你好，今天我们来看字幕。',
      speakerId: 'speaker_1'
    })
  })
})
