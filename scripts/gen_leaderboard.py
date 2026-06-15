#!/usr/bin/env python3
"""Generate ``LEADERBOARD.md`` from the submissions in ``submissions/``.

This is *tooling around* the frozen contract — it never touches the Glass Score formula,
the metric definitions, the splits, the data, or the pre-registration. It only:

1. scores EVERY eligible submission with :func:`glassbench.score.score` (the same
   deterministic code everyone runs), and
2. renders the ranked Markdown table, the diagnostics table, the separately-listed
   reference ceilings, and the (static) honest-reading prose.

Determinism / byte-stability
----------------------------
The scorer is deterministic by contract, so the only freedom this script has is *ordering*
and *number formatting*. Both are fixed:

* Real systems are sorted by ``(GlassScore desc, AnswerableAccuracy desc, name asc)`` —
  Glass first (the ranking metric), then answer quality as the tiebreak so two systems
  tied at Glass 0.00 are ordered by how much they actually answer (``always_answer`` above
  ``always_abstain``), then the folder name as a final deterministic tiebreak.
* Ranks use standard competition ranking (``1,2,3,4,4``) on the 2-decimal Glass value, so
  genuine ties (both 0.00) share a rank.
* References (constructed-from-gold ceilings) are listed separately, sorted by Glass desc.
* Number formats match the frozen leaderboard exactly (Glass/AnsAcc varying decimals, etc).

Running it on the shipped submissions reproduces the committed ``LEADERBOARD.md``
byte-for-byte. Use ``--check`` to assert that without writing.

Eligibility
-----------
* The ``EXAMPLE`` folder is the submission-contract *template* (its ids are not in the
  scored data); it is skipped.
* A submission is a **reference ceiling** (excluded from the ranking, shown separately) if
  its ``system.md`` declares it constructed-from-gold — detected by the explicit markers
  the reference docs use ("constructed", "oracle", "not a real ... run", "excluded from the
  headline ranking"). Everything else is a genuine ranked system.

Usage::

    python scripts/gen_leaderboard.py                 # write LEADERBOARD.md
    python scripts/gen_leaderboard.py --check         # verify byte-stable, write nothing
    python scripts/gen_leaderboard.py --stdout        # print to stdout, write nothing
"""

from __future__ import annotations

import argparse
import os
import sys

# Make the repo root importable whether run as a script or a module.
_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(_HERE)
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from glassbench.score import load_data, load_predictions, score  # noqa: E402

SUBMISSIONS_DIR = os.path.join(_REPO_ROOT, "submissions")
DATA_PATH = os.path.join(_REPO_ROOT, "data", "glassbench_v0.1.jsonl")
LEADERBOARD_PATH = os.path.join(_REPO_ROOT, "LEADERBOARD.md")

# Folders that are not leaderboard rows: the contract template.
SKIP_FOLDERS = {"EXAMPLE"}

# Lowercased substrings in system.md that mark a constructed-from-gold reference ceiling.
# Deliberately specific: a genuine system (e.g. agent_llm) may *mention* the word
# "constructed" when contrasting itself with a reference, so "constructed" alone is NOT a
# marker — only these self-declarations of being a constructed/excluded reference are.
REFERENCE_MARKERS = (
    "oracle reference",
    "not a real model run",
    "not a real system submission",
    "excluded from the headline",
)

# ---------------------------------------------------------------------------------
# Static prose — copied verbatim from the frozen LEADERBOARD.md. None of this is
# computed; it is the human-written framing the benchmark ships with. The tables in
# between are filled from the scorer.
# ---------------------------------------------------------------------------------

_HEADER = """# GlassBench v0.1 — Leaderboard

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
"""

_RANKED_TABLE_HEADER = (
    "| # | system | Glass | CWR ↓ | AURC_norm ↓ | AbstRec_contra ↑ | "
    "AbstRec_fp ↑ | ECE ↓ | Brier ↓ |\n"
    "|---|---|---:|---:|---:|---:|---:|---:|---:|"
)

_AFTER_RANKED = """
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
"""

_DIAG_TABLE_HEADER = (
    "| system | CWR_macro ↓ | ECE_macro ↓ | Brier_macro ↓ | "
    "AnswerableAccuracy ↑ | answered / abstained |\n"
    "|---|---:|---:|---:|---:|---:|"
)

_AFTER_DIAG = """
## Reference entries (excluded from the ranking)

These are **not real model runs** — they are constructed from the gold labels (perfect or
split-keyed routing/confidence) and would be **rejected as submissions** under
`CONTRIBUTING.md`. They are shown only to mark the top of the scale. Treat them as ceilings,
not competitors.
"""

_REF_TABLE_HEADER = (
    "| reference | Glass | CWR ↓ | AURC_norm ↓ | AbstRec_contra ↑ | AbstRec_fp ↑ | "
    "ECE ↓ | Brier ↓ | AnsAcc | what it is |\n"
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---|"
)

# What-it-is blurbs for the reference rows, keyed by folder name. If a reference has no
# entry here, a neutral fallback derived from its system.md first line is used.
_REF_WHATIS = {
    "abstention_aware_llm": "oracle: perfect answer/abstain routing",
    "verbalized_confidence_llm": "constructed: confidence keyed to the split label",
}

_AFTER_REF = """
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
"""


# ---------------------------------------------------------------------------------
# Scoring & classification
# ---------------------------------------------------------------------------------


def _read_system_md(folder: str) -> str:
    path = os.path.join(SUBMISSIONS_DIR, folder, "system.md")
    if not os.path.exists(path):
        return ""
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read()


def is_reference(folder: str) -> bool:
    """A submission is a constructed-from-gold *reference ceiling* if its system.md says so.

    Detected by the explicit markers the reference docs carry. This keeps the ranked board
    free of planted near-oracles without hard-coding which names are references.
    """
    text = _read_system_md(folder).lower()
    return any(marker in text for marker in REFERENCE_MARKERS)


def discover_submissions() -> list[str]:
    """Return sorted folder names under submissions/ that hold a predictions.json, minus
    the skipped template folders."""
    out = []
    for name in sorted(os.listdir(SUBMISSIONS_DIR)):
        if name in SKIP_FOLDERS:
            continue
        folder = os.path.join(SUBMISSIONS_DIR, name)
        if not os.path.isdir(folder):
            continue
        if os.path.exists(os.path.join(folder, "predictions.json")):
            out.append(name)
    return out


def score_submission(name: str, data: list[dict]) -> dict:
    """Score one submission and return a flat dict of the values the tables need."""
    preds_path = os.path.join(SUBMISSIONS_DIR, name, "predictions.json")
    preds = load_predictions(preds_path)
    result = score(data, preds)
    m = result["metrics"]
    d = result["diagnostics"]
    return {
        "name": name,
        "glass": m["GlassScore"],
        "cwr": m["CWR"],
        "aurc_norm": m["AURC_norm"],
        "abst_contra": m["AbstentionRecall_contradiction"],
        "abst_false": m["AbstentionRecall_false_premise"],
        "ece": m["ECE"],
        "brier": m["Brier"],
        "cwr_macro": d["CWR_macro"],
        "ece_macro": d["ECE_macro"],
        "brier_macro": d["Brier_macro"],
        "ans_acc": d["AnswerableAccuracy"],
        "n_answered": result["n_answered"],
        "n_abstained": result["n_abstained"],
        "is_reference": is_reference(name),
    }


# ---------------------------------------------------------------------------------
# Ordering & ranking
# ---------------------------------------------------------------------------------


def _rank_sort_key(row: dict):
    # Glass desc, then answer quality desc as the tiebreak, then name asc. Negated for desc.
    return (-row["glass"], -row["ans_acc"], row["name"])


def assign_ranks(rows: list[dict]) -> list[tuple[int, dict]]:
    """Standard competition ranking on the 2-decimal Glass value (so 0.00 ties share a
    rank). Rows must already be sorted by ``_rank_sort_key``."""
    ranked: list[tuple[int, dict]] = []
    prev_glass = None
    rank = 0
    for i, row in enumerate(rows, start=1):
        g = round(row["glass"], 2)
        if prev_glass is None or g != prev_glass:
            rank = i
            prev_glass = g
        ranked.append((rank, row))
    return ranked


# ---------------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------------


def _ref_whatis(name: str) -> str:
    if name in _REF_WHATIS:
        return _REF_WHATIS[name]
    # Fallback: first non-empty, non-heading line of system.md, trimmed.
    for line in _read_system_md(name).splitlines():
        line = line.strip().lstrip("#> ").strip()
        if line:
            return line
    return "constructed reference"


def render_ranked_table(rows: list[dict]) -> str:
    ranked = assign_ranks(rows)
    lines = [_RANKED_TABLE_HEADER]
    for rank, r in ranked:
        lines.append(
            f"| {rank} | {r['name']} | {r['glass']:.2f} | {r['cwr']:.3f} | "
            f"{r['aurc_norm']:.3f} | {r['abst_contra']:.2f} | {r['abst_false']:.2f} | "
            f"{r['ece']:.3f} | {r['brier']:.3f} |"
        )
    return "\n".join(lines)


def render_diag_table(rows: list[dict]) -> str:
    lines = [_DIAG_TABLE_HEADER]
    for r in rows:
        lines.append(
            f"| {r['name']} | {r['cwr_macro']:.3f} | {r['ece_macro']:.3f} | "
            f"{r['brier_macro']:.3f} | {r['ans_acc']:.3f} | "
            f"{r['n_answered']} / {r['n_abstained']} |"
        )
    return "\n".join(lines)


def render_ref_table(rows: list[dict]) -> str:
    lines = [_REF_TABLE_HEADER]
    for r in rows:
        lines.append(
            f"| {r['name']} | {r['glass']:.2f} | {r['cwr']:.3f} | {r['aurc_norm']:.3f} | "
            f"{r['abst_contra']:.2f} | {r['abst_false']:.2f} | {r['ece']:.3f} | "
            f"{r['brier']:.3f} | {r['ans_acc']:.3f} | {_ref_whatis(r['name'])} |"
        )
    return "\n".join(lines)


def build_leaderboard(data: list[dict]) -> str:
    rows = [score_submission(n, data) for n in discover_submissions()]
    real = sorted((r for r in rows if not r["is_reference"]), key=_rank_sort_key)
    refs = sorted((r for r in rows if r["is_reference"]), key=_rank_sort_key)

    # Each static block already carries its own surrounding blank lines (its triple-quoted
    # text ends in a newline), so the tables are concatenated directly after a single "\n".
    parts = [
        _HEADER,
        render_ranked_table(real),
        _AFTER_RANKED,
        render_diag_table(real),
        _AFTER_DIAG,
        render_ref_table(refs),
        _AFTER_REF,
    ]
    return "\n".join(parts)


# ---------------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="gen_leaderboard.py",
        description="Regenerate LEADERBOARD.md from submissions/ (deterministic).",
    )
    parser.add_argument("--data", default=DATA_PATH, help="benchmark JSONL with gold")
    parser.add_argument("--out", default=LEADERBOARD_PATH, help="output markdown path")
    parser.add_argument(
        "--stdout", action="store_true", help="print to stdout, do not write the file"
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="exit nonzero if the generated leaderboard differs from --out (writes nothing)",
    )
    args = parser.parse_args(argv)

    data = load_data(args.data)
    content = build_leaderboard(data)

    if args.check:
        if not os.path.exists(args.out):
            sys.stderr.write(f"FAIL: {args.out} does not exist\n")
            return 1
        with open(args.out, "r", encoding="utf-8") as fh:
            existing = fh.read()
        if existing == content:
            sys.stderr.write(f"OK: {args.out} is up to date (byte-stable).\n")
            return 0
        sys.stderr.write(
            f"FAIL: generated leaderboard differs from {args.out}.\n"
            "Run without --check to regenerate.\n"
        )
        # Show a compact first-difference hint.
        a, b = existing.splitlines(), content.splitlines()
        for i in range(max(len(a), len(b))):
            la = a[i] if i < len(a) else "<EOF>"
            lb = b[i] if i < len(b) else "<EOF>"
            if la != lb:
                sys.stderr.write(f"  first diff at line {i + 1}:\n")
                sys.stderr.write(f"    on disk:   {la!r}\n")
                sys.stderr.write(f"    generated: {lb!r}\n")
                break
        return 1

    if args.stdout:
        sys.stdout.write(content)
        return 0

    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(content)
    sys.stderr.write(f"wrote {args.out} ({len(content)} bytes)\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
