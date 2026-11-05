import { describe, expect, it } from 'vitest'
import { removeSubtitlePunctuation } from './subtitleProcessor'

describe('removeSubtitlePunctuation', () => {
  it('移除中英文标点但保留字幕文字', () => {
    expect(removeSubtitlePunctuation('给我妈做主了？ ”')).toBe('给我妈做主了')
    expect(removeSubtitlePunctuation('Hello, world!')).toBe('Hello world')
  })
})
