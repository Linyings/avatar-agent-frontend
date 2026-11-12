import { expect, test } from '@playwright/test'

// A pending font request must not hold failure screenshots or video teardown.
test.use({ screenshot: 'off', video: 'off' })

for (const path of ['/avatar-mvp%60', '/missing-page']) {
  test(`offers a working entry point for an unknown URL: ${path}`, async ({ page }) => {
    await page.route('https://fonts.googleapis.com/**', route => route.abort())
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))

    await page.goto(path, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '页面不存在' })).toBeVisible()
    await page.getByRole('link', { name: '返回新版首页' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'AvaSpeak.ai 你的专属AI视频Agent' })).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('renders the login page while the external font stylesheet is pending', async ({ page }) => {
  let releaseFontRequest!: () => void
  const pendingFont = new Promise<void>(resolve => { releaseFontRequest = resolve })
  let fontRequested = false
  await page.route('https://fonts.googleapis.com/**', async route => {
    fontRequested = true
    await pendingFont
    await route.abort()
  })

  try {
    await page.goto('/login', { waitUntil: 'commit' })
    await expect(page.locator('input[name="email"]')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('input[name="password"]')).toBeVisible()
    expect(fontRequested).toBe(true)
  } finally {
    releaseFontRequest()
    await page.unrouteAll({ behavior: 'wait' })
  }
})

for (const path of ['/avatar-mvp', '/avatar-mvp?task_id=old-task&legacy=1']) {
  test(`opens the current home instead of the removed form: ${path}`, async ({ page }) => {
    await page.route('https://fonts.googleapis.com/**', route => route.abort())
    await page.goto(path, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'AvaSpeak.ai 你的专属AI视频Agent' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '从内容到完整视频' })).toHaveCount(0)
  })
}
