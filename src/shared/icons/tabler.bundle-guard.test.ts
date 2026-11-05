import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Tabler bundling guards', () => {
  it('avoids namespace imports and forced icon mega chunks', () => {
    const tablerBridge = readFileSync(resolve(process.cwd(), 'src/shared/icons/tabler.ts'), 'utf8')
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')

    expect(tablerBridge).not.toContain("import * as Tabler from '@tabler/icons-react'")
    expect(viteConfig).not.toContain("id.includes('@tabler/icons-react')")
  })
})
