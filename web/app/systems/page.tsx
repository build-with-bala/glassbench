import Link from 'next/link'
import { getLeaderboard } from '../../lib/glassbench-data'
import { getSystemCards, isRankedRow, type SystemCard } from '../../lib/systems'
import { pageMetadata } from '../../lib/metadata'
import { formatMetric } from '../../lib/format'
import { systemHref } from '../../lib/routes'
import { GlassPanel } from '../../components/ui/GlassPanel'
import { Breadcrumbs } from '../../components/platform/Breadcrumbs'
import { PageHead } from '../../components/platform/PageHead'
import { KindBadge } from '../../components/platform/Badges'
import { OutcomeBar } from '../../components/systems/OutcomeBar'
import { BoardHover } from '../../components/board/BoardBinding'
import ui from '../../components/platform/ui.module.css'
import css from '../../components/systems/systems.module.css'

export const metadata = pageMetadata({
  title: 'Systems',
  description:
    'Every system scored on GlassBench: metrics, per-split breakdown, system card, reproduce command and per-item outcomes.',
  path: '/systems',
})

function SystemCardLink({ card }: { card: SystemCard }) {
  const { row, summary } = card
  return (
    <BoardHover as="li" system={card.system}>
      <GlassPanel className={`${css.sysCard} ${card.kind === 'reference' ? css.sysCardRef : ''}`}>
        <div className={css.sysTop}>
          <Link href={systemHref(card.system)} className={`${css.sysName} ${ui.link}`}>
            {card.system}
          </Link>
          <span className={css.sysScore}>
            <span className={ui.srOnly}>Glass Score </span>
            {formatMetric('glass_score', row.glass_score)}
          </span>
        </div>
        <div className={ui.buttonRow}>
          <KindBadge kind={card.kind} rank={card.rank} />
        </div>
        <p className={css.sysDesc}>{isRankedRow(row) ? row.type : row.what_it_is}</p>
        <p className={css.sysStats}>
          <span>
            CWR <b>{formatMetric('cwr', row.cwr)}</b>
          </span>
          <span>
            answered <b>{summary.n_answered}</b>
          </span>
          <span>
            abstained <b>{summary.n_abstained}</b>
          </span>
        </p>
        <div className={css.sysFoot}>
          <OutcomeBar counts={summary.outcome_counts} legend={false} />
        </div>
      </GlassPanel>
    </BoardHover>
  )
}

export default function SystemsPage() {
  const d = getLeaderboard()
  const cards = getSystemCards()
  const ranked = cards.filter((c) => c.kind === 'ranked')
  const references = cards.filter((c) => c.kind === 'reference')

  return (
    <main id="main" className={ui.page}>
      <Breadcrumbs trail={[{ label: 'Leaderboard', href: '/leaderboard' }, { label: 'Systems' }]} />
      <PageHead eyebrow={`Systems · ${cards.length} scored · v${d.version}`} title="Every system, item by item">
        <p className={ui.lede}>
          Each system has a page with all of its metrics, a per-split breakdown, its system card, the command that
          reproduces it, and what it did on each of the {d.n_items} items. The bar under each card shows how its
          items split across correct answers, right-call abstentions, wrong answers, confidently-wrong answers and
          missed answers.
        </p>
      </PageHead>

      <section className={ui.section} aria-labelledby="ranked-h">
        <h2 id="ranked-h" className={ui.cardTitle} style={{ padding: '0 0.2rem' }}>
          Ranked systems
        </h2>
        <p className={ui.cardSub} style={{ padding: '0 0.2rem' }}>
          Genuine systems that read only the history and the query. Ordered as on the{' '}
          <Link className={ui.link} href="/leaderboard">
            leaderboard
          </Link>
          .
        </p>
        <ul className={ui.grid3} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {ranked.map((c) => (
            <SystemCardLink key={c.system} card={c} />
          ))}
        </ul>
      </section>

      {references.length ? (
        <section className={ui.section} aria-labelledby="refs-h">
          <h2 id="refs-h" className={ui.cardTitle} style={{ padding: '0 0.2rem', marginTop: '2rem' }}>
            Reference ceilings — not ranked
          </h2>
          <p className={ui.cardSub} style={{ padding: '0 0.2rem' }}>
            Constructed from the gold labels, so they would be rejected as real submissions. Shown only to mark the
            top of the scale.
          </p>
          <ul className={ui.grid3} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {references.map((c) => (
              <SystemCardLink key={c.system} card={c} />
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}
