# GlassBench — Next.js Liquid-Glass Redesign (Design Spec)

**Date:** 2026-06-24
**Status:** Approved design, pre-implementation
**Branch:** `feat/site-rebuild-instrument`
**Supersedes:** `site/build_site.py` (Python static-site generator) and `site/dist/`

---

## 1. Goal

Replace the hand-rolled Python static site with a **Next.js (App Router) multi-page
app** that re-imagines GlassBench around a **full-WebGL liquid-glass world**, in
**co-equal light and dark themes**, while keeping the Python scorer as the single
source of truth for every number.

This is a **redesign, not a port**: layout and sections are rethought from scratch.
Only the *data* (`leaderboard.json`) and the *copy/substance* (the thesis, splits,
formula, methodology) are reused.

### Success criteria
- Every metric on the site is read from the scorer's `leaderboard.json` — no hand-typed numbers.
- Full refractive-glass WebGL world behind all routes, themed light + dark.
- Numbers/content remain crisp, selectable, accessible, and indexable (DOM, not WebGL).
- Lighthouse SEO ≥ 95 and Core Web Vitals green **with the world running** (tiered fidelity).
- Playwright-verified visuals across all routes × {light, dark} × {desktop, mobile}.

---

## 2. The signature concept

The brand *is* the metaphor: **GlassBench → "does it know when it didn't?" → glass =
honesty, seeing through to what a system doesn't know.**

- Real refractive glass is the visual language. The shader enacts the thesis:
  **confident-wrong = cloudy/distorted glass; honest abstention = clear glass.**
- A single persistent WebGL scene lives behind every route; route changes **morph**
  the scene (camera + material uniforms via GSAP) so the multi-page app feels like
  one continuous world rather than separate pages.

---

## 3. Architecture & stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router), **node runtime on Coolify** |
| Location | `glassbench/web/` (same repo as scorer); `site/` retired |
| 3D | React Three Fiber + three.js + **custom GLSL** refraction/dispersion material |
| Motion | GSAP + Lenis (same toolkit as the portfolio) |
| Theme | `next-themes` — system preference + persisted manual toggle, default **dark** |
| Content panels | DOM in **CSS `backdrop-filter` glass panels** over the live scene |
| Data | Build-time read of scorer output, validated by `lib/glassbench-data.ts` |

### Single canvas, DOM stays interactive
One `<Canvas>` is mounted once in the root layout. Its `eventSource` is the wrapper
div (not the canvas) and `eventPrefix="client"`, so DOM panels above it stay
clickable — per our R3F gotcha (OrbitControls/canvas eating raycasts → dead clicks).

---

## 4. Data flow (scorer is the source of truth)

```
Python scorer  ──►  leaderboard.json  ──►  lib/glassbench-data.ts (validate+type)  ──►  pages
(glassbench/*)      (committed)            (build time, web/)                            (RSC)
```

- `lib/glassbench-data.ts` loads `leaderboard.json` + datasheet content at build,
  validates the shape, and exposes typed objects. A shape change in the scorer that
  breaks the contract **fails the build / unit test**, never silently corrupts the board.
- The site performs **no scoring** in the browser. Submissions remain a GitHub-PR flow.

### Data contract (from current `leaderboard.json`)
- **Top level:** `benchmark`, `version`, `n_items`, `split_counts {answerable, stale, contradiction, false_premise}`, `primary_metric` (`glass_score`), `headline_metric` (`cwr`), `glass_score_formula`, `sort`.
- **`metrics[]`:** `{ key, label, direction: higher|lower, scored, primary?, headline?, diagnostic?, tooltip }` — drives columns, tooltips, and color-ramp direction.
- **`ranked[]`:** `{ rank, system, glass_score, cwr, aurc_norm, abst_rec_contradiction, abst_rec_false_premise, ece, brier, cwr_macro, ece_macro, brier_macro, answerable_accuracy, answered, abstained, type, description, reproduce }`.
- **`references[]`:** excluded systems (e.g. the gold-label **oracle** `glass_score 99.07`, the constructed `verbalized_confidence_llm`) with `what_it_is` + `excluded_reason` — rendered **above/outside the ranking** to mark the top of the scale, never as competitors.

---

## 5. Pages (multi-page, shared glass nav)

### `/` — the story
Hero thesis ("does it know when it didn't?") → the **CWR strip** reborn as glass ticks
in 3D-lit space (every ranked system plotted 0.000→0.700, lower=better) → four-splits
matrix (answerable 43 / stale 11 / contradiction 12 / false-premise 30) → Glass Score
formula schematic (two pillars → harmonic-mean junction → ×(1−CWR)) → the **confidence
dial** (kept; reborn as a glass instrument that proves "no single confidence games both
pillars") → submit CTA.

### `/leaderboard` — the centerpiece
Glass-card table from `ranked[]`. Per-metric tooltips from `metrics[]`. Color ramps
(green/amber/red by goodness, respecting each metric's `direction`) re-expressed as
**glass tints**. Sortable columns, count-up reveals. Excluded `references[]` shown in a
distinct "reference scale" zone with their `excluded_reason`.

### `/datasheet`
The dataset documentation (`DATASHEET.md`) ported as readable glass long-form (MDX/markdown).

### `/submit`
The 5-step methodology (`build_data` → predictions → validate → score → PR) with copy
buttons and the BibTeX cite block.

---

## 6. Theming — liquid glass, light + dark (co-equal)

- Two fully-tuned glass palettes:
  - **Dark:** deep-navy "instrument" vibe (evolves the current `#0c0f14` palette).
  - **Light:** bright frosted glass, accent ramps remapped for contrast.
- Both verified for **WCAG AA** contrast on panel text — light is a first-class citizen,
  not an afterthought.
- The shader exposes a `theme` uniform so the **world re-tints** on toggle (not just the DOM).

---

## 7. Legibility / performance / accessibility guardrails

Because a full-WebGL world sits behind a numbers-heavy site, these are part of the
design, not optional polish:

- **Content is DOM, not WebGL.** Leaderboard, datasheet, copy = HTML in CSS glass
  panels over the scene → crisp, selectable, accessible, SEO/AEO-indexable.
- **Tiered fidelity:** full scene (capable desktop) → reduced scene (mobile) →
  **static rendered poster** under `prefers-reduced-motion`, `save-data`, or low-power.
  Content is fully usable at every tier.
- **LCP = SSR'd hero headline (DOM)**, never a shader frame. Scene lazy-inits after first paint.
- **No dead clicks:** `eventSource` on wrapper; verified with real `page.mouse` clicks.
- Keyboard-navigable nav, focus-visible rings, skip-link.

---

## 8. Testing & verification

- **Unit:** `lib/glassbench-data.ts` tested against the real `leaderboard.json` shape
  (scorer change can't silently break the board).
- **Visual (mandatory before "done"):** Playwright screenshots of every route ×
  {light, dark} × {desktop, mobile}; a real-mouse click test confirming the canvas
  doesn't eat DOM clicks.
- **Perf gate:** Lighthouse SEO ≥ 95 + CWV green with the world running, before deploy.

---

## 9. Out of scope (YAGNI)

No CMS, no in-browser scoring, no auth. Submissions stay a GitHub-PR flow (documented,
not implemented on-site). Datasheet is ported markdown, not a rich editor. No live data
fetching — `leaderboard.json` is read at build.

---

## 10. Migration / cleanup

- New app at `glassbench/web/`. Once it reaches parity-of-intent and deploys,
  **retire `site/build_site.py`, `site/dist/`, `site/nginx.conf`** (replaced by the
  Next.js node service on Coolify). `leaderboard.json` generation stays in the scorer
  pipeline; the path it's read from is the only coupling between scorer and web.
```
