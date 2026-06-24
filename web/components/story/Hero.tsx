'use client'

import Link from 'next/link'
import { CountUp } from '../ui/CountUp'

interface Props {
  glassLeader: number
  bestCwr: number
  items: number
}

export function Hero({ glassLeader, bestCwr, items }: Props) {
  return (
    <section className="hero glass-panel">
      <p className="hero-q1">Every memory benchmark asks “did it remember?”</p>
      <h1 className="hero-q2">
        GlassBench asks: <span className="hl">does it know when it didn’t?</span>
      </h1>
      <p className="hero-lede">
        Long-context, RAG, MemGPT, Mem0, Zep — all scored on accuracy. But a deployed memory fails another way:
        it answers <em>confidently</em> when the fact changed, was retracted, or was never stated. GlassBench
        measures that.
      </p>

      <div className="hero-stats">
        <div className="stat stat-cyan">
          <span className="stat-eye mono">GLASS LEADER</span>
          <span className="stat-num mono">
            <CountUp value={glassLeader} dp={2} />
          </span>
        </div>
        <div className="stat stat-good">
          <span className="stat-eye mono">BEST CWR</span>
          <span className="stat-num mono">
            <CountUp value={bestCwr} dp={3} />
          </span>
        </div>
        <div className="stat">
          <span className="stat-eye mono">ITEMS</span>
          <span className="stat-num mono">
            <CountUp value={items} dp={0} />
          </span>
        </div>
      </div>

      <div className="hero-cta">
        <Link className="btn btn-primary" href="/leaderboard">
          View leaderboard <span aria-hidden="true">→</span>
        </Link>
        <Link className="btn btn-ghost" href="/submit">
          Submit a system <span aria-hidden="true">→</span>
        </Link>
      </div>

      <style jsx>{`
        .hero {
          padding: clamp(1.8rem, 5vw, 3.4rem);
          margin-top: 1rem;
        }
        .hero-q1 {
          color: var(--muted);
          margin: 0;
          font-size: clamp(0.95rem, 2.4vw, 1.15rem);
        }
        .hero-q2 {
          margin: 0.5rem 0 0;
          font-size: clamp(2.1rem, 6.5vw, 4rem);
          line-height: 1.02;
          letter-spacing: -0.02em;
        }
        .hl {
          color: var(--cyan);
        }
        .hero-lede {
          color: var(--muted);
          max-width: 60ch;
          font-size: clamp(0.98rem, 2.2vw, 1.1rem);
          line-height: 1.6;
          margin: 1.3rem 0 0;
        }
        .hero-stats {
          display: flex;
          flex-wrap: wrap;
          gap: clamp(1rem, 4vw, 2.6rem);
          margin: 2rem 0 1.8rem;
        }
        .stat {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .stat-eye {
          font-size: 0.72rem;
          letter-spacing: 0.1em;
          color: var(--faint);
        }
        .stat-num {
          font-size: clamp(1.8rem, 5vw, 2.6rem);
          font-weight: 700;
          line-height: 1;
        }
        .stat-cyan .stat-num {
          color: var(--cyan);
        }
        .stat-good .stat-num {
          color: var(--good);
        }
        .hero-cta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.8rem;
        }
        :global(.btn) {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.7rem 1.3rem;
          border-radius: 12px;
          text-decoration: none;
          font-size: 0.92rem;
          font-weight: 600;
          border: 1px solid var(--border);
          transition: transform 0.18s ease, background 0.25s ease, border-color 0.2s ease;
        }
        :global(.btn:hover) {
          transform: translateY(-2px);
        }
        :global(.btn-primary) {
          background: var(--cyan);
          color: #04222b;
          border-color: transparent;
        }
        :global(.btn-ghost) {
          background: var(--glass-bg-2);
          color: var(--ink);
        }
      `}</style>
    </section>
  )
}
