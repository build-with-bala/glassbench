# GlassBench

### Every memory benchmark asks *"did it remember?"* This one asks *"does it know when it didn't?"*

Modern LLM memory systems — long-context models, RAG, MemGPT/Letta, Mem0, Zep, and
the rest — are all scored the same way: **accuracy**. Did the system retrieve the
right fact? But a memory you deploy to real users fails in a way accuracy never
catches: it answers *confidently* when the fact has changed, was retracted, or was
never stated at all. It doesn't know when it's wrong.

**GlassBench measures that.** One number leads the board:

> ## Confidently-Wrong Rate (CWR)
> The fraction of queries where the system gives a **wrong or unsupported answer with
> high stated confidence** (≥ 0.7). Lower is better. Most systems have never measured it.

Plus the full calibration picture nobody reports: selective accuracy (risk–coverage),
abstention on genuinely unanswerable queries, ECE, and Brier.

---

## Why this is fair (read this first)

A benchmark built to make its author win is worthless. GlassBench is built the
opposite way:

- **Real public data.** Tasks are derived from [LongMemEval](https://github.com/xiaowu0162/LongMemEval)
  (ICLR 2025, MIT) — real multi-session conversations, not hand-picked wins.
- **It includes tasks that are hard for *everyone*.** Two of the four splits are
  *unanswerable* — the honest answer is "I don't know." One of those (false-premise)
  is hard for calibration-based systems too, not just retrieval ones. We did not
  remove the cases our own future entry fails.
- **Standard metrics.** AURC, ECE, Brier, high-confidence error rate. Nothing invented
  to flatter a particular architecture.
- **The design was frozen before any system was scored** — see
  [`PRE_REGISTRATION.md`](PRE_REGISTRATION.md), committed in a tagged commit before any
  predictions. Splits, metrics, and the Glass Score formula cannot be edited to chase a
  result.
- **The harness is open and deterministic.** Submit a predictions file; the scorer is
  the same for everyone. Run it yourself.

### What "fair" does and does not mean here (no over-claiming)

The Glass Score is a **selective-behaviour score**: the harmonic mean of an answer pillar
(did you get the answerable items right?) and a safety pillar (did you abstain on the
unanswerable ones?), scaled by a confident-wrong penalty. **No degenerate strategy beats
genuine selective behaviour** — and we say exactly why, up front. The scorer applies a
**single answer/abstain decision**: a stated `confidence < 0.5` is treated as an abstention
**everywhere** (the answer pillar too, not just the safety pillar), so the confidence field
can't be set independently of behaviour. The consequences:

- **A do-nothing always-abstain agent scores ≈ 0**, because its `AnswerableAccuracy` is 0
  — the answer pillar collapses, so the harmonic mean (and the whole score) is 0. Silence
  earns you nothing here.
- **An answer-everything system scores ≈ 0**, because answering every query drops its
  abstention recall to 0 — the safety pillar collapses, so the score is 0. (The
  `always_answer` baseline answers at confidence 0.9 and scores 0.00.) Reckless answering
  earns you nothing.
- **Answering everything at a low confidence to *fake* abstention also scores ≈ 0.** Because
  `confidence < 0.5` is treated as an abstention everywhere, an answer-everything entry that
  writes `0.49` (or any value below 0.5) on every item has its answer pillar zeroed — so it
  scores 0 too. Answer-everything at a fixed 0.49, 0.60, or 0.69 all score **0.00** (verified):
  below 0.5 collapses the answer pillar, ≥ 0.5 collapses the safety pillar. There is no
  confidence value that games both at once.
- **Only genuine selective behaviour wins.** You have to answer what you know *and* abstain
  on what you don't *and* keep your confidently-wrong rate low. Full decomposition in
  [`PRE_REGISTRATION.md`](PRE_REGISTRATION.md) → "What the Glass Score rewards."

> **On the CWR band.** `CWR` specifically targets **high-confidence** errors — it penalises an
> answer that is wrong *and* stated at `confidence ≥ 0.70`. A wrong answer at lower confidence
> is **not** invisible: it is still penalised by AURC, ECE, Brier, and (because answering an
> unanswerable item is incorrect) by the answer/safety pillars. This is by design, not a gap —
> CWR isolates the *confidently*-wrong failure that most harms a deployed product, while the
> other metrics catch the rest. It is **not** an exploit: answering everything (at any
> confidence) zeroes a pillar and scores 0 regardless of the band CWR happens to penalise.
- What GlassBench *is*: the same open, deterministic, frozen scorer for everyone, with
  **all six components plus an `AnswerableAccuracy` and split-balanced (macro) diagnostics
  always printed**, so a high score can never hide weak answers and answer quality is
  always visible. Read the components, not just the composite.
- The shipped split counts are **not** equal (answerable 43 / stale 11 / contradiction 12
  / false-premise 30) — they are source-limited; this, and the macro diagnostics that
  compensate, are disclosed in the pre-registration. The top reference row
  (`abstention_aware_llm`) is a **constructed oracle reference**, excluded from the
  ranking; the genuine imperfect agent is `agent_llm`.

If your system scores well here, it earned it — a high Glass Score means you answered well
*and* abstained well *and* stayed calibrated, not just one of the three. If ours scores
well (it isn't on the board yet — submit yours first), the same scorer said so.

---

## The task

For each item you are given a multi-session conversation `history` and a `query`.
Your system returns, per item:

```json
{"id": "...", "answer": "Seattle", "confidence": 0.91}
```

or, if it judges the query unanswerable from the history:

```json
{"id": "...", "abstain": true}
```

`confidence` is your system's own calibrated probability that its answer is correct.
Abstaining is equivalent to confidence below your own action threshold.

### The four splits

| Split | What it is | Honest behaviour |
|---|---|---|
| **answerable** | the fact is determinable from history | answer, high confidence |
| **stale** | a fact stated long ago that may have drifted | answer, but confidence should reflect age |
| **contradiction** | a fact was asserted then **retracted** with no replacement | **abstain** |
| **false-premise** | the query asks about something **never stated** | **abstain** |

`contradiction` and `false-premise` are the unanswerable splits. A system that
always answers scores 0 abstention recall on them; a system that always abstains scores
0 on `answerable`. You have to actually know which is which. (A stated `confidence < 0.5`
is treated as an abstention everywhere under the single answer/abstain decision, so you
cannot answer an unanswerable item "safely" by writing a low confidence — it counts as
not answering, on the answer pillar too.)

---

## Metrics

| Metric | Question it answers | Better |
|---|---|---|
| **Confidently-Wrong Rate (CWR)** | how often are you confidently wrong? | lower |
| **AURC** (area under risk–coverage) | how good is your accuracy when you choose to answer? | lower |
| **Abstention recall** (per unanswerable split) | do you abstain when you should? — reported separately for contradiction vs false-premise | higher |
| **ECE** (pooled, bias-corrected) | is your stated confidence calibrated to correctness? | lower |
| **Brier** | overall probabilistic quality | lower |
| **Glass Score** | transparent 0–100 composite: harmonic mean of answer & safety pillars × (1 − CWR) (formula in PRE_REGISTRATION) | higher |

The Glass Score is a convenience; **all components are always shown** so no system can
hide behind one number. The scorer additionally prints **reported-only diagnostics that
are NOT in the composite**: split-balanced (macro) CWR / ECE / Brier — so the unequal
split sizes don't let the big splits dominate — and a plain **AnswerableAccuracy** (the
fraction of answerable items answered correctly), so answer quality is always visible
next to the composite.

---

## Quickstart

The scorer needs only **numpy**. Every command below is run from the repo root and works
as written (CI runs the same ones). A `Makefile` wraps each as a target — the `make`
equivalent is shown beside it.

**1. Install** (editable package + test deps):

```bash
pip install -e ".[dev]"            # or: pip install -r requirements.txt   |  make install
```

**2. Rebuild the data** from the public LongMemEval oracle release (deterministic —
reproduces the committed `data/glassbench_v0.1.jsonl` byte-for-byte; 96 items).

GlassBench does **not** redistribute the upstream corpus, so first obtain the source the
builder reads. The exact artifact is the LongMemEval **`longmemeval_oracle.json`** (~15 MB),
downloaded from the public [LongMemEval HuggingFace release](https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned)
to `data/longmemeval_oracle.json`:

```bash
mkdir -p data
curl -fSL 'https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_oracle.json' \
  -o data/longmemeval_oracle.json
# Confirm you have the byte-identical input GlassBench v0.1 was built from:
shasum -a 256 data/longmemeval_oracle.json
# expected: 821a2034d219ab45846873dd14c14f12cfe7776e73527a483f9dac095d38620c
```

Then build:

```bash
python -m glassbench.build_data    # writes data/glassbench_v0.1.jsonl     |  make data
```

(If the source is missing, `build_data` exits with this same download command and checksum.)

**3. Score a submission** (full table + JSON; the same scorer everyone runs):

```bash
python -m glassbench.score --predictions submissions/agent_llm/predictions.json   # make score EXAMPLE=...
```

**4. Reproduce the baselines** (no API key; each writes its
`submissions/<name>/predictions.json` byte-identically):

```bash
python baselines/always_answer.py        # answers everything (recency); high CWR floor
python baselines/always_abstain.py       # abstains everywhere; collapses on answerable
python baselines/bm25_retrieval.py       # retrieves best history sentence; score->conf
python baselines/random_confidence.py    # answers all, uniform-random conf (calib floor)
python baselines/agent_llm.py            # genuine imperfect abstention-aware agent
```

To score a real LLM instead, use the generic adapter (`baselines/llm_adapter.py`, needs
an `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`) — see [`baselines/README.md`](baselines/README.md).
`abstention_aware_llm` and `verbalized_confidence_llm` are constructed oracle references
(shipped as cached predictions, excluded from the ranking), not regenerated by a script.

**5. Validate a submission** against the contract before scoring:

```bash
python scripts/validate_submission.py submissions/agent_llm/predictions.json   # make validate EXAMPLE=...
```

**6. Regenerate the leaderboard** (deterministic — reproduces the committed
`LEADERBOARD.md` byte-for-byte; `--check` asserts byte-stability without writing):

```bash
python scripts/gen_leaderboard.py          # writes LEADERBOARD.md          |  make leaderboard
```

**Tests** (data-integrity + metric tests):

```bash
python -m pytest -q                                                          # make test
```

---

## Submit

1. Run your system on `data/glassbench_v0.1.jsonl`, produce a `predictions.json` (one row
   per `id`: `{"id","answer","confidence"}` to answer, `{"id","abstain":true}` to abstain).
2. Validate it: `python scripts/validate_submission.py submissions/<your_system>/predictions.json`.
3. Open a PR adding `submissions/<your_system>/predictions.json` + a one-line system
   description (`system.md`). See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full contract.
4. CI runs the scorer; your row appears on the [leaderboard](LEADERBOARD.md).

No system is privileged. The authors' own system is **not yet listed** — by design.
Bring yours.

For the dataset's construction, splits, and known limitations, see
[`DATASHEET.md`](DATASHEET.md).

---

*GlassBench is released under MIT. It measures one thing existing memory benchmarks
don't: whether a system knows the limits of what it knows.*
