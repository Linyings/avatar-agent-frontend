import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const srcRoot = path.resolve(process.cwd(), 'src')
const currentTestFile = path.resolve(
  process.cwd(),
  'src/shared/components/ui/noUtilityClassDependencies.test.ts'
)

const bannedContentPatterns = [
  /var\(--border-default\)/g,
  /class(Name)?\s*=\s*(?:\{)?[`'"][^`'"]*(?:text-zinc-|text-gray-|bg-\[#|bg-\[rgba|rounded-(?:lg|xl|2xl|full)|space-y-|space-x-|grid-cols-|max-w-\[|mx-auto|hover:|focus:|sm:|md:|lg:|animate-spin|animate-pulse|aspect-video|tabular-nums|break-all|group-open|list-decimal|marker:text)[^`'"]*[`'"]/g,
]

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry)
    const stats = statSync(fullPath)

    if (stats.isDirectory()) {
      return collectSourceFiles(fullPath)
    }

    return /\.(css|ts|tsx)$/.test(fullPath) ? [fullPath] : []
  })
}

describe('source should not rely on legacy utility-class styling', () => {
  it('removes Tailwind-like utility tokens and deprecated border variables from source files', () => {
    const offenders = collectSourceFiles(srcRoot)
      .filter((file) => file !== currentTestFile)
      .map((file) => {
        const content = readFileSync(file, 'utf8')
        const matches = bannedContentPatterns
          .filter((pattern) => pattern.test(content))
          .map((pattern) => pattern.source)

        return matches.length > 0
          ? `${path.relative(process.cwd(), file)} => ${matches.join(', ')}`
          : null
      })
      .filter((item): item is string => item !== null)

    expect(offenders).toEqual([])
  })
})
