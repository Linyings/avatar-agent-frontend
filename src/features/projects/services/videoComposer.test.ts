import { describe, expect, it } from 'vitest'

import { resolveSilentAudioFrameCount, validateCompositionSegments, VideoComposer } from './videoComposer'
import type { VideoSegment } from '@/shared/types'

describe('validateCompositionSegments', () => {
  it('允许片段时间戳乱序，只要每个片段自身时间范围合法', () => {
    const segments: VideoSegment[] = [
      {
        id: 1,
        startTime: 84.84,
        endTime: 87.7,
        hasNarration: false
      },
      {
        id: 2,
        startTime: 25.04,
        endTime: 26.24,
        hasNarration: false
      }
    ]

    expect(() => validateCompositionSegments(segments)).not.toThrow()
  })

  it('允许源视频裁剪时间段彼此重叠，因为最终按脚本顺序拼接', () => {
    const segments: VideoSegment[] = [
      {
        id: 1,
        startTime: 10,
        endTime: 18,
        hasNarration: false
      },
      {
        id: 2,
        startTime: 15,
        endTime: 22,
        hasNarration: false
      }
    ]

    expect(() => validateCompositionSegments(segments)).not.toThrow()
  })

  it('拒绝单个片段自身结束时间早于开始时间', () => {
    const segments: VideoSegment[] = [
      {
        id: 3,
        startTime: 12.5,
        endTime: 12.4,
        hasNarration: false
      }
    ]

    expect(() => validateCompositionSegments(segments)).toThrow(
      '片段 3 的时间范围无效，请检查开始时间和结束时间'
    )
  })

  it('拒绝缺少 TTS 音频的解说片段', () => {
    const segments: VideoSegment[] = [
      {
        id: 4,
        startTime: 1,
        endTime: 3,
        hasNarration: true,
        narrationText: '测试文案'
      }
    ]

    expect(() => validateCompositionSegments(segments)).toThrow(
      '片段 4 需要 TTS 音频但未生成，请先生成所有解说音频'
    )
  })

  it('不会把刷新后被剥离的 object URL 当作可用配音音频', () => {
    const composer = new VideoComposer()
    const segments = composer.prepareSegments([
      {
        _id: 5,
        text: '测试解说',
        start: 0,
        end: 2,
        org: '',
        OST: 0,
      },
    ], {
      5: {
        success: true,
        audioUrl: '[object-url-stripped]',
      },
    })

    expect(segments[0]).toMatchObject({
      hasNarration: true,
      ttsAudioUrl: undefined,
      ttsAudioBlob: undefined,
    })
    expect(() => validateCompositionSegments(segments)).toThrow('片段 5 需要 TTS 音频')
  })

  it('极短静音片段也至少生成 1 帧音频', () => {
    expect(resolveSilentAudioFrameCount(0.000001, 48000)).toBe(1)
    expect(resolveSilentAudioFrameCount(0, 48000)).toBe(1)
    expect(resolveSilentAudioFrameCount(Number.NaN, 48000)).toBe(1)
  })
})
