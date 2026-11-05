import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('ProjectDetailPage responsive layout', () => {
  it('keeps project pages vertically reachable on shorter screens', () => {
    const content = readFileSync(resolve(process.cwd(), 'src/pages/ProjectDetailPage.tsx'), 'utf8')

    expect(content).toContain("overflowY: 'auto'")
    expect(content).not.toContain('isDeepMode')
  })

  it('uses a compact authenticated header on small screens', () => {
    const content = readFileSync(resolve(process.cwd(), 'src/pages/ProjectDetailPage.tsx'), 'utf8')

    expect(content).toContain('hiddenFrom="sm"')
    expect(content).toContain('visibleFrom="sm"')
    expect(content).toContain('<UserMenu compact />')
  })
})
