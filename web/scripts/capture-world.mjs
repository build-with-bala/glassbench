// Regenerates every still that is derived from the live WebGL board:
//
//   public/poster-{dark,light}.jpg            landscape fallback (reduced motion / save-data)
//   public/poster-{dark,light}-portrait.jpg   the same, composed for phones
//   app/opengraph-image.jpg                   1200x630 social card (board + headline)
//   app/apple-icon.png                        180x180 touch icon, rasterised from app/icon.svg
//
// Usage: start the site (`npm run dev` or `npm run build && npm start`), then
//   node scripts/capture-world.mjs            (BASE_URL defaults to http://localhost:3200)
//
// The stills are screenshots of the real scene showing the leader's real results, so
// they can never drift from it.
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3200'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = (...p) => path.join(root, ...p)

// how long the entrance + glow take to settle before a frame is worth keeping
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 6000)

const HIDE_CHROME = `
  .content-root { visibility: hidden !important; }
  nextjs-portal { display: none !important; }
`

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

async function openWorld({ theme, width, height, scale = 2, free = false }) {
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
  // the social card has no control panels around the board, so it may frame it freely
  if (free) await page.addInitScript(() => (window.__boardFrame = 'free'))
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 60_000 })
  await page.addStyleTag({ content: HIDE_CHROME })
  await page.waitForTimeout(SETTLE_MS)
  return { context, page }
}

for (const theme of ['dark', 'light']) {
  {
    const { context, page } = await openWorld({ theme, width: 1600, height: 1000 })
    await page.screenshot({ path: out('public', `poster-${theme}.jpg`), type: 'jpeg', quality: 86, scale: 'css' })
    await context.close()
  }
  {
    const { context, page } = await openWorld({ theme, width: 390, height: 844 })
    await page.screenshot({ path: out('public', `poster-${theme}-portrait.jpg`), type: 'jpeg', quality: 86 })
    await context.close()
  }
  console.log(`posters: ${theme}`)
}

// ---- social card: the dark hero board with the mark and the headline -----------
// Laid out at 1600x840 and captured at 0.75x, which is exactly 1200x630: the board
// frames itself by viewport height, and at 630px tall it would be drawn too small.
{
  const { context, page } = await openWorld({ theme: 'dark', width: 1600, height: 840, scale: 0.75, free: true })
  await page.evaluate(() => {
    const card = document.createElement('div')
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:20px">
        <svg width="60" height="60" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="10.3" y="8.6" width="3.4" height="9.2" rx="1.7" fill="#a9d8ff"/>
          <path d="M6.6 19.6V9.4a5.4 5.4 0 0 1 10.8 0v10.2M3.8 20.2h16.4" fill="none" stroke="#f1f4f9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span style="font-size:45px;font-weight:600;letter-spacing:-0.035em">GlassBench</span>
      </div>
      <div>
        <div style="font-size:124px;font-weight:540;line-height:0.93;letter-spacing:-0.055em;max-width:700px;text-wrap:balance">Does it know when it didn’t?</div>
        <div style="margin-top:34px;font-size:31px;line-height:1.35;letter-spacing:-0.01em;color:#a2abbb;max-width:640px">The benchmark for whether an LLM memory system knows when it doesn’t know.</div>
      </div>`
    Object.assign(card.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '50',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '74px 84px 72px',
      color: '#f1f4f9',
      fontFamily: 'var(--font-sans), system-ui, sans-serif',
    })
    document.body.appendChild(card)
  })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  await page.screenshot({ path: out('app', 'opengraph-image.jpg'), type: 'jpeg', quality: 90 })
  await context.close()
  console.log('opengraph-image')
}

// ---- touch icon, rasterised from the SVG so the two never disagree -------------
{
  const svg = await readFile(out('app', 'icon.svg'), 'utf8')
  const context = await browser.newContext({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  // iOS masks the corners itself, so the touch icon is drawn full-bleed
  const fullBleed = svg.replace(/rx="15"/, 'rx="0"')
  await page.setContent(
    `<style>html,body{margin:0;background:#0b0d12}svg{display:block;width:180px;height:180px}</style>${fullBleed}`,
  )
  const png = await page.screenshot({ type: 'png' })
  await writeFile(out('app', 'apple-icon.png'), png)
  await context.close()
  console.log('apple-icon')
}

await browser.close()
