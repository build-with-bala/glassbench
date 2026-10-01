import type { Metadata } from 'next'
import Link from 'next/link'
import { GlassPanel } from '../components/ui/GlassPanel'
import { getLeaderboard } from '../lib/glassbench-data'
import ui from '../components/platform/ui.module.css'

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
}

export default function NotFound() {
  const d = getLeaderboard()
  const places = [
    { href: '/leaderboard', label: 'Leaderboard', note: 'the ranked board' },
    { href: '/systems', label: 'Systems', note: 'one page per scored system' },
    { href: '/explore', label: 'Explore items', note: `the ${d.n_items} items and every system’s outcome` },
    { href: '/compare', label: 'Compare', note: 'two systems side by side' },
    { href: '/data', label: 'Data & API', note: 'the results as JSON' },
    { href: '/submit', label: 'Submit', note: 'add your system' },
  ]
  return (
    <main id="main" className={`${ui.page} ${ui.pageNarrow}`}>
      <GlassPanel>
        <div className={ui.head}>
          <p className={ui.eyebrow}>404 · not found</p>
          <h1 className={ui.title}>There is nothing at this address</h1>
          <p className={ui.lede}>
            The page may have moved, or the link may name a system or an item that is not in GlassBench v{d.version}.
          </p>
          <div className={ui.buttonRow} style={{ marginTop: '1.2rem' }}>
            <Link className={`${ui.button} ${ui.buttonPrimary}`} href="/">
              Go to the overview
            </Link>
          </div>
        </div>
      </GlassPanel>

      <section className={ui.section} aria-labelledby="places-h">
        <GlassPanel className={ui.card}>
          <h2 id="places-h" className={ui.cardTitle}>
            Where you might have been going
          </h2>
          <dl className={ui.kv}>
            {places.map((p) => (
              <div key={p.href} style={{ display: 'contents' }}>
                <dt>
                  <Link className={ui.link} href={p.href}>
                    {p.label}
                  </Link>
                </dt>
                <dd className={ui.muted}>{p.note}</dd>
              </div>
            ))}
          </dl>
        </GlassPanel>
      </section>
    </main>
  )
}
