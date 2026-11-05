import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenManager } from '@/features/auth/services/authService'
import { WorkflowBlockedError, WorkflowRunClient, WorkflowRunRequestError } from './workflowRunClient'

const runId = '0185f76a-9e4d-7ed6-9ef7-9f34e7e1b6fd'
const inputHash = 'a'.repeat(64)
const responseBody = { id: runId, status: 'running', billing_status: 'pending', can_resume: true }
const jsonResponse = (status: number, body: unknown, headers?: HeadersInit) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', ...headers },
})

describe('WorkflowRunClient', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it('calls each workflow run endpoint with the canonical IDs and methods', async () => {
    const authenticatedFetcher = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, responseBody)))
    const client = new WorkflowRunClient({ baseUrl: 'https://api.example.test', authenticatedFetcher })

    await client.create({ projectId: runId, inputHash })
    await client.get(runId)
    await client.heartbeat(runId, { currentStepId: 'script.generate' })
    await client.resume(runId)
    await client.interrupt(runId, { errorCode: 'provider_unavailable', errorMessage: 'provider unavailable' })
    await client.complete(runId, { finalResultAt: '2026-07-15T12:00:00.000Z' })
    await client.cancel(runId)
    await client.updateStep(runId, 'script.generate', {
      inputHash,
      status: 'succeeded',
      usage: { prompt_tokens: 1 },
    })

    const calls = authenticatedFetcher.mock.calls
    expect(calls.map(([request]) => {
      const value = request as Request
      return [new URL(value.url).pathname, value.method]
    })).toEqual([
      ['/api/v1/workflow-runs/', 'POST'],
      [`/api/v1/workflow-runs/${runId}`, 'GET'],
      [`/api/v1/workflow-runs/${runId}/heartbeat`, 'POST'],
      [`/api/v1/workflow-runs/${runId}/resume`, 'POST'],
      [`/api/v1/workflow-runs/${runId}/interrupt`, 'POST'],
      [`/api/v1/workflow-runs/${runId}/complete`, 'POST'],
      [`/api/v1/workflow-runs/${runId}/cancel`, 'POST'],
      [`/api/v1/workflow-runs/${runId}/steps/script.generate`, 'PUT'],
    ])
    expect(JSON.parse(await (calls[0][0] as Request).text())).toMatchObject({ client_type: 'web', project_id: runId, input_hash: inputHash })
    expect(JSON.parse(await (calls[2][0] as Request).text())).toMatchObject({ current_step_id: 'script.generate' })
    expect(JSON.parse(await (calls[7][0] as Request).text())).toMatchObject({ input_hash: inputHash, status: 'succeeded' })
  })

  it('creates a PC run with a local task identity instead of a project identity', async () => {
    const authenticatedFetcher = vi.fn().mockResolvedValue(jsonResponse(200, responseBody))
    const client = new WorkflowRunClient({ baseUrl: 'https://api.example.test', authenticatedFetcher })

    await client.create({
      clientType: 'pc',
      clientTaskId: 'clip-local-task-123',
      clientProjectName: ' source.mp4 ',
      inputHash,
    })

    const request = authenticatedFetcher.mock.calls[0][0] as Request
    expect(JSON.parse(await request.text())).toEqual({
      client_type: 'pc',
      client_task_id: 'clip-local-task-123',
      client_project_name: 'source.mp4',
      input_hash: inputHash,
      client_instance_id: expect.any(String),
    })
  })

  it('normalizes detailed interruption text to a server-supported diagnostic', async () => {
    const authenticatedFetcher = vi.fn().mockResolvedValue(jsonResponse(200, responseBody))
    const client = new WorkflowRunClient({ baseUrl: 'https://api.example.test', authenticatedFetcher })

    await client.interrupt(runId, {
      errorCode: 'workflow_interrupted',
      errorMessage: 'seg-03 解说字数 53 未达到允许范围 56-104',
    })

    const request = authenticatedFetcher.mock.calls[0][0] as Request
    expect(JSON.parse(await request.text())).toMatchObject({
      error_code: 'workflow_interrupted',
      error_message: 'operation failed',
    })
  })

  it('syncs bounded PC project-name mappings and returns aggregate counts', async () => {
    const authenticatedFetcher = vi.fn().mockResolvedValue(jsonResponse(200, {
      data: { matched: 2, workflow_runs_updated: 1, ledger_records_updated: 2 },
    }))
    const client = new WorkflowRunClient({
      baseUrl: 'https://api.example.test',
      authenticatedFetcher,
      clientInstanceId: 'client-1',
    })

    await expect(client.syncPCProjectNames([
      { clientTaskId: 'task-1', projectName: ' first.mp4 ' },
      { clientTaskId: 'task-2', projectName: 'second.mp4' },
    ])).resolves.toEqual({ matched: 2, workflow_runs_updated: 1, ledger_records_updated: 2 })

    const request = authenticatedFetcher.mock.calls[0][0] as Request
    expect(new URL(request.url).pathname).toBe('/api/v1/workflow-runs/pc/project-names/sync')
    expect(JSON.parse(await request.text())).toEqual({
      items: [
        { client_task_id: 'task-1', project_name: 'first.mp4' },
        { client_task_id: 'task-2', project_name: 'second.mp4' },
      ],
    })
  })

  it('rejects invalid PC project names and oversized sync batches before fetching', async () => {
    const authenticatedFetcher = vi.fn().mockResolvedValue(jsonResponse(200, responseBody))
    const client = new WorkflowRunClient({ baseUrl: 'https://api.example.test', authenticatedFetcher })

    await expect(client.create({
      clientType: 'pc', clientTaskId: 'task-1', clientProjectName: ' ', inputHash,
    })).rejects.toThrow('workflow run create input')
    await expect(client.syncPCProjectNames([
      { clientTaskId: 'task-1', projectName: 'x'.repeat(201) },
    ])).rejects.toThrow('PC project name sync input')
    await expect(client.syncPCProjectNames(Array.from({ length: 101 }, (_, index) => ({
      clientTaskId: `task-${index}`,
      projectName: `source-${index}.mp4`,
    })))).rejects.toThrow('PC project name sync input')

    expect(authenticatedFetcher).not.toHaveBeenCalled()
  })

  it('uses authenticatedFetch defaults so a 401 receives the existing single refresh retry', async () => {
    tokenManager.setTokens({ access_token: 'test-token', refresh_token: 'refresh-token', token_type: 'bearer', expires_in: 1800 })
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { code: 'unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'fresh-token', refresh_token: 'fresh-refresh-token', token_type: 'bearer', expires_in: 1800 }))
      .mockResolvedValueOnce(jsonResponse(200, responseBody))

    await new WorkflowRunClient({ baseUrl: 'https://api.example.test' }).get(runId)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(String(fetchMock.mock.calls[1][0])).toContain('/api/v1/auth/refresh')
  })

  it('preserves JSON headers when authenticatedFetch adds authorization', async () => {
    tokenManager.setTokens({ access_token: 'test-token', refresh_token: 'refresh-token', token_type: 'bearer', expires_in: 1800 })
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(jsonResponse(200, responseBody))

    await new WorkflowRunClient({ baseUrl: 'https://api.example.test' }).create({ projectId: runId, inputHash })

    const [, sentInit = {}] = fetchMock.mock.calls[0]
    const { signal: _signal, ...portableInit } = sentInit
    const sentRequest = new Request(fetchMock.mock.calls[0][0], portableInit)
    expect(sentRequest.headers.get('Content-Type')).toBe('application/json')
    expect(sentRequest.headers.get('Authorization')).toBe('Bearer test-token')
  })

  it('rejects malformed create input before the authenticated fetcher is called', async () => {
    const authenticatedFetcher = vi.fn().mockResolvedValue(jsonResponse(200, responseBody))
    const client = new WorkflowRunClient({ baseUrl: 'https://api.example.test', authenticatedFetcher })

    await expect(client.create({ projectId: 'not-a-project-id', inputHash })).rejects.toThrow('workflow run create input')
    await expect(client.create({ projectId: runId, inputHash: 'not-a-hash' })).rejects.toThrow('workflow run create input')

    expect(authenticatedFetcher).not.toHaveBeenCalled()
  })

  it('parses structured errors without retaining raw response content and blocks 402 workflow requests', async () => {
    const authenticatedFetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse(409, {
        request_id: 'request-123',
        code: 'workflow_run_lease_conflict',
        message: 'owned elsewhere',
        retryable: false,
        internal_prompt: 'must never reach the error',
      }, { 'Retry-After': '4' }))
      .mockResolvedValueOnce(jsonResponse(402, {
        request_id: 'request-402', code: 'insufficient_credits', message: 'billing required', retryable: true,
      }))
    const client = new WorkflowRunClient({ baseUrl: 'https://api.example.test', authenticatedFetcher })

    let requestError: unknown
    try {
      await client.get(runId)
    } catch (error) {
      requestError = error
    }
    expect(requestError).toBeInstanceOf(WorkflowRunRequestError)
    expect(requestError).toMatchObject({
      status: 409,
      requestId: 'request-123',
      code: 'workflow_run_lease_conflict',
      retryAfterMs: 4_000,
    })
    expect(JSON.stringify(requestError)).not.toContain('internal_prompt')
    expect(String(requestError)).not.toContain('must never reach the error')
    try {
      await client.get(runId)
    } catch (error) {
      expect(error).toBeInstanceOf(WorkflowBlockedError)
      expect(String(error)).not.toContain('internal_prompt')
    }
  })
})
