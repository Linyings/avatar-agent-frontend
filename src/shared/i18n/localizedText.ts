import type { Locale } from './locales'

export type LocalizedTextMap = Partial<Record<Locale | string, string>>

export function normalizeLocalizedTextMap(value: unknown): LocalizedTextMap | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, text]) => [key, typeof text === 'string' ? text.trim() : ''] as const)
    .filter(([, text]) => text.length > 0)

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

export function resolveLocalizedText(
  fallback: string,
  localizedText: LocalizedTextMap | undefined,
  locale: Locale
) {
  if (!localizedText) return fallback

  if (locale === 'zh-CN') {
    return localizedText['zh-CN'] ?? localizedText.zh ?? fallback
  }

  return localizedText[locale] ?? localizedText.en ?? fallback
}
