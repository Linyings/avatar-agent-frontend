export interface DesktopFallbackFailureContext {
  stepId?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  attemptCount?: number | null
  isProduction: boolean
  isDesktop: boolean
}

export interface DesktopFallbackRecommendation {
  title: '网页端转录暂时无法继续'
  message: '请稍后重试。当前平台只在网页中使用。'
}

const EXCLUDED_CODES = new Set([
  'insufficient_credits',
  'authentication_required',
  'authorization_required',
  'unauthorized',
  'unauthenticated',
  'auth_expired',
  'authentication_expired',
  'access_token_expired',
  'token_expired',
  'expired_token',
  'operation_interrupted',
  'invalid_request',
  'invalid_input',
  'invalid_argument',
  'invalid_arguments',
  'validation_error',
  'validation_failed',
])

const EXCLUDED_MESSAGES = [
  'insufficient credits',
  'authentication required',
  'authorization required',
  'unauthorized',
  'unauthenticated',
  'authentication has expired',
  'credentials have expired',
  'token expired',
  'operation interrupted',
  'invalid request',
  'invalid input',
  'invalid argument',
  'input validation failed',
  'validation error',
  'cancelled',
  'canceled',
]

const SUPPORTED_CODES = new Set(['provider_unavailable'])
const SUPPORTED_MESSAGES = ['internalerror', 'provider unavailable', '临时音频文件已释放']

export function getDesktopFallbackRecommendation(
  context: DesktopFallbackFailureContext,
): DesktopFallbackRecommendation | null {
  if (!context.isProduction || context.isDesktop || context.stepId !== 'transcribe') {
    return null
  }

  const errorCode = context.errorCode?.toLowerCase() ?? ''
  const errorMessage = context.errorMessage?.toLowerCase() ?? ''

  if (
    EXCLUDED_CODES.has(errorCode) ||
    EXCLUDED_MESSAGES.some(excludedMessage => errorMessage.includes(excludedMessage))
  ) {
    return null
  }

  const isSupportedFailure =
    SUPPORTED_CODES.has(errorCode) ||
    SUPPORTED_MESSAGES.some(supportedMessage => errorMessage.includes(supportedMessage)) ||
    (context.attemptCount ?? 0) >= 2

  if (!isSupportedFailure) {
    return null
  }

  return {
    title: '网页端转录暂时无法继续',
    message: '请稍后重试。当前平台只在网页中使用。',
  }
}
