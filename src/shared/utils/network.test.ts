import { describe, expect, it, vi } from 'vitest'
import {
  RequestTimeoutError,
  fetchWithRetry,
  parseRetryAfter,
  retryFetch,
} from './network'
import {
  withWorkflowIdentityInJson,
  withWorkflowIdentityInQuery,
} from '@/shared/workflowRuns/identity'

const immediateDelay = async () => undefined

describe('retryFetch', () => {
  it('makes an initial request plus exactly three retries using exponential delays', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    const delays: number[] = []

    const response = await retryFetch('/health', {}, {
      fetcher,
      delay: async (milliseconds) => { delays.push(milliseconds) },
      random: () => 0.5,
    })

    expect(await response.text()).toBe('ok')
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(delays).toEqual([1_000, 2_000, 4_000])
  })

  it('keeps exponential backoff jitter within ten percent', async () => {
    const run = async (random: () => number) => {
      const delays: number[] = []
      const fetcher = vi.fn()
        .mockResolvedValueOnce(new Response(null, { status: 503 }))
        .mockResolvedValueOnce(new Response('ok', { status: 200 }))
      await retryFetch('/health', {}, {
        fetcher,
        maxRetries: 1,
        delay: async (milliseconds) => { delays.push(milliseconds) },
        random,
      })
      return delays[0]
    }

    await expect(run(() => 0)).resolves.toBe(900)
    await expect(run(() => 1)).resolves.toBe(1_100)
  })

  it.each([408, 429, 500, 502, 503, 504])('retries HTTP %i', async (status) => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))

    await retryFetch('/health', {}, { fetcher, delay: immediateDelay, random: () => 0.5 })

    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it.each([400, 401, 402, 403, 404, 409])('does not retry HTTP %i', async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }))

    const response = await retryFetch('/health', {}, { fetcher, delay: immediateDelay })

    expect(response.status).toBe(status)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('never retries a blocked 402 even when a custom retry status list includes it', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 402 }))

    const response = await retryFetch('/blocked', {}, {
      fetcher,
      delay: immediateDelay,
      retryOnStatuses: [402],
    })

    expect(response.status).toBe(402)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it.each([401, 402])('never retries HTTP %i even when a custom retry status list includes it', async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }))

    const response = await retryFetch('/blocked', {}, {
      fetcher,
      delay: immediateDelay,
      retryOnStatuses: [401, 402],
    })

    expect(response.status).toBe(status)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('keeps legacy fetchWithRetry callers working', async () => {
    const originalFetch = globalThis.fetch
    const fetcher = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetcher)

    await expect(fetchWithRetry('/legacy', {}, { maxRetries: 0 })).resolves.toMatchObject({ status: 200 })
    expect(fetcher).toHaveBeenCalledOnce()

    vi.stubGlobal('fetch', originalFetch)
  })

  it('honors retry-after seconds and date values with a thirty-second cap', () => {
    const now = Date.UTC(2026, 6, 15, 12, 0, 0)

    expect(parseRetryAfter('3', now)).toBe(3_000)
    expect(parseRetryAfter(new Date(now + 7_000).toUTCString(), now)).toBe(7_000)
    expect(parseRetryAfter('999', now)).toBe(30_000)
    expect(parseRetryAfter('invalid', now)).toBeUndefined()
  })

  it('uses retry-after before exponential backoff and cancels failed response bodies', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined)
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '8' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    const delays: number[] = []

    await retryFetch('/rate-limited', {}, {
      fetcher,
      delay: async (milliseconds) => { delays.push(milliseconds) },
      random: () => 0.5,
      cancelResponse: cancel,
    })

    expect(delays).toEqual([8_000])
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('does not retry an ordinary POST but retries a retry-safe charged POST with an identical body', async () => {
    const identity = {
      workflowRunId: '0185f76a-9e4d-7ed6-9ef7-9f34e7e1b6fd',
      workflowStepId: 'script.generate',
      workflowInputHash: 'a'.repeat(64),
      clientInstanceId: 'web.tab-123',
    }

    const stableBody = JSON.stringify(withWorkflowIdentityInJson({ stable: true }, identity))
    const unsafeFetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    const sentBodies: string[] = []
    const safeFetcher = vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request
      sentBodies.push(await request.text())
      return safeFetcher.mock.calls.length === 1
        ? new Response(null, { status: 503 })
        : new Response('ok', { status: 200 })
    })

    await retryFetch('/charged', { method: 'POST', body: stableBody }, {
      fetcher: unsafeFetcher,
      delay: immediateDelay,
    })
    await retryFetch('/charged', { method: 'POST', body: stableBody }, {
      fetcher: safeFetcher,
      delay: immediateDelay,
      retrySafeIdentity: identity,
    })

    expect(unsafeFetcher).toHaveBeenCalledOnce()
    expect(safeFetcher).toHaveBeenCalledTimes(2)
    expect(sentBodies).toEqual([stableBody, stableBody])
    expect(JSON.parse(sentBodies[0])).toMatchObject({
      workflow_run_id: identity.workflowRunId,
      workflow_step_id: identity.workflowStepId,
      workflow_input_hash: identity.workflowInputHash,
      client_instance_id: identity.clientInstanceId,
    })
  })

  it('rejects an invalid retry-safe identity before the first POST reaches the network', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('unexpected', { status: 200 }))

    await expect(retryFetch('/charged', { method: 'POST', body: '{"stable":true}' }, {
      fetcher,
      maxRetries: 0,
      retrySafeIdentity: {
        workflowRunId: 'not-a-uuid',
        workflowStepId: 'script.generate',
        workflowInputHash: 'a'.repeat(64),
        clientInstanceId: 'web.tab-123',
      },
    })).rejects.toThrow('workflow identity')

    expect(fetcher).not.toHaveBeenCalled()
  })

  it('does not retry non-transport exceptions thrown by the fetcher', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('invalid request setup'))

    await expect(retryFetch('/invalid', {}, {
      fetcher,
      delay: immediateDelay,
    })).rejects.toThrow('invalid request setup')

    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('stops immediately for caller aborts during backoff and retries per-attempt timeouts', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
    const delay = vi.fn(async () => { controller.abort() })

    await expect(retryFetch('/abort', {}, { fetcher, delay, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher).toHaveBeenCalledOnce()

    const timeoutFetcher = vi.fn((_: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')))
    }))
    await expect(retryFetch('/timeout', {}, {
      fetcher: timeoutFetcher,
      timeoutMs: 1,
      maxRetries: 0,
      delay: immediateDelay,
    })).rejects.toBeInstanceOf(RequestTimeoutError)
  })

  it('stops an in-flight fetch on caller abort without retrying', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn((_: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      controller.abort()
    }))

    await expect(retryFetch('/abort-fetch', {}, {
      fetcher,
      signal: controller.signal,
      delay: immediateDelay,
    })).rejects.toMatchObject({ name: 'AbortError' })

    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('retries a per-attempt timeout before succeeding', async () => {
    const fetcher = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
      if (fetcher.mock.calls.length > 1) {
        return Promise.resolve(new Response('ok', { status: 200 }))
      }
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true })
      })
    })

    const response = await retryFetch('/timeout-retry', {}, {
      fetcher,
      timeoutMs: 1,
      maxRetries: 1,
      delay: immediateDelay,
    })

    expect(await response.text()).toBe('ok')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  describe('retry-safe POST identity verification', () => {
    const identity = {
      workflowRunId: '0185f76a-9e4d-7ed6-9ef7-9f34e7e1b6fd',
      workflowStepId: 'script.generate',
      workflowInputHash: 'a'.repeat(64),
      clientInstanceId: 'web.tab-123',
    }

    const nativeFormData = async (entries: Record<string, string>): Promise<FormData> => (
      new Response(new URLSearchParams(entries), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }).formData()
    )

    const expectRejectedBeforeFetch = async (input: RequestInfo | URL, init: RequestInit) => {
      const fetcher = vi.fn().mockResolvedValue(new Response('unexpected', { status: 200 }))

      await expect(retryFetch(input, init, { fetcher, retrySafeIdentity: identity })).rejects.toThrow('workflow identity')
      expect(fetcher).not.toHaveBeenCalled()
    }

    it('rejects an absent JSON identity before the first fetch', async () => {
      await expectRejectedBeforeFetch('/charged', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stable: true }),
      })
    })

    it('rejects a mismatched JSON identity before the first fetch', async () => {
      await expectRejectedBeforeFetch('/charged', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withWorkflowIdentityInJson({ stable: true }, {
          ...identity,
          workflowStepId: 'script.mismatch',
        })),
      })
    })

    it('rejects an absent FormData identity before the first fetch', async () => {
      const form = await nativeFormData({ payload: 'stable' })
      await expectRejectedBeforeFetch('/charged', { method: 'POST', body: form })
    })

    it('rejects a mismatched FormData identity before the first fetch', async () => {
      const form = await nativeFormData({
        workflow_run_id: identity.workflowRunId,
        workflow_step_id: 'script.mismatch',
        workflow_input_hash: identity.workflowInputHash,
        client_instance_id: identity.clientInstanceId,
      })
      await expectRejectedBeforeFetch('/charged', { method: 'POST', body: form })
    })

    it('rejects an absent query identity before the first fetch', async () => {
      await expectRejectedBeforeFetch('/charged?stable=true', { method: 'POST' })
    })

    it('rejects a mismatched query identity before the first fetch', async () => {
      const query = new URLSearchParams({
        workflow_run_id: identity.workflowRunId,
        workflow_step_id: 'script.mismatch',
        workflow_input_hash: identity.workflowInputHash,
        client_instance_id: identity.clientInstanceId,
      })
      await expectRejectedBeforeFetch(`/charged?${query}`, { method: 'POST' })
    })

    it('retries a matching FormData body without changing its serialized bytes', async () => {
      const body = await nativeFormData({
        payload: 'stable',
        workflow_run_id: identity.workflowRunId,
        workflow_step_id: identity.workflowStepId,
        workflow_input_hash: identity.workflowInputHash,
        client_instance_id: identity.clientInstanceId,
      })
      const transmittedBodies: string[] = []
      const fetcher = vi.fn(async (input: RequestInfo | URL) => {
        transmittedBodies.push(await (input as Request).text())
        return fetcher.mock.calls.length === 1
          ? new Response(null, { status: 503 })
          : new Response('ok', { status: 200 })
      })

      await retryFetch('/charged', { method: 'POST', body }, {
        fetcher,
        delay: immediateDelay,
        retrySafeIdentity: identity,
      })

      expect(transmittedBodies).toHaveLength(2)
      expect(transmittedBodies[1]).toBe(transmittedBodies[0])
    })

    it('retries a matching query identity without changing the request URL', async () => {
      const query = withWorkflowIdentityInQuery(new URLSearchParams('payload=stable'), identity)
      const urls: string[] = []
      const fetcher = vi.fn((input: RequestInfo | URL) => {
        urls.push((input as Request).url)
        return Promise.resolve(fetcher.mock.calls.length === 1
          ? new Response(null, { status: 503 })
          : new Response('ok', { status: 200 }))
      })

      await retryFetch(`/charged?${query}`, { method: 'POST' }, {
        fetcher,
        delay: immediateDelay,
        retrySafeIdentity: identity,
      })

      expect(urls).toHaveLength(2)
      expect(urls[1]).toBe(urls[0])
    })
  })
})
