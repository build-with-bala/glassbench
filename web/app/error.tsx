'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { GlassPanel } from '../components/ui/GlassPanel'
import ui from '../components/platform/ui.module.css'

/** Route error boundary: a page threw while rendering. The shell (nav, footer, theme)
 *  stays up; the reader gets a way to retry and a way out. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main id="main" className={`${ui.page} ${ui.pageNarrow}`}>
      <GlassPanel>
        <div className={ui.head} role="alert">
          <p className={ui.eyebrow}>Something broke</p>
          <h1 className={ui.title}>This page failed to load</h1>
          <p className={ui.lede}>
            An error stopped this page from rendering. The benchmark’s numbers are unaffected — they are static
            files written by the scorer. You can try again, or go somewhere else.
          </p>
          {error.digest ? (
            <p className={`${ui.small} ${ui.faint}`} style={{ margin: '0.8rem 0 0' }}>
              Reference: <span className={ui.mono}>{error.digest}</span>
            </p>
          ) : null}
          <div className={ui.buttonRow} style={{ marginTop: '1.2rem' }}>
            <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={() => reset()}>
              Try again
            </button>
            <Link className={ui.button} href="/leaderboard">
              Leaderboard
            </Link>
            <Link className={ui.button} href="/">
              Overview
            </Link>
          </div>
        </div>
      </GlassPanel>
    </main>
  )
}
