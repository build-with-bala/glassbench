import type { Metric } from '../../lib/types'
import { goodness, rampTint } from '../../lib/color-ramp'
import { formatMetric } from '../../lib/format'
import { MetricTip } from '../ui/MetricTip'
import ui from '../platform/ui.module.css'
import css from './systems.module.css'

const TINT = { good: ui.tintGood, warn: ui.tintWarn, danger: ui.tintDanger } as const

/** Every metric of one system: its published value, the metric's own tooltip, and the
 *  same goodness tint the leaderboard uses (relative to the ranked field). */
export function MetricTiles({
  metrics,
  values,
  ranges,
}: {
  metrics: Metric[]
  values: Record<string, unknown>
  ranges: Record<string, [number, number]>
}) {
  return (
    <ul className={css.tiles}>
      {metrics.map((m) => {
        const v = values[m.key]
        const tint = typeof v === 'number' ? TINT[rampTint(goodness(v, m, ranges[m.key]))] : ''
        return (
          <li key={m.key} className={`${css.tile} ${m.primary ? css.tilePrimary : ''}`}>
            <span className={`${css.tileValue} ${tint}`}>{formatMetric(m.key, v)}</span>
            <MetricTip label={m.label} tip={m.tooltip} />
            <span className={css.tileHint}>
              {m.direction === 'lower' ? 'lower is better' : 'higher is better'}
              {m.diagnostic ? ' · diagnostic' : ''}
            </span>
            {m.primary ? <span className={css.tileFlag}>ranking metric</span> : null}
            {m.headline ? <span className={css.tileFlag}>headline metric</span> : null}
          </li>
        )
      })}
    </ul>
  )
}
