import resourcePagesJson from './resourcePages.json'
import { SITE_URL } from '@/shared/seo/siteUrl'

export { SITE_URL }
export const RESOURCE_BASE_PATH = '/resources'

export interface ResourcePage {
  slug: string
  category: 'Core workflows' | 'Creator scenarios' | 'Platform workflows' | 'Production use cases'
  primaryKeyword: string
  secondaryKeywords: string[]
  searchIntent: string
  title: string
  metaDescription: string
  h1: string
  kicker: string
  hero: string
  pain: string
  workflow: string[]
  who: string[]
  features: string[]
  uniqueAngle: string
  faq: Array<[string, string]>
  related: string[]
}

export const resourcePages = resourcePagesJson as ResourcePage[]

export const resourcePagesBySlug = new Map(resourcePages.map((page) => [page.slug, page]))

export function getResourcePath(slug: string) {
  return `${RESOURCE_BASE_PATH}/${slug}`
}

export function getResourceCanonical(slug?: string) {
  return `${SITE_URL}${slug ? getResourcePath(slug) : RESOURCE_BASE_PATH}/`
}

export function getRelatedPages(page: ResourcePage) {
  return page.related
    .map((slug) => resourcePagesBySlug.get(slug))
    .filter((relatedPage): relatedPage is ResourcePage => Boolean(relatedPage))
}

export const resourceCategories = [
  'Core workflows',
  'Creator scenarios',
  'Platform workflows',
  'Production use cases',
] as const

export function getPagesByCategory(category: ResourcePage['category']) {
  return resourcePages.filter((page) => page.category === category)
}
