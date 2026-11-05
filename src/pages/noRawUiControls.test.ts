import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const pagesRoot = path.resolve(process.cwd(), 'src/pages')
const currentTestFile = path.resolve(process.cwd(), 'src/pages/noRawUiControls.test.ts')

const migrationDebtAllowlist = new Set([
  path.resolve(process.cwd(), 'src/pages/admin/AnalyticsPage.tsx'),
  path.resolve(process.cwd(), 'src/pages/admin/SystemSettingsPage.tsx'),
])

const bannedPatterns = [
  /className=/g,
  /<button\b/g,
  /<input\b/g,
  /<select\b/g,
  /<textarea\b/g,
  /<details\b/g,
  /<summary\b/g,
] as const

function collectPageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry)
    const stats = statSync(fullPath)

    if (stats.isDirectory()) {
      return collectPageFiles(fullPath)
    }

    return fullPath.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(fullPath) ? [fullPath] : []
  })
}

describe('pages should avoid raw UI controls and display-only className usage', () => {
  it('keeps migrated pages on Mantine primitives', () => {
    const offenders = collectPageFiles(pagesRoot)
      .filter((file) => file !== currentTestFile)
      .filter((file) => !migrationDebtAllowlist.has(file))
      .map((file) => {
        const content = readFileSync(file, 'utf8')
        const matches = bannedPatterns
          .filter((pattern) => pattern.test(content))
          .map((pattern) => pattern.source)

        return matches.length > 0 ? `${path.relative(process.cwd(), file)} => ${matches.join(', ')}` : null
      })
      .filter((item): item is string => item !== null)

    expect(offenders).toEqual([])
  })
})
