import { defineConfig, devices } from '@playwright/test'

// The dev server's port. 3200 by default (what `npm run dev` uses); set PLAYWRIGHT_PORT
// to run the suite against another port, e.g. when 3200 is already taken:
//   PLAYWRIGHT_PORT=3210 npx playwright test
const PORT = Number(process.env.PLAYWRIGHT_PORT) || 3200
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './test/visual',
  timeout: 60_000,
  fullyParallel: false,
  use: { baseURL: BASE_URL, trace: 'off' },
  webServer: {
    // `npm run dev` hard-codes 3200, so for any other port run the same two steps by hand.
    command: PORT === 3200 ? 'npm run dev' : `node scripts/sync-data.mjs && npx next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
})
