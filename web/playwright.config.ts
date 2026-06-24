import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './test/visual',
  timeout: 60_000,
  fullyParallel: false,
  use: { baseURL: 'http://localhost:3200', trace: 'off' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3200',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
