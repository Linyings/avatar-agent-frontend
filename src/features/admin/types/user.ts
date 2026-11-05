/**
 * 管理员用户管理相关类型定义
 */

// ==================== 用户基础类型 ====================

/**
 * 用户摘要信息（列表项）
 */
export interface AdminUserSummary {
  id: string
  username: string
  email: string
  display_name: string | null
  avatar_url: string | null
  is_active: boolean
  is_admin: boolean
  is_verified: boolean
  created_at: string
  last_login_at: string | null
  total_tokens: number | null
  remaining_tokens: number | null
  total_credits?: number | null
  remaining_credits?: number | null
}

/**
 * Credits 账户信息
 */
export interface TokenAccountInfo {
  total_tokens: number
  used_tokens: number
  remaining_tokens: number
  total_credits?: number
  used_credits?: number
  remaining_credits?: number
  total_recharged: string
  last_recharge_at: string | null
}

/**
 * API 使用统计项
 */
export interface ApiUsageItem {
  api_endpoint: string
  request_count: number
  token_count: number
  credit_count?: number
}

/**
 * 模型使用统计项
 */
export interface ModelUsageItem {
  model_name: string
  request_count: number
  token_count: number
  credit_count?: number
}

/**
 * 每日使用统计项
 */
export interface DailyUsageItem {
  date: string
  token_count: number
  credit_count?: number
  request_count: number
}

/**
 * 用户近期使用统计
 */
export interface UserRecentUsageStats {
  period_days: number
  total_used: number
  daily_average: number
  top_apis: ApiUsageItem[]
  top_models: ModelUsageItem[]
  daily_trend: DailyUsageItem[]
}

/**
 * 用户详细信息
 */
export interface AdminUserDetail {
  id: string
  username: string
  email: string
  display_name: string | null
  avatar_url: string | null
  is_active: boolean
  is_admin: boolean
  is_verified: boolean
  email_verified_at: string | null
  created_at: string
  last_login_at: string | null
  token_account: TokenAccountInfo
  recent_usage: UserRecentUsageStats
}

// ==================== 列表查询 ====================

/**
 * 用户列表查询参数
 */
export interface UserListQueryParams {
  search?: string
  is_active?: boolean
  is_admin?: boolean
  is_verified?: boolean
  order_by?: string
  order?: 'asc' | 'desc'
  page?: number
  per_page?: number
}

/**
 * 分页响应基础结构
 */
export interface PaginationResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
  total_pages: number
  has_next: boolean
  has_prev: boolean
}

/**
 * 用户列表响应
 */
export type AdminUserListResponse = PaginationResponse<AdminUserSummary>

// ==================== Credits 调整 ====================

/**
 * Credits 调整请求
 */
export interface TokenAdjustmentRequest {
  amount: number
  reason: string
}

/**
 * Credits 调整响应
 */
export interface TokenAdjustmentResponse {
  user_id: string
  adjustment_amount: number
  previous_balance: number
  current_balance: number
  reason: string
  adjusted_by: string
  adjusted_at: string
}

// ==================== 用户状态更新 ====================

/**
 * 用户状态更新请求
 */
export interface UserStatusUpdateRequest {
  is_active: boolean
  reason?: string | null
}

/**
 * 用户状态更新响应
 */
export interface UserStatusUpdateResponse {
  user_id: string
  is_active: boolean
  updated_by: string
  updated_at: string
  message: string
}

// ==================== 用户权限更新 ====================

/**
 * 用户权限更新请求
 */
export interface UserRoleUpdateRequest {
  is_admin: boolean
  reason?: string | null
}

/**
 * 用户权限更新响应
 */
export interface UserRoleUpdateResponse {
  user_id: string
  is_admin: boolean
  updated_by: string
  updated_at: string
  message: string
}

// ==================== 用户彻底删除 ====================

/**
 * 用户彻底删除响应
 */
export interface UserDeleteResponse {
  user_id: string
  message: string
  success: boolean
  deleted_counts?: Record<string, number>
}

// ==================== 错误处理 ====================

/**
 * API 错误响应
 */
export interface ApiError {
  message: string
  status?: number
  details?: unknown
  code?: string
}
