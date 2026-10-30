import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getResults, getItemResults, getSystemRefs, toPublicResult } from '../../../lib/results-data'
import { getItem, getItems, historyStats } from '../../../lib/items-data'
import {
  ABSTENTION_LABEL,
  SPLIT_HONEST,
  SPLIT_LABEL,
  UNANSWERABLE_SPLITS,
  formatConfidence,
} from '../../../lib/outcomes'
import { pageMetadata } from '../../../lib/metadata'
import { exploreHref, itemHref, systemHref } from '../../../lib/routes'
import { GlassPanel } from '../../../components/ui/GlassPanel'
import { Breadcrumbs } from '../../../components/platform/Breadcrumbs'
import { PageHead } from '../../../components/platform/PageHead'
import { BoardBinding, BoardHover } from '../../../components/board/BoardBinding'
import { OutcomeBadge, SplitBadge } from '../../../components/platform/Badges'
import { HistoryView } from '../../../components/explore/HistoryView'
import { ItemReveal } from '../../../components/explore/ItemReveal'
import ui from '../../../components/platform/ui.module.css'
import css from '../../../components/explore/explore.module.css'

// One static page per benchmark item; anything else is a 404.
export const dynamicParams = false

export function generateStaticParams() {
  return getItems().map((it) => ({ id: it.id }))
}

type Params = Promise<{ id: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params
  const item = getItem(decodeURIComponent(id))
  if (!item) return { title: 'Item not found', robots: { index: false, follow: true } }
  // noindex: an item page sits one click away from its gold answer. Keeping these pages
  // out of search indexes (and out of the sitemap) is deliberate.
  return pageMetadata({
    title: `Item ${item.id}`,
    description: `GlassBench ${SPLIT_LABEL[item.split]} item ${item.id}: its conversation history, its query, and every system's outcome on it.`,
    path: itemHref(item.id),
    noindex: true,
  })
}

export default async function ItemPage({ params }: { params: Params }) {
  const { id } = await params
  const item = getItem(decodeURIComponent(id))
  if (!item) notFound()

  const results = getResults()
  const itemResults = getItemResults(item.id, results)
  if (!itemResults) notFound()

  const systems = getSystemRefs(results)
  const rows = systems.map((s) => ({ ...s, result: toPublicResult(itemResults.results[s.system]) }))
  const stats = historyStats(item)
  const unanswerable = UNANSWERABLE_SPLITS.includes(item.split)

  const all = getItems()
  const index = all.findIndex((it) => it.id === item.id)
  const prev = index > 0 ? all[index - 1] : null
  const next = index < all.length - 1 ? all[index + 1] : null

  const answeredBy = rows.filter((r) => r.result.answered).length
  const confidentlyWrong = rows.filter((r) => r.result.outcome === 'confidently_wrong').map((r) => r.system)

  return (
    <main id="main" className={ui.page}>
      {/* the board singles this item's cell out; a system's row shows that system */}
      <BoardBinding focus={item.id} />
      <Breadcrumbs
        trail={[
          { label: 'Explore', href: '/explore' },
          { label: SPLIT_LABEL[item.split], href: exploreHref({ split: item.split }) },
          { label: item.id },
        ]}
      />

      <PageHead
        eyebrow={`Item ${index + 1} of ${all.length} · v${results.version}`}
        title={item.id}
        mono
        aside={
          <div className={ui.buttonRow} style={{ marginTop: '1rem' }}>
            <SplitBadge split={item.split} />
            <span className={ui.badge}>
              {stats.sessions} {stats.sessions === 1 ? 'session' : 'sessions'} · {stats.turns} turns
            </span>
          </div>
        }
      >
        <p className={ui.lede}>{SPLIT_HONEST[item.split]}</p>
      </PageHead>

      <section className={ui.section} aria-labelledby="query-h">
        <GlassPanel className={ui.card}>
          <h2 id="query-h" className={ui.cardTitle}>
            Query
          </h2>
          <p className={css.query}>{item.query}</p>
        </GlassPanel>
      </section>

      <section className={ui.section} aria-labelledby="outcomes-h">
        <GlassPanel className={ui.card}>
          <h2 id="outcomes-h" className={ui.cardTitle}>
            What each system did
          </h2>
          <p className={ui.cardSub}>
            {answeredBy} of {rows.length} systems answered; {rows.length - answeredBy} abstained.{' '}
            {confidentlyWrong.length
              ? `Confidently wrong: ${confidentlyWrong.join(', ')}.`
              : 'None was confidently wrong.'}{' '}
            Outcomes are the scorer’s; a stated confidence below {results.thresholds.abstain_confidence} counts as
            an abstention.
          </p>
          <ul className={css.outcomes} aria-label={`Each system’s outcome on item ${item.id}`}>
            {rows.map((r) => (
              <BoardHover as="li" key={r.system} system={r.system}>
                <span className={css.outcomeWho}>
                  <Link className={`${ui.link} ${ui.mono}`} href={systemHref(r.system)}>
                    {r.system}
                  </Link>
                  {r.kind === 'reference' ? <span className={`${ui.small} ${ui.faint}`}> · reference</span> : null}
                </span>
                <span className={css.outcomeWhat}>
                  <OutcomeBadge outcome={r.result.outcome} />
                  <span className={`${ui.mono} ${ui.small}`}>
                    <span className={ui.srOnly}>confidence </span>
                    <span aria-hidden="true" className={ui.faint}>
                      conf{' '}
                    </span>
                    {formatConfidence(r.result)}
                  </span>
                  <span className={`${ui.small} ${ui.muted}`}>
                    {r.result.abstention ? ABSTENTION_LABEL[r.result.abstention] : 'answered'}
                  </span>
                </span>
              </BoardHover>
            ))}
          </ul>
        </GlassPanel>
      </section>

      <section className={ui.section} aria-labelledby="gold-h">
        <GlassPanel className={ui.card}>
          <h2 id="gold-h" className={ui.cardTitle}>
            Gold answer
          </h2>
          <ItemReveal
            id={item.id}
            unanswerable={unanswerable}
            results={rows.map((r) => ({ system: r.system, result: r.result }))}
          />
        </GlassPanel>
      </section>

      <section className={ui.section} aria-labelledby="history-h">
        <GlassPanel className={ui.card}>
          <h2 id="history-h" className={ui.cardTitle}>
            Conversation history
          </h2>
          <p className={ui.cardSub}>
            What a system is given, alongside the query. User turns are shown in full; assistant turns are
            collapsed — select one to expand it.
          </p>
          <HistoryView history={item.history} />
        </GlassPanel>
      </section>

      <nav className={css.pager} aria-label="Neighbouring items">
        {prev ? (
          <Link className={ui.button} href={itemHref(prev.id)} rel="prev">
            <span aria-hidden="true">←</span> Previous item
          </Link>
        ) : (
          <span />
        )}
        <Link className={ui.button} href="/explore">
          All items
        </Link>
        {next ? (
          <Link className={ui.button} href={itemHref(next.id)} rel="next">
            Next item <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  )
}
