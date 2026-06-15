"""Data-integrity tests for the FROZEN GlassBench v0.1 dataset.

These tests audit the committed corpus ``data/glassbench_v0.1.jsonl`` against the
public source ``data/longmemeval_oracle.json`` and the frozen contract in
``PRE_REGISTRATION.md``. They are *read-only* with respect to the frozen artefacts:
nothing here writes to, regenerates, or mutates the committed data file, the builder,
the metrics, the splits, or the pre-registration. The determinism check writes only to
a throwaway temp directory and never touches the committed JSONL.

What is asserted (per the task and PRE_REGISTRATION.md "Splits"):

* schema — every item carries the required keys for its split;
* verbatim evidence — every ``evidence_span`` is an exact substring of the source
  transcript reconstructed from ``data/longmemeval_oracle.json`` (looked up by
  ``source_id``), using the *same* concatenation the builder verifies against;
* split validity & gold semantics — only the four frozen splits appear, and gold matches
  split semantics (unanswerable splits => gold == "ABSTAIN"; answerable splits => a
  non-empty, non-ABSTAIN gold);
* id uniqueness — all ``id`` values are unique (and prefixed by their split);
* determinism — running the committed builder twice yields byte-identical output, and
  that output is byte-identical to the committed JSONL.

If a test FAILS it has found a REAL bug in the FROZEN data or builder. Per the freeze
rules, such a bug must be reported as a v0.2 note and NOT silently patched in v0.1: do
not "fix" the data to make a test pass.

Run (from the repo root, with the project venv):

    python -m pytest tests/test_data_integrity.py -v
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile

import pytest

# --------------------------------------------------------------------------- #
# Paths
# --------------------------------------------------------------------------- #

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA_PATH = os.path.join(ROOT, "data", "glassbench_v0.1.jsonl")
SRC_PATH = os.path.join(ROOT, "data", "longmemeval_oracle.json")

# The four frozen splits (PRE_REGISTRATION.md "Splits"). Canonical underscore form,
# matching the builder's output and glassbench/__init__.py.
VALID_SPLITS = {"answerable", "stale", "contradiction", "false_premise"}
ANSWERABLE_SPLITS = {"answerable", "stale"}
UNANSWERABLE_SPLITS = {"contradiction", "false_premise"}

# Frozen v0.1 per-split counts (PRE_REGISTRATION.md "Frozen counts (v0.1)").
FROZEN_COUNTS = {
    "answerable": 43,
    "stale": 11,
    "contradiction": 12,
    "false_premise": 30,
}

# Keys every item must carry (PRE_REGISTRATION.md: item is
# {id, split, history, query, gold_answer | "ABSTAIN", answer_topic, evidence_spans[]}).
REQUIRED_KEYS = {
    "id",
    "split",
    "source_id",
    "answer_topic",
    "history",
    "query",
    "gold_answer",
    "evidence_spans",
}


# --------------------------------------------------------------------------- #
# Fixtures / loaders
# --------------------------------------------------------------------------- #


def _load_items():
    assert os.path.exists(DATA_PATH), f"frozen data file missing: {DATA_PATH}"
    items = []
    with open(DATA_PATH, "r", encoding="utf-8") as fh:
        for line_no, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as exc:  # pragma: no cover - corruption is a real bug
                raise AssertionError(f"{DATA_PATH}:{line_no}: invalid JSON: {exc}") from exc
            items.append(obj)
    return items


def _source_transcript_text(src_item):
    """Reconstruct the exact transcript the builder verifies evidence spans against.

    This mirrors ``glassbench.build_data.source_transcript_text`` (every turn's
    ``content`` for the whole haystack, joined by ``"\\n"``). We re-implement it here so
    the integrity test is an *independent* check rather than a tautology that imports the
    builder's own helper — if the builder's notion of the source ever diverged from this,
    that is exactly the kind of bug we want to catch.
    """
    parts = []
    for sess in src_item["haystack_sessions"]:
        for turn in sess:
            parts.append(turn["content"])
    return "\n".join(parts)


@pytest.fixture(scope="module")
def items():
    return _load_items()


# Whether the (gitignored, ~15 MB) LongMemEval oracle source is present. The schema /
# metric tests do NOT need it; only the source-derived audits (verbatim spans, source_id
# resolution, determinism rebuild) do. On a fresh clone — and in CI before the oracle is
# fetched — the file is absent, so those audits SKIP rather than fail. See README step 2 /
# CONTRIBUTING Step 1 / DATASHEET section 3 for how to obtain it.
SOURCE_PRESENT = os.path.exists(SRC_PATH)
_SKIP_NO_SOURCE = (
    "LongMemEval oracle source (data/longmemeval_oracle.json) not present — see README "
    "step 2 for how to obtain it; source-derived audits are skipped."
)


@pytest.fixture(scope="module")
def source_by_id():
    if not SOURCE_PRESENT:
        pytest.skip(_SKIP_NO_SOURCE)
    with open(SRC_PATH, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    return {it["question_id"]: it for it in data}


# --------------------------------------------------------------------------- #
# Schema
# --------------------------------------------------------------------------- #


def test_dataset_nonempty(items):
    assert len(items) > 0, "frozen dataset is empty"


def test_required_schema_keys_present(items):
    """Every item has the required schema keys, with sane types."""
    problems = []
    for o in items:
        missing = REQUIRED_KEYS - set(o.keys())
        if missing:
            problems.append((o.get("id", "<no-id>"), f"missing keys: {sorted(missing)}"))
            continue
        if not isinstance(o["id"], str) or not o["id"]:
            problems.append((o["id"], "id must be a non-empty string"))
        if not isinstance(o["split"], str):
            problems.append((o["id"], "split must be a string"))
        if not isinstance(o["source_id"], str) or not o["source_id"]:
            problems.append((o["id"], "source_id must be a non-empty string"))
        if not isinstance(o["query"], str) or not o["query"].strip():
            problems.append((o["id"], "query must be a non-empty string"))
        if not isinstance(o["answer_topic"], str) or not o["answer_topic"]:
            problems.append((o["id"], "answer_topic must be a non-empty string"))
        if not isinstance(o["history"], list) or not o["history"]:
            problems.append((o["id"], "history must be a non-empty list"))
        if not isinstance(o["evidence_spans"], list):
            problems.append((o["id"], "evidence_spans must be a list"))
        else:
            for sp in o["evidence_spans"]:
                if not isinstance(sp, str) or not sp:
                    problems.append((o["id"], f"evidence_span must be a non-empty string: {sp!r}"))
    assert not problems, "schema problems:\n" + "\n".join(f"  {i}: {m}" for i, m in problems)


def test_split_specific_keys(items):
    """Split-specific contract fields the builder emits are present where required."""
    problems = []
    for o in items:
        s = o["split"]
        if s == "stale" and "asserted_sessions_before_query" not in o:
            problems.append((o["id"], "stale item missing 'asserted_sessions_before_query'"))
        if s in UNANSWERABLE_SPLITS and "abstain_reason" not in o:
            problems.append((o["id"], f"{s} item missing 'abstain_reason'"))
        if s == "contradiction" and o.get("synthetic_retraction") is not True:
            problems.append((o["id"], "contradiction item missing synthetic_retraction=true"))
    assert not problems, "split-specific schema problems:\n" + "\n".join(
        f"  {i}: {m}" for i, m in problems
    )


# --------------------------------------------------------------------------- #
# Split validity & gold semantics
# --------------------------------------------------------------------------- #


def test_split_labels_valid(items):
    bad = sorted({o["split"] for o in items} - VALID_SPLITS)
    assert not bad, f"invalid split label(s) present: {bad} (valid: {sorted(VALID_SPLITS)})"


def test_id_prefix_matches_split(items):
    """Each id is prefixed ``gb-<split>-`` (builder convention; keeps ids self-describing)."""
    bad = [o["id"] for o in items if not o["id"].startswith(f"gb-{o['split']}-")]
    assert not bad, f"ids whose prefix does not match their split: {bad[:10]}"


def test_gold_matches_split_semantics(items):
    """Unanswerable splits => gold == ABSTAIN; answerable splits => non-empty, non-ABSTAIN."""
    problems = []
    for o in items:
        s = o["split"]
        gold = o.get("gold_answer")
        if s in UNANSWERABLE_SPLITS:
            if not (isinstance(gold, str) and gold.strip().upper() == "ABSTAIN"):
                problems.append((o["id"], f"{s} gold must be 'ABSTAIN', got {gold!r}"))
        elif s in ANSWERABLE_SPLITS:
            if not isinstance(gold, str) or not gold.strip():
                problems.append((o["id"], f"{s} gold must be a non-empty string, got {gold!r}"))
            elif gold.strip().upper() == "ABSTAIN":
                problems.append((o["id"], f"{s} gold must not be ABSTAIN"))
    assert not problems, "gold/split semantic problems:\n" + "\n".join(
        f"  {i}: {m}" for i, m in problems
    )


def test_frozen_split_counts(items):
    """The shipped per-split counts match the FROZEN v0.1 table in PRE_REGISTRATION.md.

    A mismatch means the frozen corpus changed size — a contract violation, not a fixable
    test: report as v0.2 if intentional.
    """
    from collections import Counter

    counts = dict(Counter(o["split"] for o in items))
    assert counts == FROZEN_COUNTS, (
        f"split counts {counts} != frozen {FROZEN_COUNTS} "
        f"(total {sum(counts.values())} vs {sum(FROZEN_COUNTS.values())})"
    )


# --------------------------------------------------------------------------- #
# Id uniqueness
# --------------------------------------------------------------------------- #


def test_ids_unique(items):
    from collections import Counter

    dups = [i for i, c in Counter(o["id"] for o in items).items() if c > 1]
    assert not dups, f"duplicate ids: {dups}"


# --------------------------------------------------------------------------- #
# source_id resolves & evidence spans are verbatim substrings of the source
# --------------------------------------------------------------------------- #


def test_source_ids_resolve(items, source_by_id):
    missing = sorted({o["source_id"] for o in items if o["source_id"] not in source_by_id})
    assert not missing, f"source_id(s) not found in longmemeval_oracle.json: {missing}"


def test_evidence_spans_are_verbatim_substrings(items, source_by_id):
    """Every evidence_span is an exact substring of its source transcript (by source_id).

    This is the core integrity guarantee from PRE_REGISTRATION.md commitment #4: every
    evidence span used to label a split is a verbatim substring of the source transcript.
    Synthetic contradiction retractions live in ``history`` but are deliberately NOT
    evidence spans, so this rule must hold for *all* spans with zero exceptions.
    """
    problems = []
    transcript_cache = {}
    for o in items:
        sid = o["source_id"]
        src_item = source_by_id.get(sid)
        if src_item is None:
            problems.append((o["id"], f"source_id {sid} absent (cannot verify spans)"))
            continue
        if sid not in transcript_cache:
            transcript_cache[sid] = _source_transcript_text(src_item)
        transcript = transcript_cache[sid]
        for sp in o["evidence_spans"]:
            if sp not in transcript:
                problems.append((o["id"], f"evidence_span NOT verbatim in source {sid}: {sp[:80]!r}"))
    assert not problems, "non-verbatim evidence spans:\n" + "\n".join(
        f"  {i}: {m}" for i, m in problems
    )


def test_only_absence_only_false_premise_may_lack_spans(items):
    """Only false_premise items may have empty evidence_spans (absence-only items).

    Answerable/stale/contradiction items are built from a concrete verbatim assertion, so
    they must carry at least one evidence span. false_premise items may legitimately have
    none (the label rests on the queried target being absent). This pins the design so a
    silent loss of spans elsewhere would be caught.
    """
    problems = []
    for o in items:
        if not o["evidence_spans"] and o["split"] != "false_premise":
            problems.append((o["id"], f"{o['split']} item has empty evidence_spans"))
    assert not problems, "unexpectedly empty evidence_spans:\n" + "\n".join(
        f"  {i}: {m}" for i, m in problems
    )


# --------------------------------------------------------------------------- #
# Determinism: build twice, byte-identical, and identical to committed JSONL
# --------------------------------------------------------------------------- #


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


# Driver run in a SUBPROCESS interpreter. It imports the committed builder and writes a
# fresh JSONL to an explicit temp path via build_all()/write_jsonl(). It deliberately does
# NOT invoke build_data.main() / `python -m glassbench.build_data`, because that writes to
# the fixed committed OUT_PATH and would clobber the frozen data file. This achieves the
# same thing the task asks for ("shell out ... to a temp path and diff") while guaranteeing
# the committed data/glassbench_v0.1.jsonl is never touched.
_BUILD_DRIVER = """
import sys
from glassbench.build_data import build_all, write_jsonl
out = sys.argv[1]
items, _stats = build_all()
write_jsonl(items, out)
"""


def _run_builder_to(out_path):
    interp = sys.executable or "python3"
    env = dict(os.environ)
    # Ensure the repo root is importable for `import glassbench` regardless of CWD.
    env["PYTHONPATH"] = ROOT + os.pathsep + env.get("PYTHONPATH", "")
    proc = subprocess.run(
        [interp, "-c", _BUILD_DRIVER, out_path],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, (
        f"builder subprocess failed (rc={proc.returncode})\n"
        f"STDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}"
    )
    return proc


@pytest.mark.skipif(not SOURCE_PRESENT, reason=_SKIP_NO_SOURCE)
def test_builder_is_deterministic_byte_identical():
    """Two independent builder runs produce byte-identical JSONL (process-level)."""
    with tempfile.TemporaryDirectory() as d:
        p1 = os.path.join(d, "run1.jsonl")
        p2 = os.path.join(d, "run2.jsonl")
        _run_builder_to(p1)
        _run_builder_to(p2)
        h1, h2 = _sha256(p1), _sha256(p2)
        assert h1 == h2, (
            "builder is NON-deterministic: two runs differ.\n"
            f"  run1 sha256={h1}\n  run2 sha256={h2}"
        )


@pytest.mark.skipif(not SOURCE_PRESENT, reason=_SKIP_NO_SOURCE)
def test_rebuild_matches_committed_jsonl_byte_for_byte():
    """A fresh build equals the committed data/glassbench_v0.1.jsonl byte-for-byte.

    Confirms the committed frozen JSONL is exactly what the committed builder regenerates
    from the public source (PRE_REGISTRATION.md: "the JSONL is regenerable from the public
    source"). The committed file is read-only here; the rebuild goes to a temp path.
    """
    committed_sha = _sha256(DATA_PATH)
    with tempfile.TemporaryDirectory() as d:
        rebuilt = os.path.join(d, "rebuilt.jsonl")
        _run_builder_to(rebuilt)
        rebuilt_sha = _sha256(rebuilt)
    assert rebuilt_sha == committed_sha, (
        "committed JSONL is NOT a byte-identical rebuild from source.\n"
        f"  committed sha256={committed_sha}\n  rebuilt   sha256={rebuilt_sha}\n"
        "If the builder changed intentionally this is a v0.2 note; do not edit frozen data."
    )
    # Sanity: we must not have touched the committed file while testing.
    assert _sha256(DATA_PATH) == committed_sha, "committed data file changed during the test!"


if __name__ == "__main__":  # allow `python tests/test_data_integrity.py`
    sys.exit(pytest.main([os.path.abspath(__file__), "-v"]))
