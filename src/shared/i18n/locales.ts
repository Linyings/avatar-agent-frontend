export const locales = ['en', 'fr', 'de', 'zh-CN'] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'zh-CN'

export const localeLabels: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  'zh-CN': '中文',
}

export const localeSelectData = locales.map((locale) => ({
  label: localeLabels[locale],
  value: locale,
}))

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && locales.includes(value as Locale)
}
