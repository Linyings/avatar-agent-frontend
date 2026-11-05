// 用户登录请求数据
export interface UserLoginRequest {
  email: string
  password: string
}

// 用户注册请求数据
export interface UserRegisterRequest {
  username: string
  email: string
  password: string
  display_name?: string
  code: string  // 邮箱验证码
}

// 认证令牌信息
export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

// 登录响应数据
export interface LoginResponse {
  message: string
  success: boolean
  user_id: string
  username: string
  email: string
  tokens: AuthTokens
}

export interface OAuthExchangeResponse extends LoginResponse {
  redirect_path?: string
}

export interface DesktopAuthorizationResponse {
  callback_url: string
  expires_at?: string
}

// 注册响应数据
export interface RegisterResponse {
  message: string
  success: boolean
  user_id: string
  username: string
  email: string
}

// 用户个人资料
export interface UserProfile {
  user_id: string
  username: string
  email: string
  display_name?: string | null
  avatar_url?: string | null
  timezone: string
  language: string
  is_active: boolean
  is_verified: boolean
  is_admin: boolean
  email_verified_at?: string | null
  created_at: string
  last_login_at?: string | null
}

// 刷新令牌请求
export interface RefreshTokenRequest {
  refresh_token: string
}

// 登出请求
export interface LogoutRequest {
  refresh_token?: string
}

// 通用响应消息
export interface MessageResponse {
  message: string
  success: boolean
}

// 邮箱验证请求
export interface EmailVerificationRequest {
  email?: string
}

// 邮箱验证确认
export interface EmailVerificationConfirm {
  code: string  // 6位验证码
}

// 密码重置请求
export interface PasswordResetRequest {
  email: string
}

// 密码重置确认
export interface PasswordResetConfirm {
  email: string
  code: string  // 6位验证码
  new_password: string
  confirm_password: string
}

// 认证上下文状态
export interface AuthState {
  user: UserProfile | null
  isAuthenticated: boolean
  isLoading: boolean
  token: string | null
  isAdmin: boolean // 便利属性：是否为管理员
  isInitialized: boolean
}

// 认证上下文方法
export interface AuthContextType extends AuthState {
  login: (credentials: UserLoginRequest) => Promise<void>
  register: (userData: UserRegisterRequest) => Promise<void>
  completeDesktopLogin: () => Promise<void>
  logout: () => void
  refreshToken: () => Promise<void>
  updateUser: (user: UserProfile) => void
}

// API 错误响应
export interface ValidationError {
  loc: (string | number)[]
  msg: string
  type: string
}

export interface HTTPValidationError {
  detail: ValidationError[]
}

export interface ApiErrorResponse {
  error?: string
  message?: string
  details?: string | Record<string, unknown> | null
}

// 认证错误类型
export interface AuthError {
  message: string
  status?: number
  code?: string
  details?: HTTPValidationError['detail'] | ApiErrorResponse['details']
  payload?: ApiErrorResponse | null
  raw?: unknown
}

// 用户资料更新请求
export interface UserProfileUpdateRequest {
  display_name?: string | null
  avatar_url?: string | null
}

// 密码更新请求
export interface PasswordUpdateRequest {
  current_password: string
  new_password: string
  confirm_password: string
}

// 用户偏好设置
export interface UserPreferences {
  theme?: 'light' | 'dark'
  auto_save?: boolean
}

// 用户通知设置
export interface UserNotificationSettings {
  email_notifications?: boolean
}

// 用户设置响应
export interface UserSettingsResponse {
  user_id: string
  preferences: UserPreferences
  notification_settings: UserNotificationSettings
  updated_at: string
}

// 用户设置更新请求
export interface UserSettingsUpdate {
  preferences?: UserPreferences
  notification_settings?: UserNotificationSettings
}
