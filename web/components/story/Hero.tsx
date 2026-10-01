'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import gsap from 'gsap'
import { CountUp } from '../ui/CountUp'

interface Props {
  glassLeader: number
  bestCwr: number
  items: number
}

/** The home hero. No panel: the copy sits directly on the world, low and left,
 *  and leaves the right of the viewport to the lit slab cluster. It breaks out of
 *  the page's centred column so the headline shares the nav's left edge. */
export function Hero({ glassLeader, bestCwr, items }: Props) {
  const rootRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || !rootRef.current) return
    const ctx = gsap.context(() => {
      gsap.from('[data-hero-anim]', {
        y: 26,
        opacity: 0,
        duration: 0.95,
        ease: 'power3.out',
        stagger: 0.085,
        delay: 0.12,
      })
    }, rootRef)
    return () => ctx.revert()
  }, [])

  return (
    <section ref={rootRef} className="hero">
      <div className="hero-copy">
        <p className="hero-q1" data-hero-anim>
          <span className="hero-dot" aria-hidden="true" />
          Every memory benchmark asks “did it remember?”
        </p>
        <h1 className="hero-q2" data-hero-anim>
          Does it know when it didn’t?
        </h1>
        <p className="hero-lede" data-hero-anim>
          Long-context, RAG, MemGPT, Mem0, Zep — all scored on accuracy. But a deployed memory fails another
          way: it answers <em>confidently</em> when the fact changed, was retracted, or was never stated.
          GlassBench measures that.
        </p>

        <div className="hero-stats" data-hero-anim>
          <div className="stat stat-cyan">
            <span className="stat-num mono">
              <CountUp value={glassLeader} dp={2} />
            </span>
            <span className="stat-eye mono">GLASS LEADER</span>
          </div>
          <div className="stat stat-good">
            <span className="stat-num mono">
              <CountUp value={bestCwr} dp={3} />
            </span>
            <span className="stat-eye mono">BEST CWR</span>
          </div>
          <div className="stat">
            <span className="stat-num mono">
              <CountUp value={items} dp={0} />
            </span>
            <span className="stat-eye mono">ITEMS</span>
          </div>
        </div>

        <div className="hero-cta" data-hero-anim>
          <Link className="btn btn-primary" href="/leaderboard">
            View leaderboard <span aria-hidden="true">→</span>
          </Link>
          <Link className="btn btn-ghost" href="/submit">
            Submit a system <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>

      <style jsx>{`
        .hero {
          position: relative;
          width: 100vw;
          margin-left: calc(50% - 50vw);
          min-height: calc(100svh - 5.6rem);
          display: flex;
          align-items: flex-end;
          padding: clamp(2rem, 6vh, 4rem) var(--edge) clamp(2.4rem, 8vh, 5.5rem);
        }
        .hero-copy {
          width: min(100%, 39rem);
        }
        .hero-q1 {
          display: flex;
          align-items: flex-start;
          gap: 0.6rem;
          margin: 0;
          color: var(--muted);
          font-size: clamp(0.95rem, 1.25vw, 1.08rem);
          letter-spacing: -0.01em;
        }
        .hero-dot {
          flex: 0 0 auto;
          width: 0.5rem;
          height: 0.5rem;
          margin-top: 0.5em;
          border-radius: 3px;
          background: var(--accent-bright);
          box-shadow: 0 0 14px 2px var(--accent-glow);
        }
        .hero-q2 {
          margin: 1.1rem 0 0;
          max-width: 6.6em;
          font-size: clamp(3.1rem, 7.1vw, 7rem);
          font-weight: 540;
          line-height: 0.93;
          letter-spacing: -0.055em;
          text-wrap: balance;
        }
        .hero-lede {
          color: var(--muted);
          max-width: 33rem;
          font-size: clamp(0.98rem, 1.2vw, 1.08rem);
          line-height: 1.58;
          margin: 1.7rem 0 0;
        }
        .hero-lede em {
          color: var(--ink);
          font-style: normal;
        }
        .hero-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 0.9rem clamp(1.4rem, 3.4vw, 2.8rem);
          margin: 2.1rem 0 0;
          padding-top: 1.3rem;
          border-top: 1px solid var(--border);
          max-width: 33rem;
        }
        .stat {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .stat-eye {
          font-size: 0.68rem;
          letter-spacing: 0.12em;
          color: var(--faint);
        }
        .stat-num {
          font-size: clamp(1.5rem, 2.5vw, 2.1rem);
          font-weight: 500;
          line-height: 1;
          letter-spacing: -0.04em;
          color: var(--ink);
        }
        .stat-cyan .stat-num {
          color: var(--accent);
        }
        .hero-cta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.7rem;
          margin-top: 2rem;
        }
        @media (max-width: 720px) {
          .hero {
            min-height: calc(100svh - 5rem);
            padding-top: 42svh;
            padding-bottom: 2rem;
          }
          .hero-q2 {
            font-size: clamp(2.9rem, 14.5vw, 4.2rem);
          }
        }
      `}</style>
    </section>
  )
}
