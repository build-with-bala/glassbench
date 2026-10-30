import { mkdirSync } from 'node:fs'
import { test, expect } from '@playwright/test'

// Every route, in both themes, at both viewports (the `desktop` and `mobile` projects).
const ROUTES = [
  { name: 'home', path: '/', heading: /does it know when it didn/i },
  { name: 'leaderboard', path: '/leaderboard', heading: /confidently-wrong rate/i },
  { name: 'datasheet', path: '/datasheet', heading: /dataset card|datasheet/i },
  { name: 'submit', path: '/submit', heading: /steps to the board|submit/i },
  // Platform routes (`platform: true` adds the stricter structural checks below).
  { name: 'systems', path: '/systems', heading: /every system, item by item/i, platform: true },
  { name: 'system-ranked', path: '/systems/agent_llm', heading: /^agent_llm$/, platform: true },
  { name: 'system-reference', path: '/systems/abstention_aware_llm', heading: /^abstention_aware_llm$/, platform: true },
  { name: 'explore', path: '/explore', heading: /right, silent, or confidently wrong/i, platform: true },
  {
    name: 'explore-filtered',
    path: '/explore?split=contradiction&outcome=confidently_wrong',
    heading: /right, silent, or confidently wrong/i,
    platform: true,
  },
  { name: 'item', path: '/explore/gb-contradiction-07741c44', heading: /^gb-contradiction-07741c44$/, platform: true },
  { name: 'compare', path: '/compare?a=agent_llm&b=bm25_retrieval', heading: /two systems, item by item/i, platform: true },
  { name: 'data', path: '/data', heading: /take the numbers/i, platform: true },
  { name: 'not-found', path: '/no-such-page', heading: /nothing at this address/i, status: 404, platform: true },
] as Array<{ name: string; path: string; heading: RegExp; status?: number; platform?: boolean }>

// Screenshots land here (gitignored) so a human can eyeball every route.
const SHOTS = 'test/visual/__screens__'
mkdirSync(SHOTS, { recursive: true })

for (const theme of ['dark', 'light'] as const) {
  for (const r of ROUTES) {
    test(`${r.path} [${theme}] renders, themed, no page errors`, async ({ page }, testInfo) => {
      const pageErrors: string[] = []
      page.on('pageerror', (e) => pageErrors.push(e.message))
      await page.addInitScript((t) => {
        try {
          localStorage.setItem('theme', t)
        } catch {
          /* ignore */
        }
      }, theme)
      const response = await page.goto(r.path, { waitUntil: 'networkidle' })
      expect(response?.status()).toBe(r.status ?? 200)
      await expect(page.locator('h1, h2').filter({ hasText: r.heading }).first()).toBeVisible()
      await expect(page.locator('html')).toHaveClass(new RegExp(theme))
      await expect(page.locator('main#main')).toHaveCount(1)
      if (r.platform) {
        // One <h1>, and nothing inside <main> wider than the viewport (content that has
        // to scroll sideways does so inside its own labelled, focusable region).
        await expect(page.locator('h1')).toHaveCount(1)
        const viewport = page.viewportSize()!.width
        const tooWide = await page.evaluate((vw) => {
          const scrollsSideways = (el: Element | null): boolean => {
            for (let n = el; n && n.tagName !== 'MAIN'; n = n.parentElement) {
              const ox = getComputedStyle(n).overflowX
              if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true
            }
            return false
          }
          return [...document.querySelectorAll('main *')]
            .filter((el) => el.getBoundingClientRect().right > vw + 1 && !scrollsSideways(el.parentElement))
            .slice(0, 5)
            .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`)
        }, viewport)
        expect(tooWide, `elements wider than the ${viewport}px viewport`).toEqual([])
      }
      expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
      await page.screenshot({ path: `${SHOTS}/${r.name}-${theme}-${testInfo.project.name}.png` })
    })
  }
}

test('nav link is clickable over the WebGL canvas (canvas must not eat clicks)', async ({ page }) => {
  await page.goto('/')
  // The top nav specifically — the footer has a "Site sections" nav of its own.
  await page.locator('nav.site-nav').getByRole('link', { name: 'Leaderboard', exact: true }).click()
  await expect(page).toHaveURL(/leaderboard/)
})
