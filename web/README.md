# GlassBench — web

The Next.js site for GlassBench, live at <https://glassbench.buildwithbala.in>: the
story, the leaderboard, a page per system, an item explorer, a compare view, a submission
page with an in-browser `predictions.json` checker, and static JSON endpoints — over a
full-WebGL refractive-glass world, co-equal light/dark.

It is presentation only. **The Python scorer is the single source of truth and the site
never computes a score.**

> Design spec: `../docs/superpowers/specs/2026-06-24-glassbench-nextjs-liquid-glass-redesign-design.md`
> Plan: `../docs/superpowers/plans/2026-06-24-glassbench-nextjs-liquid-glass-redesign.md`

## Stack
Next.js 15 (App Router) · React 19 · three.js + @react-three/fiber 9 (custom GLSL) ·
GSAP + Lenis · next-themes · Vitest · Playwright.

## Develop
```bash
npm ci --ignore-scripts    # nothing the site needs runs a dependency lifecycle script
npm run dev                # http://localhost:3200  (predev syncs data from the scorer pipeline)
```

## Data flow
```
submissions/*/predictions.json
        │  make leaderboard            (repo root — the frozen scorer, re-run)
        ▼
results/leaderboard.json   results/item_results.json   data/glassbench_v0.1.jsonl   DATASHEET.md
        │  node scripts/sync-data.mjs  (predev / prebuild — copies bytes, computes nothing)
        ▼
web/data/                  the committed snapshot the site is built from
        │  build time: lib/glassbench-data.ts · lib/results-data.ts · lib/items-data.ts
        ▼
static pages + static JSON endpoints
```

- `web/data/` is committed because the Docker build context is just `web/`: when the
  pipeline's files are not reachable, `sync-data.mjs` keeps the snapshot.
- `node scripts/sync-data.mjs --check` fails if the snapshot differs from the pipeline's
  output. CI runs it, so the deployed site cannot show a number the scorer did not write.
- After changing a submission run `make web-data` at the repo root and commit the result.
  Numbers are never hand-edited — not in `results/`, not in `web/data/`, not in a page.
- The loaders validate the shape of what they read and throw, so a pipeline change that
  would break a page fails the build and the unit tests instead.

`data/glassbench_v0.1.jsonl` holds gold answers. It is read with `fs` at build time by
server code only (`lib/items-data.ts`); client components receive trimmed shapes
(`ItemSummary`, `PublicItemResult`) with no gold, no history and no answer text.

## Routes
| Route | |
|---|---|
| `/` | the story |
| `/leaderboard` | the board; rows link to system pages |
| `/systems`, `/systems/[system]` | every metric (with tooltips), Glass Score decomposition, rank context, per-split breakdown, reproduce command, the rendered `system.md`, per-item outcomes |
| `/explore`, `/explore/[id]` | the items: filter by split / outcome / system, search; an item shows its history and every system's outcome. Item pages are `noindex` and reveal the gold answer only on request |
| `/compare?a=…&b=…` | two systems: metrics with deltas, and the items where they disagree |
| `/datasheet` | the dataset card, rendered from `DATASHEET.md` |
| `/submit` | the five steps + the in-browser `predictions.json` checker |
| `/data` | documentation for the JSON endpoints |
| `/api/leaderboard.json`, `/api/systems.json`, `/api/systems/[system].json`, `/api/items.json` | static, CORS-open JSON; no gold, no answer text |
| `/api/items/[id].json` | gold answer + evidence + answer texts for one item — what "reveal" fetches; `noindex`, disallowed in `robots.txt` |

Every page is statically generated (`next build` prints the list), so the standalone
server needs nothing but the build output. Filter and compare state lives in the query
string, which is why those two views render on the client inside a `Suspense` boundary.

## The predictions checker
`lib/validate-predictions.ts` is a TypeScript port of `../scripts/validate_submission.py`.
It validates; it does not score, and it must stay that way.

Parity is tested, not assumed: `../scripts/gen_validator_fixtures.py` runs the real
validator over a fixed set of files and writes `test/fixtures/validator-parity.json`;
`test/validate-predictions.test.ts` requires the port to return the same verdict and the
same `(code, row)` errors and warnings for every file. If you change a validator rule,
change the port and run `make fixtures` at the repo root.

## Styling
`app/globals.css` owns the theme: surfaces, the accent (`--cyan`), `--good` / `--warn` /
`--danger` and their `--tint-*`. The platform routes are styled with CSS Modules next to
their components (`components/platform/ui.module.css` holds the shared primitives) and
use only those custom properties — no colour is hard-coded, so a re-skin of `globals.css`
carries over. Outcomes are never signalled by colour alone: every badge has its own glyph
and label.

## Test
```bash
npm test                 # Vitest: data contracts, validator parity, formatting, markdown, API payloads
npx playwright test      # every route × light/dark × desktop (1440) / mobile (390), plus behaviour
```
Playwright starts `npm run dev` on port 3200, or reuses a server that is already there.
To use another port: `PLAYWRIGHT_PORT=3210 npx playwright test` (start nothing yourself,
or run `npx next dev -p 3210` / the production server on that port first). Screenshots of
every route land in `test/visual/__screens__/` (gitignored).

## Deploy (Coolify)
Node standalone via `Dockerfile` (build context = this `web/` dir). Serves on `:3200`.
Set `NEXT_PUBLIC_SITE_URL` to the real origin (drives canonical URLs, sitemap, robots,
JSON-LD and the URLs printed on `/data`). Deploys are triggered by Coolify's own webhook
on push; GitHub Actions only verifies (`.github/workflows/ci.yml`) and carries no deploy
step or token.
