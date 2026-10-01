import type { Outcome, Split, SystemSummary } from '../../lib/types'
import { OUTCOME_STYLE, SPLIT_KEYS, SPLIT_LABEL, UNANSWERABLE_SPLITS } from '../../lib/outcomes'
import { formatRate } from '../../lib/format'
import { outcomeTintClass } from '../platform/Badges'
import ui from '../platform/ui.module.css'
import css from './systems.module.css'

const OUTCOME_COLS: Outcome[] = ['correct', 'wrong', 'confidently_wrong', 'abstained_ok', 'abstained_missed']

// Column headers: two short words each, so the table fits without scrolling on a desktop.
const OUTCOME_SHORT: Record<Outcome, string> = {
  correct: 'Correct',
  wrong: 'Wrong',
  confidently_wrong: 'Confidently wrong',
  abstained_ok: 'Abstained, right call',
  abstained_missed: 'Abstained, missed',
}

/** Per-split breakdown of one system, straight from the scorer's per-item export:
 *  routing counts, outcome counts, the split's own rate (accuracy on the answerable
 *  splits, abstention recall on the unanswerable ones) and its confidently-wrong rate. */
export function SplitBreakdown({ summary }: { summary: SystemSummary }) {
  const splits = SPLIT_KEYS.filter((s) => summary.by_split[s])
  return (
    <div className={ui.tableScroll} role="region" aria-label="Per-split breakdown" tabIndex={0}>
      <table className={`${ui.table} ${css.splitTable}`}>
        <caption className={ui.srOnly}>
          Per-split breakdown for {summary.system}: items, answered, abstained, outcome counts and rates.
        </caption>
        <thead>
          <tr>
            <th scope="col">Split</th>
            <th scope="col" className={ui.num}>
              Items
            </th>
            <th scope="col" className={ui.num}>
              Answered
            </th>
            <th scope="col" className={ui.num}>
              Abstained
            </th>
            {OUTCOME_COLS.map((o) => (
              <th key={o} scope="col" className={ui.num}>
                <span aria-hidden="true">{OUTCOME_STYLE[o].glyph} </span>
                {OUTCOME_SHORT[o]}
              </th>
            ))}
            <th scope="col" className={ui.num}>
              Split rate
            </th>
            <th scope="col" className={ui.num}>
              Split CWR
            </th>
          </tr>
        </thead>
        <tbody>
          {splits.map((split: Split) => {
            const s = summary.by_split[split]!
            const unanswerable = UNANSWERABLE_SPLITS.includes(split)
            const rate = unanswerable ? s.abstention_recall : s.accuracy
            return (
              <tr key={split}>
                <th scope="row" className={ui.mono}>
                  {SPLIT_LABEL[split]}
                </th>
                <td className={ui.num}>{s.n}</td>
                <td className={ui.num}>{s.answered}</td>
                <td className={ui.num}>{s.abstained}</td>
                {OUTCOME_COLS.map((o) => {
                  const n = s.outcome_counts[o]
                  // An outcome that cannot occur on this split reads as a dash, not a 0.
                  const impossible = unanswerable
                    ? o === 'correct' || o === 'abstained_missed'
                    : o === 'abstained_ok'
                  return (
                    <td key={o} className={`${ui.num} ${n > 0 ? outcomeTintClass(o) : ''}`}>
                      {impossible ? <span aria-label="not applicable">—</span> : n}
                    </td>
                  )
                })}
                <td className={ui.num}>
                  {formatRate(rate)}
                  <span className={css.rateKind}>{unanswerable ? 'abstention recall' : 'accuracy'}</span>
                </td>
                <td className={ui.num}>{formatRate(s.cwr)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
