# bm25_retrieval — sparse-retrieval baseline (the "RAG floor")

For each item it builds a small Okapi BM25 index over the **user-turn sentences** of
that item's history, retrieves the single best-matching sentence for the query, and
returns that sentence verbatim as its answer.

- **System name:** bm25_retrieval
- **Type:** retrieval baseline
- **Memory backend:** per-item BM25 (k1 = 1.5, b = 0.75) over the item's user sentences;
  ties broken toward the earliest sentence.
- **Routing:** no abstention logic. It abstains only when nothing in the history shares
  a single token with the query; otherwise it always returns its best hit.
- **Confidence source:** a fixed squashing of the BM25 match score,
  `1 - exp(-score / 6.0)` — a retrieval score, not a calibrated probability. The scale is
  fixed in the script and was not tuned against the labels.

**Why it is on the board:** it shows what pure lexical matching with a score-derived
confidence gets you. Because it never decides a query is unanswerable, it answers the
`contradiction` and `false_premise` items too, and whenever the best lexical hit is a
strong one it is confidently wrong. Its confidence is only as calibrated as "did the
query share rare words with some sentence".

## Reproducibility

- Data version scored against: `glassbench_v0.1`
- Produced by: `python baselines/bm25_retrieval.py` (deterministic; no LLM, no API key,
  no RNG — two runs are byte-identical).
- Reads only `id`, `history` and `query` — valid under `CONTRIBUTING.md`.
