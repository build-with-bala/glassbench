import { getItemSummaries } from './items-data'
import { getResults } from './results-data'
import { getSystemCards } from './systems'
import { OUTCOME_KEYS } from './outcomes'
import type { BoardData } from './board-data'

/* Server-side: the per-item results reshaped for the glass board (the WebGL world,
 * the hero instrument and the command palette). A reshaping only — every outcome,
 * confidence, count and published metric is the pipeline's value, copied as written.
 * Carries no gold answers, no histories and no answer texts. */

const ABSTENTION_CODE = { explicit: 1, low_confidence: 2, missing: 3 } as const

let cached: BoardData | null = null

export function getBoardData(): BoardData {
  if (cached) return cached
  const results = getResults()
  const items = getItemSummaries(results)
  const cards = getSystemCards()

  const data: BoardData = {
    version: results.version,
    systems: cards.map((c) => ({
      name: c.system,
      kind: c.kind,
      rank: c.rank,
      glass_score: c.row.glass_score,
      cwr: c.row.cwr,
      answered: c.row.answered,
      abstained: c.row.abstained,
      counts: c.summary.outcome_counts,
    })),
    items: items.map((it) => ({ id: it.id, split: it.split, query: it.query })),
    results: {},
  }
  for (const c of cards) {
    data.results[c.system] = {
      outcome: items.map((it) => OUTCOME_KEYS.indexOf(it.results[c.system].outcome)),
      confidence: items.map((it) => it.results[c.system].confidence),
      abstention: items.map((it) => {
        const a = it.results[c.system].abstention
        return a ? ABSTENTION_CODE[a] : 0
      }),
    }
  }
  cached = data
  return data
}
