import { frameWorkflowSteps } from '../registry'
import type { FrameDebugRun, FrameDebugStepId, FrameWorkflowStep } from '../types'
import { clearExecutionRecords, cloneRecords, getExecutionSteps } from '../utils/records'

export const resetFrameWorkflowRunFromStep = (
  run: FrameDebugRun,
  startStepId: FrameDebugStepId,
  steps: FrameWorkflowStep[] = frameWorkflowSteps
) => {
  const records = cloneRecords(run.records)
  clearExecutionRecords(records, getExecutionSteps(steps, startStepId))
  const nextRun: FrameDebugRun = {
    ...run,
    startStepId,
    records,
  }
  delete nextRun.error
  return nextRun
}
