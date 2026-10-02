import { test, expect, type Locator, type Page } from '@playwright/test'

/* The board as an instrument, and everything that drives it. Interactions are made
 * with real input — page.mouse, page.touchscreen, page.keyboard — never synthetic
 * events, and what the board shows is checked against the public JSON API, so a
 * passing test means the pieces on screen are the pipeline's results.
 *
 * The canvas is opaque to the DOM. What it shows is asserted through (a) the real
 * links laid over each cell (`[data-board-cell]`, with data-outcome / data-lit) and
 * (b) the world root's data-system / data-lit / data-focus attributes, which are
 * written from the same resolver the scene draws from. */

const LEADER = 'agent_llm'

interface ApiItem {
  id: string
  split: string
  query: string
  results: Record<string, { outcome: string; confidence: number; abstention: string | null }>
}

async function apiItems(page: Page): Promise<ApiItem[]> {
  const res = await page.request.get('/api/items.json')
  expect(res.ok()).toBe(true)
  return ((await res.json()) as { items: ApiItem[] }).items
}

/** Open a page with the live canvas (headless Chromium may report reduced motion,
 *  which would swap the canvas for a still). */
async function open(page: Page, path: string) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  // software WebGL under a parallel run can take a while to compile its shaders
  await expect(page.locator('.world-root canvas')).toHaveCount(1, { timeout: 30_000 })
  return errors
}

/** Wait until the board has stopped moving: the cells' links follow it, so two equal
 *  readings of one link's box, a beat apart, mean the camera and the cells are still. */
async function settled(page: Page) {
  const probe = page.locator('[data-board-cell]').first()
  let last = ''
  await expect
    .poll(
      async () => {
        const b = await probe.boundingBox()
        const now = b ? [b.x, b.y, b.width, b.height].map((v) => v.toFixed(1)).join(',') : ''
        const same = now !== '' && now === last
        last = now
        return same
      },
      { timeout: 30_000, intervals: [350] },
    )
    .toBe(true)
}

/** Home, with the board's links in place over the cells and the entrance finished. */
async function openHome(page: Page) {
  const errors = await open(page, '/')
  await expect(page.locator('[data-ready="true"]')).toHaveCount(1, { timeout: 30_000 })
  await settled(page)
  return errors
}

const world = (page: Page) => page.locator('.world-root')
const cell = (page: Page, id: string) => page.locator(`[data-board-cell="${id}"]`)

/** A point on a cell that really belongs to it: nearer cells overlap the ones behind,
 *  so probe down from the top of the cell's box until the hit test agrees. */
async function pointOn(page: Page, id: string): Promise<{ x: number; y: number }> {
  const box = (await cell(page, id).boundingBox())!
  const point = await page.evaluate(
    ({ id, box }) => {
      for (let f = 0.12; f < 0.95; f += 0.08) {
        const x = box.x + box.width / 2
        const y = box.y + box.height * f
        const hit = document.elementFromPoint(x, y)
        if (hit instanceof HTMLElement && hit.dataset.boardCell === id) return { x, y }
      }
      return null
    },
    { id, box },
  )
  expect(point, `a visible point on ${id}`).not.toBeNull()
  return point!
}

/** An item whose cell is not hidden behind another: the first that passes the probe. */
async function reachableItem(page: Page, items: ApiItem[], want: (it: ApiItem) => boolean): Promise<string> {
  for (const it of items.filter(want)) {
    const box = await cell(page, it.id).boundingBox()
    if (!box) continue
    const ok = await page.evaluate(
      ({ id, box }) => {
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height * 0.2)
        return hit instanceof HTMLElement && hit.dataset.boardCell === id
      },
      { id: it.id, box },
    )
    if (ok) return it.id
  }
  throw new Error('no reachable cell matched')
}

/** Choose an option of a custom select from the keyboard. */
async function choose(select: Locator, value: string) {
  await select.focus()
  await select.press('Enter')
  await expect(select).toHaveAttribute('aria-expanded', 'true')
  const steps = await select.evaluate((el, want) => {
    const list = document.getElementById(el.getAttribute('aria-controls')!)!
    const options = [...list.querySelectorAll('[role="option"]')]
    const active = options.findIndex((o) => o.id === el.getAttribute('aria-activedescendant'))
    const target = options.findIndex((o) => o.textContent!.trim().replace(/^✓/, '').trim().split(' ')[0] === want)
    return target < 0 ? null : target - active
  }, value)
  expect(steps).not.toBeNull()
  for (let i = 0; i < Math.abs(steps!); i++) await select.press(steps! > 0 ? 'ArrowDown' : 'ArrowUp')
  await select.press('Enter')
}

/* ------------------------------------------------------------- the hero board */

test.describe('hero board', () => {
  test('shows the chosen system’s real per-item outcomes', async ({ page }) => {
    const errors = await openHome(page)
    const items = await apiItems(page)
    await expect(page.locator('[data-board-cell]')).toHaveCount(items.length)

    const shows = async (system: string) => {
      await expect(world(page)).toHaveAttribute('data-system', system)
      const onBoard = await page
        .locator('[data-board-cell]')
        .evaluateAll((els) => els.map((el) => [(el as HTMLElement).dataset.boardCell, (el as HTMLElement).dataset.outcome]))
      expect(onBoard).toEqual(items.map((it) => [it.id, it.results[system].outcome]))
    }
    await shows(LEADER)

    // pick another system with a real click on its radio, which sits over the canvas
    const picker = page.getByRole('radiogroup', { name: 'System on the board' })
    await picker.getByRole('radio', { name: /always_answer/ }).click()
    await expect(picker.getByRole('radio', { name: /always_answer/ })).toHaveAttribute('aria-checked', 'true')
    await shows('always_answer')
    // the readout is the published board row
    const readout = page.getByLabel('always_answer: published results')
    await expect(readout).toContainText('0.698')
    await expect(readout).toContainText('0.00')

    // keyboard: the radio group is one tab stop and arrows move the choice
    await picker.getByRole('radio', { name: /always_answer/ }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(picker.getByRole('radio', { name: /always_abstain/ })).toBeFocused()
    await shows('always_abstain')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await shows('bm25_retrieval')
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('hovering a cell reads it out; clicking opens the item', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'hover is a fine-pointer interaction; touch has its own test')
    await openHome(page)
    const items = await apiItems(page)
    const id = await reachableItem(page, items, (it) => it.results[LEADER].outcome === 'confidently_wrong')
    const item = items.find((it) => it.id === id)!
    const p = await pointOn(page, id)

    await page.mouse.move(p.x - 80, p.y - 60)
    await page.mouse.move(p.x, p.y, { steps: 6 })
    const tip = page.getByRole('tooltip')
    await expect(tip).toBeVisible()
    await expect(tip).toContainText(id)
    await expect(tip).toContainText(item.query)
    await expect(tip).toContainText(/false-premise|contradiction|answerable|stale/)
    await expect(tip).toContainText('Confidently wrong')
    await expect(tip).toContainText(item.results[LEADER].confidence.toFixed(2))
    await expect(world(page)).toHaveAttribute('data-focus', id)

    // leaving the board clears it
    await page.mouse.move(8, 400, { steps: 4 })
    await expect(tip).toBeHidden()
    await expect(world(page)).not.toHaveAttribute('data-focus', /.+/)

    // a real press and release on the cell navigates to that item
    await page.mouse.move(p.x, p.y, { steps: 4 })
    await page.mouse.down()
    await page.mouse.up()
    await expect(page).toHaveURL(new RegExp(`/explore/${id}$`), { timeout: 45_000 })
    await expect(page.getByRole('heading', { level: 1, name: id })).toBeVisible()
  })

  test('the keyboard walks the plate and opens an item', async ({ page }) => {
    await openHome(page)
    const first = page.locator('[data-board-cell][tabindex="0"]')
    await expect(first).toHaveCount(1) // one tab stop for 96 cells
    await first.focus()
    const start = await first.getAttribute('data-board-cell')
    await expect(page.getByRole('tooltip')).toContainText(start!)
    await expect(world(page)).toHaveAttribute('data-focus', start!)

    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    const focused = page.locator('[data-board-cell]:focus')
    await expect(focused).toHaveCount(1)
    const id = (await focused.getAttribute('data-board-cell'))!
    expect(id).not.toBe(start)
    await expect(page.getByRole('tooltip')).toContainText(id)
    await expect(world(page)).toHaveAttribute('data-focus', id)

    await page.keyboard.press('Enter')
    // (the dev server may be compiling the item route for the first time)
    await expect(page).toHaveURL(new RegExp(`/explore/${id}$`), { timeout: 45_000 })
  })

  test('legend chips keep only matching cells lit', async ({ page }) => {
    await openHome(page)
    const items = await apiItems(page)
    const count = (outcome: string) => items.filter((it) => it.results[LEADER].outcome === outcome).length
    const lit = page.locator('[data-board-cell][data-lit="true"]')
    await expect(lit).toHaveCount(items.length)

    const cw = page.locator('.hero').getByRole('button', { name: /Confidently wrong/ })
    await cw.click()
    await expect(cw).toHaveAttribute('aria-pressed', 'true')
    await expect(lit).toHaveCount(count('confidently_wrong'))
    await expect(world(page)).toHaveAttribute('data-lit', String(count('confidently_wrong')))
    expect(await lit.evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.outcome))).toEqual(
      Array(count('confidently_wrong')).fill('confidently_wrong'),
    )

    // a split chip, from the keyboard; the two legends are one choice
    const stale = page.locator('.hero').getByRole('button', { name: /^stale/ })
    await stale.focus()
    await page.keyboard.press('Space')
    await expect(stale).toHaveAttribute('aria-pressed', 'true')
    await expect(cw).toHaveAttribute('aria-pressed', 'false')
    await expect(lit).toHaveCount(items.filter((it) => it.split === 'stale').length)

    await page.keyboard.press('Space')
    await expect(stale).toHaveAttribute('aria-pressed', 'false')
    await page.mouse.move(4, 4) // (and stop previewing the chip under the pointer / focus)
    await stale.blur()
    await expect(lit).toHaveCount(items.length)
  })

  test('dragging turns the board, within bounds, and is not a click', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'mouse drag; the buttons below are the touch / keyboard path')
    test.slow() // several real drags, each followed by waiting for the board to come to rest
    await openHome(page)
    const items = await apiItems(page)
    const probe = cell(page, items[0].id)
    const before = (await probe.boundingBox())!

    // press on a cell, drag well past the threshold, release on a cell: the board turns
    // and nothing is opened
    const id = await reachableItem(page, items, () => true)
    const p = await pointOn(page, id)
    await page.mouse.move(p.x, p.y)
    await page.mouse.down()
    await page.mouse.move(p.x + 160, p.y + 10, { steps: 8 })
    await page.mouse.up()
    await settled(page)
    const after = (await probe.boundingBox())!
    expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeGreaterThan(12)
    await expect(page).toHaveURL(/\/$/)

    // the turn is bounded: a much longer drag does not spin it further than the limit
    const drag = async (dx: number) => {
      await page.mouse.move(700, 300)
      await page.mouse.down()
      await page.mouse.move(700 + dx, 300, { steps: 8 })
      await page.mouse.up()
      await settled(page)
      return (await probe.boundingBox())!
    }
    const far = await drag(500)
    const farther = await drag(500)
    expect(Math.abs(farther.x - far.x)).toBeLessThan(2)

    // reset
    await page.getByRole('button', { name: 'Reset the view' }).click()
    await settled(page)
    const reset = (await probe.boundingBox())!
    expect(Math.abs(reset.x - before.x)).toBeLessThan(2)
    expect(Math.abs(reset.y - before.y)).toBeLessThan(2)
  })

  test('the view buttons turn the board without a pointer drag', async ({ page }) => {
    await openHome(page)
    const items = await apiItems(page)
    const probe = cell(page, items[0].id)
    const left = page.getByRole('button', { name: 'Turn the board left' })
    // on a phone the buttons are below the fold, and scrolling moves the board: settle first
    await left.scrollIntoViewIfNeeded()
    await settled(page)
    const before = (await probe.boundingBox())!
    await left.focus()
    await page.keyboard.press('Enter')
    await settled(page)
    const turned = (await probe.boundingBox())!
    expect(Math.abs(turned.x - before.x) + Math.abs(turned.y - before.y)).toBeGreaterThan(4)
    await page.getByRole('button', { name: 'Reset the view' }).click()
    await settled(page)
    const reset = (await probe.boundingBox())!
    expect(Math.abs(reset.x - before.x)).toBeLessThan(2)
  })

  test('touch: the first tap reads a cell, the second opens it', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'coarse-pointer behaviour')
    await openHome(page)
    await expect(world(page)).toHaveAttribute('data-quality', 'reduced')
    const items = await apiItems(page)
    const id = await reachableItem(page, items, () => true)
    const p = await pointOn(page, id)

    await page.touchscreen.tap(p.x, p.y)
    const tip = page.getByRole('tooltip')
    await expect(tip).toBeVisible()
    await expect(tip).toContainText(id)
    await expect(tip.getByRole('link', { name: /open item/i })).toBeVisible()
    await expect(page).toHaveURL(/\/$/)

    await page.touchscreen.tap(p.x, p.y)
    await expect(page).toHaveURL(new RegExp(`/explore/${id}$`), { timeout: 45_000 })
  })

  test('the story drives the board, and its marks choose the system', async ({ page }) => {
    await openHome(page)
    const items = await apiItems(page)
    const cwOf = (system: string) => items.filter((it) => it.results[system].outcome === 'confidently_wrong').length
    await expect(world(page)).toHaveAttribute('data-lit', String(items.length))

    // reading the CWR section leaves only the confidently-wrong cells lit
    const section = page.locator('section.cwr')
    await section.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await expect(world(page)).toHaveAttribute('data-lit', String(cwOf(LEADER)))

    // each system on the axis is a button: press one and the whole page follows
    const mark = section.getByRole('button', { name: /^bm25_retrieval/ })
    await mark.focus()
    await page.keyboard.press('Enter')
    await expect(mark).toHaveAttribute('aria-pressed', 'true')
    await expect(world(page)).toHaveAttribute('data-system', 'bm25_retrieval')
    await expect(world(page)).toHaveAttribute('data-lit', String(cwOf('bm25_retrieval')))

    // back at the top the board shows everything again, for the system just chosen
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(world(page)).toHaveAttribute('data-lit', String(items.length))
    await expect(page.getByRole('radio', { name: /bm25_retrieval/ })).toHaveAttribute('aria-checked', 'true')
  })
})

/* ------------------------------------------- the board behind the other pages */

test.describe('the board mirrors the page in front of it', () => {
  test('leaderboard: the row under the pointer, or holding focus, is the system shown', async ({ page }, testInfo) => {
    await open(page, '/leaderboard')
    await expect(world(page)).toHaveAttribute('data-system', LEADER)

    if (testInfo.project.name !== 'mobile') {
      const row = page.locator('tr.lb-row[data-system="always_answer"]')
      const box = (await row.boundingBox())!
      await page.mouse.move(box.x + 40, box.y + box.height / 2, { steps: 4 })
      await expect(world(page)).toHaveAttribute('data-system', 'always_answer')
      await page.mouse.move(box.x + 40, 4, { steps: 4 })
      await expect(world(page)).toHaveAttribute('data-system', LEADER)
    }

    // keyboard: focus a row's link
    await page.locator('tr.lb-row[data-system="bm25_retrieval"]').getByRole('link', { name: 'bm25_retrieval' }).focus()
    await expect(world(page)).toHaveAttribute('data-system', 'bm25_retrieval')
    // opening a row's details keeps its system on the board after focus moves on
    await page.locator('tr.lb-row[data-system="bm25_retrieval"]').getByRole('button', { name: /details/ }).focus()
    await page.keyboard.press('Enter')
    await page.locator('body').click({ position: { x: 4, y: 4 } })
    await expect(world(page)).toHaveAttribute('data-system', 'bm25_retrieval')
  })

  test('compare: system A is shown and exactly the disagreements are lit', async ({ page }, testInfo) => {
    await open(page, '/compare?a=agent_llm&b=bm25_retrieval')
    const items = await apiItems(page)
    const differ = items.filter((it) => it.results.agent_llm.outcome !== it.results.bm25_retrieval.outcome)
    await expect(world(page)).toHaveAttribute('data-system', 'agent_llm')
    await expect(world(page)).toHaveAttribute('data-lit', String(differ.length))

    await page.getByRole('radio', { name: /bm25_retrieval right, agent_llm not/ }).focus()
    await page.keyboard.press('Space')
    const status = page.getByRole('status').filter({ hasText: /^Showing/ })
    const shown = Number((await status.textContent())!.match(/Showing (\d+)/)![1])
    await expect(world(page)).toHaveAttribute('data-lit', String(shown))

    if (testInfo.project.name !== 'mobile') {
      // pointing at a listed item singles its cell out; pointing at B's side shows B
      const first = page.locator('ul li', { has: page.getByRole('link', { name: /^gb-/ }) }).first()
      const id = (await first.getByRole('link', { name: /^gb-/ }).textContent())!.trim()
      await first.scrollIntoViewIfNeeded()
      const box = (await first.boundingBox())!
      await page.mouse.move(box.x + 12, box.y + 12, { steps: 4 })
      await expect(world(page)).toHaveAttribute('data-focus', id)
      const sideB = first.getByText('bm25_retrieval', { exact: true })
      const sb = (await sideB.boundingBox())!
      await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2, { steps: 4 })
      await expect(world(page)).toHaveAttribute('data-system', 'bm25_retrieval')
    }
  })

  test('explore: the filter lights its items; an item page singles its cell out', async ({ page }, testInfo) => {
    await open(page, '/explore')
    const items = await apiItems(page)
    await expect(world(page)).toHaveAttribute('data-lit', String(items.length))

    const browser = page.getByRole('search', { name: 'Filter items' })
    await choose(browser.getByLabel('Split', { exact: true }), 'contradiction')
    await expect(world(page)).toHaveAttribute('data-lit', String(items.filter((it) => it.split === 'contradiction').length))
    await expect(world(page)).toHaveAttribute('data-system', LEADER)

    // an outcome asked of "any system" is no single system's pattern: plain glass, matches lit
    await choose(browser.getByLabel('Outcome', { exact: true }), 'Confidently')
    await expect(world(page)).toHaveAttribute('data-system', 'none')
    await choose(browser.getByLabel('For system', { exact: true }), 'always_answer')
    await expect(world(page)).toHaveAttribute('data-system', 'always_answer')
    const expected = items.filter(
      (it) => it.split === 'contradiction' && it.results.always_answer.outcome === 'confidently_wrong',
    )
    await expect(world(page)).toHaveAttribute('data-lit', String(expected.length))

    if (testInfo.project.name !== 'mobile') {
      const link = page.getByRole('link', { name: expected[0].id })
      await link.scrollIntoViewIfNeeded()
      const box = (await link.boundingBox())!
      await page.mouse.move(box.x + 4, box.y + 4, { steps: 4 })
      await expect(world(page)).toHaveAttribute('data-focus', expected[0].id)
    }

    await open(page, `/explore/${expected[0].id}`)
    await expect(world(page)).toHaveAttribute('data-focus', expected[0].id)
    // focusing a system in "what each system did" shows that system
    await page
      .getByRole('list', { name: /each system’s outcome/i })
      .getByRole('link', { name: 'always_answer' })
      .focus()
    await expect(world(page)).toHaveAttribute('data-system', 'always_answer')
  })

  test('a system page shows that system; filtering its items lights them', async ({ page }) => {
    await open(page, '/systems/bm25_retrieval')
    const items = await apiItems(page)
    await expect(world(page)).toHaveAttribute('data-system', 'bm25_retrieval')
    const section = page.locator('section', { has: page.getByRole('heading', { name: 'Per-item outcomes' }) })
    await choose(section.getByLabel('Outcome', { exact: true }), 'Correct')
    await expect(world(page)).toHaveAttribute(
      'data-lit',
      String(items.filter((it) => it.results.bm25_retrieval.outcome === 'correct').length),
    )
  })
})

/* --------------------------------------------------------------- DOM controls */

test.describe('custom select', () => {
  test('works with a mouse, a keyboard and type-ahead, and closes cleanly', async ({ page }, testInfo) => {
    await open(page, '/explore')
    const select = page.getByRole('search', { name: 'Filter items' }).getByLabel('Split', { exact: true })
    await expect(select).toHaveAttribute('role', 'combobox')
    await expect(select).toHaveAttribute('data-value', 'all')

    // pointer: open, pick
    await select.click()
    const list = page.getByRole('listbox')
    await expect(list).toBeVisible()
    await expect(list.getByRole('option')).toHaveCount(5)
    await list.getByRole('option', { name: 'stale' }).click()
    await expect(list).toBeHidden()
    await expect(select).toHaveAttribute('data-value', 'stale')
    await expect(select).toHaveText(/stale/)
    await expect(page).toHaveURL(/split=stale/)

    // keyboard: open with ArrowDown, End, Enter
    await select.focus()
    await page.keyboard.press('ArrowDown')
    await expect(list).toBeVisible()
    await expect(list.getByRole('option', { name: 'stale' })).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await expect(select).toHaveAttribute('data-value', 'false_premise')
    await expect(select).toBeFocused()

    // Escape closes without changing anything
    await page.keyboard.press('Enter')
    await page.keyboard.press('Home')
    await page.keyboard.press('Escape')
    await expect(list).toBeHidden()
    await expect(select).toHaveAttribute('data-value', 'false_premise')

    // type-ahead on the closed control, like a native select
    await page.keyboard.press('c')
    await expect(select).toHaveAttribute('data-value', 'contradiction')

    // an outside press closes it
    await select.click()
    await expect(list).toBeVisible()
    if (testInfo.project.name === 'mobile') await page.touchscreen.tap(8, 300)
    else await page.mouse.click(8, 300)
    await expect(list).toBeHidden()
    await expect(select).toHaveAttribute('data-value', 'contradiction')
  })
})

test.describe('command palette and shortcuts', () => {
  test('opens from the keyboard, finds an item, and goes there', async ({ page }) => {
    await open(page, '/leaderboard')
    const dialog = page.getByRole('dialog', { name: /jump to/i })
    await expect(dialog).toBeHidden()

    await page.keyboard.press('Control+k')
    await expect(dialog).toBeVisible()
    const input = dialog.getByRole('combobox')
    await expect(input).toBeFocused()
    // nothing typed: pages and systems
    await expect(dialog.getByRole('option', { name: /^Leaderboard/ })).toBeVisible()
    await expect(dialog.getByRole('option', { name: /^agent_llm/ }).first()).toBeVisible()

    await page.keyboard.type('sneakers')
    const options = dialog.getByRole('option')
    await expect(options.first()).toContainText('gb-')
    await expect(dialog).toContainText('Where do I keep my old sneakers?')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowUp')
    const target = (await dialog.locator('[role="option"][aria-selected="true"]').getAttribute('data-entry'))!.replace(
      /^item:/,
      '',
    )
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/explore/${target}$`))
    await expect(dialog).toBeHidden()
  })

  test('Escape closes it and gives focus back; the nav button and "/" open it', async ({ page }) => {
    await open(page, '/systems')
    const dialog = page.getByRole('dialog', { name: /jump to/i })
    const button = page.locator('nav.site-nav').getByRole('button', { name: /search pages, systems and items/i })
    await button.click()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(button).toBeFocused()

    await page.locator('body').click({ position: { x: 4, y: 4 } })
    await page.keyboard.press('/')
    await expect(dialog).toBeVisible()
    // a system by name, then Enter
    await page.keyboard.type('bm25')
    await expect(dialog.locator('[role="option"][aria-selected="true"]')).toContainText('bm25_retrieval')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/systems\/bm25_retrieval$/)
  })

  test('g-then-letter goes to a page, t switches theme, and typing in a field is left alone', async ({ page }) => {
    await open(page, '/explore')
    await page.locator('body').click({ position: { x: 4, y: 4 } })
    const html = page.locator('html')
    const before = (await html.getAttribute('class'))!.includes('dark') ? 'dark' : 'light'
    await page.keyboard.press('t')
    await expect(html).toHaveClass(new RegExp(before === 'dark' ? 'light' : 'dark'))
    await page.keyboard.press('t')
    await expect(html).toHaveClass(new RegExp(before))

    // typing "g", "l", "t", "/" into the search box types; nothing navigates or opens
    const search = page.getByLabel('Search id or query text')
    await search.focus()
    await page.keyboard.type('glt/')
    await expect(search).toHaveValue('glt/')
    await expect(page).toHaveURL(/\/explore/)
    await expect(page.getByRole('dialog', { name: /jump to/i })).toBeHidden()
    await expect(html).toHaveClass(new RegExp(before))

    await page.locator('body').click({ position: { x: 4, y: 4 } })
    await page.keyboard.press('g')
    await page.keyboard.press('l')
    await expect(page).toHaveURL(/\/leaderboard$/)
  })
})

test('glass panels catch the light under the pointer', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'fine pointers only')
  await open(page, '/explore')
  const panel = page.locator('main .glass-panel').first()
  const box = (await panel.boundingBox())!
  await page.mouse.move(box.x + 120, box.y + 60, { steps: 5 })
  await expect.poll(() => panel.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--gx'))).toBe('120px')
  await expect.poll(() => panel.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--gy'))).toBe('60px')
  // and let go of it when the pointer leaves
  await page.mouse.move(box.x + 120, 2, { steps: 5 })
  await expect.poll(() => panel.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--gx'))).toBe('')
})

test('the datasheet has exactly one <h1>', async ({ page }) => {
  await page.goto('/datasheet')
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dataset card')
})

test('under reduced motion the board is a still and says so', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(world(page)).toHaveAttribute('data-quality', 'poster')
  await expect(page.locator('.world-root canvas')).toHaveCount(0)
  await expect(page.locator('[data-board-cell]')).toHaveCount(0)
  await expect(page.getByText(/motion is reduced, so the board is a still/i)).toBeVisible()
  // the controls still report the pipeline's numbers
  await page.getByRole('radio', { name: /always_answer/ }).click()
  await expect(page.getByLabel('always_answer: published results')).toContainText('0.698')
})
