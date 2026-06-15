#!/usr/bin/env python3
"""always_answer — the recency / last-write-wins reference baseline.

This is the "it always remembers the most recent thing" system: it **never abstains**.
For every item it emits an answer drawn from the most recent user statement that is
relevant to the query, with a fixed high confidence of 0.9.

Why it exists: this is the dominant behaviour of naive memory systems (and of plain
long-context prompting) — surface the latest matching fact and state it confidently. On
GlassBench that makes it strong on ``answerable`` (the latest assertion usually *is* the
current fact) but it has a **high Confidently-Wrong Rate**: it answers ``contradiction``
and ``false_premise`` items (gold = ABSTAIN) at 0.9 confidence, and it answers ``stale``
queries with whatever the most recent matching statement says even when the query asks
for the older value. It knows what it remembers; it does not know when it is wrong.

Deterministic: no LLM, no API key, no RNG. The answer is chosen by recency-weighted
lexical overlap with the query, ties broken toward the *latest* sentence (last write
wins). Two runs are byte-identical.
"""

from __future__ import annotations

from typing import List, Optional

from _common import (
    load_items,
    split_sentences,
    tokenize,
    user_turns,
    write_predictions,
)

NAME = "always_answer"
CONFIDENCE = 0.9


def _stop() -> set:
    # A tiny stoplist so the overlap focuses on content words, not query scaffolding
    # ("how many", "what is", "do I", ...). Deterministic and fixed.
    return {
        "what", "when", "where", "which", "who", "whom", "whose", "why", "how",
        "is", "are", "was", "were", "be", "been", "being", "am", "do", "does",
        "did", "have", "has", "had", "the", "a", "an", "of", "to", "in", "on",
        "at", "for", "and", "or", "my", "i", "me", "you", "your", "this", "that",
        "it", "its", "with", "as", "by", "from", "about", "into", "currently",
        "now", "ago", "still", "many", "much",
    }


def latest_relevant_answer(item: dict) -> Optional[str]:
    """Pick the answer the way a last-write-wins memory would: scan user statements,
    score each by query-token overlap, and prefer the *most recent* among the best.

    Returns the chosen sentence (the system's stated "fact"), or the last user sentence
    as a fallback when nothing overlaps (a memory system that always says *something*).
    """
    stop = _stop()
    q_tokens = [t for t in tokenize(item.get("query", "")) if t not in stop]
    q_set = set(q_tokens)

    # Enumerate (recency_rank, sentence): later sentences get a higher rank.
    sentences: List[str] = []
    for content in user_turns(item, include_synthetic=True):
        sentences.extend(split_sentences(content))
    if not sentences:
        return None

    best_idx = -1
    best_key = None  # (overlap, recency_index)
    for idx, sent in enumerate(sentences):
        s_set = set(tokenize(sent)) - stop
        overlap = len(q_set & s_set)
        # Recency is the tiebreaker: among equal overlap, the later (larger idx) wins.
        key = (overlap, idx)
        if best_key is None or key > best_key:
            best_key = key
            best_idx = idx

    # If literally nothing overlapped the query, fall back to the latest user sentence —
    # the model still answers (it never abstains), it just answers with its most recent
    # memory.
    if best_key is not None and best_key[0] == 0:
        return sentences[-1]
    return sentences[best_idx]


def predict(items: List[dict]) -> List[dict]:
    preds = []
    for item in items:
        ans = latest_relevant_answer(item)
        if ans is None:
            ans = ""  # degenerate (no history); still answers, never abstains
        preds.append({"id": item["id"], "answer": ans, "confidence": CONFIDENCE})
    return preds


def main() -> str:
    items = load_items()
    preds = predict(items)
    out_path = write_predictions(NAME, preds)
    answered = sum(1 for p in preds if "answer" in p)
    print(f"[{NAME}] wrote {len(preds)} predictions ({answered} answered, 0 abstain) -> {out_path}")
    return out_path


if __name__ == "__main__":
    main()
