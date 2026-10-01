import type { Metric } from './types'

/* Number formatting for scorer values. Client-safe (imports no data).
 *
 * The scorer pipeline publishes each leaderboard metric at a fixed display precision
 * (scripts/gen_leaderboard.py `_JSON_PRECISION`, the same format specs LEADERBOARD.md
 * uses). The site prints exactly those digits — never more, which would imply precision
 * the published number does not have (0.92 is not 0.920). test/format.test.ts checks this
 * table against the real leaderboard.json. */

export const METRIC_DECIMALS: Record<string, number> = {
  glass_score: 2,
  cwr: 3,
  aurc_norm: 3,
  abst_rec_contradiction: 2,
  abst_rec_false_premise: 2,
  ece: 3,
  brier: 3,
  cwr_macro: 3,
  ece_macro: 3,
  brier_macro: 3,
  answerable_accuracy: 3,
}

const COUNT_KEYS = new Set(['answered', 'abstained', 'rank'])

export function metricDecimals(key: string): number {
  if (COUNT_KEYS.has(key)) return 0
  return METRIC_DECIMALS[key] ?? 3
}

/** A published metric value at its published precision; an em dash when absent. */
export function formatMetric(key: string, value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return value.toFixed(metricDecimals(key))
}

/** A 0..1 rate from the per-item export (6-decimal scorer output) at 3 decimals. */
export function formatRate(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return value.toFixed(3)
}

export type Verdict = 'a' | 'b' | 'tie'

export interface MetricDelta {
  metric: Metric
  a: number
  b: number
  /** b − a, rounded to the metric's published precision (so it matches the digits shown). */
  delta: number
  /** Which side this metric favours, respecting higher/lower-is-better. */
  better: Verdict
}

/** Difference between two *published* values of one metric. This is presentation — a
 *  subtraction of two numbers the scorer already published — not a score. */
export function metricDelta(metric: Metric, a: number, b: number): MetricDelta {
  const dp = metricDecimals(metric.key)
  const delta = Number((b - a).toFixed(dp)) + 0 // + 0 turns -0 into 0
  let better: Verdict = 'tie'
  if (delta !== 0) {
    const bIsHigher = delta > 0
    better = (metric.direction === 'higher') === bIsHigher ? 'b' : 'a'
  }
  return { metric, a, b, delta, better }
}

/** A signed delta at the metric's precision: "+0.448", "−29.14", "0.000". */
export function formatDelta(key: string, delta: number): string {
  const dp = metricDecimals(key)
  const abs = Math.abs(delta).toFixed(dp)
  if (Number(abs) === 0) return abs
  return `${delta > 0 ? '+' : '−'}${abs}`
}

/** "58 / 96" style share. */
export function formatShare(n: number, total: number): string {
  return `${n} / ${total}`
}
