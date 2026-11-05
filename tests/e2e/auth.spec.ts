import { expect, test } from '@playwright/test'

import { setupMockApi } from './helpers/mockApi'

test.beforeEach(async ({ page }) => {
  await setupMockApi(page)
})

test('注册页可以获取验证码并完成注册', async ({ page }) => {
  let emailCodePayload: { locale?: string } | null = null
  let acceptLanguage = ''
  await page.route('**/api/v1/auth/request-email-code', async (route) => {
    emailCodePayload = route.request().postDataJSON() as { locale?: string }
    acceptLanguage = route.request().headers()['accept-language'] ?? ''
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ success: true, message: '验证码已发送' }),
    })
  })

  await page.goto('/register')

  await page.getByLabel(/用户名|Username/).fill('newuser')
  await page.getByLabel(/邮箱地址|Email address/).fill('newuser@example.com')
  await page.getByRole('button', { name: /获取验证码|Get code/ }).click()

  await expect(page.getByRole('button', { name: /获取验证码|Get code/ })).toBeDisabled()
  await expect(page.getByRole('status')).toContainText(/Code sent to newuser@example.com\. Valid for 10 minutes\./i)
  expect(emailCodePayload?.locale).toBe('en')
  expect(acceptLanguage).toBe('en')

  await page.getByLabel(/邮箱验证码|Email code/).fill('654321')
  await page.getByLabel(/登录密码|Password/).fill('Pass1234')
  await page.getByLabel(/确认密码|Confirm password/).fill('Pass1234')
  await page.getByTestId('agreement-toggle-text').click()
  const agreementCheckbox = page.getByLabel(/我同意|I agree/)
  await expect(agreementCheckbox).toBeChecked()
  await expect(agreementCheckbox).toHaveJSProperty('checked', true)
  await page.getByRole('button', { name: /注册|Sign up/ }).click()

  await page.waitForURL('**/')
})

test('注册页未勾选协议时不能提交注册', async ({ page }) => {
  await page.goto('/register')

  await page.getByLabel(/用户名|Username/).fill('newuser')
  await page.getByLabel(/邮箱地址|Email address/).fill('newuser@example.com')
  await page.getByLabel(/邮箱验证码|Email code/).fill('654321')
  await page.getByLabel(/登录密码|Password/).fill('Pass1234')
  await page.getByLabel(/确认密码|Confirm password/).fill('Pass1234')

  await expect(page.getByRole('button', { name: /注册|Sign up/ })).toBeDisabled()
})

test('注册页会翻译后端返回的验证码错误', async ({ page }) => {
  await page.route('**/api/v1/auth/register', async (route) => {
    await route.fulfill({
      status: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: '验证码不存在或已过期' }),
    })
  })

  await page.goto('/register')

  await page.getByLabel(/用户名|Username/).fill('newuser')
  await page.getByLabel(/邮箱地址|Email address/).fill('newuser@example.com')
  await page.getByLabel(/邮箱验证码|Email code/).fill('654321')
  await page.getByLabel(/登录密码|Password/).fill('Pass1234')
  await page.getByLabel(/确认密码|Confirm password/).fill('Pass1234')
  await page.getByTestId('agreement-toggle-text').click()
  await page.getByRole('button', { name: /注册|Sign up/ }).click()

  await expect(page.getByText('The code does not exist or has expired')).toBeVisible()
  await expect(page.getByText('验证码不存在或已过期')).toHaveCount(0)
})
