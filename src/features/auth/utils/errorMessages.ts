import type { AuthError } from '../types/auth'

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth.invalid_credentials': '邮箱或密码不正确，请重试',
  'auth.user_not_found': '未找到对应用户，请检查邮箱',
  'auth.account_disabled': '账户已被禁用，请联系管理员',
  'auth.duplicate_email': '该邮箱已被注册，请更换邮箱',
  'auth.duplicate_username': '该用户名已被占用，请更换用户名',
  'auth.email_already_verified': '邮箱已完成验证，无需重复操作',
  'auth.invalid_access_token': '登录状态已过期，请重新登录',
  'auth.invalid_refresh_token': '刷新令牌已失效，请重新登录'
}

export function getAuthErrorMessage(error: AuthError | undefined, fallback: string): string {
  if (!error) {
    return fallback
  }

  if (error.code && AUTH_ERROR_MESSAGES[error.code]) {
    return AUTH_ERROR_MESSAGES[error.code]
  }

  if (error.payload) {
    if (error.payload.error && AUTH_ERROR_MESSAGES[error.payload.error]) {
      return AUTH_ERROR_MESSAGES[error.payload.error]
    }
    if (typeof error.payload.message === 'string' && error.payload.message.trim()) {
      return error.payload.message
    }
    if (typeof error.payload.details === 'string' && error.payload.details.trim()) {
      return error.payload.details
    }
  }

  if (Array.isArray(error.details) && error.details.length > 0) {
    const firstDetail = error.details[0]
    if (typeof firstDetail === 'string') {
      return firstDetail
    }
    if (typeof firstDetail === 'object' && firstDetail !== null && 'msg' in firstDetail) {
      return String(firstDetail.msg)
    }
  }

  if (error.details && typeof error.details === 'object') {
    if ('message' in (error.details as Record<string, unknown>) && typeof (error.details as Record<string, unknown>).message === 'string') {
      return String((error.details as Record<string, unknown>).message)
    }
  }

  if (typeof error.details === 'string' && error.details) {
    return error.details
  }

  if (error.message) {
    return error.message
  }

  return fallback
}
