# GlassBench v0.1 — Datasheet / Dataset Card

A small, English-language benchmark for measuring whether a memory-equipped
language system **knows when it does not know** — i.e. its calibration and
abstention behaviour, not just its retrieval accuracy. This card documents what
the dataset is, where it comes from, exactly how each split was built, and what
it does **not** support. It is written to the spirit of Gebru et al.,
*Datasheets for Datasets*.

The authoritative design contract is [`PRE_REGISTRATION.md`](PRE_REGISTRATION.md)
(frozen 2026-06-15, git tag `v0.1-prereg`). Where this card and the
pre-registration could appear to disagree, the pre-registration governs; this
card only describes and does not redefine anything.

---

## 1. At a glance

| Field | Value |
|---|---|
| Name | GlassBench v0.1 |
| Data file | [`data/glassbench_v0.1.jsonl`](data/glassbench_v0.1.jsonl) |
| Items | **96** |
| Splits | answerable (43), stale (11), contradiction (12), false-premise (30) |
| Language | English only |
| Task | Per item, answer with a confidence in `[0,1]` **or** abstain |
| Gold | A short string answer (answerable / stale) or `"ABSTAIN"` (contradiction / false-premise) |
| Source | Derived from **LongMemEval** (oracle split), ICLR 2025, MIT |
| License | MIT (this benchmark and the upstream source) |
| Builder | [`glassbench/build_data.py`](glassbench/build_data.py) — deterministic, regenerable |
| What it measures | Confidently-Wrong Rate, selective accuracy (AURC), abstention recall, ECE, Brier, and the composite Glass Score |

---

## 2. Motivation

Memory benchmarks for LLM systems (long-context models, RAG, agentic memory
stores, etc.) are overwhelmingly scored on **accuracy**: did the system retrieve
the right fact? That misses the failure that actually hurts a deployed product:
answering **confidently** when the fact has changed, was retracted, or was never
stated. GlassBench exists to put a number on that failure — primarily the
**Confidently-Wrong Rate (CWR)** — using *real* multi-session conversations
rather than hand-picked or synthetic cases, so the measurement is hard to game in
the builder's favour.

The dataset was assembled by the GlassBench authors for this benchmark. No
funding body or external sponsor directed its construction. It contains no new
human-subjects data collection; all conversational content is inherited from the
public LongMemEval release.

---

## 3. Provenance

GlassBench is **derived entirely from LongMemEval**, a public benchmark of long,
multi-session user–assistant conversations.

- Upstream: **LongMemEval** (Wu et al.), ICLR 2025. License: **MIT**.
  Repository: https://github.com/xiaowu0162/LongMemEval
- Specific release used: the **oracle** split
  (`data/longmemeval_oracle.json`, 500 items), in which each question is paired
  with the sessions that contain (or, for absence questions, conspicuously do not
  contain) the relevant fact. GlassBench uses the oracle split so that the
  conversation history attached to each item is the relevant, evidence-bearing
  context rather than a full distractor haystack.

Every GlassBench item records its upstream `source_id` (the LongMemEval
`question_id` it was built from), so the derivation of any item is auditable
against the original release.

GlassBench does **not** redistribute the entire LongMemEval corpus as its task
file; it ships the 96 derived items plus the builder, and the upstream oracle
JSON is the input the builder reads. The derived task file is regenerable from
the public source with `python -m glassbench.build_data`.

**Obtaining the source (required before rebuilding).** The builder reads
`data/longmemeval_oracle.json`, which is **not** committed (it is the upstream
artifact, not GlassBench's to redistribute). Download it from the public
LongMemEval HuggingFace release to that exact path:

```bash
mkdir -p data
curl -fSL 'https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_oracle.json' \
  -o data/longmemeval_oracle.json
```

| Field | Value |
|---|---|
| Artifact | `longmemeval_oracle.json` (LongMemEval oracle split, 500 items) |
| Canonical download | `https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_oracle.json` |
| Target path | `data/longmemeval_oracle.json` |
| Size | 15,388,478 bytes (~15 MB) |
| SHA-256 | `821a2034d219ab45846873dd14c14f12cfe7776e73527a483f9dac095d38620c` |

The SHA-256 lets you confirm you have the **byte-identical** input GlassBench v0.1
was built from. If the file is absent, `python -m glassbench.build_data` exits with
the same download command and checksum rather than a bare error.

---

## 4. Construction, per split

Each emitted item has the shape:

```json
{
  "id": "...", "split": "...", "source_id": "<LongMemEval question_id>",
  "answer_topic": "...", "history": [ ...sessions... ],
  "query": "...", "gold_answer": "<string>" | "ABSTAIN",
  "evidence_spans": [ "...verbatim substring(s) of the source transcript..." ]
}
```

The four splits map onto two answerability classes — **answerable** (answerable +
stale) and **unanswerable** (contradiction + false-premise) — which is the
distinction the metrics in `PRE_REGISTRATION.md` are defined over.

The builder is curated-by-inspection: a human classified which real LongMemEval
item belongs in which split and wrote the natural-language *query framing*. The
builder then turns each entry into an item and **re-verifies every evidence span
in code**. Fact content (every evidence span) is always lifted verbatim from the
source; the authoring step never invents facts.

### 4.1 answerable (43 items) — gold = a string

Real LongMemEval **knowledge-update** items whose query targets the **current**
value of a fact. Gold is the updated value (asserted in the later of two
sessions). The history contains both the earlier and later sessions; the
evidence span is a verbatim phrase from the latest assertion. These are the
"easy, you should answer this" items — they give the answer pillar something to
reward and stop the benchmark from rewarding silence.

### 4.2 stale (11 items) — gold = a string

Also real knowledge-update items, but the query explicitly targets the
**previous / original** value, which is still the correct answer to that question
even though a newer, competing value exists later in the same conversation
(the drift-risk). Gold is the **old** value; the evidence span is a verbatim
phrase from the earlier assertion. Each item carries
`asserted_sessions_before_query` to mark the age gap. This split probes whether a
system's confidence reflects how old a fact is, rather than overwriting it with
the most recent value.

### 4.3 contradiction (12 items) — gold = ABSTAIN *(semi-synthetic)*

Built from a **real, verbatim assertion** taken from an earlier session, plus an
**explicit user retraction that supplies no replacement value**. The correct
behaviour is to abstain: the user asserted a fact and then took it back without
giving a new one, so there is nothing current to report.

Important integrity details, stated plainly:

- The retraction turn is **synthetic** (author-written), not from LongMemEval. It
  is appended to the history as a later user turn and is **flagged**:
  `synthetic: true` on the turn *and* `synthetic_retraction: true` on the item.
- The retraction text is **never** an evidence span. The only evidence span for a
  contradiction item is the **verbatim original assertion** (the thing that was
  retracted). This is what lets the verbatim-span rule (Section 5) hold for this
  split despite the synthetic turn.
- The history is trimmed to **only** the asserting session (`use_earlier_only`
  semantics) plus the retraction, so no superseding value can leak in.
- Each retraction carries an explicit **retraction cue** — phrasings like
  "Actually, scratch …", "Correction: …", "disregard", "ignore …". This means the
  split **partly tests retraction-cue detection**, not deep belief-state
  reasoning. See Limitations.

### 4.4 false-premise (30 items) — gold = ABSTAIN

The **native** LongMemEval `_abs` ("abstention") items: the query asks about a
sibling, attribute, or entity that was **never asserted** in the conversation
(e.g. asking about an Italian restaurant when only Korean ones were mentioned).
The official LongMemEval gold for these is "information not enough," which
GlassBench labels as `"ABSTAIN"`.

- Where a single real *sibling* fact exists (the thing that **was** asserted,
  demonstrating the queried target is the absent one), the evidence span is that
  verbatim sibling fact.
- A few items rest purely on **absence** (no single clean sibling fact); for
  those `evidence_spans` is intentionally empty and the label rests on absence
  alone. Each false-premise item carries
  `abstain_reason: "queried target was never asserted in the history"`.

These 30 items are **every** native `_abs` item in the public LongMemEval oracle
release (there are exactly 30; verified against the source). This split is hard
for calibration/belief-state systems, not only for retrieval systems — it cannot
be passed by better retrieval alone.

---

## 5. The verbatim-span integrity rule

This is the load-bearing data-quality guarantee (pre-registration commitment #4):

> **Every `evidence_span` in the shipped task file is a verbatim substring of the
> source transcript the item is built from.**

The builder enforces this in code, defensively and more than once: each candidate
span is located in the concatenated source transcript via exact substring search,
and any item with a span that does not verify is **dropped and counted** — it
never reaches the JSONL. There is a final re-verification pass over each kept
item's spans against its own source transcript before emission.

The synthetic retraction text in the contradiction split is the **only** authored
free text that enters a `history`, and it is deliberately excluded from
`evidence_spans` precisely so this rule remains true for every split. In other
words: authored text may appear as *conversation*, but never as *evidence*.

The build is fully deterministic (fixed sort order, `SEED` pinned even though no
random draw affects content); two runs produce a byte-identical task file.

---

## 6. Intended use

GlassBench is intended for **measuring the calibration and abstention behaviour
of memory-equipped LLM systems** — specifically:

- **Confidently-Wrong Rate (CWR)** — the headline metric: how often a system
  answers wrong/unsupported with stated confidence ≥ 0.70.
- **Selective accuracy** via the risk–coverage curve (AURC) on answerable items.
- **Abstention recall** on the two unanswerable splits (contradiction,
  false-premise), reported separately.
- **ECE** (bias-corrected) and **Brier** on answered items.
- The composite **Glass Score**, a harmonic mean of an answer pillar and a safety
  pillar scaled by `(1 − CWR)`, which is 0 for a do-nothing always-abstainer, for a
  reckless answer-everything system, **and** for an answer-everything system that writes a
  low confidence to fake abstention. The scorer applies a **single answer/abstain
  decision** (a stated `confidence < 0.5` is an abstention everywhere, the answer pillar
  included), so no degenerate strategy beats genuine selective behaviour; see §7.

Exact metric and scoring definitions are frozen in `PRE_REGISTRATION.md` and
implemented in `glassbench/`. The submission contract is per item
`{"id", "answer", "confidence"}` or `{"id", "abstain": true}`; missing items are
scored as abstentions.

**Not** intended for: ranking pure retrieval accuracy, latency/cost benchmarking,
multi-hop reasoning quality, or provenance/auditability scoring — none of which
v0.1 measures. It is a **diagnostic instrument**, not a general capability
leaderboard.

---

## 7. Limitations

Stated plainly, with no minimisation:

- **Very small (N = 96).** This is a focused diagnostic set, not a
  large-scale benchmark. Absolute numbers — and especially per-split rates — have
  wide confidence intervals and should be read as directional. Treat single-point
  differences between systems with caution.
- **Thin stale and contradiction splits (11 and 12 items).** Per-split abstention
  recall and stale behaviour are estimated from a dozen items each; a single item
  moves the rate by ~8–9 points. These splits are **source-limited**: they are
  capped by how many real knowledge-update items have a clean earlier-vs-later
  value (stale) or a real assertion pairable with a no-replacement retraction
  (contradiction) while keeping every evidence span verbatim.
- **The contradiction split is semi-synthetic and partly tests cue detection.**
  The retraction turns are author-written, not native LongMemEval text, and each
  carries an explicit retraction cue ("Actually, scratch …", "Correction: …",
  "disregard", "ignore …"). A system can therefore score well on this split by
  detecting an obvious surface cue rather than by genuine belief-state reasoning.
  Implicit / soft retractions are a planned v0.2 addition. (The retraction text is
  flagged on the turn and is never used as an evidence span, so the verbatim rule
  still holds — but the split's *difficulty* is partly cue-shaped, and that is a
  real limitation of what it measures.)
- **Cross-split source reuse.** Most contradiction items reuse the same
  `source_id` as an answerable or stale item (a real assertion plus a synthetic
  no-replacement retraction). In v0.1, **10 of the 12** contradiction items share
  a source with an answerable/stale item; only 2 (`6071bd76`, `945e3d21`) draw
  from otherwise-unused sources. The four splits are therefore **less
  source-independent than their names suggest**. The `source_id` is on every row
  so this is fully auditable, and drawing more contradiction items from
  otherwise-unused sources is a v0.2 goal.
- **Unequal splits; pooled metrics are dominated by the big splits.** The intent
  was ≈ equal weight, but the frozen counts are not equal (answerable and
  false-premise dominate). Pooled CWR/ECE/Brier lean toward the larger splits. The
  scorer additionally prints split-balanced ("macro") diagnostics and a plain
  AnswerableAccuracy so per-split behaviour is visible, but these are reported
  diagnostics only and are **not** in the Glass Score. Rebalancing to equal counts
  is a planned v0.2 change.
- **English only.** All conversations and queries are English. No claim is made
  about other languages.
- **Single domain of conversation.** The content is everyday personal-life
  knowledge-update dialogue inherited from LongMemEval; it is not enterprise,
  code, scientific, or adversarial-attack text. Conclusions should not be
  generalised beyond that style of memory.
- **Matcher is conservative and has no negation guard.** Correctness uses
  token-subsequence matching (`glassbench/match.py`); a prediction like "not
  Seattle" can match gold "Seattle". This is symmetric and, if anything, *helps*
  answering systems (it can under-count their confident-wrong cases); it never
  favours abstainers. Documented, not changed, because changing it would alter
  v0.1 scores (a v0.2 concern).
- **Inherited upstream limitations.** Any labelling noise, demographic skew, or
  topical bias present in LongMemEval's oracle split is inherited here. GlassBench
  re-labels answerability and writes query framings but does not re-audit the
  underlying conversational content.

None of these are framed as future fixes that change v0.1: the v0.1 contract
(splits, counts, metrics, formula, data file, pre-registration) is **frozen**.
Anything that would require changing them is a v0.2 note, not a v0.1 edit.

### Fixed in v0.1 after fairness review (not a current limitation)

- **Confidence dead-zone gaming vector — CLOSED.** An earlier draft scored the answer
  pillar and the safety pillar from *independent* readings of the stated `confidence`, so
  a system could answer **every** item but write `confidence < 0.5` and have it count as a
  real answer (answer pillar) *and* as an abstention (safety pillar) at the same time —
  an answer-everything-at-0.49 entry scored well above honest selective baselines. The
  fairness review fixed this **before the v0.1 freeze** by making the scorer apply a
  **single answer/abstain decision**: a stated `confidence < 0.5` is an abstention
  *everywhere*, including the answer pillar / `AnswerableAccuracy` and `AURC`. The
  confidence field can no longer be set independently of behaviour, so the dead-zone is
  closed — an answer-everything entry at a fixed 0.49 / 0.60 / 0.69 now scores **0.00**
  (below 0.5 zeroes the answer pillar; ≥ 0.5 zeroes the safety pillar), and the honest
  selective pattern scores strictly higher. This is part of the frozen v0.1 contract (see
  `PRE_REGISTRATION.md` → "Metrics (exact)", "Single answer/abstain decision"), not a
  deferred item.

---

## 8. Distribution, maintenance, and license

- **License:** MIT, consistent with upstream LongMemEval (MIT). See
  [`LICENSE`](LICENSE).
- **Privacy / PII:** No new personal data is collected. Content is the public
  LongMemEval conversational data, which is itself constructed/curated dialogue
  about fictional personal scenarios; GlassBench adds only author-written query
  framings and (for contradiction items) flagged synthetic retraction turns.
- **Versioning:** v0.1 is frozen (git tag `v0.1-prereg`). Changes to splits,
  counts, metrics, the Glass Score formula, the data file, or the
  pre-registration ship only as a new version (v0.2, …) with the diff stated.
- **Regenerating the data:** `python -m glassbench.build_data` reads the public
  oracle JSON and re-emits `data/glassbench_v0.1.jsonl` byte-for-byte.
- **Contact / contributions:** see [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## 9. Citation

If you use GlassBench, please also cite the upstream source it is derived from:

> Wu et al. *LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive
> Memory.* ICLR 2025. https://github.com/xiaowu0162/LongMemEval (MIT).

---

## 10. v0.2 notes (changes that need the frozen contract, deferred by design)

These were identified during review but **require touching the frozen v0.1 code surface**
(`glassbench/__init__.py` / `glassbench/score.py`, byte-identical to tag `v0.1-prereg`), so
they are recorded here as v0.2 items rather than applied to v0.1. They do **not** affect any
score. v0.1 stays byte-frozen; each ships only as a new versioned benchmark with the diff
stated.

1. **Remove or relabel the vestigial `GLASS_WEIGHTS`.** `glassbench/__init__.py` still
   defines `GLASS_WEIGHTS` (cwr 0.30 / aurc 0.25 / abst_contra 0.15 / abst_false 0.15 /
   ece 0.10 / brier 0.05) with a comment calling them the "Frozen Glass Score weights".
   These are the *abandoned additive-draft* weights — the v0.1 composite is
   `100·HM(answer_pillar, safety_pillar)·(1 − CWR)` and uses **none** of them. The scorer
   still imports them and emits `"weights": {…}` in every result's JSON and rendered
   table, which can mislead a reader into thinking the discredited additive scheme is
   live. They do **not** affect any score (the composite does not read them). Because
   `glassbench/__init__.py` and `glassbench/score.py` are part of the frozen v0.1 surface
   (byte-identical to tag `v0.1-prereg`), v0.1 leaves them untouched; v0.2 should either
   delete `GLASS_WEIGHTS` and the `"weights"` output field, or replace it with an accurate
   descriptor of the harmonic-mean composite (e.g.
   `{"formula": "100*HM(answer_pillar,safety_pillar)*(1-CWR)", "cwr_threshold": 0.70,
   "abstain_threshold": 0.5}`) and fix the `__init__` comment.
