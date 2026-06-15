#!/usr/bin/env python3
"""bm25_retrieval — a classic sparse-retrieval reference baseline.

For each item it builds a tiny BM25 (Okapi) index over the **user-turn sentences** of
that item's history and retrieves the single best-matching sentence for the query. That
sentence is returned verbatim as the answer; the confidence is a deterministic function
of the BM25 match score (a stronger lexical match -> higher stated confidence).

Why it exists: BM25 retrieval is the standard "RAG floor". It shows what you get from
pure lexical matching with a score-derived confidence and **no abstention logic** — it
always returns its best hit. Because it never decides a query is unanswerable, it answers
``contradiction`` and ``false_premise`` items too, so it carries real
Confidently-Wrong Rate whenever the best lexical hit is confident; its confidence is only
as calibrated as "did the query share rare words with some sentence", which is the point
the benchmark is making.

Deterministic: no LLM, no API key, no RNG. Standard BM25 (k1=1.5, b=0.75); ties broken
toward the earliest sentence; confidence is a fixed squashing of the score. Two runs are
byte-identical.
"""

from __future__ import annotations

import math
from typing import List

from _common import (
    BM25,
    load_items,
    tokenize,
    user_sentences,
    write_predictions,
)

NAME = "bm25_retrieval"

# Confidence = 1 - exp(-score / SCALE): 0 at score 0, rising smoothly toward 1. SCALE is
# fixed (not tuned against the labels) so the mapping is part of the committed baseline,
# not fit to the data.
SCORE_SCALE = 6.0


def _confidence_from_score(score: float) -> float:
    if score <= 0.0:
        return 0.0
    conf = 1.0 - math.exp(-score / SCORE_SCALE)
    return float(min(1.0, max(0.0, conf)))


def predict(items: List[dict]) -> List[dict]:
    preds = []
    for item in items:
        sentences = user_sentences(item, include_synthetic=True)
        if not sentences:
            # No retrievable text: abstain (nothing to return).
            preds.append({"id": item["id"], "abstain": True})
            continue
        docs = [tokenize(s) for s in sentences]
        bm25 = BM25(docs)
        q_tokens = tokenize(item.get("query", ""))
        best_i, best_score = bm25.best(q_tokens)
        if best_i < 0 or best_score <= 0.0:
            # No lexical overlap with anything -> nothing matched; treat as abstain.
            preds.append({"id": item["id"], "abstain": True})
            continue
        preds.append({
            "id": item["id"],
            "answer": sentences[best_i],
            "confidence": _confidence_from_score(best_score),
        })
    return preds


def main() -> str:
    items = load_items()
    preds = predict(items)
    out_path = write_predictions(NAME, preds)
    answered = sum(1 for p in preds if "answer" in p)
    abstained = sum(1 for p in preds if p.get("abstain") is True)
    print(f"[{NAME}] wrote {len(preds)} predictions ({answered} answered, {abstained} abstain) -> {out_path}")
    return out_path


if __name__ == "__main__":
    main()
