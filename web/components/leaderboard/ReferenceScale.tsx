import type { Metric, ReferenceRow } from '../../lib/types'

interface Props {
  references: ReferenceRow[]
  metrics: Metric[]
  ranges: Record<string, [number, number]>
}

/** Excluded reference systems (a gold-label oracle, a constructed upper bound).
 *  Shown OUTSIDE the ranking to mark the top of the scale — never as competitors. */
export function ReferenceScale({ references }: Props) {
  if (!references?.length) return null
  return (
    <section className="ref-scale" aria-label="Reference scale (not ranked)">
      <div className="ref-head">
        <span className="ref-eye mono">REFERENCE SCALE · NOT RANKED</span>
        <p className="ref-sub">
          Constructed upper bounds — they read the gold labels, so they’d be rejected as real submissions. Shown
          only to mark where the ceiling is.
        </p>
      </div>
      <div className="ref-grid">
        {references.map((r) => (
          <div key={r.system} className="ref-card glass-panel">
            <div className="ref-card-top">
              <span className="ref-name mono">{r.system}</span>
              <span className="ref-glass mono">
                {typeof r.glass_score === 'number' ? r.glass_score.toFixed(2) : '—'}
              </span>
            </div>
            <div className="ref-metrics mono">
              <span>
                CWR <b>{typeof r.cwr === 'number' ? r.cwr.toFixed(3) : '—'}</b>
              </span>
            </div>
            <p className="ref-what">{r.what_it_is}</p>
            <p className="ref-why">{r.excluded_reason}</p>
          </div>
        ))}
      </div>

      <style>{`
        .ref-scale { margin: 2.6rem 0.4rem 1rem; }
        .ref-head { max-width: 60ch; margin-bottom: 1rem; }
        .ref-eye { color: var(--warn); font-size: 0.74rem; letter-spacing: 0.1em; }
        .ref-sub { color: var(--muted); font-size: 0.9rem; line-height: 1.5; margin: 0.4rem 0 0; }
        .ref-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
        .ref-card { padding: 1.1rem 1.2rem; border-style: dashed; }
        .ref-card-top { display: flex; justify-content: space-between; align-items: baseline; }
        .ref-name { color: var(--ink); font-weight: 600; }
        .ref-glass { color: var(--warn); font-size: 1.25rem; font-weight: 700; }
        .ref-metrics { color: var(--faint); font-size: 0.8rem; margin-top: 0.2rem; }
        .ref-metrics b { color: var(--muted); }
        .ref-what { color: var(--muted); font-size: 0.86rem; line-height: 1.45; margin: 0.7rem 0 0.4rem; }
        .ref-why { color: var(--faint); font-size: 0.8rem; line-height: 1.45; margin: 0; font-style: italic; }
      `}</style>
    </section>
  )
}
