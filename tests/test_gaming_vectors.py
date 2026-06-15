"""Regression tests that PIN the closed gaming vectors of the frozen v0.1 contract.

These are *characterization* tests: they pin down behaviour the frozen v0.1 contract
exhibits, so the suite documents that the confidence dead-zone exploit is **closed**. An
earlier draft scored the answer pillar and the safety pillar from independent readings of
the stated `confidence`, which let an answer-everything-at-0.49 entry game both pillars at
once. The frozen scorer fixes this with a **single answer/abstain decision**: a stated
`confidence < 0.5` is an abstention *everywhere* (the answer pillar / `AnswerableAccuracy`
included), so the confidence field can no longer be set independently of behaviour.

These tests assert the exploit no longer pays off: answering everything at a fixed
confidence — 0.49 (fake-abstention band), 0.60, or 0.69 (CWR-evading band) — all score
~0, and the honest selective pattern scores strictly higher.

Nothing here touches the frozen formula/metrics/splits/data: they only run the existing,
frozen scorer on synthetic predictions and check the resulting Glass Score.

They use only the committed data file (`data/glassbench_v0.1.jsonl`), never the gitignored
LongMemEval oracle source, so they run on a fresh clone with no extra download.
"""

from __future__ import annotations

import pytest

from glassbench.score import load_data, score


def _answer_everything_at(data, conf, *, use_gold_on_answerable=True):
    """Build an answer-everything prediction map at a fixed stated confidence.

    On answerable/stale items the answer is the gold string (a *competent* answerer — this
    is what would make the answer pillar non-zero if the entry were genuinely answering);
    on unanswerable items it is an arbitrary guess. Crucially, the system NEVER abstains —
    every item is "answered" — and every confidence is the same fixed value. This is the
    old dead-zone exploit shape: answer everything, abstain on nothing, but state a fixed
    (possibly low) confidence.
    """
    preds = {}
    for it in data:
        if use_gold_on_answerable and it.get("split") in ("answerable", "stale"):
            answer = it.get("gold_answer")
        else:
            answer = "some guess"
        preds[it["id"]] = {"answered": True, "answer": answer, "confidence": conf}
    return preds


def _honest_selective(data):
    """An honest selective pattern: answer the answerable/stale items (at a real, high
    confidence) and genuinely abstain on the unanswerable splits. This is the behaviour the
    benchmark rewards — a non-zero answer pillar AND a non-zero safety pillar."""
    preds = {}
    for it in data:
        if it.get("split") in ("answerable", "stale"):
            preds[it["id"]] = {"answered": True, "answer": it.get("gold_answer"), "confidence": 0.8}
        else:
            preds[it["id"]] = {"answered": False, "answer": None, "confidence": 0.0}
    return preds


@pytest.mark.parametrize("conf", [0.49, 0.60, 0.69])
def test_answer_everything_at_fixed_confidence_scores_zero(conf):
    """Answering EVERY item at a fixed confidence (abstaining on NOTHING) scores ~0 — the
    confidence dead-zone exploit is closed.

    The single answer/abstain decision is what kills it:
      * at conf < 0.5 (e.g. 0.49) the entry is treated as abstaining everywhere, so its
        answer pillar (AnswerableAccuracy) is 0 -> Glass 0;
      * at conf >= 0.5 (e.g. 0.60, 0.69) it really answers, so every unanswerable answer
        collapses its safety pillar to 0 -> Glass 0.
    There is no fixed confidence that keeps both pillars up.
    """
    data = load_data(None)
    preds = _answer_everything_at(data, conf)
    result = score(data, preds)
    m = result["metrics"]

    # The submission gives an answer (never an explicit abstain) on every item. How the
    # SCORER classifies it depends on the single answer/abstain decision:
    if conf < 0.5:
        # conf < 0.5 is reclassified as an abstention everywhere -> scored as all-abstained.
        assert result["n_answered"] == 0, (
            "conf < 0.5 must be treated as abstaining everywhere (single answer/abstain "
            "decision) — this is what zeroes the answer pillar"
        )
        assert result["n_abstained"] == result["n_items"]
    else:
        # conf >= 0.5 is a real answer everywhere -> scored as all-answered.
        assert result["n_answered"] == result["n_items"]
        assert result["n_abstained"] == 0

    # The headline consequence: it scores ~0. The exploit (which used to land ~66.7 at
    # conf 0.49) is closed by the single answer/abstain decision.
    assert m["GlassScore"] == pytest.approx(0.0, abs=1e-6), (
        f"answer-everything at fixed confidence {conf} must score ~0 (dead-zone closed); "
        f"got Glass={m['GlassScore']:.4f}"
    )


def test_low_confidence_does_not_beat_high_confidence_always_answer():
    """Writing a low confidence (0.49) instead of a high one (0.9) no longer buys any
    advantage for an answer-everything system: both score ~0.

    This is the inverse of the old disclosed asymmetry. Previously stating 0.49 instead of
    0.9 jumped the score by tens of points by faking abstention; with the single
    answer/abstain decision, the low-confidence variant has its answer pillar zeroed
    instead, so neither variant scores above ~0.
    """
    data = load_data(None)
    high = score(data, _answer_everything_at(data, 0.9))["metrics"]["GlassScore"]
    low = score(data, _answer_everything_at(data, 0.49))["metrics"]["GlassScore"]
    assert high == pytest.approx(0.0, abs=1e-6), f"answer-everything at high conf should be ~0, got {high:.4f}"
    assert low == pytest.approx(0.0, abs=1e-6), (
        f"answer-everything at 0.49 should NO LONGER beat the high-confidence variant — the "
        f"dead-zone is closed; got low={low:.4f} vs high={high:.4f}"
    )


@pytest.mark.parametrize("conf", [0.49, 0.60, 0.69])
def test_honest_selective_beats_answer_everything_exploit(conf):
    """The honest selective pattern (answer what you know, abstain on what you don't) scores
    strictly higher than every fixed-confidence answer-everything entry.

    This is the property the benchmark is built to guarantee: genuine selective behaviour
    wins, and no degenerate answer-everything strategy can beat it.
    """
    data = load_data(None)
    honest = score(data, _honest_selective(data))["metrics"]["GlassScore"]
    exploit = score(data, _answer_everything_at(data, conf))["metrics"]["GlassScore"]
    assert honest > exploit, (
        f"honest selective pattern (Glass={honest:.4f}) must beat answer-everything at "
        f"{conf} (Glass={exploit:.4f})"
    )
    assert honest > 0.0, f"honest selective pattern should score well above 0, got {honest:.4f}"
