import { test, expect } from '@playwright/test'

const ROUTES = [
  { path: '/', heading: /does it know when it didn/i },
  { path: '/leaderboard', heading: /confidently-wrong rate/i },
  { path: '/datasheet', heading: /dataset card|datasheet/i },
  { path: '/submit', heading: /steps to the board|submit/i },
]

for (const theme of ['dark', 'light'] as const) {
  for (const r of ROUTES) {
    test(`${r.path} [${theme}] renders, themed, no page errors`, async ({ page }) => {
      const pageErrors: string[] = []
      page.on('pageerror', (e) => pageErrors.push(e.message))
      await page.addInitScript((t) => {
        try {
          localStorage.setItem('theme', t)
        } catch {
          /* ignore */
        }
      }, theme)
      await page.goto(r.path, { waitUntil: 'networkidle' })
      await expect(page.locator('h1, h2').filter({ hasText: r.heading }).first()).toBeVisible()
      await expect(page.locator('html')).toHaveClass(new RegExp(theme))
      expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
    })
  }
}

test('nav link is clickable over the WebGL canvas (canvas must not eat clicks)', async ({ page }) => {
  await page.goto('/')
  await page.locator('nav').getByRole('link', { name: 'Leaderboard', exact: true }).click()
  await expect(page).toHaveURL(/leaderboard/)
})
