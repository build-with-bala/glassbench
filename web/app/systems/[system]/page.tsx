import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLeaderboard, columnRange } from '../../../lib/glassbench-data'
import { getResults, getSystemItemRows } from '../../../lib/results-data'
import { getItems } from '../../../lib/items-data'
import { getSystemCards, isRankedRow, rankContext, type SystemCard } from '../../../lib/systems'
import { renderMarkdown } from '../../../lib/markdown'
import { pageMetadata } from '../../../lib/metadata'
import { formatMetric } from '../../../lib/format'
import { compareHref, exploreHref, systemHref } from '../../../lib/routes'
import { REPO_URL } from '../../../lib/site'
import { GlassPanel } from '../../../components/ui/GlassPanel'
import { CopyButton } from '../../../components/ui/CopyButton'
import { Breadcrumbs } from '../../../components/platform/Breadcrumbs'
import { PageHead } from '../../../components/platform/PageHead'
import { KindBadge } from '../../../components/platform/Badges'
import { MetricTiles } from '../../../components/systems/MetricTiles'
import { OutcomeBar } from '../../../components/systems/OutcomeBar'
import { SplitBreakdown } from '../../../components/systems/SplitBreakdown'
import { GlassDecomposition } from '../../../components/systems/GlassDecomposition'
import { SystemItems, type SystemItemRow } from '../../../components/systems/SystemItems'
import { BoardBinding } from '../../../components/board/BoardBinding'
import ui from '../../../components/platform/ui.module.css'
import css from '../../../components/systems/systems.module.css'

// One static page per scored system; anything else is a 404.
export const dynamicParams = false

export function generateStaticParams() {
  return getSystemCards().map((c) => ({ system: c.system }))
}

type Params = Promise<{ system: string }>

function findCard(raw: string): SystemCard | undefined {
  const name = decodeURIComponent(raw)
  return getSystemCards().find((c) => c.system === name)
}

function blurb(card: SystemCard): string {
  return isRankedRow(card.row) ? card.row.description : `${card.row.what_it_is}. ${card.row.excluded_reason}`
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { system } = await params
  const card = findCard(system)
  if (!card) return { title: 'System not found' }
  const d = getLeaderboard()
  const standing =
    card.kind === 'ranked'
      ? `Rank ${card.rank} on GlassBench v${d.version}`
      : `Reference ceiling on GlassBench v${d.version} (not ranked)`
  return pageMetadata({
    title: card.system,
    description: `${standing}: Glass Score ${formatMetric('glass_score', card.row.glass_score)}, CWR ${formatMetric('cwr', card.row.cwr)}. ${blurb(card)}`,
    path: systemHref(card.system),
  })
}

export default async function SystemPage({ params }: { params: Params }) {
  const { system } = await params
  const card = findCard(system)
  if (!card) notFound()

  const d = getLeaderboard()
  const results = getResults()
  const cards = getSystemCards()
  const ctx = rankContext(card, cards)
  const { row, summary } = card

  const ranges: Record<string, [number, number]> = {}
  for (const m of d.metrics) ranges[m.key] = m.range ?? columnRange(d.ranked, m.key)

  const queries = new Map(getItems().map((it) => [it.id, it.query]))
  const rows: SystemItemRow[] = getSystemItemRows(card.system, results).map((r) => ({
    ...r,
    query: queries.get(r.id) ?? '',
  }))

  const reproduce = isRankedRow(row) ? row.reproduce : null
  const scoreCmd = `python -m glassbench.score --predictions submissions/${card.system}/predictions.json`
  const md = summary.system_md
    ? renderMarkdown(summary.system_md, { idPrefix: 'card-', headingOffset: 2 })
    : null
  const others = cards.filter((c) => c.system !== card.system)
  const cw = summary.outcome_counts.confidently_wrong
  // The most useful comparison: the next system up, else the next one down, else the leader.
  const neighbour = [ctx.above?.system, ctx.below?.system, ctx.leader?.system].find(
    (name) => name !== undefined && name !== card.system,
  )

  return (
    <main id="main" className={ui.page}>
      <BoardBinding system={card.system} />
      <Breadcrumbs
        trail={[{ label: 'Leaderboard', href: '/leaderboard' }, { label: 'Systems', href: '/systems' }, { label: card.system }]}
      />

      <PageHead
        eyebrow={
          card.kind === 'ranked'
            ? `System · rank ${card.rank} of ${ctx.total} · v${d.version}`
            : `Reference ceiling · not ranked · v${d.version}`
        }
        title={card.system}
        mono
        aside={
          <div className={ui.buttonRow} style={{ marginTop: '1rem' }}>
            <KindBadge kind={card.kind} rank={card.rank} />
            {isRankedRow(row) ? <span className={ui.badge} style={{ whiteSpace: 'normal' }}>{row.type}</span> : null}
          </div>
        }
      >
        <p className={ui.lede}>{blurb(card)}</p>
      </PageHead>

      <section className={ui.section} aria-labelledby="metrics-h">
        <GlassPanel className={ui.card}>
          <h2 id="metrics-h" className={ui.cardTitle}>
            Metrics
          </h2>
          <p className={ui.cardSub}>
            Scored by the frozen scorer on all {summary.n_items} items — answered {summary.n_answered}, abstained{' '}
            {summary.n_abstained}. Focus or hover a metric name for its definition. Tints compare this system with
            the ranked field, as on the leaderboard.
          </p>
          <MetricTiles metrics={d.metrics} values={row} ranges={ranges} />
        </GlassPanel>
      </section>

      <div className={`${ui.section} ${ui.grid2}`}>
        <section aria-labelledby="glass-h">
          <GlassPanel className={ui.card}>
            <h2 id="glass-h" className={ui.cardTitle}>
              Where the Glass Score comes from
            </h2>
            <p className={ui.cardSub}>The scorer’s own decomposition for this system.</p>
            <GlassDecomposition summary={summary} glassScore={row.glass_score} formula={d.glass_score_formula} />
          </GlassPanel>
        </section>

        <section aria-labelledby="rank-h">
          <GlassPanel className={ui.card}>
            <h2 id="rank-h" className={ui.cardTitle}>
              Rank context
            </h2>
            {card.kind === 'ranked' ? (
              <>
                <p className={ui.cardSub}>
                  Rank {card.rank} of {ctx.total} ranked systems, by Glass Score.
                  {ctx.tiedWith.length ? ` Tied with ${ctx.tiedWith.join(', ')}.` : ''}
                </p>
                <ul className={css.rankList}>
                  {ctx.above ? (
                    <li>
                      <span>
                        <span className={ui.faint}>next above · rank {ctx.above.rank} · </span>
                        <Link className={`${ui.link} ${ui.mono}`} href={systemHref(ctx.above.system)}>
                          {ctx.above.system}
                        </Link>
                      </span>
                      <span className={ui.mono}>{formatMetric('glass_score', ctx.above.glass_score)}</span>
                    </li>
                  ) : null}
                  <li className={css.rankSelf}>
                    <span>
                      <span className={ui.faint}>this system · rank {card.rank} · </span>
                      <span className={ui.mono}>{card.system}</span>
                    </span>
                    <span className={ui.mono}>{formatMetric('glass_score', row.glass_score)}</span>
                  </li>
                  {ctx.tiedWith.map((name) => (
                    <li key={name}>
                      <span>
                        <span className={ui.faint}>tied · rank {card.rank} · </span>
                        <Link className={`${ui.link} ${ui.mono}`} href={systemHref(name)}>
                          {name}
                        </Link>
                      </span>
                      <span className={ui.mono}>{formatMetric('glass_score', row.glass_score)}</span>
                    </li>
                  ))}
                  {ctx.below ? (
                    <li>
                      <span>
                        <span className={ui.faint}>next below · rank {ctx.below.rank} · </span>
                        <Link className={`${ui.link} ${ui.mono}`} href={systemHref(ctx.below.system)}>
                          {ctx.below.system}
                        </Link>
                      </span>
                      <span className={ui.mono}>{formatMetric('glass_score', ctx.below.glass_score)}</span>
                    </li>
                  ) : null}
                </ul>
              </>
            ) : (
              <p className={ui.cardSub}>
                Not ranked. This entry is constructed from the gold labels, so it would be rejected as a real
                submission; it is shown only to mark the top of the scale.
                {ctx.leader
                  ? ` For scale, the leading ranked system is ${ctx.leader.system} at ${formatMetric('glass_score', ctx.leader.glass_score)}.`
                  : ''}
              </p>
            )}
            <div className={ui.buttonRow} style={{ marginTop: '0.9rem' }}>
              {neighbour ? (
                <Link className={ui.button} href={compareHref(card.system, neighbour)}>
                  Compare with {neighbour}
                </Link>
              ) : null}
              <Link className={ui.button} href="/leaderboard">
                Full leaderboard
              </Link>
            </div>
          </GlassPanel>
        </section>
      </div>

      <section className={ui.section} aria-labelledby="splits-h">
        <GlassPanel className={ui.card}>
          <h2 id="splits-h" className={ui.cardTitle}>
            Outcomes and per-split breakdown
          </h2>
          <p className={ui.cardSub}>
            Each of the {summary.n_items} items ends in exactly one outcome. On the answerable and stale splits the
            honest move is to answer; on contradiction and false-premise it is to abstain.{' '}
            {cw > 0 ? (
              <>
                The {cw} confidently-wrong {cw === 1 ? 'item is' : 'items are'} what the CWR counts —{' '}
                <Link className={ui.link} href={exploreHref({ outcome: 'confidently_wrong', system: card.system })}>
                  open {cw === 1 ? 'it' : 'them'} in the explorer
                </Link>
                .
              </>
            ) : (
              'This system is never confidently wrong.'
            )}
          </p>
          <OutcomeBar counts={summary.outcome_counts} />
          <div style={{ marginTop: '1.1rem' }}>
            <SplitBreakdown summary={summary} />
          </div>
        </GlassPanel>
      </section>

      <div className={`${ui.section} ${ui.grid2}`}>
        <section aria-labelledby="repro-h">
          <GlassPanel className={ui.card}>
            <h2 id="repro-h" className={ui.cardTitle}>
              Reproduce
            </h2>
            {reproduce ? (
              <>
                <p className={ui.cardSub}>Regenerate this system’s predictions (deterministic, no API key):</p>
                <div className={ui.cmd}>
                  <code>{reproduce}</code>
                  <CopyButton text={reproduce} />
                </div>
              </>
            ) : (
              <p className={ui.cardSub}>
                A constructed reference: its predictions ship as a cached file and are not regenerated by a script.
              </p>
            )}
            <p className={ui.cardSub} style={{ marginTop: '1rem' }}>
              Re-score the committed predictions with the same scorer everyone runs:
            </p>
            <div className={ui.cmd}>
              <code>{scoreCmd}</code>
              <CopyButton text={scoreCmd} />
            </div>
            <p className={`${ui.small} ${ui.muted}`} style={{ margin: '0.9rem 0 0' }}>
              Files:{' '}
              <a
                className={ui.link}
                href={`${REPO_URL}/tree/main/submissions/${card.system}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                submissions/{card.system}/
              </a>{' '}
              · per-item results as JSON:{' '}
              <a className={ui.link} href={`/api/systems/${encodeURIComponent(card.system)}.json`}>
                /api/systems/{card.system}.json
              </a>
            </p>
          </GlassPanel>
        </section>

        <section aria-labelledby="compare-h">
          <GlassPanel className={ui.card}>
            <h2 id="compare-h" className={ui.cardTitle}>
              Compare
            </h2>
            <p className={ui.cardSub}>Metrics side by side, and the items where the two systems disagree.</p>
            <ul className={css.rankList}>
              {others.map((o) => (
                <li key={o.system}>
                  <Link className={`${ui.link} ${ui.mono}`} href={compareHref(card.system, o.system)}>
                    vs {o.system}
                  </Link>
                  <span className={ui.faint}>{o.kind === 'ranked' ? `rank ${o.rank}` : 'reference'}</span>
                </li>
              ))}
            </ul>
          </GlassPanel>
        </section>
      </div>

      <section className={ui.section} aria-labelledby="card-h">
        <GlassPanel className={ui.card}>
          <h2 id="card-h" className={ui.cardTitle}>
            System card
          </h2>
          {md ? (
            <>
              <p className={ui.cardSub}>
                The submission’s own <code className={ui.mono}>system.md</code>, as committed.
              </p>
              <article className="datasheet-prose" dangerouslySetInnerHTML={{ __html: md.html }} />
            </>
          ) : (
            <p className={ui.cardSub}>
              This submission has no <code className={ui.mono}>system.md</code>. The description above is all that
              is recorded for it.
            </p>
          )}
        </GlassPanel>
      </section>

      <section className={ui.section} aria-labelledby="items-h">
        <GlassPanel className={ui.card}>
          <h2 id="items-h" className={ui.cardTitle}>
            Per-item outcomes
          </h2>
          <p className={ui.cardSub}>
            What {card.system} did on every item. Open an item for its conversation history and every system’s
            outcome on it.
          </p>
          <SystemItems system={card.system} rows={rows} />
        </GlassPanel>
      </section>
    </main>
  )
}
