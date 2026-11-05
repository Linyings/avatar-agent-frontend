import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEFAULT_THEME, mergeMantineTheme } from '@mantine/core'
import { describe, expect, it } from 'vitest'
import { appCssVariablesResolver, appFontFamily, appTheme } from './theme'

describe('appTheme', () => {
  it('uses the digital-human copper brand scale globally', () => {
    expect(appTheme.primaryColor).toBe('brand')
    expect(appTheme.primaryShade).toBe(6)
    const brandScale = [
      '#fff4ec',
      '#ffe4d2',
      '#ffc7a6',
      '#f5a57a',
      '#e88855',
      '#d86e3a',
      '#c45b2d',
      '#a84a22',
      '#8a3c1b',
      '#6d2e14',
    ]

    expect(appTheme.colors?.brand).toEqual(brandScale)
    expect(appTheme.colors?.green).toEqual(brandScale)
  })

  it('provides distinct light and dark app tokens', () => {
    const variables = appCssVariablesResolver(mergeMantineTheme(DEFAULT_THEME, appTheme))

    expect(variables.light['--app-bg']).toBe('#f6f3ef')
    expect(variables.dark['--app-bg']).toBe('#000000')
    expect(variables.light['--app-text']).toBe('#241910')
    expect(variables.dark['--app-text']).toBe('#f8fafc')
    expect(variables.light['--app-dropdown-bg']).toBe('#ffffff')
    expect(variables.dark['--app-dropdown-bg']).toBe('#080a0e')
  })

  it('uses the homepage hero font family across Mantine and global CSS', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const cssFontFamily = appFontFamily.replaceAll('"', "'")

    expect(appTheme.fontFamily).toBe(appFontFamily)
    expect(appTheme.headings?.fontFamily).toBe(appFontFamily)
    expect(appTheme.headings?.fontWeight).toBe('500')
    expect(css).toContain(`--app-font-family: ${cssFontFamily};`)
    expect(css).toContain('font-family: var(--app-font-family);')
  })
})
