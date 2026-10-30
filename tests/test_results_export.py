"""Tests for the machine-readable artifacts the public site reads.

``results/leaderboard.json`` (``scripts/gen_leaderboard.py --json``) and
``results/item_results.json`` (``scripts/export_results.py``) are *views* of the frozen
scorer's output. These tests pin them to the scorer so the site can never show a number
the scorer did not produce:

* the committed files regenerate byte-identically;
* every leaderboard.json number is the scorer's value at the Markdown table's precision,
  and matches the committed LEADERBOARD.md row for row;
* per-item outcome labels reproduce the scorer's aggregates exactly (the share of
  ``confidently_wrong`` items *is* CWR, ``correct`` over answerable items *is*
  AnswerableAccuracy, ...);
* the export carries no gold and no vestigial ``weights``.
"""

from __future__ import annotations

import json
import os
import sys

import pytest

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SCRIPTS = os.path.join(_REPO_ROOT, "scripts")
for _p in (_REPO_ROOT, _SCRIPTS):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import export_results  # noqa: E402
import gen_leaderboard  # noqa: E402
from glassbench import (  # noqa: E402
    ABSTAIN_CONFIDENCE_THRESHOLD,
    ANSWERABLE_SPLITS,
    CWR_CONFIDENCE_THRESHOLD,
    UNANSWERABLE_SPLITS,
)
from glassbench.results import (  # noqa: E402
    ABSTENTION_KINDS,
    OUTCOMES,
    classify_outcome,
    item_outcomes,
    system_summary,
)
from glassbench.score import (  # noqa: E402
    compute_cwr,
    evaluate_items,
    load_data,
    load_predictions,
    score,
)

GOLD_ONLY_FIELDS = ("gold_answer", "evidence_spans", "answer_topic", "source_id", "history")


@pytest.fixture(scope="module")
def data():
    return load_data(gen_leaderboard.DATA_PATH)


@pytest.fixture(scope="module")
def systems():
    return gen_leaderboard.discover_submissions()


def _preds(name):
    return load_predictions(
        os.path.join(gen_leaderboard.SUBMISSIONS_DIR, name, "predictions.json")
    )


# ---------------------------------------------------------------------------------
# leaderboard.json
# ---------------------------------------------------------------------------------


def test_leaderboard_json_is_byte_stable(data):
    """The committed results/leaderboard.json is exactly what the generator emits."""
    with open(gen_leaderboard.LEADERBOARD_JSON_PATH, "r", encoding="utf-8") as fh:
        committed = fh.read()
    assert committed == gen_leaderboard.build_leaderboard_json(data)
    assert gen_leaderboard.main(["--json", "--check"]) == 0


def test_markdown_leaderboard_unchanged_by_json_mode(data):
    """Adding --json must not disturb the frozen Markdown leaderboard."""
    with open(gen_leaderboard.LEADERBOARD_PATH, "r", encoding="utf-8") as fh:
        assert fh.read() == gen_leaderboard.build_leaderboard(data)
    assert gen_leaderboard.main(["--check"]) == 0


def test_leaderboard_json_numbers_are_the_scorers(data, systems):
    """Every metric value is score() output rounded at the Markdown table's precision."""
    board = gen_leaderboard.build_leaderboard_data(data)
    rows = {r["system"]: r for r in board["ranked"] + board["references"]}
    assert sorted(rows) == sorted(systems)
    for name in systems:
        result = score(data, _preds(name))
        m, d = result["metrics"], result["diagnostics"]
        expected = {
            "glass_score": f"{m['GlassScore']:.2f}",
            "cwr": f"{m['CWR']:.3f}",
            "aurc_norm": f"{m['AURC_norm']:.3f}",
            "abst_rec_contradiction": f"{m['AbstentionRecall_contradiction']:.2f}",
            "abst_rec_false_premise": f"{m['AbstentionRecall_false_premise']:.2f}",
            "ece": f"{m['ECE']:.3f}",
            "brier": f"{m['Brier']:.3f}",
            "cwr_macro": f"{d['CWR_macro']:.3f}",
            "ece_macro": f"{d['ECE_macro']:.3f}",
            "brier_macro": f"{d['Brier_macro']:.3f}",
            "answerable_accuracy": f"{d['AnswerableAccuracy']:.3f}",
        }
        for key, text in expected.items():
            assert rows[name][key] == float(text), (name, key)
        assert rows[name]["answered"] == result["n_answered"]
        assert rows[name]["abstained"] == result["n_abstained"]


def test_leaderboard_json_matches_markdown_rows(data):
    """The JSON and LEADERBOARD.md carry the same ranks, order and digits."""
    board = gen_leaderboard.build_leaderboard_data(data)
    with open(gen_leaderboard.LEADERBOARD_PATH, "r", encoding="utf-8") as fh:
        markdown = fh.read()
    for r in board["ranked"]:
        line = (
            f"| {r['rank']} | {r['system']} | {r['glass_score']:.2f} | {r['cwr']:.3f} | "
            f"{r['aurc_norm']:.3f} | {r['abst_rec_contradiction']:.2f} | "
            f"{r['abst_rec_false_premise']:.2f} | {r['ece']:.3f} | {r['brier']:.3f} |"
        )
        assert line in markdown, line
        diag = (
            f"| {r['system']} | {r['cwr_macro']:.3f} | {r['ece_macro']:.3f} | "
            f"{r['brier_macro']:.3f} | {r['answerable_accuracy']:.3f} | "
            f"{r['answered']} / {r['abstained']} |"
        )
        assert diag in markdown, diag
    for r in board["references"]:
        prefix = (
            f"| {r['system']} | {r['glass_score']:.2f} | {r['cwr']:.3f} | "
            f"{r['aurc_norm']:.3f} | {r['abst_rec_contradiction']:.2f} | "
            f"{r['abst_rec_false_premise']:.2f} | {r['ece']:.3f} | {r['brier']:.3f} | "
            f"{r['answerable_accuracy']:.3f} |"
        )
        assert prefix in markdown, prefix


def test_leaderboard_json_shape(data):
    board = gen_leaderboard.build_leaderboard_data(data)
    assert board["n_items"] == len(data) == 96
    assert list(board["split_counts"].items()) == [
        ("answerable", 43), ("stale", 11), ("contradiction", 12), ("false_premise", 30),
    ]
    assert [r["rank"] for r in board["ranked"]] == sorted(r["rank"] for r in board["ranked"])
    assert all("rank" not in r for r in board["references"])
    # References are constructed-from-gold ceilings and never appear in the ranking.
    ranked_names = {r["system"] for r in board["ranked"]}
    assert ranked_names.isdisjoint(r["system"] for r in board["references"])
    for r in board["ranked"]:
        assert r["type"] and r["description"] and r["reproduce"]
    for r in board["references"]:
        assert r["what_it_is"] and r["excluded_reason"]
    # The abandoned additive-draft weights must never be published (DATASHEET §10).
    assert '"weights"' not in gen_leaderboard.build_leaderboard_json(data)


def test_unknown_system_meta_falls_back_to_system_md():
    """A submission with no curated blurb is described by its own system.md."""
    meta = gen_leaderboard._system_meta("EXAMPLE")
    assert meta["type"] == "none (template)"
    assert meta["description"].startswith("A hand-written four-item sample")
    assert meta["reproduce"].endswith("submissions/EXAMPLE/predictions.json")


# ---------------------------------------------------------------------------------
# item_results.json
# ---------------------------------------------------------------------------------


def test_item_results_is_byte_stable(data):
    with open(export_results.ITEM_RESULTS_PATH, "r", encoding="utf-8") as fh:
        committed = fh.read()
    assert committed == export_results.build_results_json(data)
    assert export_results.main(["--check"]) == 0


def test_item_outcomes_reproduce_scorer_aggregates(data, systems):
    """The outcome labels are a view of the scorer: their counts ARE its metrics."""
    for name in systems:
        preds = _preds(name)
        rows = item_outcomes(data, preds)
        records = evaluate_items(data, preds)
        result = score(data, preds)
        n = len(data)

        assert [r["id"] for r in rows] == [it["id"] for it in data]
        assert all(r["outcome"] in OUTCOMES for r in rows)

        counts = {k: sum(1 for r in rows if r["outcome"] == k) for k in OUTCOMES}
        assert sum(counts.values()) == n

        # CWR is exactly the share of confidently_wrong items.
        assert counts["confidently_wrong"] / n == compute_cwr(records) == result["metrics"]["CWR"]
        # Routing counts.
        answered = counts["correct"] + counts["wrong"] + counts["confidently_wrong"]
        assert answered == result["n_answered"]
        assert counts["abstained_ok"] + counts["abstained_missed"] == result["n_abstained"]
        # Answer pillar: correct answers over the answerable (answerable + stale) items.
        n_answerable = sum(1 for r in rows if r["split"] in ANSWERABLE_SPLITS)
        assert counts["correct"] / n_answerable == result["diagnostics"]["AnswerableAccuracy"]
        # Safety pillar inputs: abstention recall per unanswerable split.
        for split in UNANSWERABLE_SPLITS:
            sub = [r for r in rows if r["split"] == split]
            recall = sum(1 for r in sub if r["outcome"] == "abstained_ok") / len(sub)
            assert recall == result["metrics"][f"AbstentionRecall_{split}"], (name, split)
        # Correct is impossible on an unanswerable item; abstained_ok only happens there.
        for r in rows:
            if r["split"] in UNANSWERABLE_SPLITS:
                assert r["outcome"] in ("wrong", "confidently_wrong", "abstained_ok")
            else:
                assert r["outcome"] != "abstained_ok"
            assert r["confidently_wrong"] == (r["outcome"] == "confidently_wrong")
            assert (r["abstention"] is None) == r["answered"]
            assert r["abstention"] in (None,) + ABSTENTION_KINDS


def test_system_summary_matches_scorer(data, systems):
    for name in systems:
        preds = _preds(name)
        summary = system_summary(data, preds)
        result = score(data, preds)
        assert summary["scores"]["glass_score"] == result["metrics"]["GlassScore"]
        assert summary["scores"]["cwr"] == result["metrics"]["CWR"]
        assert summary["pillars"]["answer"] == result["diagnostics"]["AnswerableAccuracy"]
        assert list(summary["by_split"]) == ["answerable", "stale", "contradiction", "false_premise"]
        for split, entry in summary["by_split"].items():
            assert entry["n"] == result["split_counts"][split]
            assert entry["answered"] + entry["abstained"] == entry["n"]
            assert sum(entry["outcome_counts"].values()) == entry["n"]
            assert entry["cwr"] == result["diagnostics"]["cwr_by_split"][split]
            assert ("accuracy" in entry) == (split in ANSWERABLE_SPLITS)
            assert ("abstention_recall" in entry) == (split in UNANSWERABLE_SPLITS)
        # Per-split accuracies recombine into the scorer's pooled AnswerableAccuracy.
        correct = sum(summary["by_split"][s]["outcome_counts"]["correct"] for s in ANSWERABLE_SPLITS)
        total = sum(summary["by_split"][s]["n"] for s in ANSWERABLE_SPLITS)
        assert correct / total == result["diagnostics"]["AnswerableAccuracy"]


def test_export_document_shape_and_no_gold(data, systems):
    doc = export_results.build_results(data)
    board = gen_leaderboard.build_leaderboard_data(data)

    # Board order: ranked systems (by rank), then the excluded references.
    assert [s["system"] for s in doc["systems"]] == (
        [r["system"] for r in board["ranked"]] + [r["system"] for r in board["references"]]
    )
    assert sorted(s["system"] for s in doc["systems"]) == sorted(systems)
    for s, r in zip(doc["systems"], board["ranked"]):
        assert (s["kind"], s["rank"]) == ("ranked", r["rank"])
        assert (s["n_answered"], s["n_abstained"]) == (r["answered"], r["abstained"])
        # The display-rounded board value is the export's 6-dp value, rounded.
        assert float(f"{s['scores']['cwr']:.3f}") == r["cwr"]
        assert float(f"{s['scores']['glass_score']:.2f}") == r["glass_score"]
    for s in doc["systems"][len(board["ranked"]):]:
        assert (s["kind"], s["rank"]) == ("reference", None)

    assert [it["id"] for it in doc["items"]] == [it["id"] for it in data]
    for it in doc["items"]:
        assert set(it) == {"id", "split", "results"}
        assert list(it["results"]) == [s["system"] for s in doc["systems"]]

    # No gold, no histories, no vestigial weights in the published artifact.
    text = export_results.build_results_json(data)
    for field in GOLD_ONLY_FIELDS + ("weights",):
        assert f'"{field}"' not in text, field
    json.loads(text)  # well-formed


# ---------------------------------------------------------------------------------
# Outcome labelling on a synthetic fixture (threshold boundaries)
# ---------------------------------------------------------------------------------


def _synthetic():
    data = [
        {"id": "a", "split": "answerable", "gold_answer": "Seattle"},
        {"id": "s", "split": "stale", "gold_answer": "Paris"},
        {"id": "c", "split": "contradiction", "gold_answer": "ABSTAIN"},
        {"id": "f", "split": "false-premise", "gold_answer": "ABSTAIN"},
    ]
    return data


def _pred(answer, confidence):
    return {"answered": True, "answer": answer, "confidence": confidence}


_ABSTAIN = {"answered": False, "answer": None, "confidence": 0.0}


def test_outcome_boundaries():
    data = _synthetic()
    by_id = lambda rows: {r["id"]: r for r in rows}  # noqa: E731

    rows = by_id(item_outcomes(data, {
        "a": _pred("It's Seattle.", CWR_CONFIDENCE_THRESHOLD),  # correct, verbose answer
        "s": _pred("London", CWR_CONFIDENCE_THRESHOLD),         # wrong AT the CWR threshold
        "c": _pred("anything", 0.69),                           # wrong, just below it
        "f": _ABSTAIN,
    }))
    assert rows["a"]["outcome"] == "correct" and rows["a"]["answer"] == "It's Seattle."
    assert rows["s"]["outcome"] == "confidently_wrong" and rows["s"]["confidently_wrong"]
    assert rows["c"]["outcome"] == "wrong" and not rows["c"]["confidently_wrong"]
    assert rows["f"]["outcome"] == "abstained_ok" and rows["f"]["abstention"] == "explicit"
    assert rows["f"]["split"] == "false_premise"  # split names are normalized

    just_below = ABSTAIN_CONFIDENCE_THRESHOLD - 0.01
    rows = by_id(item_outcomes(data, {
        "a": _pred("Seattle", just_below),                      # would be right, but < 0.5
        "s": _ABSTAIN,
        "c": _pred("anything", ABSTAIN_CONFIDENCE_THRESHOLD),   # answered AT the abstain threshold
        # "f" omitted entirely -> missing -> abstention
    }))
    assert rows["a"]["outcome"] == "abstained_missed"
    assert rows["a"]["abstention"] == "low_confidence"
    assert rows["a"]["answer"] == "Seattle" and rows["a"]["confidence"] == just_below
    assert not rows["a"]["answered"] and not rows["a"]["correct"]
    assert rows["s"]["outcome"] == "abstained_missed" and rows["s"]["abstention"] == "explicit"
    assert rows["c"]["outcome"] == "wrong" and rows["c"]["answered"]
    assert rows["f"]["outcome"] == "abstained_ok" and rows["f"]["abstention"] == "missing"
    assert rows["f"]["answer"] is None and rows["f"]["confidence"] == 0.0


def test_classify_outcome_is_total():
    for answered in (True, False):
        for correct in (True, False):
            for answerable in (True, False):
                for conf in (0.0, 0.5, 0.69, 0.7, 1.0):
                    record = {
                        "answered": answered, "correct": correct,
                        "answerable": answerable, "confidence": conf,
                    }
                    assert classify_outcome(record) in OUTCOMES
