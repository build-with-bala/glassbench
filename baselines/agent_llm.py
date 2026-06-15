#!/usr/bin/env python3
"""agent_llm — a genuine (imperfect) abstention-aware memory agent baseline.

This is the *honest* abstention-aware reference: unlike the constructed
``abstention_aware_llm`` oracle (which was built from the gold labels and is excluded
from the headline board), this baseline reads ONLY each item's ``history`` and
``query`` — never ``gold_answer``, never ``split`` — and decides, with simple
deterministic logic that mimics how a careful LLM memory agent behaves:

  1. Scan the user turns for an explicit retraction cue ("actually, scratch ...",
     "correction:", "disregard", "ignore what I said", "forget what I said") that
     applies to the topic of the query. If found, ABSTAIN (the fact was retracted).
  2. Otherwise try to extract the queried fact from the user turns by last-write-wins
     keyword matching against the query's content words. Confidence is a function of how
     strongly the best evidence sentence overlaps the query and how recent it is.
  3. If no sentence plausibly contains the queried target, ABSTAIN (treat as a
     false premise / unsupported query).

It is deliberately **imperfect**: it has no semantic understanding, so it
  * misses *implicit* retractions and soft contradictions (it only catches cue words),
  * is sometimes fooled by a sibling fact that lexically overlaps the query (answering a
    false-premise item it should have abstained on),
  * extracts a whole sentence rather than the precise short answer, so the string matcher
    does not always credit it,
  * and its verbalized confidence is only roughly calibrated.

That imperfect routing/confidence is the point: it is a realistic agent, not an oracle.
It reads NO labels, so it is a valid submission under CONTRIBUTING.md.

Deterministic: no LLM, no API key, no RNG. Two runs are byte-identical.
"""

from __future__ import annotations

import re
from typing import List, Optional, Tuple

from _common import (
    load_items,
    split_sentences,
    tokenize,
    user_turns,
    write_predictions,
)

NAME = "agent_llm"

# Explicit retraction cue patterns. A careful agent that reads the history will catch
# these surface cues; it will NOT catch implicit/soft retractions (by design — that is
# where a real lexical agent fails, and the benchmark rewards systems that do better).
_RETRACTION_CUES = [
    r"\bscratch what i (said|mentioned)\b",
    r"\bforget what i (said|mentioned)\b",
    r"\bforget the\b",
    r"\bdisregard\b",
    r"\bignore what i (said|mentioned)\b",
    r"\bignore the\b",
    r"\bignore what i said about\b",
    r"\bcorrection\b",
    r"\bi misspoke\b",
    r"\bi shouldn't have said\b",
    r"\bscratch the\b",
    r"\bon second thought,? (forget|scratch)\b",
]
_RETRACTION_RE = re.compile("|".join(_RETRACTION_CUES), flags=re.IGNORECASE)

# Light stopword list so query "content words" are meaningful for overlap scoring.
_STOP = {
    "the", "a", "an", "of", "to", "and", "or", "is", "are", "am", "do", "i", "my",
    "me", "what", "how", "many", "much", "have", "has", "had", "in", "on", "at",
    "for", "with", "since", "been", "did", "does", "was", "were", "that", "this",
    "it", "its", "currently", "current", "so", "far", "now", "long", "time", "times",
    "you", "your", "about", "from", "their", "they", "there", "when", "which", "who",
}


def _content_words(text: str) -> List[str]:
    return [t for t in tokenize(text) if t not in _STOP and len(t) > 2]


def _query_targets_retraction(query: str, sentence: str) -> bool:
    """A retraction sentence is relevant if it shares >=1 content word with the query."""
    qs = set(_content_words(query))
    ss = set(_content_words(sentence))
    return len(qs & ss) >= 1


def _best_evidence(query: str, sentences: List[str]) -> Tuple[Optional[int], float]:
    """Last-write-wins best sentence by content-word overlap with the query.

    Returns (index, overlap_fraction). Ties are broken toward the LATER sentence
    (recency), which is how a memory agent should resolve knowledge updates.
    """
    q = set(_content_words(query))
    if not q:
        return None, 0.0
    best_i, best_score = None, 0.0
    for i, s in enumerate(sentences):
        sw = set(_content_words(s))
        if not sw:
            continue
        overlap = len(q & sw) / len(q)
        # >= keeps the LATER sentence on ties (recency / last-write-wins).
        if overlap >= best_score and overlap > 0.0:
            best_score, best_i = overlap, i
    return best_i, best_score


def _confidence(overlap: float, recency: float) -> float:
    """Rough verbalized confidence: stronger lexical support and more-recent evidence
    raise confidence. Capped below 1.0 — a lexical agent is never certain.
    """
    raw = 0.45 * overlap + 0.35 * recency + 0.10
    return float(min(0.92, max(0.05, raw)))


def predict(items: List[dict]) -> List[dict]:
    preds = []
    for item in items:
        turns = user_turns(item, include_synthetic=True)
        sentences: List[str] = []
        for t in turns:
            sentences.extend(split_sentences(t))
        query = item.get("query", "")

        if not sentences:
            preds.append({"id": item["id"], "abstain": True})
            continue

        # 1) Explicit retraction detection (only surface cues; misses implicit ones).
        retracted = False
        for s in sentences:
            if _RETRACTION_RE.search(s) and _query_targets_retraction(query, s):
                retracted = True
                break
        if retracted:
            preds.append({"id": item["id"], "abstain": True})
            continue

        # 2) Try to extract the queried fact (last-write-wins by overlap).
        idx, overlap = _best_evidence(query, sentences)
        # 3) If nothing overlaps the query well, treat as unsupported -> abstain.
        #    The 0.34 floor is a fixed (untuned-against-labels) threshold: below it the
        #    agent judges the queried target was never asserted. This is where it both
        #    correctly abstains on many false-premise items AND wrongly abstains on some
        #    answerable ones whose answer sentence shares few words with the query.
        if idx is None or overlap < 0.34:
            preds.append({"id": item["id"], "abstain": True})
            continue

        recency = (idx + 1) / len(sentences)
        conf = _confidence(overlap, recency)
        preds.append({
            "id": item["id"],
            "answer": sentences[idx],
            "confidence": conf,
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
