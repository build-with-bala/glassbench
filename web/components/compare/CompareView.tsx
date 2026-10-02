'use client'

import Link from 'next/link'
import { useEffect, useId, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { ItemSummary, Metric, PublicItemResult, SystemRef } from '../../lib/types'
import { formatConfidence } from '../../lib/outcomes'
import { agreementSummary, disagreements, matchesMode } from '../../lib/explore'
import { formatDelta, formatMetric, metricDelta } from '../../lib/format'
import {
  compareQuery,
  itemHref,
  parseCompareState,
  systemHref,
  type CompareState,
  type DisagreementMode,
} from '../../lib/routes'
import { CopyButton } from '../ui/CopyButton'
import { Select } from '../ui/Select'
import { MetricTip } from '../ui/MetricTip'
import { OutcomeBadge, SplitBadge } from '../platform/Badges'
import ui from '../platform/ui.module.css'
import css from './compare.module.css'
import { boardStore } from '../world/store'

export interface CompareSystem extends SystemRef {
  /** Published board values by metric key (plus answered / abstained). */
  values: Record<string, number>
}

function standing(s: CompareSystem): string {
  return s.kind === 'ranked' ? `rank ${s.rank}` : 'reference · not ranked'
}

function Side({ name, item, result }: { name: string; item: string; result: PublicItemResult }) {
  return (
    <div
      className={css.pairSide}
      // pointing at one side shows that system's whole pattern, with this item singled out
      onPointerEnter={(e) => {
        if (e.pointerType !== 'touch') boardStore.setPreview({ system: name, focus: item })
      }}
      onPointerLeave={() => boardStore.setPreview({ focus: item })}
    >
      <span className={css.pairName}>{name}</span>
      <OutcomeBadge outcome={result.outcome} />
      <span className={css.conf}>
        <span className={ui.srOnly}>confidence </span>
        <span aria-hidden="true">conf </span>
        {formatConfidence(result)}
      </span>
    </div>
  )
}

/** Two systems side by side: every published metric with its delta, and the items on
 *  which the scorer gave them different outcomes. The pair lives in the query string
 *  (?a=…&b=…), so a comparison is a link. */
export function CompareView({
  systems,
  metrics,
  items,
}: {
  systems: CompareSystem[]
  metrics: Metric[]
  items: ItemSummary[]
}) {
  const names = useMemo(() => systems.map((s) => s.system), [systems])
  const searchParams = useSearchParams()
  const urlQuery = searchParams.toString()
  const [state, setState] = useState<CompareState>(() => parseCompareState(searchParams, names))
  const [shareUrl, setShareUrl] = useState('')

  // URL → state (back/forward, links into /compare?a=…&b=…).
  useEffect(() => {
    const fromUrl = parseCompareState(new URLSearchParams(urlQuery), names)
    setState((prev) => (compareQuery(prev) === compareQuery(fromUrl) ? prev : fromUrl))
  }, [urlQuery, names])

  // State → URL, without adding history entries.
  useEffect(() => {
    const query = compareQuery(state)
    if (query !== window.location.search) {
      window.history.replaceState(null, '', `${window.location.pathname}${query}`)
    }
    setShareUrl(`${window.location.origin}${window.location.pathname}${query}`)
  }, [state])

  const a = systems.find((s) => s.system === state.a)
  const b = systems.find((s) => s.system === state.b)

  const aId = useId()
  const bId = useId()
  const modeName = useId()

  const diff = useMemo(() => (a && b ? disagreements(items, a.system, b.system) : []), [items, a, b])
  const summary = useMemo(
    () => (a && b ? agreementSummary(items, a.system, b.system) : null),
    [items, a, b],
  )
  const shown = useMemo(() => diff.filter((d) => matchesMode(d, state.show)), [diff, state.show])

  // The board shows system A's outcomes and keeps lit only the items listed below —
  // the ones where the two systems disagree (in the chosen group).
  const aName = a?.system
  useEffect(() => {
    if (!aName) return
    boardStore.setBase({ system: aName, highlight: { items: shown.map((d) => d.item.id) } })
  }, [aName, shown])
  useEffect(() => () => boardStore.resetBase(), [])

  if (!a || !b || !summary) {
    return (
      <div className={ui.empty}>
        <p>Comparing needs at least two scored systems.</p>
      </div>
    )
  }

  // Picking the system already on the other side swaps the two, so A and B never match.
  const pick = (side: 'a' | 'b', name: string) =>
    setState((s) => {
      if (side === 'a') return name === s.b ? { ...s, a: s.b, b: s.a } : { ...s, a: name }
      return name === s.a ? { ...s, a: s.b, b: s.a } : { ...s, b: name }
    })

  const modes: Array<{ key: DisagreementMode; label: string; n: number }> = [
    { key: 'all', label: 'All differences', n: summary.different },
    { key: 'a_right', label: `${a.system} right, ${b.system} not`, n: summary.aRight },
    { key: 'b_right', label: `${b.system} right, ${a.system} not`, n: summary.bRight },
    { key: 'routing', label: 'One answered, one abstained', n: summary.routing },
  ]

  return (
    <div className={ui.stack}>
      <section aria-label="Systems to compare">
        <div className={css.pickers}>
          <div className={ui.field}>
            <span className={ui.label} id={aId}>
              System A
            </span>
            <Select
              labelledBy={aId}
              value={a.system}
              onChange={(name) => pick('a', name)}
              options={systems.map((s) => ({ value: s.system, label: s.system, hint: `— ${standing(s)}` }))}
            />
          </div>
          <button
            type="button"
            className={ui.button}
            onClick={() => setState((s) => ({ ...s, a: s.b, b: s.a }))}
            aria-label={`Swap: make ${b.system} system A and ${a.system} system B`}
          >
            <span aria-hidden="true">⇄</span> Swap
          </button>
          <div className={ui.field}>
            <span className={ui.label} id={bId}>
              System B
            </span>
            <Select
              labelledBy={bId}
              value={b.system}
              onChange={(name) => pick('b', name)}
              options={systems.map((s) => ({ value: s.system, label: s.system, hint: `— ${standing(s)}` }))}
            />
          </div>
        </div>
        <div className={ui.buttonRow} style={{ marginTop: '0.8rem' }}>
          <p className={ui.status} role="status" aria-live="polite">
            Comparing {a.system} (A) with {b.system} (B).
          </p>
          {shareUrl ? <CopyButton text={shareUrl} label="copy link to this comparison" /> : null}
        </div>
      </section>

      <section aria-labelledby="cmp-metrics-h">
        <h2 id="cmp-metrics-h" className={ui.cardTitle}>
          Metrics side by side
        </h2>
        <p className={ui.cardSub}>
          Δ is B − A on the published values. The better value in each row is in bold, respecting the metric’s
          direction (lower CWR is better; higher Glass Score is better).
        </p>
        <div className={ui.tableScroll} role="region" aria-label="Metrics side by side" tabIndex={0}>
          <table className={`${ui.table} ${css.metricTable}`}>
            <caption className={ui.srOnly}>
              Metrics of {a.system} and {b.system}, with the difference B minus A
            </caption>
            <thead>
              <tr>
                <th scope="col">Metric</th>
                <th scope="col" className={ui.num}>
                  <span className={css.side}>A</span>{' '}
                  <Link className={`${ui.link} ${css.headName}`} href={systemHref(a.system)}>
                    {a.system}
                  </Link>
                </th>
                <th scope="col" className={ui.num}>
                  <span className={css.side}>B</span>{' '}
                  <Link className={`${ui.link} ${css.headName}`} href={systemHref(b.system)}>
                    {b.system}
                  </Link>
                </th>
                <th scope="col" className={ui.num}>
                  Δ (B − A)
                </th>
                <th scope="col" className={css.verdictCol}>
                  Better
                </th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => {
                const d = metricDelta(m, a.values[m.key], b.values[m.key])
                const deltaClass = d.better === 'tie' ? '' : d.better === 'b' ? css.deltaGood : css.deltaBad
                return (
                  <tr key={m.key}>
                    <th scope="row">
                      <MetricTip label={m.label} tip={m.tooltip} />
                      {m.diagnostic ? <span className={`${ui.small} ${ui.faint}`}> · diagnostic</span> : null}
                    </th>
                    <td className={`${ui.num} ${d.better === 'a' ? css.better : ''}`}>{formatMetric(m.key, d.a)}</td>
                    <td className={`${ui.num} ${d.better === 'b' ? css.better : ''}`}>{formatMetric(m.key, d.b)}</td>
                    <td className={`${ui.num} ${deltaClass}`}>{formatDelta(m.key, d.delta)}</td>
                    <td className={`${css.verdict} ${css.verdictCol}`}>
                      {d.better === 'tie' ? 'tie' : d.better === 'a' ? `A · ${a.system}` : `B · ${b.system}`}
                    </td>
                  </tr>
                )
              })}
              {(['answered', 'abstained'] as const).map((key) => (
                <tr key={key}>
                  <th scope="row" className={ui.mono} style={{ fontSize: '0.78rem', fontWeight: 400 }}>
                    {key} (of {items.length})
                  </th>
                  <td className={ui.num}>{a.values[key]}</td>
                  <td className={ui.num}>{b.values[key]}</td>
                  <td className={ui.num}>{formatDelta(key, b.values[key] - a.values[key])}</td>
                  <td className={`${css.verdict} ${css.verdictCol}`}>
                    <span className={ui.faint}>routing, not a score</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="cmp-items-h">
        <h2 id="cmp-items-h" className={ui.cardTitle}>
          Where they disagree
        </h2>
        <p className={ui.cardSub}>
          Items on which the scorer gave the two systems different outcomes. A “right” call is a correct answer, or
          an abstention on an unanswerable item.
        </p>
        <ul className={css.tally}>
          <li>
            <span className={css.tallyN}>{summary.same}</span>
            <span className={css.tallyLabel}>same outcome</span>
          </li>
          <li>
            <span className={css.tallyN}>{summary.different}</span>
            <span className={css.tallyLabel}>different outcome</span>
          </li>
          <li>
            <span className={css.tallyN}>{summary.aRight}</span>
            <span className={css.tallyLabel}>A right, B not</span>
          </li>
          <li>
            <span className={css.tallyN}>{summary.bRight}</span>
            <span className={css.tallyLabel}>B right, A not</span>
          </li>
        </ul>

        <fieldset className={ui.segments}>
          <legend className={ui.label}>Show</legend>
          {modes.map((m) => (
            <label key={m.key} className={ui.segment}>
              <input
                type="radio"
                name={modeName}
                value={m.key}
                checked={state.show === m.key}
                onChange={() => setState((s) => ({ ...s, show: m.key }))}
              />
              <span>
                {m.label} ({m.n})
              </span>
            </label>
          ))}
        </fieldset>

        <p className={ui.status} role="status" aria-live="polite" style={{ marginTop: '0.8rem' }}>
          Showing {shown.length} of {diff.length} items where {a.system} and {b.system} differ.
        </p>

        {shown.length === 0 ? (
          <div className={ui.empty}>
            <p>
              {diff.length === 0
                ? `${a.system} and ${b.system} got the same outcome on all ${items.length} items.`
                : 'No items in this group.'}
            </p>
            {diff.length > 0 && state.show !== 'all' ? (
              <button type="button" className={ui.button} onClick={() => setState((s) => ({ ...s, show: 'all' }))}>
                Show all differences
              </button>
            ) : null}
          </div>
        ) : (
          <ul className={css.diffs}>
            {shown.map((d) => (
              <li
                key={d.item.id}
                className={css.diff}
                onPointerEnter={(e) => {
                  if (e.pointerType !== 'touch') boardStore.setPreview({ focus: d.item.id })
                }}
                onPointerLeave={() => boardStore.setPreview(null)}
                onFocus={() => boardStore.setPreview({ focus: d.item.id })}
                onBlur={() => boardStore.setPreview(null)}
              >
                <div className={css.diffTop}>
                  <Link href={itemHref(d.item.id)} className={css.diffId}>
                    {d.item.id}
                  </Link>
                  <SplitBadge split={d.item.split} />
                </div>
                <p className={css.diffQuery}>{d.item.query}</p>
                <div className={css.pair}>
                  <Side name={a.system} item={d.item.id} result={d.a} />
                  <Side name={b.system} item={d.item.id} result={d.b} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
