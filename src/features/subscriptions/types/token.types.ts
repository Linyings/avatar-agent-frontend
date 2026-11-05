// Token使用统计相关类型定义

import type { TradeState } from './payment.types'

/**
 * Token消费请求
 */
export interface TokenConsumptionRequest {
  token_count: number
  credit_count?: number
  api_endpoint: string
  model_name: string
  project_id?: string | null
  request_metadata?: Record<string, any>
}

/**
 * Token可用性响应
 */
export interface TokenAvailabilityResponse {
  available: boolean
  remaining_tokens: number
  required_tokens: number
  remaining_credits?: number
  required_credits?: number
  message: string
}

/**
 * Token使用统计响应
 */
export interface TokenUsageStatsResponse {
  current_month_used: number
  total_tokens: number            // 账户总Token（新增）
  remaining_tokens: number        // 剩余Token
  total_credits?: number
  used_credits?: number
  remaining_credits?: number
  usage_percentage: number
  daily_usage: Array<{            // 每日使用趋势（最近30天）
    date: string
    token_count: number
    request_count: number
  }>
  api_endpoint_usage: Record<string, number>  // API端点使用分布
  model_usage: Record<string, number>         // 模型使用分布
  trend_analysis: {               // 趋势分析
    trend: 'increasing' | 'stable' | 'decreasing'
    growth_rate: number
    current_week_usage: number
    previous_week_usage: number
  }
  billing_month: string
  last_updated: string
}

/**
 * Token使用记录
 */
export interface TokenUsageRecord {
  id: string
  user_id: string
  subscription_id: string
  token_count: number
  credit_count?: number
  api_endpoint: string
  model_name: string
  model_id?: string
  provider?: string
  service_kind?: string
  prompt_tokens?: number
  completion_tokens?: number
  total_model_tokens?: number
  duration_seconds?: number | null
  cost_amount?: number | null
  revenue_amount?: number | null
  profit_amount?: number | null
  missing_pricing?: boolean
  project_id: string | null
  request_metadata: Record<string, any>
  recorded_at: string  // 后端返回的时间字段
  created_at?: string  // 保留兼容性
}

/**
 * Credits账户流水记录
 */
export interface CreditLedgerRecord {
  id: string
  user_id: string
  project_id: string | null
  project_name: string
  event_type: 'consume' | 'recharge' | 'admin_adjustment' | string
  item: string
  change_amount: number
  balance_after: number
  reason: string
  request_metadata: Record<string, any>
  recorded_at: string
  created_at: string
  updated_at: string
}

export interface CreditLedgerSummary {
  income: number
  expense: number
  net: number
  total_consumed_credits: number
  project_id?: string | null
  project_name?: string
}

export interface CreditLedgerUsageDetail {
  id: string
  user_id: string
  project_id: string | null
  token_count: number
  credit_count: number
  api_endpoint: string
  model_name: string
  model_id?: string
  provider?: string
  service_kind?: string
  prompt_tokens?: number
  completion_tokens?: number
  total_model_tokens?: number
  utf8_bytes?: number
  duration_seconds?: number | null
  billing_month?: string
  missing_pricing?: boolean
  recorded_at: string
  request_metadata?: Record<string, any>
  cost_amount?: number | null
  revenue_amount?: number | null
  profit_amount?: number | null
}

export interface CreditLedgerRecordDetail {
  record: CreditLedgerRecord
  usage_records: CreditLedgerUsageDetail[]
  service_breakdown: Record<string, number>
  endpoint_breakdown: Record<string, number>
  reservation_count: number
  billing_mode: string
}

/**
 * 每日使用数据
 */
export interface DailyUsageData {
  date: string
  tokens: number
  requests: number
}

/**
 * API端点使用统计
 */
export interface EndpointUsageStats {
  endpoint: string
  tokens: number
  requests: number
  percentage: number
}

/**
 * 模型使用统计
 */
export interface ModelUsageStats {
  model: string
  tokens: number
  requests: number
  percentage: number
}

/**
 * Token使用趋势
 */
export interface TokenUsageTrend {
  period: string
  tokens: number
  change_percentage: number
  is_increasing: boolean
}

// ========== Token账户系统相关类型 ==========

/**
 * Token余额响应
 */
export interface TokenBalance {
  user_id: string
  total_tokens: number           // 总Token数（累计充值）
  used_tokens: number             // 已使用Token数
  remaining_tokens: number        // 剩余Token数
  total_credits?: number
  used_credits?: number
  remaining_credits?: number
  reserved_credits?: number
  gross_remaining_credits?: number
  purchased_credits?: number
  purchased_total_credits?: number
  purchased_used_credits?: number
  subscription_credits?: number
  subscription_total_credits?: number
  subscription_used_credits?: number
  total_recharged: string         // 累计充值金额（元）
  last_recharge_at: string | null // 最后充值时间
  created_at: string
  updated_at: string
  next_expiry_at?: string | null
  trial_claimed?: boolean
}

/**
 * Token套餐响应
 */
export interface TokenPackage {
  id: string
  name: string                    // 套餐标识（basic/pro/enterprise）
  display_name: string            // 显示名称
  token_amount: number            // 基础Token数
  credit_amount?: number
  price: string                   // 人民币标价
  bonus_tokens: number            // 赠送Token数
  bonus_credits?: number
  total_tokens_with_bonus: number // 总Token（含赠送）
  total_credits_with_bonus?: number
  unit_price: string              // 单位价格（每千Token）
  creem_product_id?: string | null
  creem_enabled?: boolean
  creem_currency?: string
  currency?: 'CNY'
  validity_hours?: 720
  is_trial?: boolean
  per_account_purchase_limit?: number
  purchase_eligible?: boolean
  purchase_ineligible_reason?: 'trial_already_purchased' | 'purchase_limit_reached'
  is_active: boolean
  is_featured: boolean            // 是否推荐
  sort_order: number
  description?: string
  is_deleted?: boolean
  deleted_at?: string | null
  created_at: string
  updated_at: string
}

/**
 * Token套餐列表响应
 */
export interface TokenPackageListResponse {
  packages: TokenPackage[]
  total: number
}

/**
 * Token套餐创建请求（管理员）
 */
export interface TokenPackageCreateRequest {
  name?: string
  display_name: string
  token_amount: number
  credit_amount?: number
  price: string | number
  bonus_tokens?: number
  bonus_credits?: number
  creem_product_id?: string | null
  creem_enabled?: boolean
  creem_currency?: string
  description?: string
  is_featured?: boolean
  is_active?: boolean
  validity_hours?: 720
  is_trial?: boolean
  per_account_purchase_limit?: number
  sort_order?: number
}

/**
 * Token套餐更新请求（管理员）
 */
export interface TokenPackageUpdateRequest {
  display_name?: string
  token_amount?: number
  credit_amount?: number
  price?: string | number
  bonus_tokens?: number
  bonus_credits?: number
  creem_product_id?: string | null
  creem_enabled?: boolean
  creem_currency?: string
  description?: string
  is_featured?: boolean
  is_active?: boolean
  validity_hours?: 720
  is_trial?: boolean
  per_account_purchase_limit?: number
  sort_order?: number
}

/**
 * 充值请求
 */
export interface TokenRechargeRequest {
  package_id: string
}

/**
 * 充值订单响应 - 根据后端接口文档
 */
export interface TokenRechargeResponse {
  payment_id: string              // 支付ID
  out_trade_no: string            // 商户订单号
  code_url: string                // 支付二维码链接（Native支付）
  package_info: any               // 套餐信息
  total_amount: string            // 支付金额（元）
  expires_in: number              // 订单有效期（秒）
}

export interface CreemCreditRechargeResponse {
  success: boolean
  checkout_id: string
  checkout_url: string
  request_id: string
  package_info: TokenPackage
  total_amount: string | number
}

/**
 * 支付状态响应 - 根据后端接口文档
 */
export interface TokenPaymentStatusResponse {
  payment_id: string              // 支付ID
  out_trade_no: string            // 商户订单号
  transaction_id: string | null   // 微信支付订单号
  trade_state: string             // 交易状态（NOTPAY, SUCCESS, CLOSED等）
  trade_state_desc: string | null // 交易状态描述
  status: string                  // 内部状态
  total_amount: string            // 支付金额（元）
  success_time: string | null     // 支付成功时间
  created_at: string              // 创建时间
  updated_at: string              // 更新时间
}

/**
 * 充值记录
 */
export interface TokenRechargeRecord {
  id: string
  user_id: string
  package_id: string
  package_name: string
  out_trade_no: string
  total_amount: string
  token_amount: number
  credit_amount?: number
  bonus_tokens: number
  bonus_credits?: number
  payment_status: TradeState
  paid_at: string | null
  recharged_at: string | null
  created_at: string
}
