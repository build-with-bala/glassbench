# GlassBench v0.1 — Leaderboard

Scored by `python -m glassbench.score` on `data/glassbench_v0.1.jsonl` (96 items:
answerable 43, stale 11, contradiction 12, false-premise 30). The scorer is deterministic
— two runs are byte-identical. All six Glass Score components are shown; the composite
never replaces them.

> **The Glass Score is the harmonic mean of an answer pillar and a safety pillar, scaled
> by `(1 − CWR)`** — so it rewards **genuine selective skill** and nothing else. The scorer
> applies a **single answer/abstain decision**: a stated `confidence < 0.5` is treated as an
> abstention **everywhere** (the answer pillar too), so the confidence field can't be set
> independently of behaviour. As a result **no degenerate strategy beats genuine selective
> behaviour**: a do-nothing **always_abstain** agent scores **0.00** (answer pillar 0), an
> **always_answer** system scores **0.00** (safety pillar 0), and answering-everything at *any*
> fixed confidence scores **0.00** too — low confidence (< 0.5) collapses the answer pillar, and
> ≥ 0.5 collapses the safety pillar. All verified. See
> [`PRE_REGISTRATION.md`](PRE_REGISTRATION.md) → "What the Glass Score rewards".
> **Read the components and the diagnostics, not just the composite.**

## Ranked baselines

Genuine systems that read only `history` + `query` (no labels). Higher Glass = better.

| # | system | Glass | CWR ↓ | AURC_norm ↓ | AbstRec_contra ↑ | AbstRec_fp ↑ | ECE ↓ | Brier ↓ |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | agent_llm | 54.34 | 0.062 | 0.530 | 0.92 | 0.63 | 0.176 | 0.271 |
| 2 | random_confidence | 25.20 | 0.177 | 0.767 | 0.83 | 0.40 | 0.438 | 0.448 |
| 3 | bm25_retrieval | 6.20 | 0.510 | 0.904 | 0.08 | 0.07 | 0.462 | 0.475 |
| 4 | always_answer | 0.00 | 0.698 | 0.896 | 0.00 | 0.00 | 0.523 | 0.568 |
| 4 | always_abstain | 0.00 | 0.000 | 1.000 | 1.00 | 1.00 | 0.000 | 0.000 |

Both `always_answer` and `always_abstain` score **0.00** — and so does answer-everything at
*any* fixed confidence: `always_answer` zeroes the safety pillar, `always_abstain` zeroes the
answer pillar, and an answer-everything entry that states `confidence < 0.5` is treated as
abstaining everywhere (single answer/abstain decision), which zeroes the answer pillar too.
The harmonic mean is 0 whenever either pillar is 0, so no degenerate strategy escapes. They are
shown tied at the bottom (rank 4) on purpose.

### Diagnostics (reported only — NOT in the Glass Score)

Split-balanced (macro) metrics so the unequal split sizes don't let the big splits
dominate, plus plain answer quality. `AnswerableAccuracy` = fraction of answerable+stale
items answered correctly; `answered/abstained` = routing counts over all 96 items.

| system | CWR_macro ↓ | ECE_macro ↓ | Brier_macro ↓ | AnswerableAccuracy ↑ | answered / abstained |
|---|---:|---:|---:|---:|---:|
| agent_llm | 0.057 | 0.491 | 0.351 | 0.463 | 58 / 38 |
| random_confidence | 0.173 | 0.619 | 0.507 | 0.204 | 45 / 51 |
| bm25_retrieval | 0.581 | 0.622 | 0.522 | 0.407 | 92 / 4 |
| always_answer | 0.781 | 0.653 | 0.635 | 0.537 | 96 / 0 |
| always_abstain | 0.000 | 0.000 | 0.000 | 0.000 | 0 / 96 |

## Reference entries (excluded from the ranking)

These are **not real model runs** — they are constructed from the gold labels (perfect or
split-keyed routing/confidence) and would be **rejected as submissions** under
`CONTRIBUTING.md`. They are shown only to mark the top of the scale. Treat them as ceilings,
not competitors.

| reference | Glass | CWR ↓ | AURC_norm ↓ | AbstRec_contra ↑ | AbstRec_fp ↑ | ECE ↓ | Brier ↓ | AnsAcc | what it is |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| abstention_aware_llm | 99.07 | 0.000 | 0.137 | 1.00 | 1.00 | 0.143 | 0.047 | 0.981 | oracle: perfect answer/abstain routing |
| verbalized_confidence_llm | 92.17 | 0.031 | 0.904 | 1.00 | 1.00 | 0.122 | 0.091 | 0.907 | constructed: confidence keyed to the split label |

**Authors' entry: not yet listed (see [README](README.md)).** The authors' own system is
intentionally excluded from the initial release; it will be added only once external
entries exist, and will report every split including the ones it fails.

## Honest reading

The Glass Score requires **both** pillars at once, and the ranked board shows exactly why
that matters. **`agent_llm` leads at 54.34** — it is the only genuine system that actually
*routes*: it answers 58 of 96 items, gets 46.3% of the answerable ones right
(`AnswerableAccuracy = 0.463`), abstains well on the unanswerable splits
(AbstRec 0.92 / 0.63), and keeps its confidently-wrong rate down to **CWR 0.062**. That
combination — a non-zero answer pillar *and* a non-zero safety pillar *and* low CWR — is the
only way to score high here.

The headline failure mode this benchmark exists to expose — being **confidently wrong** —
still shows a wide spread across the answering baselines: **CWR ranges from 0.062
(agent_llm) to 0.698 (always_answer).** `always_answer` is confidently wrong on 69.8% of all
items (it answers every retracted/false-premise query at high confidence) and
`bm25_retrieval` on 51.0% — exactly the deployed-product failure accuracy-only benchmarks
never catch. `random_confidence` answers everything too but spreads its confidence, so only
17.7% of its answers are *confidently* wrong and its abstention recall on the unanswerable
splits is incidental (low confidence is treated as an abstention), not real routing —
which is why it lands at 25.20, below `agent_llm` but above the unguarded retrievers.

**Every degenerate extreme scores 0.00 — this is the point of the formula.**
`always_abstain` has perfect-looking abstention recall (1.00 / 1.00) and CWR 0.000, but
`AnswerableAccuracy = 0.000` zeroes its answer pillar, so its Glass Score is 0. Symmetrically,
`always_answer` has a respectable `AnswerableAccuracy = 0.537` but zero abstention recall (it
answers at confidence 0.9), so its safety pillar is 0 and its Glass Score is 0. And an
answer-everything entry that writes a low `confidence` to fake abstention gains nothing: the
scorer applies a **single answer/abstain decision**, so `confidence < 0.5` counts as abstaining
everywhere and zeroes its answer pillar (answer-everything at fixed 0.49 / 0.60 / 0.69 all score
0.00, verified). A do-nothing abstainer **cannot** top the board, neither can a reckless
answer-everything system, and neither can one that answers everything at low confidence to fake
abstention: the benchmark is un-gameable by any of those strategies.
A reader who wants *memory quality* should look at `AnswerableAccuracy`, where
`agent_llm` (0.463, CWR 0.062) clearly separates from the unguarded retrievers — it actually
answers nearly half the answerable questions while keeping confident errors low, which is the
behaviour the benchmark is built to reward.

The two **reference** rows (99.07 and 92.17) are not real systems: their routing/confidence
track the gold split label (perfect, or split-keyed bands no real model produces). They are
the ceiling of the scale, kept out of the ranking so the board is not flattered by planted
near-oracles.

## Reproduce

```bash
python -m glassbench.build_data                  # rebuild data (byte-identical)
python baselines/agent_llm.py                     # regenerate the genuine agent baseline
python -m glassbench.score --predictions submissions/<name>/predictions.json
```
