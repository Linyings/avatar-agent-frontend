import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const pagesRoot = path.resolve(process.cwd(), 'src/pages')

function collectPageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry)
    const stats = statSync(fullPath)

    if (stats.isDirectory()) {
      return collectPageFiles(fullPath)
    }

    return fullPath.endsWith('.tsx') ? [fullPath] : []
  })
}

describe('pages should not use legacy ui-* semantic classes', () => {
  it('removes ui-* class usage from page layer', () => {
    const offenders = collectPageFiles(pagesRoot)
      .map((file) => {
        const content = readFileSync(file, 'utf8')
        const matches = [...content.matchAll(/\bui-[A-Za-z0-9_-]+\b/g)].map((match) => match[0])

        return matches.length > 0
          ? `${path.relative(process.cwd(), file)} => ${Array.from(new Set(matches)).join(', ')}`
          : null
      })
      .filter((item): item is string => item !== null)

    expect(offenders).toEqual([])
  })
})
