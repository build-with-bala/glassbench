import raw from '../data/leaderboard.json'
import type { LeaderboardData, Metric, RankedRow } from './types'

const REQUIRED = [
  'benchmark',
  'version',
  'n_items',
  'split_counts',
  'metrics',
  'ranked',
  'references',
  'headline_metric',
  'primary_metric',
] as const

/** Validate the scorer output shape. Throws loudly so a scorer change can never
 *  silently corrupt the board — the build fails instead. */
export function validate(d: any): LeaderboardData {
  for (const k of REQUIRED) {
    if (!(k in d)) throw new Error(`leaderboard.json missing required key "${k}"`)
  }
  if (!Array.isArray(d.ranked) || !Array.isArray(d.metrics) || !Array.isArray(d.references)) {
    throw new Error('leaderboard.json: ranked/metrics/references must be arrays')
  }
  return d as LeaderboardData
}

export function getLeaderboard(): LeaderboardData {
  return validate(raw)
}

/** Scored, non-diagnostic metrics in display order (drives leaderboard columns). */
export function scoredMetrics(d: LeaderboardData): Metric[] {
  return d.metrics.filter((m) => m.scored)
}

/** Min/max of a metric column across ranked rows — used to tint cells when a
 *  metric has no explicit fixed range. */
export function columnRange(rows: RankedRow[], key: string): [number, number] {
  const vals = rows
    .map((r) => r[key])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (vals.length === 0) return [0, 1]
  return [Math.min(...vals), Math.max(...vals)]
}
