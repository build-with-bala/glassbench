import { OUTCOME_KEYS } from './outcomes'
import type { AbstentionKind, Outcome, OutcomeCounts, PublicItemResult, Split } from './types'

/* Client-safe shape of what the glass board shows: every item, every system, and each
 * system's scorer-assigned outcome and submitted confidence per item. Built on the
 * server by lib/world-data.ts; nothing in here is computed on the site. */

export interface BoardSystem {
  name: string
  kind: 'ranked' | 'reference'
  rank: number | null
  /** Published board values (leaderboard.json), printed with lib/format.ts. */
  glass_score: number
  cwr: number
  answered: number
  abstained: number
  /** The pipeline's per-outcome item counts for this system. */
  counts: OutcomeCounts
}

export interface BoardItem {
  id: string
  split: Split
  query: string
}

export interface BoardSystemResults {
  /** Index into OUTCOME_KEYS, per item, in `items` order. */
  outcome: number[]
  /** The submitted confidence, per item. */
  confidence: number[]
  /** 0 answered · 1 explicit abstention · 2 confidence below 0.5 · 3 item omitted. */
  abstention: number[]
}

export interface BoardData {
  version: string
  systems: BoardSystem[]
  items: BoardItem[]
  results: Record<string, BoardSystemResults>
}

const ABSTENTION_KINDS: Array<AbstentionKind | null> = [null, 'explicit', 'low_confidence', 'missing']

export function outcomeAt(data: BoardData, system: string, index: number): Outcome | undefined {
  const r = data.results[system]
  return r ? OUTCOME_KEYS[r.outcome[index]] : undefined
}

/** One (system, item) result in the shape the badges and formatters take. */
export function resultAt(data: BoardData, system: string, index: number): PublicItemResult | undefined {
  const r = data.results[system]
  const outcome = outcomeAt(data, system, index)
  if (!r || !outcome) return undefined
  const abstention = ABSTENTION_KINDS[r.abstention[index]] ?? null
  return {
    outcome,
    answered: abstention === null,
    abstention,
    confidence: r.confidence[index],
    correct: outcome === 'correct',
    confidently_wrong: outcome === 'confidently_wrong',
  }
}

/** The system the board shows when a page asks for nothing in particular: the leader. */
export function defaultSystem(data: BoardData): string | null {
  return data.systems.find((s) => s.kind === 'ranked')?.name ?? data.systems[0]?.name ?? null
}
