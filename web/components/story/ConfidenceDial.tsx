'use client'

import { useState } from 'react'
import { dialOutcome } from '../../lib/glass-score'

const PRESETS = [
  { label: 'ALWAYS ABSTAIN', value: 0.0 },
  { label: 'ALWAYS ANSWER', value: 1.0 },
  { label: 'FIXED-CONF FAKE', value: 0.69 },
]

export function ConfidenceDial() {
  const [conf, setConf] = useState(0.69)
  const outcome = dialOutcome(conf)
  // map 0..1 → -90deg .. +90deg
  const angle = -90 + conf * 180
  const rad = (angle * Math.PI) / 180
  const cx = 120
  const cy = 140
  const len = 78
  const nx = cx + Math.sin(rad) * len
  const ny = cy - Math.cos(rad) * len

  return (
    <section className="dial glass-panel">
      <div className="dial-eye mono">TRY TO GAME IT</div>
      <h2 className="dial-title">There is no single confidence that games both pillars</h2>
      <p className="dial-lede">
        Set the dial anywhere. The Glass Score will not move off <code>0.00</code> for any answer-everything
        strategy — the scorer applies a <b>single</b> answer/abstain decision. Below 0.5 zeroes the answer pillar;
        at or above 0.5 zeroes the safety pillar.
      </p>

      <div className="dial-rig">
        <div className="dial-left">
          <svg viewBox="0 0 240 160" role="img" aria-label={`Confidence dial at ${conf.toFixed(2)}`}>
            <path className="dial-arc" d="M30 140 A 90 90 0 0 1 210 140" fill="none" />
            <line className="dial-needle" x1={cx} y1={cy} x2={nx} y2={ny} />
            <circle className="dial-hub" cx={cx} cy={cy} r="6" />
          </svg>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={conf}
            aria-label="Stated confidence from 0 to 1"
            onChange={(e) => setConf(parseFloat(e.target.value))}
          />
          <output className="dial-out mono">{conf.toFixed(2)}</output>
          <div className="dial-presets">
            {PRESETS.map((p) => (
              <button key={p.label} type="button" className="preset" onClick={() => setConf(p.value)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="dial-right">
          <div className="dial-readout">
            <span className="dial-r-eye mono">GLASS SCORE</span>
            <span className="dial-r-num mono">{outcome.glass.toFixed(2)}</span>
          </div>
          <p className="dial-explain">{outcome.explain}</p>
          <div className="dial-detents mono">
            detents: <code>0.49</code> <code>0.60</code> <code>0.69</code> — all verified 0.00
          </div>
        </div>
      </div>
      <p className="dial-thesis">
        There is no single confidence that games both pillars. <b>Try.</b>
      </p>

      <style jsx>{`
        .dial {
          padding: clamp(1.6rem, 4vw, 2.6rem);
          margin-top: 1.2rem;
        }
        .dial-eye {
          color: var(--cyan);
          font-size: 0.74rem;
          letter-spacing: 0.1em;
        }
        .dial-title {
          margin: 0.4rem 0 0.4rem;
          font-size: clamp(1.5rem, 4vw, 2.1rem);
          max-width: 22ch;
        }
        .dial-lede {
          color: var(--muted);
          max-width: 60ch;
          line-height: 1.55;
          margin: 0 0 1.8rem;
        }
        .dial-lede code,
        .dial-lede b {
          color: var(--ink);
        }
        .dial-rig {
          display: flex;
          flex-wrap: wrap;
          gap: 2rem;
          align-items: center;
        }
        .dial-left {
          flex: 1;
          min-width: 260px;
        }
        svg {
          width: 100%;
          max-width: 300px;
          display: block;
        }
        .dial-arc {
          stroke: var(--border);
          stroke-width: 10;
          stroke-linecap: round;
        }
        .dial-needle {
          stroke: var(--cyan);
          stroke-width: 3;
          stroke-linecap: round;
          transition: all 0.12s ease;
        }
        .dial-hub {
          fill: var(--cyan);
        }
        input[type='range'] {
          width: 100%;
          max-width: 300px;
          accent-color: var(--cyan);
          margin: 0.4rem 0;
        }
        .dial-out {
          display: block;
          font-size: 1.4rem;
          color: var(--cyan);
          font-weight: 700;
        }
        .dial-presets {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-top: 0.8rem;
        }
        .preset {
          font-family: var(--mono);
          font-size: 0.68rem;
          padding: 0.35rem 0.6rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--glass-bg-2);
          color: var(--muted);
          cursor: pointer;
          transition: color 0.2s ease, border-color 0.2s ease;
        }
        .preset:hover {
          color: var(--ink);
          border-color: var(--cyan);
        }
        .dial-right {
          flex: 1;
          min-width: 220px;
        }
        .dial-readout {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }
        .dial-r-eye {
          font-size: 0.72rem;
          color: var(--faint);
          letter-spacing: 0.08em;
        }
        .dial-r-num {
          font-size: clamp(3rem, 9vw, 4.6rem);
          font-weight: 800;
          color: var(--danger);
          line-height: 1;
        }
        .dial-explain {
          color: var(--muted);
          font-size: 0.9rem;
          line-height: 1.5;
          margin: 0.6rem 0 1rem;
        }
        .dial-detents {
          color: var(--faint);
          font-size: 0.76rem;
        }
        .dial-detents code {
          color: var(--cyan);
          margin: 0 0.15rem;
        }
        .dial-thesis {
          margin: 1.6rem 0 0;
          color: var(--ink);
          font-size: 1.05rem;
        }
        .dial-thesis b {
          color: var(--cyan);
        }
      `}</style>
    </section>
  )
}
