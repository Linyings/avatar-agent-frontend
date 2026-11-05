import type { WorkflowRequestIdentity } from '@/shared/workflowRuns/identity'

export type FrameQualityGateStage = 'timeline-decisions' | 'narrative-understanding'

export type FrameQualityGateProviderAttempt =
  | { kind: 'review', attempt: 1 | 2 }
  | { kind: 'refine', attempt: 1 }

export const createFrameQualityGateProviderIdentity = (
  identity: WorkflowRequestIdentity | undefined,
  providerAttempt: FrameQualityGateProviderAttempt,
): WorkflowRequestIdentity | undefined => {
  if (!identity) return undefined

  return {
    ...identity,
    workflowStepId: `${identity.workflowStepId}.quality-gate-${providerAttempt.kind}-${providerAttempt.attempt}`,
  }
}

export interface FrameWorkflowIntentSnapshot {
  outputLanguage: string
  narrationStyleId: string
  narrationStyleTitle: string
  outputDurationMs: number
  selectionRatio?: number
  narrationRatio: number
  originalRatio?: number
  wordCount: number
}

export type FrameQualityGateIssueSeverity = 'info' | 'warning' | 'error'

export interface FrameQualityGateIssue {
  code: string
  severity: FrameQualityGateIssueSeverity
  message: string
  evidence?: unknown
}

export interface FrameQualityGateAttempt<T> {
  kind: 'review' | 'refine'
  attempt: number
  passed: boolean
  issues: FrameQualityGateIssue[]
  output?: T
  model?: string
  tokensConsumed?: number
  requestId?: string
}

export interface FrameQualityGateOutcome<T> {
  status: 'accepted' | 'manual-review-required'
  acceptedOutput?: T
  attempts: FrameQualityGateAttempt<T>[]
  issues: FrameQualityGateIssue[]
  originalOutput: T
  refinedOutput?: T
  intent: FrameWorkflowIntentSnapshot
}
