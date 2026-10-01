import raw from '../data/item_results.json'
import type {
  ItemResult,
  ItemResults,
  PublicItemResult,
  ResultsData,
  Split,
  SystemRef,
  SystemSummary,
} from './types'
import { OUTCOME_KEYS, SPLIT_KEYS } from './outcomes'

export { OUTCOME_KEYS, SPLIT_KEYS }

/* Server-side loader for results/item_results.json (the scorer pipeline's per-item
 * export). Import this from server components, route handlers and tests only — it pulls
 * the whole export, including answer texts, into whatever bundles it.
 *
 * The web app never recomputes a score: everything here is a lookup or a reshaping of
 * what the Python scorer wrote. */

const REQUIRED = [
  'benchmark',
  'version',
  'n_items',
  'split_counts',
  'thresholds',
  'outcomes',
  'systems',
  'items',
] as const

/** Validate the export's shape. Throws loudly so a change in the scorer pipeline fails
 *  the build / unit tests instead of silently corrupting a page. */
export function validateResults(d: any): ResultsData {
  if (!d || typeof d !== 'object') throw new Error('item_results.json: not an object')
  for (const k of REQUIRED) {
    if (!(k in d)) throw new Error(`item_results.json missing required key "${k}"`)
  }
  if (!Array.isArray(d.systems) || !Array.isArray(d.items) || !Array.isArray(d.outcomes)) {
    throw new Error('item_results.json: systems/items/outcomes must be arrays')
  }
  if (d.items.length !== d.n_items) {
    throw new Error(`item_results.json: n_items is ${d.n_items} but there are ${d.items.length} items`)
  }
  const outcomeKeys = d.outcomes.map((o: any) => o?.key)
  for (const k of OUTCOME_KEYS) {
    if (!outcomeKeys.includes(k)) throw new Error(`item_results.json: outcome "${k}" is not defined`)
  }
  const names: string[] = d.systems.map((s: any) => s?.system)
  if (names.some((n) => typeof n !== 'string' || n === '')) {
    throw new Error('item_results.json: every system needs a name')
  }
  if (new Set(names).size !== names.length) throw new Error('item_results.json: duplicate system names')
  for (const item of d.items) {
    if (typeof item?.id !== 'string' || !SPLIT_KEYS.includes(item.split)) {
      throw new Error(`item_results.json: bad item ${JSON.stringify(item?.id)}`)
    }
    for (const name of names) {
      const r = item.results?.[name]
      if (!r || !OUTCOME_KEYS.includes(r.outcome)) {
        throw new Error(`item_results.json: item ${item.id} has no valid result for "${name}"`)
      }
    }
  }
  return d as ResultsData
}

let cached: ResultsData | null = null

export function getResults(): ResultsData {
  if (!cached) cached = validateResults(raw)
  return cached
}

/** Every scored system in board order: ranked systems, then the excluded references. */
export function getSystemRefs(d: ResultsData = getResults()): SystemRef[] {
  return d.systems.map((s) => ({ system: s.system, kind: s.kind, rank: s.rank }))
}

export function getSystemSummary(name: string, d: ResultsData = getResults()): SystemSummary | undefined {
  return d.systems.find((s) => s.system === name)
}

export function getItemResults(id: string, d: ResultsData = getResults()): ItemResults | undefined {
  return d.items.find((it) => it.id === id)
}

/** Drop the answer text: what is safe to hand to a client component or a public endpoint. */
export function toPublicResult(r: ItemResult): PublicItemResult {
  const { answer: _answer, ...rest } = r
  return rest
}

/** One system's per-item rows (data order), without answer text. */
export function getSystemItemRows(
  name: string,
  d: ResultsData = getResults(),
): Array<{ id: string; split: Split } & PublicItemResult> {
  return d.items.map((it) => ({ id: it.id, split: it.split, ...toPublicResult(it.results[name]) }))
}
