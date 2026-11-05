import type { FrameDebugRun, FrameDebugStepId, FrameDebugStepRecords, FrameWorkflowStep } from '../types'

export const createFrameDebugRunId = () => `frame-debug-${Date.now()}-${Math.random().toString(16).slice(2)}`

export const cloneRecords = (records?: FrameDebugStepRecords): FrameDebugStepRecords => {
  if (!records) return {}
  return Object.fromEntries(
    Object.entries(records).map(([key, value]) => [key, { ...value }])
  ) as FrameDebugStepRecords
}

export const makeTimestamp = (now: () => Date) => now().toISOString()

export const hasMeaningfulPersistenceValue = (value: unknown) => {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0
  return true
}

export const requireOutput = <T>(records: FrameDebugStepRecords, stepId: FrameDebugStepId): T => {
  const record = records[stepId]
  if (!record || record.status !== 'success' || record.output === undefined) {
    throw new Error(`缺少依赖步骤 ${stepId} 的成功输出`)
  }
  return record.output as T
}

export const successfulOutput = <T>(run: FrameDebugRun, stepId: FrameDebugStepId): T | undefined => {
  const record = run.records[stepId]
  return record?.status === 'success' && record.output !== undefined ? record.output as T : undefined
}

export const getExecutionSteps = (
  steps: FrameWorkflowStep[],
  startStepId?: FrameDebugStepId
) => {
  const startIndex = startStepId ? steps.findIndex((step) => step.id === startStepId) : 0
  if (startIndex < 0) throw new Error(`未知通用模式调试步骤: ${startStepId}`)
  return steps.slice(startIndex)
}

export const clearExecutionRecords = (
  records: FrameDebugStepRecords,
  executionSteps: FrameWorkflowStep[]
) => {
  executionSteps.forEach((step) => {
    delete records[step.id]
  })
}
