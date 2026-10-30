# GlassBench — web

The Next.js site for GlassBench, live at <https://glassbench.buildwithbala.in>: the
story, the leaderboard, a page per system, an item explorer, a compare view, a submission
page with an in-browser `predictions.json` checker, and static JSON endpoints — around a
real-time WebGL board of glass cells, one per benchmark item, that shows each system's
actual per-item results. Co-equal light/dark.

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
`app/globals.css` owns the theme: smoked-glass surfaces on a cool near-black, one brand
accent — a very light, icy blue (`--accent`; `--cyan` is its historical alias) — and
`--good` / `--warn` / `--danger` with their `--tint-*`. On the light theme the accent
steps down to a darker blue of the same hue so text, links, focus rings and filled buttons
stay readable. `--danger` is the ember of a confidently-wrong cell. The platform routes
are styled with CSS Modules next to their components (`components/platform/ui.module.css`
holds the shared primitives) and use only those custom properties — no colour is
hard-coded, so a re-skin of `globals.css` carries over. Outcomes are never signalled by
colour alone: every badge has its own glyph and label.

## The board
`components/world/` draws a plate of glass cells, one per item, laid out like a lab plate
(96 items make 12 × 8) with the splits side by side. For the system being shown:

| On the board | Means (read from `item_results.json`) |
|---|---|
| height of a cell | the confidence the system stated for that item |
| clear glass, blue light inside | answered, correct |
| clear glass, a dull warm coal | answered, wrong, below the confident threshold |
| clear glass, burning | **confidently wrong** — the cells CWR counts |
| frosted glass, dark | abstained on an unanswerable item |
| frosted glass, a trace of blue behind the frost | abstained on an item that was answerable |

Nothing is computed: `lib/world-data.ts` reshapes the pipeline's outcomes and confidences
(no gold, no answer text) and the layout hands them to every page once.

- `plate.ts` — pure layout and the outcome → look vocabulary. `resolve.ts` — what a
  request means for this data (which system, which cells stay lit). Both unit-tested.
- `store.ts` — a small external store. Pages write what they want shown (`base`), a home
  story section may fill in a default (`story`), hover and focus add a `preview`; the scene
  reads it in its frame loop without re-rendering.
- `GlassScene.tsx`, `materials.ts`, `cellGeometry.ts` — the scene. Shells are real
  alpha-blended glass (far wall, then near wall, cells sorted far to near) over opaque
  light columns; frosted glass hides what is inside. Per-cell state lives in two tiny float
  textures the CPU eases, so the plate's shader can paint each cell's socket, shadow and
  pool of light. Bloom is built from three's own passes.
- `useSceneRoute.ts` — where the board sits per route: the hero's instrument on `/`, a
  smaller instrument beside the page head on the results pages, small in the margin on
  text-first pages.
- Tiers: `full` (desktop), `reduced` (coarse pointers: lighter geometry, no bloom, same
  interactions by touch and keyboard), `poster` (reduced motion / save-data: a still).

### What you can touch
- **Home** — pick a system (radio group) and all cells re-animate to its results; hover or
  focus a cell for its id, split, outcome and confidence; click (or Enter) to open
  `/explore/<id>`; legend chips keep one outcome or one split lit; drag, the view buttons
  or `[` `]` turn the board (bounded). Scrolling into the story moves the board beside it;
  the CWR section leaves only the confidently-wrong cells burning, and its marks, the
  split cards and the formula inputs are buttons for the same board.
- **Leaderboard / systems** — the row or card under the pointer (or holding focus) is the
  system shown; an open row keeps it.
- **Compare** — system A's results with only the disagreements lit; pointing at a listed
  item singles its cell out, pointing at B's side shows B.
- **Explore / item / system pages** — the filter's items stay lit; the current or hovered
  item's cell is singled out.
- **Everywhere** — `⌘K` / `Ctrl+K` / `/` opens the command palette (pages, systems, all
  items); `g` then a letter goes straight to a page; `t` switches theme; glass panels
  catch the light under the pointer; the selects are a custom listbox
  (`components/ui/Select.tsx`).

The canvas wrapper is `pointer-events:none` and never takes an event. Cells are reachable
because `components/board/BoardOverlay.tsx` lays one real `<a href="/explore/…">` over each
of them (the scene publishes their screen rectangles), below every in-flow panel. That is
also the keyboard path (one tab stop, arrow keys) and what the tests click.

For tests and debugging the world's root element carries `data-system`, `data-lit` and
`data-focus`, written from the same resolver the scene draws from.

The posters, the social card and the touch icon are screenshots of that scene. After
changing the board or its palette, regenerate them with the site running:
```bash
node scripts/capture-world.mjs   # public/poster-*.jpg, app/opengraph-image.jpg, app/apple-icon.png
```
The palette in `materials.ts` must track the tokens in `app/globals.css` (`--bg` in
particular, or the canvas shows a seam).

## Test
```bash
npm test                 # Vitest: data contracts, validator parity, formatting, markdown, API payloads
npx playwright test      # every route × light/dark × desktop (1440) / mobile (390), plus behaviour
                         # (board.spec.ts drives the board with real mouse, touch and keyboard input)
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
