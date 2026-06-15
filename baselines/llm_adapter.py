#!/usr/bin/env python3
"""llm_adapter — turn any chat-LLM into a GlassBench system.

This is a REAL, runnable adapter (not a constructed reference). For each item in
``data/glassbench_v0.1.jsonl`` it:

  1. reads ONLY that item's ``history`` (the multi-session conversation) and ``query``
     — never ``gold_answer``, ``evidence_spans``, ``answer_topic``, or ``split`` (the
     label fields), so it is a valid submission under ``CONTRIBUTING.md``;
  2. builds a chat prompt that hands the model the conversation transcript and the
     question, and asks it to either answer with a calibrated confidence in [0,1] or
     abstain (when the answer was retracted/updated, was never stated, or the question
     rests on a false premise);
  3. parses the model's JSON reply into the frozen submission contract shape; and
  4. writes ``submissions/<name>/predictions.json`` plus a ``system.md`` stub.

Providers are pluggable and selected from the environment:

  * ``ANTHROPIC_API_KEY``  -> Anthropic provider (default model ``claude-sonnet-4-0``;
                              override with ``--model`` or ``ANTHROPIC_MODEL``)
  * ``OPENAI_API_KEY``     -> OpenAI provider   (default model ``gpt-4o-mini``;
                              override with ``--model`` or ``OPENAI_MODEL``)

If neither key is set, the script prints a clear message and exits **without writing
anything** — it never fabricates predictions. (The cached ``agent_llm`` and
``verbalized_confidence_llm`` submissions are deterministic and need no key; see
``baselines/README.md``.)

Nothing here references any private system, product, or brand. It only reads the public
data and writes the public submission format from ``PRE_REGISTRATION.md``:

    {"id", "answer", "confidence" in [0,1]}   OR   {"id", "abstain": true}

Usage
-----
    # auto-detect provider from whichever API key is set:
    python baselines/llm_adapter.py --name my-llm

    # force a provider / model / item cap (smoke test):
    python baselines/llm_adapter.py --provider anthropic --model claude-sonnet-4-0 \
        --name claude-sonnet-4 --limit 5

    # then score it (same scorer as everyone):
    python -m glassbench.score --predictions submissions/my-llm/predictions.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from typing import List, Optional

from _common import load_items, write_predictions

# How much of each (already short) conversation transcript to keep, in characters.
# GlassBench histories are small; this cap is a guardrail against a pathological item,
# not a tuned hyperparameter. It only truncates the OLDEST turns if exceeded.
DEFAULT_MAX_HISTORY_CHARS = 24000


# --------------------------------------------------------------------------- #
# Prompt construction (reads only history + query; never any label field)
# --------------------------------------------------------------------------- #

SYSTEM_PROMPT = (
    "You are a careful long-term-memory assistant. You are given the full transcript of "
    "a user's past conversations with an assistant, followed by a new question from the "
    "user. Answer the question using ONLY facts stated by the user in the transcript.\n"
    "\n"
    "Crucial rules:\n"
    "- If the user later corrected, retracted, or updated a fact, use the most recent "
    "version. If the most recent state means the question can no longer be answered "
    "(the thing was sold/cancelled/undone, or the user took back the claim), ABSTAIN.\n"
    "- If the question assumes something the user never actually said (a false premise), "
    "ABSTAIN. Do not guess.\n"
    "- If the transcript genuinely does not contain the answer, ABSTAIN.\n"
    "- Only answer when you can point to a specific user statement that still holds.\n"
    "- Give your honest calibrated probability that your answer is exactly correct as "
    "'confidence' (0.0-1.0). Be well-calibrated: use lower confidence when the evidence "
    "is weak, ambiguous, or old. Do not inflate confidence.\n"
    "\n"
    "Reply with ONE JSON object and nothing else, in one of these two shapes:\n"
    '  {"abstain": true}\n'
    '  {"answer": "<short answer>", "confidence": <float 0..1>}\n'
)


def _role_label(role: str) -> str:
    role = (role or "").lower()
    if role == "user":
        return "User"
    if role == "assistant":
        return "Assistant"
    return role.capitalize() or "Turn"


def build_transcript(item: dict, max_chars: int = DEFAULT_MAX_HISTORY_CHARS) -> str:
    """Render an item's ``history`` into a plain-text transcript.

    Includes both user and assistant turns (that is what a real chat-LLM memory system
    sees), grouped by session with the session date as a header. Reads NOTHING outside
    ``history`` — no ``gold_answer``/``evidence_spans``/``answer_topic``/``split``.

    If the transcript exceeds ``max_chars``, the OLDEST sessions are dropped first so the
    most recent (and most decision-relevant, e.g. retractions appended last) survive.
    """
    sessions = item.get("history", []) or []
    blocks: List[str] = []
    for sess in sessions:
        date = sess.get("date", "")
        header = f"=== Session ({date}) ===" if date else "=== Session ==="
        lines = [header]
        for turn in sess.get("turns", []):
            content = (turn.get("content") or "").strip()
            if not content:
                continue
            lines.append(f"{_role_label(turn.get('role'))}: {content}")
        if len(lines) > 1:
            blocks.append("\n".join(lines))

    transcript = "\n\n".join(blocks)
    if len(transcript) > max_chars:
        # Keep the most recent characters (tail); prepend a marker so the model knows.
        transcript = "[...earlier sessions truncated...]\n\n" + transcript[-max_chars:]
    return transcript


def build_user_message(item: dict, max_chars: int = DEFAULT_MAX_HISTORY_CHARS) -> str:
    transcript = build_transcript(item, max_chars=max_chars)
    query = (item.get("query") or "").strip()
    return (
        "Here is the transcript of the user's past conversations:\n\n"
        f"{transcript}\n\n"
        "----\n"
        f"New question from the user: {query}\n\n"
        "Respond with exactly one JSON object as instructed."
    )


# --------------------------------------------------------------------------- #
# Response parsing -> frozen submission contract
# --------------------------------------------------------------------------- #

_JSON_OBJ_RE = re.compile(r"\{.*\}", re.DOTALL)


def parse_response(item_id: str, text: str) -> dict:
    """Parse a model reply into a valid prediction dict.

    Returns either ``{"id", "abstain": True}`` or
    ``{"id", "answer": str, "confidence": float in [0,1]}``.

    Robust to models that wrap JSON in prose or code fences. If nothing parseable is
    found, or the model produced no usable answer, we ABSTAIN — the conservative,
    contract-safe default (never fabricates a confident wrong answer).
    """
    obj = _extract_json_obj(text)
    if obj is None:
        return {"id": item_id, "abstain": True}

    # Explicit abstain.
    if obj.get("abstain") is True:
        return {"id": item_id, "abstain": True}

    answer = obj.get("answer", None)
    if answer is None or (isinstance(answer, str) and not answer.strip()):
        # No answer field (or empty) -> treat as abstain.
        return {"id": item_id, "abstain": True}

    # Coerce a sensible string answer.
    if not isinstance(answer, str):
        answer = json.dumps(answer, ensure_ascii=False)
    answer = answer.strip()

    conf = obj.get("confidence", None)
    try:
        conf = float(conf)
    except (TypeError, ValueError):
        # Answer given but no usable confidence: default to a neutral 0.5 rather than
        # silently claiming certainty. (The scorer would clamp/penalize either way.)
        conf = 0.5
    conf = min(1.0, max(0.0, conf))
    return {"id": item_id, "answer": answer, "confidence": conf}


def _extract_json_obj(text: str) -> Optional[dict]:
    if not text:
        return None
    text = text.strip()
    # Strip a leading/trailing code fence if present.
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z0-9]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text).strip()
    # Fast path: whole thing is JSON.
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError:
        pass
    # Fallback: first {...} blob in the text.
    m = _JSON_OBJ_RE.search(text)
    if m:
        try:
            obj = json.loads(m.group(0))
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            return None
    return None


# --------------------------------------------------------------------------- #
# Provider interface
# --------------------------------------------------------------------------- #


class Provider:
    """Minimal chat interface: ``complete(system, user) -> str`` (the reply text)."""

    name = "base"
    model = ""

    def complete(self, system: str, user: str) -> str:  # pragma: no cover - abstract
        raise NotImplementedError


class AnthropicProvider(Provider):
    """Anthropic Messages API. Reads ``ANTHROPIC_API_KEY`` from the environment.

    Model defaults to ``claude-sonnet-4-0`` and is overridable via ``--model`` or
    ``ANTHROPIC_MODEL`` (so a stale default never blocks you — pass any current model id).
    """

    name = "anthropic"
    DEFAULT_MODEL = "claude-sonnet-4-0"

    def __init__(self, model: Optional[str] = None, max_tokens: int = 512):
        try:
            import anthropic  # noqa: F401
        except ImportError as exc:  # pragma: no cover - depends on install
            raise SystemExit(
                "The 'anthropic' package is not installed. Install it into the "
                "interpreter you are running, e.g.:\n"
                "    pip install anthropic\n"
                f"(import error: {exc})"
            )
        import anthropic

        self._anthropic = anthropic
        self.client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env
        self.model = model or os.environ.get("ANTHROPIC_MODEL") or self.DEFAULT_MODEL
        self.max_tokens = max_tokens

    def complete(self, system: str, user: str) -> str:
        msg = self.client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        # Concatenate any text blocks in the reply.
        parts = []
        for block in msg.content:
            text = getattr(block, "text", None)
            if text:
                parts.append(text)
        return "".join(parts)


class OpenAIProvider(Provider):
    """OpenAI Chat Completions API. Reads ``OPENAI_API_KEY`` from the environment.

    Model defaults to ``gpt-4o-mini`` and is overridable via ``--model`` or
    ``OPENAI_MODEL``.
    """

    name = "openai"
    DEFAULT_MODEL = "gpt-4o-mini"

    def __init__(self, model: Optional[str] = None, max_tokens: int = 512):
        try:
            import openai  # noqa: F401
        except ImportError as exc:  # pragma: no cover - depends on install
            raise SystemExit(
                "The 'openai' package is not installed. Install it into the "
                "interpreter you are running, e.g.:\n"
                "    pip install openai\n"
                f"(import error: {exc})"
            )
        import openai

        self._openai = openai
        self.client = openai.OpenAI()  # reads OPENAI_API_KEY from env
        self.model = model or os.environ.get("OPENAI_MODEL") or self.DEFAULT_MODEL
        self.max_tokens = max_tokens

    def complete(self, system: str, user: str) -> str:
        resp = self.client.chat.completions.create(
            model=self.model,
            max_tokens=self.max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        return resp.choices[0].message.content or ""


def select_provider(
    provider: Optional[str], model: Optional[str], max_tokens: int
) -> Provider:
    """Pick a provider explicitly or auto-detect from whichever API key is set.

    Exits cleanly (without writing anything) if no usable key is present.
    """
    has_anthropic = bool(os.environ.get("ANTHROPIC_API_KEY"))
    has_openai = bool(os.environ.get("OPENAI_API_KEY"))

    if provider is None:
        if has_anthropic:
            provider = "anthropic"
        elif has_openai:
            provider = "openai"
        else:
            _exit_no_key()

    provider = provider.lower()
    if provider == "anthropic":
        if not has_anthropic:
            _exit_no_key("anthropic", "ANTHROPIC_API_KEY")
        return AnthropicProvider(model=model, max_tokens=max_tokens)
    if provider == "openai":
        if not has_openai:
            _exit_no_key("openai", "OPENAI_API_KEY")
        return OpenAIProvider(model=model, max_tokens=max_tokens)
    raise SystemExit(f"unknown provider {provider!r} (expected 'anthropic' or 'openai')")


def _exit_no_key(provider: Optional[str] = None, env_var: Optional[str] = None) -> None:
    if provider and env_var:
        msg = (
            f"No API key for provider '{provider}': environment variable "
            f"{env_var} is not set.\n"
        )
    else:
        msg = (
            "No LLM API key found. Set ONE of these and re-run:\n"
            "    export ANTHROPIC_API_KEY=...   # Anthropic (default model "
            "claude-sonnet-4-0)\n"
            "    export OPENAI_API_KEY=...      # OpenAI (default model gpt-4o-mini)\n"
        )
    msg += (
        "\nThis adapter will not fabricate predictions without a key. To reproduce the "
        "cached, key-free baselines instead, see baselines/README.md "
        "(e.g. `python baselines/agent_llm.py`).\n"
    )
    print(msg, file=sys.stderr)
    raise SystemExit(2)


# --------------------------------------------------------------------------- #
# Run loop
# --------------------------------------------------------------------------- #


def run(
    provider: Provider,
    items: List[dict],
    max_history_chars: int,
    retries: int,
    verbose: bool,
) -> List[dict]:
    preds: List[dict] = []
    total = len(items)
    for i, item in enumerate(items, 1):
        item_id = item["id"]
        system = SYSTEM_PROMPT
        user = build_user_message(item, max_chars=max_history_chars)

        text = ""
        last_err: Optional[Exception] = None
        for attempt in range(retries + 1):
            try:
                text = provider.complete(system, user)
                last_err = None
                break
            except Exception as exc:  # network / rate-limit / transient API errors
                last_err = exc
                if attempt < retries:
                    backoff = 2.0 * (attempt + 1)
                    if verbose:
                        print(
                            f"  [{i}/{total}] {item_id}: error ({exc}); "
                            f"retry in {backoff:.0f}s",
                            file=sys.stderr,
                        )
                    time.sleep(backoff)

        if last_err is not None:
            # Could not get a reply after retries: abstain (contract-safe) and warn.
            print(
                f"  [{i}/{total}] {item_id}: giving up after {retries} retries "
                f"({last_err}); recording ABSTAIN.",
                file=sys.stderr,
            )
            preds.append({"id": item_id, "abstain": True})
            continue

        pred = parse_response(item_id, text)
        preds.append(pred)
        if verbose:
            if pred.get("abstain"):
                shown = "ABSTAIN"
            else:
                shown = f"answer (conf={pred['confidence']:.2f})"
            print(f"  [{i}/{total}] {item_id}: {shown}")
    return preds


def write_system_md(name: str, provider: Provider, n_items: int) -> str:
    out_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "submissions", name
    )
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "system.md")
    content = f"""# {name} — chat-LLM via baselines/llm_adapter.py

A real model run produced by the generic GlassBench LLM adapter. For each item the
adapter sends the model ONLY that item's conversation `history` and `query` (never any
label field), asks for an answer + calibrated confidence or an abstention, and parses
the JSON reply into the submission contract.

- **System name:** {name}
- **Type:** chat-LLM (zero-shot, single call per item; no retrieval, no tools)
- **Provider:** {provider.name}
- **Model:** `{provider.model}`
- **Memory backend:** the item's own multi-session transcript, passed in-context.
- **Confidence source:** the model's self-reported `confidence` field (verbalized,
  clamped to [0,1]); items with no parseable answer are recorded as abstentions.
- **Reads no label fields** (`gold_answer`/`evidence_spans`/`answer_topic`/`split`) —
  valid under `CONTRIBUTING.md`.

## Reproducibility

- Data version: `glassbench_v0.1` ({n_items} items scored).
- Produced by: `python baselines/llm_adapter.py --provider {provider.name} --model {provider.model} --name {name}`
- Decoding: provider defaults (no seed pinned). LLM outputs are not byte-deterministic;
  re-running may shift a few predictions. Note the model id above for the record.
"""
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)
    return path


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python baselines/llm_adapter.py",
        description="Run any chat-LLM as a GlassBench system (Anthropic or OpenAI).",
    )
    parser.add_argument(
        "--name",
        default=None,
        help="submission folder name (submissions/<name>/). "
        "Default: '<provider>-<model>' slugified.",
    )
    parser.add_argument(
        "--provider",
        default=None,
        choices=["anthropic", "openai"],
        help="force a provider. Default: auto-detect from whichever API key is set.",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="model id (overrides ANTHROPIC_MODEL / OPENAI_MODEL and the built-in "
        "default; pass any current model id).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="only run the first N items (smoke test). Default: all.",
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=512,
        help="max output tokens per call (default 512).",
    )
    parser.add_argument(
        "--max-history-chars",
        type=int,
        default=DEFAULT_MAX_HISTORY_CHARS,
        help=f"truncate transcripts longer than this (default {DEFAULT_MAX_HISTORY_CHARS}).",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=3,
        help="retries per item on transient API errors (default 3).",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="suppress per-item progress lines.",
    )
    args = parser.parse_args(argv)

    provider = select_provider(args.provider, args.model, args.max_tokens)

    name = args.name or _slug(f"{provider.name}-{provider.model}")

    items = load_items()
    if args.limit is not None:
        items = items[: args.limit]

    print(
        f"[llm_adapter] provider={provider.name} model={provider.model} "
        f"name={name} items={len(items)}",
        file=sys.stderr,
    )

    preds = run(
        provider,
        items,
        max_history_chars=args.max_history_chars,
        retries=args.retries,
        verbose=not args.quiet,
    )

    out_path = write_predictions(name, preds)
    md_path = write_system_md(name, provider, len(preds))
    answered = sum(1 for p in preds if "answer" in p)
    abstained = sum(1 for p in preds if p.get("abstain") is True)
    print(
        f"[llm_adapter] wrote {len(preds)} predictions "
        f"({answered} answered, {abstained} abstain) -> {out_path}"
    )
    print(f"[llm_adapter] wrote {md_path}")
    print(
        "[llm_adapter] score it with:\n"
        f"    python -m glassbench.score --predictions {out_path}"
    )
    return 0


def _slug(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or "llm"


if __name__ == "__main__":
    raise SystemExit(main())
