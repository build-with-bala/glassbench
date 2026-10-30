#!/usr/bin/env python3
"""Generate the parity fixture for the site's in-browser ``predictions.json`` checker.

The site's submit page lets a contributor drop a ``predictions.json`` and get a verdict
before opening a PR. That checker (``web/lib/validate-predictions.ts``) is a TypeScript
port of ``scripts/validate_submission.py``; this script is what keeps the port honest.

It builds a fixed set of submission files — valid ones, and one for each way a file can be
rejected or warned about — runs the *real* Python validator on every one, and records what
it said in ``web/test/fixtures/validator-parity.json``. The site's unit tests then feed the
same files to the TypeScript port and require the same verdict: the same valid/invalid
answer and the same set of ``(kind, row)`` errors and warnings.

Messages are compared by *kind*, not by wording: each Python message is classified into a
stable code (``duplicate_id``, ``unknown_id``, ...) by the patterns in ``_KINDS``. A message
no pattern recognises aborts generation, so a new validator rule cannot be added without
teaching both this script and the port about it.

Validation only — nothing here scores anything.

Usage::

    python scripts/gen_validator_fixtures.py           # write the fixture
    python scripts/gen_validator_fixtures.py --check   # verify byte-stable, write nothing
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile

_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(_HERE)
for _path in (_REPO_ROOT, _HERE):
    if _path not in sys.path:
        sys.path.insert(0, _path)

import validate_submission as validator  # noqa: E402

FIXTURE_PATH = os.path.join(_REPO_ROOT, "web", "test", "fixtures", "validator-parity.json")

# (code, pattern) — first match wins. Row-level messages start with "row <n>".
_KINDS = [
    ("invalid_json", re.compile(r"^predictions file is not valid JSON")),
    ("not_array", re.compile(r"^predictions must be a JSON array")),
    ("empty", re.compile(r"^predictions array is empty")),
    ("row_not_object", re.compile(r"^row \d+: each prediction must be a JSON object")),
    ("missing_id", re.compile(r"^row \d+: missing required 'id'")),
    ("id_not_string", re.compile(r"^row \d+ \(id=.*\): 'id' must be a string")),
    ("unknown_id", re.compile(r"^row \d+ \(id=.*\): id is not present in the scored data version")),
    ("duplicate_id", re.compile(r"^row \d+ \(id=.*\): duplicate id")),
    ("gold_leakage", re.compile(r"^row \d+ \(id=.*\): gold leakage")),
    ("abstain_not_true", re.compile(r"^row \d+ \(id=.*\): 'abstain' must be the literal true")),
    ("abstain_with_answer", re.compile(r"^row \d+ \(id=.*\): abstain row also has answer/confidence")),
    ("missing_confidence", re.compile(r"^row \d+ \(id=.*\): answered prediction is missing 'confidence'")),
    ("confidence_not_number", re.compile(r"^row \d+ \(id=.*\): 'confidence' must be a number")),
    ("confidence_out_of_range", re.compile(r"^row \d+ \(id=.*\): 'confidence' .* is outside \[0,1\]")),
    ("missing_answer", re.compile(r"^row \d+ \(id=.*\): answered prediction has no 'answer' field")),
    ("extra_keys", re.compile(r"^row \d+ \(id=.*\): unexpected extra key\(s\)")),
    ("gold_echo", re.compile(r"^gold leakage — all \d+ answered unanswerable-split items")),
    ("coverage", re.compile(r"^\d+ of \d+ data ids are not listed")),
]
_ROW = re.compile(r"^row (\d+)")


def classify(message: str) -> dict:
    for code, pattern in _KINDS:
        if pattern.search(message):
            row = _ROW.match(message)
            return {"code": code, "row": int(row.group(1)) if row else None}
    raise SystemExit(f"gen_validator_fixtures: unrecognised validator message: {message!r}")


def _pick_ids(gold: dict) -> dict:
    """Deterministic real ids to build cases from: the first few of each kind, in data order."""
    by_split: dict[str, list[str]] = {}
    for item_id, g in gold.items():
        by_split.setdefault(g["split"], []).append(item_id)
    return {
        "a1": by_split["answerable"][0],
        "a2": by_split["answerable"][1],
        "s1": by_split["stale"][0],
        "c1": by_split["contradiction"][0],
        "c2": by_split["contradiction"][1],
        "f1": by_split["false_premise"][0],
        "f2": by_split["false_premise"][1],
    }


def _read(rel: str) -> str:
    with open(os.path.join(_REPO_ROOT, rel), "r", encoding="utf-8") as fh:
        return fh.read()


def build_cases(gold: dict) -> list[dict]:
    """``[{name, note, text, compare}]``. ``text`` is the exact file content."""
    i = _pick_ids(gold)
    j = lambda obj: json.dumps(obj, indent=1)  # noqa: E731
    ans = lambda item_id, conf=0.9, answer="Seattle": {  # noqa: E731
        "id": item_id, "answer": answer, "confidence": conf,
    }
    abst = lambda item_id: {"id": item_id, "abstain": True}  # noqa: E731

    cases = [
        # ---- accepted -------------------------------------------------------------
        ("real_agent_llm", "A shipped submission, verbatim.",
         _read("submissions/agent_llm/predictions.json")),
        ("real_always_abstain", "A shipped all-abstain submission, verbatim.",
         _read("submissions/always_abstain/predictions.json")),
        ("valid_mixed_partial", "Answers and abstentions; omitted ids are allowed (coverage warning).",
         j([ans(i["a1"]), abst(i["c1"]), ans(i["s1"], 0.55, "under my bed"), abst(i["f1"])])),
        ("valid_wrapped_object", 'The {"predictions": [...]} wrapper is accepted.',
         j({"predictions": [ans(i["a1"]), abst(i["c1"])]})),
        ("valid_confidence_bounds", "Confidence exactly 0, exactly 1, and an integer 1.",
         j([ans(i["a1"], 0.0), ans(i["a2"], 1.0), ans(i["s1"], 1)])),
        ("valid_low_confidence_answer", "A confidence below 0.5 is legal (scored as an abstention).",
         j([ans(i["a1"], 0.31)])),
        ("valid_unicode_answer", "Non-ASCII answer text.",
         json.dumps([ans(i["a1"], 0.8, "Zürich — 東京 ☕")], ensure_ascii=False)),
        ("valid_answer_on_unanswerable", "Answering an unanswerable item is legal (just wrong).",
         j([ans(i["c1"], 0.9, "under my bed"), ans(i["f1"], 0.9, "five engineers")])),
        ("valid_single_gold_echo", "ONE unanswerable item answered with the gold sentinel is not flagged.",
         j([ans(i["c1"], 0.9, "ABSTAIN"), ans(i["a1"])])),
        ("valid_partial_gold_echo", "Echoing gold on some but not all answered unanswerable items is not flagged.",
         j([ans(i["c1"], 0.9, "ABSTAIN"), ans(i["c2"], 0.9, "ABSTAIN"), ans(i["f1"], 0.9, "something else")])),
        # ---- warnings only --------------------------------------------------------
        ("warn_abstain_with_answer", "An abstain row that also carries answer/confidence.",
         j([{"id": i["c1"], "abstain": True, "answer": "x", "confidence": 0.2}])),
        ("warn_abstain_extra_key", "An abstain row with an unexpected key.",
         j([{"id": i["c1"], "abstain": True, "notes": "retracted"}])),
        ("warn_answer_extra_key", "An answered row with an unexpected key.",
         j([{"id": i["a1"], "answer": "x", "confidence": 0.9, "latency_ms": 12}])),
        ("warn_missing_answer", "An answered row with a confidence but no answer.",
         j([{"id": i["a1"], "confidence": 0.9}])),
        # ---- rejected: file level -------------------------------------------------
        ("bad_json_truncated", "Truncated JSON.", '[{"id": "' + i["a1"] + '", "answer": "x", "confid'),
        ("bad_json_trailing_comma", "Trailing comma.", '[{"id": "' + i["a1"] + '", "abstain": true},]'),
        ("bad_json_empty_file", "An empty file.", ""),
        ("bad_json_bom", "A UTF-8 byte-order mark before the array.", "﻿" + j([abst(i["c1"])])),
        ("bad_not_array_object", "A JSON object without a predictions key.", j({"id": i["a1"], "abstain": True})),
        ("bad_not_array_string", "A JSON string.", j("predictions")),
        ("bad_not_array_number", "A JSON number.", "42"),
        ("bad_not_array_null", "JSON null.", "null"),
        ("bad_wrapped_not_array", "A predictions key that is not an array.", j({"predictions": {"id": i["a1"]}})),
        ("bad_empty_array", "An empty array.", "[]"),
        ("bad_empty_wrapped", "An empty wrapped array.", j({"predictions": []})),
        # ---- rejected: row shape --------------------------------------------------
        ("bad_row_not_object", "Rows that are not objects.",
         j([ans(i["a1"]), "abstain", 7, None, [i["c1"], True], True])),
        ("bad_missing_id", "A row without an id.", j([{"answer": "x", "confidence": 0.9}, abst(i["c1"])])),
        ("bad_id_not_string", "Ids that are not strings.",
         j([{"id": 12, "abstain": True}, {"id": None, "abstain": True}, {"id": [i["a1"]], "abstain": True},
            {"id": {"v": i["a1"]}, "abstain": True}, {"id": True, "abstain": True}])),
        ("bad_unknown_id", "An id that is not in the scored data version.",
         j([ans("gb-answerable-does-not-exist"), abst(i["c1"])])),
        ("bad_example_template", "The EXAMPLE template: placeholder ids only.",
         _read("submissions/EXAMPLE/predictions.json")),
        ("bad_duplicate_id", "The same id twice.",
         j([ans(i["a1"]), abst(i["c1"]), ans(i["a1"], 0.4, "Portland")])),
        ("bad_duplicate_unknown_id", "An unknown id, twice.", j([abst("nope"), abst("nope")])),
        ("bad_triplicate_id", "The same id three times (two duplicate errors).",
         j([abst(i["c1"]), abst(i["c1"]), abst(i["c1"])])),
        # ---- rejected: confidence -------------------------------------------------
        ("bad_confidence_above_one", "Confidence above 1.", j([ans(i["a1"], 1.5)])),
        ("bad_confidence_negative", "Negative confidence.", j([ans(i["a1"], -0.1)])),
        ("bad_confidence_percent", "A percentage instead of a probability.", j([ans(i["a1"], 91)])),
        ("bad_confidence_string", "Confidence as a string.", j([ans(i["a1"], "0.9")])),
        ("bad_confidence_bool", "Confidence as a boolean.", j([ans(i["a1"], True)])),
        ("bad_confidence_null", "Confidence null.", j([ans(i["a1"], None)])),
        ("bad_confidence_list", "Confidence as a list.", j([ans(i["a1"], [0.9])])),
        ("bad_confidence_huge", "A float literal that overflows to infinity.",
         '[{"id": "' + i["a1"] + '", "answer": "x", "confidence": 1e999}]'),
        ("bad_confidence_huge_int", "An integer literal too large for a float.",
         '[{"id": "' + i["a1"] + '", "answer": "x", "confidence": 1' + "0" * 400 + "}]"),
        ("bad_missing_confidence", "An answer without a confidence.", j([{"id": i["a1"], "answer": "x"}])),
        ("bad_id_only_row", "A row with only an id (neither answer nor abstain).", j([{"id": i["a1"]}])),
        # ---- rejected: abstain ----------------------------------------------------
        ("bad_abstain_false", "abstain: false.", j([{"id": i["c1"], "abstain": False}])),
        ("bad_abstain_string", 'abstain: "true".', j([{"id": i["c1"], "abstain": "true"}])),
        ("bad_abstain_one", "abstain: 1.", j([{"id": i["c1"], "abstain": 1}])),
        ("bad_abstain_null", "abstain: null.", j([{"id": i["c1"], "abstain": None}])),
        ("bad_abstain_false_with_answer", "abstain: false next to a valid answer.",
         j([{"id": i["a1"], "abstain": False, "answer": "x", "confidence": 0.9}])),
        # ---- rejected: gold leakage -----------------------------------------------
        ("bad_gold_field_split", "A prediction row carrying the split label.",
         j([{"id": i["c1"], "abstain": True, "split": "contradiction"}])),
        ("bad_gold_fields_copied_item", "A dataset object copied into the predictions.",
         j([{"id": i["a1"], "answer": "x", "confidence": 0.9, "gold_answer": "x",
             "evidence_spans": ["..."], "answer_topic": "t", "source_id": "s"}])),
        ("bad_gold_echo_all", "Every answered unanswerable item reproduces the gold sentinel.",
         j([ans(i["c1"], 0.9, "ABSTAIN"), ans(i["f1"], 0.9, " ABSTAIN "), ans(i["a1"])])),
        # ---- several problems at once ---------------------------------------------
        ("bad_everything", "Many violations in one file.",
         j([ans(i["a1"], 2), ans(i["a1"], 0.5), {"id": "ghost", "abstain": "yes", "split": "stale"},
            {"confidence": 0.3}, "junk", abst(i["f2"])])),
    ]
    out = [{"name": n, "note": note, "text": text, "compare": "full"} for n, note, text in cases]

    # Python's json module accepts the non-standard NaN / Infinity literals; JSON.parse in
    # a browser does not. Both reject the file, for different reasons — so only the
    # verdict is compared for these.
    for name, literal in (("bad_confidence_nan", "NaN"), ("bad_confidence_infinity", "Infinity")):
        out.append({
            "name": name,
            "note": f"The non-standard {literal} literal (Python parses it; browsers do not).",
            "text": '[{"id": "' + i["a1"] + '", "answer": "x", "confidence": ' + literal + "}]",
            "compare": "verdict",
        })
    return out


def run_validator(text: str, gold: dict) -> dict:
    """Run the real validator on ``text`` exactly as the CLI would (from a file on disk)."""
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "predictions.json")
        with open(path, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
        errors, warnings = validator.validate(path, gold)
    # Only the classified verdict is recorded — not the message text, which (for JSON
    # syntax errors) differs between Python versions and would make the fixture depend on
    # the interpreter that generated it.
    return {
        "valid": not errors,
        "errors": [classify(m) for m in errors],
        "warnings": [classify(m) for m in warnings],
    }


def build_fixture() -> str:
    gold = validator.load_gold(validator.DEFAULT_DATA)
    cases = []
    for case in build_cases(gold):
        entry = dict(case)
        entry["python"] = run_validator(case["text"], gold)
        cases.append(entry)
    names = [c["name"] for c in cases]
    assert len(names) == len(set(names)), "duplicate case names"
    doc = {
        "_generated_by": "scripts/gen_validator_fixtures.py — do not edit by hand",
        "validator": "scripts/validate_submission.py",
        "data_file": "data/glassbench_v0.1.jsonl",
        "codes": [code for code, _ in _KINDS],
        "cases": cases,
    }
    return json.dumps(doc, indent=1, ensure_ascii=True) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="gen_validator_fixtures.py",
        description="Generate the Python-vs-browser validator parity fixture (deterministic).",
    )
    parser.add_argument("--out", default=FIXTURE_PATH, help="output JSON path")
    parser.add_argument(
        "--check",
        action="store_true",
        help="exit nonzero if the generated fixture differs from --out (writes nothing)",
    )
    args = parser.parse_args(argv)
    content = build_fixture()

    if args.check:
        existing = None
        if os.path.exists(args.out):
            with open(args.out, "r", encoding="utf-8") as fh:
                existing = fh.read()
        if existing == content:
            sys.stderr.write(f"OK: {args.out} is up to date (byte-stable).\n")
            return 0
        sys.stderr.write(
            f"FAIL: {args.out} is stale or missing.\n"
            "Run scripts/gen_validator_fixtures.py and commit the result.\n"
        )
        return 1

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(content)
    sys.stderr.write(f"wrote {args.out} ({len(content)} bytes)\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
