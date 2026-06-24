import { describe, it, expect } from 'vitest'
import { goodness, rampTint } from '../lib/color-ramp'

describe('color ramp', () => {
  it('lower-is-better inverts', () => {
    expect(goodness(0, { direction: 'lower' }, [0, 1])).toBe(1)
    expect(goodness(1, { direction: 'lower' }, [0, 1])).toBe(0)
  })

  it('higher-is-better keeps direction', () => {
    expect(goodness(1, { direction: 'higher' }, [0, 1])).toBe(1)
    expect(goodness(0, { direction: 'higher' }, [0, 1])).toBe(0)
  })

  it('clamps out-of-range values', () => {
    expect(goodness(5, { direction: 'higher' }, [0, 1])).toBe(1)
    expect(goodness(-5, { direction: 'higher' }, [0, 1])).toBe(0)
  })

  it('handles a degenerate range without dividing by zero', () => {
    expect(goodness(3, { direction: 'higher' }, [3, 3])).toBe(0)
  })

  it('tiers map to good/warn/danger', () => {
    expect(rampTint(0.9)).toBe('good')
    expect(rampTint(0.5)).toBe('warn')
    expect(rampTint(0.1)).toBe('danger')
  })
})
