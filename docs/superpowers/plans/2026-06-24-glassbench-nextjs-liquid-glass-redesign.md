# GlassBench Next.js Liquid-Glass Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Python static site with a Next.js multi-page app that renders a full-WebGL refractive-glass world behind co-equal light/dark themes, reading the scorer's `leaderboard.json` as the single source of truth.

**Architecture:** Next.js App Router (node runtime, Coolify) at `glassbench/web/`. One persistent `<Canvas>` (R3F + custom GLSL) in the root layout draws the glass world; all content is DOM in CSS `backdrop-filter` glass panels floating above it. Pure functions (data loader, color ramp, glass-score) are unit-tested with Vitest; visual surfaces are verified with Playwright screenshots in both themes × viewports.

**Tech Stack:** Next.js 15 (App Router), React 18, TypeScript, three.js + @react-three/fiber + @react-three/drei, GSAP, Lenis, next-themes, Vitest, Playwright.

## Global Constraints

- App lives at `glassbench/web/`; the old `site/` (`build_site.py`, `dist/`, `nginx.conf`) is retired only after parity-of-intent + deploy.
- The site performs **no scoring** in the browser and **never hand-types numbers** — all metrics come from `leaderboard.json` via `lib/glassbench-data.ts`.
- Data read at **build time** (RSC/`import`), not fetched at runtime.
- Themes are **co-equal**: every surface must pass WCAG AA contrast in both light and dark.
- WebGL is decorative: content stays **DOM** (selectable, accessible, indexable). LCP element = SSR'd hero headline, never a shader frame.
- Single `<Canvas>` with `eventSource` = wrapper div (not canvas) so DOM clicks are never eaten.
- Tiered fidelity: full scene (desktop) → reduced (mobile) → static poster (`prefers-reduced-motion` / `save-data`). Site fully usable at every tier.
- Routes: `/`, `/leaderboard`, `/datasheet`, `/submit`.
- Node runtime on Coolify (not static export).
- `npm install` needs `dangerouslyDisableSandbox` (no network in default Bash sandbox); clear `.next` after dep changes before restarting dev.
- Brand copy verbatim where reused: "does it know when it didn't?", "Confidently-Wrong Rate (CWR)", split counts (answerable 43 / stale 11 / contradiction 12 / false-premise 30), `n_items` 96.

---

## File Structure

```
glassbench/web/
  package.json, tsconfig.json, next.config.mjs, vitest.config.ts, Dockerfile, .dockerignore
  app/
    layout.tsx                 # root: providers, single <Canvas> world, nav, footer
    page.tsx                   # / story
    leaderboard/page.tsx       # /leaderboard
    datasheet/page.tsx         # /datasheet (MDX)
    submit/page.tsx            # /submit
    globals.css                # theme tokens (light/dark glass), CSS glass primitives
  components/
    theme/ThemeProvider.tsx, ThemeToggle.tsx
    world/GlassWorld.tsx       # <Canvas> wrapper, tiered fidelity, poster fallback
    world/GlassScene.tsx       # the R3F scene (camera, lights, glass slab)
    world/glassMaterial.ts     # custom GLSL ShaderMaterial (refraction/dispersion)
    world/useSceneRoute.ts     # GSAP morph of scene uniforms per route
    ui/GlassPanel.tsx          # reusable CSS backdrop-filter panel
    ui/Nav.tsx, ui/Footer.tsx, ui/CountUp.tsx, ui/CopyButton.tsx, ui/MetricTip.tsx
    leaderboard/LeaderboardTable.tsx, leaderboard/ReferenceScale.tsx
    story/Hero.tsx, story/CwrStrip.tsx, story/SplitMatrix.tsx,
    story/FormulaSchematic.tsx, story/ConfidenceDial.tsx
    motion/SmoothScroll.tsx    # Lenis provider
    motion/Reveal.tsx          # GSAP scroll reveal wrapper
  lib/
    glassbench-data.ts         # load + validate leaderboard.json → typed
    types.ts                   # Metric, RankedRow, ReferenceRow, LeaderboardData
    color-ramp.ts              # metric goodness → ramp color (respects direction)
    glass-score.ts             # dial math: pillars, HM, Glass, answer/abstain routing
    datasheet.ts               # parse DATASHEET.md → sections
  test/
    glassbench-data.test.ts, color-ramp.test.ts, glass-score.test.ts
  public/
    poster-dark.webp, poster-light.webp   # static scene fallbacks (generated in Phase 3)
```

Data source: `glassbench/site/dist/leaderboard.json` is copied to `web/data/leaderboard.json` by an npm `predev`/`prebuild` step so the web build never reaches outside its own dir at runtime, and the scorer pipeline is the only writer.

---

## Phase 0 — Scaffold

### Task 0.1: Create the Next.js app skeleton

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/next.config.mjs`, `web/.gitignore`, `web/app/layout.tsx`, `web/app/page.tsx`, `web/app/globals.css`

**Interfaces:**
- Produces: a dev server on `:3200` rendering a placeholder home page.

- [ ] **Step 1: Write `web/package.json`**

```json
{
  "name": "glassbench-web",
  "private": true,
  "scripts": {
    "predev": "node scripts/sync-data.mjs",
    "dev": "next dev -p 3200",
    "prebuild": "node scripts/sync-data.mjs",
    "build": "next build",
    "start": "next start -p 3200",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "^15.1.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "three": "^0.171.0",
    "@react-three/fiber": "^8.17.10",
    "@react-three/drei": "^9.117.3",
    "gsap": "^3.12.5",
    "lenis": "^1.1.18",
    "next-themes": "^0.4.4"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "@types/react": "^18.3.12",
    "@types/three": "^0.171.0",
    "@types/node": "^22.10.0",
    "vitest": "^2.1.8",
    "@playwright/test": "^1.49.0"
  }
}
```

- [ ] **Step 2: Write `scripts/sync-data.mjs`** (copies scorer output into the app)

```js
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
const src = resolve(process.cwd(), '../site/dist/leaderboard.json')
const dst = resolve(process.cwd(), 'data/leaderboard.json')
if (!existsSync(src)) { console.error('leaderboard.json not found at', src); process.exit(1) }
mkdirSync(dirname(dst), { recursive: true })
copyFileSync(src, dst)
console.log('synced leaderboard.json →', dst)
```

- [ ] **Step 3: Write `web/next.config.mjs`, `web/tsconfig.json`, `web/.gitignore`**

```js
// next.config.mjs
const nextConfig = { reactStrictMode: true, transpilePackages: ['three'] }
export default nextConfig
```
```json
// tsconfig.json
{ "compilerOptions": { "target": "ES2022", "lib": ["dom","dom.iterable","esnext"],
  "module": "esnext", "moduleResolution": "bundler", "jsx": "preserve",
  "strict": true, "noEmit": true, "esModuleInterop": true, "resolveJsonModule": true,
  "incremental": true, "skipLibCheck": true, "plugins": [{ "name": "next" }],
  "paths": { "@/*": ["./*"] } },
  "include": ["next-env.d.ts","**/*.ts","**/*.tsx",".next/types/**/*.ts"],
  "exclude": ["node_modules"] }
```
`.gitignore`: `node_modules/`, `.next/`, `data/leaderboard.json`, `next-env.d.ts`

- [ ] **Step 4: Write minimal `app/layout.tsx`, `app/page.tsx`, `app/globals.css`**

```tsx
// app/layout.tsx
import './globals.css'
export const metadata = { title: 'GlassBench', description: 'Does it know when it didn’t?' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en" suppressHydrationWarning><body>{children}</body></html>)
}
```
```tsx
// app/page.tsx
export default function Home() { return <main><h1>GlassBench</h1></main> }
```
`globals.css`: CSS reset + `:root { color-scheme: light dark }` placeholder.

- [ ] **Step 5: Install deps and run dev**

Run (sandbox disabled): `cd web && npm install`
Then: `rm -rf .next && npm run dev`
Expected: dev server on `http://localhost:3200`, page shows "GlassBench".

- [ ] **Step 6: Commit**

```bash
git add web/package.json web/tsconfig.json web/next.config.mjs web/.gitignore web/scripts/sync-data.mjs web/app web/.gitignore
git commit -m "feat(web): scaffold Next.js app at glassbench/web"
```

---

## Phase 1 — Data layer (TDD)

### Task 1.1: Types + data loader

**Files:**
- Create: `web/lib/types.ts`, `web/lib/glassbench-data.ts`, `web/vitest.config.ts`
- Test: `web/test/glassbench-data.test.ts`

**Interfaces:**
- Produces:
  - `type Metric = { key: string; label: string; direction: 'higher'|'lower'; scored: boolean; primary?: boolean; headline?: boolean; diagnostic?: boolean; tooltip: string }`
  - `type RankedRow = { rank: number; system: string; glass_score: number; cwr: number; aurc_norm: number; abst_rec_contradiction: number; abst_rec_false_premise: number; ece: number; brier: number; answerable_accuracy: number; answered: number; abstained: number; type: string; description: string; reproduce: string; [k: string]: unknown }`
  - `type ReferenceRow = RankedRow & { what_it_is: string; excluded_reason: string }`
  - `type LeaderboardData = { benchmark: string; version: string; n_items: number; split_counts: { answerable: number; stale: number; contradiction: number; false_premise: number }; primary_metric: string; headline_metric: string; glass_score_formula: string; sort: 'asc'|'desc'; metrics: Metric[]; ranked: RankedRow[]; references: ReferenceRow[] }`
  - `getLeaderboard(): LeaderboardData` — loads `data/leaderboard.json`, throws if a required key is missing.

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node', include: ['test/**/*.test.ts'] } })
```

- [ ] **Step 2: Write the failing test** (`test/glassbench-data.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { getLeaderboard } from '../lib/glassbench-data'

describe('getLeaderboard', () => {
  it('loads the real scorer output with expected invariants', () => {
    const d = getLeaderboard()
    expect(d.benchmark).toBe('GlassBench')
    expect(d.n_items).toBe(96)
    expect(d.split_counts).toEqual({ answerable: 43, stale: 11, contradiction: 12, false_premise: 30 })
    expect(d.ranked.length).toBeGreaterThan(0)
    expect(d.ranked[0].rank).toBe(1)
    expect(d.metrics.find(m => m.headline)?.key).toBe('cwr')
  })
  it('throws if a required key is missing', () => {
    expect(() => (require('../lib/glassbench-data') as any).validate({})).toThrow()
  })
})
```

- [ ] **Step 3: Run test, verify it fails** — `cd web && npx vitest run test/glassbench-data.test.ts` → FAIL (module/exports missing). First run `node scripts/sync-data.mjs` so `data/leaderboard.json` exists.

- [ ] **Step 4: Implement `lib/types.ts` and `lib/glassbench-data.ts`**

```ts
// lib/glassbench-data.ts
import raw from '../data/leaderboard.json'
import type { LeaderboardData } from './types'
const REQUIRED = ['benchmark','version','n_items','split_counts','metrics','ranked','references','headline_metric','primary_metric'] as const
export function validate(d: any): LeaderboardData {
  for (const k of REQUIRED) if (!(k in d)) throw new Error(`leaderboard.json missing "${k}"`)
  if (!Array.isArray(d.ranked) || !Array.isArray(d.metrics)) throw new Error('ranked/metrics must be arrays')
  return d as LeaderboardData
}
export function getLeaderboard(): LeaderboardData { return validate(raw) }
```

- [ ] **Step 5: Run test, verify pass** — `npx vitest run` → PASS.

- [ ] **Step 6: Commit** — `git add web/lib web/test web/vitest.config.ts && git commit -m "feat(web): typed leaderboard data loader (TDD)"`

### Task 1.2: Color ramp (TDD)

**Files:** Create `web/lib/color-ramp.ts`; Test `web/test/color-ramp.test.ts`

**Interfaces:**
- Produces: `goodness(value: number, metric: Pick<Metric,'direction'>, range: [number,number]): number` (0..1, 1=best) and `rampTint(goodness: number): 'good'|'warn'|'danger'` (≥0.66 good, ≥0.33 warn, else danger — matches current app.js).

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest'
import { goodness, rampTint } from '../lib/color-ramp'
describe('color ramp', () => {
  it('lower-is-better inverts', () => { expect(goodness(0, { direction:'lower' }, [0,1])).toBe(1); expect(goodness(1, { direction:'lower' }, [0,1])).toBe(0) })
  it('higher-is-better keeps', () => { expect(goodness(1, { direction:'higher' }, [0,1])).toBe(1) })
  it('tiers', () => { expect(rampTint(0.9)).toBe('good'); expect(rampTint(0.5)).toBe('warn'); expect(rampTint(0.1)).toBe('danger') })
})
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**

```ts
// lib/color-ramp.ts
export function goodness(value: number, metric: { direction: 'higher'|'lower' }, range: [number,number]): number {
  const [lo, hi] = range; const t = hi === lo ? 0 : (value - lo) / (hi - lo)
  const c = Math.min(1, Math.max(0, t)); return metric.direction === 'lower' ? 1 - c : c
}
export function rampTint(g: number): 'good'|'warn'|'danger' { return g >= 0.66 ? 'good' : g >= 0.33 ? 'warn' : 'danger' }
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(web): metric color ramp (TDD)`

### Task 1.3: Glass-score / dial math (TDD)

**Files:** Create `web/lib/glass-score.ts`; Test `web/test/glass-score.test.ts`

**Interfaces:**
- Produces: `glassScore({ answerableAccuracy, abstRecContra, abstRecFp, cwr }): number` and `dialOutcome(confidence: number): { glass: number; explain: string }` proving the spec's claim — any single fixed confidence yields Glass 0 (≥0.5 → safety pillar 0; <0.5 → answer pillar 0).

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest'
import { glassScore, dialOutcome } from '../lib/glass-score'
describe('glass score', () => {
  it('harmonic mean is zero if a pillar is zero', () => { expect(glassScore({ answerableAccuracy:0.9, abstRecContra:0, abstRecFp:0, cwr:0 })).toBe(0) })
  it('every fixed confidence games to 0', () => { for (const c of [0.49,0.6,0.69,0.0,1.0]) expect(dialOutcome(c).glass).toBeCloseTo(0, 6) })
})
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**

```ts
// lib/glass-score.ts
export function glassScore(p: { answerableAccuracy:number; abstRecContra:number; abstRecFp:number; cwr:number }): number {
  const A = p.answerableAccuracy, S = (p.abstRecContra + p.abstRecFp) / 2
  const HM = (A + S) === 0 ? 0 : (2*A*S)/(A+S)
  return 100 * HM * (1 - p.cwr)
}
// A single fixed confidence applies one answer/abstain decision to every item.
export function dialOutcome(confidence: number): { glass:number; explain:string } {
  if (confidence >= 0.5) return { glass: glassScore({ answerableAccuracy:0.5, abstRecContra:0, abstRecFp:0, cwr:0.7 }), explain:'answers everything → safety pillar = 0 → Glass 0.00' }
  return { glass: glassScore({ answerableAccuracy:0, abstRecContra:1, abstRecFp:1, cwr:0 }), explain:'abstains everywhere → answer pillar = 0 → Glass 0.00' }
}
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(web): glass-score + dial math (TDD)`

---

## Phase 2 — Theme system + glass primitives

### Task 2.1: Theme tokens + provider + toggle

**Files:** Create `web/components/theme/ThemeProvider.tsx`, `web/components/theme/ThemeToggle.tsx`; Modify `web/app/layout.tsx`, `web/app/globals.css`

**Interfaces:**
- Produces: `<ThemeProvider>` (wraps next-themes, `attribute="class"`, `defaultTheme="dark"`, `enableSystem`) and `<ThemeToggle/>`. CSS exposes glass tokens per theme.

- [ ] **Step 1: ThemeProvider** — wrap `next-themes` `ThemeProvider` with `attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange={false}`.
- [ ] **Step 2: Theme tokens in `globals.css`** — define both palettes:

```css
:root, .light {
  --bg: #eef2f7; --ink: #16202c; --muted:#52677e; --border: rgba(22,32,44,.14);
  --glass-bg: rgba(255,255,255,.55); --glass-blur: 18px; --glass-spec: rgba(255,255,255,.85);
  --cyan:#1f9bc2; --good:#1f9d57; --warn:#c97a17; --danger:#c8324a;
}
.dark {
  --bg:#0c0f14; --ink:#e7ecf3; --muted:#9fb0c3; --border: rgba(36,48,64,.55);
  --glass-bg: rgba(17,22,31,.45); --glass-blur: 16px; --glass-spec: rgba(120,180,220,.25);
  --cyan:#57c7e3; --good:#8fe3a8; --warn:#f0a868; --danger:#e3576b;
}
html,body{ background:var(--bg); color:var(--ink); }
```

- [ ] **Step 3: `GlassPanel.tsx`** primitive:

```tsx
// components/ui/GlassPanel.tsx
export function GlassPanel({ children, className='' }: { children: React.ReactNode; className?: string }) {
  return <div className={`glass-panel ${className}`}>{children}</div>
}
```
```css
.glass-panel{ background:var(--glass-bg); -webkit-backdrop-filter:blur(var(--glass-blur)) saturate(1.3);
  backdrop-filter:blur(var(--glass-blur)) saturate(1.3); border:1px solid var(--border); border-radius:16px;
  box-shadow: inset 0 1px 0 var(--glass-spec), 0 12px 40px rgba(0,0,0,.18); }
```

- [ ] **Step 4: Verify** — `npm run dev`, toggle theme, confirm panel + tokens swap. Playwright screenshot both themes (`test/visual` set up in Phase 9; here just eyeball).
- [ ] **Step 5: Commit** `feat(web): co-equal light/dark glass theme tokens + panel primitive`

---

## Phase 3 — The WebGL glass world

### Task 3.1: Single Canvas + custom GLSL refraction material + tiered fidelity

**Files:** Create `web/components/world/GlassWorld.tsx`, `web/components/world/GlassScene.tsx`, `web/components/world/glassMaterial.ts`, `web/components/world/useSceneRoute.ts`; Modify `app/layout.tsx`

**Interfaces:**
- Consumes: theme (via `next-themes` `useTheme`).
- Produces: `<GlassWorld/>` mounted once in layout behind content; exposes a `theme` + `cloudiness` uniform; `useSceneRoute()` morphs uniforms on `usePathname()` change via GSAP.

- [ ] **Step 1: `glassMaterial.ts`** — a real `ShaderMaterial` with vertex displacement + fresnel + chromatic-dispersion refraction sampling an env/gradient, uniforms `{ uTime, uTheme (0 dark/1 light), uCloud (0 clear..1 cloudy), uResolution }`. (Provide full GLSL: vertex with subtle flow noise; fragment doing fresnel rim + RGB-split refraction + cloudiness mix.)
- [ ] **Step 2: `GlassScene.tsx`** — R3F: perspective camera, two lights, a large rounded glass slab (or instanced shards) using `glassMaterial`; `useFrame` updates `uTime`; guard every per-frame accessor (no per-frame allocs; no throwing accessors — per our labs gotcha). Drive `uTheme` from `useTheme`.
- [ ] **Step 3: `GlassWorld.tsx`** — wrapper `<div ref>` fixed full-viewport behind content; `<Canvas eventSource={wrapperRef} eventPrefix="client" dpr={[1,1.75]} gl={{ antialias:true, alpha:true }}>`. Tiered fidelity: detect `matchMedia('(pointer:coarse)')` / `navigator.connection?.saveData` → lower segment counts; `prefers-reduced-motion` or `saveData` → render `<img>` poster (`/poster-{theme}.webp`) instead of `<Canvas>`.
- [ ] **Step 4: Mount in `layout.tsx`** behind a content wrapper with higher `z-index`. Confirm DOM above is clickable (real-mouse Playwright click in Phase 9; eyeball now).
- [ ] **Step 5: Generate posters** — script that loads each theme, screenshots the canvas to `public/poster-dark.webp` / `poster-light.webp` (Playwright). Commit the images.
- [ ] **Step 6: `useSceneRoute.ts`** — on `usePathname()` change, GSAP-tween camera position + `uCloud` to a per-route target (`/` storyline goes cloudy→clear; `/leaderboard` settles clear). Wire into `GlassScene`.
- [ ] **Step 7: Verify + Commit** — `npm run dev`, navigate routes, confirm world morphs and content stays sharp/clickable. `feat(web): full-WebGL refractive glass world w/ tiered fidelity + route morph`

---

## Phase 4 — Shell: nav, footer, motion

### Task 4.1: Glass nav + footer + Lenis + reveal

**Files:** Create `web/components/ui/Nav.tsx`, `web/components/ui/Footer.tsx`, `web/components/motion/SmoothScroll.tsx`, `web/components/motion/Reveal.tsx`, `web/components/ui/CountUp.tsx`, `web/components/ui/CopyButton.tsx`, `web/components/ui/MetricTip.tsx`; Modify `app/layout.tsx`

- [ ] **Step 1:** `Nav.tsx` — glass top bar: brand `Glass<span>Bench</span>_`, links to `/ /leaderboard /datasheet /submit` + GitHub, `<ThemeToggle/>`, `aria-current` on active route (`usePathname`).
- [ ] **Step 2:** `SmoothScroll.tsx` — Lenis (skip on touch / reduced-motion per portfolio pattern), `gsap.ticker` integration; client component wrapping `{children}`.
- [ ] **Step 3:** `Reveal.tsx` — GSAP ScrollTrigger fade/translate on enter; `data-reveal` safety reveal after 3.5s; honor reduced-motion (reveal immediately).
- [ ] **Step 4:** `CountUp.tsx` (port the count-up easing from `app.js`), `CopyButton.tsx` (clipboard + "copied" state), `MetricTip.tsx` (accessible tooltip from `Metric.tooltip`).
- [ ] **Step 5:** Compose in `layout.tsx`: `ThemeProvider > SmoothScroll > GlassWorld + (Nav, content, Footer)`.
- [ ] **Step 6: Verify + Commit** `feat(web): glass nav/footer + Lenis smooth-scroll + reveal/countup/copy primitives`

---

## Phase 5 — Leaderboard (centerpiece)

### Task 5.1: LeaderboardTable + ReferenceScale

**Files:** Create `web/app/leaderboard/page.tsx`, `web/components/leaderboard/LeaderboardTable.tsx`, `web/components/leaderboard/ReferenceScale.tsx`

**Interfaces:** Consumes `getLeaderboard()`, `goodness`/`rampTint`, `MetricTip`, `CountUp`.

- [ ] **Step 1:** `page.tsx` (RSC) reads `getLeaderboard()`, passes `ranked`, `metrics`, `references` to a client `LeaderboardTable`.
- [ ] **Step 2:** `LeaderboardTable.tsx` — glass-card rows; columns from `metrics.filter(m=>m.scored)`; each cell tinted via `goodness(value, metric, metric.range) → rampTint` mapped to glass tint vars; headline CWR column emphasized; metric headers show `MetricTip`. Sortable by clicking a metric header (respect `direction`). Glass-score count-up on reveal. Expand-row shows `type`/`description`/`reproduce` (with `CopyButton`).
- [ ] **Step 3:** `ReferenceScale.tsx` — render `references[]` (oracle 99.07, constructed) in a visually distinct "reference scale — not ranked" zone with `what_it_is` + `excluded_reason`.
- [ ] **Step 4: Verify** — numbers match `leaderboard.json` exactly (`agent_llm` rank 1, glass 54.34, cwr 0.062). Screenshot both themes.
- [ ] **Step 5: Commit** `feat(web): liquid-glass leaderboard from scorer data`

---

## Phase 6 — Story page (`/`)

### Task 6.1: Hero + CWR strip + splits + formula + dial + CTA

**Files:** Create `web/app/page.tsx`, `web/components/story/{Hero,CwrStrip,SplitMatrix,FormulaSchematic,ConfidenceDial}.tsx`

**Interfaces:** Consumes `getLeaderboard()`, `dialOutcome`, `CountUp`, `Reveal`.

- [ ] **Step 1:** `Hero.tsx` — SSR'd `<h1>` thesis ("does it know when it didn't?") = LCP element; 3 count-up stats (Glass leader = `ranked[0].glass_score`, best CWR = `min(ranked.cwr)`, items = `n_items`); CTAs to `/leaderboard` + `/submit`.
- [ ] **Step 2:** `CwrStrip.tsx` — plot every `ranked` system on a 0.000→0.700 glass track by `cwr` (lower=left=better), tick labels = system + value, tint by `rampTint`. Data-driven from `ranked`.
- [ ] **Step 3:** `SplitMatrix.tsx` — answerable 43 / stale 11 / contradiction 12 / false-premise 30 from `split_counts`; worked-example card (gb-contradiction/gb-stale).
- [ ] **Step 4:** `FormulaSchematic.tsx` — two pillars → HM junction → ×(1−CWR); render `glass_score_formula` text from data; the formula `<pre>`.
- [ ] **Step 5:** `ConfidenceDial.tsx` (client) — SVG glass dial + range input; on change call `dialOutcome(conf)` → show Glass (always 0.00) + explain; presets (abstain/answer/fixed); `<noscript>` fallback table.
- [ ] **Step 6: Verify + Commit** — screenshot both themes; confirm dial proves the thesis. `feat(web): story page — hero, CWR strip, splits, formula, confidence dial`

---

## Phase 7 — Datasheet + Submit

### Task 7.1: Datasheet (MDX from DATASHEET.md)

**Files:** Create `web/app/datasheet/page.tsx`, `web/lib/datasheet.ts`; add `@next/mdx` or render markdown.

- [ ] **Step 1:** `datasheet.ts` reads `../DATASHEET.md` at build (copied via `sync-data.mjs`), returns HTML/sections.
- [ ] **Step 2:** `page.tsx` renders it as glass long-form (typographic glass panels, in-page TOC).
- [ ] **Step 3: Verify + Commit** `feat(web): datasheet page from DATASHEET.md`

### Task 7.2: Submit methodology

**Files:** Create `web/app/submit/page.tsx`

- [ ] **Step 1:** 5 steps (`build_data` → predictions → validate → score → PR) each with `CopyButton` for the command; BibTeX cite block with copy; cite credit (LongMemEval, MIT).
- [ ] **Step 2: Verify + Commit** `feat(web): submit/methodology page with copy + BibTeX`

---

## Phase 8 — Polish

### Task 8.1: Route-transition choreography + SEO/meta

**Files:** Modify `app/layout.tsx` (per-route `metadata`), `useSceneRoute.ts`; add `app/sitemap.ts`, `app/robots.ts`, `Person`/`Dataset` JSON-LD.

- [ ] **Step 1:** Per-route `metadata` (title/description/OG); add a real OG image; `sitemap.ts` lists all 4 routes; `robots.ts`. Add `Dataset` + `SoftwareSourceCode` JSON-LD for the benchmark (entity/AEO).
- [ ] **Step 2:** Tighten GSAP route morph timing + Lenis feel; ensure reduced-motion path is clean.
- [ ] **Step 3: Commit** `feat(web): route choreography + SEO/JSON-LD/sitemap`

---

## Phase 9 — Verification + deploy

### Task 9.1: Playwright visual + click matrix

**Files:** Create `web/playwright.config.ts`, `web/test/visual/routes.spec.ts`

- [ ] **Step 1:** Playwright config (Chromium; desktop 1440 + mobile 390 viewports).
- [ ] **Step 2:** Spec: for each route × {light, dark} × {desktop, mobile} → navigate, wait for hero, screenshot to `test/visual/__screens__`. Plus a **real-mouse click** on a nav link and a leaderboard header to assert the canvas doesn't eat clicks (per R3F gotcha).
- [ ] **Step 3:** Run, eyeball all screenshots against the Awwwards bar; iterate on any that read flat/templated.
- [ ] **Step 4: Commit** `test(web): playwright visual + click matrix (light/dark × desktop/mobile)`

### Task 9.2: Perf gate + Dockerfile (Coolify)

**Files:** Create `web/Dockerfile`, `web/.dockerignore`

- [ ] **Step 1:** `next build` clean; run `npx lighthouse http://localhost:3200 --only-categories=performance,seo,best-practices,accessibility`. Gate: SEO ≥ 95, CWV green (poster tier covers low-power). Fix regressions.
- [ ] **Step 2:** Multi-stage `Dockerfile` (node build → `next start -p 3200`), `.dockerignore`. Document Coolify env + port.
- [ ] **Step 3: Commit** `chore(web): Dockerfile for Coolify node deploy + perf gate`

### Task 9.3: Retire old site

- [ ] **Step 1:** Once deployed and verified, remove `site/build_site.py`, `site/dist/`, `site/nginx.conf`, `site/README.md` (keep `leaderboard.json` generation in the scorer). Update root `README.md` site section to point at `web/`.
- [ ] **Step 2: Commit** `chore: retire Python static site in favor of Next.js web/`

---

## Self-Review

**Spec coverage:** §2 concept → 3.1/6.5 (cloudiness uniform + dial). §3 stack → Phase 0. §4 data flow → Phase 1 + sync-data. §5 pages → Phases 5,6,7. §6 theming → Phase 2. §7 guardrails → 3.1 tiering + DOM content + 9.1 click test. §8 testing → Phases 1,9. §9 YAGNI → respected (no scoring/CMS/auth). §10 migration → 9.3. All covered.

**Placeholder scan:** Pure-function tasks (1.1–1.3) carry full code/tests. Visual tasks (3,4,5,6) specify exact files, props, data bindings, and verification, with code for primitives; GLSL/scene bodies are described by responsibility + uniforms (acceptable: large shader/JSX written at implementation, verified visually) — not vague "add styling".

**Type consistency:** `Metric`, `RankedRow`, `ReferenceRow`, `LeaderboardData` defined in 1.1 and consumed unchanged in 5/6; `goodness`/`rampTint` (1.2) signatures match leaderboard usage; `glassScore`/`dialOutcome` (1.3) match the dial. `getLeaderboard()` is the single data entry used everywhere.
