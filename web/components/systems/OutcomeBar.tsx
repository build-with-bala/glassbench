import type { Outcome, OutcomeCounts } from '../../lib/types'
import { OUTCOME_STYLE } from '../../lib/outcomes'
import { OutcomeLegend } from '../platform/Badges'
import css from './systems.module.css'

// Right calls first, then errors by severity, then missed answers.
const ORDER: Outcome[] = ['correct', 'abstained_ok', 'wrong', 'confidently_wrong', 'abstained_missed']

const SEG: Record<Outcome, string> = {
  correct: css.segCorrect,
  abstained_ok: css.segAbstainedOk,
  wrong: css.segWrong,
  confidently_wrong: css.segConfidentlyWrong,
  abstained_missed: css.segAbstainedMissed,
}

/** How a system's items split across the five outcomes. The bar is decorative; the
 *  legend underneath carries the same counts as text. */
export function OutcomeBar({ counts, legend = true }: { counts: OutcomeCounts; legend?: boolean }) {
  const total = ORDER.reduce((n, o) => n + counts[o], 0)
  const summary = ORDER.map((o) => `${OUTCOME_STYLE[o].label} ${counts[o]}`).join(', ')
  return (
    <div className={css.barWrap}>
      <div className={css.bar} role="img" aria-label={`Outcomes over ${total} items: ${summary}`}>
        {ORDER.filter((o) => counts[o] > 0).map((o) => (
          <span key={o} className={`${css.seg} ${SEG[o]}`} style={{ flex: `${counts[o]} 0 0` }} />
        ))}
      </div>
      {legend ? <OutcomeLegend outcomes={ORDER} counts={counts} /> : null}
    </div>
  )
}
