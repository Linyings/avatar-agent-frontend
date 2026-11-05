import { describe, expect, it } from 'vitest'
import type { FrameInferenceConfig } from '@/features/projects/services/material/frameInferencePipelineService'
import { buildFrameWorkflowIntentSnapshot, getFrameWorkflowBackendProjectId } from './types'

describe('getFrameWorkflowBackendProjectId', () => {
  it('keeps the project ID for the web workflow but omits it for an explicit local workflow', () => {
    expect(getFrameWorkflowBackendProjectId({ projectId: 'web-project' })).toBe('web-project')
    expect(getFrameWorkflowBackendProjectId({ projectId: 'local-checkpoint', backendProjectId: null })).toBeUndefined()
  })
})

describe('buildFrameWorkflowIntentSnapshot', () => {
  const config = (overrides: Partial<FrameInferenceConfig> = {}) => ({
    outputLanguage: 'zh-CN',
    defaultNFrames: 15,
    maxDecisions: 8,
    ...overrides,
  }) as FrameInferenceConfig

  it('persists normalized selection, narration and derived original ratios', () => {
    expect(buildFrameWorkflowIntentSnapshot(config({
      selectionRatio: 0.01,
      narrationRatio: 0.25,
    }))).toMatchObject({
      selectionRatio: 0.05,
      narrationRatio: 0.25,
      originalRatio: 75,
    })
  })

  it('uses the PC defaults and preserves an explicit original percentage', () => {
    expect(buildFrameWorkflowIntentSnapshot(config())).toMatchObject({
      selectionRatio: 0.3,
      narrationRatio: 0.5,
      originalRatio: 50,
    })
    expect(buildFrameWorkflowIntentSnapshot(config({
      selectionRatio: 2,
      narrationRatio: 0.9,
      originalRatio: 40,
    }))).toMatchObject({
      selectionRatio: 1,
      narrationRatio: 0.9,
      originalRatio: 40,
    })
  })
})
