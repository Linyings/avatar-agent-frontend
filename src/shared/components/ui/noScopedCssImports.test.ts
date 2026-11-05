import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const srcRoot = path.resolve(process.cwd(), 'src')
const currentTestFile = path.resolve(
  process.cwd(),
  'src/shared/components/ui/noScopedCssImports.test.ts'
)
const mainEntryFile = path.resolve(process.cwd(), 'src/main.tsx')

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry)
    const stats = statSync(fullPath)

    if (stats.isDirectory()) {
      return collectSourceFiles(fullPath)
    }

    return /\.(ts|tsx)$/.test(fullPath) ? [fullPath] : []
  })
}

describe('source should centralize stylesheet imports at the application entry', () => {
  it('only allows css imports in src/main.tsx', () => {
    const offenders = collectSourceFiles(srcRoot)
      .filter((file) => file !== currentTestFile && file !== mainEntryFile)
      .map((file) => {
        const content = readFileSync(file, 'utf8')
        const matches = [...content.matchAll(/import\s+['"][^'"]+\.css['"]/g)].map((match) => match[0])

        return matches.length > 0
          ? `${path.relative(process.cwd(), file)} => ${matches.join(', ')}`
          : null
      })
      .filter((item): item is string => item !== null)

    expect(offenders).toEqual([])
  })
})
