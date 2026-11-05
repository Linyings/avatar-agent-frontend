import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const srcRoot = path.resolve(process.cwd(), 'src')
const currentTestFile = path.resolve(process.cwd(), 'src/shared/components/ui/noLegacyUiStyles.test.ts')

const bannedLegacyClasses = [
  'ui-card',
  'ui-card-muted',
  'ui-card-hover',
  'ui-button-primary',
  'ui-button-secondary',
  'ui-code-label',
  'ui-page-title',
  'ui-section-heading',
  'ui-subtitle',
  'page-shell',
  'page-container',
  'glass-card',
  'glass-effect',
  'shadow-glow',
  'shadow-glass',
]

const exactClassPatterns = bannedLegacyClasses.map(
  (className) => new RegExp(`(?<![A-Za-z0-9_-])${className}(?![A-Za-z0-9_-])`)
)

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

describe('source should not rely on legacy ui style helpers', () => {
  it('removes legacy utility class names and dead visual helpers', () => {
    const offenders = collectSourceFiles(srcRoot)
      .filter((file) => file !== currentTestFile)
      .map((file) => {
        const content = readFileSync(file, 'utf8')
        const matchedClasses = bannedLegacyClasses.filter((_className, index) =>
          exactClassPatterns[index].test(content)
        )

        return matchedClasses.length > 0
          ? `${path.relative(process.cwd(), file)} => ${matchedClasses.join(', ')}`
          : null
      })
      .filter((item): item is string => item !== null)

    expect(offenders).toEqual([])
  })

  it('removes the unused starter stylesheet', () => {
    expect(existsSync(path.resolve(process.cwd(), 'src/App.css'))).toBe(false)
  })
})
