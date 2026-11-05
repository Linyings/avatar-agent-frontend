import { beforeEach, describe, expect, it } from 'vitest'
import { createWorkflowStepResultStore, WORKFLOW_CHECKPOINT_TTL_MS } from './workflowCheckpointStore'

const scope = {
  projectId: '0185f76a-9e4d-7ed6-9ef7-9f34e7e1b6fd',
  workflowRunId: '0185f76a-9e4d-7ed6-9ef7-9f34e7e1b6fe',
  workflowInputHash: 'a'.repeat(64),
  stepId: 'analyze-timeline-images.batch-v2.image-1',
}
describe('workflow image result storage', () => {
  beforeEach(() => localStorage.clear())
  it('survives a new store instance but isolates runs, input hashes and images', async () => {
    const options = { indexedDb: null, storage: localStorage }
    await createWorkflowStepResultStore(options).saveStepResult(scope, { summary: 'complete' })
    const store = createWorkflowStepResultStore(options)
    await expect(store.getStepResult(scope)).resolves.toEqual({ summary: 'complete' })
    await expect(store.getStepResult({ ...scope, workflowInputHash: 'b'.repeat(64) })).resolves.toBeNull()
    await expect(store.getStepResult({ ...scope, workflowRunId: scope.projectId })).resolves.toBeNull()
    await expect(store.getStepResult({ ...scope, stepId: 'different-image' })).resolves.toBeNull()
  })
  it('expires result data together with the 24 hour recovery period', async () => {
    let now = new Date('2026-10-15T00:00:00Z')
    const store = createWorkflowStepResultStore({ indexedDb: null, storage: localStorage, now: () => now })
    await store.saveStepResult(scope, { summary: 'complete' })
    now = new Date(now.getTime() + WORKFLOW_CHECKPOINT_TTL_MS + 1)
    await expect(store.getStepResult(scope)).resolves.toBeNull()
  })
})
