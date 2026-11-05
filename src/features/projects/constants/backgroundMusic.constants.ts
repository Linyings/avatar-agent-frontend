import type { Locale } from '@/shared/i18n/locales'
import { resolveLocalizedText, type LocalizedTextMap } from '@/shared/i18n/localizedText'

export const NO_BACKGROUND_MUSIC_VALUE = 'none'
export const NO_BACKGROUND_MUSIC_LABEL = '无背景音乐'
const LEGACY_NO_BACKGROUND_MUSIC_LABEL = '选择背景音乐'
export const BACKGROUND_MUSIC_SETTING_KEY = 'bgms'

const BACKGROUND_MUSIC_BASE_URL = 'https://store.narratoai.cn/bgms'

export interface BackgroundMusicOption {
  id: number
  label: string
  label_i18n?: LocalizedTextMap
  fileName: string
  url: string
}

const backgroundMusicNames = [
  '悲惨且阴暗',
  '悲怆',
  '悲剧快节奏钢琴',
  '悲伤开头逐渐变好',
  '不安且充满冲突',
  '从悲怆到激动',
  '动作片冲突',
  '犯罪片紧张',
  '感情淡淡的悲伤',
  '搞笑激动',
  '故事片感动慢节奏',
  '宏大场面且激动',
  '激动快节奏',
  '激动人心',
  '紧张阴暗缓慢',
  '惊悚恐怖吓人',
  '恐怖心跳',
  '美好爱情欢快',
  '屏住呼吸恐怖惊吓',
  '情感故事快节奏',
  '情感家国逐渐变好',
  '情感浪漫',
  '热血摇滚',
  '逝去的青春娓娓道来',
  '凶案悬疑',
  '悬疑刺激节奏快',
  '阴诡恐怖氛围',
  '逐渐展开故事',
  '追逐感紧张刺激节奏',
]

export const buildBackgroundMusicUrl = (fileName: string) => (
  `${BACKGROUND_MUSIC_BASE_URL}/${encodeURIComponent(fileName)}`
)

export const BACKGROUND_MUSIC_OPTIONS: BackgroundMusicOption[] = backgroundMusicNames.map((label, index) => {
  const id = index + 1
  const fileName = `${String(id).padStart(2, '0')}-${label}.mp3`

  return {
    id,
    label,
    fileName,
    url: buildBackgroundMusicUrl(fileName),
  }
})

export const buildBackgroundMusicSelectOptions = (
  options: BackgroundMusicOption[] = BACKGROUND_MUSIC_OPTIONS,
  locale?: Locale
) => [
  {
    value: NO_BACKGROUND_MUSIC_VALUE,
    label: locale ? resolveLocalizedText(NO_BACKGROUND_MUSIC_LABEL, undefined, locale) : NO_BACKGROUND_MUSIC_LABEL,
  },
  ...options.map(option => ({
    value: option.label,
    label: locale ? resolveLocalizedText(option.label, option.label_i18n, locale) : option.label,
  })),
]

export const BACKGROUND_MUSIC_SELECT_OPTIONS = buildBackgroundMusicSelectOptions()

export const findBackgroundMusicByLabel = (
  label?: string | null,
  options: BackgroundMusicOption[] = BACKGROUND_MUSIC_OPTIONS
) => {
  if (
    !label
    || label === NO_BACKGROUND_MUSIC_LABEL
    || label === LEGACY_NO_BACKGROUND_MUSIC_LABEL
    || label === NO_BACKGROUND_MUSIC_VALUE
  ) return null
  return options.find(option => option.label === label) ?? null
}

export const resolveBackgroundMusicSelectValue = (
  value?: string | null,
  options: BackgroundMusicOption[] = BACKGROUND_MUSIC_OPTIONS
) => {
  if (
    !value
    || value === NO_BACKGROUND_MUSIC_LABEL
    || value === LEGACY_NO_BACKGROUND_MUSIC_LABEL
    || value === NO_BACKGROUND_MUSIC_VALUE
  ) {
    return NO_BACKGROUND_MUSIC_VALUE
  }

  return findBackgroundMusicByLabel(value, options) ? value : NO_BACKGROUND_MUSIC_VALUE
}
