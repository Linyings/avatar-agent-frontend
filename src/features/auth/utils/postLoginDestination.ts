export const normalizePostLoginDestination = (value: unknown): string => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

export const getPostLoginDestination = (locationState: unknown): string => {
  const from = (locationState as {
    from?: { pathname?: unknown; search?: unknown }
  } | null)?.from
  const pathname = normalizePostLoginDestination(from?.pathname)
  const search = typeof from?.search === 'string' ? from.search : ''

  if (pathname === '/' && from?.pathname !== '/') return '/'
  return `${pathname}${search.startsWith('?') ? search : ''}`
}
