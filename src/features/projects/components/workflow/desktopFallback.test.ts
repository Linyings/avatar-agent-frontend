import { describe, expect, it } from 'vitest'

import { getDesktopFallbackRecommendation } from './desktopFallback'

const base = {
  stepId: 'transcribe',
  errorCode: 'provider_unavailable',
  errorMessage: 'provider unavailable',
  attemptCount: 1,
  isProduction: true,
  isDesktop: false,
}

describe('getDesktopFallbackRecommendation', () => {
  it('recommends desktop for a production Web provider failure', () => {
    expect(getDesktopFallbackRecommendation(base)).toEqual({
      title: '网页端转录暂时无法继续',
      message: '请稍后重试。当前平台只在网页中使用。',
    })
  })

  it.each([
    'insufficient_credits',
    'authentication_required',
    'operation_interrupted',
    'invalid_request',
  ])('does not recommend desktop for excluded code %s', errorCode => {
    expect(
      getDesktopFallbackRecommendation({ ...base, errorCode }),
    ).toBeNull()
  })

  it.each([
    'unauthorized',
    'unauthenticated',
    'authorization_required',
    'auth_expired',
    'authentication_expired',
    'access_token_expired',
    'token_expired',
    'expired_token',
    'invalid_input',
    'invalid_argument',
    'invalid_arguments',
    'validation_error',
    'validation_failed',
  ])('does not recommend desktop after repeated failures with excluded code %s', errorCode => {
    expect(
      getDesktopFallbackRecommendation({
        ...base,
        errorCode,
        errorMessage: 'transcription failed',
        attemptCount: 2,
      }),
    ).toBeNull()
  })

  it.each([
    'Unauthorized request',
    'User is unauthenticated',
    'Authorization required',
    'Authentication has expired',
    'Credentials have expired',
    'Access token expired',
    'Invalid input: audio is required',
    'Invalid argument: language',
    'Input validation failed',
    'Validation error for language',
  ])('does not recommend desktop after repeated failures with excluded message %s', errorMessage => {
    expect(
      getDesktopFallbackRecommendation({
        ...base,
        errorCode: 'transcription_failed',
        errorMessage,
        attemptCount: 2,
      }),
    ).toBeNull()
  })

  it.each(['InternalError', 'provider unavailable'])(
    'recommends desktop for supported provider signal %s',
    errorMessage => {
      expect(getDesktopFallbackRecommendation({ ...base, errorCode: null, errorMessage })).not.toBeNull()
    },
  )

  it('recommends desktop for the legacy released-audio message', () => {
    expect(
      getDesktopFallbackRecommendation({
        ...base,
        errorCode: null,
        errorMessage: '临时音频文件已释放',
      }),
    ).not.toBeNull()
  })

  it('recommends desktop after a repeated generic transcription failure', () => {
    expect(
      getDesktopFallbackRecommendation({
        ...base,
        errorCode: 'transcription_failed',
        errorMessage: 'Failed to fetch',
        attemptCount: 2,
      }),
    ).not.toBeNull()
  })

  it.each([
    ['development', { isProduction: false }],
    ['desktop', { isDesktop: true }],
    ['unrelated step', { stepId: 'generate-script' }],
    ['cancellation', { errorCode: 'operation_interrupted', attemptCount: 2 }],
    ['one generic failure', { errorCode: null, errorMessage: 'Failed to fetch', attemptCount: 1 }],
  ])('does not recommend desktop for %s', (_label, overrides) => {
    expect(getDesktopFallbackRecommendation({ ...base, ...overrides })).toBeNull()
  })

  it('does not include a desktop download link', () => {
    expect(getDesktopFallbackRecommendation(base)).not.toHaveProperty('downloadUrl')
  })
})
