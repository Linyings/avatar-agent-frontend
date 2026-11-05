import { afterEach, describe, expect, it } from 'vitest'

import {
  formatBudgetBytes,
  getBrowserVideoProcessingBudget,
} from './browserProcessingBudget'

const GB = 1024 * 1024 * 1024

const setDeviceMemory = (deviceMemory: number) => {
  Object.defineProperty(navigator, 'deviceMemory', {
    configurable: true,
    value: deviceMemory,
  })
}

afterEach(() => {
  delete (navigator as Navigator & { deviceMemory?: number }).deviceMemory
})

describe('getBrowserVideoProcessingBudget', () => {
  it('allows local source video budgets up to 2GB on high-memory devices', () => {
    setDeviceMemory(8)

    const budget = getBrowserVideoProcessingBudget('medium')

    expect(budget.maxSourceBytes).toBe(2 * GB)
    expect(budget.maxTotalInputBytes).toBe(2 * GB)
    expect(formatBudgetBytes(budget.maxSourceBytes)).toBe('2.0GB')
  })

  it('keeps the 2GB source size limit consistent across lower memory reports', () => {
    setDeviceMemory(4)

    const budget = getBrowserVideoProcessingBudget('medium')

    expect(budget.maxSourceBytes).toBe(2 * GB)
    expect(budget.maxTotalInputBytes).toBe(2 * GB)
  })
})
