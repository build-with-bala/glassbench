import { getLeaderboard } from './glassbench-data'
import { getResults } from './results-data'
import type { LeaderboardData, RankedRow, ReferenceRow, ResultsData, SystemSummary } from './types'

/* Server-side join of the two scorer artifacts, per system:
 *   leaderboard.json   -> the published board row (display-rounded metrics + blurbs)
 *   item_results.json  -> the per-item summary (outcome counts, per-split, pillars)
 * Lookups only — no number is computed here. */

export interface SystemCard {
  system: string
  kind: 'ranked' | 'reference'
  /** Competition rank among ranked systems; null for a reference ceiling. */
  rank: number | null
  /** The board row. Ranked rows carry type/description/reproduce; references carry
   *  what_it_is/excluded_reason. */
  row: RankedRow | ReferenceRow
  summary: SystemSummary
}

export function isRankedRow(row: RankedRow | ReferenceRow): row is RankedRow {
  return typeof (row as RankedRow).rank === 'number'
}

/** Every scored system in board order (ranked, then references). Throws if the two
 *  artifacts disagree about which systems exist — they are written by one pipeline run. */
export function getSystemCards(
  board: LeaderboardData = getLeaderboard(),
  results: ResultsData = getResults(),
): SystemCard[] {
  const rows = new Map<string, RankedRow | ReferenceRow>()
  for (const r of board.ranked) rows.set(r.system, r)
  for (const r of board.references) rows.set(r.system, r)

  if (rows.size !== results.systems.length) {
    throw new Error(
      `leaderboard.json lists ${rows.size} systems but item_results.json lists ${results.systems.length}; ` +
        'regenerate both with `make leaderboard`',
    )
  }
  return results.systems.map((summary) => {
    const row = rows.get(summary.system)
    if (!row) throw new Error(`item_results.json has system "${summary.system}" that leaderboard.json lacks`)
    if (row.answered !== summary.n_answered || row.abstained !== summary.n_abstained) {
      throw new Error(`leaderboard.json and item_results.json disagree on "${summary.system}" answer counts`)
    }
    return { system: summary.system, kind: summary.kind, rank: summary.rank, row, summary }
  })
}

export function getSystemCard(name: string): SystemCard | undefined {
  return getSystemCards().find((c) => c.system === name)
}

export interface RankContext {
  /** Ranked systems on the board. */
  total: number
  /** Other ranked systems sharing this rank (ties on the 2-decimal Glass Score). */
  tiedWith: string[]
  /** The nearest ranked system with a strictly better / strictly worse rank. */
  above: { system: string; rank: number; glass_score: number } | null
  below: { system: string; rank: number; glass_score: number } | null
  /** The board leader (rank 1). */
  leader: { system: string; glass_score: number } | null
}

/** Where a system sits on the ranked board. For a reference ceiling `rank` is null, so
 *  `above`/`below` are null and only `leader`/`total` are meaningful. */
export function rankContext(card: SystemCard, cards: SystemCard[] = getSystemCards()): RankContext {
  const ranked = cards.filter((c) => c.kind === 'ranked' && c.rank !== null)
  const pick = (c: SystemCard) => ({ system: c.system, rank: c.rank as number, glass_score: c.row.glass_score })
  const leader = ranked[0] ? { system: ranked[0].system, glass_score: ranked[0].row.glass_score } : null
  if (card.rank === null) return { total: ranked.length, tiedWith: [], above: null, below: null, leader }

  const rank = card.rank
  const better = ranked.filter((c) => (c.rank as number) < rank)
  const worse = ranked.filter((c) => (c.rank as number) > rank)
  return {
    total: ranked.length,
    tiedWith: ranked.filter((c) => c.rank === rank && c.system !== card.system).map((c) => c.system),
    above: better.length ? pick(better[better.length - 1]) : null,
    below: worse.length ? pick(worse[0]) : null,
    leader,
  }
}
