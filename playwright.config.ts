import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4175'

export default defineConfig({
  testDir: './e2e',
  use: { baseURL },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4175 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
  },
})
