import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { BenchItem, ItemSummary, ResultsData, Split } from './types'
import { getResults, toPublicResult } from './results-data'
import { SPLIT_KEYS } from './outcomes'

/* Server-side loader for the frozen benchmark items (data/glassbench_v0.1.jsonl,
 * snapshotted byte-for-byte into web/data/ by scripts/sync-data.mjs).
 *
 * This file holds gold answers. It is read with `fs` at build time and is never
 * imported by a client component, so the 2.6 MB of histories and the gold never land in
 * a browser bundle: pages hand the client only what a reader asked to see. */

const DATA_FILE = 'data/glassbench_v0.1.jsonl'

let cached: BenchItem[] | null = null

/** Parse the JSONL text. Exported for tests. */
export function parseItems(text: string): BenchItem[] {
  const items: BenchItem[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    let obj: any
    try {
      obj = JSON.parse(line)
    } catch (e) {
      throw new Error(`${DATA_FILE}:${i + 1}: invalid JSON (${(e as Error).message})`)
    }
    if (typeof obj.id !== 'string' || typeof obj.query !== 'string' || !Array.isArray(obj.history)) {
      throw new Error(`${DATA_FILE}:${i + 1}: item needs id, query and history`)
    }
    const split = String(obj.split ?? '')
      .trim()
      .toLowerCase()
      .replace(/[-\s]/g, '_') as Split
    if (!SPLIT_KEYS.includes(split)) throw new Error(`${DATA_FILE}:${i + 1}: unknown split "${obj.split}"`)
    items.push({
      id: obj.id,
      split,
      query: obj.query,
      history: obj.history,
      gold_answer: String(obj.gold_answer ?? ''),
      answer_topic: String(obj.answer_topic ?? ''),
      evidence_spans: Array.isArray(obj.evidence_spans) ? obj.evidence_spans.map(String) : [],
      source_id: String(obj.source_id ?? ''),
    })
  }
  return items
}

export function getItems(): BenchItem[] {
  if (!cached) cached = parseItems(readFileSync(resolve(process.cwd(), DATA_FILE), 'utf8'))
  return cached
}

export function getItem(id: string): BenchItem | undefined {
  return getItems().find((it) => it.id === id)
}

/** The explorer / compare view of every item: id, split, query and each system's
 *  outcome. No gold answer, no history, no answer text, no answer_topic. */
export function getItemSummaries(results: ResultsData = getResults()): ItemSummary[] {
  const byId = new Map(getItems().map((it) => [it.id, it]))
  return results.items.map((r) => {
    const item = byId.get(r.id)
    if (!item) throw new Error(`item_results.json has item ${r.id} that is not in ${DATA_FILE}`)
    const out: ItemSummary = { id: r.id, split: r.split, query: item.query, results: {} }
    for (const [system, res] of Object.entries(r.results)) out.results[system] = toPublicResult(res)
    return out
  })
}

/** Size of an item's history, for display ("3 sessions · 41 turns"). */
export function historyStats(item: BenchItem): { sessions: number; turns: number } {
  return {
    sessions: item.history.length,
    turns: item.history.reduce((n, s) => n + (Array.isArray(s.turns) ? s.turns.length : 0), 0),
  }
}
