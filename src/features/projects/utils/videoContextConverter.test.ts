import { describe, expect, it } from 'vitest'
import { convertSubtitlesToVideoContext, convertVideoContextToSubtitles } from './videoContextConverter'
import type { SubtitleExtractionResult } from '../types/material'

describe('videoContextConverter', () => {
  it('字幕和 video_context 互转时保留说话人标签', () => {
    const subtitles: SubtitleExtractionResult = {
      segments: [
        {
          id: 'seg-1',
          startTime: 1,
          endTime: 2,
          text: '你先走。',
          confidence: 0.96,
          speakerId: 'speaker_0',
        },
        {
          id: 'seg-2',
          startTime: 2,
          endTime: 3,
          text: '我马上来。',
          confidence: 0.95,
          speakerId: 2,
        },
      ],
      language: 'zh',
      totalDuration: 3,
      processingTime: 0,
      confidence: 0.95,
    }

    const videoContext = convertSubtitlesToVideoContext(subtitles)

    expect(videoContext.items['1']).toMatchObject({
      subtitle: '你先走。',
      speaker_id: 'speaker_0',
    })
    expect(videoContext.items['2']).toMatchObject({
      subtitle: '我马上来。',
      speaker_id: 2,
    })

    const restored = convertVideoContextToSubtitles(videoContext)

    expect(restored.segments[0]).toMatchObject({
      text: '你先走。',
      speakerId: 'speaker_0',
    })
    expect(restored.segments[1]).toMatchObject({
      text: '我马上来。',
      speakerId: 2,
    })
  })
})
