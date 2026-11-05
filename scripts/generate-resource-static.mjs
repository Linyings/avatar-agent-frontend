import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const pagesPath = path.join(rootDir, 'src/pages/resources/resourcePages.json')
const articlesDir = path.join(rootDir, 'src/pages/resources/articles')
const indexPath = path.join(distDir, 'index.html')
const defaultSiteUrl = 'https://narratoai.cn'
const siteUrl = normalizeSiteUrl(process.env.VITE_SITE_URL || process.env.SITE_URL)
const resourceBasePath = '/resources'

const pages = JSON.parse(await readFile(pagesPath, 'utf8'))
const indexHtml = await readFile(indexPath, 'utf8')

await writeStaticPage({
  pathname: resourceBasePath,
  title: 'AI Video Commentary and Short Video Workflows | NarratoAI',
  description:
    'Explore NarratoAI workflows for AI video commentary, short video production, subtitles, captions, voiceover, movie recaps, podcast clips, and content repurposing.',
  body: renderCenterBody(pages),
  jsonLd: buildCenterJsonLd(),
})

for (const page of pages) {
  const articleMarkdown = await readArticleMarkdown(page.slug)

  await writeStaticPage({
    pathname: `${resourceBasePath}/${page.slug}`,
    title: page.title,
    description: page.metaDescription,
    body: articleMarkdown ? renderArticleBody(page, pages, articleMarkdown) : renderLandingBody(page, pages),
    jsonLd: articleMarkdown ? buildArticleJsonLd(page, articleMarkdown) : buildPageJsonLd(page),
    type: articleMarkdown ? 'article' : 'website',
  })
}

await writeFile(path.join(distDir, 'sitemap.xml'), renderSitemap(pages), 'utf8')
await writeFile(path.join(distDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`, 'utf8')
await writeFile(indexPath, injectSiteUrl(indexHtml), 'utf8')

function normalizeSiteUrl(value) {
  const configuredSiteUrl = value?.trim() || defaultSiteUrl

  try {
    const url = new URL(configuredSiteUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return defaultSiteUrl
    }

    url.pathname = ''
    url.search = ''
    url.hash = ''

    return url.toString().replace(/\/$/, '')
  } catch {
    return defaultSiteUrl
  }
}

function injectSiteUrl(html) {
  return html.replaceAll(defaultSiteUrl, siteUrl)
}

async function writeStaticPage({ body, description, jsonLd, pathname, title, type = 'website' }) {
  const canonical = `${siteUrl}${pathname}/`
  const html = injectSeo(indexHtml, {
    body,
    canonical,
    description,
    jsonLd,
    title,
    type,
  })
  const outputDir = path.join(distDir, pathname.replace(/^\//, ''))
  await mkdir(outputDir, { recursive: true })
  await writeFile(path.join(outputDir, 'index.html'), html, 'utf8')
}

function injectSeo(html, { body, canonical, description, jsonLd, title, type }) {
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    '<meta name="robots" content="index,follow,max-image-preview:large" />',
    `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:type" content="${type}" />`,
    '<meta property="og:locale" content="en_US" />',
    '<meta property="og:site_name" content="NarratoAI" />',
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:image" content="${siteUrl}/logos/logo-512x512.png" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${siteUrl}/logos/logo-512x512.png" />`,
    `<script type="application/ld+json">${escapeScript(JSON.stringify(jsonLd))}</script>`,
  ].join('\n    ')

  return html
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/\s*<meta name="description"[^>]*>/g, '')
    .replace(/\s*<meta name="keywords"[^>]*>/g, '')
    .replace(/\s*<meta name="robots"[^>]*>/g, '')
    .replace(/\s*<link rel="canonical"[^>]*>/g, '')
    .replace(/\s*<meta property="og:[^"]+"[^>]*>/g, '')
    .replace(/\s*<meta name="twitter:[^"]+"[^>]*>/g, '')
    .replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')
    .replace('</head>', `    ${tags}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`)
}

function renderCenterBody(allPages) {
  const groups = groupByCategory(allPages)

  return `
    <main class="seo-static">
      <header>
        <p>NarratoAI resources</p>
        <h1>AI Video Commentary and Short Video Workflows</h1>
        <p>Learn how to turn authorized source videos into commentary scripts, movie recaps, subtitles, captions, voiceover, short-form assets, and reviewed exports.</p>
        <p><a href="/register">Start creating with NarratoAI</a></p>
      </header>
      ${Object.entries(groups).map(([category, categoryPages]) => `
        <section>
          <h2>${escapeHtml(category)}</h2>
          <ul>
            ${categoryPages.map((page) => `
              <li>
                <a href="${resourceBasePath}/${page.slug}/">${escapeHtml(page.h1)}</a>
                <p>${escapeHtml(page.searchIntent)}</p>
              </li>
            `).join('')}
          </ul>
        </section>
      `).join('')}
    </main>
  `
}

function renderLandingBody(page, allPages) {
  const relatedPages = page.related
    .map((slug) => allPages.find((candidate) => candidate.slug === slug))
    .filter(Boolean)

  return `
    <main class="seo-static">
      <nav><a href="/resources/">Resources</a> / ${escapeHtml(page.primaryKeyword)}</nav>
      <header>
        <p>${escapeHtml(page.kicker)}</p>
        <h1>${escapeHtml(page.h1)}</h1>
        <p>${escapeHtml(page.hero)}</p>
        <p><a href="/register">Start creating with NarratoAI</a></p>
      </header>
      <section>
        <h2>The production pain</h2>
        <p>${escapeHtml(page.pain)}</p>
      </section>
      <section>
        <h2>How to use NarratoAI for ${escapeHtml(page.primaryKeyword)}</h2>
        <ol>
          ${page.workflow.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}
        </ol>
      </section>
      <section>
        <h2>Who this page is for</h2>
        <ul>${page.who.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </section>
      <section>
        <h2>Feature proof</h2>
        <ul>${page.features.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        <p>${escapeHtml(page.uniqueAngle)}</p>
      </section>
      <section>
        <h2>Manual editing vs generic AI tools vs NarratoAI</h2>
        <table>
          <thead><tr><th>Criteria</th><th>Manual workflow</th><th>Generic AI tool</th><th>NarratoAI</th></tr></thead>
          <tbody>
            <tr><td>Starting point</td><td>Blank timeline and manual notes</td><td>Single prompt or isolated upload</td><td>Authorized source video, transcript, or creator brief</td></tr>
            <tr><td>Production context</td><td>Editor watches and labels everything</td><td>Limited scene and subtitle memory</td><td>Subtitles, visual context, script, narration, and export stay connected</td></tr>
            <tr><td>Review control</td><td>Full control but slow iteration</td><td>Fast output with uneven review points</td><td>Human review before voiceover and export</td></tr>
          </tbody>
        </table>
      </section>
      <section>
        <h2>Questions before you start</h2>
        ${page.faq.map(([question, answer]) => `
          <h3>${escapeHtml(question)}</h3>
          <p>${escapeHtml(answer)}</p>
        `).join('')}
      </section>
      <section>
        <h2>Related NarratoAI pages</h2>
        <ul>${relatedPages.map((relatedPage) => `<li><a href="${resourceBasePath}/${relatedPage.slug}/">${escapeHtml(relatedPage.h1)}</a></li>`).join('')}</ul>
      </section>
    </main>
  `
}

function renderArticleBody(page, allPages, markdown) {
  const relatedPages = page.related
    .map((slug) => allPages.find((candidate) => candidate.slug === slug))
    .filter(Boolean)

  return `
    <main class="seo-static">
      <nav><a href="/resources/">Resources</a> / ${escapeHtml(page.primaryKeyword)}</nav>
      <header>
        <p>${escapeHtml(page.kicker)}</p>
        <h1>${escapeHtml(page.h1)}</h1>
        <p>${escapeHtml(page.hero)}</p>
        <p><a href="/register">Start creating with NarratoAI</a></p>
      </header>
      <article>
        ${renderMarkdownArticle(markdown)}
      </article>
      <section>
        <h2>Related NarratoAI pages</h2>
        <ul>${relatedPages.map((relatedPage) => `<li><a href="${resourceBasePath}/${relatedPage.slug}/">${escapeHtml(relatedPage.h1)}</a></li>`).join('')}</ul>
      </section>
    </main>
  `
}

async function readArticleMarkdown(slug) {
  try {
    return await readFile(path.join(articlesDir, `${slug}.md`), 'utf8')
  } catch {
    return ''
  }
}

function renderMarkdownArticle(markdown) {
  const lines = markdown
    .replace(/^---[\s\S]*?---\s*/, '')
    .trim()
    .split('\n')
  const html = []
  let index = 0
  let skippedFirstHeading = false

  while (index < lines.length) {
    const line = lines[index].trimEnd()

    if (!line.trim()) {
      index += 1
      continue
    }

    if (!skippedFirstHeading && line.startsWith('# ')) {
      skippedFirstHeading = true
      index += 1
      continue
    }

    if (line.trimStart().startsWith('<figure')) {
      const figureLines = [line]
      index += 1
      while (index < lines.length && !lines[index].includes('</figure>')) {
        figureLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) {
        figureLines.push(lines[index])
        index += 1
      }
      html.push(figureLines.join('\n'))
      continue
    }

    const headingMatch = /^(#{2,4})\s+(.+)$/.exec(line)
    if (headingMatch) {
      html.push(`<h${headingMatch[1].length}>${renderInlineMarkdown(headingMatch[2])}</h${headingMatch[1].length}>`)
      index += 1
      continue
    }

    if (isMarkdownTableStart(lines, index)) {
      const tableLines = [line]
      index += 1
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        tableLines.push(lines[index].trimEnd())
        index += 1
      }
      html.push(renderMarkdownTable(tableLines))
      continue
    }

    if (/^\d+\.\s+/.test(line.trim())) {
      const items = []
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ''))
        index += 1
      }
      html.push(`<ol>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ol>`)
      continue
    }

    if (/^-\s+/.test(line.trim())) {
      const items = []
      while (index < lines.length && /^-\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^-\s+/, ''))
        index += 1
      }
      html.push(`<ul>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ul>`)
      continue
    }

    if (line.trim().startsWith('> ')) {
      html.push(`<blockquote><p>${renderInlineMarkdown(line.trim().replace(/^>\s+/, ''))}</p></blockquote>`)
      index += 1
      continue
    }

    const paragraphLines = [line.trim()]
    index += 1
    while (index < lines.length && !startsMarkdownBlock(lines, index)) {
      paragraphLines.push(lines[index].trim())
      index += 1
    }
    html.push(`<p>${renderInlineMarkdown(paragraphLines.join(' ').trim())}</p>`)
  }

  return html.join('\n')
}

function startsMarkdownBlock(lines, index) {
  const line = lines[index]?.trim() ?? ''
  if (!line) return true

  return (
    line.startsWith('## ') ||
    line.startsWith('### ') ||
    line.startsWith('#### ') ||
    line.startsWith('<figure') ||
    line.startsWith('|') ||
    line.startsWith('> ') ||
    /^-\s+/.test(line) ||
    /^\d+\.\s+/.test(line)
  )
}

function isMarkdownTableStart(lines, index) {
  const current = lines[index]?.trim() ?? ''
  const next = lines[index + 1]?.trim() ?? ''

  return current.startsWith('|') && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(next)
}

function renderMarkdownTable(tableLines) {
  const rows = tableLines
    .filter((line, index) => index !== 1)
    .map((line) =>
      line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim()),
    )
  const [header = [], ...bodyRows] = rows

  return `
    <table>
      <thead><tr>${header.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join('')}</tr></thead>
      <tbody>${bodyRows.map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  `
}

function renderInlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
}

function renderSitemap(allPages) {
  const urls = [
    ['/', '1.0'],
    [`${resourceBasePath}/`, '0.9'],
    ...allPages.map((page) => [`${resourceBasePath}/${page.slug}/`, '0.8']),
    ['/privacy-policy', '0.3'],
    ['/terms-of-service', '0.3'],
  ]

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(([pathname, priority]) => `  <url><loc>${siteUrl}${pathname}</loc><priority>${priority}</priority></url>`)
    .join('\n')}\n</urlset>\n`
}

function groupByCategory(allPages) {
  return allPages.reduce((groups, page) => {
    groups[page.category] = groups[page.category] ?? []
    groups[page.category].push(page)
    return groups
  }, {})
}

function buildCenterJsonLd() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'AI Video Commentary and Short Video Workflows',
      description:
        'Explore NarratoAI workflows for AI video commentary, short video production, subtitles, captions, voiceover, movie recaps, podcast clips, and content repurposing.',
      url: `${siteUrl}${resourceBasePath}/`,
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: pages.map((page, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: page.h1,
          url: `${siteUrl}${resourceBasePath}/${page.slug}/`,
        })),
      },
      isPartOf: {
        '@type': 'WebSite',
        name: 'NarratoAI',
        url: `${siteUrl}/`,
      },
    },
    buildBreadcrumbJsonLd([
      ['Home', `${siteUrl}/`],
      ['Resources', `${siteUrl}${resourceBasePath}/`],
    ]),
  ]
}

function buildPageJsonLd(page) {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: page.h1,
      headline: page.h1,
      description: page.metaDescription,
      url: `${siteUrl}${resourceBasePath}/${page.slug}/`,
      about: page.primaryKeyword,
      keywords: [page.primaryKeyword, ...page.secondaryKeywords].join(', '),
      isPartOf: {
        '@type': 'WebSite',
        name: 'NarratoAI',
        url: `${siteUrl}/`,
      },
    },
    buildBreadcrumbJsonLd([
      ['Home', `${siteUrl}/`],
      ['Resources', `${siteUrl}${resourceBasePath}/`],
      [page.h1, `${siteUrl}${resourceBasePath}/${page.slug}/`],
    ]),
    buildFaqJsonLd(page),
  ]
}

function buildArticleJsonLd(page, markdown) {
  const checkedDate = readFrontmatterValue(markdown, 'last_checked')

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: page.h1,
      description: page.metaDescription,
      dateModified: checkedDate,
      datePublished: checkedDate,
      inLanguage: 'en-US',
      mainEntityOfPage: `${siteUrl}${resourceBasePath}/${page.slug}/`,
      url: `${siteUrl}${resourceBasePath}/${page.slug}/`,
      about: page.primaryKeyword,
      keywords: [page.primaryKeyword, ...page.secondaryKeywords].join(', '),
      author: {
        '@type': 'Organization',
        name: 'NarratoAI',
      },
      publisher: {
        '@type': 'Organization',
        name: 'NarratoAI',
        logo: {
          '@type': 'ImageObject',
          url: `${siteUrl}/logos/logo-512x512.png`,
        },
      },
      isPartOf: {
        '@type': 'WebSite',
        name: 'NarratoAI',
        url: `${siteUrl}/`,
      },
    },
    buildBreadcrumbJsonLd([
      ['Home', `${siteUrl}/`],
      ['Resources', `${siteUrl}${resourceBasePath}/`],
      [page.h1, `${siteUrl}${resourceBasePath}/${page.slug}/`],
    ]),
  ]
}

function buildFaqJsonLd(page) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faq.map(([question, answer]) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answer,
      },
    })),
  }
}

function buildBreadcrumbJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, item], index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name,
      item,
    })),
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function escapeScript(value) {
  return value.replaceAll('</script', '<\\/script')
}

function readFrontmatterValue(markdown, key) {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(markdown)?.[1] ?? ''
  return new RegExp(`^${key}:\\s*"([^"]+)"`, 'm').exec(frontmatter)?.[1]
}
