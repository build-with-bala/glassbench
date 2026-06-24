import type { Metadata } from 'next'
import { getLeaderboard, scoredMetrics, columnRange } from '../../lib/glassbench-data'
import { LeaderboardTable } from '../../components/leaderboard/LeaderboardTable'
import { ReferenceScale } from '../../components/leaderboard/ReferenceScale'

export const metadata: Metadata = {
  title: 'Leaderboard',
  description: 'GlassBench leaderboard — ranked by Glass Score, with the Confidently-Wrong Rate (CWR) in full view.',
}

export default function LeaderboardPage() {
  const d = getLeaderboard()
  const metrics = scoredMetrics(d)
  const ranges: Record<string, [number, number]> = {}
  for (const m of metrics) ranges[m.key] = m.range ?? columnRange(d.ranked, m.key)

  return (
    <main id="main" style={{ maxWidth: 1280, margin: '0 auto', padding: '2rem clamp(0.8rem, 3vw, 1.6rem) 0' }}>
      <header style={{ padding: '1.4rem 0.4rem 1.8rem', maxWidth: 760 }}>
        <p className="mono" style={{ color: 'var(--cyan)', margin: 0, fontSize: '0.8rem', letterSpacing: '0.08em' }}>
          LEADERBOARD · {d.n_items} ITEMS · v{d.version}
        </p>
        <h1 style={{ margin: '0.5rem 0 0.6rem', fontSize: 'clamp(1.9rem, 5vw, 2.8rem)', lineHeight: 1.05 }}>
          Ranked by Glass Score. The <span style={{ color: 'var(--cyan)' }}>confidently-wrong rate</span> kept in
          plain view.
        </h1>
        <p style={{ color: 'var(--muted)', margin: 0, fontSize: '1rem', lineHeight: 1.5 }}>
          {d.glass_score_formula}
        </p>
      </header>

      <LeaderboardTable rows={d.ranked} metrics={metrics} ranges={ranges} primaryKey={d.primary_metric} headlineKey={d.headline_metric} />
      <ReferenceScale references={d.references} metrics={metrics} ranges={ranges} />
    </main>
  )
}
