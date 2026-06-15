#!/usr/bin/env python3
"""random_confidence — the calibration floor reference baseline.

This system **always answers** and assigns each answer a **uniform-random confidence**
in [0, 1]. Its answer text is produced by the same deterministic BM25 retrieval as the
bm25_retrieval baseline (so it has a non-trivial accuracy to be miscalibrated against),
but its stated confidence carries **no information** about correctness.

Why it exists: it is the calibration floor. A confidence that is independent of
correctness is, on average, maximally uncalibrated and a poor probabilistic forecast, so
this baseline shows roughly what ECE / Brier / AURC look like when ``confidence`` is
noise. Any real system claiming calibrated confidence must clearly beat this; if it does
not, its confidence is no better than a coin.

Deterministic *given the seed*: the RNG is a fixed-seed ``random.Random`` drawn in a
fixed (data) order, so two runs are byte-identical. No LLM, no API key.
"""

from __future__ import annotations

import random
from typing import List

from _common import (
    BM25,
    load_items,
    tokenize,
    user_sentences,
    write_predictions,
)

NAME = "random_confidence"
SEED = 20260615  # fixed so the baseline is reproducible (matches the data-build seed)


def _best_answer(item: dict) -> str:
    """Deterministic BM25 best-sentence answer (same retrieval as bm25_retrieval).

    Falls back to the last user sentence, then to empty string, so this baseline always
    emits *some* answer (it never abstains — only the confidence is random).
    """
    sentences = user_sentences(item, include_synthetic=True)
    if not sentences:
        return ""
    docs = [tokenize(s) for s in sentences]
    bm25 = BM25(docs)
    best_i, best_score = bm25.best(tokenize(item.get("query", "")))
    if best_i < 0 or best_score <= 0.0:
        return sentences[-1]
    return sentences[best_i]


def predict(items: List[dict]) -> List[dict]:
    rng = random.Random(SEED)
    preds = []
    for item in items:
        answer = _best_answer(item)
        confidence = rng.random()  # uniform in [0, 1)
        preds.append({"id": item["id"], "answer": answer, "confidence": confidence})
    return preds


def main() -> str:
    items = load_items()
    preds = predict(items)
    out_path = write_predictions(NAME, preds)
    print(f"[{NAME}] wrote {len(preds)} predictions ({len(preds)} answered, 0 abstain) -> {out_path}")
    return out_path


if __name__ == "__main__":
    main()
