import systemService from '@/shared/services/systemService'
import {
  BACKGROUND_MUSIC_SETTING_KEY,
  buildBackgroundMusicUrl,
  type BackgroundMusicOption,
} from '../constants/backgroundMusic.constants'
import { normalizeLocalizedTextMap } from '@/shared/i18n/localizedText'

type PublicBackgroundMusicSetting = {
  bgms?: unknown
  items?: unknown
  tracks?: unknown
}

const getConfiguredItems = (setting: PublicBackgroundMusicSetting | BackgroundMusicOption[] | unknown) => {
  if (Array.isArray(setting)) return setting
  if (!setting || typeof setting !== 'object') return []

  const record = setting as PublicBackgroundMusicSetting
  if (Array.isArray(record.bgms)) return record.bgms
  if (Array.isArray(record.items)) return record.items
  if (Array.isArray(record.tracks)) return record.tracks

  return []
}

const fileNameFromUrl = (url: string) => {
  try {
    const pathname = new URL(url).pathname
    const name = pathname.split('/').filter(Boolean).pop()
    return name ? decodeURIComponent(name) : ''
  } catch {
    const name = url.split('/').filter(Boolean).pop()
    return name ? decodeURIComponent(name) : ''
  }
}

export const normalizeBackgroundMusicOption = (
  item: unknown,
  index: number
): BackgroundMusicOption | null => {
  if (!item || typeof item !== 'object') return null

  const record = item as Record<string, unknown>
  const label = typeof record.label === 'string'
    ? record.label.trim()
    : typeof record.name === 'string'
      ? record.name.trim()
      : ''
  const fileName = typeof record.fileName === 'string'
    ? record.fileName.trim()
    : typeof record.file_name === 'string'
      ? record.file_name.trim()
      : ''
  const configuredUrl = typeof record.url === 'string' ? record.url.trim() : ''
  const url = configuredUrl || (fileName ? buildBackgroundMusicUrl(fileName) : '')

  if (!label || !url) return null
  const label_i18n = normalizeLocalizedTextMap(record.label_i18n)

  const id = typeof record.id === 'number' && Number.isFinite(record.id)
    ? record.id
    : index + 1

  return {
    id,
    label,
    ...(label_i18n ? { label_i18n } : {}),
    fileName: fileName || fileNameFromUrl(url),
    url,
  }
}

export async function fetchBackgroundMusicOptions(): Promise<BackgroundMusicOption[]> {
  const setting = await systemService.getPublicSystemSettingByKey<PublicBackgroundMusicSetting | BackgroundMusicOption[]>(
    BACKGROUND_MUSIC_SETTING_KEY
  )

  return getConfiguredItems(setting.value)
    .map(normalizeBackgroundMusicOption)
    .filter((option): option is BackgroundMusicOption => Boolean(option))
}
