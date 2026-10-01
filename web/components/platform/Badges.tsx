import type { Outcome, PublicItemResult, Split } from '../../lib/types'
import { OUTCOME_STYLE, SPLIT_LABEL, describeResult } from '../../lib/outcomes'
import ui from './ui.module.css'

const TINT_CLASS = {
  good: ui.tintGood,
  warn: ui.tintWarn,
  danger: ui.tintDanger,
  neutral: ui.tintNeutral,
} as const

export function outcomeTintClass(outcome: Outcome): string {
  return TINT_CLASS[OUTCOME_STYLE[outcome].tint]
}

/** Outcome as a labelled pill. The glyph differs per outcome, so the meaning never
 *  depends on colour alone. */
export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const s = OUTCOME_STYLE[outcome]
  return (
    <span className={`${ui.badge} ${outcomeTintClass(outcome)}`}>
      <span className={ui.badgeGlyph} aria-hidden="true">
        {s.glyph}
      </span>
      {s.label}
    </span>
  )
}

/** Outcome as a single glyph cell, for dense per-system strips. Carries its full
 *  meaning as an accessible name and a hover title. */
export function OutcomeCell({
  system,
  result,
  active = false,
}: {
  system: string
  result: PublicItemResult
  active?: boolean
}) {
  const label = `${system}: ${describeResult(result)}`
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`${ui.cell} ${outcomeTintClass(result.outcome)} ${active ? ui.cellActive : ''}`}
    >
      {OUTCOME_STYLE[result.outcome].glyph}
    </span>
  )
}

export function SplitBadge({ split }: { split: Split }) {
  return <span className={ui.badge}>{SPLIT_LABEL[split]}</span>
}

export function KindBadge({ kind, rank }: { kind: 'ranked' | 'reference'; rank: number | null }) {
  if (kind === 'reference') return <span className={`${ui.badge} ${ui.tintWarn}`}>reference · not ranked</span>
  return <span className={ui.badge}>rank {rank}</span>
}

/** The outcome vocabulary as a legend: glyph, label and (optionally) a count. */
export function OutcomeLegend({
  outcomes,
  counts,
}: {
  outcomes: readonly Outcome[]
  counts?: Partial<Record<Outcome, number>>
}) {
  return (
    <ul className={ui.legend}>
      {outcomes.map((o) => (
        <li key={o}>
          <span className={`${ui.badge} ${outcomeTintClass(o)}`}>
            <span className={ui.badgeGlyph} aria-hidden="true">
              {OUTCOME_STYLE[o].glyph}
            </span>
            {OUTCOME_STYLE[o].label}
            {counts ? <b>{counts[o] ?? 0}</b> : null}
          </span>
        </li>
      ))}
    </ul>
  )
}
