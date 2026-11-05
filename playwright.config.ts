import { defineConfig, devices } from '@playwright/test'

import { apiBaseURL, baseURL, useRealApi } from './tests/e2e/helpers/e2eEnv'

const parsedBaseURL = new URL(baseURL)
const host = parsedBaseURL.hostname || '127.0.0.1'
const port = parsedBaseURL.port || (parsedBaseURL.protocol === 'https:' ? '443' : '80')
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {})
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  ...(useRealApi
    ? {}
    : {
        webServer: {
          command: `VITE_API_BASE_URL=${apiBaseURL} VITE_R2_BASE_URL=${apiBaseURL} npm run dev -- --host ${host} --port ${port}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          stdout: 'ignore' as const,
          stderr: 'pipe' as const,
          timeout: 120_000
        }
      })
})
