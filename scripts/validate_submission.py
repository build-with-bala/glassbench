#!/usr/bin/env python3
"""Validate a GlassBench ``predictions.json`` against the frozen submission contract.

This is *tooling around* the contract in ``CONTRIBUTING.md`` ("What makes a submission
valid") and ``PRE_REGISTRATION.md``. It does NOT score and does NOT touch the frozen
formula/metrics/splits/data — it only checks that a submission file is *well-formed and
legal* before it is scored, and exits nonzero with clear, line-itemized errors if not.

A submission is **rejected** (per CONTRIBUTING.md) if it:

* is not a JSON array (or ``{"predictions": [...]}``) of per-item objects;
* contains a row that is not one of the two allowed shapes —
  ``{"id", "answer", "confidence"}`` (answered) or ``{"id", "abstain": true}`` (abstained);
* has a ``confidence`` outside ``[0, 1]`` (or non-numeric);
* contains duplicate ``id``s;
* contains an ``id`` not present in the scored data version;
* leaks gold: a prediction row carries any label/gold field
  (``gold_answer``, ``split``, ``evidence_spans``, ``answer_topic``, ``source_id``),
  or the file otherwise smuggles the dataset's gold (e.g. an answer that is byte-identical
  to the gold across the board on the *unanswerable* splits, which is only possible by
  reading labels).

Allowed (NOT errors), by contract:

* **Omitting items** — missing ids are scored as abstentions, so a submission need not
  list every id. (A WARNING is printed for visibility, never an error.)
* Abstaining everywhere or answering everywhere — honest baselines.

Usage::

    python scripts/validate_submission.py submissions/<name>/predictions.json
    python scripts/validate_submission.py --data data/glassbench_v0.1.jsonl <preds.json>
    python scripts/validate_submission.py --strict <preds.json>   # warnings are errors

Exit codes: ``0`` valid, ``1`` invalid (contract violation), ``2`` usage/IO error.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(_HERE)
DEFAULT_DATA = os.path.join(_REPO_ROOT, "data", "glassbench_v0.1.jsonl")

# Frozen valid confidence range.
CONF_MIN, CONF_MAX = 0.0, 1.0

# Fields that only exist in the gold dataset. Their presence in a *prediction* row means the
# submitter copied the dataset object instead of producing a clean prediction — i.e. gold
# leakage. ``answer`` and ``confidence`` are legitimate prediction fields and are excluded.
GOLD_ONLY_FIELDS = ("gold_answer", "split", "evidence_spans", "answer_topic", "source_id")

# The keys a valid prediction row may contain.
ALLOWED_ANSWER_KEYS = {"id", "answer", "confidence"}
ALLOWED_ABSTAIN_KEYS = {"id", "abstain"}


def _normalize_split(split) -> str:
    if split is None:
        return ""
    return str(split).strip().lower().replace("-", "_").replace(" ", "_")


def load_gold(data_path: str) -> dict:
    """Return ``{id: {"split", "gold_answer"}}`` for the scored data version."""
    if not os.path.exists(data_path):
        raise FileNotFoundError(
            f"data file not found: {data_path}\n"
            "Pass --data <jsonl>, or build it with `python -m glassbench.build_data`."
        )
    gold: dict = {}
    with open(data_path, "r", encoding="utf-8") as fh:
        for line_no, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{data_path}:{line_no}: invalid JSON: {exc}") from exc
            if "id" not in obj or "split" not in obj:
                raise ValueError(f"{data_path}:{line_no}: item needs 'id' and 'split'")
            gold[obj["id"]] = {
                "split": _normalize_split(obj.get("split")),
                "gold_answer": obj.get("gold_answer"),
            }
    return gold


def validate(preds_path: str, gold: dict) -> tuple[list[str], list[str]]:
    """Return ``(errors, warnings)``. Empty ``errors`` == valid submission."""
    errors: list[str] = []
    warnings: list[str] = []

    # --- file loads as JSON -------------------------------------------------------
    try:
        with open(preds_path, "r", encoding="utf-8") as fh:
            raw = json.load(fh)
    except FileNotFoundError:
        return [f"predictions file not found: {preds_path}"], []
    except json.JSONDecodeError as exc:
        return [f"predictions file is not valid JSON: {exc}"], []

    if isinstance(raw, dict) and "predictions" in raw:
        raw = raw["predictions"]
    if not isinstance(raw, list):
        return ["predictions must be a JSON array (or {'predictions': [...]})"], []
    if not raw:
        return ["predictions array is empty — no predictions to score"], []

    valid_ids = set(gold.keys())
    unanswerable_ids = {i for i, g in gold.items() if g["split"] in ("contradiction", "false_premise")}

    seen_ids: set = set()
    unanswerable_gold_echo = 0  # rows that answered an unanswerable item with its exact gold
    unanswerable_answered = 0

    for idx, row in enumerate(raw):
        loc = f"row {idx}"
        if not isinstance(row, dict):
            errors.append(f"{loc}: each prediction must be a JSON object, got {type(row).__name__}")
            continue

        # id present
        if "id" not in row:
            errors.append(f"{loc}: missing required 'id'")
            continue
        item_id = row["id"]
        loc = f"row {idx} (id={item_id!r})"

        # id is in the scored data version
        if item_id not in valid_ids:
            errors.append(f"{loc}: id is not present in the scored data version")

        # duplicate id
        if item_id in seen_ids:
            errors.append(f"{loc}: duplicate id (each id may appear at most once)")
        seen_ids.add(item_id)

        # gold leakage: prediction row carries a gold-only field
        leaked = [k for k in GOLD_ONLY_FIELDS if k in row]
        if leaked:
            errors.append(
                f"{loc}: gold leakage — prediction carries label field(s) "
                f"{', '.join(leaked)}; predictions may only contain id/answer/confidence/abstain"
            )

        # shape check: abstain vs answer
        is_abstain = row.get("abstain") is True
        has_abstain_key = "abstain" in row

        if has_abstain_key and row.get("abstain") is not True:
            errors.append(
                f"{loc}: 'abstain' must be the literal true; "
                f"got {row.get('abstain')!r} (omit the key to answer)"
            )

        if is_abstain:
            # Abstain shape: only id (+ abstain). Extra non-gold keys are flagged.
            extra = set(row.keys()) - ALLOWED_ABSTAIN_KEYS - set(GOLD_ONLY_FIELDS)
            if "answer" in row or "confidence" in row:
                warnings.append(
                    f"{loc}: abstain row also has answer/confidence; "
                    "they are ignored (scored as confidence 0)"
                )
                extra -= {"answer", "confidence"}
            if extra:
                warnings.append(f"{loc}: unexpected extra key(s) {sorted(extra)} ignored")
        else:
            # Answer shape: must have a confidence in [0,1].
            if "confidence" not in row:
                errors.append(
                    f"{loc}: answered prediction is missing 'confidence' "
                    "(your calibrated P(answer correct) in [0,1])"
                )
            else:
                conf = row["confidence"]
                if isinstance(conf, bool) or not isinstance(conf, (int, float)):
                    errors.append(f"{loc}: 'confidence' must be a number in [0,1], got {conf!r}")
                else:
                    cf = float(conf)
                    if not (CONF_MIN <= cf <= CONF_MAX):
                        errors.append(
                            f"{loc}: 'confidence' {cf} is outside [0,1]"
                        )
            if "answer" not in row:
                warnings.append(
                    f"{loc}: answered prediction has no 'answer' field "
                    "(it will be scored as an empty/incorrect answer)"
                )
            extra = set(row.keys()) - ALLOWED_ANSWER_KEYS - set(GOLD_ONLY_FIELDS)
            if extra:
                warnings.append(f"{loc}: unexpected extra key(s) {sorted(extra)} ignored")

            # Gold-echo leakage signal: this row answered an *unanswerable* item with text
            # exactly equal to that item's gold field. Unanswerable items have gold "ABSTAIN"
            # (no answer to legitimately produce), so reproducing the gold is a leak signal.
            if item_id in unanswerable_ids:
                unanswerable_answered += 1
                ga = gold[item_id]["gold_answer"]
                ans = row.get("answer")
                if ga is not None and ans is not None and str(ans).strip() == str(ga).strip():
                    unanswerable_gold_echo += 1

    # Aggregate gold-echo signal: only meaningful if it answered unanswerable items and
    # *every* such answer reproduces the gold string verbatim (≥2 items), which a label-free
    # system cannot do. A single coincidence is not flagged.
    if unanswerable_gold_echo >= 2 and unanswerable_gold_echo == unanswerable_answered:
        errors.append(
            f"gold leakage — all {unanswerable_gold_echo} answered unanswerable-split "
            "items reproduce the gold field verbatim; this is only possible by reading labels"
        )

    # --- coverage warnings (NOT errors — missing ids are scored as abstentions) ---
    listed = {r["id"] for r in raw if isinstance(r, dict) and "id" in r}
    missing = valid_ids - listed
    if missing:
        warnings.append(
            f"{len(missing)} of {len(valid_ids)} data ids are not listed; "
            "they will be scored as abstentions (allowed by the contract)"
        )

    return errors, warnings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="validate_submission.py",
        description="Validate a GlassBench predictions.json against the submission contract.",
    )
    parser.add_argument("predictions", help="path to the predictions.json to validate")
    parser.add_argument("--data", default=DEFAULT_DATA, help="benchmark JSONL with gold")
    parser.add_argument(
        "--strict", action="store_true", help="treat warnings as errors (exit nonzero)"
    )
    parser.add_argument("--quiet", action="store_true", help="only print on failure")
    args = parser.parse_args(argv)

    try:
        gold = load_gold(args.data)
    except (FileNotFoundError, ValueError) as exc:
        sys.stderr.write(f"ERROR loading data: {exc}\n")
        return 2

    errors, warnings = validate(args.predictions, gold)

    name = os.path.basename(os.path.dirname(os.path.abspath(args.predictions))) or args.predictions

    if warnings:
        for w in warnings:
            sys.stderr.write(f"WARN  [{name}] {w}\n")
    if errors:
        for e in errors:
            sys.stderr.write(f"ERROR [{name}] {e}\n")
        sys.stderr.write(f"INVALID: {args.predictions} — {len(errors)} contract violation(s)\n")
        return 1
    if args.strict and warnings:
        sys.stderr.write(
            f"INVALID (strict): {args.predictions} — {len(warnings)} warning(s) treated as errors\n"
        )
        return 1
    if not args.quiet:
        suffix = f" ({len(warnings)} warning(s))" if warnings else ""
        sys.stdout.write(f"VALID: {args.predictions}{suffix}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
