import type { WorkflowProgressItem } from '@/features/projects/components/workflow/WorkflowProgressModal'
import {
  getFrameWorkflowDisplayStepState,
  type FrameDebugRun,
  type FrameDebugStepId,
  type FrameDebugStepRecord,
  type FrameWorkflowStep,
} from '@/features/projects/workflow/frame'

type ResolveStepMessage = (record?: FrameDebugStepRecord) => string | undefined

export const buildFrameWorkflowProgressItems = (
  run: FrameDebugRun | null,
  activeStepId: FrameDebugStepId | null,
  steps: FrameWorkflowStep[],
  resolveMessage: ResolveStepMessage,
): WorkflowProgressItem[] => steps.map((step, index) => {
  const state = getFrameWorkflowDisplayStepState(run, step, activeStepId)
  const status: WorkflowProgressItem['status'] = state.isActive
    ? 'running'
    : state.isComplete
      ? 'completed'
      : state.status === 'error'
        ? 'failed'
        : 'pending'

  return {
    id: step.id,
    index: index + 1,
    label: step.label,
    status,
    progress: state.record && state.progress.determinate
      ? state.isComplete || state.status === 'error'
        ? 100
        : state.progress.value
      : undefined,
    message: state.record ? resolveMessage(state.record) : undefined,
  }
})
