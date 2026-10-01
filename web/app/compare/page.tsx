import { Suspense } from 'react'
import Link from 'next/link'
import { getLeaderboard } from '../../lib/glassbench-data'
import { getItemSummaries } from '../../lib/items-data'
import { getSystemCards } from '../../lib/systems'
import { pageMetadata } from '../../lib/metadata'
import { compareHref } from '../../lib/routes'
import { GlassPanel } from '../../components/ui/GlassPanel'
import { PageHead } from '../../components/platform/PageHead'
import { CompareView, type CompareSystem } from '../../components/compare/CompareView'
import ui from '../../components/platform/ui.module.css'

export const metadata = pageMetadata({
  title: 'Compare systems',
  description:
    'Compare two GlassBench systems: every metric side by side with deltas, and the items on which they got different outcomes.',
  path: '/compare',
})

export default function ComparePage() {
  const d = getLeaderboard()
  const cards = getSystemCards()
  const items = getItemSummaries()

  const systems: CompareSystem[] = cards.map((c) => {
    const values: Record<string, number> = {}
    for (const m of d.metrics) values[m.key] = c.row[m.key] as number
    values.answered = c.row.answered
    values.abstained = c.row.abstained
    return { system: c.system, kind: c.kind, rank: c.rank, values }
  })
  const first = systems[0]
  const second = systems[1]

  return (
    <main id="main" className={ui.page}>
      <PageHead eyebrow={`Compare · ${systems.length} systems · v${d.version}`} title="Two systems, item by item">
        <p className={ui.lede}>
          Pick any two systems to see every metric side by side with its delta, and the items where the scorer gave
          them different outcomes. The comparison is in the address, so you can share it.
        </p>
      </PageHead>

      <section className={ui.section}>
        <GlassPanel className={ui.card}>
          {/* The pair comes from the query string, so the view renders on the client. */}
          <Suspense
            fallback={
              <div className={ui.skeleton} role="status" aria-live="polite">
                <p style={{ margin: '0 0 0.8rem' }}>Loading the comparison…</p>
                <noscript>
                  <p>
                    Comparing needs JavaScript. Every system’s metrics are on the{' '}
                    <Link className={ui.link} href="/leaderboard">
                      leaderboard
                    </Link>
                    .
                  </p>
                </noscript>
              </div>
            }
          >
            <CompareView systems={systems} metrics={d.metrics} items={items} />
          </Suspense>
        </GlassPanel>
      </section>

      {first && second ? (
        <section className={ui.section} aria-labelledby="starts-h">
          <GlassPanel className={ui.card}>
            <h2 id="starts-h" className={ui.cardTitle}>
              Comparisons worth opening
            </h2>
            <ul className={ui.legend} style={{ gap: '0.5rem 1.2rem' }}>
              {systems
                .filter((s) => s.system !== first.system)
                .map((s) => (
                  <li key={s.system}>
                    <Link className={`${ui.link} ${ui.mono} ${ui.small}`} href={compareHref(first.system, s.system)}>
                      {first.system} vs {s.system}
                    </Link>
                  </li>
                ))}
            </ul>
          </GlassPanel>
        </section>
      ) : null}
    </main>
  )
}
