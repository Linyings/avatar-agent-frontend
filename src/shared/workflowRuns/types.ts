export type WorkflowRunStatus = 'running' | 'interrupted' | 'blocked' | 'finalizing' | 'succeeded' | 'cancelled' | 'expired'
export type WorkflowBillingStatus = 'pending' | 'confirmed' | 'released'
export type WorkflowStepStatus = 'running' | 'succeeded' | 'interrupted' | 'failed' | 'blocked'
export type WorkflowClientType = 'web' | 'pc'

export interface WorkflowUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  utf8_bytes?: number
  character_count?: number
  duration_seconds?: number
}

export interface WorkflowRun {
  id: string
  user_id: string
  project_id: string | null
  client_type: WorkflowClientType
  client_task_id: string | null
  client_project_name: string
  input_hash: string
  status: WorkflowRunStatus
  billing_status: WorkflowBillingStatus
  current_step_id: string | null
  last_error_code: string | null
  last_error_message: string | null
  final_result_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  client_instance_id: string
  lease_expires_at: string | null
  last_active_at: string
  expires_at: string
  created_at: string
  updated_at: string
  can_resume: boolean
  expires_in_seconds: number
  steps?: WorkflowStepExecution[]
}

export interface WorkflowStepExecution {
  id: string
  workflow_run_id: string
  step_id: string
  input_hash: string
  execution_key: string
  status: WorkflowStepStatus
  attempt_count: number
  provider_request_id: string | null
  provider_input_hash: string | null
  error_code: string | null
  error_message: string | null
  usage: WorkflowUsage
  lease_owner: string | null
  lease_expires_at: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface CreateWebWorkflowRunInput {
  clientType?: 'web'
  projectId: string
  inputHash: string
}

export interface CreatePCWorkflowRunInput {
  clientType: 'pc'
  clientTaskId: string
  clientProjectName: string
  inputHash: string
  inheritReservationsFromRunId?: string
}

export interface PCWorkflowProjectNameMapping {
  clientTaskId: string
  projectName: string
}

export interface PCProjectNameSyncResult {
  matched: number
  workflow_runs_updated: number
  ledger_records_updated: number
}

export type CreateWorkflowRunInput = CreateWebWorkflowRunInput | CreatePCWorkflowRunInput

export interface WorkflowRunHeartbeatInput {
  currentStepId?: string
}

export type WorkflowRunResumeInput = Readonly<Record<string, never>>

export interface WorkflowRunInterruptInput {
  errorCode?: string
  errorMessage?: string
}

export interface WorkflowRunCompleteInput {
  finalResultAt: string
}

export type WorkflowRunCancelInput = Readonly<Record<string, never>>

export interface WorkflowStepUpdateInput {
  inputHash: string
  status: WorkflowStepStatus
  preRegistered?: boolean
  providerRequestId?: string
  errorCode?: string
  errorMessage?: string
  usage?: WorkflowUsage
}

export interface WorkflowStructuredError {
  requestId?: string
  code: string
  message: string
  retryable: boolean
}
