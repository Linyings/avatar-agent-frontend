import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const scanRoots = [
  path.resolve(process.cwd(), 'src/features/projects/components/stages'),
  path.resolve(process.cwd(), 'src/shared/components/video'),
  path.resolve(process.cwd(), 'src/shared/components/tts'),
  path.resolve(process.cwd(), 'src/shared/components/ui'),
]

const currentTestFile = path.resolve(
  process.cwd(),
  'src/shared/components/ui/workflowMantineMigrationGuard.test.ts'
)

const bannedPatterns = [
  /workflow-/,
  /upload-/,
  /cfg-/,
  /<style>\{/,
  /<button\b/,
  /<select\b/,
  /<textarea\b/,
  /<table\b/,
  /className\s*=\s*["'`][^"'`]*(?:h-\d|w-\d|animate-|rounded-|text-zinc-|bg-\[)[^"'`]*["'`]/,
] as const

function isAllowedNativeInput(tag: string): boolean {
  return (
    /type\s*=\s*["']file["']/.test(tag) &&
    (/display\s*:\s*["']none["']/.test(tag) || /\bhidden\b/.test(tag))
  )
}

function collectOffenses(content: string): string[] {
  const patternOffenses = bannedPatterns
    .filter((pattern) => pattern.test(content))
    .map((pattern) => pattern.source)

  const inputOffenses = Array.from(content.matchAll(/<input\b[\s\S]*?>/g))
    .map((match) => match[0])
    .filter((tag) => !isAllowedNativeInput(tag))
    .map(() => '<input\\b')

  return [...patternOffenses, ...inputOffenses]
}

function collectFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry)
    const stats = statSync(fullPath)

    if (stats.isDirectory()) {
      return collectFiles(fullPath)
    }

    return /\.(css|ts|tsx)$/.test(fullPath) ? [fullPath] : []
  })
}

describe('workflow media and tts surfaces should stay on Mantine primitives', () => {
  it('prevents new workflow/upload/cfg classes and raw visible controls outside known migration debt', () => {
    const offenders = scanRoots
      .flatMap(collectFiles)
      .filter((file) => file !== currentTestFile)
      .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'))
      .map((file) => {
        const content = readFileSync(file, 'utf8')
        const matches = collectOffenses(content)

        return matches.length > 0
          ? `${path.relative(process.cwd(), file)} => ${matches.join(', ')}`
          : null
      })
      .filter((item): item is string => item !== null)

    expect(offenders).toEqual([])
  })
})
