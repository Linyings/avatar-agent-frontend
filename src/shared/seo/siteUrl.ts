const DEFAULT_SITE_URL = 'https://narratoai.cn'

export function normalizeSiteUrl(value: string | undefined) {
  const siteUrl = value?.trim() || DEFAULT_SITE_URL

  try {
    const url = new URL(siteUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return DEFAULT_SITE_URL
    }

    url.pathname = ''
    url.search = ''
    url.hash = ''

    return url.toString().replace(/\/$/, '')
  } catch {
    return DEFAULT_SITE_URL
  }
}

export const SITE_URL = normalizeSiteUrl(import.meta.env.VITE_SITE_URL)

export function getSiteUrl(pathname = '/') {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${SITE_URL}${normalizedPath}`
}
