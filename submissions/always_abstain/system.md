# always_abstain — the "I don't know" baseline (abstains everywhere)

The mirror image of `always_answer`: it abstains on **every** item.

- **System name:** always_abstain
- **Type:** degenerate baseline (abstains everywhere)
- **Memory backend:** none — the history is never read.
- **Routing:** none — every prediction is `{"id": ..., "abstain": true}`.
- **Confidence source:** n/a (an abstention is scored as confidence 0).

**Why it is on the board:** it anchors the other end of the scale. It is never
confidently wrong (CWR 0) and has perfect abstention recall on both unanswerable splits,
but it answers nothing, so its `AnswerableAccuracy` is 0, its answer pillar is 0 and its
Glass Score is 0. Abstaining is neither a free win nor a free loss: a system that beats
this one has to actually answer the answerable questions.

## Reproducibility

- Data version scored against: `glassbench_v0.1`
- Produced by: `python baselines/always_abstain.py` (deterministic; no LLM, no API key,
  no RNG — two runs are byte-identical).
- Reads only `id` — valid under `CONTRIBUTING.md`.
