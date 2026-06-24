import type { SplitCounts } from '../../lib/types'

const CARDS = [
  { key: 'answerable', name: 'answerable', def: 'fact is determinable from history', act: 'ANSWER · high conf', gold: 'a string', group: 'answer' },
  { key: 'stale', name: 'stale', def: 'a fact stated long ago that may have drifted; query targets the old value', act: 'ANSWER · conf reflects age', gold: 'the old string', group: 'answer' },
  { key: 'contradiction', name: 'contradiction', def: 'a fact was asserted then retracted with no replacement', act: 'ABSTAIN', gold: 'ABSTAIN', group: 'abstain' },
  { key: 'false_premise', name: 'false-premise', def: 'query asks about something never stated', act: 'ABSTAIN', gold: 'ABSTAIN', group: 'abstain' },
] as const

export function SplitMatrix({ counts }: { counts: SplitCounts }) {
  const answerTotal = counts.answerable + counts.stale
  const abstainTotal = counts.contradiction + counts.false_premise
  return (
    <section className="splits glass-panel">
      <div className="sp-eye mono">THE TASK · FOUR WAYS TO BE TESTED</div>
      <h2 className="sp-title">An honest system answers two splits and stays silent on the other two</h2>
      <p className="sp-lede">The hard part is knowing which is which.</p>

      <div className="sp-grid">
        {CARDS.map((c) => (
          <div key={c.key} className={`sp-card ${c.group}`}>
            <div className="sp-top">
              <span className="sp-name mono">{c.name}</span>
              <span className="sp-count mono">{counts[c.key]}</span>
            </div>
            <p className="sp-def">{c.def}</p>
            <div className="sp-foot">
              <span className={`sp-chip chip-${c.group}`}>{c.act}</span>
              <span className="sp-gold mono">
                gold: <code>{c.gold}</code>
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="sp-totals mono">
        <span className="answer">ANSWERABLE GROUP — {answerTotal} items</span>
        <span className="abstain">UNANSWERABLE GROUP — {abstainTotal} items · these should abstain</span>
      </div>

      <style>{`
        .splits { padding: clamp(1.6rem, 4vw, 2.6rem); margin-top: 1.2rem; }
        .sp-eye { color: var(--cyan); font-size: 0.74rem; letter-spacing: 0.1em; }
        .sp-title { margin: 0.4rem 0 0.4rem; font-size: clamp(1.5rem, 4vw, 2.1rem); max-width: 24ch; }
        .sp-lede { color: var(--muted); margin: 0 0 1.6rem; }
        .sp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 1rem; }
        .sp-card {
          padding: 1.1rem 1.2rem; border-radius: 14px; border: 1px solid var(--border);
          background: var(--glass-bg-2);
        }
        .sp-card.answer { border-left: 3px solid var(--cyan); }
        .sp-card.abstain { border-left: 3px solid var(--warn); }
        .sp-top { display: flex; justify-content: space-between; align-items: baseline; }
        .sp-name { color: var(--ink); font-weight: 600; }
        .sp-count { color: var(--cyan); font-size: 1.4rem; font-weight: 700; }
        .sp-def { color: var(--muted); font-size: 0.84rem; line-height: 1.45; margin: 0.5rem 0 0.9rem; min-height: 3.2em; }
        .sp-foot { display: flex; flex-direction: column; gap: 0.4rem; }
        .sp-chip {
          align-self: flex-start; font-size: 0.68rem; letter-spacing: 0.04em; padding: 0.2rem 0.5rem;
          border-radius: 6px; font-family: var(--mono);
        }
        .chip-answer { background: var(--tint-good); color: var(--good); }
        .chip-abstain { background: var(--tint-warn); color: var(--warn); }
        .sp-gold { font-size: 0.74rem; color: var(--faint); }
        .sp-gold code { color: var(--ink); }
        .sp-totals { display: flex; flex-wrap: wrap; gap: 0.6rem 2rem; margin-top: 1.4rem; font-size: 0.78rem; }
        .sp-totals .answer { color: var(--cyan); }
        .sp-totals .abstain { color: var(--warn); }
      `}</style>
    </section>
  )
}
