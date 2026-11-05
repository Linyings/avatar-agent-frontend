import { validateWorkflowRequestIdentity, type WorkflowRequestIdentity } from '@/shared/workflowRuns/identity'

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_RETRIES = 3
const DEFAULT_RETRY_DELAY_MS = 1_000
const MAX_RETRY_AFTER_MS = 30_000
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])

export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface FetchRetryOptions {
  timeoutMs?: number
  maxRetries?: number
  retryDelayMs?: number
  retryOnStatuses?: number[]
}

export interface RetryFetchOptions extends FetchRetryOptions {
  fetcher?: Fetcher
  signal?: AbortSignal
  delay?: (milliseconds: number) => Promise<void>
  random?: () => number
  now?: () => number
  cancelResponse?: (response: Response) => Promise<void>
  retrySafeIdentity?: WorkflowRequestIdentity
}

export class RequestTimeoutError extends Error {
  constructor() {
    super('Request timed out')
    this.name = 'RequestTimeoutError'
  }
}

const sleep = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds))

const abortError = () => new DOMException('The operation was aborted', 'AbortError')

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
    || (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')
}

function shouldRetryStatus(status: number, customStatuses?: number[]): boolean {
  if (status === 401 || status === 402) {
    return false
  }
  if (customStatuses && customStatuses.length > 0) {
    return customStatuses.includes(status)
  }
  return RETRYABLE_STATUS.has(status)
}

function isNetworkTransportError(error: unknown): boolean {
  return error instanceof TypeError
    || (error instanceof DOMException && error.name === 'NetworkError')
}

function isRetryableMethod(method: string, identity?: WorkflowRequestIdentity): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || method === 'PUT' || method === 'DELETE') {
    return true
  }
  return method === 'POST' && identity !== undefined
}

const WORKFLOW_IDENTITY_FIELDS = [
  'workflow_run_id',
  'workflow_step_id',
  'workflow_input_hash',
  'client_instance_id',
] as const

type WorkflowIdentityField = typeof WORKFLOW_IDENTITY_FIELDS[number]
type WireWorkflowIdentity = Record<WorkflowIdentityField, string>

const invalidRetrySafeIdentity = () => new Error('Invalid workflow identity in retry-safe request')

function wireWorkflowIdentity(identity: WorkflowRequestIdentity): WireWorkflowIdentity {
  return {
    workflow_run_id: identity.workflowRunId,
    workflow_step_id: identity.workflowStepId,
    workflow_input_hash: identity.workflowInputHash,
    client_instance_id: identity.clientInstanceId,
  }
}

function identityFromValues(
  expected: WireWorkflowIdentity,
  valuesFor: (field: WorkflowIdentityField) => unknown[],
): boolean {
  const values = WORKFLOW_IDENTITY_FIELDS.map(field => ({ field, values: valuesFor(field) }))
  if (values.every(({ values }) => values.length === 0)) {
    return false
  }

  for (const { field, values: fieldValues } of values) {
    if (fieldValues.length !== 1 || fieldValues[0] !== expected[field]) {
      throw invalidRetrySafeIdentity()
    }
  }
  return true
}

async function requestBodyContainsIdentity(request: Request, expected: WireWorkflowIdentity): Promise<boolean> {
  if (!request.body) {
    return false
  }

  const contentType = request.headers.get('Content-Type')?.toLowerCase() ?? ''
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.clone().formData().catch(() => { throw invalidRetrySafeIdentity() })
    return identityFromValues(expected, field => formData.getAll(field))
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const values = new URLSearchParams(await request.clone().text())
    return identityFromValues(expected, field => values.getAll(field))
  }

  if (!contentType.includes('multipart/form-data') && !contentType.includes('application/x-www-form-urlencoded')) {
    let payload: unknown
    try {
      payload = await request.clone().json()
    } catch {
      if (contentType.includes('application/json')) {
        throw invalidRetrySafeIdentity()
      }
      return false
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return false
    }
    const record = payload as Record<string, unknown>
    return identityFromValues(expected, field => (
      Object.prototype.hasOwnProperty.call(record, field) ? [record[field]] : []
    ))
  }

  return false
}

async function assertRetrySafePostIdentity(request: Request, identity: WorkflowRequestIdentity): Promise<void> {
  const expected = wireWorkflowIdentity(identity)
  const queryContainsIdentity = identityFromValues(expected, field => new URL(request.url).searchParams.getAll(field))
  const bodyContainsIdentity = await requestBodyContainsIdentity(request, expected)
  if (!queryContainsIdentity && !bodyContainsIdentity) {
    throw invalidRetrySafeIdentity()
  }
}

function jitteredDelay(baseDelay: number, random: () => number): number {
  const boundedRandom = Math.min(1, Math.max(0, random()))
  return Math.round(baseDelay * (0.9 + boundedRandom * 0.2))
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : abortError()
  }
}

async function delayWithAbort(
  milliseconds: number,
  delay: (milliseconds: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal)
  if (!signal) {
    await delay(milliseconds)
    return
  }

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(signal.reason instanceof Error ? signal.reason : abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    delay(milliseconds).then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort)
    })
  })
}

async function cancelResponseBody(response: Response): Promise<void> {
  if (response.body?.cancel) {
    try {
      await response.body.cancel()
    } catch {
      // The response is already discarded from retry processing.
    }
  }
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) {
    return Math.min(Number.parseInt(trimmed, 10) * 1_000, MAX_RETRY_AFTER_MS)
  }
  const date = Date.parse(trimmed)
  if (Number.isNaN(date)) return undefined
  return Math.min(Math.max(0, date - now), MAX_RETRY_AFTER_MS)
}

export async function retryFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: RetryFetchOptions = {},
): Promise<Response> {
  const retrySafeIdentity = options.retrySafeIdentity
    ? validateWorkflowRequestIdentity(options.retrySafeIdentity)
    : undefined
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxRetries = Math.min(Math.max(0, options.maxRetries ?? DEFAULT_MAX_RETRIES), DEFAULT_MAX_RETRIES)
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  const fetcher = options.fetcher ?? globalThis.fetch
  const delay = options.delay ?? sleep
  const random = options.random ?? Math.random
  const now = options.now ?? Date.now
  const request = input instanceof Request
    ? new Request(input, init)
    : new Request(new URL(String(input), globalThis.location?.origin ?? 'http://localhost').toString(), init)
  const method = request.method.toUpperCase()
  const retryAllowed = isRetryableMethod(method, retrySafeIdentity)
  const callerSignal = options.signal ?? init.signal ?? (input instanceof Request ? input.signal : undefined)
  if (method === 'POST' && retrySafeIdentity) {
    await assertRetrySafePostIdentity(request, retrySafeIdentity)
  }
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    throwIfAborted(callerSignal)
    const controller = new AbortController()
    let timedOut = false
    const timeoutId = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
    const onCallerAbort = () => controller.abort()
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true })

    try {
      const response = await fetcher(request.clone(), {
        headers: Object.fromEntries(request.headers.entries()),
        signal: controller.signal,
      })
      if (!retryAllowed || !shouldRetryStatus(response.status, options.retryOnStatuses) || attempt === maxRetries) {
        return response
      }

      await (options.cancelResponse ?? cancelResponseBody)(response)
      const retryAfter = response.status === 429 ? parseRetryAfter(response.headers.get('Retry-After'), now()) : undefined
      const backoff = jitteredDelay(retryDelayMs * 2 ** attempt, random)
      await delayWithAbort(retryAfter ?? backoff, delay, callerSignal)
    } catch (error) {
      if (callerSignal?.aborted) {
        throw callerSignal.reason instanceof Error ? callerSignal.reason : abortError()
      }
      const classifiedError = timedOut ? new RequestTimeoutError() : error
      lastError = classifiedError
      const retryableError = classifiedError instanceof RequestTimeoutError || isNetworkTransportError(classifiedError)
      if (!retryAllowed || attempt === maxRetries || !retryableError || (isAbortError(error) && !timedOut)) {
        throw classifiedError
      }
      await delayWithAbort(jitteredDelay(retryDelayMs * 2 ** attempt, random), delay, callerSignal)
    } finally {
      clearTimeout(timeoutId)
      callerSignal?.removeEventListener('abort', onCallerAbort)
    }
  }

  throw lastError ?? new Error('Request failed')
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchRetryOptions = {},
): Promise<Response> {
  return retryFetch(input, init, options)
}
