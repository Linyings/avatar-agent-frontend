import { afterEach, describe, expect, it, vi } from 'vitest'

import { normalizeScriptItemIds, smartConvertToFrontendBatch } from './scriptDataAdapter'
import { checkTimestampCalibration, performTimestampCalibration } from './calibrationUtils'
import type { ScriptItem, TimestampCalibrationItem, TTSAudioState } from '@/shared/types'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normalizeScriptItemIds', () => {
  it('兼容后端返回的 id 字段并生成唯一 _id', () => {
    const normalized = normalizeScriptItemIds([
      { id: '1', text: '第一句', start: 0, end: 1, org: '' } as unknown as ScriptItem,
      { id: '1', text: '第二句', start: 1, end: 2, org: '' } as unknown as ScriptItem,
      { text: '第三句', start: 2, end: 3, org: '' } as unknown as ScriptItem
    ])

    expect(normalized.map(item => item._id)).toEqual([1, 2, 3])
  })
})

describe('smartConvertToFrontendBatch', () => {
  it('能把后端返回的 id 字段正确转成前端 _id，并保留每行文案', () => {
    const items = smartConvertToFrontendBatch([
      { id: '1', text: '第一句解说', start: 0, end: 1.2, org: '' } as unknown as ScriptItem,
      { id: '2', text: '第二句解说', start: 1.2, end: 2.4, org: '' } as unknown as ScriptItem
    ])

    expect(items.map(item => item._id)).toEqual([1, 2])
    expect(items.map(item => item.text)).toEqual(['第一句解说', '第二句解说'])
    expect(items.map(item => item.narration)).toEqual(['第一句解说', '第二句解说'])
  })
})

describe('performTimestampCalibration', () => {
  it('即使脚本项 _id 异常重复，也不应在校准后把文本覆盖成同一条', () => {
    const scriptItems: ScriptItem[] = [
      {
        _id: 1,
        text: '第一句解说',
        start: 0,
        end: 1,
        org: '',
        timestamp: '00:00:00,000-00:00:01,000',
        OST: 0
      },
      {
        _id: 1,
        text: '第二句解说',
        start: 1,
        end: 2,
        org: '',
        timestamp: '00:00:01,000-00:00:02,000',
        OST: 0
      }
    ]

    const calibrationItems: TimestampCalibrationItem[] = [
      {
        _id: 1,
        timestamp: '00:00:00,000-00:00:01,000',
        originalDuration: 1,
        audioDuration: 1.5,
        difference: 0.5,
        needsCalibration: true
      }
    ]

    const calibrated = performTimestampCalibration(scriptItems, calibrationItems)

    expect(calibrated.map(item => item.text)).toEqual(['第一句解说', '第二句解说'])
    expect(calibrated[0].end).toBeGreaterThan(1)
  })
})

describe('checkTimestampCalibration', () => {
  it('音频缺少本地 duration 时，会读取 audioUrl 的真实时长并检测手动修改后的时间戳差异', async () => {
    class AudioMock extends EventTarget {
      duration = 2.1
      preload = ''
      src = ''

      load() {
        queueMicrotask(() => {
          this.dispatchEvent(new Event('loadedmetadata'))
        })
      }
    }

    vi.stubGlobal('Audio', AudioMock)

    const scriptItems: ScriptItem[] = [
      {
        _id: 1,
        text: '最后一句解说',
        start: 210.91,
        end: 218.31,
        org: '',
        OST: 0,
        audio_url: 'https://example.test/audio-1.mp3'
      }
    ]
    const ttsAudioStates: TTSAudioState = {
      1: {
        success: true,
        audioUrl: 'https://example.test/audio-1.mp3',
        isFromBackend: true
      }
    }

    const result = await checkTimestampCalibration(scriptItems, ttsAudioStates)

    expect(result.hasItemsToCalibrate).toBe(true)
    expect(result.items[0]).toMatchObject({
      _id: 1,
      originalDuration: 7.4,
      audioDuration: 2.1,
      needsCalibration: true
    })
    expect(result.items[0].difference).toBeCloseTo(5.3)
  })
})
