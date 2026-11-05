import { frameWorkflowStepIds } from '../registry'
import type { FrameDebugStepId } from '../types'
import type { FrameDebugRun } from '../types'

export interface FrameWorkflowDiffItem {
  stepId: FrameDebugStepId
  path: string
  before: unknown
  after: unknown
  kind: 'added' | 'removed' | 'changed'
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

const stableStringify = (value: unknown) => {
  if (value === undefined) return 'undefined'
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const walkDiff = (
  stepId: FrameDebugStepId,
  path: string,
  before: unknown,
  after: unknown,
  items: FrameWorkflowDiffItem[]
) => {
  if (stableStringify(before) === stableStringify(after)) return

  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    keys.forEach((key) => {
      const nextPath = path ? `${path}.${key}` : key
      if (!Object.prototype.hasOwnProperty.call(after, key)) {
        items.push({ stepId, path: nextPath, before: before[key], after: undefined, kind: 'removed' })
      } else if (!Object.prototype.hasOwnProperty.call(before, key)) {
        items.push({ stepId, path: nextPath, before: undefined, after: after[key], kind: 'added' })
      } else {
        walkDiff(stepId, nextPath, before[key], after[key], items)
      }
    })
    return
  }

  items.push({
    stepId,
    path,
    before,
    after,
    kind: before === undefined ? 'added' : after === undefined ? 'removed' : 'changed',
  })
}

export const diffFrameDebugRuns = (before: FrameDebugRun, after: FrameDebugRun): FrameWorkflowDiffItem[] => {
  const items: FrameWorkflowDiffItem[] = []

  frameWorkflowStepIds.forEach((stepId) => {
    const previous = before.records[stepId]
    const next = after.records[stepId]

    walkDiff(stepId, 'status', previous?.status, next?.status, items)
    walkDiff(stepId, 'error', previous?.error, next?.error, items)
    walkDiff(stepId, 'durationMs', previous?.durationMs, next?.durationMs, items)
    walkDiff(stepId, 'input', previous?.input, next?.input, items)
    walkDiff(stepId, 'outputSummary', previous?.outputSummary, next?.outputSummary, items)
  })

  return items
}
