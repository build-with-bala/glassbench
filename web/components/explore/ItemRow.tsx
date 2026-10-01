import Link from 'next/link'
import type { ItemSummary } from '../../lib/types'
import { itemHref } from '../../lib/routes'
import { OutcomeCell, SplitBadge } from '../platform/Badges'
import css from './explore.module.css'

/** One item in the explorer list: id, split, query, and one outcome cell per system in
 *  board order. No hooks — rendered by both the static fallback and the live browser. */
export function ItemRow({
  item,
  systems,
  activeSystem,
}: {
  item: Pick<ItemSummary, 'id' | 'split' | 'query'> & Partial<Pick<ItemSummary, 'results'>>
  /** Systems to draw an outcome cell for, in board order. Empty = no outcome strip (the
   *  static fallback list stays light: the cells arrive with the live browser). */
  systems: readonly string[]
  activeSystem?: string
}) {
  const results = item.results
  return (
    <li className={css.row}>
      <div className={css.rowMain}>
        <div className={css.rowTop}>
          <Link href={itemHref(item.id)} className={css.rowId}>
            {item.id}
          </Link>
          <SplitBadge split={item.split} />
        </div>
        <p className={css.rowQuery}>{item.query}</p>
      </div>
      {results && systems.length ? (
        <ul className={css.strip} aria-label="Outcome per system, in board order">
          {systems.map((s) => (
            <li key={s}>
              <OutcomeCell system={s} result={results[s]} active={s === activeSystem} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/** The key that makes the outcome strips readable: which cell is which system. */
export function SystemOrder({ systems, activeSystem }: { systems: readonly string[]; activeSystem?: string }) {
  return (
    <ol className={css.order} aria-label="Order of the outcome cells in each row">
      {systems.map((s) => (
        <li key={s} className={s === activeSystem ? css.orderActive : undefined}>
          {s}
        </li>
      ))}
    </ol>
  )
}
