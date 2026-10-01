import type { ItemSummary, Outcome, PublicItemResult } from './types'
import type { DisagreementMode, ExploreFilters } from './routes'

/* Pure filtering helpers for the item explorer and the compare view. Client-safe.
 * Everything here selects or counts rows the scorer already labelled — no outcome is
 * decided or re-derived on the site. */

/** Case- and whitespace-insensitive search over an item's id and query text. Every
 *  whitespace-separated term must appear. */
export function matchesSearch(item: Pick<ItemSummary, 'id' | 'query'>, q: string): boolean {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const hay = `${item.id} ${item.query}`.toLowerCase()
  return terms.every((t) => hay.includes(t))
}

/** Does this item match an outcome filter? With `system === 'any'` it matches when at
 *  least one system had that outcome. */
export function matchesOutcome(item: ItemSummary, outcome: Outcome | 'all', system: string): boolean {
  if (outcome === 'all') return true
  if (system !== 'any') return item.results[system]?.outcome === outcome
  return Object.values(item.results).some((r) => r.outcome === outcome)
}

export function filterItems(items: readonly ItemSummary[], f: ExploreFilters): ItemSummary[] {
  return items.filter(
    (it) =>
      (f.split === 'all' || it.split === f.split) && matchesOutcome(it, f.outcome, f.system) && matchesSearch(it, f.q),
  )
}

/** How many systems had each outcome on one item (for the item row summary). */
export function outcomeTally(item: ItemSummary): Record<Outcome, number> {
  const tally: Record<Outcome, number> = {
    correct: 0,
    wrong: 0,
    confidently_wrong: 0,
    abstained_ok: 0,
    abstained_missed: 0,
  }
  for (const r of Object.values(item.results)) tally[r.outcome]++
  return tally
}

/* ---- compare --------------------------------------------------------------- */

/** The scorer's two "right" outcomes: a correct answer, or abstaining on an
 *  unanswerable item. */
export function isRightCall(r: PublicItemResult): boolean {
  return r.outcome === 'correct' || r.outcome === 'abstained_ok'
}

export interface Disagreement {
  item: ItemSummary
  a: PublicItemResult
  b: PublicItemResult
}

/** Items on which two systems got different outcomes, in data order. */
export function disagreements(items: readonly ItemSummary[], a: string, b: string): Disagreement[] {
  const out: Disagreement[] = []
  for (const item of items) {
    const ra = item.results[a]
    const rb = item.results[b]
    if (!ra || !rb) continue
    if (ra.outcome !== rb.outcome) out.push({ item, a: ra, b: rb })
  }
  return out
}

export function matchesMode(d: Disagreement, mode: DisagreementMode): boolean {
  switch (mode) {
    case 'a_right':
      return isRightCall(d.a) && !isRightCall(d.b)
    case 'b_right':
      return isRightCall(d.b) && !isRightCall(d.a)
    case 'routing':
      return d.a.answered !== d.b.answered
    default:
      return true
  }
}

export interface AgreementSummary {
  total: number
  same: number
  different: number
  /** A made the right call and B did not / vice versa. */
  aRight: number
  bRight: number
  /** One answered where the other abstained. */
  routing: number
}

export function agreementSummary(items: readonly ItemSummary[], a: string, b: string): AgreementSummary {
  const diff = disagreements(items, a, b)
  return {
    total: items.length,
    same: items.length - diff.length,
    different: diff.length,
    aRight: diff.filter((d) => matchesMode(d, 'a_right')).length,
    bRight: diff.filter((d) => matchesMode(d, 'b_right')).length,
    routing: diff.filter((d) => matchesMode(d, 'routing')).length,
  }
}
