import { frameWorkflowSteps } from '../registry'
import type { FrameDebugRun, FrameDebugStepId, FrameDebugStepRecord, FrameDebugStepStatus, FrameWorkflowStep } from '../types'

export interface FrameWorkflowStepProgress {
  value: number
  determinate: boolean
}

export interface FrameWorkflowDisplayStepState {
  record?: FrameDebugStepRecord
  status: FrameDebugStepStatus
  isActive: boolean
  isComplete: boolean
  progress: FrameWorkflowStepProgress
}

const clampPercentage = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

const readPercentage = (record?: FrameDebugStepRecord) => {
  const raw = record?.progress?.percentage
  return typeof raw === 'number' && Number.isFinite(raw) ? clampPercentage(raw) : null
}

export const isFrameWorkflowStepComplete = (record?: FrameDebugStepRecord) => (
  record?.status === 'success' || record?.status === 'skipped'
)

export const getFrameWorkflowStepProgress = (record?: FrameDebugStepRecord): FrameWorkflowStepProgress => {
  if (!record) return { value: 0, determinate: true }
  if (isFrameWorkflowStepComplete(record)) return { value: 100, determinate: true }
  if (record.status === 'error') return { value: 100, determinate: true }
  if (record.status === 'cancelled' || record.status === 'interrupted') {
    return { value: readPercentage(record) ?? 0, determinate: true }
  }

  if (record.status === 'running') {
    const explicitPercentage = readPercentage(record)
    if (explicitPercentage !== null) return { value: explicitPercentage, determinate: true }
    return { value: 0, determinate: false }
  }

  return { value: 0, determinate: true }
}

export const getFrameWorkflowStepWeight = (step: FrameWorkflowStep) => (
  typeof step.progressWeight === 'number' && Number.isFinite(step.progressWeight) && step.progressWeight > 0
    ? step.progressWeight
    : 1
)

export const getFrameWorkflowProgress = (
  run: FrameDebugRun | null | undefined,
  steps: FrameWorkflowStep[] = frameWorkflowSteps
) => {
  if (!run) return 0

  const totalWeight = steps.reduce((sum, step) => sum + getFrameWorkflowStepWeight(step), 0) || 1
  const weightedProgress = steps.reduce((sum, step) => {
    const progress = getFrameWorkflowStepProgress(run.records[step.id])
    return sum + getFrameWorkflowStepWeight(step) * (progress.value / 100)
  }, 0)

  return clampPercentage((weightedProgress / totalWeight) * 100)
}

export const getFrameWorkflowCompletedCount = (
  run: FrameDebugRun | null | undefined,
  steps: FrameWorkflowStep[] = frameWorkflowSteps
) => steps.filter(step => isFrameWorkflowStepComplete(run?.records[step.id])).length

export const getFrameWorkflowResumeStepId = (
  run: FrameDebugRun | null | undefined,
  steps: FrameWorkflowStep[] = frameWorkflowSteps
): FrameDebugStepId => {
  const requestedStep = run?.startStepId
    ? steps.find(step => step.id === run.startStepId)
    : undefined

  if (requestedStep && !isFrameWorkflowStepComplete(run?.records[requestedStep.id])) {
    return requestedStep.id
  }

  return steps.find(step => !isFrameWorkflowStepComplete(run?.records[step.id]))?.id ?? steps[0].id
}

export const getFrameWorkflowDisplayStepState = (
  run: FrameDebugRun | null | undefined,
  step: FrameWorkflowStep,
  activeStepId: FrameDebugStepId | null | undefined
): FrameWorkflowDisplayStepState => {
  const rawRecord = run?.records[step.id]
  const rawStatus = rawRecord?.status
  const isActive = activeStepId === step.id && rawStatus === 'running'
  const isComplete = isFrameWorkflowStepComplete(rawRecord)
  const isErrored = rawStatus === 'error'
  const isCancelled = rawStatus === 'cancelled'
  const isInterrupted = rawStatus === 'interrupted'
  const record = isActive || isComplete || isErrored || isCancelled || isInterrupted ? rawRecord : undefined
  const completeStatus: FrameDebugStepStatus = rawStatus === 'skipped' ? 'skipped' : 'success'
  const status: FrameDebugStepStatus = isActive
    ? 'running'
    : isComplete
      ? completeStatus
      : isErrored
        ? 'error'
        : isInterrupted
          ? 'interrupted'
          : isCancelled
            ? 'cancelled'
            : 'idle'

  return {
    record,
    status,
    isActive,
    isComplete,
    progress: isActive || isCancelled || isInterrupted
      ? getFrameWorkflowStepProgress(record)
      : { value: 0, determinate: true },
  }
}

export const getFrameWorkflowDisplayRun = (
  run: FrameDebugRun | null | undefined,
  steps: FrameWorkflowStep[] = frameWorkflowSteps,
  activeStepId?: FrameDebugStepId | null
): FrameDebugRun | null => {
  if (!run) return null
  const activeIndex = activeStepId
    ? steps.findIndex(step => step.id === activeStepId)
    : -1
  const firstIncompleteIndex = steps.findIndex(step => !isFrameWorkflowStepComplete(run.records[step.id]))
  const runningIndex = steps.reduce(
    (latestIndex, step, index) => run.records[step.id]?.status === 'running' ? index : latestIndex,
    -1
  )
  const frontierIndex = activeIndex >= 0
    ? activeIndex
    : runningIndex >= 0
      ? runningIndex
      : firstIncompleteIndex >= 0
        ? firstIncompleteIndex
        : steps.length - 1
  const visibleStepIds = new Set(steps.slice(0, frontierIndex + 1).map(step => step.id))
  const records = Object.fromEntries(
    Object.entries(run.records).filter(([stepId]) => visibleStepIds.has(stepId as typeof steps[number]['id']))
  ) as FrameDebugRun['records']

  return {
    ...run,
    records,
  }
}
