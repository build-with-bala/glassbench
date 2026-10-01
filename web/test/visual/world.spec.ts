import { test, expect, type Page } from '@playwright/test'

/* Guards for the WebGL world itself. The route matrix in routes.spec.ts passes
   even if the canvas draws nothing, so these check that the scene really renders,
   that the still fallback really replaces it, and that neither blocks the DOM. */

// A flat region compresses to a few hundred bytes of PNG; rendered slabs do not.
const DRAWN_BYTES = 6_000

async function open(page: Page, theme: 'dark' | 'light', motion: 'no-preference' | 'reduce') {
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  // headless Chromium can report reduced motion, which swaps the canvas for the poster
  await page.emulateMedia({ reducedMotion: motion })
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('theme', t)
    } catch {
      /* ignore */
    }
  }, theme)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  return pageErrors
}

/** Screenshot of the part of the viewport the hero keeps free for the slabs. */
async function slabRegion(page: Page): Promise<Buffer> {
  const { width, height } = page.viewportSize()!
  const portrait = width < height
  const clip = portrait
    ? { x: 0, y: Math.round(height * 0.12), width, height: Math.round(height * 0.26) }
    : { x: Math.round(width * 0.58), y: Math.round(height * 0.2), width: Math.round(width * 0.38), height: Math.round(height * 0.6) }
  return page.screenshot({ clip })
}

for (const theme of ['dark', 'light'] as const) {
  test(`world [${theme}] draws the slab scene on a live canvas`, async ({ page }) => {
    const pageErrors = await open(page, theme, 'no-preference')
    const world = page.locator('.world-root')
    await expect(world.locator('canvas')).toHaveCount(1)
    await expect(world).toHaveAttribute('data-quality', /full|reduced/)
    await expect(world).toHaveAttribute('data-scene', 'hero')
    // the canvas must be visible, not hidden behind a reveal gate
    await expect(world.locator('canvas')).toHaveCSS('opacity', '1')
    await expect
      .poll(async () => (await slabRegion(page)).length, { timeout: 20_000, intervals: [500] })
      .toBeGreaterThan(DRAWN_BYTES)
    expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
  })
}

test('world falls back to a still when motion is reduced', async ({ page }) => {
  const pageErrors = await open(page, 'dark', 'reduce')
  const world = page.locator('.world-root')
  await expect(world).toHaveAttribute('data-quality', 'poster')
  await expect(world.locator('canvas')).toHaveCount(0)
  const poster = world.locator('img.world-poster')
  await expect(poster).toBeVisible()
  await expect.poll(() => poster.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0)
  expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
})

test('world morphs per route and never intercepts DOM clicks', async ({ page }) => {
  await open(page, 'dark', 'no-preference')
  const world = page.locator('.world-root')
  await expect(world.locator('canvas')).toHaveCount(1)
  await expect(world).toHaveCSS('pointer-events', 'none')

  // a real mouse press on a hero button that sits directly over the canvas
  const cta = page.getByRole('link', { name: /view leaderboard/i })
  await page.waitForTimeout(1800) // let the hero entrance settle so the button has stopped moving
  await cta.scrollIntoViewIfNeeded()
  const box = (await cta.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.up()
  await expect(page).toHaveURL(/leaderboard/)
  await expect(world).toHaveAttribute('data-scene', 'board')
  // same canvas, still mounted: the world persists across routes
  await expect(world.locator('canvas')).toHaveCount(1)

  await page.locator('nav').getByRole('link', { name: 'Datasheet', exact: true }).click()
  await expect(page).toHaveURL(/datasheet/)
  await expect(world).toHaveAttribute('data-scene', 'card')
})
