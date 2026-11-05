import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const cleanupTargets = [
  'src/pages/HomePage.tsx',
  'src/pages/PricingPage.tsx',
  'src/pages/SubscriptionPage.tsx',
  'src/pages/DashboardPage.tsx',
  'src/pages/PrivacyPolicyPage.tsx',
  'src/pages/TermsOfServicePage.tsx',
] as const

const forbiddenLegacyColors = [
  'rgba(17, 17, 17, 0.88)',
  'rgba(17, 17, 17, 0.92)',
  'rgba(17, 17, 17, 0.9)',
  'rgba(24, 26, 23, 0.92)',
  'rgba(24, 26, 23, 0.96)',
  'rgba(15, 15, 15, 0.88)',
  'rgba(15, 15, 15, 0.92)',
  'rgba(23, 23, 23, 0.88)',
  'rgba(62, 207, 142, 0.08)',
  'rgba(62, 207, 142, 0.24)',
  'rgba(255, 255, 255, 0.08)',
  '#0f0f0f',
  '#fafafa',
] as const

describe('theme token cleanup targets', () => {
  it('replace legacy shell colors with theme tokens in scoped pages', () => {
    const contents = cleanupTargets.map((file) => ({
      file,
      content: readFileSync(resolve(process.cwd(), file), 'utf8'),
    }))

    for (const { file, content } of contents) {
      for (const legacyColor of forbiddenLegacyColors) {
        expect(content, `${file} should not contain ${legacyColor}`).not.toContain(legacyColor)
      }
    }
  })
})
