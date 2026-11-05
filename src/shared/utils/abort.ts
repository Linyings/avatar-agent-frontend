const DEFAULT_ABORT_MESSAGE = '操作已取消'

export const createAbortError = (message = DEFAULT_ABORT_MESSAGE): Error => {
  if (typeof DOMException !== 'undefined') {
    return new DOMException(message, 'AbortError')
  }

  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

export const isAbortError = (error: unknown): boolean => (
  error instanceof Error
    && (error.name === 'AbortError' || error.name === 'ConversionCanceledError')
)

export const throwIfAborted = (
  signal?: AbortSignal | null,
  message = DEFAULT_ABORT_MESSAGE
) => {
  if (signal?.aborted) {
    throw createAbortError(message)
  }
}

export const bindAbortSignal = (
  signal: AbortSignal | null | undefined,
  onAbort: () => void
) => {
  if (!signal) return () => undefined

  if (signal.aborted) {
    onAbort()
    return () => undefined
  }

  signal.addEventListener('abort', onAbort, { once: true })
  return () => {
    signal.removeEventListener('abort', onAbort)
  }
}
