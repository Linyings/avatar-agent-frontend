import { authenticatedFetch } from '@/features/auth/services/authService'
import { parseRetryAfter, retryFetch, type Fetcher } from '@/shared/utils/network'
import {
  getWorkflowClientInstanceId,
  validateWorkflowClientInstanceId,
  validateWorkflowRequestIdentity,
} from './identity'
import type {
  CreateWorkflowRunInput,
  PCProjectNameSyncResult,
  PCWorkflowProjectNameMapping,
  WorkflowRun,
  WorkflowRunCancelInput,
  WorkflowRunCompleteInput,
  WorkflowRunHeartbeatInput,
  WorkflowRunInterruptInput,
  WorkflowRunResumeInput,
  WorkflowStepExecution,
  WorkflowStepUpdateInput,
  WorkflowStructuredError,
} from './types'

export class WorkflowRunRequestError extends Error implements WorkflowStructuredError {
  readonly status: number
  readonly requestId?: string
  readonly code: string
  readonly retryable: boolean
  readonly retryAfterMs?: number

  constructor({ status, requestId, code, message, retryable, retryAfterMs }: {
    status: number
    requestId?: string
    code: string
    message: string
    retryable: boolean
    retryAfterMs?: number
  }) {
    super(message)
    this.name = 'WorkflowRunRequestError'
    this.status = status
    this.requestId = requestId
    this.code = code
    this.retryable = retryable
    this.retryAfterMs = retryAfterMs
  }
}

export class WorkflowBlockedError extends WorkflowRunRequestError {
  constructor(error: ConstructorParameters<typeof WorkflowRunRequestError>[0]) {
    super({ ...error, retryable: false })
    this.name = 'WorkflowBlockedError'
  }
}

export interface WorkflowRunClientOptions {
  baseUrl?: string
  authenticatedFetcher?: Fetcher
  clientInstanceId?: string
}

function apiBaseUrl(baseUrl?: string): string {
  return (baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
}

// The backend deliberately persists only a small, non-content-bearing set of
// workflow diagnostics. Keep the detailed error in the UI/checkpoint, while
// translating it to a valid server-side status diagnostic.
const workflowInterruptDiagnosticMessages = new Set([
  'authentication required',
  'insufficient credits',
  'invalid provider output',
  'invalid provider response',
  'local resource unavailable',
  'network unavailable',
  'operation failed',
  'operation interrupted',
  'provider returned content but omitted token usage',
  'provider rate limited',
  'provider rejected the request',
  'provider temporarily unavailable',
  'provider unavailable',
  'request timed out',
])

function normalizeWorkflowInterruptInput(input: WorkflowRunInterruptInput): WorkflowRunInterruptInput {
  const errorMessage = input.errorMessage?.trim().toLowerCase()
  if (!errorMessage || workflowInterruptDiagnosticMessages.has(errorMessage)) {
    return input
  }
  return { ...input, errorMessage: 'operation failed' }
}

function validateCreateWorkflowRunInput(input: CreateWorkflowRunInput): CreateWorkflowRunInput {
  const inputHash = input.inputHash.trim().toLowerCase()
  const validInputHash = /^[a-f0-9]{64}$/.test(inputHash)
  if (!validInputHash) {
    throw new Error('Invalid workflow run create input')
  }

  if (input.clientType === 'pc') {
    const clientTaskId = input.clientTaskId.trim()
    const clientProjectName = input.clientProjectName.trim()
    const validClientTaskId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(clientTaskId)
    if (!validClientTaskId || clientProjectName.length === 0 || clientProjectName.length > 200) {
      throw new Error('Invalid workflow run create input')
    }
    return {
      clientType: 'pc',
      clientTaskId,
      clientProjectName,
      inputHash,
      ...(input.inheritReservationsFromRunId ? { inheritReservationsFromRunId: input.inheritReservationsFromRunId } : {}),
    }
  }

  const projectId = input.projectId.trim()
  const validProjectId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)
  if (!validProjectId) {
    throw new Error('Invalid workflow run create input')
  }
  return { clientType: 'web', projectId, inputHash }
}

function validatePCProjectNameMappings(items: PCWorkflowProjectNameMapping[]): PCWorkflowProjectNameMapping[] {
  if (items.length > 100) {
    throw new Error('Invalid PC project name sync input')
  }

  return items.map((item) => {
    const clientTaskId = item.clientTaskId.trim()
    const projectName = item.projectName.trim()
    const validClientTaskId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(clientTaskId)
    if (!validClientTaskId || projectName.length === 0 || projectName.length > 200) {
      throw new Error('Invalid PC project name sync input')
    }
    return { clientTaskId, projectName }
  })
}

function parseErrorPayload(value: unknown): WorkflowStructuredError {
  const payload = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    requestId: typeof payload.request_id === 'string' ? payload.request_id : undefined,
    code: typeof payload.code === 'string' ? payload.code : 'workflow_request_failed',
    message: typeof payload.message === 'string' ? payload.message : 'Workflow request failed',
    retryable: payload.retryable === true,
  }
}

async function parseWorkflowError(response: Response): Promise<WorkflowRunRequestError> {
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    payload = undefined
  }
  const structured = parseErrorPayload(payload)
  const details = {
    status: response.status,
    ...structured,
    retryAfterMs: parseRetryAfter(response.headers.get('Retry-After')),
  }
  return response.status === 402 ? new WorkflowBlockedError(details) : new WorkflowRunRequestError(details)
}

function unwrapData<T>(value: unknown): T {
  if (value && typeof value === 'object' && 'data' in value) {
    return (value as { data: T }).data
  }
  return value as T
}

export class WorkflowRunClient {
  private readonly baseUrl: string
  private readonly fetcher: Fetcher
  private readonly clientInstanceId: string

  constructor(options: WorkflowRunClientOptions = {}) {
    this.baseUrl = apiBaseUrl(options.baseUrl)
    this.fetcher = options.authenticatedFetcher ?? authenticatedFetch
    this.clientInstanceId = validateWorkflowClientInstanceId(options.clientInstanceId ?? getWorkflowClientInstanceId())
  }

  async create(input: CreateWorkflowRunInput): Promise<WorkflowRun> {
    const validInput = validateCreateWorkflowRunInput(input)
    if (validInput.clientType === 'pc') {
      return this.request('/', 'POST', {
        client_type: 'pc',
        client_task_id: validInput.clientTaskId,
        client_project_name: validInput.clientProjectName,
        input_hash: validInput.inputHash,
        client_instance_id: this.clientInstanceId,
        ...(validInput.inheritReservationsFromRunId
          ? { inherit_reservations_from_run_id: validInput.inheritReservationsFromRunId }
          : {}),
      })
    }
    return this.request('/', 'POST', {
      client_type: 'web',
      project_id: validInput.projectId,
      input_hash: validInput.inputHash,
      client_instance_id: this.clientInstanceId,
    })
  }

  async syncPCProjectNames(items: PCWorkflowProjectNameMapping[]): Promise<PCProjectNameSyncResult> {
    const validItems = validatePCProjectNameMappings(items)
    return await this.request('/pc/project-names/sync', 'POST', {
      items: validItems.map(item => ({
        client_task_id: item.clientTaskId,
        project_name: item.projectName,
      })),
    })
  }

  get(runId: string): Promise<WorkflowRun> {
    return this.request(`/${encodeURIComponent(runId)}`, 'GET')
  }

  heartbeat(runId: string, input: WorkflowRunHeartbeatInput = {}): Promise<WorkflowRun> {
    return this.request(`/${encodeURIComponent(runId)}/heartbeat`, 'POST', {
      client_instance_id: this.clientInstanceId,
      ...(input.currentStepId ? { current_step_id: input.currentStepId } : {}),
    })
  }

  resume(runId: string, _input: WorkflowRunResumeInput = {}): Promise<WorkflowRun> {
    return this.request(`/${encodeURIComponent(runId)}/resume`, 'POST', { client_instance_id: this.clientInstanceId })
  }

  interrupt(runId: string, input: WorkflowRunInterruptInput = {}): Promise<WorkflowRun> {
    const validInput = normalizeWorkflowInterruptInput(input)
    return this.request(`/${encodeURIComponent(runId)}/interrupt`, 'POST', {
      client_instance_id: this.clientInstanceId,
      ...(validInput.errorCode ? { error_code: validInput.errorCode } : {}),
      ...(validInput.errorMessage ? { error_message: validInput.errorMessage } : {}),
    })
  }

  complete(runId: string, input: WorkflowRunCompleteInput): Promise<WorkflowRun> {
    return this.request(`/${encodeURIComponent(runId)}/complete`, 'POST', { final_result_at: input.finalResultAt })
  }

  cancel(runId: string, _input: WorkflowRunCancelInput = {}): Promise<WorkflowRun> {
    return this.request(`/${encodeURIComponent(runId)}/cancel`, 'POST')
  }

  updateStep(runId: string, stepId: string, input: WorkflowStepUpdateInput): Promise<WorkflowStepExecution> {
    const identity = validateWorkflowRequestIdentity({
      workflowRunId: runId,
      workflowStepId: stepId,
      workflowInputHash: input.inputHash,
      clientInstanceId: this.clientInstanceId,
    })
    return this.request(`/${encodeURIComponent(runId)}/steps/${encodeURIComponent(stepId)}`, 'PUT', {
      input_hash: identity.workflowInputHash,
      status: input.status,
      client_instance_id: identity.clientInstanceId,
      ...(input.preRegistered ? { pre_registered: true } : {}),
      ...(input.providerRequestId ? { provider_request_id: input.providerRequestId } : {}),
      ...(input.errorCode ? { error_code: input.errorCode } : {}),
      ...(input.errorMessage ? { error_message: input.errorMessage } : {}),
      ...(input.usage ? { usage: input.usage } : {}),
    })
  }

  private async request<T>(path: string, method: string, body?: Record<string, unknown>): Promise<T> {
    const response = await retryFetch(`${this.baseUrl}/api/v1/workflow-runs${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }, { fetcher: this.fetcher })
    if (!response.ok) {
      throw await parseWorkflowError(response)
    }
    return unwrapData<T>(await response.json())
  }
}
