import { describe, it, expect } from 'vitest'
import { getItemSummaries } from '../lib/items-data'
import { getResults } from '../lib/results-data'
import {
  agreementSummary,
  disagreements,
  filterItems,
  isRightCall,
  matchesMode,
  matchesSearch,
  outcomeTally,
} from '../lib/explore'
import {
  DEFAULT_EXPLORE_FILTERS,
  compareHref,
  compareQuery,
  exploreHref,
  exploreQuery,
  itemHref,
  parseCompareState,
  parseExploreFilters,
  systemHref,
} from '../lib/routes'
import { describeResult, formatConfidence } from '../lib/outcomes'
import type { PublicItemResult } from '../lib/types'

const results = getResults()
const items = getItemSummaries()
const systems = results.systems.map((s) => s.system)
const params = (q: string) => new URLSearchParams(q)

describe('explorer filters', () => {
  it('shows everything by default', () => {
    expect(filterItems(items, DEFAULT_EXPLORE_FILTERS)).toHaveLength(96)
  })

  it('filters by split, matching the frozen split counts', () => {
    for (const [split, n] of Object.entries(results.split_counts)) {
      const shown = filterItems(items, { ...DEFAULT_EXPLORE_FILTERS, split: split as never })
      expect(shown).toHaveLength(n)
      expect(shown.every((it) => it.split === split)).toBe(true)
    }
  })

  it('filters by outcome for one system, matching the scorer’s own counts', () => {
    for (const s of results.systems) {
      for (const [outcome, n] of Object.entries(s.outcome_counts)) {
        const shown = filterItems(items, { ...DEFAULT_EXPLORE_FILTERS, outcome: outcome as never, system: s.system })
        expect(shown, `${s.system} ${outcome}`).toHaveLength(n)
      }
    }
  })

  it('with "any system", an outcome matches if at least one system had it', () => {
    const shown = filterItems(items, { ...DEFAULT_EXPLORE_FILTERS, outcome: 'confidently_wrong' })
    expect(shown.length).toBeGreaterThan(0)
    for (const it of shown) expect(outcomeTally(it).confidently_wrong).toBeGreaterThan(0)
    const hidden = items.filter((it) => !shown.includes(it))
    for (const it of hidden) expect(outcomeTally(it).confidently_wrong).toBe(0)
  })

  it('searches id and query text, case-insensitively, requiring every term', () => {
    const sneakers = filterItems(items, { ...DEFAULT_EXPLORE_FILTERS, q: 'SNEAKERS' })
    expect(sneakers.length).toBeGreaterThan(0)
    expect(sneakers.every((it) => /sneakers/i.test(it.query))).toBe(true)
    expect(matchesSearch(items[0], items[0].id.toUpperCase())).toBe(true)
    expect(matchesSearch({ id: 'gb-x', query: 'Where do I keep my old sneakers?' }, 'old  keep')).toBe(true)
    expect(matchesSearch({ id: 'gb-x', query: 'Where do I keep my old sneakers?' }, 'old boots')).toBe(false)
    expect(filterItems(items, { ...DEFAULT_EXPLORE_FILTERS, q: 'zzz-no-such-thing' })).toHaveLength(0)
  })

  it('combines filters', () => {
    const shown = filterItems(items, {
      split: 'contradiction',
      outcome: 'confidently_wrong',
      system: 'always_answer',
      q: '',
    })
    expect(shown).toHaveLength(
      results.systems.find((s) => s.system === 'always_answer')!.by_split.contradiction!.outcome_counts.confidently_wrong,
    )
  })

  it('tallies outcomes per item across all systems', () => {
    for (const it of items) {
      const total = Object.values(outcomeTally(it)).reduce((a, b) => a + b, 0)
      expect(total).toBe(systems.length)
    }
  })
})

describe('explorer URL state', () => {
  it('round-trips through the query string', () => {
    const f = { split: 'stale', outcome: 'wrong', system: 'bm25_retrieval', q: 'old sneakers' } as const
    expect(parseExploreFilters(params(exploreQuery(f).slice(1)), systems)).toEqual(f)
    expect(exploreQuery(DEFAULT_EXPLORE_FILTERS)).toBe('')
    expect(exploreHref({})).toBe('/explore')
    expect(exploreHref({ split: 'contradiction' })).toBe('/explore?split=contradiction')
  })

  it('ignores unknown values instead of trusting the URL', () => {
    expect(parseExploreFilters(params('split=nope&outcome=<script>&system=ghost&q=x'), systems)).toEqual({
      split: 'all',
      outcome: 'all',
      system: 'any',
      q: 'x',
    })
    expect(parseExploreFilters(params(`q=${'a'.repeat(500)}`), systems).q).toHaveLength(200)
  })
})

describe('compare', () => {
  const [a, b] = ['agent_llm', 'bm25_retrieval']

  it('lists exactly the items with different outcomes, in data order', () => {
    const diff = disagreements(items, a, b)
    expect(diff.length).toBeGreaterThan(0)
    for (const d of diff) expect(d.a.outcome).not.toBe(d.b.outcome)
    const ids = diff.map((d) => d.item.id)
    expect(ids).toEqual(items.filter((it) => ids.includes(it.id)).map((it) => it.id))
    expect(disagreements(items, a, a)).toHaveLength(0)
    expect(disagreements(items, a, 'ghost')).toHaveLength(0)
  })

  it('summarises agreement, and is symmetric under a swap', () => {
    const ab = agreementSummary(items, a, b)
    const ba = agreementSummary(items, b, a)
    expect(ab.same + ab.different).toBe(96)
    expect(ba.different).toBe(ab.different)
    expect(ba.aRight).toBe(ab.bRight)
    expect(ba.bRight).toBe(ab.aRight)
    expect(ba.routing).toBe(ab.routing)
    expect(ab.aRight + ab.bRight).toBeLessThanOrEqual(ab.different)
  })

  it('classifies disagreements by who made the right call', () => {
    const right: PublicItemResult = {
      outcome: 'abstained_ok', answered: false, abstention: 'explicit', confidence: 0, correct: false, confidently_wrong: false,
    }
    const wrong: PublicItemResult = {
      outcome: 'confidently_wrong', answered: true, abstention: null, confidence: 0.9, correct: false, confidently_wrong: true,
    }
    expect(isRightCall(right)).toBe(true)
    expect(isRightCall(wrong)).toBe(false)
    const d = { item: items[0], a: right, b: wrong }
    expect(matchesMode(d, 'all')).toBe(true)
    expect(matchesMode(d, 'a_right')).toBe(true)
    expect(matchesMode(d, 'b_right')).toBe(false)
    expect(matchesMode(d, 'routing')).toBe(true)
  })

  it('reads the pair from the URL, falls back safely, and never compares a system with itself', () => {
    expect(parseCompareState(params('a=bm25_retrieval&b=agent_llm&show=routing'), systems)).toEqual({
      a: 'bm25_retrieval', b: 'agent_llm', show: 'routing',
    })
    expect(parseCompareState(params(''), systems)).toEqual({ a: systems[0], b: systems[1], show: 'all' })
    expect(parseCompareState(params('a=ghost&b=also_ghost&show=weird'), systems)).toEqual({
      a: systems[0], b: systems[1], show: 'all',
    })
    const same = parseCompareState(params(`a=${systems[2]}&b=${systems[2]}`), systems)
    expect(same.a).toBe(systems[2])
    expect(same.b).not.toBe(systems[2])
    // b given as the default-A system: keep b, move a.
    const onlyB = parseCompareState(params(`b=${systems[0]}`), systems)
    expect(onlyB.b).toBe(systems[0])
    expect(onlyB.a).not.toBe(systems[0])
    const state = { a: 'agent_llm', b: 'always_answer', show: 'a_right' } as const
    expect(parseCompareState(params(compareQuery(state).slice(1)), systems)).toEqual(state)
    expect(compareHref('agent_llm', 'bm25_retrieval')).toBe('/compare?a=agent_llm&b=bm25_retrieval')
  })
})

describe('links and labels', () => {
  it('builds route hrefs', () => {
    expect(systemHref('agent_llm')).toBe('/systems/agent_llm')
    expect(systemHref('a b/c')).toBe('/systems/a%20b%2Fc')
    expect(itemHref('gb-stale-07741c44')).toBe('/explore/gb-stale-07741c44')
  })

  it('describes a result in words', () => {
    const base = { answered: false, correct: false, confidently_wrong: false } as const
    expect(formatConfidence({ confidence: 0, abstention: 'explicit' })).toBe('—')
    expect(formatConfidence({ confidence: 0, abstention: 'missing' })).toBe('—')
    expect(formatConfidence({ confidence: 0.31, abstention: 'low_confidence' })).toBe('0.31')
    expect(formatConfidence({ confidence: 0.9, abstention: null })).toBe('0.90')
    expect(describeResult({ ...base, outcome: 'abstained_ok', abstention: 'explicit', confidence: 0 })).toMatch(/explicit/)
    expect(describeResult({ ...base, outcome: 'abstained_missed', abstention: 'low_confidence', confidence: 0.31 })).toMatch(
      /0\.31.*below 0\.5/,
    )
    expect(
      describeResult({ outcome: 'confidently_wrong', answered: true, abstention: null, confidence: 0.9, correct: false, confidently_wrong: true }),
    ).toBe('Confidently wrong (confidence 0.90)')
  })
})
