export const getApiBaseUrl = (): string => {
  return import.meta.env.VITE_API_BASE_URL || ''
}

export function buildApiUrl(
  baseUrl: string,
  endpoint: string,
  params?: Record<string, any>
): string {
  const normalizedBase = baseUrl.trim().replace(/\/+$/, '')
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const rawUrl = `${normalizedBase}${normalizedEndpoint}`

  if (!params) {
    return rawUrl
  }

  const [path, existingQuery = ''] = rawUrl.split('?')
  const searchParams = new URLSearchParams(existingQuery)

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value))
    }
  })

  const query = searchParams.toString()
  return query ? `${path}?${query}` : path
}
