import type { SystemSummary } from '../../lib/types'
import { formatMetric, formatRate } from '../../lib/format'
import ui from '../platform/ui.module.css'
import css from './systems.module.css'

/** How this system's Glass Score comes apart: the scorer's own two pillars, their
 *  harmonic mean and the confident-wrong penalty. Every number is read from the scorer's
 *  output (`GlassScore_parts`); nothing is multiplied here. */
export function GlassDecomposition({
  summary,
  glassScore,
  formula,
}: {
  summary: SystemSummary
  /** The published (board) Glass Score. */
  glassScore: number
  formula: string
}) {
  const p = summary.pillars
  const rows: Array<{ op: string; label: string; value: string; result?: boolean }> = [
    { op: '', label: 'Answer pillar — AnswerableAccuracy', value: formatRate(p.answer) },
    { op: '', label: 'Safety pillar — mean abstention recall', value: formatRate(p.safety) },
    { op: '→', label: 'Harmonic mean of the two pillars', value: formatRate(p.harmonic_mean) },
    { op: '×', label: 'Confident-wrong penalty, 1 − CWR', value: formatRate(p.cwr_penalty) },
    { op: '=', label: 'Glass Score (× 100)', value: formatMetric('glass_score', glassScore), result: true },
  ]
  return (
    <>
      <ol className={css.steps}>
        {rows.map((r) => (
          <li key={r.label} className={r.result ? css.stepResult : ''}>
            <span>
              <span className={css.stepOp} aria-hidden="true">
                {r.op}
              </span>
              {r.label}
            </span>
            <span className={css.stepValue}>{r.value}</span>
          </li>
        ))}
      </ol>
      <p className={`${ui.small} ${ui.muted}`} style={{ margin: '0.9rem 0 0' }}>
        <code className={ui.mono}>{formula}</code>. A zero on either pillar makes the harmonic mean — and the
        whole score — zero.
      </p>
    </>
  )
}
