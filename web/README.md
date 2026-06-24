# GlassBench — web

The Next.js liquid-glass site for GlassBench. A full-WebGL refractive-glass world
behind a multi-page app, co-equal light/dark, reading the scorer's `leaderboard.json`
as the single source of truth.

> Design spec: `../docs/superpowers/specs/2026-06-24-glassbench-nextjs-liquid-glass-redesign-design.md`
> Plan: `../docs/superpowers/plans/2026-06-24-glassbench-nextjs-liquid-glass-redesign.md`

## Stack
Next.js 15 (App Router) · React 19 · three.js + @react-three/fiber 9 (custom GLSL) ·
GSAP + Lenis · next-themes · Vitest · Playwright.

## Develop
```bash
npm install
npm run dev        # http://localhost:3200  (predev syncs data from the scorer)
```

## Data
The Python scorer is the source of truth. `scripts/sync-data.mjs` (run by
`predev`/`prebuild`) copies `../site/dist/leaderboard.json` and `../DATASHEET.md`
into `data/` — a committed snapshot so the Docker build is self-contained. When the
scorer dirs aren't present (e.g. a `web/`-context Docker build) it falls back to the
snapshot. Numbers are never hand-edited.

## Test
```bash
npm test                  # Vitest: data loader, color ramp, glass-score (12 tests)
npx playwright test       # 4 routes × light/dark × desktop/mobile + canvas-click (18)
```

## Routes
`/` story · `/leaderboard` the board · `/datasheet` · `/submit`.

## Deploy (Coolify)
Node standalone via `Dockerfile` (build context = this `web/` dir). Serves on `:3200`.
Set `NEXT_PUBLIC_SITE_URL` to the real origin (drives canonical URLs, sitemap, robots,
JSON-LD).
