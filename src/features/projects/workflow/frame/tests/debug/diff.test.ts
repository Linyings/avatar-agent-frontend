import { describe, expect, it } from 'vitest'
import { diffFrameDebugRuns } from '../../debug/diff'
import type { FrameDebugRun } from '../../types'

const baseRun: FrameDebugRun = {
  id: 'run-a',
  projectId: 'project-1',
  mode: 'dry-run',
  status: 'success',
  createdAt: '2026-05-04T00:00:00.000Z',
  updatedAt: '2026-05-04T00:00:00.000Z',
  records: {
    'decide-timeline-view': {
      id: 'decide-timeline-view',
      status: 'success',
      input: {
        defaultNFrames: 10,
        maxDecisions: 8,
      },
      outputSummary: {
        decisions: 2,
      },
      durationMs: 12,
    },
  },
}

describe('workflow/frame/debug/diff', () => {
  it('报告输入参数和输出摘要变化', () => {
    const diff = diffFrameDebugRuns(baseRun, {
      ...baseRun,
      id: 'run-b',
      records: {
        'decide-timeline-view': {
          ...baseRun.records['decide-timeline-view']!,
          input: {
            defaultNFrames: 4,
            maxDecisions: 3,
          },
          outputSummary: {
            decisions: 1,
          },
        },
      },
    })

    expect(diff).toEqual(expect.arrayContaining([
      expect.objectContaining({
        stepId: 'decide-timeline-view',
        path: 'input.defaultNFrames',
        before: 10,
        after: 4,
      }),
      expect.objectContaining({
        stepId: 'decide-timeline-view',
        path: 'input.maxDecisions',
        before: 8,
        after: 3,
      }),
      expect.objectContaining({
        stepId: 'decide-timeline-view',
        path: 'outputSummary.decisions',
        before: 2,
        after: 1,
      }),
    ]))
  })

  it('报告状态变化和失败信息', () => {
    const diff = diffFrameDebugRuns(baseRun, {
      ...baseRun,
      records: {
        'decide-timeline-view': {
          id: 'decide-timeline-view',
          status: 'error',
          error: '模型调用失败',
        },
      },
    })

    expect(diff).toEqual(expect.arrayContaining([
      expect.objectContaining({
        stepId: 'decide-timeline-view',
        path: 'status',
        before: 'success',
        after: 'error',
      }),
      expect.objectContaining({
        stepId: 'decide-timeline-view',
        path: 'error',
        before: undefined,
        after: '模型调用失败',
      }),
    ]))
  })

  it('缺少步骤时不抛错并报告 missing diff', () => {
    const diff = diffFrameDebugRuns(baseRun, {
      ...baseRun,
      records: {},
    })

    expect(diff.some((item) => item.stepId === 'decide-timeline-view' && item.path === 'status')).toBe(true)
  })
})
