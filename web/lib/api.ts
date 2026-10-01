import { getResults, getSystemItemRows } from './results-data'
import { getItem } from './items-data'
import { getSystemCards, type SystemCard } from './systems'
import { REPO_URL, SITE_URL } from './site'
import type { ItemRevealPayload, ResultsData } from './types'

/* The public, read-only data API (see /data for the documentation).
 *
 * Every endpoint is a static JSON document generated at build time from the scorer
 * pipeline's artifacts. Nothing is computed per request and nothing is scored here.
 *
 * Contamination policy: the bulk endpoints carry outcomes and confidences but never gold
 * answers, histories or the systems' answer texts. Those are served only by the per-item
 * endpoint, which is marked noindex and disallowed in robots.txt. */

const COMMON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  // Public, read-only data: let anyone fetch it from a browser.
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=300, s-maxage=3600',
}

export function jsonHeaders({ noindex = false }: { noindex?: boolean } = {}): Record<string, string> {
  return noindex ? { ...COMMON_HEADERS, 'X-Robots-Tag': 'noindex' } : { ...COMMON_HEADERS }
}

export function jsonResponse(body: unknown, opts: { noindex?: boolean } = {}): Response {
  return new Response(JSON.stringify(body, null, 1) + '\n', { headers: jsonHeaders(opts) })
}

function provenance(results: ResultsData) {
  return {
    benchmark: results.benchmark,
    version: results.version,
    data_file: results.data_file,
    n_items: results.n_items,
    source: `${REPO_URL}/tree/main/results`,
    license: 'MIT',
  }
}

const systemApiPath = (name: string) => `/api/systems/${encodeURIComponent(name)}.json`

function systemEntry(card: SystemCard) {
  const { system_md: _md, system: _name, kind: _kind, rank: _rank, ...summary } = card.summary
  return {
    system: card.system,
    kind: card.kind,
    rank: card.rank,
    /** The published board row: display-rounded metrics and the system's blurbs. */
    board: card.row,
    ...summary,
    url: `${SITE_URL}/systems/${encodeURIComponent(card.system)}`,
    results_url: `${SITE_URL}${systemApiPath(card.system)}`,
  }
}

/** GET /api/systems.json — every scored system with its summary (no per-item rows). */
export function systemsIndexPayload() {
  const results = getResults()
  return {
    ...provenance(results),
    split_counts: results.split_counts,
    thresholds: results.thresholds,
    outcomes: results.outcomes,
    systems: getSystemCards().map(systemEntry),
  }
}

/** GET /api/systems/<system>.json — one system: summary, system card and its outcome on
 *  every item. Answer texts are deliberately left out (they are in the repository). */
export function systemPayload(name: string) {
  const card = getSystemCards().find((c) => c.system === name)
  if (!card) return null
  const results = getResults()
  return {
    ...provenance(results),
    thresholds: results.thresholds,
    outcomes: results.outcomes,
    ...systemEntry(card),
    system_md: card.summary.system_md,
    predictions_file: `${REPO_URL}/blob/main/submissions/${card.system}/predictions.json`,
    items: getSystemItemRows(card.system, results),
  }
}

/** GET /api/items.json — every item with each system's outcome on it. No gold, no
 *  history, no answer text. */
export function itemsIndexPayload() {
  const results = getResults()
  return {
    ...provenance(results),
    split_counts: results.split_counts,
    thresholds: results.thresholds,
    outcomes: results.outcomes,
    systems: results.systems.map((s) => ({ system: s.system, kind: s.kind, rank: s.rank })),
    items: results.items.map((it) => {
      const query = getItem(it.id)?.query ?? ''
      const out: Record<string, unknown> = {}
      for (const [system, r] of Object.entries(it.results)) {
        const { answer: _answer, ...rest } = r
        out[system] = rest
      }
      return { id: it.id, split: it.split, query, results: out }
    }),
  }
}

/** GET /api/items/<id>.json — the gold-bearing detail behind an item page's "reveal". */
export function itemRevealPayload(id: string): ItemRevealPayload | null {
  const item = getItem(id)
  const results = getResults()
  const itemResults = results.items.find((it) => it.id === id)
  if (!item || !itemResults) return null
  const answers: Record<string, string | null> = {}
  for (const s of results.systems) answers[s.system] = itemResults.results[s.system]?.answer ?? null
  return {
    benchmark: results.benchmark,
    version: results.version,
    id: item.id,
    split: item.split,
    gold_answer: item.gold_answer,
    answer_topic: item.answer_topic,
    evidence_spans: item.evidence_spans,
    answers,
  }
}

/** Names of the documents the per-system route serves ("agent_llm.json", ...). */
export function systemFileNames(): string[] {
  return getSystemCards().map((c) => `${c.system}.json`)
}

/** Strip the ".json" suffix of a route file segment; null if it has none. */
export function stripJson(file: string): string | null {
  const decoded = decodeURIComponent(file)
  return decoded.endsWith('.json') ? decoded.slice(0, -'.json'.length) : null
}
