import { describe, expect, it } from 'vitest'
import { normalizeSiteUrl } from './siteUrl'

describe('site URL configuration', () => {
  it('falls back to the current canonical domain when no value is configured', () => {
    expect(normalizeSiteUrl(undefined)).toBe('https://narratoai.cn')
    expect(normalizeSiteUrl('')).toBe('https://narratoai.cn')
  })

  it('accepts narratoai.co and removes trailing slashes or paths', () => {
    expect(normalizeSiteUrl('https://narratoai.co/')).toBe('https://narratoai.co')
    expect(normalizeSiteUrl('https://narratoai.co/app?x=1#hash')).toBe('https://narratoai.co')
  })

  it('falls back when the configured value is not a web origin', () => {
    expect(normalizeSiteUrl('mailto:support@narratoai.co')).toBe('https://narratoai.cn')
    expect(normalizeSiteUrl('not a url')).toBe('https://narratoai.cn')
  })
})
