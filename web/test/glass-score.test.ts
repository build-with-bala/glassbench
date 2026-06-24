import { describe, it, expect } from 'vitest'
import { glassScore, dialOutcome } from '../lib/glass-score'

describe('glass score', () => {
  it('harmonic mean is zero if a pillar is zero', () => {
    expect(glassScore({ answerableAccuracy: 0.9, abstRecContra: 0, abstRecFp: 0, cwr: 0 })).toBe(0)
    expect(glassScore({ answerableAccuracy: 0, abstRecContra: 1, abstRecFp: 1, cwr: 0 })).toBe(0)
  })

  it('a perfect router scores 100', () => {
    expect(glassScore({ answerableAccuracy: 1, abstRecContra: 1, abstRecFp: 1, cwr: 0 })).toBeCloseTo(100, 6)
  })

  it('every fixed confidence games to 0', () => {
    for (const c of [0.0, 0.49, 0.5, 0.6, 0.69, 1.0]) {
      expect(dialOutcome(c).glass).toBeCloseTo(0, 6)
    }
  })

  it('explains which pillar collapses', () => {
    expect(dialOutcome(0.69).explain).toMatch(/safety pillar = 0/)
    expect(dialOutcome(0.2).explain).toMatch(/answer pillar = 0/)
  })
})
