import type { MetricDirection } from './types'

/** Map a raw metric value to goodness in 0..1 (1 = best), respecting whether the
 *  metric is higher- or lower-is-better and its display range. */
export function goodness(
  value: number,
  metric: { direction: MetricDirection },
  range: [number, number],
): number {
  const [lo, hi] = range
  const t = hi === lo ? 0 : (value - lo) / (hi - lo)
  const c = Math.min(1, Math.max(0, t))
  return metric.direction === 'lower' ? 1 - c : c
}

export type Tint = 'good' | 'warn' | 'danger'

/** Three-stop ramp matching the legacy app.js thresholds. */
export function rampTint(g: number): Tint {
  if (g >= 0.66) return 'good'
  if (g >= 0.33) return 'warn'
  return 'danger'
}
