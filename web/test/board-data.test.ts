import { describe, expect, it } from 'vitest'
import { defaultSystem, outcomeAt, resultAt } from '../lib/board-data'
import { getBoardData } from '../lib/world-data'
import { getLeaderboard } from '../lib/glassbench-data'
import { getItems } from '../lib/items-data'
import { getResults, toPublicResult } from '../lib/results-data'
import { resolveBoard } from '../components/world/resolve'
import { boardStore, boardTurn, effectiveRequest, TURN_LIMIT } from '../components/world/store'

const board = getBoardData()
const results = getResults()
const leaderboard = getLeaderboard()

describe('the board’s data is the pipeline’s, reshaped', () => {
  it('lists every system and every item, in the pipeline’s order', () => {
    expect(board.systems.map((s) => s.name)).toEqual(results.systems.map((s) => s.system))
    expect(board.items.map((it) => it.id)).toEqual(results.items.map((it) => it.id))
    expect(board.items).toHaveLength(results.n_items)
  })

  it('carries each (system, item) outcome, confidence and abstention exactly as written', () => {
    for (const s of results.systems) {
      results.items.forEach((item, i) => {
        expect(resultAt(board, s.system, i)).toEqual(toPublicResult(item.results[s.system]))
        expect(outcomeAt(board, s.system, i)).toBe(item.results[s.system].outcome)
      })
    }
  })

  it('carries the published board values and the pipeline’s outcome counts', () => {
    const rows = new Map([...leaderboard.ranked, ...leaderboard.references].map((r) => [r.system, r]))
    for (const s of board.systems) {
      const row = rows.get(s.name)!
      expect(s.glass_score).toBe(row.glass_score)
      expect(s.cwr).toBe(row.cwr)
      expect(s.answered).toBe(row.answered)
      expect(s.abstained).toBe(row.abstained)
      expect(s.counts).toEqual(results.systems.find((r) => r.system === s.name)!.outcome_counts)
    }
  })

  it('contains no gold answer, no history and no answer text', () => {
    const json = JSON.stringify(board)
    // the only fields an item and a result set may have
    for (const item of board.items) expect(Object.keys(item).sort()).toEqual(['id', 'query', 'split'])
    for (const r of Object.values(board.results)) {
      expect(Object.keys(r).sort()).toEqual(['abstention', 'confidence', 'outcome'])
    }
    expect(Object.keys(board).sort()).toEqual(['items', 'results', 'systems', 'version'])
    // no gold answer longer than a couple of characters leaks in through another field
    // (queries are public: they are shown in the explorer)
    const queries = new Set(board.items.map((it) => it.query))
    for (const item of getItems()) {
      if (item.gold_answer.length < 12 || [...queries].some((q) => q.includes(item.gold_answer))) continue
      expect(json, item.id).not.toContain(JSON.stringify(item.gold_answer).slice(1, -1))
    }
  })

  it('defaults to the leader', () => {
    expect(defaultSystem(board)).toBe(leaderboard.ranked[0].system)
  })
})

describe('resolving a board request', () => {
  const leader = defaultSystem(board)!

  it('shows the leader, everything lit, when a page asks for nothing', () => {
    const r = resolveBoard(board, { system: undefined, highlight: null, focus: null })
    expect(r.system).toBe(leader)
    expect(r.filtered).toBe(false)
    expect(r.litCount).toBe(board.items.length)
    expect(r.focus).toBe(-1)
  })

  it('lights exactly the items with an outcome — the pipeline’s own count', () => {
    for (const s of board.systems) {
      for (const outcome of ['correct', 'wrong', 'confidently_wrong', 'abstained_ok', 'abstained_missed'] as const) {
        const r = resolveBoard(board, { system: s.name, highlight: { outcome }, focus: null })
        expect(r.litCount, `${s.name} ${outcome}`).toBe(s.counts[outcome])
      }
    }
  })

  it('lights a split, a list of items, and singles one item out', () => {
    expect(resolveBoard(board, { system: leader, highlight: { splits: ['stale'] }, focus: null }).litCount).toBe(
      results.split_counts.stale,
    )
    const ids = [board.items[3].id, board.items[40].id, 'not-an-item']
    const r = resolveBoard(board, { system: null, highlight: { items: ids }, focus: board.items[40].id })
    expect(r.system).toBeNull()
    expect(r.litCount).toBe(2)
    expect(r.lit[3] && r.lit[40]).toBe(true)
    expect(r.focus).toBe(40)
  })

  it('treats an unknown system as neutral glass', () => {
    const r = resolveBoard(board, { system: 'no-such-system', highlight: { outcome: 'correct' }, focus: null })
    expect(r.system).toBeNull()
    expect(r.litCount).toBe(0)
  })
})

describe('the board store', () => {
  it('layers page, story, preview and hover', () => {
    boardStore.resetBase()
    boardStore.setBase({ system: 'agent_llm' })
    expect(effectiveRequest(boardStore.get())).toEqual({ system: 'agent_llm', highlight: null, focus: null })

    // a story section fills in what the page left open…
    boardStore.setStory({ highlight: { outcome: 'confidently_wrong' } })
    expect(effectiveRequest(boardStore.get()).highlight).toEqual({ outcome: 'confidently_wrong' })
    // …but never overrides an explicit choice
    boardStore.setBase({ system: 'agent_llm', highlight: { splits: ['stale'] } })
    expect(effectiveRequest(boardStore.get()).highlight).toEqual({ splits: ['stale'] })

    // a preview wins while it lasts
    boardStore.setPreview({ system: 'always_answer' })
    expect(effectiveRequest(boardStore.get())).toMatchObject({ system: 'always_answer', highlight: { splits: ['stale'] } })
    boardStore.setPreview(null)
    expect(effectiveRequest(boardStore.get()).system).toBe('agent_llm')

    // the cell under the pointer is the focus
    boardStore.setHover('gb-x')
    expect(effectiveRequest(boardStore.get()).focus).toBe('gb-x')
    boardStore.setHover(null)

    boardStore.resetBase()
    expect(effectiveRequest(boardStore.get())).toEqual({ system: undefined, highlight: null, focus: null })
  })

  it('bumps its version only when what the board shows changes', () => {
    const v = boardStore.get().version
    boardStore.setHover(null)
    boardStore.setPreview(null)
    boardStore.turnBy(0.1)
    expect(boardStore.get().version).toBe(v)
    boardStore.setPreview({ focus: 'gb-y' })
    expect(boardStore.get().version).toBe(v + 1)
    boardStore.setPreview(null)
  })

  it('bounds how far the board can be turned', () => {
    boardStore.resetTurn()
    for (let i = 0; i < 50; i++) boardStore.turnBy(0.3, -0.3)
    expect(boardTurn.azimuth).toBe(TURN_LIMIT.azimuth)
    expect(boardTurn.elevation).toBe(-TURN_LIMIT.elevation)
    boardStore.resetTurn()
    expect(boardTurn).toEqual({ azimuth: 0, elevation: 0 })
  })
})
