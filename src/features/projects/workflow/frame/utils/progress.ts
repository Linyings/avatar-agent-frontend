import type { FrameDebugStepId, FrameWorkflowRuntimeContext } from '../types'

export const clampProgress = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

export const updateWorkflowStepProgress = (
  context: FrameWorkflowRuntimeContext,
  stepId: FrameDebugStepId,
  percentage: number | null,
  message: string,
  extra?: Record<string, unknown>
) => {
  context.updateStepProgress?.(stepId, {
    ...(percentage === null ? {} : { percentage: clampProgress(percentage) }),
    message,
    ...extra,
  })
}

export const mapProgressRange = (
  value: number,
  inputStart: number,
  inputEnd: number,
  outputStart: number,
  outputEnd: number
) => {
  const inputSpan = inputEnd - inputStart || 1
  const ratio = (Math.max(inputStart, Math.min(inputEnd, value)) - inputStart) / inputSpan
  return outputStart + ratio * (outputEnd - outputStart)
}