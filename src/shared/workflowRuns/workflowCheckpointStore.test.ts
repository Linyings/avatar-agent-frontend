import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  WORKFLOW_CHECKPOINT_STORAGE_PREFIX,
  createWorkflowCheckpointStore,
  type WorkflowCheckpointInput,
  type WorkflowFinalizationOutboxInput,
} from './workflowCheckpointStore'

const projectId = '0185f76a-9e4d-7ed6-9ef7-9f34e7e1b6fd'
const workflowRunId = '0185f76a-9e4d-7ed6-9ef7-9f34e7e1b6fe'
const executionId = '0185f76a-9e4d-7ed6-9ef7-9f34e7e1b6ff'
const inputHash = 'A'.repeat(64)
const now = new Date('2026-07-16T08:00:00.000Z')

function checkpoint(overrides: Partial<WorkflowCheckpointInput> = {}): WorkflowCheckpointInput {
  return {
    projectId,
    workflowRunId,
    workflowInputHash: inputHash,
    clientInstanceId: 'web.checkpoint-test',
    interrupted: false,
    updatedAt: '2026-07-16T07:59:00.000Z',
    steps: [{
      executionId,
      stepId: 'transcribe.audio',
      status: 'succeeded',
      startedAt: '2026-07-16T07:55:00.000Z',
      completedAt: '2026-07-16T07:58:00.000Z',
      summary: 'Audio transcript prepared',
      progress: 100,
    }],
    ...overrides,
  }
}

describe('workflow checkpoint store', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('saves and loads only serializable checkpoint metadata by project ID', async () => {
    const store = createWorkflowCheckpointStore({ indexedDb: null, storage: localStorage, now: () => now })

    await store.saveCheckpoint({
      ...checkpoint(),
      ignoredRawInput: { prompt: 'must not persist' },
      steps: [{
        ...checkpoint().steps[0],
        error: { code: 'temporary_error', message: 'Temporary provider failure', stack: 'must not persist' },
        rawInput: { subtitles: 'must not persist' },
        rawOutput: { script: 'must not persist' },
        file: new File(['video'], 'source.mp4', { type: 'video/mp4' }),
      }],
    } as unknown as WorkflowCheckpointInput)

    const loaded = await createWorkflowCheckpointStore({ indexedDb: null, storage: localStorage, now: () => now })
      .getCheckpoint(projectId)

    expect(loaded).toEqual({
      projectId,
      workflowRunId,
      workflowInputHash: inputHash.toLowerCase(),
      clientInstanceId: 'web.checkpoint-test',
      interrupted: false,
      updatedAt: '2026-07-16T07:59:00.000Z',
      steps: [{
        executionId,
        stepId: 'transcribe.audio',
        status: 'succeeded',
        startedAt: '2026-07-16T07:55:00.000Z',
        completedAt: '2026-07-16T07:58:00.000Z',
        summary: 'Audio transcript prepared',
        progress: 100,
        error: { code: 'temporary_error', message: 'Temporary provider failure' },
      }],
    })
    expect(JSON.stringify(loaded)).not.toContain('must not persist')
  })

  it('rejects malformed UUID and input-hash identities before saving', async () => {
    const store = createWorkflowCheckpointStore({ indexedDb: null, storage: localStorage, now: () => now })

    await expect(store.saveCheckpoint(checkpoint({ projectId: 'not-a-uuid' }))).rejects.toThrow('Invalid workflow checkpoint identity')
    await expect(store.saveCheckpoint(checkpoint({ workflowInputHash: 'not-a-hash' }))).rejects.toThrow('Invalid workflow checkpoint identity')
    expect(await store.getCheckpoint(projectId)).toBeNull()
  })

  it('rejects checkpoints with no activity in the last 24 hours and removes them from persistence', async () => {
    const store = createWorkflowCheckpointStore({ indexedDb: null, storage: localStorage, now: () => now })
    await store.saveCheckpoint(checkpoint({ updatedAt: '2026-07-15T07:59:59.999Z' }))

    await expect(store.getCheckpoint(projectId)).resolves.toBeNull()
    expect(localStorage.getItem(`${WORKFLOW_CHECKPOINT_STORAGE_PREFIX}:checkpoint:${projectId}`)).toBeNull()
  })

  it('marks a stored checkpoint as interrupted without changing its workflow identity', async () => {
    const store = createWorkflowCheckpointStore({ indexedDb: null, storage: localStorage, now: () => now })
    await store.saveCheckpoint(checkpoint())

    await expect(store.markInterrupted(projectId)).resolves.toEqual(expect.objectContaining({
      projectId,
      workflowRunId,
      workflowInputHash: inputHash.toLowerCase(),
      interrupted: true,
      interruptedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }))
  })

  it('uses deterministic in-memory fallback when IndexedDB and Web Storage are unavailable', async () => {
    const primary = createWorkflowCheckpointStore({ indexedDb: null, storage: null, now: () => now })
    await primary.saveCheckpoint(checkpoint())

    const restored = await createWorkflowCheckpointStore({ indexedDb: null, storage: null, now: () => now })
      .getCheckpoint(projectId)

    expect(restored).toMatchObject({ projectId, workflowRunId })
    await primary.removeCheckpoint(projectId)
  })

  it('persists final-result confirmation replay data separately from the resumable checkpoint', async () => {
    const store = createWorkflowCheckpointStore({ indexedDb: null, storage: localStorage, now: () => now })
    await store.saveCheckpoint(checkpoint())

    await store.saveFinalizationOutbox({
      projectId,
      workflowRunId,
      workflowInputHash: inputHash,
      clientInstanceId: 'web.checkpoint-test',
      finalResultAt: '2026-07-16T07:59:30.000Z',
      ignoredFinalOutput: { path: '/secret/final.mp4', script: 'must not persist' },
    } as unknown as WorkflowFinalizationOutboxInput)

    await expect(store.listFinalizationOutbox()).resolves.toEqual([{
      projectId,
      workflowRunId,
      workflowInputHash: inputHash.toLowerCase(),
      clientInstanceId: 'web.checkpoint-test',
      finalResultAt: '2026-07-16T07:59:30.000Z',
      updatedAt: now.toISOString(),
    }])
    await store.removeFinalizationOutbox(projectId)
    await expect(store.listFinalizationOutbox()).resolves.toEqual([])
  })
})
