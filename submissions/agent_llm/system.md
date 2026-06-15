# agent_llm — genuine (imperfect) abstention-aware memory agent

A real, reproducible abstention-aware baseline that reads **only** each item's
`history` and `query` (never `gold_answer`, never the `split` label). It is the honest
counterpart to the constructed `abstention_aware_llm` oracle: same intent (answer when
the fact is determinable, abstain when it was retracted or never stated), but with
ordinary lexical logic and therefore realistic, imperfect routing and confidence.

- **System name:** agent_llm
- **Type:** agentic memory baseline (deterministic heuristic agent; no LLM API, no key)
- **Memory backend:** the item's own multi-session user turns, read in order.
- **Routing:**
  - Abstains when an explicit retraction cue ("scratch what I said", "correction:",
    "disregard", "ignore what I said", "forget the …") overlaps the query topic.
  - Otherwise extracts the queried fact by last-write-wins content-word overlap.
  - Abstains when no sentence plausibly contains the queried target (treats it as an
    unsupported / false-premise query).
- **Confidence source:** a fixed, *not* label-tuned function of lexical overlap strength
  and evidence recency, capped below 1.0.

**Known, deliberate limitations** (this is why it is a fair reference, not an oracle):
- catches only *explicit* retraction cues — misses implicit/soft contradictions
  (e.g. "I sold both of those"), so its contradiction abstention recall is below 1.0;
- is sometimes fooled by a sibling fact that lexically overlaps the query, so it answers
  some false-premise items it should abstain on;
- returns a whole evidence sentence rather than the exact short answer, so the
  conservative string matcher does not always credit a substantively-correct answer
  (its answerable accuracy is well under 1.0 for this reason);
- its verbalized confidence is only roughly calibrated.

## Reproducibility

- Data version scored against: `glassbench_v0.1`
- Produced by: `python baselines/agent_llm.py` (deterministic; no seeds, no API key).
- Reads no label fields — valid under `CONTRIBUTING.md`.
