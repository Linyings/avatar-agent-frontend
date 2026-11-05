import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const srcRoot = path.resolve(process.cwd(), 'src')
const currentTestFile = path.resolve(process.cwd(), 'src/shared/components/ui/noLegacyUiWrappers.test.ts')

const bannedImports = [
  '@/shared/components/ui/Button',
  '@/shared/components/ui/input',
  '@/shared/components/ui/textarea',
  '@/shared/components/ui/label',
  '@/shared/components/ui/switch',
  '@/shared/components/ui/dialog',
  '@/shared/components/ui/alert-dialog',
  '@/shared/components/ui/Modal',
]

const deletedWrapperFiles = [
  'src/shared/components/ui/Button.tsx',
  'src/shared/components/ui/input.tsx',
  'src/shared/components/ui/textarea.tsx',
  'src/shared/components/ui/label.tsx',
  'src/shared/components/ui/switch.tsx',
  'src/shared/components/ui/dialog.tsx',
  'src/shared/components/ui/alert-dialog.tsx',
  'src/shared/components/ui/Modal.tsx',
]

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

describe('source should not import legacy ui wrapper components', () => {
  it('removes direct imports from deprecated wrapper files', () => {
    const offenders = collectSourceFiles(srcRoot)
      .filter((file) => file !== currentTestFile)
      .map((file) => {
        const content = readFileSync(file, 'utf8')
        const matchedImports = bannedImports.filter((specifier) => content.includes(specifier))

        return matchedImports.length > 0
          ? `${path.relative(process.cwd(), file)} => ${matchedImports.join(', ')}`
          : null
      })
      .filter((item): item is string => item !== null)

    expect(offenders).toEqual([])
  })

  it('deletes the legacy wrapper source files themselves', () => {
    const remainingFiles = deletedWrapperFiles.filter((file) =>
      existsSync(path.resolve(process.cwd(), file))
    )

    expect(remainingFiles).toEqual([])
  })
})
