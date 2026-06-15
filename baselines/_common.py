"""Shared helpers for GlassBench reference baselines.

These baselines are **deterministic** and use **no LLM and no API key**. They exist to
populate the leaderboard with non-learned reference points so every real submission can
be read against an obvious floor/ceiling:

  * always_answer      — last-write-wins recency; never abstains (high CWR expected).
  * always_abstain     — abstains on everything (free abstention recall, useless on
                         answerable).
  * bm25_retrieval     — retrieve the best-matching history sentence; confidence from the
                         match score.
  * random_confidence  — always answers, uniform-random confidence (a calibration floor).
  * agent_llm          — genuine, imperfect abstention-aware agent: detects explicit
                         retraction cues, extracts the queried fact by last-write-wins
                         overlap, abstains when the target is unsupported. Reads no labels.

Nothing here references any private system, product, or brand. Everything reads the
public ``data/glassbench_v0.1.jsonl`` and writes a submission ``predictions.json`` in the
exact contract shape from PRE_REGISTRATION.md:

    {"id", "answer", "confidence" in [0,1]}   OR   {"id", "abstain": true}
"""

from __future__ import annotations

import json
import math
import os
import re
from typing import Dict, Iterable, List, Optional, Tuple

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(HERE)
DATA_PATH = os.path.join(REPO_ROOT, "data", "glassbench_v0.1.jsonl")
SUBMISSIONS_DIR = os.path.join(REPO_ROOT, "submissions")


# --------------------------------------------------------------------------- #
# Data loading
# --------------------------------------------------------------------------- #

def load_items(path: str = DATA_PATH) -> List[dict]:
    """Load the benchmark JSONL (one item per line)."""
    items: List[dict] = []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            items.append(json.loads(line))
    return items


def write_predictions(name: str, predictions: List[dict]) -> str:
    """Write ``predictions`` to ``submissions/<name>/predictions.json`` and return the
    path. Predictions are emitted in input (data) order; the file is deterministic.
    """
    out_dir = os.path.join(SUBMISSIONS_DIR, name)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "predictions.json")
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(predictions, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    return out_path


# --------------------------------------------------------------------------- #
# Text helpers — sentence splitting & tokenization (deterministic, no deps)
# --------------------------------------------------------------------------- #

_WORD_RE = re.compile(r"[a-z0-9]+(?:[$%][a-z0-9]+)?", flags=re.UNICODE)
# Split on sentence-ending punctuation followed by whitespace, or on newlines.
_SENT_SPLIT_RE = re.compile(r"(?<=[.!?])\s+|\n+")


def tokenize(text: str) -> List[str]:
    """Lowercase word/number tokenization used by the BM25 baseline."""
    if not text:
        return []
    return _WORD_RE.findall(text.lower())


def split_sentences(text: str) -> List[str]:
    """Split a turn's content into trimmed, non-empty sentences."""
    out = []
    for piece in _SENT_SPLIT_RE.split(text or ""):
        piece = piece.strip()
        if piece:
            out.append(piece)
    return out


def user_turns(item: dict, include_synthetic: bool = True) -> List[str]:
    """Return the user-turn contents of an item's history, in chronological order.

    ``history`` is already stored chronologically (sessions sorted by date by the
    builder, and the synthetic retraction is appended last). Setting
    ``include_synthetic=False`` drops flagged synthetic turns/sessions.
    """
    out: List[str] = []
    for sess in item.get("history", []):
        sess_synth = bool(sess.get("synthetic", False))
        for turn in sess.get("turns", []):
            if turn.get("role") != "user":
                continue
            if not include_synthetic and (sess_synth or turn.get("synthetic", False)):
                continue
            content = turn.get("content", "")
            if content:
                out.append(content)
    return out


def user_sentences(item: dict, include_synthetic: bool = True) -> List[str]:
    """All user-turn sentences of an item, chronological order preserved."""
    sents: List[str] = []
    for content in user_turns(item, include_synthetic=include_synthetic):
        sents.extend(split_sentences(content))
    return sents


# --------------------------------------------------------------------------- #
# BM25 (Okapi) over a small per-item corpus of sentences
# --------------------------------------------------------------------------- #

class BM25:
    """Minimal deterministic Okapi BM25 over an in-memory list of documents.

    Standard parameters (k1=1.5, b=0.75). Used per item: the "corpus" is that item's
    user-turn sentences and the "query" is the item's question.
    """

    def __init__(self, docs: List[List[str]], k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.docs = docs
        self.N = len(docs)
        self.doc_len = [len(d) for d in docs]
        self.avgdl = (sum(self.doc_len) / self.N) if self.N else 0.0
        # document frequency per term
        self.df: Dict[str, int] = {}
        for d in docs:
            for term in set(d):
                self.df[term] = self.df.get(term, 0) + 1
        # precompute term frequencies per doc
        self.tf: List[Dict[str, int]] = []
        for d in docs:
            counts: Dict[str, int] = {}
            for term in d:
                counts[term] = counts.get(term, 0) + 1
            self.tf.append(counts)

    def _idf(self, term: str) -> float:
        n_q = self.df.get(term, 0)
        # Okapi BM25 idf with +0.5 smoothing; floored at 0 so common terms never go
        # negative and drag a score below an unrelated doc.
        return max(0.0, math.log((self.N - n_q + 0.5) / (n_q + 0.5) + 1.0))

    def score(self, query_tokens: List[str], doc_index: int) -> float:
        tf = self.tf[doc_index]
        dl = self.doc_len[doc_index]
        score = 0.0
        for term in query_tokens:
            f = tf.get(term, 0)
            if f == 0:
                continue
            idf = self._idf(term)
            denom = f + self.k1 * (1.0 - self.b + self.b * (dl / self.avgdl if self.avgdl else 0.0))
            score += idf * (f * (self.k1 + 1.0)) / (denom if denom else 1.0)
        return score

    def best(self, query_tokens: List[str]) -> Tuple[int, float]:
        """Return ``(best_doc_index, best_score)``. ``(-1, 0.0)`` if empty corpus.

        Ties broken by the smallest index (earliest sentence) for determinism.
        """
        if self.N == 0:
            return -1, 0.0
        best_i, best_s = -1, float("-inf")
        for i in range(self.N):
            s = self.score(query_tokens, i)
            if s > best_s:
                best_s, best_i = s, i
        if best_i < 0:
            return -1, 0.0
        return best_i, max(0.0, best_s)
