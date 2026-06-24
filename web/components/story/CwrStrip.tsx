interface Sys {
  system: string
  cwr: number
}

/** Plots every ranked system on a 0.000 → 0.700 axis by Confidently-Wrong Rate.
 *  Lower is better (left). The axis most systems have never measured. */
export function CwrStrip({ systems, max = 0.7 }: { systems: Sys[]; max?: number }) {
  const sorted = [...systems].sort((a, b) => a.cwr - b.cwr)
  return (
    <section className="cwr glass-panel">
      <div className="cwr-eye mono">THE AXIS NOBODY REPORTS</div>
      <h2 className="cwr-title">Confidently-Wrong Rate, every system</h2>
      <div className="cwr-axis">
        <span className="cwr-end better">BETTER</span>
        <div className="cwr-track">
          {sorted.map((s, i) => {
            const left = Math.min(100, Math.max(0, (s.cwr / max) * 100))
            const good = s.cwr <= 0.2
            const mid = s.cwr > 0.2 && s.cwr < 0.45
            return (
              <div
                key={s.system}
                className={`cwr-tick ${good ? 'good' : mid ? 'warn' : 'bad'} ${i % 2 ? 'below' : 'above'}`}
                style={{ left: `${left}%` }}
              >
                <span className="cwr-dot" />
                <span className="cwr-lab">
                  <b className="mono">{s.system}</b>
                  <span className="cwr-val mono">{s.cwr.toFixed(3)}</span>
                </span>
              </div>
            )
          })}
        </div>
        <span className="cwr-end worse">WORSE</span>
      </div>
      <p className="cwr-cap">
        Plotted 0.000 (left) to {max.toFixed(3)} (right). Lower is better. Most memory systems have never measured
        this axis.
      </p>

      <style>{`
        .cwr { padding: clamp(1.6rem, 4vw, 2.6rem); margin-top: 1.2rem; }
        .cwr-eye { color: var(--cyan); font-size: 0.74rem; letter-spacing: 0.1em; }
        .cwr-title { margin: 0.4rem 0 2rem; font-size: clamp(1.5rem, 4vw, 2.1rem); }
        .cwr-axis { display: flex; align-items: center; gap: 0.8rem; }
        .cwr-end { font-size: 0.66rem; letter-spacing: 0.08em; color: var(--faint); white-space: nowrap; }
        .cwr-track {
          position: relative; flex: 1; height: 2px; background: var(--border);
          margin: 5.5rem 0;
        }
        .cwr-tick { position: absolute; top: 0; transform: translateX(-50%); }
        .cwr-dot { display: block; width: 11px; height: 11px; border-radius: 50%; margin: -4.5px auto 0; }
        .cwr-tick.good .cwr-dot { background: var(--good); box-shadow: 0 0 12px var(--good); }
        .cwr-tick.warn .cwr-dot { background: var(--warn); box-shadow: 0 0 12px var(--warn); }
        .cwr-tick.bad .cwr-dot { background: var(--danger); box-shadow: 0 0 12px var(--danger); }
        .cwr-lab {
          position: absolute; left: 50%; transform: translateX(-50%);
          display: flex; flex-direction: column; align-items: center; gap: 0.1rem; white-space: nowrap;
        }
        .cwr-tick.above .cwr-lab { bottom: 1rem; }
        .cwr-tick.below .cwr-lab { top: 1rem; }
        .cwr-lab b { font-size: 0.74rem; color: var(--ink); }
        .cwr-val { font-size: 0.7rem; color: var(--muted); }
        .cwr-cap { color: var(--faint); font-size: 0.86rem; line-height: 1.5; margin: 0; max-width: 60ch; }
      `}</style>
    </section>
  )
}
