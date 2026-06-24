export type MetricDirection = 'higher' | 'lower'

export interface Metric {
  key: string
  label: string
  direction: MetricDirection
  scored: boolean
  primary?: boolean
  headline?: boolean
  diagnostic?: boolean
  range?: [number, number]
  tooltip: string
}

export interface RankedRow {
  rank: number
  system: string
  glass_score: number
  cwr: number
  aurc_norm: number
  abst_rec_contradiction: number
  abst_rec_false_premise: number
  ece: number
  brier: number
  cwr_macro: number
  ece_macro: number
  brier_macro: number
  answerable_accuracy: number
  answered: number
  abstained: number
  type: string
  description: string
  reproduce: string
  [k: string]: unknown
}

// Defined explicitly (not via Omit<RankedRow>) — Omit over a type carrying a
// string index signature collapses the named fields back into `unknown`.
export interface ReferenceRow {
  system: string
  glass_score: number
  cwr: number
  aurc_norm: number
  abst_rec_contradiction: number
  abst_rec_false_premise: number
  ece: number
  brier: number
  answerable_accuracy: number
  answered: number
  abstained: number
  what_it_is: string
  excluded_reason: string
  [k: string]: unknown
}

export interface SplitCounts {
  answerable: number
  stale: number
  contradiction: number
  false_premise: number
}

export interface LeaderboardData {
  benchmark: string
  version: string
  data_file: string
  n_items: number
  split_counts: SplitCounts
  primary_metric: string
  primary_metric_label: string
  primary_metric_range: [number, number]
  sort: 'asc' | 'desc'
  headline_metric: string
  headline_metric_label: string
  glass_score_formula: string
  metrics: Metric[]
  ranked: RankedRow[]
  references: ReferenceRow[]
}
