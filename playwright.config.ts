import { defineConfig, devices } from '@playwright/test'

const apiPort = 4157
const webPort = 5188
const apiUrl = `http://127.0.0.1:${apiPort}`
const webUrl = `http://127.0.0.1:${webPort}`

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: webUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
  webServer: [
    {
      command: `FINANZAS_API_PORT=${apiPort} FINANZAS_DB_PATH=.playwright/finanzas-e2e.sqlite npm run api`,
      url: `${apiUrl}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `FINANZAS_API_URL=${apiUrl} npm run dev -- --host 127.0.0.1 --port ${webPort}`,
      url: webUrl,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
