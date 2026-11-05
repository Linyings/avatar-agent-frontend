// 订阅计划相关类型定义

/**
 * 计费周期
 */
export type BillingCycle = 'monthly' | 'yearly'

/**
 * 订阅状态
 */
export type SubscriptionStatus =
  | 'active'      // 活跃
  | 'trialing'    // 试用中
  | 'scheduled_cancel' // 到期取消
  | 'canceled'    // 已取消
  | 'cancelled'   // 已取消
  | 'expired'     // 已过期
  | 'paused'      // 已暂停
  | 'past_due'    // 逾期
  | 'refunded'    // 已退款
  | 'disputed'    // 争议中

/**
 * 订阅计划创建请求
 */
export interface SubscriptionPlanCreateRequest {
  name?: string
  display_name: string
  description?: string | null
  monthly_credits?: number
  monthly_token_limit: number
  price_monthly: number
  price_yearly: number
  currency?: string
  creem_product_id_monthly?: string
  creem_product_id_yearly?: string
  alipay_plan_id?: string
  alipay_product_id?: string
  subscription_provider_enabled?: boolean
  features?: string[]
  is_featured?: boolean
  is_active?: boolean
  limits?: Record<string, any>
  sort_order?: number
}

/**
 * 订阅计划更新请求
 */
export interface SubscriptionPlanUpdateRequest {
  display_name?: string | null
  description?: string | null
  monthly_credits?: number | null
  monthly_token_limit?: number | null
  price_monthly?: number | null
  price_yearly?: number | null
  currency?: string | null
  creem_product_id_monthly?: string | null
  creem_product_id_yearly?: string | null
  alipay_plan_id?: string | null
  alipay_product_id?: string | null
  subscription_provider_enabled?: boolean | null
  features?: string[] | null
  limits?: Record<string, any> | null
  is_active?: boolean | null
  is_featured?: boolean | null
  sort_order?: number | null
}

/**
 * 订阅计划响应
 */
export interface SubscriptionPlanResponse {
  id: string
  name: string
  display_name: string
  description: string | null
  monthly_credits?: number
  monthly_token_limit: number
  price_monthly: string
  price_yearly: string
  currency?: string
  creem_product_id_monthly: string
  creem_product_id_yearly: string
  alipay_plan_id?: string
  alipay_product_id?: string
  subscription_provider_enabled?: boolean
  features: string[]
  is_featured: boolean
  limits: Record<string, any>
  is_active: boolean
  sort_order: number
  is_deleted?: boolean
  deleted_at?: string | null
  created_at: string
  updated_at: string
}

/**
 * 用户订阅响应
 */
export interface UserSubscriptionResponse {
  id: string
  user_id: string
  plan: SubscriptionPlanResponse
  status: string
  billing_cycle: string
  payment_provider?: 'alipay' | 'creem' | string
  management_action?: 'alipay_portal' | 'creem_portal' | string
  current_period_start: string
  current_period_end: string
  next_charge_at?: string | null
  grace_period_ends_at?: string | null
  provider_failure_reason?: string | null
  cancel_at_period_end: boolean
  cancelled_at: string | null
  trial_end: string | null
  monthly_token_used: number
  monthly_token_limit: number
  token_usage_percentage: number
  remaining_tokens: number
  created_at: string
  updated_at: string
}

export interface AlipayCheckoutResponse {
  checkout_url: string
  request_id: string
}

export interface AlipaySyncRequest {
  request_id?: string | null
  trade_no?: string | null
}

export interface AlipaySyncResponse {
  status: 'pending' | 'active' | 'failed' | string
  subscription?: UserSubscriptionResponse | null
}

export interface AlipayPortalResponse {
  portal_url: string
}

export interface CurrentSubscriptionResponse {
  success: boolean
  mode: string
  subscription: UserSubscriptionResponse | null
  purchased_credits: number
  subscription_credits: number
  remaining_credits: number
  token_account?: Record<string, any>
}

export interface SubscriptionCheckoutRequest {
  plan_id: string
  billing_cycle: BillingCycle
}

export interface CheckoutResponse {
  success: boolean
  action?: 'checkout' | 'upgraded' | 'unchanged' | 'portal'
  mode?: string
  message?: string
  checkout_id?: string
  checkout_url?: string
  portal_url?: string
  return_url?: string
  request_id?: string
  update_behavior?: string
  subscription?: UserSubscriptionResponse
  plan?: SubscriptionPlanResponse
  billing_cycle?: BillingCycle
}

export interface CreemCheckoutSyncRequest {
  checkout_id: string
  order_id?: string | null
  customer_id?: string | null
  product_id?: string | null
  subscription_id?: string | null
  request_id?: string | null
  signature?: string | null
}

export interface CreemCheckoutSyncResponse {
  success: boolean
  synced: boolean
  purpose?: 'subscription' | 'credit_purchase' | string
  checkout_id?: string
  remaining_credits?: number
  purchased_credits?: number
  subscription_credits?: number
  token_account?: Record<string, any>
  subscription?: UserSubscriptionResponse | null
}

export interface PortalResponse {
  success: boolean
  portal_url: string
  return_url?: string
}

/**
 * 订阅升级请求
 */
export interface SubscriptionUpgradeRequest {
  plan_id: string
  billing_cycle?: BillingCycle
}

/**
 * 订阅取消请求
 */
export interface SubscriptionCancelRequest {
  cancel_at_period_end?: boolean
  cancel_reason?: string | null
}

/**
 * 订阅操作响应
 */
export interface SubscriptionOperationResponse {
  success: boolean
  message: string
  data?: Record<string, any> | null
}

/**
 * 订阅统计响应
 */
export interface SubscriptionStatsResponse {
  total_subscribers: number
  active_subscribers: number
  cancelled_subscribers: number
  plan_distribution: Record<string, number>
  revenue_by_plan: Record<string, string>
  monthly_revenue: string
  yearly_revenue: string
  total_token_usage: number
  average_monthly_usage: number
  growth_rate: number
  churn_rate: number
  last_updated: string
}

/**
 * 分页响应
 */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

/**
 * 分页参数
 */
export interface PaginationParams {
  page?: number
  per_page?: number
}
