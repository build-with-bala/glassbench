# EXAMPLE

> This is a template submission, not a real entry. It exists so contributors can copy
> the directory layout and so CI has a known-valid file to score. It is **not** listed
> on the leaderboard. Copy this folder to `submissions/<your_system>/`, replace
> `predictions.json` with your real output, and fill in the fields below.

- **System name:** EXAMPLE (illustrative only)
- **One-line description:** A hand-written four-item sample showing every valid
  prediction shape — a confident answer, a low-confidence answer, and two abstentions.
- **Type:** none (template)
- **Base model / memory backend:** n/a
- **Confidence source:** the `confidence` field is a calibrated probability that the
  emitted `answer` is correct. Abstaining is equivalent to confidence below the
  system's own action threshold.

## How predictions were produced

The four items here are illustrative and use placeholder ids (`example_*`). They do
**not** correspond to real items in `data/glassbench_v0.1.jsonl`, so this file will
score against zero matched items — that is expected for a template.

A real submission must:

1. Read every item from `data/glassbench_v0.1.jsonl`.
2. Emit exactly one prediction per `id`, using one of the two valid shapes:
   - answered: `{"id": "...", "answer": "...", "confidence": <0..1>}`
   - abstained: `{"id": "...", "abstain": true}`
3. Write the list to `predictions.json` (a JSON array of those objects).

Missing items are scored as abstentions (see `PRE_REGISTRATION.md`).

## Reproducibility

- Data version scored against: `glassbench_v0.1`
- Any seeds / decoding settings: n/a for this template
- Code / commit (optional but encouraged): n/a
