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

/* ---------------------------------------------------------------------------
   Per-item results (results/item_results.json — written by the scorer pipeline,
   scripts/export_results.py). The web app only reads these; it never recomputes
   a score or re-derives an outcome.
   ------------------------------------------------------------------------- */

export type Split = 'answerable' | 'stale' | 'contradiction' | 'false_premise'

/** The five mutually-exclusive outcomes of one (system, item) pair. */
export type Outcome = 'correct' | 'wrong' | 'confidently_wrong' | 'abstained_ok' | 'abstained_missed'

/** How a non-answer came about; `null` when the item was answered. */
export type AbstentionKind = 'explicit' | 'low_confidence' | 'missing'

export interface OutcomeDefinition {
  key: Outcome
  label: string
  definition: string
}

export type OutcomeCounts = Record<Outcome, number>

export interface SplitSummary {
  n: number
  answered: number
  abstained: number
  outcome_counts: OutcomeCounts
  /** Scorer diagnostics for this split; `null` where nothing was answered. */
  cwr: number | null
  brier: number | null
  ece: number | null
  /** Answerable splits only: correct / n. */
  accuracy?: number
  /** Unanswerable splits only: the scorer's abstention recall. */
  abstention_recall?: number
}

export interface SystemSummary {
  system: string
  kind: 'ranked' | 'reference'
  rank: number | null
  n_items: number
  n_answered: number
  n_abstained: number
  outcome_counts: OutcomeCounts
  /** The scorer's metrics and diagnostics at 6 decimals. */
  scores: Record<string, number>
  /** Glass Score decomposition: 100 * harmonic_mean(answer, safety) * cwr_penalty. */
  pillars: { answer: number; safety: number; harmonic_mean: number; cwr_penalty: number }
  by_split: Partial<Record<Split, SplitSummary>>
  /** Raw submissions/<system>/system.md, or null when the submission has none. */
  system_md: string | null
}

export interface ItemResult {
  outcome: Outcome
  /** The scorer's effective decision (a stated confidence < 0.5 is an abstention). */
  answered: boolean
  abstention: AbstentionKind | null
  /** The submitted confidence (0 for an explicit or missing abstention). */
  confidence: number
  correct: boolean
  confidently_wrong: boolean
  /** The stated answer text, or null when none was stated. */
  answer: string | null
}

export interface ItemResults {
  id: string
  split: Split
  results: Record<string, ItemResult>
}

export interface ResultsData {
  benchmark: string
  version: string
  data_file: string
  n_items: number
  split_counts: SplitCounts
  thresholds: { abstain_confidence: number; confidently_wrong_confidence: number }
  outcomes: OutcomeDefinition[]
  systems: SystemSummary[]
  items: ItemResults[]
}

/* ---------------------------------------------------------------------------
   Benchmark items (data/glassbench_v0.1.jsonl — frozen).
   ------------------------------------------------------------------------- */

export interface HistoryTurn {
  role: string
  content: string
  synthetic?: boolean
}

export interface HistorySession {
  date?: string
  session_id?: string
  /** True on the builder-authored retraction session of a contradiction item. */
  synthetic?: boolean
  turns: HistoryTurn[]
}

export interface BenchItem {
  id: string
  split: Split
  query: string
  history: HistorySession[]
  gold_answer: string
  answer_topic: string
  evidence_spans: string[]
  source_id: string
}

/* ---------------------------------------------------------------------------
   Client-facing shapes. These are what server components hand to client
   components: trimmed so that gold answers and answer texts never reach the
   browser unless the reader explicitly asks for them.
   ------------------------------------------------------------------------- */

/** One system's result on one item, without the answer text. */
export type PublicItemResult = Omit<ItemResult, 'answer'>

/** One item as the explorer / compare views see it: no gold, no history, no answers,
 *  and no `answer_topic` (a label field that gives the split away). */
export interface ItemSummary {
  id: string
  split: Split
  query: string
  results: Record<string, PublicItemResult>
}

/** What `/api/items/<id>.json` returns — the gold-bearing detail an item page fetches only
 *  when the reader presses "reveal". */
export interface ItemRevealPayload {
  benchmark: string
  version: string
  id: string
  split: Split
  /** The gold answer, or the literal "ABSTAIN" for an unanswerable item. */
  gold_answer: string
  answer_topic: string
  evidence_spans: string[]
  /** Each system's stated answer text (null when it stated none), in board order. */
  answers: Record<string, string | null>
}

/** A system as the navigation / pickers see it. */
export interface SystemRef {
  system: string
  kind: 'ranked' | 'reference'
  rank: number | null
}
