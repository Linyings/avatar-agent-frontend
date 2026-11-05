import { expect, test } from '@playwright/test'

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const

for (const viewport of viewports) {
  test(`keeps the Features section visible in the ${viewport.name} first viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await page.evaluate(async () => {
      await document.fonts.ready
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
    })

    await expect(page.locator('video')).toHaveAttribute('poster', '/media/narratoai-hero-poster.webp')
    await expect(page.locator('#features')).toBeVisible()

    const featuresTop = await page.locator('#features').evaluate((element) => element.getBoundingClientRect().top)
    expect(featuresTop).toBeLessThanOrEqual(viewport.height - 32)

    const featuresBadge = page
      .locator('#features')
      .getByText(/Intelligence engine|智能引擎/)
      .first()
    const badgeState = await featuresBadge.evaluate((element) => {
      const ancestors: Array<{ display: string; opacity: number; visibility: string }> = []
      let effectiveOpacity = 1
      let current: Element | null = element

      while (current) {
        const style = getComputedStyle(current)
        const opacity = Number(style.opacity)
        effectiveOpacity *= Number.isFinite(opacity) ? opacity : 1
        ancestors.push({ display: style.display, opacity, visibility: style.visibility })
        current = current.parentElement
      }

      return {
        ancestors,
        effectiveOpacity,
        top: element.getBoundingClientRect().top,
      }
    })

    expect(badgeState.ancestors.every(({ display }) => display !== 'none')).toBe(true)
    expect(badgeState.ancestors.every(({ visibility }) => visibility === 'visible')).toBe(true)
    expect(badgeState.effectiveOpacity).toBeGreaterThanOrEqual(0.99)
    expect(badgeState.top).toBeLessThanOrEqual(viewport.height - 40)

    console.log(`[home-hero] ${viewport.name} badgeTop=${badgeState.top} opacity=${badgeState.effectiveOpacity}`)
    await page.screenshot({ path: testInfo.outputPath('visible-feature-hint.png') })
  })
}
