# always_answer — recency / last-write-wins baseline (never abstains)

The "it always remembers the most recent thing" system. For every item it returns the
user sentence that best overlaps the query, preferring the **most recent** among equally
good matches, and states it at a fixed confidence of **0.9**. It never abstains.

- **System name:** always_answer
- **Type:** degenerate baseline (recklessly answers all)
- **Memory backend:** the item's own user turns, split into sentences.
- **Routing:** none — it answers every item, including the retracted (`contradiction`)
  and never-stated (`false_premise`) ones.
- **Confidence source:** a constant `0.9`. It carries no information about correctness.

**Why it is on the board:** this is the dominant behaviour of naive memory systems and
of plain long-context prompting — surface the latest matching fact and state it
confidently. It is competitive on the answerable items and it is the high-CWR floor:
every unanswerable item it answers is a confident error, so its safety pillar is 0 and
its Glass Score is 0.

## Reproducibility

- Data version scored against: `glassbench_v0.1`
- Produced by: `python baselines/always_answer.py` (deterministic; no LLM, no API key,
  no RNG — two runs are byte-identical).
- Reads only `id`, `history` and `query` — valid under `CONTRIBUTING.md`.
