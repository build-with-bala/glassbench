# Contributing to GlassBench

GlassBench measures whether a memory system **knows when it doesn't know**. You
contribute by running your system on the public task set and submitting its
predictions. The scorer is the same code for everyone and is deterministic — see
[`PRE_REGISTRATION.md`](PRE_REGISTRATION.md) for the frozen metric and weight
definitions. Nothing in a submission can change how it is scored.

There are two kinds of contribution:

1. **A leaderboard submission** — a `predictions.json` for your system. Most people.
2. **A change to the harness itself** (scorer, data builder, docs). See
   [Changing the benchmark](#changing-the-benchmark) — the bar is deliberately high.

---

## 1. Make a leaderboard submission

### Step 1 — get the data

The task file is built reproducibly from the public LongMemEval release (MIT). GlassBench
does **not** redistribute the upstream corpus, so first download the source the builder
reads — the LongMemEval **`longmemeval_oracle.json`** (~15 MB) — to `data/longmemeval_oracle.json`:

```bash
mkdir -p data
curl -fSL 'https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_oracle.json' \
  -o data/longmemeval_oracle.json
# Confirm the byte-identical input (expected SHA-256):
shasum -a 256 data/longmemeval_oracle.json
# 821a2034d219ab45846873dd14c14f12cfe7776e73527a483f9dac095d38620c
```

Then build (deterministic — reproduces the committed JSONL byte-for-byte):

```bash
python -m glassbench.build_data    # writes data/glassbench_v0.1.jsonl
```

If the source file is absent, `build_data` exits with the same download command and checksum.

Each line is one item:

```json
{
  "id": "...",
  "split": "answerable | stale | contradiction | false_premise",
  "history": [ ... multi-session conversation ... ],
  "query": "...",
  "gold_answer": "..." ,            // or "ABSTAIN" for unanswerable splits
  "answer_topic": "...",
  "evidence_spans": ["..."]
}
```

You only need `id`, `history`, and `query` to produce a prediction. Do **not** read
`gold_answer` at inference time — submissions that peek will be rejected.

### Step 2 — run your system and write `predictions.json`

For every item, emit exactly one prediction, using one of the two valid shapes from
the frozen submission contract:

```jsonc
// answered: confidence is your calibrated P(answer is correct), in [0, 1]
{"id": "<item id>", "answer": "Seattle", "confidence": 0.91}

// abstained: you judge the query unanswerable from the history
{"id": "<item id>", "abstain": true}
```

`predictions.json` is a **JSON array** of those objects:

```json
[
  {"id": "item_0001", "answer": "Seattle", "confidence": 0.91},
  {"id": "item_0002", "abstain": true}
]
```

Rules (all from `PRE_REGISTRATION.md`):

- `abstain: true` is scored as confidence `0` on the answer.
- **Missing items are treated as abstentions** — so you may omit items you'd abstain
  on, but you cannot gain by leaving out items you'd get wrong.
- `confidence` must be in `[0, 1]`. It is your system's own calibrated probability
  that the `answer` is correct, **not** a retrieval score.
- One prediction per `id`. Duplicate ids are an error.

A minimal, valid file lives at
[`submissions/EXAMPLE/predictions.json`](submissions/EXAMPLE/predictions.json) — copy
its shape.

### Step 3 — validate, then score locally

Check the file against the contract first:

```bash
python scripts/validate_submission.py submissions/<your_system>/predictions.json
```

It exits non-zero and lists every violation by row (duplicate ids, ids that are not in
v0.1, confidences outside `[0, 1]`, malformed rows, label fields copied into a
prediction). Omitted ids are only a warning — they are scored as abstentions. The same
rules run in your browser on the site's
[submit page](https://glassbench.buildwithbala.in/submit#check) if you would rather drop
the file there; that checker validates and never scores.

Then score it:

```bash
python -m glassbench.score --predictions submissions/<your_system>/predictions.json
```

The scorer prints **all six components** (CWR, AURC, abstention recall for each
unanswerable split, ECE, Brier) alongside the composite Glass Score. The composite
never replaces the components. Two runs on the same file produce byte-identical
numbers.

### Step 4 — add your submission folder

Create `submissions/<your_system>/` with **two** files:

```
submissions/<your_system>/
├── predictions.json   # your output (the array from Step 2)
└── system.md          # how it was produced (copy submissions/EXAMPLE/system.md)
```

`system.md` should state, at minimum: a one-line description, the system type
(long-context model / RAG / agentic memory / etc.), the base model and memory backend,
where the `confidence` number comes from, and any seeds or decoding settings needed to
reproduce the run. Honest, brief descriptions are the norm.

> **Naming:** use a short, lowercase folder name made of letters, digits, `_` or `-`
> (e.g. `mem0`, `letta`, `longctx_128k`). The folder name is the leaderboard row name and
> the address of your system's page on the site (`/systems/<your_system>`).

### Step 5 — open a pull request

1. Branch from the default branch; never push to it directly.
2. Commit only your `submissions/<your_system>/` folder (plus a leaderboard row if you
   choose to add one — a maintainer can also do this).
3. Open the PR. **CI validates and scores your changed submission**: it runs
   `scripts/validate_submission.py`, checks that `system.md` is there, then runs the
   scorer and prints the six components + Glass Score in the job log. A maintainer
   merges once CI is green and the `system.md` is filled in.

No system is privileged. The authors' own system is intentionally **not** on the board
until external entries exist — see the README.

---

## What makes a submission valid

A submission is rejected if it:

- reads `gold_answer` (or any label field) at inference time;
- contains duplicate `id`s, ids that are not strings, or ids not present in the scored
  data version;
- has any `confidence` outside `[0, 1]`;
- is not a JSON array of the two allowed per-item shapes;
- is missing `system.md`, or `system.md` is a non-description placeholder.

Abstaining everywhere (Glass Score collapses on `answerable`/`stale`) or answering
everywhere (collapses on the unanswerable splits) is *allowed* — those are honest
baselines and welcome — but they will not score well, by design.

---

## After a submission is merged (maintainers)

Every published number comes from one pipeline run over `submissions/`. Regenerate the
artifacts and the site's snapshot together, and commit them in one change:

```bash
make web-data     # = make leaderboard + make fixtures + refresh web/data/
```

That rewrites, deterministically:

| File | Written by |
|---|---|
| `LEADERBOARD.md` | `scripts/gen_leaderboard.py` |
| `results/leaderboard.json` | `scripts/gen_leaderboard.py --json` |
| `results/item_results.json` | `scripts/export_results.py` |
| `web/data/*` | `web/scripts/sync-data.mjs` (a byte-for-byte copy of the above + the frozen data) |

`make check` verifies all of it without writing, and CI fails on any drift — a stale
`LEADERBOARD.md`, a stale `results/*.json`, or a `web/data/` snapshot that no longer
matches the pipeline. Nothing in `results/` or `web/data/` is ever edited by hand.

A new system's leaderboard blurb (`type`, `description`, `reproduce`) is read from the
`- **Type:**` and `- **One-line description:**` bullets of its `system.md`; to curate it,
add an entry to `_JSON_SYSTEM_META` in `scripts/gen_leaderboard.py`. If the leaderboard's
"Honest reading" prose should mention the new system, edit the static blocks in the same
script — never `LEADERBOARD.md` itself.

Pushing to the deployed branch redeploys the site (Coolify's own webhook). CI only
verifies; it holds no deploy credentials and must not be given any.

---

## Working on the site

The site in [`web/`](web/) is presentation: it reads `results/*.json` and the frozen data
and **must never compute, round or re-derive a score** — if a page needs a number the
pipeline does not publish, add it to the pipeline (with a test that ties it to the
scorer), not to the page. See [`web/README.md`](web/README.md) for setup, the data flow
and the test commands. Two rules that are easy to break by accident:

- **The in-browser `predictions.json` checker is a port of
  `scripts/validate_submission.py`.** If you change a validator rule, change
  `web/lib/validate-predictions.ts` to match and run `make fixtures`; the site's unit
  tests compare the two on a fixed set of files and CI rejects a stale fixture.
- **Gold answers stay out of crawled HTML.** Item pages are `noindex`, are not in the
  sitemap, and load the gold answer only when a reader presses "reveal". Do not render
  `gold_answer`, `evidence_spans` or `answer_topic` into a page, and do not add them to
  the bulk JSON endpoints.

---

## Changing the benchmark

The splits, metrics, and Glass Score weights are **frozen** in
`PRE_REGISTRATION.md`. They do not change to chase a result. If you believe a metric
is wrong:

- Bug fixes that **do not** change any score (typos, docs, faster code with identical
  output) are normal PRs.
- Anything that **would change scores** (a new metric, a re-weighting, a split
  redefinition, a builder change that alters items) ships only as a **new versioned
  benchmark** (`v0.2`, …) with the diff stated explicitly. It does not retroactively
  edit `v0.1`. Open an issue first so the change can be discussed in the open.

The scorer is deterministic by contract: fixed seeds, bias-corrected ECE, equal-mass
bins. Any PR touching `glassbench/score.py`, `glassbench/match.py`, or
`glassbench/calib.py` must keep two runs byte-identical and must not alter `v0.1`
numbers unless it is an explicit, documented `v0.2`.

Tooling around the scorer — `glassbench/results.py`, everything in `scripts/`, the site —
may change freely as long as `make check` and the test suite stay green: those gates are
what prove a tooling change did not move a number.

---

## Code of conduct

Be honest about what your system does and does not do. The whole point of GlassBench
is calibration; misrepresenting a submission defeats it. Report every split, including
the ones your system fails — that transparency is the value here.
