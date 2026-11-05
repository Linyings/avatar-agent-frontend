import { describe, expect, it } from 'vitest'
import {
  getRelatedPages,
  getResourceCanonical,
  resourcePages,
  resourcePagesBySlug,
} from './resourceData'

describe('SEO resource matrix data', () => {
  it('defines the planned 20 landing pages with unique slugs and metadata', () => {
    expect(resourcePages).toHaveLength(25)

    const slugs = new Set(resourcePages.map((page) => page.slug))
    const titles = new Set(resourcePages.map((page) => page.title))
    const descriptions = new Set(resourcePages.map((page) => page.metaDescription))

    expect(slugs.size).toBe(resourcePages.length)
    expect(titles.size).toBe(resourcePages.length)
    expect(descriptions.size).toBe(resourcePages.length)

    for (const page of resourcePages) {
      expect(page.title).toContain('数字人口播')
      expect(page.metaDescription.length).toBeGreaterThan(90)
      expect(page.h1.toLowerCase()).toContain(page.primaryKeyword.split(' ')[0].toLowerCase())
      expect(page.workflow).toHaveLength(5)
      expect(page.who.length).toBeGreaterThanOrEqual(4)
      expect(page.features.length).toBeGreaterThanOrEqual(4)
      expect(page.faq.length).toBeGreaterThanOrEqual(4)
      expect(getResourceCanonical(page.slug)).toBe(`https://narratoai.cn/resources/${page.slug}/`)
    }
  })

  it('keeps every landing page connected through at least five valid internal links', () => {
    for (const page of resourcePages) {
      expect(page.related).toHaveLength(5)
      expect(getRelatedPages(page)).toHaveLength(5)

      for (const relatedSlug of page.related) {
        expect(resourcePagesBySlug.has(relatedSlug)).toBe(true)
        expect(relatedSlug).not.toBe(page.slug)
      }
    }
  })
})
