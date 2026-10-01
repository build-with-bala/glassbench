// Regenerates every still that is derived from the live WebGL world:
//
//   public/poster-{dark,light}.jpg            landscape fallback (reduced motion / save-data)
//   public/poster-{dark,light}-portrait.jpg   the same, composed for phones
//   app/opengraph-image.jpg                   1200x630 social card (scene + headline)
//   app/apple-icon.png                        180x180 touch icon, rasterised from app/icon.svg
//
// Usage: start the site (`npm run dev` or `npm run build && npm start`), then
//   node scripts/capture-world.mjs            (BASE_URL defaults to http://localhost:3200)
//
// The stills are screenshots of the real scene, so they can never drift from it.
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3200'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = (...p) => path.join(root, ...p)

// how long the entrance + glow take to settle before a frame is worth keeping
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 7000)

const HIDE_CHROME = `
  .content-root { visibility: hidden !important; }
  nextjs-portal { display: none !important; }
`

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

async function openWorld({ theme, width, height, scale = 2 }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale })
  const page = await context.newPage()
  // headless Chromium reports reduced motion, which would show the poster itself
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('theme', t)
    } catch {
      /* ignore */
    }
  }, theme)
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 60_000 })
  await page.addStyleTag({ content: HIDE_CHROME })
  await page.waitForTimeout(SETTLE_MS)
  return { context, page }
}

for (const theme of ['dark', 'light']) {
  {
    const { context, page } = await openWorld({ theme, width: 1600, height: 1000 })
    await page.screenshot({ path: out('public', `poster-${theme}.jpg`), type: 'jpeg', quality: 84, scale: 'css' })
    await context.close()
  }
  {
    const { context, page } = await openWorld({ theme, width: 390, height: 844 })
    await page.screenshot({ path: out('public', `poster-${theme}-portrait.jpg`), type: 'jpeg', quality: 84 })
    await context.close()
  }
  console.log(`posters: ${theme}`)
}

// ---- social card: the dark hero scene with the mark and the headline -----------
{
  const { context, page } = await openWorld({ theme: 'dark', width: 1200, height: 630 })
  await page.evaluate(() => {
    const card = document.createElement('div')
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:16px">
        <svg width="46" height="46" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.1 14.6l6.3 3.65a3.2 3.2 0 0 0 3.2 0l6.3-3.65" fill="none" stroke="#f4f5ef" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M10.4 3.2a3.2 3.2 0 0 1 3.2 0l6.5 3.75c1.2.7 1.2 2.4 0 3.1l-6.5 3.75a3.2 3.2 0 0 1-3.2 0L3.9 10.05c-1.2-.7-1.2-2.4 0-3.1z" fill="#d3ea52"/>
        </svg>
        <span style="font-size:34px;font-weight:600;letter-spacing:-0.035em">GlassBench</span>
      </div>
      <div>
        <div style="font-size:104px;font-weight:540;line-height:0.93;letter-spacing:-0.055em;max-width:560px;text-wrap:balance">Does it know when it didn’t?</div>
        <div style="margin-top:26px;font-size:24px;line-height:1.35;letter-spacing:-0.01em;color:#a5a99a;max-width:500px">The benchmark for whether an LLM memory system knows when it doesn’t know.</div>
      </div>`
    Object.assign(card.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '50',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '56px 64px 54px',
      color: '#f4f5ef',
      fontFamily: 'var(--font-sans), system-ui, sans-serif',
    })
    document.body.appendChild(card)
  })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  await page.screenshot({ path: out('app', 'opengraph-image.jpg'), type: 'jpeg', quality: 90, scale: 'css' })
  await context.close()
  console.log('opengraph-image')
}

// ---- touch icon, rasterised from the SVG so the two never disagree -------------
{
  const svg = await readFile(out('app', 'icon.svg'), 'utf8')
  const context = await browser.newContext({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  // iOS masks the corners itself, so the touch icon is drawn full-bleed
  const fullBleed = svg.replace(/rx="[^"]*"/, 'rx="0"')
  await page.setContent(
    `<style>html,body{margin:0;background:#0f100e}svg{display:block;width:180px;height:180px}</style>${fullBleed}`,
  )
  const png = await page.screenshot({ type: 'png' })
  await writeFile(out('app', 'apple-icon.png'), png)
  await context.close()
  console.log('apple-icon')
}

await browser.close()
