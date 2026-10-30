import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  itemRevealPayload,
  itemsIndexPayload,
  jsonHeaders,
  jsonResponse,
  stripJson,
  systemFileNames,
  systemPayload,
  systemsIndexPayload,
} from '../lib/api'
import { GET as getLeaderboardJson } from '../app/api/leaderboard.json/route'
import sitemap from '../app/sitemap'
import robots from '../app/robots'
import { getItems } from '../lib/items-data'
import { getLeaderboard } from '../lib/glassbench-data'
import { ROUTES, SITE_URL } from '../lib/site'

/* The public data endpoints and the crawl surface. The contamination rule under test:
 * gold answers, histories and answer texts appear in exactly one place — the per-item
 * document an item page fetches on "reveal" — and that place is kept away from crawlers. */

const GOLD_FIELDS = ['gold_answer', 'evidence_spans', 'answer_topic', 'history']

describe('public JSON endpoints', () => {
  const board = getLeaderboard()
  const names = [...board.ranked, ...board.references].map((r) => r.system)

  it('/api/leaderboard.json serves the scorer artifact byte for byte', async () => {
    const res = getLeaderboardJson()
    const body = await res.text()
    expect(body).toBe(readFileSync('data/leaderboard.json', 'utf8'))
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(JSON.parse(body).ranked[0].system).toBe(board.ranked[0].system)
  })

  it('/api/systems.json indexes every system with links to its results', () => {
    const doc = systemsIndexPayload()
    expect(doc.systems.map((s) => s.system)).toEqual(names)
    for (const s of doc.systems) {
      expect(s.results_url).toBe(`${SITE_URL}/api/systems/${s.system}.json`)
      expect(s.board.glass_score).toBeTypeOf('number')
      expect(s.outcome_counts.confidently_wrong).toBeTypeOf('number')
      expect('system_md' in s).toBe(false)
    }
    expect(doc.version).toBe(board.version)
  })

  it('/api/systems/<system>.json carries per-item outcomes but no answers and no gold', () => {
    expect(systemFileNames()).toEqual(names.map((n) => `${n}.json`))
    for (const name of names) {
      const doc = systemPayload(name)!
      expect(doc.system).toBe(name)
      expect(doc.items).toHaveLength(96)
      expect(Object.keys(doc.items[0]).sort()).toEqual(
        ['abstention', 'answered', 'confidence', 'confidently_wrong', 'correct', 'id', 'outcome', 'split'],
      )
      const text = JSON.stringify(doc.items)
      for (const f of [...GOLD_FIELDS, 'answer']) expect(text.includes(`"${f}"`), `${name}: ${f}`).toBe(false)
    }
    expect(systemPayload('nope')).toBeNull()
  })

  it('/api/items.json is the outcome matrix, without gold or answer text', () => {
    const doc = itemsIndexPayload()
    expect(doc.items).toHaveLength(96)
    expect(Object.keys(doc.items[0].results)).toEqual(names)
    const text = JSON.stringify(doc)
    for (const f of [...GOLD_FIELDS, 'answer']) expect(text.includes(`"${f}"`), f).toBe(false)
  })

  it('/api/items/<id>.json is the only document with gold, and is marked noindex', async () => {
    const item = getItems().find((it) => it.split === 'stale')!
    const doc = itemRevealPayload(item.id)!
    expect(doc.gold_answer).toBe(item.gold_answer)
    expect(doc.evidence_spans).toEqual(item.evidence_spans)
    expect(Object.keys(doc.answers)).toEqual(names)
    expect('history' in doc).toBe(false)
    expect(itemRevealPayload('nope')).toBeNull()

    expect(jsonHeaders({ noindex: true })['X-Robots-Tag']).toBe('noindex')
    expect(jsonHeaders()['X-Robots-Tag']).toBeUndefined()
    const res = jsonResponse(doc, { noindex: true })
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
    expect(await res.json()).toEqual(doc)
  })

  it('maps route file names to ids', () => {
    expect(stripJson('agent_llm.json')).toBe('agent_llm')
    expect(stripJson('gb-false_premise-031748ae_abs.json')).toBe('gb-false_premise-031748ae_abs')
    expect(stripJson('agent_llm')).toBeNull()
    expect(stripJson('a%20b.json')).toBe('a b')
  })
})

describe('crawl surface', () => {
  it('the sitemap lists every indexable route and system page — and no item page', () => {
    const urls = sitemap().map((e) => e.url)
    for (const path of ROUTES) expect(urls).toContain(`${SITE_URL}${path === '/' ? '' : path}`)
    for (const r of [...getLeaderboard().ranked, ...getLeaderboard().references]) {
      expect(urls).toContain(`${SITE_URL}/systems/${r.system}`)
    }
    expect(urls.some((u) => /\/explore\/.+/.test(u))).toBe(false)
    expect(urls.some((u) => u.includes('/api/'))).toBe(false)
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('robots.txt keeps crawlers off the gold-bearing item documents', () => {
    const r = robots()
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules]
    expect(rules[0].disallow).toBe('/api/items/')
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`)
  })
})
