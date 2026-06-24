import { describe, it, expect } from 'vitest'
import { getLeaderboard, scoredMetrics, columnRange, validate } from '../lib/glassbench-data'

describe('getLeaderboard', () => {
  it('loads the real scorer output with expected invariants', () => {
    const d = getLeaderboard()
    expect(d.benchmark).toBe('GlassBench')
    expect(d.n_items).toBe(96)
    expect(d.split_counts).toEqual({ answerable: 43, stale: 11, contradiction: 12, false_premise: 30 })
    expect(d.ranked.length).toBeGreaterThan(0)
    expect(d.ranked[0].rank).toBe(1)
    expect(d.metrics.find((m) => m.headline)?.key).toBe('cwr')
  })

  it('throws if a required key is missing', () => {
    expect(() => validate({})).toThrow(/missing required key/)
  })

  it('exposes scored metrics and column ranges', () => {
    const d = getLeaderboard()
    expect(scoredMetrics(d).every((m) => m.scored)).toBe(true)
    const [lo, hi] = columnRange(d.ranked, 'cwr')
    expect(lo).toBeLessThanOrEqual(hi)
  })
})
