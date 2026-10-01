import { describe, it, expect } from 'vitest'
import { getLeaderboard } from '../lib/glassbench-data'
import { METRIC_DECIMALS, formatDelta, formatMetric, formatRate, metricDecimals, metricDelta } from '../lib/format'
import type { Metric } from '../lib/types'

describe('metric formatting', () => {
  const board = getLeaderboard()

  it('knows the published precision of every metric on the board', () => {
    for (const m of board.metrics) expect(METRIC_DECIMALS[m.key], m.key).toBeTypeOf('number')
  })

  it('prints exactly the digits the scorer pipeline published — no more, no fewer', () => {
    // If the pipeline's precision for a metric changes, a published value stops
    // round-tripping at the precision the site prints it with, and this fails.
    for (const row of [...board.ranked, ...board.references]) {
      for (const m of board.metrics) {
        const v = row[m.key] as number
        expect(Number(formatMetric(m.key, v)), `${row.system}.${m.key}`).toBe(v)
      }
    }
  })

  it('formats each kind of value', () => {
    expect(formatMetric('glass_score', 54.34)).toBe('54.34')
    expect(formatMetric('glass_score', 6.2)).toBe('6.20')
    expect(formatMetric('cwr', 0.062)).toBe('0.062')
    expect(formatMetric('abst_rec_contradiction', 0.92)).toBe('0.92') // not 0.920
    expect(formatMetric('answered', 58)).toBe('58')
    expect(formatMetric('cwr', undefined)).toBe('—')
    expect(formatMetric('cwr', Number.NaN)).toBe('—')
    expect(metricDecimals('some_future_metric')).toBe(3)
    expect(formatRate(0.9375)).toBe('0.938')
    expect(formatRate(null)).toBe('—')
  })
})

describe('metric deltas (compare view)', () => {
  const lower: Metric = { key: 'cwr', label: 'CWR', direction: 'lower', scored: true, tooltip: '' }
  const higher: Metric = { key: 'glass_score', label: 'Glass', direction: 'higher', scored: true, tooltip: '' }

  it('is B − A at the metric’s precision and picks the better side by direction', () => {
    expect(metricDelta(lower, 0.062, 0.51)).toMatchObject({ delta: 0.448, better: 'a' })
    expect(metricDelta(lower, 0.51, 0.062)).toMatchObject({ delta: -0.448, better: 'b' })
    expect(metricDelta(higher, 54.34, 6.2)).toMatchObject({ delta: -48.14, better: 'a' })
    expect(metricDelta(higher, 6.2, 54.34)).toMatchObject({ delta: 48.14, better: 'b' })
  })

  it('calls equal values a tie and never prints a negative zero', () => {
    const d = metricDelta(higher, 0, 0)
    expect(d.better).toBe('tie')
    expect(Object.is(d.delta, -0)).toBe(false)
    expect(formatDelta('glass_score', d.delta)).toBe('0.00')
    expect(formatDelta('cwr', -0)).toBe('0.000')
  })

  it('signs deltas', () => {
    expect(formatDelta('cwr', 0.448)).toBe('+0.448')
    expect(formatDelta('cwr', -0.448)).toBe('−0.448')
    expect(formatDelta('answered', 34)).toBe('+34')
    expect(formatDelta('answered', -34)).toBe('−34')
  })
})
