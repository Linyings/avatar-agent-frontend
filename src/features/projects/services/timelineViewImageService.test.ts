import { describe, expect, it } from 'vitest'
import { isTimelineViewImageDecodeError } from './timelineViewImageService'

describe('timelineViewImageService', () => {
  it('recognizes browser media decode failures without treating cancellation as decode failure', () => {
    expect(isTimelineViewImageDecodeError(new Error('Decoding error'))).toBe(true)
    expect(isTimelineViewImageDecodeError(new Error('Video cannot be decoded in this browser'))).toBe(true)
    expect(isTimelineViewImageDecodeError(new Error('当前浏览器无法解码该视频'))).toBe(true)

    const abortError = new DOMException('时间线图生成已取消', 'AbortError')
    expect(isTimelineViewImageDecodeError(abortError)).toBe(false)
  })
})
