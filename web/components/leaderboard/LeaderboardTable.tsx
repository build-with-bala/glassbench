'use client'

import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import type { Metric, RankedRow } from '../../lib/types'
import { goodness, rampTint } from '../../lib/color-ramp'
import { formatMetric } from '../../lib/format'
import { systemHref } from '../../lib/routes'
import { CountUp } from '../ui/CountUp'
import { CopyButton } from '../ui/CopyButton'
import { MetricTip } from '../ui/MetricTip'

interface Props {
  rows: RankedRow[]
  metrics: Metric[]
  ranges: Record<string, [number, number]>
  primaryKey: string
  headlineKey: string
}

// Each metric is printed at the precision the scorer pipeline published it at (see
// lib/format.ts) — abstention recall is 0.92, not 0.920.
const fmt = (v: unknown, key: string): string => formatMetric(key, v)

const isActivate = (key: string) => key === 'Enter' || key === ' '

export function LeaderboardTable({ rows, metrics, ranges, primaryKey, headlineKey }: Props) {
  const [sortKey, setSortKey] = useState<string>(primaryKey)
  const [expanded, setExpanded] = useState<string | null>(null)

  const sorted = useMemo(() => {
    const metric = metrics.find((m) => m.key === sortKey)
    const dir = metric?.direction === 'lower' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = a[sortKey] as number
      const bv = b[sortKey] as number
      if (typeof av !== 'number' || typeof bv !== 'number') return 0
      return (av - bv) * dir
    })
  }, [rows, metrics, sortKey])

  return (
    <div className="lb-wrap glass-panel">
      <div className="lb-scroll">
        <table className="lb-table">
          <thead>
            <tr>
              <th className="col-rank">#</th>
              <th className="col-system">System</th>
              {metrics.map((m) => (
                <th
                  key={m.key}
                  className={`col-metric ${m.key === headlineKey ? 'is-headline' : ''} ${sortKey === m.key ? 'is-sorted' : ''}`}
                  onClick={() => setSortKey(m.key)}
                  onKeyDown={(e) => {
                    // The metric name inside is focusable; Enter/Space on it sorts.
                    if (isActivate(e.key)) {
                      e.preventDefault()
                      setSortKey(m.key)
                    }
                  }}
                  aria-sort={sortKey === m.key ? (m.direction === 'lower' ? 'ascending' : 'descending') : 'none'}
                  title={`Sort by ${m.label}`}
                >
                  <MetricTip label={m.label} tip={m.tooltip} />
                  <span className="sort-caret" aria-hidden="true">
                    {sortKey === m.key ? (m.direction === 'lower' ? '↑' : '↓') : ''}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const isOpen = expanded === row.system
              return (
                <Fragment key={row.system}>
                  <tr
                    className={`lb-row ${isOpen ? 'is-open' : ''}`}
                    onClick={() => setExpanded(isOpen ? null : row.system)}
                  >
                    {/* The official rank (ties share one) while the board is in ranking order;
                        the row's position once it is re-sorted by another metric. */}
                    <td className="col-rank mono">{sortKey === primaryKey ? row.rank : i + 1}</td>
                    <td className="col-system">
                      <span className="sys-name mono">
                        <Link href={systemHref(row.system)} onClick={(e) => e.stopPropagation()}>
                          {row.system}
                        </Link>
                      </span>
                      <span className="sys-type">{row.type}</span>
                      {/* The whole row toggles on click; this is the same toggle for keyboard
                          and screen-reader users. */}
                      <button
                        type="button"
                        className="row-toggle"
                        aria-expanded={isOpen}
                        aria-controls={`lb-detail-${row.system}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpanded(isOpen ? null : row.system)
                        }}
                      >
                        {isOpen ? 'hide details' : 'details'}
                        <span className="sr-only"> for {row.system}</span>
                      </button>
                    </td>
                    {metrics.map((m) => {
                      const v = row[m.key] as number
                      const g = typeof v === 'number' ? goodness(v, m, ranges[m.key]) : 0
                      const tint = rampTint(g)
                      return (
                        <td
                          key={m.key}
                          className={`col-metric mono tint-${tint} ${m.key === headlineKey ? 'is-headline' : ''}`}
                        >
                          {m.key === 'glass_score' && i < 3 ? (
                            <CountUp value={v} dp={2} />
                          ) : (
                            fmt(v, m.key)
                          )}
                        </td>
                      )
                    })}
                  </tr>
                  {isOpen && (
                    <tr className="lb-detail" id={`lb-detail-${row.system}`}>
                      <td colSpan={metrics.length + 2}>
                        <div className="detail-grid">
                          <p className="detail-desc">{row.description}</p>
                          <div className="detail-meta">
                            <span>
                              answered <b>{row.answered}</b> · abstained <b>{row.abstained}</b>
                            </span>
                            <div className="detail-repro">
                              <code className="mono">{row.reproduce}</code>
                              <CopyButton text={row.reproduce} />
                            </div>
                            <Link href={systemHref(row.system)}>
                              Full system page: per-split breakdown and per-item outcomes{' '}
                              <span aria-hidden="true">→</span>
                            </Link>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="lb-hint">
        Click a column to sort · click a row for details · open a system’s name for its page
      </p>

      <style jsx>{`
        .lb-wrap {
          padding: 0.4rem;
          overflow: hidden;
        }
        .lb-scroll {
          overflow-x: auto;
        }
        .lb-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
        }
        .lb-table th,
        .lb-table td {
          padding: 0.85rem 0.7rem;
          text-align: right;
          white-space: nowrap;
        }
        .lb-table thead th {
          position: sticky;
          top: 0;
          color: var(--muted);
          font-weight: 600;
          font-size: 0.78rem;
          cursor: pointer;
          border-bottom: 1px solid var(--border);
          user-select: none;
          transition: color 0.2s ease;
        }
        .lb-table thead th:hover {
          color: var(--ink);
        }
        .col-rank {
          text-align: center;
          width: 2.4rem;
          color: var(--faint);
        }
        .col-system {
          text-align: left;
        }
        th.is-headline {
          color: var(--cyan);
        }
        th.is-sorted {
          color: var(--ink);
        }
        .sort-caret {
          margin-left: 0.25rem;
          color: var(--cyan);
        }
        .lb-row {
          cursor: pointer;
          transition: background 0.18s ease;
        }
        .lb-row td {
          border-bottom: 1px solid var(--border);
        }
        .lb-row:hover {
          background: var(--glass-bg-2);
        }
        .lb-row.is-open {
          background: var(--glass-bg-2);
        }
        .sys-name {
          display: block;
          color: var(--ink);
          font-weight: 600;
          font-size: 0.95rem;
        }
        .sys-type {
          display: block;
          color: var(--faint);
          font-size: 0.72rem;
          max-width: 30ch;
          white-space: normal;
          line-height: 1.3;
          margin-top: 0.15rem;
        }
        td.col-metric {
          color: var(--ink);
          border-radius: 6px;
        }
        td.is-headline {
          font-weight: 700;
        }
        td.tint-good {
          color: var(--good);
          background: var(--tint-good);
        }
        td.tint-warn {
          color: var(--warn);
          background: var(--tint-warn);
        }
        td.tint-danger {
          color: var(--danger);
          background: var(--tint-danger);
        }
        .row-toggle {
          margin-top: 0.35rem;
          padding: 0.1rem 0.5rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: transparent;
          color: var(--muted);
          font-family: var(--mono);
          font-size: 0.7rem;
          cursor: pointer;
        }
        .row-toggle:hover {
          color: var(--ink);
          border-color: var(--cyan);
        }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          margin: -1px;
          padding: 0;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
        .lb-detail td {
          padding: 0 1rem 1.1rem;
          background: var(--glass-bg-2);
        }
        .detail-grid {
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
          padding-top: 0.3rem;
        }
        .detail-desc {
          margin: 0;
          color: var(--muted);
          font-size: 0.88rem;
          line-height: 1.5;
          max-width: 80ch;
          white-space: normal;
          text-align: left;
        }
        .detail-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem 2rem;
          align-items: center;
          color: var(--faint);
          font-size: 0.82rem;
        }
        .detail-meta b {
          color: var(--ink);
        }
        .detail-repro {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }
        .detail-repro code {
          color: var(--cyan);
          font-size: 0.82rem;
        }
        .lb-hint {
          margin: 0.7rem 0.6rem 0.4rem;
          color: var(--faint);
          font-size: 0.76rem;
          text-align: right;
        }
      `}</style>
    </div>
  )
}
