'use client'

import Link from 'next/link'
import { useId, useMemo, useState } from 'react'
import type { Outcome, PublicItemResult, Split } from '../../lib/types'
import { OUTCOME_KEYS, OUTCOME_STYLE, SPLIT_KEYS, SPLIT_LABEL, formatConfidence } from '../../lib/outcomes'
import { itemHref } from '../../lib/routes'
import { OutcomeBadge, SplitBadge } from '../platform/Badges'
import ui from '../platform/ui.module.css'
import css from './systems.module.css'

export interface SystemItemRow extends PublicItemResult {
  id: string
  split: Split
  query: string
}

/** One system's outcome on every item, filterable by split and by outcome. Rows link to
 *  the item pages, where the history (and, on request, the gold answer) lives. */
export function SystemItems({ system, rows }: { system: string; rows: SystemItemRow[] }) {
  const [split, setSplit] = useState<Split | 'all'>('all')
  const [outcome, setOutcome] = useState<Outcome | 'all'>('all')
  const splitId = useId()
  const outcomeId = useId()

  const shown = useMemo(
    () => rows.filter((r) => (split === 'all' || r.split === split) && (outcome === 'all' || r.outcome === outcome)),
    [rows, split, outcome],
  )
  const filtered = split !== 'all' || outcome !== 'all'

  return (
    <div>
      <div className={ui.controls}>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={splitId}>
            Split
          </label>
          <select
            id={splitId}
            className={ui.select}
            value={split}
            onChange={(e) => setSplit(e.target.value as Split | 'all')}
          >
            <option value="all">All splits</option>
            {SPLIT_KEYS.map((s) => (
              <option key={s} value={s}>
                {SPLIT_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={outcomeId}>
            Outcome
          </label>
          <select
            id={outcomeId}
            className={ui.select}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as Outcome | 'all')}
          >
            <option value="all">All outcomes</option>
            {OUTCOME_KEYS.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_STYLE[o].label}
              </option>
            ))}
          </select>
        </div>
        <p className={ui.status} role="status" aria-live="polite">
          {shown.length} of {rows.length} items
        </p>
      </div>

      {shown.length === 0 ? (
        <div className={ui.empty}>
          <p>
            {system} has no items with this combination of split and outcome.
          </p>
          {filtered ? (
            <button
              type="button"
              className={ui.button}
              onClick={() => {
                setSplit('all')
                setOutcome('all')
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : (
        <ul className={css.items}>
          {shown.map((r) => (
            <li key={r.id} className={css.item}>
              <div className={css.itemMain}>
                <Link href={itemHref(r.id)} className={css.itemId}>
                  {r.id}
                </Link>
                <p className={css.itemQuery}>{r.query}</p>
              </div>
              <div className={css.itemMeta}>
                <SplitBadge split={r.split} />
                <OutcomeBadge outcome={r.outcome} />
                <span className={css.conf}>
                  <span className={ui.srOnly}>confidence </span>
                  <span aria-hidden="true">conf </span>
                  {formatConfidence(r)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
