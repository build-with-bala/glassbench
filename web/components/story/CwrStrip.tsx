'use client'

import { boardStore } from '../world/store'
import { useHomeBoard } from './HomeBoard'

interface Sys {
  system: string
  cwr: number
}

/** Plots every ranked system on a 0.000 → 0.700 axis by Confidently-Wrong Rate.
 *  Lower is better (left). Each mark is a button: point at one and the board beside
 *  the story shows that system's confidently-wrong items burning; press it to keep
 *  that system on the board. */
export function CwrStrip({ systems, max = 0.7 }: { systems: Sys[]; max?: number }) {
  const { system: current, setSystem } = useHomeBoard()
  const sorted = [...systems].sort((a, b) => a.cwr - b.cwr)
  return (
    <section className="cwr glass-panel">
      <div className="cwr-eye mono">THE AXIS NOBODY REPORTS</div>
      <h2 className="cwr-title">Confidently-Wrong Rate, every system</h2>
      <div className="cwr-axis">
        <span className="cwr-end better">BETTER</span>
        <div className="cwr-track" role="group" aria-label="Systems by Confidently-Wrong Rate. Choose one to show it on the board.">
          {sorted.map((s, i) => {
            const left = Math.min(100, Math.max(0, (s.cwr / max) * 100))
            const good = s.cwr <= 0.2
            const mid = s.cwr > 0.2 && s.cwr < 0.45
            return (
              <button
                key={s.system}
                type="button"
                className={`cwr-tick ${good ? 'good' : mid ? 'warn' : 'bad'} ${i % 2 ? 'below' : 'above'}`}
                style={{ left: `${left}%` }}
                aria-pressed={s.system === current}
                aria-label={`${s.system}, confidently-wrong rate ${s.cwr.toFixed(3)}. Show on the board.`}
                onClick={() => setSystem(s.system)}
                onPointerEnter={(e) => {
                  if (e.pointerType === 'mouse') boardStore.setPreview({ system: s.system })
                }}
                onPointerLeave={() => boardStore.setPreview(null)}
                onFocus={() => boardStore.setPreview({ system: s.system })}
                onBlur={() => boardStore.setPreview(null)}
              >
                <span className="cwr-dot" />
                <span className="cwr-lab">
                  <b className="mono">{s.system}</b>
                  <span className="cwr-val mono">{s.cwr.toFixed(3)}</span>
                </span>
              </button>
            )
          })}
        </div>
        <span className="cwr-end worse">WORSE</span>
      </div>
      <p className="cwr-cap">
        Plotted 0.000 (left) to {max.toFixed(3)} (right). Lower is better. Most memory systems have never measured
        this axis. On the board, the cells left burning are exactly the items each system got confidently wrong —
        point at a system to see its own.
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
        .cwr-tick {
          position: absolute; top: 0; transform: translateX(-50%);
          width: 28px; height: 28px; margin-top: -13px; padding: 0;
          display: grid; place-items: center;
          border: 0; border-radius: 50%; background: transparent; color: inherit; font: inherit; cursor: pointer;
        }
        .cwr-dot {
          display: block; width: 11px; height: 11px; border-radius: 50%;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .cwr-tick:hover .cwr-dot, .cwr-tick[aria-pressed='true'] .cwr-dot { transform: scale(1.45); }
        .cwr-tick[aria-pressed='true'] { box-shadow: inset 0 0 0 1.5px var(--ink); }
        .cwr-tick.good .cwr-dot { background: var(--good); box-shadow: 0 0 12px var(--good); }
        .cwr-tick.warn .cwr-dot { background: var(--warn); box-shadow: 0 0 12px var(--warn); }
        .cwr-tick.bad .cwr-dot { background: var(--danger); box-shadow: 0 0 12px var(--danger); }
        .cwr-lab {
          position: absolute; left: 50%; transform: translateX(-50%);
          display: flex; flex-direction: column; align-items: center; gap: 0.1rem; white-space: nowrap;
        }
        .cwr-tick.above .cwr-lab { bottom: 2rem; }
        .cwr-tick.below .cwr-lab { top: 2rem; }
        .cwr-lab b { font-size: 0.74rem; color: var(--ink); }
        .cwr-tick[aria-pressed='true'] .cwr-lab b { color: var(--cyan); }
        .cwr-val { font-size: 0.7rem; color: var(--muted); }
        .cwr-cap { color: var(--faint); font-size: 0.86rem; line-height: 1.5; margin: 0; max-width: 62ch; }
      `}</style>
    </section>
  )
}
