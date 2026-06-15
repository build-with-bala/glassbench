"""Unit tests for the GlassBench scorer using a tiny synthetic fixture.

We build a small synthetic dataset covering all four splits and three reference
systems, then assert the metrics behave as the frozen contract requires:

* perfect system          -> Glass ~ 100, CWR 0, abstention recall 1/1
* always-answer system    -> AbstentionRecall 0 on both unanswerable splits, high CWR,
                             safety pillar 0 => Glass == 0
* always-abstain system   -> CWR 0, abstention recall 1/1, AURC degenerate, but
                             answer pillar 0 => Glass == 0

The Glass Score is the harmonic mean of an answer pillar (AnswerableAccuracy) and a
safety pillar (mean abstention recall), scaled by (1 - CWR). Zeroing EITHER pillar
yields Glass == 0, so both degenerate extremes score 0 and only genuine selective
behaviour scores high. The tests below encode exactly that two-pillar invariant.

Run with the project venv (from the repo root):
    python -m tests.test_metrics
(or via pytest). It also runs as a plain script and prints PASS/FAIL.
"""

from __future__ import annotations

import math

from glassbench.match import is_correct, normalize
from glassbench.score import score


# ---------------------------------------------------------------------------------
# Synthetic fixture
# ---------------------------------------------------------------------------------

def make_dataset():
    """A balanced 12-item synthetic set: 3 each of answerable, stale, contradiction,
    false_premise. Gold answers for answerable/stale; ABSTAIN for the two unanswerable
    splits.
    """
    data = []
    answerable_golds = ["Seattle", "blue", "42"]
    stale_golds = ["Paris", "Toyota", "March"]
    for i, g in enumerate(answerable_golds):
        data.append({"id": f"ans{i}", "split": "answerable", "gold_answer": g})
    for i, g in enumerate(stale_golds):
        data.append({"id": f"stale{i}", "split": "stale", "gold_answer": g})
    for i in range(3):
        data.append({"id": f"contra{i}", "split": "contradiction", "gold_answer": "ABSTAIN"})
    for i in range(3):
        data.append({"id": f"fp{i}", "split": "false_premise", "gold_answer": "ABSTAIN"})
    return data


def gold_of(item_id, data):
    for it in data:
        if it["id"] == item_id:
            return it["gold_answer"]
    raise KeyError(item_id)


def perfect_predictions(data):
    """Answer answerable/stale correctly at confidence 1.0; abstain on unanswerable."""
    preds = []
    for it in data:
        if it["split"] in ("answerable", "stale"):
            preds.append({"id": it["id"], "answer": it["gold_answer"], "confidence": 1.0})
        else:
            preds.append({"id": it["id"], "abstain": True})
    return preds


def always_answer_predictions(data):
    """Answer everything at high confidence (0.95). On answerable/stale, answer the gold
    (so it is a competent retriever); on unanswerable, answer something wrong — which is
    the whole point: a confident answer to an unanswerable query is confidently-wrong.
    """
    preds = []
    for it in data:
        if it["split"] in ("answerable", "stale"):
            preds.append({"id": it["id"], "answer": it["gold_answer"], "confidence": 0.95})
        else:
            preds.append({"id": it["id"], "answer": "some confident guess", "confidence": 0.95})
    return preds


def always_abstain_predictions(data):
    return [{"id": it["id"], "abstain": True} for it in data]


def to_pred_map(pred_list):
    # Mimic glassbench.score.load_predictions output shape.
    out = {}
    for row in pred_list:
        if row.get("abstain") is True:
            out[row["id"]] = {"answered": False, "answer": None, "confidence": 0.0}
        else:
            out[row["id"]] = {
                "answered": True,
                "answer": row.get("answer"),
                "confidence": float(row.get("confidence", 0.0)),
            }
    return out


# ---------------------------------------------------------------------------------
# Assertions
# ---------------------------------------------------------------------------------

def approx(a, b, tol=1e-9):
    return abs(a - b) <= tol


def test_matcher():
    assert is_correct("Seattle", "Seattle")
    assert is_correct("seattle", "Seattle")
    assert is_correct("It is Seattle.", "Seattle")          # gold as subsequence
    assert is_correct("the answer is New York", "New York")
    assert not is_correct("Portland", "Seattle")
    assert not is_correct("", "Seattle")
    assert not is_correct(None, "Seattle")
    assert is_correct("two", "2")                            # number word
    assert is_correct("Toyota", "toyota")
    # set match: all required, order-free
    assert is_correct("I have a cat and a dog", ["cat", "dog"])
    assert is_correct("dog, cat", ["cat", "dog"])
    assert not is_correct("only a cat", ["cat", "dog"])
    assert normalize("The  U.S.A.!") == "u s a"
    print("  [ok] matcher")


def test_perfect():
    data = make_dataset()
    preds = to_pred_map(perfect_predictions(data))
    r = score(data, preds)
    m = r["metrics"]
    assert approx(m["CWR"], 0.0), m["CWR"]
    assert approx(m["AURC_norm"], 0.0), m["AURC_norm"]
    assert approx(m["AbstentionRecall_contradiction"], 1.0), m
    assert approx(m["AbstentionRecall_false_premise"], 1.0), m
    assert approx(m["ECE"], 0.0, tol=1e-9), m["ECE"]
    assert approx(m["Brier"], 0.0, tol=1e-9), m["Brier"]
    assert approx(m["GlassScore"], 100.0, tol=1e-6), m["GlassScore"]
    # Perfect abstains on unanswerable -> only answerable/stale answered.
    assert r["n_answered"] == 6, r["n_answered"]
    print(f"  [ok] perfect: Glass={m['GlassScore']:.4f} CWR={m['CWR']:.3f}")


def test_always_answer():
    data = make_dataset()
    preds = to_pred_map(always_answer_predictions(data))
    r = score(data, preds)
    m = r["metrics"]
    # AbstentionRecall must be 0 on BOTH unanswerable splits (never abstains).
    assert approx(m["AbstentionRecall_contradiction"], 0.0), m
    assert approx(m["AbstentionRecall_false_premise"], 0.0), m
    # CWR: 6 unanswerable items answered confidently-wrong out of 12 total -> 0.5.
    assert approx(m["CWR"], 6 / 12), m["CWR"]
    # It answered everything (12 answered).
    assert r["n_answered"] == 12, r["n_answered"]
    # On answerable items it is correct, so AURC on answerable is ~0 (no errors there).
    assert m["AURC"] <= 1e-9, m["AURC"]
    # Safety pillar is 0 (never abstains), so the harmonic mean is 0 => Glass == 0.
    # An answer-everything system cannot score on this benchmark, no matter how good
    # its answerable accuracy is.
    p = m["GlassScore_parts"]
    assert approx(p["safety_pillar"], 0.0), p
    assert approx(m["GlassScore"], 0.0), m["GlassScore"]
    print(
        f"  [ok] always-answer: CWR={m['CWR']:.3f} "
        f"AbstRecall(c/fp)={m['AbstentionRecall_contradiction']:.2f}/"
        f"{m['AbstentionRecall_false_premise']:.2f} "
        f"safety_pillar={p['safety_pillar']:.2f} Glass={m['GlassScore']:.2f}"
    )


def test_always_abstain():
    data = make_dataset()
    preds = to_pred_map(always_abstain_predictions(data))
    r = score(data, preds)
    m = r["metrics"]
    # Never answers -> never confidently wrong.
    assert approx(m["CWR"], 0.0), m["CWR"]
    # Abstains on everything -> abstention recall 1 on both unanswerable splits.
    assert approx(m["AbstentionRecall_contradiction"], 1.0), m
    assert approx(m["AbstentionRecall_false_premise"], 1.0), m
    # Nothing answered -> ECE/Brier degenerate to 0 (no answered set).
    assert r["n_answered"] == 0, r["n_answered"]
    assert approx(m["ECE"], 0.0), m["ECE"]
    assert approx(m["Brier"], 0.0), m["Brier"]
    # AURC on answerable: every answerable item is "selected" only at full coverage as
    # an error, so AURC == ceiling == 1 -> AURC_norm == 1 (worst selective accuracy).
    assert approx(m["AURC_norm"], 1.0), m["AURC_norm"]
    # Answer pillar is 0 (AnswerableAccuracy == 0), so the harmonic mean is 0 => Glass
    # == 0, even though abstention recall and CWR look perfect. A do-nothing abstainer
    # cannot top the board — this is the fairness fix.
    p = m["GlassScore_parts"]
    assert approx(p["answer_pillar"], 0.0), p
    assert approx(m["GlassScore"], 0.0), m["GlassScore"]
    print(
        f"  [ok] always-abstain: CWR={m['CWR']:.3f} "
        f"AbstRecall=1/1 AURC_norm={m['AURC_norm']:.2f} "
        f"answer_pillar={p['answer_pillar']:.2f} Glass={m['GlassScore']:.2f}"
    )


def selective_predictions(data):
    """A genuine (imperfect) selective system: answers most answerable/stale items
    correctly at moderate confidence and abstains on the unanswerable splits. It has a
    non-zero answer pillar AND a non-zero safety pillar, so it must score above both
    degenerate extremes.
    """
    preds = []
    for i, it in enumerate(data):
        if it["split"] in ("answerable", "stale"):
            # Get all but mark one wrong, to stay realistic (answer pillar < 1).
            if i == 0:
                preds.append({"id": it["id"], "answer": "wrong", "confidence": 0.4})
            else:
                preds.append({"id": it["id"], "answer": it["gold_answer"], "confidence": 0.8})
        else:
            preds.append({"id": it["id"], "abstain": True})
    return preds


def test_selective_beats_both_extremes():
    """The core two-pillar invariant: a balanced selective system (non-zero answer AND
    safety pillar) scores strictly higher than BOTH a do-nothing always-abstain system
    (answer pillar 0 => Glass 0) and an answer-everything system (safety pillar 0 =>
    Glass 0). Neither degenerate extreme can win.
    """
    data = make_dataset()
    selective = score(data, to_pred_map(selective_predictions(data)))["metrics"]
    abstain = score(data, to_pred_map(always_abstain_predictions(data)))["metrics"]
    answer = score(data, to_pred_map(always_answer_predictions(data)))["metrics"]

    # Both degenerate extremes score exactly 0.
    assert approx(abstain["GlassScore"], 0.0), abstain["GlassScore"]
    assert approx(answer["GlassScore"], 0.0), answer["GlassScore"]
    # The balanced selective system has both pillars > 0 and scores above both.
    p = selective["GlassScore_parts"]
    assert p["answer_pillar"] > 0.0, p
    assert p["safety_pillar"] > 0.0, p
    assert selective["GlassScore"] > abstain["GlassScore"], (selective["GlassScore"], abstain["GlassScore"])
    assert selective["GlassScore"] > answer["GlassScore"], (selective["GlassScore"], answer["GlassScore"])
    print(
        f"  [ok] selective beats both extremes: "
        f"selective={selective['GlassScore']:.2f} > "
        f"always_abstain={abstain['GlassScore']:.2f} & "
        f"always_answer={answer['GlassScore']:.2f}"
    )


def test_ece_bias_correction_reduces_error():
    """A perfectly-calibrated-in-expectation stream with finite samples: the naive ECE
    should be > 0 from sampling noise, and the bias-corrected ECE should be <= naive.
    """
    import numpy as np
    from glassbench.calib import debiased_ece

    rng = np.random.default_rng(0)
    # Confidences spread across [0,1]; correctness drawn Bernoulli(confidence) => the
    # system is calibrated in truth, so true ECE = 0 and any measured ECE is noise.
    conf = rng.uniform(0.0, 1.0, size=600)
    corr = (rng.uniform(size=conf.shape) < conf).astype(float)
    out = debiased_ece(conf, corr, n_bins=15)
    assert out["ece"] <= out["ece_naive"] + 1e-12, out
    assert out["ece_naive"] > 0.0, out  # naive is positively biased
    print(
        f"  [ok] ece bias-correction: naive={out['ece_naive']:.4f} "
        f"corrected={out['ece']:.4f} (correction removed "
        f"{out['ece_naive']-out['ece']:.4f})"
    )


def test_cwr_threshold_boundary():
    """An answer to an unanswerable item at exactly 0.70 counts as confidently-wrong;
    at 0.69 it does not. Confirms the >= 0.70 boundary.
    """
    data = [{"id": "c0", "split": "contradiction", "gold_answer": "ABSTAIN"}]
    at = to_pred_map([{"id": "c0", "answer": "x", "confidence": 0.70}])
    below = to_pred_map([{"id": "c0", "answer": "x", "confidence": 0.69}])
    assert approx(score(data, at)["metrics"]["CWR"], 1.0)
    assert approx(score(data, below)["metrics"]["CWR"], 0.0)
    print("  [ok] CWR >=0.70 boundary")


def run_all():
    tests = [
        test_matcher,
        test_perfect,
        test_always_answer,
        test_always_abstain,
        test_selective_beats_both_extremes,
        test_ece_bias_correction_reduces_error,
        test_cwr_threshold_boundary,
    ]
    print("GlassBench fixture tests")
    failed = 0
    for t in tests:
        try:
            t()
        except AssertionError as exc:
            failed += 1
            print(f"  [FAIL] {t.__name__}: {exc}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"  [ERROR] {t.__name__}: {exc!r}")
    if failed:
        print(f"\n{failed} test(s) failed.")
    else:
        print("\nAll tests passed.")
    return failed


if __name__ == "__main__":
    import sys
    sys.exit(1 if run_all() else 0)
