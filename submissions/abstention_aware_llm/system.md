# abstention_aware_llm — CONSTRUCTED ORACLE REFERENCE (not a model run)

> **This is not a real system submission.** It is a synthetic *upper-bound* reference,
> constructed with knowledge of the gold labels: it routes every answerable item to a
> correct answer and abstains on every unanswerable item, with hand-set confidences.
> It exists only to show the ceiling the Glass Score approaches when answer/abstain
> routing is perfect. **It is excluded from the headline leaderboard ranking** and is
> shown separately as `reference (oracle)`. No claim is made that any deployed LLM
> achieves this; treat its number as the top of the scale, not a competitor.

- **System name:** abstention_aware_llm (oracle reference)
- **Type:** synthetic / oracle (constructed from gold labels)
- **Routing:** perfect — answers iff the item is answerable, abstains iff unanswerable.
- **Confidence:** hand-set, only ~15 distinct values (a tell that it is not a model run).
- **Why it is here:** to anchor the top of the Glass Score scale and to make explicit,
  by contrast, how far real baselines and submissions sit below a perfect router.

Because it is built from the labels, it would be **rejected** as a real submission under
`CONTRIBUTING.md` ("reads `gold_answer` ... at inference time"). It is retained only as a
clearly-labeled reference, never as evidence the benchmark is "winnable" by a real system.
For a genuine (imperfect) LLM reference produced without seeing the gold, see
`submissions/agent_llm/`.
