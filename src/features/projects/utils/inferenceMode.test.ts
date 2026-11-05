import { describe, expect, it } from 'vitest'
import {
  isRetiredInferenceMode,
  persistInferenceMode,
  readStoredInferenceMode,
  resolveInferenceMode,
} from './inferenceMode'

describe('inferenceMode', () => {
  it('only persists the active frame mode for new projects', () => {
    persistInferenceMode('project-frame-mode', 'frame')
    expect(readStoredInferenceMode('project-frame-mode')).toBe('frame')
  })

  it('still recognizes retired modes from legacy project metadata', () => {
    expect(resolveInferenceMode('project-deep-mode', 'deep')).toBe('deep')
    expect(isRetiredInferenceMode('deep')).toBe(true)
    expect(isRetiredInferenceMode('shallow')).toBe(true)
    expect(isRetiredInferenceMode('frame')).toBe(false)
  })
})
