import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_MUSIC_OPTIONS,
  BACKGROUND_MUSIC_SELECT_OPTIONS,
  NO_BACKGROUND_MUSIC_LABEL,
  NO_BACKGROUND_MUSIC_VALUE,
  findBackgroundMusicByLabel,
  resolveBackgroundMusicSelectValue,
} from './backgroundMusic.constants'

describe('backgroundMusic.constants', () => {
  it('生成 R2 背景音乐地址', () => {
    expect(BACKGROUND_MUSIC_OPTIONS).toHaveLength(29)
    expect(BACKGROUND_MUSIC_OPTIONS[0]).toEqual({
      id: 1,
      label: '悲惨且阴暗',
      fileName: '01-悲惨且阴暗.mp3',
      url: 'https://store.narratoai.cn/bgms/01-%E6%82%B2%E6%83%A8%E4%B8%94%E9%98%B4%E6%9A%97.mp3',
    })
  })

  it('为选择框保留空背景音乐选项', () => {
    expect(BACKGROUND_MUSIC_SELECT_OPTIONS[0]).toEqual({
      value: NO_BACKGROUND_MUSIC_VALUE,
      label: NO_BACKGROUND_MUSIC_LABEL,
    })
    expect(BACKGROUND_MUSIC_SELECT_OPTIONS).toHaveLength(30)
  })

  it('按中文名称查询背景音乐', () => {
    expect(findBackgroundMusicByLabel('追逐感紧张刺激节奏')).toMatchObject({
      id: 29,
      fileName: '29-追逐感紧张刺激节奏.mp3',
    })
    expect(findBackgroundMusicByLabel('选择背景音乐')).toBeNull()
    expect(findBackgroundMusicByLabel(NO_BACKGROUND_MUSIC_VALUE)).toBeNull()
  })

  it('兼容旧的背景音乐占位文案并解析成稳定选择值', () => {
    expect(resolveBackgroundMusicSelectValue('选择背景音乐')).toBe(NO_BACKGROUND_MUSIC_VALUE)
    expect(resolveBackgroundMusicSelectValue(NO_BACKGROUND_MUSIC_VALUE)).toBe(NO_BACKGROUND_MUSIC_VALUE)
    expect(resolveBackgroundMusicSelectValue('追逐感紧张刺激节奏')).toBe('追逐感紧张刺激节奏')
    expect(resolveBackgroundMusicSelectValue('不存在的音乐')).toBe(NO_BACKGROUND_MUSIC_VALUE)
  })
})
