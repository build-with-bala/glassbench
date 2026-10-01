#!/usr/bin/env python3
"""Export per-item results for every submission to ``results/item_results.json``.

The leaderboard says *how much* a system is confidently wrong; this file says *where*.
For every scored submission in ``submissions/`` and every benchmark item it records what
the frozen scorer decided: answered or abstained, at what confidence, correct or not, and
whether the item counted towards the Confidently-Wrong Rate.

This is *tooling around* the frozen contract, exactly like ``gen_leaderboard.py``:

* It scores nothing itself. Per-item facts come from ``glassbench.score.evaluate_items``
  (via ``glassbench.results``) and per-system / per-split numbers from
  ``glassbench.score.score`` — the same code everyone runs.
* It never touches the Glass Score formula, the metrics, the splits, the data or the
  pre-registration, and it does not include gold answers or conversation histories
  (those stay in ``data/glassbench_v0.1.jsonl``).
* Systems appear in board order (ranked systems, then the excluded reference ceilings)
  and items in data order, so the output is deterministic. Scorer-derived floats are
  rounded to 6 decimals so the bytes are stable across platforms; confidences are the
  submitted values.

The public site (``web/``) reads this file for its system pages, item explorer and
compare view, and re-serves it at ``/api``. The site never recomputes a score.

Usage::

    python scripts/export_results.py            # write results/item_results.json
    python scripts/export_results.py --check    # verify byte-stable, write nothing
    python scripts/export_results.py --stdout   # print to stdout, write nothing
"""

from __future__ import annotations

import argparse
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(_HERE)
for _path in (_REPO_ROOT, _HERE):
    if _path not in sys.path:
        sys.path.insert(0, _path)

import gen_leaderboard as board  # noqa: E402  (sibling script: discovery, ordering, ranks)
from glassbench import __version__  # noqa: E402
from glassbench.results import (  # noqa: E402
    OUTCOME_DEFINITIONS,
    item_outcomes,
    system_summary,
    thresholds,
)
from glassbench.score import load_data, load_predictions  # noqa: E402

ITEM_RESULTS_PATH = os.path.join(board.RESULTS_DIR, "item_results.json")

# Scorer-derived floats are rounded to this many decimals in the export.
FLOAT_DECIMALS = 6


def _round(value):
    """Recursively round floats (not ints/bools) so the bytes are platform-stable."""
    if isinstance(value, float):
        return round(value, FLOAT_DECIMALS) + 0.0  # + 0.0 normalises -0.0
    if isinstance(value, dict):
        return {k: _round(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_round(v) for v in value]
    return value


def _system_md(name: str) -> str | None:
    path = os.path.join(board.SUBMISSIONS_DIR, name, "system.md")
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read()


def build_results(data: list[dict], data_path: str = board.DATA_PATH) -> dict:
    """The full per-item results document as a plain dict."""
    ranked, refs = board.ranked_and_references(data)
    ordered = [(row["name"], "ranked", rank) for rank, row in ranked]
    ordered += [(row["name"], "reference", None) for row in refs]

    systems = []
    per_system_rows: dict[str, dict[str, dict]] = {}
    for name, kind, rank in ordered:
        preds = load_predictions(os.path.join(board.SUBMISSIONS_DIR, name, "predictions.json"))
        rows = item_outcomes(data, preds)
        per_system_rows[name] = {row["id"]: row for row in rows}
        entry = {"system": name, "kind": kind, "rank": rank}
        entry.update(_round(system_summary(data, preds, rows)))
        entry["system_md"] = _system_md(name)
        systems.append(entry)

    items = []
    for item in data:
        item_id = item["id"]
        results = {}
        split = None
        for name, _kind, _rank in ordered:
            row = per_system_rows[name][item_id]
            split = row["split"]
            results[name] = {
                "outcome": row["outcome"],
                "answered": row["answered"],
                "abstention": row["abstention"],
                # The submitted confidence, verbatim (clamped to [0, 1] by the scorer).
                "confidence": row["confidence"],
                "correct": row["correct"],
                "confidently_wrong": row["confidently_wrong"],
                "answer": row["answer"],
            }
        items.append({"id": item_id, "split": split, "results": results})

    try:
        data_file = os.path.relpath(os.path.abspath(data_path), _REPO_ROOT).replace(os.sep, "/")
    except ValueError:  # different drive on Windows
        data_file = os.path.basename(data_path)

    return {
        "benchmark": "GlassBench",
        "version": ".".join(__version__.split(".")[:2]),
        "data_file": data_file,
        "n_items": len(data),
        "split_counts": board.split_counts(data),
        "thresholds": thresholds(),
        "outcomes": [dict(o) for o in OUTCOME_DEFINITIONS],
        "systems": systems,
        "items": items,
    }


def build_results_json(data: list[dict], data_path: str = board.DATA_PATH) -> str:
    """Deterministic bytes of ``results/item_results.json``."""
    return json.dumps(build_results(data, data_path), indent=1) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="export_results.py",
        description="Export per-item results for every submission (deterministic).",
    )
    parser.add_argument("--data", default=board.DATA_PATH, help="benchmark JSONL with gold")
    parser.add_argument("--out", default=ITEM_RESULTS_PATH, help="output JSON path")
    parser.add_argument(
        "--stdout", action="store_true", help="print to stdout, do not write the file"
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="exit nonzero if the generated export differs from --out (writes nothing)",
    )
    args = parser.parse_args(argv)

    data = load_data(args.data)
    content = build_results_json(data, args.data)

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
            f"FAIL: generated per-item results differ from {args.out}.\n"
            "Run without --check to regenerate.\n"
        )
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

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(content)
    sys.stderr.write(f"wrote {args.out} ({len(content)} bytes)\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
