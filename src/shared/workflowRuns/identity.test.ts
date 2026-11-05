import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getWorkflowClientInstanceId,
  withWorkflowIdentityInFormData,
  withWorkflowIdentityInJson,
  withWorkflowIdentityInQuery,
} from './identity'

const identity = {
  workflowRunId: '0185f76a-9e4d-7ed6-9ef7-9f34e7e1b6fd',
  workflowStepId: 'script.generate',
  workflowInputHash: 'a'.repeat(64),
  clientInstanceId: 'web.tab-123',
}

describe('workflow request identity helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('clones JSON, FormData, and query values while attaching complete identity', () => {
    const originalJson = { payload: { keep: true } }
    const originalForm = new FormData()
    originalForm.set('payload', 'keep')
    const originalQuery = new URLSearchParams('payload=keep')

    const json = withWorkflowIdentityInJson(originalJson, identity)
    const form = withWorkflowIdentityInFormData(originalForm, identity)
    const query = withWorkflowIdentityInQuery(originalQuery, identity)

    expect(json).toMatchObject({ payload: { keep: true }, workflow_run_id: identity.workflowRunId })
    expect(originalJson).toEqual({ payload: { keep: true } })
    expect(form).not.toBe(originalForm)
    expect(form.get('workflow_step_id')).toBe(identity.workflowStepId)
    expect(originalForm.get('workflow_step_id')).toBeNull()
    expect(query).not.toBe(originalQuery)
    expect(query.get('workflow_input_hash')).toBe(identity.workflowInputHash)
    expect(originalQuery.get('workflow_input_hash')).toBeNull()
  })

  it('rejects invalid or partial identity before any network helper can use it', () => {
    expect(() => withWorkflowIdentityInJson({}, { ...identity, workflowInputHash: 'not-a-hash' })).toThrow('workflow identity')
    expect(() => withWorkflowIdentityInQuery(new URLSearchParams(), { ...identity, clientInstanceId: '' })).toThrow('workflow identity')
    expect(() => withWorkflowIdentityInJson({}, {
      workflowRunId: identity.workflowRunId,
      workflowStepId: identity.workflowStepId,
    } as typeof identity)).toThrow('workflow identity')
  })

  it('creates a safe stable instance ID for the browser session', () => {
    sessionStorage.clear()
    const first = getWorkflowClientInstanceId()
    const second = getWorkflowClientInstanceId()

    expect(second).toBe(first)
    expect(first).toMatch(/^web\.[A-Za-z0-9._:-]+$/)
    expect(first).not.toContain('user')
    expect(first).not.toContain('project')
  })

  it('keeps the client instance ID stable when session storage is unavailable', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => { throw new Error('storage unavailable') },
      setItem: () => { throw new Error('storage unavailable') },
    })
    vi.resetModules()
    const { getWorkflowClientInstanceId: getFallbackId } = await import('./identity')

    const first = getFallbackId()
    const second = getFallbackId()

    expect(second).toBe(first)
  })
})
