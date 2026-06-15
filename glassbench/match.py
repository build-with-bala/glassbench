"""Normalized answer matcher for GlassBench.

PRE_REGISTRATION.md, "Metrics (exact)":

    An answer is *correct* iff it matches gold (normalized string / set match;
    matcher committed in ``glassbench/match.py``).

This module is the committed matcher. It is intentionally simple, deterministic, and
conservative — it normalizes surface form (case, articles, punctuation, whitespace,
spelled-out small numbers) but does **not** attempt semantic equivalence, paraphrase,
or model-based judging. Two runs over the same inputs produce identical results.

Two match modes, picked automatically:

* **string match** — the default. ``gold`` is a single string; the prediction matches
  if its normalized form equals the normalized gold, OR (to tolerate verbose
  free-text answers) the normalized gold appears as a whole-token subsequence of the
  normalized prediction. The subsequence allowance only ever makes a *correct* answer
  count — it never lets a wrong short answer match a longer gold, because gold is the
  needle.

* **set match** — used when ``gold`` is a list/tuple/set, signalling "all of these
  values must be present" (e.g. multi-answer questions). The prediction is correct iff
  every normalized gold element is found (as a token subsequence) in the normalized
  prediction. Order does not matter.

Whatever the mode, an empty/None prediction never matches a non-empty gold.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Iterable, Sequence, Union

GoldType = Union[str, Sequence[str]]

# Articles / filler stripped during normalization. Kept tiny on purpose: removing too
# much risks matching things that should not match. ``_ARTICLES`` is stripped at the
# leading edge; ``_TRAILING_ARTICLES`` (excludes "a") at the trailing edge — see
# ``normalize`` for why a trailing "a" is preserved.
_ARTICLES = {"a", "an", "the"}
_TRAILING_ARTICLES = {"an", "the"}

# Spelled-out integers 0-20 plus the common round numbers, so "two" == "2" etc.
_NUMBER_WORDS = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
    "eleven": "11", "twelve": "12", "thirteen": "13", "fourteen": "14",
    "fifteen": "15", "sixteen": "16", "seventeen": "17", "eighteen": "18",
    "nineteen": "19", "twenty": "20",
}

_PUNCT_RE = re.compile(r"[^\w\s]", flags=re.UNICODE)
_WS_RE = re.compile(r"\s+", flags=re.UNICODE)


def normalize(text: str) -> str:
    """Return the canonical normalized form of a single answer string.

    Steps (in order): Unicode NFKC fold, lowercase, strip punctuation, collapse
    whitespace, drop leading/trailing articles, map spelled-out small numbers to
    digits. The result is a single space-joined token string.
    """
    if text is None:
        return ""
    if not isinstance(text, str):
        text = str(text)
    # Unicode normalize (e.g. fancy quotes, accents kept but composed) and casefold.
    text = unicodedata.normalize("NFKC", text)
    text = text.casefold()
    # Replace punctuation with spaces so "u.s.a." -> "u s a" -> tokens.
    text = _PUNCT_RE.sub(" ", text)
    text = _WS_RE.sub(" ", text).strip()
    if not text:
        return ""
    tokens = [_NUMBER_WORDS.get(tok, tok) for tok in text.split(" ")]
    # Strip *leading* articles (a/an/the) and *trailing* "the"/"an" only. We do NOT
    # strip a trailing "a", because a trailing single "a" is almost always meaningful —
    # the last letter of an acronym ("u s a"), a grade ("a"), an option label — not a
    # grammatical article. Interior articles are never stripped (subsequence matching
    # needs them to line up). Never strip away the entire answer.
    while len(tokens) > 1 and tokens[0] in _ARTICLES:
        tokens = tokens[1:]
    while len(tokens) > 1 and tokens[-1] in _TRAILING_ARTICLES:
        tokens = tokens[:-1]
    return " ".join(tokens)


def _tokens(text: str) -> list[str]:
    norm = normalize(text)
    return norm.split(" ") if norm else []


def _is_token_subsequence(needle: list[str], haystack: list[str]) -> bool:
    """True iff ``needle`` appears as a contiguous run of tokens within ``haystack``.

    Contiguous (not just ordered) so that gold "new york" matches "i live in new york"
    but not "new jersey ... york city". Empty needle never matches (guarded by caller).
    """
    n, h = len(needle), len(haystack)
    if n == 0 or n > h:
        return False
    for start in range(h - n + 1):
        if haystack[start:start + n] == needle:
            return True
    return False


def _string_match(pred: str, gold: str) -> bool:
    gold_tokens = _tokens(gold)
    pred_tokens = _tokens(pred)
    if not gold_tokens:
        # Gold is empty/None — treat any non-empty prediction as a mismatch and an
        # empty prediction as a (degenerate) match. Real GlassBench gold is never empty
        # for answerable items, so this is just a safety net.
        return len(pred_tokens) == 0
    if not pred_tokens:
        return False
    if pred_tokens == gold_tokens:
        return True
    # Allow gold to be found inside a more verbose prediction ("It's Seattle." -> gold
    # "Seattle"). Gold is the needle, so this can only ever rescue a correct answer.
    return _is_token_subsequence(gold_tokens, pred_tokens)


def _set_match(pred: str, gold_items: Iterable[str]) -> bool:
    pred_tokens = _tokens(pred)
    if not pred_tokens:
        return False
    saw_any = False
    for item in gold_items:
        saw_any = True
        item_tokens = _tokens(item)
        if not item_tokens:
            continue
        if not _is_token_subsequence(item_tokens, pred_tokens):
            return False
    return saw_any  # empty gold set -> not a meaningful match


def is_correct(pred: Union[str, None], gold: GoldType) -> bool:
    """Return whether ``pred`` is a correct answer for ``gold``.

    ``gold`` may be a string (string match) or a list/tuple/set of strings (set match,
    all required). ``pred`` of ``None`` / empty never matches a non-empty gold.
    """
    if isinstance(gold, (list, tuple, set)):
        if pred is None:
            return False
        return _set_match(pred, gold)
    return _string_match("" if pred is None else pred, gold if gold is not None else "")
