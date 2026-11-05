import { useEffect } from 'react'
import { PRODUCT_NAME } from '@/shared/brand/identity'
import { getSiteUrl } from './siteUrl'

interface SeoProps {
  canonical: string
  description: string
  image?: string
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>
  title: string
  type?: 'website' | 'article'
}

const defaultImage = getSiteUrl('/logos/logo-512x512.png')

export default function Seo({
  canonical,
  description,
  image = defaultImage,
  jsonLd,
  title,
  type = 'website',
}: SeoProps) {
  useEffect(() => {
    document.title = title
    upsertMeta('name', 'description', description)
    upsertMeta('name', 'robots', 'index,follow,max-image-preview:large')
    upsertLink('canonical', canonical)
    upsertMeta('property', 'og:type', type)
    upsertMeta('property', 'og:locale', 'en_US')
    upsertMeta('property', 'og:site_name', PRODUCT_NAME)
    upsertMeta('property', 'og:title', title)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', canonical)
    upsertMeta('property', 'og:image', image)
    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', title)
    upsertMeta('name', 'twitter:description', description)
    upsertMeta('name', 'twitter:image', image)
  }, [canonical, description, image, title, type])

  if (!jsonLd) return null

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}

function upsertMeta(attributeName: 'name' | 'property', attributeValue: string, content: string) {
  const selector = `meta[${attributeName}="${attributeValue}"]`
  let element = document.head.querySelector<HTMLMetaElement>(selector)

  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attributeName, attributeValue)
    document.head.appendChild(element)
  }

  element.content = content
}

function upsertLink(rel: string, href: string) {
  const selector = `link[rel="${rel}"]`
  let element = document.head.querySelector<HTMLLinkElement>(selector)

  if (!element) {
    element = document.createElement('link')
    element.rel = rel
    document.head.appendChild(element)
  }

  element.href = href
}
