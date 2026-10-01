import { describe, expect, it } from 'vitest'
import { MAX_LIGHTS, SCENES, createBoard, sceneForPath } from '../components/world/board'
import { getLeaderboard } from '../lib/glassbench-data'

const counts = getLeaderboard().split_counts
const total = counts.answerable + counts.stale + counts.contradiction + counts.false_premise

describe('world board', () => {
  it('lays out exactly one slab per benchmark item, split for split', () => {
    const board = createBoard(counts)
    expect(board.tiles).toHaveLength(total)
    expect(total).toBe(getLeaderboard().n_items)
    for (const split of ['answerable', 'stale', 'contradiction', 'false_premise'] as const) {
      expect(board.tiles.filter((t) => t.split === split)).toHaveLength(counts[split])
    }
  })

  it('never puts two slabs on the same cell', () => {
    const board = createBoard(counts)
    const cells = new Set(board.tiles.map((t) => `${t.col},${t.row}`))
    expect(cells.size).toBe(board.tiles.length)
  })

  it('is deterministic', () => {
    expect(createBoard(counts)).toEqual(createBoard(counts))
  })

  it('only lights answerable or stale slabs, and only stale slabs carry an upper layer', () => {
    const board = createBoard(counts)
    for (const t of board.tiles) {
      if (t.lit.some((v) => v > 0)) expect(['answerable', 'stale']).toContain(t.split)
    }
    expect(board.stacks).toHaveLength(counts.stale)
    for (const s of board.stacks) expect(board.tiles[s.tile].split).toBe('stale')
  })

  it('gives the home scene a lit cluster and stays within the shader light budget', () => {
    const board = createBoard(counts)
    const hero = SCENES.indexOf('hero')
    expect(board.tiles.filter((t) => t.lit[hero] >= 0.8).length).toBeGreaterThanOrEqual(2)
    expect(board.stacks.some((s) => s.show[hero] === 1)).toBe(true)
    expect(board.lights.length).toBeLessThanOrEqual(MAX_LIGHTS)
    expect(board.focus).toHaveLength(SCENES.length)
  })

  it('survives degenerate counts', () => {
    expect(createBoard({ answerable: 0, stale: 0, contradiction: 0, false_premise: 0 }).tiles).toHaveLength(0)
    const tiny = createBoard({ answerable: 1, stale: 0, contradiction: 0, false_premise: 2 })
    expect(tiny.tiles).toHaveLength(3)
    expect(tiny.stacks).toHaveLength(0)
  })

  it('maps routes to scenes, falling back to the calm one', () => {
    expect(sceneForPath('/')).toBe('hero')
    expect(sceneForPath('/leaderboard')).toBe('board')
    expect(sceneForPath('/submit')).toBe('submit')
    expect(sceneForPath('/datasheet')).toBe('card')
    expect(sceneForPath('/some/new/page')).toBe('card')
    expect(sceneForPath(null)).toBe('hero')
  })
})
