# verbalized_confidence_llm — CONSTRUCTED REFERENCE (not a model run)

> **This is not a real model run.** Its confidences are *split-keyed*: every answerable
> item is ~0.8–0.92, every stale item ~0.55–0.62, every contradiction item exactly 0.30,
> and it abstains on exactly the false-premise items — i.e. its routing and confidence
> bands track the gold split label, which no real verbalized-confidence LLM would do.
> It is therefore a **constructed reference** illustrating "well-separated verbalized
> confidence," **excluded from the headline ranking** and shown as `reference
> (constructed)`. Because its confidence is keyed to the labels it would be **rejected**
> as a real submission under `CONTRIBUTING.md`.

- **System name:** verbalized_confidence_llm (constructed reference)
- **Type:** synthetic / constructed (confidence keyed to split label)
- **What it illustrates:** the ceiling for "verbalized confidence" when answer/abstain
  routing and confidence separation are near-perfect.
- **Why it is not ranked:** it is not produced by running a model on the data; it encodes
  the labels. For a genuine, imperfect answering/abstaining agent that reads no labels,
  see `submissions/agent_llm/` (the ranked baseline).
