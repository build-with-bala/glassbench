# GlassBench v0.1 — frozen design & integrity statement

**Frozen 2026-06-15, before any system (including the authors') was scored.**
This file is the contract. Splits, metrics, and the Glass Score formula below do not
change to chase a result. Changes ship only as a new versioned benchmark (v0.2, …)
with the diff stated.

> **Freeze is committed, not just asserted.** This statement is committed to git in a
> tagged commit (`v0.1-prereg`) that contains the design, the builder, the scorer, the
> data, and an **empty** leaderboard — *before* any submission predictions or the filled
> leaderboard are committed. The freeze claim points at that commit hash, so "frozen
> before scoring" is verifiable from history rather than taken on trust. (An external
> timestamp such as OpenTimestamps can be layered on the tag for third-party proof.)

## Integrity commitments

1. **No author-favouring design.** The capability measured (calibrated knowledge of
   one's own limits) and the splits were chosen on the merits of the problem, not to
   match any system's strengths. The unanswerable splits include **false-premise**,
   which is hard for calibration/belief-state systems, not only for retrieval systems.
   The composite is **two-pillar and un-gameable by any degenerate strategy**: it is the
   harmonic mean of an answer pillar and a safety pillar, scored under a **single
   answer/abstain decision** (a stated `confidence < 0.5` is an abstention everywhere,
   the answer pillar included). So a pure abstainer scores ≈ 0 (answer pillar 0), an
   answer-everything system scores ≈ 0 (safety pillar 0), **and** an answer-everything
   system that writes a low confidence to fake abstention also scores ≈ 0 (the low
   confidence abstains it everywhere, zeroing the answer pillar). Only genuine selective
   skill — answer what you know, abstain on what you don't — scores high. This is disclosed
   in full under "What the Glass Score rewards" below, and all six components plus
   answer-quality diagnostics are always shown.
2. **Frozen before scoring.** Metrics and weights are fixed here before any leaderboard
   number exists. The authors' own system is excluded from the initial release and,
   when added, will report **every** split including the ones it fails.
3. **Deterministic, open scorer.** Same code for every submission. Bias-corrected ECE.
   Seeds fixed. Two runs produce byte-identical scores.
4. **Real public data.** Derived only from LongMemEval (MIT). Every evidence span used
   to label a split is a verbatim substring of the source transcript; the builder
   verifies this and drops any item that fails.

### Disclosed construction caveats (so nothing is a surprise)

- **Contradiction items carry an explicit retraction cue** ("Actually, scratch …",
  "Correction: …", "disregard", "ignore …"). The split therefore partly tests
  cue detection, not deep belief-state reasoning. The retraction text is **synthetic**,
  flagged on the turn, and is **never** used as an evidence span (every evidence span
  stays verbatim). Adding implicit/soft retractions is a planned v0.2 addition.
- **Cross-split source reuse:** most contradiction items reuse the same `source_id` as an
  answerable/stale item (a real assertion + a synthetic no-replacement retraction). The
  `source_id` is in every row so this is auditable; it makes the four splits less
  source-independent than the names suggest. Drawing some contradiction items from
  otherwise-unused sources is a v0.2 goal.
- **Reference (oracle) submission:** `submissions/abstention_aware_llm` is **constructed
  from the gold labels** (perfect routing) and is shown only as an upper-bound *reference*,
  excluded from the headline ranking and labelled as such. The genuine, imperfect
  abstention-aware baseline that reads no labels is `submissions/agent_llm`.

## Splits

Built from the LongMemEval oracle split. Four categories:

- **answerable** — knowledge-update with a determinable current fact.
- **stale** — a fact last asserted ≥ N sessions before the query (drift-risk), still
  the correct answer; tests whether confidence reflects age.
- **contradiction** — asserted then negated, no replacement; gold = ABSTAIN.
- **false-premise** — query targets a sibling/attribute never asserted; gold = ABSTAIN.

Each item: `{id, split, history, query, gold_answer | "ABSTAIN", answer_topic,
evidence_spans[]}`. Counts and the exact builder are committed; the JSONL is
regenerable from the public source.

### Frozen counts (v0.1) and why they are not equal

The intent was ≈ equal weight across the four categories. The shipped, frozen v0.1
counts are **not** equal — they are **source-limited**:

| split | count | share |
|---|---:|---:|
| answerable | 43 | 44.8% |
| stale | 11 | 11.5% |
| contradiction | 12 | 12.5% |
| false-premise | 30 | 31.2% |
| **unanswerable (contra+fp)** | **42** | **43.8%** |

Reasons, stated plainly rather than hidden:

- **false-premise = 30** is *every* native `_abs` item in the public LongMemEval oracle
  release (there are exactly 30); it cannot grow without leaving the real source.
- **stale = 11** and **contradiction = 12** are limited by how many real knowledge-update
  items have a clean earlier-vs-later value (stale) or a real assertion we can pair with
  a no-replacement retraction (contradiction) while keeping every evidence span verbatim.
- **answerable = 43** is the richest category in the source.

Because the splits are unequal, the **pooled** CWR/ECE/Brier are dominated by the larger
splits. The scorer therefore *also* prints **split-balanced ("macro") CWR, ECE, Brier**
and a plain **AnswerableAccuracy**, as **reported diagnostics only** — they are NOT in the
Glass Score and do not change the frozen weights. They exist so a reader can see answer
quality and per-split behaviour without the big splits drowning the small ones.
Rebalancing to equal counts (and the unanswerable group to exactly 50%) is a planned
**v0.2** change, shipped with its diff per the rules above; v0.1 freezes these counts.

## Submission contract

Per item: `{"id", "answer", "confidence"∈[0,1]}` OR `{"id", "abstain": true}`.
`abstain:true` is scored as confidence 0 in the answer. Missing items = abstain.

## Metrics (exact)

Let an item be *answerable* (answerable, stale) or *unanswerable* (contradiction,
false-premise). An answer is *correct* iff it matches gold (normalized string / set
match; matcher committed in `glassbench/match.py`).

**Single answer/abstain decision (applies to ALL metrics).** A prediction counts as
*answered* only if it gives an answer **and** states `confidence ≥ 0.5` (the abstain
threshold). A stated `confidence < 0.5` is an **abstention everywhere** — for the answer
pillar / `AnswerableAccuracy` and `AURC` just as much as for `AbstentionRecall` — so the
`confidence` field cannot be set independently of the answer/abstain behaviour. (An
explicit `abstain: true` is likewise scored as confidence 0, i.e. not answered.) This is
the single decision that closes the confidence dead-zone: a system cannot have the same
low-confidence answer count simultaneously as a real answer and as an abstention.

- **CWR (Confidently-Wrong Rate)** = P( answered ∧ ¬correct ∧ confidence ≥ 0.70 ),
  over ALL items (answering an unanswerable item is automatically ¬correct). Headline.
- **AURC** = area under the risk–coverage curve on *answerable* items, sweeping the
  confidence threshold (selective accuracy). Lower = better.
- **AbstentionRecall_contradiction**, **AbstentionRecall_false_premise** =
  P( abstain ∨ confidence < 0.5 | unanswerable, split ), reported separately.
- **ECE** = pooled, equal-mass 15-bin expected calibration error of `confidence` vs
  `correct` over answered items, with the per-bin finite-sample bias subtracted
  (estimator + correction committed in `glassbench/calib.py`). Lower = better.
- **Brier** = mean( (confidence − correct)² ) over answered items.

### Glass Score (0–100, transparent)

```
A     = AnswerableAccuracy                              (answer pillar)
S     = mean(AbstentionRecall_contradiction,
             AbstentionRecall_false_premise)            (safety pillar)
HM    = 2*A*S / (A + S)        (0 if either pillar is 0)
Glass = 100 * HM * (1 − CWR)
```

`A` is the fraction of *answerable* (answerable + stale) items answered correctly; `S` is
the mean abstention recall over the two unanswerable splits. The Glass Score is the
**harmonic mean of the answer pillar and the safety pillar**, scaled by the
confident-wrong penalty `(1 − CWR)`. The harmonic mean is 0 whenever *either* pillar is 0,
so you cannot trade one pillar away for the other. All six components (CWR, AURC, the two
abstention recalls, ECE, Brier) are always printed alongside the composite; the composite
never replaces them. CWR enters as a multiplicative penalty because confidently-wrong is
the failure that actually harms a deployed product.

> **This formula was revised after internal fairness review, BEFORE any public
> freeze/scoring.** The v0.1 draft used an additive composite
> (`0.30·(1−CWR) + 0.25·(1−AURC_norm) + 0.15·AbstRec_c + 0.15·AbstRec_fp + 0.10·(1−ECE)
> + 0.05·(1−Brier)`). That draft had a fairness bug: ~75 of its 100 points were reachable
> *without answering a single item correctly*, so a do-nothing always-abstain system
> topped the board. The two-pillar harmonic mean fixes that — a do-nothing system can no
> longer win. The revision was made before any system (including the authors') was scored
> and before the public freeze, so no published number ever depended on the additive draft.

### What the Glass Score rewards (read this — it requires genuine selective skill)

The composite is structured so that the only way to score high is to **actually answer
what you know and abstain on what you don't**, and we state its structure openly. Because
of the single answer/abstain decision above (a stated `confidence < 0.5` is an abstention
everywhere, including the answer pillar), **no degenerate strategy can beat genuine
selective behaviour**:

- **A do-nothing abstainer scores ≈ 0.** Always-abstain has `AnswerableAccuracy = 0`, so
  the answer pillar `A = 0`, so the harmonic mean is 0, so `Glass = 0` — no matter how
  good its abstention recall or CWR look. Silence is not rewarded.
- **An answer-everything system scores ≈ 0.** Answering every query drives both
  abstention recalls to 0, so the safety pillar `S = 0`, so the harmonic mean is 0, so
  `Glass = 0`. Reckless answering is not rewarded either.
- **Answering everything at a low confidence to fake abstention also scores ≈ 0.** A
  system that answers every item but writes `confidence < 0.5` is treated as abstaining
  everywhere, so its `AnswerableAccuracy` (answer pillar `A`) drops to 0 — `Glass = 0`.
  There is no confidence value that games both pillars: below 0.5 zeroes the answer
  pillar, and ≥ 0.5 zeroes the safety pillar (answer-everything at a fixed 0.49 / 0.60 /
  0.69 all score 0.00).
- **Only genuine selective behaviour scores high.** You must get answerable items right
  (high `A`) *and* abstain on the unanswerable ones (high `S`) *and* avoid being
  confidently wrong (low CWR, which multiplies the score). A system that does all three —
  e.g. the genuine `agent_llm` baseline — separates clearly from every degenerate extreme.
- This is **not** a pure accuracy score: a competent retriever that never abstains is
  punished hard because it has no safety pillar. That is deliberate — confidently
  answering retracted or false-premise queries is the deployed-product failure we most
  want to penalise. The included `AnswerableAccuracy` and macro diagnostics (above) are
  always shown next to the composite so answer quality is never hidden. Read the
  components, not just the composite.

### Matcher (known limitation)

`glassbench/match.py` uses conservative gold-as-needle token-subsequence matching. It has
no negation guard, so a prediction like "not Seattle" can match gold "Seattle". This is
symmetric and, if anything, *helps* answering systems (it can credit a wrong answer and
slightly understate their CWR); it never favours abstainers. Documented here rather than
changed, because changing the matcher would alter v0.1 scores (a v0.2 concern).

## What v0.1 deliberately does NOT do

- No latency/cost axis (a separate concern).
- No multi-hop reasoning quality (other benchmarks cover it).
- No auditability/provenance axis yet — planned as a separate v0.x track, because a
  fair automatic metric for it is harder and we will not ship a rushed one.
- Synthetic-data tracks: none. v0.1 is real-conversation only.
