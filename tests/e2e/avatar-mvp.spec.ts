import {expect, test, type Page} from '@playwright/test'
import {readFileSync} from 'node:fs'

test.use({video: 'off'})

// Browser contract tests only: these fixtures do not validate Seedance output.
const id = '11111111-1111-4111-8111-111111111111'
const user = {user_id: 'avatar-browser-test', username: 'avatar-test', email: 'avatar@example.test', is_admin: false, is_active: true, is_verified: true, language: 'zh', timezone: 'Asia/Shanghai'}
const task = (status = 'running') => ({id, title: '口播测试', script: '第一句。第二句。第三句。', status, stage: status === 'succeeded' ? 'completed' : 'generating', duration: 15, stage_seconds: {tts: 1}, review_required: true,
  shots: ['正面', '左前方20度', '右前方20度'].map((angle,i) => ({id: `shot-${i+1}`, angle, framing: ['中景','半身','近景'][i], status: status === 'succeeded' || i === 0 ? 'succeeded' : 'pending', clip: {duration: 5}}))})

async function authenticated(page: Page) {
  await page.addInitScript(({profile}) => {
    localStorage.setItem('auth_access_token', 'browser-contract-test-token')
    localStorage.setItem('auth_user', JSON.stringify(profile))
    localStorage.setItem('narratoai-locale', 'zh')
  }, {profile: user})
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url())
    const body = url.pathname === '/api/v1/auth/me' ? user : url.pathname.includes('notifications') ? {items: [], total: 0, unread_count: 0} : {}
    await route.fulfill({json: body})
  })
}

test('上传、三镜状态、刷新恢复及视频鉴权 Blob 下载', async ({page}) => {
  await authenticated(page)
  let reads = 0
  let videoAuthorization = ''
  await page.route('**/avatar-mvp/config', route => route.fulfill({json: {enabled: true, configured: true, baseline_approved: true}}))
  await page.route('**/avatar-mvp/tasks', async route => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().postData()).toContain('client_request_id')
    expect(route.request().postData()).toContain('第一句。第二句。第三句。')
    expect(route.request().headers().authorization).toContain('Bearer ')
    await route.fulfill({status: 202, json: task()})
  })
  await page.route(`**/avatar-mvp/tasks/${id}`, async route => {
    reads++
    await route.fulfill({json: task(reads >= 2 ? 'succeeded' : 'running')})
  })
  await page.route(`**/avatar-mvp/tasks/${id}/video`, async route => {
    videoAuthorization = route.request().headers().authorization
    expect(route.request().url()).not.toContain('token=')
    await route.fulfill({contentType: 'video/mp4', body: readFileSync(new URL('./fixtures/avatar-synthetic.mp4', import.meta.url))})
  })
  await page.goto('/avatar-mvp')
  await page.locator('input[type=file]').setInputFiles({name: 'portrait.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')})
  await page.getByLabel('中文口播稿').fill('第一句。第二句。第三句。')
  await expect(page.getByText('12 / 240')).toBeVisible()
  await page.getByRole('button', {name: '生成口播视频'}).click()
  await expect(page).toHaveURL(new RegExp(`task_id=${id}`))
  await expect(page.getByRole('link', {name: '下载 MP4'})).toBeVisible()
  await expect(page.getByText('3 / 3 镜头')).toBeVisible()
  await expect(page.getByText('已完成', {exact: true})).toHaveCount(4)
  expect(reads).toBeGreaterThanOrEqual(2)
  expect(videoAuthorization).toBe('Bearer browser-contract-test-token')
  await expect(page.locator('video')).toHaveAttribute('src', /^blob:/)
  await expect.poll(() => page.locator('video').evaluate(v => (v as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2)
  await page.locator('video').evaluate(v => (v as HTMLVideoElement).play())
  await expect.poll(() => page.locator('video').evaluate(v => (v as HTMLVideoElement).currentTime)).toBeGreaterThan(.1)
  await page.locator('video').evaluate(v => (v as HTMLVideoElement).pause())
  await page.screenshot({path: 'test-results/avatar-mvp-desktop.png', fullPage: true})
  await page.reload()
  await expect(page.getByRole('link', {name: '下载 MP4'})).toBeVisible()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('link', {name: '下载 MP4'}).click()
  expect((await downloaded).suggestedFilename()).toBe('avatar.mp4')
})

test('手机显示配置错误且禁用生成', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844})
  await authenticated(page)
  await page.route('**/avatar-mvp/config', route => route.fulfill({json: {enabled: false, configured: false, baseline_approved: false, message: 'RunningHub 未配置（RUNNINGHUB_API_KEY）'}}))
  await page.goto('/avatar-mvp')
  await expect(page.getByText('RunningHub 未配置（RUNNINGHUB_API_KEY）')).toBeVisible()
  await expect(page.getByRole('button', {name: '生成口播视频'})).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({path: 'test-results/avatar-mvp-mobile.png', fullPage: true})
})

test('从任务地址恢复失败状态并手动重试', async ({page}) => {
  await authenticated(page)
  let retried = false
  await page.route('**/avatar-mvp/config', route => route.fulfill({json: {enabled: true, configured: true, baseline_approved: true}}))
  await page.route(`**/avatar-mvp/tasks/${id}`, route => route.fulfill({json: {...task(retried ? 'running' : 'failed'), error: retried ? '' : '镜头查询暂不可用；任务 ID 已保存'}}))
  await page.route(`**/avatar-mvp/tasks/${id}/retry`, async route => {
    expect(route.request().method()).toBe('POST')
    retried = true
    await route.fulfill({status: 202, json: task()})
  })
  await page.goto(`/avatar-mvp?task_id=${id}`)
  await expect(page.getByText('镜头查询暂不可用；任务 ID 已保存')).toBeVisible()
  await page.getByRole('button', {name: '重试失败步骤'}).click()
  await expect(page.getByRole('button', {name: '重试失败步骤'})).toHaveCount(0)
  expect(retried).toBe(true)
})
