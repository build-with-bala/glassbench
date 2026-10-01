import { describe, it, expect } from 'vitest'
import { getLeaderboard } from '../lib/glassbench-data'
import { getResults, getSystemItemRows, getSystemRefs, toPublicResult, validateResults } from '../lib/results-data'
import { getItem, getItemSummaries, getItems, historyStats, parseItems } from '../lib/items-data'
import { getSystemCards, isRankedRow, rankContext } from '../lib/systems'
import { OUTCOME_KEYS, SPLIT_KEYS } from '../lib/outcomes'

/* The site reads two scorer artifacts and the frozen item file. These tests pin their
 * shape and their mutual consistency, so a pipeline change that would break a page fails
 * here (and in CI) instead of on the live site. Nothing below recomputes a score: every
 * check compares numbers the scorer already wrote. */

describe('item_results.json', () => {
  const results = getResults()
  const board = getLeaderboard()

  it('covers every item and every system on the board', () => {
    expect(results.n_items).toBe(96)
    expect(results.items).toHaveLength(96)
    expect(results.split_counts).toEqual(board.split_counts)
    expect(results.version).toBe(board.version)
    const boardSystems = [...board.ranked, ...board.references].map((r) => r.system)
    expect(results.systems.map((s) => s.system)).toEqual(boardSystems)
  })

  it('carries the frozen thresholds and the five outcome definitions', () => {
    expect(results.thresholds).toEqual({ abstain_confidence: 0.5, confidently_wrong_confidence: 0.7 })
    expect(results.outcomes.map((o) => o.key)).toEqual([...OUTCOME_KEYS])
    for (const o of results.outcomes) expect(o.definition.length).toBeGreaterThan(20)
  })

  it('gives each system one outcome per item, consistent with its summary counts', () => {
    for (const s of results.systems) {
      const rows = getSystemItemRows(s.system, results)
      expect(rows).toHaveLength(results.n_items)
      for (const key of OUTCOME_KEYS) {
        expect(rows.filter((r) => r.outcome === key).length).toBe(s.outcome_counts[key])
      }
      expect(rows.filter((r) => r.answered).length).toBe(s.n_answered)
      expect(s.n_answered + s.n_abstained).toBe(s.n_items)
      for (const split of SPLIT_KEYS) {
        const entry = s.by_split[split]!
        const inSplit = rows.filter((r) => r.split === split)
        expect(entry.n).toBe(results.split_counts[split])
        expect(inSplit.filter((r) => r.answered).length).toBe(entry.answered)
        for (const key of OUTCOME_KEYS) {
          expect(inSplit.filter((r) => r.outcome === key).length).toBe(entry.outcome_counts[key])
        }
      }
    }
  })

  it('keeps answered / abstention / confidently_wrong flags coherent on every row', () => {
    for (const item of results.items) {
      for (const r of Object.values(item.results)) {
        expect(r.abstention === null).toBe(r.answered)
        expect(r.confidently_wrong).toBe(r.outcome === 'confidently_wrong')
        if (r.outcome === 'confidently_wrong') {
          expect(r.confidence).toBeGreaterThanOrEqual(results.thresholds.confidently_wrong_confidence)
        }
        if (r.answered) expect(r.confidence).toBeGreaterThanOrEqual(results.thresholds.abstain_confidence)
        if (r.abstention === 'low_confidence') {
          expect(r.confidence).toBeLessThan(results.thresholds.abstain_confidence)
        }
        expect(r.correct).toBe(r.outcome === 'correct')
      }
    }
  })

  it('rejects a malformed export loudly', () => {
    expect(() => validateResults({})).toThrow(/missing required key/)
    expect(() => validateResults({ ...results, n_items: 95 })).toThrow(/n_items/)
    const broken = structuredClone(results)
    delete (broken.items[0].results as Record<string, unknown>)[results.systems[0].system]
    expect(() => validateResults(broken)).toThrow(/no valid result/)
  })

  it('toPublicResult drops the answer text and nothing else', () => {
    const r = results.items[0].results[results.systems[0].system]
    const pub = toPublicResult(r)
    expect('answer' in pub).toBe(false)
    expect({ ...pub, answer: r.answer }).toEqual(r)
  })
})

describe('systems: leaderboard.json joined with item_results.json', () => {
  const board = getLeaderboard()
  const cards = getSystemCards()

  it('joins every system and agrees with the board on rank and routing counts', () => {
    expect(cards).toHaveLength(board.ranked.length + board.references.length)
    for (const c of cards) {
      expect(c.row.system).toBe(c.system)
      expect(c.row.answered).toBe(c.summary.n_answered)
      expect(c.row.abstained).toBe(c.summary.n_abstained)
      if (c.kind === 'ranked') {
        expect(isRankedRow(c.row)).toBe(true)
        expect(c.rank).toBe((c.row as { rank: number }).rank)
      } else {
        expect(c.rank).toBeNull()
      }
    }
  })

  it('the 6-decimal scorer values round to the board’s published digits', () => {
    for (const c of cards) {
      expect(Number(c.summary.scores.glass_score.toFixed(2))).toBe(c.row.glass_score)
      expect(Number(c.summary.scores.aurc_norm.toFixed(3))).toBe(c.row.aurc_norm)
      expect(Number(c.summary.scores.brier.toFixed(3))).toBe(c.row.brier)
    }
  })

  it('describes where a system sits on the ranked board', () => {
    const leader = cards[0]
    const ctx = rankContext(leader, cards)
    expect(leader.rank).toBe(1)
    expect(ctx.above).toBeNull()
    expect(ctx.below?.rank).toBeGreaterThan(1)
    expect(ctx.total).toBe(board.ranked.length)

    // Ties share a rank and point at each other.
    const byRank = new Map<number, string[]>()
    for (const c of cards) if (c.rank !== null) byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c.system])
    for (const c of cards.filter((x) => x.rank !== null)) {
      const tied = byRank.get(c.rank as number)!.filter((n) => n !== c.system)
      expect(rankContext(c, cards).tiedWith).toEqual(tied)
    }

    const reference = cards.find((c) => c.kind === 'reference')!
    const refCtx = rankContext(reference, cards)
    expect(refCtx.above).toBeNull()
    expect(refCtx.below).toBeNull()
    expect(refCtx.leader?.system).toBe(leader.system)
  })

  it('lists systems in board order for pickers', () => {
    expect(getSystemRefs().map((s) => s.system)).toEqual(cards.map((c) => c.system))
  })
})

describe('benchmark items', () => {
  const items = getItems()
  const results = getResults()

  it('loads the 96 frozen items in the same order as the results', () => {
    expect(items).toHaveLength(96)
    expect(items.map((it) => it.id)).toEqual(results.items.map((it) => it.id))
    for (const [i, it] of items.entries()) expect(it.split).toBe(results.items[i].split)
  })

  it('every unanswerable item has gold ABSTAIN; every answerable one has a real answer', () => {
    for (const it of items) {
      const unanswerable = it.split === 'contradiction' || it.split === 'false_premise'
      expect(it.gold_answer === 'ABSTAIN').toBe(unanswerable)
      expect(it.query.length).toBeGreaterThan(0)
      expect(historyStats(it).turns).toBeGreaterThan(0)
    }
  })

  it('item summaries (what the explorer ships to the browser) carry no gold', () => {
    const summaries = getItemSummaries()
    expect(summaries).toHaveLength(96)
    for (const s of summaries) {
      expect(Object.keys(s).sort()).toEqual(['id', 'query', 'results', 'split'])
      for (const r of Object.values(s.results)) expect('answer' in r).toBe(false)
    }
    const text = JSON.stringify(summaries)
    for (const field of ['gold_answer', 'evidence_spans', 'answer_topic', 'history']) {
      expect(text.includes(`"${field}"`)).toBe(false)
    }
  })

  it('finds an item by id and rejects malformed JSONL', () => {
    expect(getItem(items[0].id)?.id).toBe(items[0].id)
    expect(getItem('nope')).toBeUndefined()
    expect(() => parseItems('{not json}')).toThrow(/invalid JSON/)
    expect(() => parseItems('{"id":"x","query":"q","history":[],"split":"mystery"}')).toThrow(/unknown split/)
    expect(parseItems('\n{"id":"x","query":"q","history":[],"split":"false-premise","gold_answer":"ABSTAIN"}\n')[0].split).toBe(
      'false_premise',
    )
  })
})
