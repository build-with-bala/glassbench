'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import gsap from 'gsap'
import { BoardOverlay } from '../board/BoardOverlay'
import { Legend, Readout, SystemPicker, ViewControls } from '../board/BoardControls'
import ui from '../board/board.module.css'
import { useBoardData } from '../world/BoardDataProvider'
import { useBoardState } from '../world/store'
import { useHomeBoard } from './HomeBoard'

/** The home hero: the copy sits low and left, and the right of the viewport is the
 *  board as a live instrument — pick a system and every cell takes that system's
 *  scorer-assigned outcome; hover or focus a cell to read it; click to open the item.
 *  The section itself lets pointer events through, so the cells underneath (real
 *  links, see BoardOverlay) can be reached; only its own controls take them. */
export function Hero({ items }: { items: number }) {
  const rootRef = useRef<HTMLElement>(null)
  const data = useBoardData()
  const { system, setSystem, legend, setLegend } = useHomeBoard()
  const { tier } = useBoardState()
  const current = data.systems.find((s) => s.name === system) ?? data.systems[0]

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || !rootRef.current) return
    const ctx = gsap.context(() => {
      gsap.from('[data-hero-anim]', {
        y: 22,
        opacity: 0,
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.07,
        delay: 0.1,
        clearProps: 'transform',
      })
    }, rootRef)
    return () => ctx.revert()
  }, [])

  return (
    <section ref={rootRef} className="hero" aria-label="GlassBench">
      {current ? (
        <div className="hero-panel hero-panel-top" data-hero-anim>
          <span className={ui.label}>System on the board</span>
          <SystemPicker systems={data.systems} value={current.name} onChange={setSystem} />
          <Readout system={current} items={data.items.length} />
        </div>
      ) : null}

      <div className="hero-copy">
        <p className="hero-q1" data-hero-anim>
          <span className="hero-dot" aria-hidden="true" />
          Every memory benchmark asks “did it remember?”
        </p>
        <h1 className="hero-q2" data-hero-anim>
          Does it know when it didn’t?
        </h1>
        <p className="hero-lede" data-hero-anim>
          A deployed memory fails another way: it answers <em>confidently</em> when the fact changed, was
          retracted, or was never stated. Each glass cell is one of the {items} items. Its height is the
          confidence a system stated; clear glass answered, frosted glass abstained; and a cell that was
          confidently wrong burns.
        </p>
        <div className="hero-cta" data-hero-anim>
          <Link className="btn btn-primary" href="/leaderboard">
            View leaderboard <span aria-hidden="true">→</span>
          </Link>
          <Link className="btn btn-ghost" href="/explore">
            Explore the items <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>

      {current ? (
        <div className="hero-panel hero-panel-bottom" data-hero-anim>
          <Legend data={data} system={current} value={legend} onChange={setLegend} />
          <div className="hero-panel-foot">
            {tier === 'poster' ? (
              <p className={ui.note}>
                Motion is reduced, so the board is a still. The same results are in the{' '}
                <Link href="/explore" style={{ color: 'var(--accent)' }}>
                  item explorer
                </Link>
                .
              </p>
            ) : (
              <>
                <p className={ui.note}>
                  Hover a cell to read it, click to open the item, drag to turn the board. <kbd>⌘K</kbd> jumps
                  anywhere.
                </p>
                <ViewControls />
              </>
            )}
          </div>
        </div>
      ) : null}

      {current ? <BoardOverlay data={data} system={current.name} /> : null}
    </section>
  )
}
