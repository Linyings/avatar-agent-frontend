import type { WorkflowRun, WorkflowStepExecution } from '@/shared/workflowRuns/types'

export interface FrameWorkflowInputHashSource {
  projectId: string
  files: ReadonlyArray<{
    name: string
    size: number
    type: string
    lastModified: number
  }>
  config: unknown
}

export interface WorkflowRunLifecycleApi {
  create(input: { projectId: string; inputHash: string }): Promise<WorkflowRun>
  resume(runId: string): Promise<WorkflowRun>
  heartbeat(runId: string, input: { currentStepId?: string }): Promise<WorkflowRun>
  updateStep(runId: string, stepId: string, input: {
    inputHash: string
    status: 'running' | 'succeeded' | 'interrupted' | 'failed' | 'blocked'
  }): Promise<WorkflowStepExecution>
  interrupt(runId: string, input: { errorCode?: string; errorMessage?: string }): Promise<WorkflowRun>
  cancel(runId: string): Promise<WorkflowRun>
  complete(runId: string, input: { finalResultAt: string }): Promise<WorkflowRun>
}

export interface EnsureWorkflowRunInput {
  projectId: string
  inputHash: string
  workflowRunId?: string
}

export interface ResolveFrameWorkflowInputHashInput {
  workflowRunId?: string
  persistedHash?: string
  selectedFileCount: number
  calculatedHash: string
}

const HEARTBEAT_INTERVAL_MS = 30_000

// Legacy image requests completed the parent after the first image. A new
// aggregate identity lets those interrupted runs recover without reopening a
// terminal provider execution or changing its existing billing reservation.
export const frameWorkflowServerStepId = (stepId: string): string => (
  stepId === 'analyze-timeline-images' ? 'analyze-timeline-images.batch-v2' : stepId
)

const stableValue = (value: unknown): unknown => {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(stableValue)

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined && typeof entry !== 'function' && typeof entry !== 'symbol')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)])
  )
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')

export const createFrameWorkflowInputHash = async (input: FrameWorkflowInputHashSource): Promise<string> => {
  if (!crypto?.subtle) {
    throw new Error('当前环境不支持工作流输入哈希')
  }

  const normalized = stableValue({
    projectId: input.projectId,
    files: input.files.map(file => ({
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
    })),
    config: input.config,
  })
  const bytes = new TextEncoder().encode(JSON.stringify(normalized))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return toHex(new Uint8Array(digest))
}

export const resolveFrameWorkflowInputHash = ({
  workflowRunId,
  persistedHash,
  selectedFileCount,
  calculatedHash,
}: ResolveFrameWorkflowInputHashInput): string => (
  workflowRunId && persistedHash && selectedFileCount === 0
    ? persistedHash
    : calculatedHash
)

export const shouldRegisterWorkflowStep = ({
  isResuming,
  stepId,
}: {
  isResuming: boolean
  stepId: string
}): boolean => (
  stepId !== 'persist-project'
  && !(isResuming && stepId === 'generate-voiceover')
)

export const shouldResumeRemoteWorkflowRun = ({
  finalResultReadyAt,
  billingStatus,
}: {
  finalResultReadyAt?: string
  billingStatus?: string
}): boolean => !(finalResultReadyAt && billingStatus === 'confirmed')

export class FrameWorkflowRunLifecycle {
  private readonly api: WorkflowRunLifecycleApi
  private run: WorkflowRun | null = null
  private inputHash: string | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  constructor(api: WorkflowRunLifecycleApi) {
    this.api = api
  }

  get workflowRun(): WorkflowRun | null {
    return this.run
  }

  get workflowInputHash(): string | null {
    return this.inputHash
  }

  async ensure(input: EnsureWorkflowRunInput): Promise<WorkflowRun> {
    const run = input.workflowRunId
      ? await this.api.resume(input.workflowRunId)
      : await this.api.create({ projectId: input.projectId, inputHash: input.inputHash })

    this.run = run
    this.inputHash = input.inputHash
    return run
  }

  async beginStep(stepId: string): Promise<WorkflowStepExecution> {
    return this.updateStep(stepId, 'running', true)
  }

  async completeStep(stepId: string): Promise<WorkflowStepExecution> {
    return this.updateStep(stepId, 'succeeded')
  }

  async failStep(stepId: string): Promise<WorkflowStepExecution> {
    return this.updateStep(stepId, 'failed')
  }

  async interrupt(input: { errorCode?: string; errorMessage?: string } = {}): Promise<WorkflowRun> {
    // Stop renewing the lease before notifying the server. A failed network
    // notification must not leave an interrupted browser task alive forever.
    this.stopHeartbeat()
    const { id } = this.requireRun()
    const run = await this.api.interrupt(id, input)
    this.run = run
    return run
  }

  async cancel(): Promise<WorkflowRun> {
    this.stopHeartbeat()
    const { id } = this.requireRun()
    const run = await this.api.cancel(id)
    this.run = run
    return run
  }

  async complete(finalResultAt: string): Promise<WorkflowRun> {
    const { id } = this.requireRun()
    const run = await this.api.complete(id, { finalResultAt })
    this.run = run
    this.stopHeartbeat()
    return run
  }

  startHeartbeat(currentStepId: () => string | null | undefined): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      const run = this.run
      if (!run) return
      void this.api.heartbeat(run.id, { currentStepId: currentStepId() ?? undefined }).catch(() => {
        // A foreground operation will surface the structured error and persist an interruption.
      })
    }, HEARTBEAT_INTERVAL_MS)
  }

  stopHeartbeat(): void {
    if (!this.heartbeatTimer) return
    clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
  }

  dispose(): void {
    this.stopHeartbeat()
  }

  private requireRun(): WorkflowRun {
    if (!this.run) throw new Error('工作流运行尚未创建')
    return this.run
  }

  private requireInputHash(): string {
    if (!this.inputHash) throw new Error('工作流输入哈希尚未创建')
    return this.inputHash
  }

  private updateStep(
    stepId: string,
    status: 'running' | 'succeeded' | 'interrupted' | 'failed' | 'blocked',
    preRegistered = false
  ): Promise<WorkflowStepExecution> {
    const { id } = this.requireRun()
    return this.api.updateStep(id, frameWorkflowServerStepId(stepId), {
      inputHash: this.requireInputHash(),
      status,
      ...(preRegistered ? { preRegistered: true } : {}),
    })
  }
}
