import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('README should reflect the current styling stack', () => {
  it('does not mention a removed Tailwind config file', () => {
    const readmePath = path.resolve(process.cwd(), 'README.md')
    const content = readFileSync(readmePath, 'utf8')

    expect(content).not.toContain('tailwind.config.js')
  })

  it('does not ship a root tailwind config anymore', () => {
    expect(existsSync(path.resolve(process.cwd(), 'tailwind.config.js'))).toBe(false)
  })
})
