#!/usr/bin/env python3
"""always_abstain — the "I don't know" reference baseline.

This system **abstains on every item**. It is the mirror image of always_answer: it has
a perfect Confidently-Wrong Rate (it is never confidently wrong, because it never makes a
claim) and perfect abstention recall on both unanswerable splits (contradiction,
false_premise) — but it is **useless on answerable and stale**, where the honest
behaviour is to answer. It scores 0 on the answer-bearing splits.

It exists to anchor the leaderboard: abstaining is neither a free win nor a free loss.
A system that beats this one has to actually answer the answerable questions, not just
refuse everything.

Deterministic: no LLM, no API key, no RNG.
"""

from __future__ import annotations

from typing import List

from _common import load_items, write_predictions

NAME = "always_abstain"


def predict(items: List[dict]) -> List[dict]:
    return [{"id": item["id"], "abstain": True} for item in items]


def main() -> str:
    items = load_items()
    preds = predict(items)
    out_path = write_predictions(NAME, preds)
    print(f"[{NAME}] wrote {len(preds)} predictions (0 answered, {len(preds)} abstain) -> {out_path}")
    return out_path


if __name__ == "__main__":
    main()
