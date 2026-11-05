import { expect, test } from '@playwright/test'

const localTestEmail = process.env.E2E_LOCAL_TEST_EMAIL
const localTestPassword = process.env.E2E_LOCAL_TEST_PASSWORD
const shouldRun = process.env.E2E_USE_REAL_API === '1'
  && Boolean(localTestEmail)
  && Boolean(localTestPassword)

test.describe('local real API smoke test', () => {
  test.skip(!shouldRun, 'requires E2E_USE_REAL_API and local test account credentials')

  test('logs in, creates a project, and never requests an undefined API path', async ({ page, request }) => {
    const undefinedApiRequests: string[] = []
    let createdProjectId: string | undefined

    page.on('request', (networkRequest) => {
      if (networkRequest.url().includes('/undefined/api/')) {
        undefinedApiRequests.push(networkRequest.url())
      }
    })

    try {
      await page.goto('/login')
      await page.locator('#email').fill(localTestEmail!)
      await page.locator('#password').fill(localTestPassword!)
      await page.getByRole('button', { name: '登录' }).click()
      await page.waitForURL((url) => url.pathname !== '/login')

      await page.goto('/projects')
      const createButton = page.getByRole('button', { name: '新建项目' })
      await expect(createButton).toBeVisible()

      const createResponsePromise = page.waitForResponse((response) => (
        response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/v1/projects/'
      ))
      await createButton.click()
      const createResponse = await createResponsePromise
      expect(createResponse.status()).toBe(201)

      const createPayload = await createResponse.json() as {
        data?: { id?: string }
        id?: string
      }
      createdProjectId = createPayload.data?.id ?? createPayload.id
      expect(createdProjectId).toBeTruthy()
      await page.waitForURL(new RegExp('/projects/' + createdProjectId + '/material/upload'))
      expect(undefinedApiRequests).toEqual([])
    } finally {
      if (createdProjectId) {
        const loginResponse = await request.post('/api/v1/auth/login', {
          data: {
            email: localTestEmail,
            password: localTestPassword,
          },
        })
        expect(loginResponse.ok()).toBeTruthy()

        const loginPayload = await loginResponse.json() as {
          data?: { tokens?: { access_token?: string } }
          tokens?: { access_token?: string }
        }
        const accessToken = loginPayload.data?.tokens?.access_token ?? loginPayload.tokens?.access_token
        expect(accessToken).toBeTruthy()

        const deleteResponse = await request.delete('/api/v1/projects/' + createdProjectId, {
          headers: {
            Authorization: 'Bearer ' + accessToken,
          },
        })
        expect(deleteResponse.ok()).toBeTruthy()
      }
    }
  })
})
