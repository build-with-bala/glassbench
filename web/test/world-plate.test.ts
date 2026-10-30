import { describe, expect, it } from 'vitest'
import { CELL_MAX_HEIGHT, CELL_MIN_HEIGHT, NEUTRAL_LOOK, cellHeight, createPlate, lookFor } from '../components/world/plate'
import { OUTCOME_KEYS, SPLIT_KEYS } from '../lib/outcomes'
import { getResults } from '../lib/results-data'
import type { Split } from '../lib/types'

const results = getResults()
const splits = results.items.map((it) => it.split)

describe('the plate layout', () => {
  it('has exactly one cell per benchmark item', () => {
    const plate = createPlate(splits)
    expect(plate.cells).toHaveLength(results.n_items)
    expect(new Set(plate.cells.map((c) => c.item)).size).toBe(results.n_items)
    expect(new Set(plate.cells.map((c) => `${c.col},${c.row}`)).size).toBe(results.n_items)
    plate.cells.forEach((c, ci) => expect(plate.cellOfItem[c.item]).toBe(ci))
  })

  it('keeps every cell on its item’s split, in the pipeline’s counts', () => {
    const plate = createPlate(splits)
    for (const c of plate.cells) expect(c.split).toBe(results.items[c.item].split)
    for (const s of SPLIT_KEYS) {
      expect(plate.cells.filter((c) => c.split === s)).toHaveLength(results.split_counts[s])
    }
  })

  it('lays the splits side by side in canonical order, items in data order within one', () => {
    const plate = createPlate(splits)
    const order = [...plate.cells].sort((a, b) => a.col - b.col || a.row - b.row)
    const seen = order.map((c) => SPLIT_KEYS.indexOf(c.split))
    expect(seen).toEqual([...seen].sort((a, b) => a - b))
    for (const s of SPLIT_KEYS) {
      const items = order.filter((c) => c.split === s).map((c) => c.item)
      expect(items).toEqual([...items].sort((a, b) => a - b))
    }
  })

  it('addresses each cell’s state texel inside the texture and inside the slab', () => {
    const plate = createPlate(splits)
    for (const c of plate.cells) {
      expect(c.u).toBeGreaterThan(0)
      expect(c.u).toBeLessThan(1)
      expect(c.v).toBeGreaterThan(0)
      expect(c.v).toBeLessThan(1)
      expect(Math.abs(c.x)).toBeLessThan(plate.width / 2)
      expect(Math.abs(c.z)).toBeLessThan(plate.depth / 2)
    }
  })

  it('is deterministic and survives odd sizes', () => {
    expect(createPlate(splits)).toEqual(createPlate(splits))
    expect(createPlate([]).cells).toHaveLength(0)
    const five: Split[] = ['false_premise', 'answerable', 'stale', 'answerable', 'contradiction']
    const small = createPlate(five)
    expect(small.cells).toHaveLength(5)
    expect(small.cells.map((c) => c.split)).toEqual(['answerable', 'answerable', 'stale', 'contradiction', 'false_premise'])
  })
})

describe('how a result is drawn', () => {
  it('uses the stated confidence as the height, for every outcome', () => {
    for (const o of OUTCOME_KEYS) {
      expect(lookFor(o, 0.37).height).toBe(0.37)
      expect(lookFor(o, 1.4).height).toBe(1)
      expect(lookFor(o, -1).height).toBe(0)
    }
    expect(cellHeight(0)).toBe(CELL_MIN_HEIGHT)
    expect(cellHeight(1)).toBe(CELL_MAX_HEIGHT)
  })

  it('frosts abstentions and only abstentions', () => {
    expect(lookFor('abstained_ok', 0).frost).toBe(1)
    expect(lookFor('abstained_missed', 0.2).frost).toBe(1)
    for (const o of ['correct', 'wrong', 'confidently_wrong'] as const) expect(lookFor(o, 0.8).frost).toBe(0)
  })

  it('gives each outcome a different look, and burns only the confidently wrong', () => {
    const looks = OUTCOME_KEYS.map((o) => {
      const { frost, cool, heat } = lookFor(o, 0.8)
      return `${frost}|${cool}|${heat}`
    })
    expect(new Set(looks).size).toBe(OUTCOME_KEYS.length)
    expect(lookFor('confidently_wrong', 0.9).heat).toBe(1)
    for (const o of OUTCOME_KEYS.filter((k) => k !== 'confidently_wrong')) expect(lookFor(o, 0.9).heat).toBeLessThan(0.6)
    expect(lookFor('correct', 0.9)).toMatchObject({ cool: 1, heat: 0 })
  })

  it('draws plain glass when there is no outcome to show', () => {
    expect(lookFor(undefined, 0.9)).toEqual(NEUTRAL_LOOK)
  })
})
