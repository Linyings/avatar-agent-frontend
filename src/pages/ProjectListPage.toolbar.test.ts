import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('ProjectListPage toolbar styling', () => {
  it('uses shared app tokens instead of one-off white pill controls', () => {
    const content = readFileSync(
      resolve(process.cwd(), 'src/features/projects/components/ProjectListView.tsx'),
      'utf8',
    )

    expect(content).toContain('toolbarControlStyle')
    expect(content).toContain('toolbarActionStyle')
    expect(content).toContain('var(--app-input-bg)')
    expect(content).toContain('linear-gradient(135deg, var(--mantine-color-brand-6), var(--mantine-color-brand-5))')
    expect(content).toContain('color="brand"')
    expect(content).not.toContain('SegmentedControl')
    expect(content).not.toContain("background: '#ffffff'")
    expect(content).not.toContain("color: '#000000'")
    expect(content).not.toContain("'rgb(255 255 255 / 6%)'")
    expect(content).not.toContain("'rgb(255 255 255 / 12%)'")
  })
})
