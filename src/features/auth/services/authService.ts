import type {
  UserLoginRequest,
  UserRegisterRequest,
  LoginResponse,
  OAuthExchangeResponse,
  DesktopAuthorizationResponse,
  RegisterResponse,
  UserProfile,
  RefreshTokenRequest,
  LogoutRequest,
  AuthTokens,
  MessageResponse,
  EmailVerificationRequest,
  EmailVerificationConfirm,
  PasswordResetRequest,
  PasswordResetConfirm,
  AuthError,
  UserProfileUpdateRequest,
  PasswordUpdateRequest,
  UserSettingsResponse,
  UserSettingsUpdate
} from '../types/auth'
import { desktopAuthBridge } from './desktopAuthBridge'

// 获取API基础URL
const getApiBaseUrl = (): string => {
  // The local web deployment proxies /api to the local backend. Vite replaces
  // an unset variable with undefined, so use a same-origin URL instead of
  // producing /undefined/api/... requests.
  return import.meta.env.VITE_API_BASE_URL || ''
}

export const getOAuthStartUrl = (provider: 'github' | 'google', redirectPath = '/'): string => {
  const baseUrl = getApiBaseUrl()
  const params = new URLSearchParams({ redirect: redirectPath })
  if (typeof window !== 'undefined' && window.location.origin) {
    params.set('frontend_origin', window.location.origin)
  }
  return `${baseUrl}/api/v1/auth/oauth/${provider}/start?${params.toString()}`
}

// Token 存储键名
const ACCESS_TOKEN_KEY = 'auth_access_token'
const REFRESH_TOKEN_KEY = 'auth_refresh_token'
const USER_KEY = 'auth_user'
const LOCALE_STORAGE_KEY = 'narratoai-locale'
const ACCESS_TOKEN_REFRESH_SKEW_SECONDS = 120
const AUTH_REQUEST_TIMEOUT_MS = 20_000

let desktopSession: { accessToken: string | null; user: UserProfile | null } = {
  accessToken: null,
  user: null,
}

const normalizeAccessToken = (token: string | null | undefined): string => (
  (token || '').replace(/^Bearer\s+/i, '').trim()
)

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split('.')
  if (parts.length < 2) return null

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

const shouldRefreshAccessToken = (
  token: string,
  skewSeconds = ACCESS_TOKEN_REFRESH_SKEW_SECONDS
): boolean => {
  const payload = decodeJwtPayload(token)
  const exp = typeof payload?.exp === 'number' ? payload.exp : null
  if (!exp) return false
  return exp - Math.floor(Date.now() / 1000) <= skewSeconds
}

const headersToRecord = (headers?: HeadersInit): Record<string, string> => {
  if (!headers) return {}
  if (headers instanceof Headers) {
    const record: Record<string, string> = {}
    headers.forEach((value, key) => {
      record[key] = value
    })
    return record
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(([key, value]) => [key, value]))
  }
  return { ...headers }
}

const getPreferredLocale = (): string => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(LOCALE_STORAGE_KEY) || navigator.language || 'en'
  }
  return 'en'
}

const redirectToLogin = (): void => {
  if (typeof window === 'undefined' || window.location.pathname === '/login') return
  window.location.href = '/login'
}

// Token 管理工具
export const tokenManager = {
  getAccessToken: (): string | null => {
    if (desktopAuthBridge.isDesktop()) return desktopSession.accessToken
    return localStorage.getItem(ACCESS_TOKEN_KEY)
  },

  getRefreshToken: (): string | null => {
    if (desktopAuthBridge.isDesktop()) return null
    return localStorage.getItem(REFRESH_TOKEN_KEY)
  },

  setTokens: (tokens: AuthTokens): void => {
    if (desktopAuthBridge.isDesktop()) {
      desktopSession = { ...desktopSession, accessToken: tokens.access_token }
      return
    }
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token)
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token)
  },

  clearTokens: (): void => {
    if (desktopAuthBridge.isDesktop()) {
      desktopSession = { accessToken: null, user: null }
      return
    }
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  },

  getUser: (): UserProfile | null => {
    if (desktopAuthBridge.isDesktop()) return desktopSession.user
    const user = localStorage.getItem(USER_KEY)
    return user ? JSON.parse(user) : null
  },

  setUser: (user: UserProfile): void => {
    if (desktopAuthBridge.isDesktop()) {
      desktopSession = { ...desktopSession, user }
      return
    }
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  },

  hydrate: async (): Promise<void> => {
    if (!desktopAuthBridge.isDesktop()) return
    desktopSession = await desktopAuthBridge.getSession()
  },

  setDesktopAccessToken: (accessToken: string): void => {
    desktopSession = { ...desktopSession, accessToken }
  }
}

// HTTP 请求工具
class HttpClient {
  private baseUrl: string

  constructor() {
    this.baseUrl = getApiBaseUrl()
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const timeoutController = new AbortController()
    const timeoutId = window.setTimeout(() => timeoutController.abort(), AUTH_REQUEST_TIMEOUT_MS)
    const providedSignal = options.signal

    if (providedSignal) {
      if (providedSignal.aborted) {
        timeoutController.abort()
      } else {
        providedSignal.addEventListener('abort', () => timeoutController.abort(), { once: true })
      }
    }
    
    // 默认请求头
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept-Language': getPreferredLocale(),
      ...(options.headers as Record<string, string> || {})
    }

    // 自动添加认证头
    const token = tokenManager.getAccessToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const config: RequestInit = {
      ...options,
      headers,
      signal: timeoutController.signal
    }

    try {
      const response = await fetch(url, config)
      
      // 处理响应
      if (!response.ok) {
        let errorMessage = `请求失败（${response.status}）`
        let errorCode: string | undefined
        let details: AuthError['details']
        let payload: AuthError['payload'] = null
        let raw: unknown

        try {
          const errorData = await response.json()
          raw = errorData

          if (errorData) {
            const detailField = (errorData as { detail?: unknown }).detail

            if (Array.isArray(detailField)) {
              details = detailField
              const firstDetail = detailField[0]
              if (firstDetail && typeof firstDetail === 'object' && 'msg' in firstDetail) {
                errorMessage = String(firstDetail.msg)
              } else if (typeof firstDetail === 'string') {
                errorMessage = firstDetail
              }
            } else if (detailField && typeof detailField === 'object') {
              payload = detailField as AuthError['payload']
              if (payload?.message) {
                errorMessage = payload.message
              }
              if (payload?.error) {
                errorCode = payload.error
              }
              if (payload && 'details' in payload) {
                details = payload.details
              }
            } else if (typeof detailField === 'string') {
              errorMessage = detailField
            } else if (typeof detailField === 'number') {
              errorMessage = String(detailField)
            }

            if (!payload && typeof errorData === 'object' && errorData !== null) {
              const { message, error, details: nestedDetails } = errorData as {
                message?: string
                error?: string
                details?: AuthError['details']
              }

              if (message) {
                errorMessage = message
              }
              if (error) {
                errorCode = error
              }
              if (nestedDetails !== undefined) {
                details = nestedDetails
              }
            }
          }
        } catch {
          // ignore parse failure, keep default message
        }

        const error: AuthError = {
          message: errorMessage,
          status: response.status,
          details,
          code: errorCode,
          payload,
          raw
        }
        throw error
      }

      // 处理空响应
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        return await response.json()
      } else {
        return {} as T
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        const authError: AuthError = {
          message: '请求超时，请检查后端服务或邮件配置'
        }
        throw authError
      }
      if (error instanceof Error) {
        const authError: AuthError = {
          message: error.message || '网络请求失败'
        }
        throw authError
      }
      throw error
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' })
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined
    })
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined
    })
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' })
  }
}

// 创建HTTP客户端实例
const httpClient = new HttpClient()

// 认证服务
export const authService = {
  // 用户注册
  async register(userData: UserRegisterRequest): Promise<RegisterResponse> {
    const response = await httpClient.post<RegisterResponse>('/api/v1/auth/register', userData)
    return response
  },

  // 用户登录
  async login(credentials: UserLoginRequest): Promise<LoginResponse> {
    const response = await httpClient.post<LoginResponse>('/api/v1/auth/login', credentials)
    
    // 保存令牌和用户信息
    if (response.tokens) {
      tokenManager.setTokens(response.tokens)
      
      // 构造用户信息并保存 - 注意：登录响应数据有限，完整信息需要调用 getCurrentUser
      const user: UserProfile = {
        user_id: response.user_id,
        username: response.username,
        email: response.email,
        display_name: response.username,
        avatar_url: null,
        timezone: 'Asia/Shanghai',
        language: 'zh',
        is_active: true,
        is_verified: false,
        is_admin: false, // 默认非管理员，后续通过 getCurrentUser 获取真实值
        email_verified_at: null,
        created_at: new Date().toISOString(),
        last_login_at: new Date().toISOString()
      }
      tokenManager.setUser(user)
    }
    
    return response
  },

  // 刷新访问令牌
  async refreshToken(): Promise<AuthTokens> {
    if (desktopAuthBridge.isDesktop()) {
      const response = await desktopAuthBridge.refresh()
      if (!response.accessToken) {
        throw new Error('No desktop access token available')
      }
      tokenManager.setDesktopAccessToken(response.accessToken)
      return {
        access_token: response.accessToken,
        refresh_token: '',
        token_type: 'bearer',
        expires_in: 0,
      }
    }

    const refreshToken = tokenManager.getRefreshToken()
    if (!refreshToken) {
      throw new Error('No refresh token available')
    }

    const data: RefreshTokenRequest = { refresh_token: refreshToken }
    const response = await httpClient.post<AuthTokens>('/api/v1/auth/refresh', data)
    
    // 更新令牌
    tokenManager.setTokens(response)
    
    return response
  },

  // 用户登出
  async logout(): Promise<MessageResponse> {
    if (desktopAuthBridge.isDesktop()) {
      try {
        await desktopAuthBridge.logout()
        return { message: 'Logged out', success: true }
      } finally {
        tokenManager.clearTokens()
      }
    }

    try {
      const refreshToken = tokenManager.getRefreshToken()
      const payload: LogoutRequest | undefined = refreshToken
        ? { refresh_token: refreshToken }
        : undefined

      const response = await httpClient.post<MessageResponse>('/api/v1/auth/logout', payload)
      return response
    } finally {
      // 无论请求是否成功，都清理本地存储
      tokenManager.clearTokens()
    }
  },

  // 获取当前用户信息
  async getCurrentUser(): Promise<UserProfile> {
    const response = await httpClient.get<UserProfile>('/api/v1/auth/me')
    
    // 更新本地用户信息
    tokenManager.setUser(response)
    
    return response
  },

  // 请求邮箱验证码（正式模式注册时使用）
  async requestEmailCode(email: string, locale?: string): Promise<MessageResponse> {
    return await httpClient.post<MessageResponse>('/api/v1/auth/request-email-code', {
      email,
      purpose: 'register',
      locale: locale || getPreferredLocale(),
    })
  },

  async exchangeOAuthTicket(ticket: string): Promise<OAuthExchangeResponse> {
    const response = await httpClient.post<OAuthExchangeResponse>('/api/v1/auth/oauth/exchange', { ticket })
    if (response.tokens) {
      tokenManager.setTokens(response.tokens)
    }
    return response
  },

  async authorizeDesktopRequest(
    requestId: string,
    state: string,
  ): Promise<DesktopAuthorizationResponse> {
    const normalizedRequestId = requestId.trim()
    const normalizedState = state.trim()
    if (!normalizedRequestId || !normalizedState) {
      throw new Error('Desktop authorization request is invalid')
    }

    const response = await authenticatedFetch(
      `${getApiBaseUrl()}/api/v1/auth/desktop/requests/${encodeURIComponent(normalizedRequestId)}/authorize`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Language': getPreferredLocale(),
        },
        body: JSON.stringify({ state: normalizedState }),
      },
    )

    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { message?: unknown } | null
      throw new Error(
        typeof payload?.message === 'string' && payload.message.trim()
          ? payload.message
          : 'Desktop authorization failed',
      )
    }

    const payload = await response.json() as DesktopAuthorizationResponse
    if (typeof payload.callback_url !== 'string' || !payload.callback_url.trim()) {
      throw new Error('Desktop authorization callback is missing')
    }
    return payload
  },

  // 发送邮箱验证邮件（登录后验证邮箱使用）
  async sendVerificationEmail(data?: EmailVerificationRequest): Promise<MessageResponse> {
    return await httpClient.post<MessageResponse>('/api/v1/auth/send-verification-code', data)
  },

  // 验证邮箱
  async verifyEmail(data: EmailVerificationConfirm): Promise<MessageResponse> {
    return await httpClient.post<MessageResponse>('/api/v1/auth/verify-email', data)
  },

  // 发送密码重置邮件
  async forgotPassword(data: PasswordResetRequest): Promise<MessageResponse> {
    return await httpClient.post<MessageResponse>('/api/v1/auth/forgot-password', data)
  },

  // 重置密码
  async resetPassword(data: PasswordResetConfirm): Promise<MessageResponse> {
    return await httpClient.post<MessageResponse>('/api/v1/auth/reset-password', data)
  },

  // 检查是否已登录
  isLoggedIn(): boolean {
    const token = tokenManager.getAccessToken()
    const user = tokenManager.getUser()
    return !!(token && user)
  },

  // 自动刷新令牌（带重试机制）
  async autoRefreshToken(): Promise<boolean> {
    return refreshAccessTokenOnce()
  },

  // 获取用户详细资料
  async getUserProfile(): Promise<UserProfile> {
    const response = await httpClient.get<UserProfile>('/api/v1/users/profile')

    // 更新本地用户信息
    tokenManager.setUser(response)

    return response
  },

  // 更新用户资料
  async updateProfile(data: UserProfileUpdateRequest): Promise<UserProfile> {
    const response = await httpClient.put<UserProfile>('/api/v1/users/profile', data)

    // 更新本地用户信息
    tokenManager.setUser(response)

    return response
  },

  // 获取用户设置
  async getUserSettings(): Promise<UserSettingsResponse> {
    return await httpClient.get<UserSettingsResponse>('/api/v1/users/settings')
  },

  // 更新用户设置
  async updateUserSettings(data: UserSettingsUpdate): Promise<UserSettingsResponse> {
    return await httpClient.put<UserSettingsResponse>('/api/v1/users/settings', data)
  },

  // 更新密码
  async updatePassword(data: PasswordUpdateRequest): Promise<MessageResponse> {
    return await httpClient.put<MessageResponse>('/api/v1/users/password', data)
  }
}

// 请求拦截器：自动处理token过期
let refreshPromise: Promise<boolean> | null = null

const refreshAccessTokenOnce = (): Promise<boolean> => {
  if (!refreshPromise) {
    refreshPromise = authService.refreshToken()
      .then(() => true)
      .catch((error) => {
        console.error('Auto refresh token failed:', error)
        tokenManager.clearTokens()
        return false
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

export interface AuthenticatedFetchOptions {
  accessToken?: string | null
  missingTokenMessage?: string
  retryOnUnauthorized?: boolean
  refreshSkewSeconds?: number
  signal?: AbortSignal | null
}

const abortError = () => new DOMException('The operation was aborted', 'AbortError')

const throwIfAborted = (signal?: AbortSignal | null): void => {
  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : abortError()
  }
}

type AbortCleanup = () => Promise<void> | void

const waitForSharedRefresh = async (
  refresh: Promise<boolean>,
  signal?: AbortSignal | null,
  onAbort?: AbortCleanup,
): Promise<boolean> => {
  if (signal?.aborted) {
    await onAbort?.()
    throwIfAborted(signal)
  }
  if (!signal) {
    return refresh
  }

  return new Promise<boolean>((resolve, reject) => {
    let settled = false
    const settle = (complete: () => void) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', handleAbort)
      complete()
    }
    const handleAbort = () => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', handleAbort)
      void Promise.resolve(onAbort?.()).catch(() => undefined).finally(() => {
        reject(signal.reason instanceof Error ? signal.reason : abortError())
      })
    }
    signal.addEventListener('abort', handleAbort, { once: true })
    refresh.then(
      refreshSuccessful => settle(() => resolve(refreshSuccessful)),
      error => settle(() => reject(error)),
    )
  })
}

const discardResponseBody = async (response: Response): Promise<void> => {
  if (!response.body?.cancel) return
  try {
    await response.body.cancel()
  } catch {
    // The retry remains valid if the browser has already discarded the body.
  }
}

export const getFreshAccessToken = async ({
  accessToken,
  missingTokenMessage = '缺少访问令牌，请先登录',
  refreshSkewSeconds,
  signal,
}: AuthenticatedFetchOptions = {}): Promise<string> => {
  throwIfAborted(signal)
  const explicitToken = normalizeAccessToken(accessToken)
  let token = explicitToken || normalizeAccessToken(tokenManager.getAccessToken())

  if (!token) {
    throw new Error(missingTokenMessage)
  }

  if (!explicitToken && shouldRefreshAccessToken(token, refreshSkewSeconds)) {
    const refreshSuccessful = await waitForSharedRefresh(refreshAccessTokenOnce(), signal)
    throwIfAborted(signal)
    if (!refreshSuccessful) {
      redirectToLogin()
      throw new Error('Authentication required')
    }
    token = normalizeAccessToken(tokenManager.getAccessToken())
    if (!token) {
      redirectToLogin()
      throw new Error('Authentication required')
    }
  }

  return token
}

const withAuthorizationHeader = (init: RequestInit, token: string): RequestInit => ({
  ...init,
  headers: {
    ...headersToRecord(init.headers),
    Authorization: `Bearer ${token}`,
  },
})

export const authenticatedFetch = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: AuthenticatedFetchOptions = {}
): Promise<Response> => {
  const signal = options.signal ?? init.signal
  const requestInit = signal === init.signal ? init : { ...init, signal }
  const authOptions = signal === options.signal ? options : { ...options, signal }
  const hasExplicitToken = Boolean(normalizeAccessToken(options.accessToken))
  const requestTemplate = input instanceof Request ? input.clone() : input
  const fetchWithToken = (accessToken: string): Promise<Response> => fetch(
    requestTemplate instanceof Request ? requestTemplate.clone() : requestTemplate,
    withAuthorizationHeader(requestInit, accessToken),
  )
  const token = await getFreshAccessToken(authOptions)
  const response = await fetchWithToken(token)

  if (
    response.status !== 401 ||
    hasExplicitToken ||
    options.retryOnUnauthorized === false
  ) {
    return response
  }

  const refreshSuccessful = await waitForSharedRefresh(
    refreshAccessTokenOnce(),
    signal,
    () => discardResponseBody(response),
  )
  if (!refreshSuccessful) {
    redirectToLogin()
    return response
  }

  const retryToken = normalizeAccessToken(tokenManager.getAccessToken())
  if (!retryToken) {
    redirectToLogin()
    return response
  }

  throwIfAborted(signal)
  await discardResponseBody(response)
  throwIfAborted(signal)
  return fetchWithToken(retryToken)
}

// 包装需要认证的请求
export const withAuth = async <T>(request: () => Promise<T>): Promise<T> => {
  try {
    return await request()
  } catch (error: unknown) {
    // 如果是401错误，尝试刷新token
    if ((error as { status?: number }).status === 401) {
      const refreshSuccessful = await refreshAccessTokenOnce()
      if (refreshSuccessful) {
        // 刷新成功，重试原请求
        return await request()
      }

      // 刷新失败，跳转到登录页面
      redirectToLogin()
      throw new Error('Authentication required')
    }
    
    throw error
  }
}

export default authService
