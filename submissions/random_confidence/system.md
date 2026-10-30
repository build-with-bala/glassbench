# random_confidence — the calibration-floor baseline

It **states an answer for every item** and attaches a **uniform-random confidence** in
[0, 1). The answer text comes from the same BM25 retrieval as `bm25_retrieval` (so there
is a non-trivial accuracy to be miscalibrated against), but the stated confidence
carries **no information** about correctness.

- **System name:** random_confidence
- **Type:** calibration-floor baseline
- **Memory backend:** per-item BM25 over the item's user sentences (falls back to the
  last user sentence when nothing overlaps the query).
- **Routing:** none by design — it never emits `abstain`. Because the scorer applies a
  single answer/abstain decision, the roughly half of its answers that draw a confidence
  below 0.5 are **scored as abstentions**. Its abstention recall on the unanswerable
  splits is therefore incidental, not real routing.
- **Confidence source:** `random.Random(20260615).random()`, drawn once per item in data
  order.

**Why it is on the board:** it shows roughly what ECE, Brier and AURC look like when
`confidence` is noise. A system claiming calibrated confidence has to clearly beat this;
if it does not, its confidence is no better than a coin.

## Reproducibility

- Data version scored against: `glassbench_v0.1`
- Produced by: `python baselines/random_confidence.py` (deterministic given the fixed
  seed `20260615`; no LLM, no API key — two runs are byte-identical).
- Reads only `id`, `history` and `query` — valid under `CONTRIBUTING.md`.
