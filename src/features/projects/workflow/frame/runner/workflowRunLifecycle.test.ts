import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowRun, WorkflowStepExecution } from '@/shared/workflowRuns/types'
import {
  FrameWorkflowRunLifecycle,
  createFrameWorkflowInputHash,
  resolveFrameWorkflowInputHash,
  shouldResumeRemoteWorkflowRun,
  shouldRegisterWorkflowStep,
} from './workflowRunLifecycle'

const projectId = '0185f76a-9e4d-7ed6-9ef7-9f34e7e1b6fd'
const runId = '0185f76a-9e4d-7ed6-9ef7-9f34e7e1b6fd'

const makeRun = (overrides: Partial<WorkflowRun> = {}): WorkflowRun => ({
  id: runId,
  user_id: 'user-1',
  project_id: projectId,
  client_type: 'web',
  client_task_id: null,
  input_hash: 'a'.repeat(64),
  status: 'running',
  billing_status: 'pending',
  current_step_id: null,
  last_error_code: null,
  last_error_message: null,
  final_result_at: null,
  completed_at: null,
  cancelled_at: null,
  client_instance_id: 'web.tab-1',
  lease_expires_at: null,
  last_active_at: '2026-07-15T00:00:00.000Z',
  expires_at: '2026-07-16T00:00:00.000Z',
  created_at: '2026-07-15T00:00:00.000Z',
  updated_at: '2026-07-15T00:00:00.000Z',
  can_resume: true,
  expires_in_seconds: 86_400,
  ...overrides,
  client_project_name: overrides.client_project_name ?? '',
})

const makeClient = () => ({
  create: vi.fn().mockResolvedValue(makeRun()),
  resume: vi.fn().mockResolvedValue(makeRun()),
  heartbeat: vi.fn().mockResolvedValue(makeRun()),
  updateStep: vi.fn().mockResolvedValue({} as WorkflowStepExecution),
  interrupt: vi.fn().mockResolvedValue(makeRun({ status: 'interrupted' })),
  cancel: vi.fn().mockResolvedValue(makeRun({ status: 'cancelled' })),
  complete: vi.fn().mockResolvedValue(makeRun({ status: 'succeeded', billing_status: 'confirmed' })),
})

describe('workflow/frame/runner/workflowRunLifecycle', () => {
  it('tracks the image batch separately from legacy terminal image executions', async () => {
    const client = makeClient()
    client.updateStep.mockImplementation(async (_runId: string, stepId: string) => {
      if (stepId === 'analyze-timeline-images') throw new Error('409: legacy step already succeeded')
      return {} as WorkflowStepExecution
    })
    const lifecycle = new FrameWorkflowRunLifecycle(client)
    await lifecycle.ensure({ projectId, inputHash: 'a'.repeat(64), workflowRunId: runId })
    await lifecycle.beginStep('analyze-timeline-images')
    await lifecycle.failStep('analyze-timeline-images')
    await lifecycle.beginStep('analyze-timeline-images')
    await lifecycle.completeStep('analyze-timeline-images')
    expect(client.updateStep.mock.calls.map(([, stepId, input]) => [stepId, input.status])).toEqual([
      ['analyze-timeline-images.batch-v2', 'running'],
      ['analyze-timeline-images.batch-v2', 'failed'],
      ['analyze-timeline-images.batch-v2', 'running'],
      ['analyze-timeline-images.batch-v2', 'succeeded'],
    ])
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('hashes equivalent source/config metadata deterministically without reading file contents', async () => {
    const input = {
      projectId,
      files: [{ name: 'clip.mp4', size: 42, type: 'video/mp4', lastModified: 123 }],
      config: { voice: 'narrator', wordCount: 900, nested: { language: 'zh' } },
    }

    await expect(createFrameWorkflowInputHash(input)).resolves.toEqual(await createFrameWorkflowInputHash({
      ...input,
      config: { nested: { language: 'zh' }, wordCount: 900, voice: 'narrator' },
    }))
    await expect(createFrameWorkflowInputHash({ ...input, config: { ...input.config, wordCount: 901 } }))
      .resolves.not.toEqual(await createFrameWorkflowInputHash(input))
  })

  it('changes the input hash when selection or narration planning changes', async () => {
    const input = {
      projectId,
      files: [{ name: 'clip.mp4', size: 42, type: 'video/mp4', lastModified: 123 }],
      config: {
        selectionRatio: 0.3,
        outputDurationMs: 120_000,
        narrationRatio: 0.5,
        originalRatio: 50,
      },
    }
    const originalHash = await createFrameWorkflowInputHash(input)

    await expect(createFrameWorkflowInputHash({
      ...input,
      config: { ...input.config, selectionRatio: 0.35, outputDurationMs: 140_000 },
    })).resolves.not.toEqual(originalHash)
    await expect(createFrameWorkflowInputHash({
      ...input,
      config: { ...input.config, narrationRatio: 0.6, originalRatio: 40 },
    })).resolves.not.toEqual(originalHash)
  })

  it('keeps the persisted hash when OPFS recovery has no original File handle', () => {
    const persistedHash = 'a'.repeat(64)
    const calculatedHash = 'b'.repeat(64)

    expect(resolveFrameWorkflowInputHash({
      workflowRunId: runId,
      persistedHash,
      selectedFileCount: 0,
      calculatedHash,
    })).toBe(persistedHash)
    expect(resolveFrameWorkflowInputHash({
      workflowRunId: runId,
      persistedHash,
      selectedFileCount: 1,
      calculatedHash,
    })).toBe(calculatedHash)
  })

  it('does not register post-completion project persistence or an aggregate voiceover step during recovery', () => {
    expect(shouldRegisterWorkflowStep({ isResuming: true, stepId: 'generate-voiceover' })).toBe(false)
    expect(shouldRegisterWorkflowStep({ isResuming: true, stepId: 'compose-final-video' })).toBe(true)
    expect(shouldRegisterWorkflowStep({ isResuming: false, stepId: 'generate-voiceover' })).toBe(true)
    expect(shouldRegisterWorkflowStep({ isResuming: false, stepId: 'persist-project' })).toBe(false)
  })

  it('does not resume a terminal server run solely to retry project persistence', () => {
    expect(shouldResumeRemoteWorkflowRun({
      finalResultReadyAt: '2026-07-16T11:00:26.884Z',
      billingStatus: 'confirmed',
    })).toBe(false)
    expect(shouldResumeRemoteWorkflowRun({
      finalResultReadyAt: undefined,
      billingStatus: 'pending',
    })).toBe(true)
  })

  it('creates a new server run or resumes the matching run, then applies stable step identity', async () => {
    const client = makeClient()
    const lifecycle = new FrameWorkflowRunLifecycle(client)
    const inputHash = 'b'.repeat(64)

    await expect(lifecycle.ensure({ projectId, inputHash })).resolves.toMatchObject({ id: runId })
    expect(client.create).toHaveBeenCalledWith({ projectId, inputHash })

    await lifecycle.beginStep('validate-subtitles')
    expect(client.updateStep).toHaveBeenCalledWith(runId, 'validate-subtitles', {
      inputHash,
      status: 'running',
      preRegistered: true,
    })
    await lifecycle.completeStep('validate-subtitles')
    expect(client.updateStep).toHaveBeenLastCalledWith(runId, 'validate-subtitles', {
      inputHash,
      status: 'succeeded',
    })

    await lifecycle.failStep('generate-narration-script')
    expect(client.updateStep).toHaveBeenLastCalledWith(runId, 'generate-narration-script', {
      inputHash,
      status: 'failed',
    })

    await lifecycle.ensure({ projectId, inputHash, workflowRunId: runId })
    expect(client.resume).toHaveBeenCalledWith(runId)
  })

  it('heartbeats the active step every thirty seconds and stops when disposed', async () => {
    vi.useFakeTimers()
    const client = makeClient()
    const lifecycle = new FrameWorkflowRunLifecycle(client)
    await lifecycle.ensure({ projectId, inputHash: 'c'.repeat(64) })
    lifecycle.startHeartbeat(() => 'transcribe')

    await vi.advanceTimersByTimeAsync(30_000)
    expect(client.heartbeat).toHaveBeenCalledWith(runId, { currentStepId: 'transcribe' })

    lifecycle.dispose()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(client.heartbeat).toHaveBeenCalledTimes(1)
  })

  it('stops heartbeats when the server run is finalized', async () => {
    vi.useFakeTimers()
    const client = makeClient()
    const lifecycle = new FrameWorkflowRunLifecycle(client)
    await lifecycle.ensure({ projectId, inputHash: 'e'.repeat(64) })
    lifecycle.startHeartbeat(() => 'compose-final-video')

    await lifecycle.complete('2026-07-16T11:00:26.884Z')
    await vi.advanceTimersByTimeAsync(30_000)

    expect(client.heartbeat).not.toHaveBeenCalled()
  })

  it('uses interrupt for transient loss and cancel only for an explicit user cancellation', async () => {
    const client = makeClient()
    const lifecycle = new FrameWorkflowRunLifecycle(client)
    await lifecycle.ensure({ projectId, inputHash: 'd'.repeat(64) })

    await lifecycle.interrupt({ errorCode: 'network_unavailable', errorMessage: 'network unavailable' })
    await lifecycle.cancel()

    expect(client.interrupt).toHaveBeenCalledWith(runId, {
      errorCode: 'network_unavailable',
      errorMessage: 'network unavailable',
    })
    expect(client.cancel).toHaveBeenCalledWith(runId)
  })

  it('stops heartbeats before reporting an interruption that the server rejects', async () => {
    vi.useFakeTimers()
    const client = makeClient()
    client.interrupt.mockRejectedValueOnce(new Error('remote interruption rejected'))
    const lifecycle = new FrameWorkflowRunLifecycle(client)
    await lifecycle.ensure({ projectId, inputHash: 'f'.repeat(64) })
    lifecycle.startHeartbeat(() => 'generate-narration-script')

    await expect(lifecycle.interrupt({ errorCode: 'workflow_interrupted', errorMessage: 'operation failed' }))
      .rejects.toThrow('remote interruption rejected')
    await vi.advanceTimersByTimeAsync(30_000)

    expect(client.heartbeat).not.toHaveBeenCalled()
  })
})
