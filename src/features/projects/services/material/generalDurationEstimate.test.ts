import { describe, expect, it } from 'vitest'
import { estimateGeneralDuration } from './generalDurationEstimate'

describe('general mode empirical duration estimate', () => {
  it('matches the observed 20 and 40 minute ranges at 30%', () => {
    expect(estimateGeneralDuration(20 * 60_000)).toEqual({ minMs: 120_000, maxMs: 180_000 })
    expect(estimateGeneralDuration(40 * 60_000)).toEqual({ minMs: 180_000, maxMs: 300_000 })
    expect(estimateGeneralDuration(30 * 60_000)).toEqual({ minMs: 150_000, maxMs: 240_000 })
  })
  it('scales with selection without exceeding the source or inventing missing duration', () => {
    expect(estimateGeneralDuration(40 * 60_000, 0.6)).toEqual({ minMs: 360_000, maxMs: 600_000 })
    for (const duration of [0, -1, NaN, Infinity]) expect(estimateGeneralDuration(duration)).toEqual({ minMs: 0, maxMs: 0 })
    expect(estimateGeneralDuration(10_000, 1).maxMs).toBeLessThanOrEqual(10_000)
  })
})
