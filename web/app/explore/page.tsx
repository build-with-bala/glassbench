import { Suspense } from 'react'
import Link from 'next/link'
import { getResults, getSystemRefs } from '../../lib/results-data'
import { getItemSummaries } from '../../lib/items-data'
import { OUTCOME_STYLE, SPLIT_KEYS, SPLIT_LABEL } from '../../lib/outcomes'
import { pageMetadata } from '../../lib/metadata'
import { exploreHref } from '../../lib/routes'
import { GlassPanel } from '../../components/ui/GlassPanel'
import { PageHead } from '../../components/platform/PageHead'
import { outcomeTintClass } from '../../components/platform/Badges'
import { ExploreBrowser } from '../../components/explore/ExploreBrowser'
import { ItemRow } from '../../components/explore/ItemRow'
import ui from '../../components/platform/ui.module.css'
import css from '../../components/explore/explore.module.css'

export const metadata = pageMetadata({
  title: 'Explore items',
  description: `Browse the ${getResults().n_items} GlassBench items: filter by split and by outcome, search the queries, and see which systems answered, abstained or were confidently wrong on each.`,
  path: '/explore',
})

export default function ExplorePage() {
  const results = getResults()
  const systems = getSystemRefs(results)
  const items = getItemSummaries(results)

  return (
    <main id="main" className={ui.page}>
      <PageHead eyebrow={`Item explorer · ${results.n_items} items · v${results.version}`} title="Where each system was right, silent, or confidently wrong">
        <p className={ui.lede}>
          Every item is a multi-session conversation and a query. Filter by split and outcome, search the queries,
          and open an item to read its history and see what all {systems.length} systems did with it.
        </p>
        <p className={ui.lede}>
          Gold answers are not shown in this list. Each item page keeps its gold answer behind an explicit reveal
          and is excluded from search indexes, so the site does not become a shortcut for contaminating a model.
        </p>
      </PageHead>

      <section className={ui.section} aria-labelledby="key-h">
        <GlassPanel className={ui.card}>
          <h2 id="key-h" className={ui.cardTitle}>
            Reading the outcomes
          </h2>
          <dl className={ui.kv}>
            {results.outcomes.map((o) => (
              <div key={o.key} style={{ display: 'contents' }}>
                <dt>
                  <span className={`${ui.badge} ${outcomeTintClass(o.key)}`}>
                    <span className={ui.badgeGlyph} aria-hidden="true">
                      {OUTCOME_STYLE[o.key].glyph}
                    </span>
                    {OUTCOME_STYLE[o.key].label}
                  </span>
                </dt>
                <dd className={`${ui.small} ${ui.muted}`}>{o.definition}</dd>
              </div>
            ))}
          </dl>
          <p className={`${ui.small} ${ui.muted}`} style={{ margin: '0.9rem 0 0' }}>
            Outcomes are assigned by the Python scorer, not by this page. Jump to:{' '}
            {SPLIT_KEYS.map((s, i) => (
              <span key={s}>
                {i > 0 ? ' · ' : ''}
                <Link className={ui.link} href={exploreHref({ split: s })}>
                  {SPLIT_LABEL[s]} ({results.split_counts[s]})
                </Link>
              </span>
            ))}
            {' · '}
            <Link className={ui.link} href={exploreHref({ outcome: 'confidently_wrong' })}>
              any system confidently wrong
            </Link>
          </p>
        </GlassPanel>
      </section>

      <section className={ui.section} aria-labelledby="items-h">
        <GlassPanel className={ui.card}>
          <h2 id="items-h" className={ui.cardTitle}>
            Items
          </h2>
          {/* The live browser reads the query string, so it renders on the client. Until
              it does (and with JavaScript off) the full, unfiltered list stands in. */}
          <Suspense
            fallback={
              <div>
                <p className={ui.status}>
                  Loading the filters… All {items.length} items are listed below; each item’s page shows what
                  every system did with it.
                </p>
                <ul className={css.list} style={{ marginTop: '1rem' }}>
                  {items.map((item) => (
                    <ItemRow key={item.id} item={{ id: item.id, split: item.split, query: item.query }} systems={[]} />
                  ))}
                </ul>
              </div>
            }
          >
            <ExploreBrowser items={items} systems={systems} />
          </Suspense>
        </GlassPanel>
      </section>
    </main>
  )
}
