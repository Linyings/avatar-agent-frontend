// 支付相关类型定义

import type { BillingCycle } from './subscription.types'

export type CreditPaymentProvider = 'wechat' | 'alipay'
export type PaymentProvider = CreditPaymentProvider
export interface CreditPaymentOrder {
  out_trade_no: string
  provider: CreditPaymentProvider
  status: 'pending' | 'paid' | 'closed' | 'failed' | 'refund_required' | 'refunded'
  amount_cny: string
  credits: number
  code_url: string
  paid_at?: string
  expires_at?: string
}

/**
 * 支付状态
 */
export type PaymentStatus =
  | 'pending'    // 待支付
  | 'paid'       // 已支付
  | 'failed'     // 支付失败
  | 'cancelled'  // 已取消
  | 'refunded'   // 已退款

/**
 * 交易状态（微信支付）
 */
export type TradeState =
  | 'NOTPAY'      // 未支付
  | 'SUCCESS'     // 支付成功
  | 'REFUND'      // 转入退款
  | 'CLOSED'      // 已关闭
  | 'REVOKED'     // 已撤销（仅付款码支付会返回）
  | 'USERPAYING'  // 用户支付中
  | 'PAYERROR'    // 支付失败

/**
 * 微信 JSAPI 支付参数
 */
export interface JSAPIParams {
  appId: string
  timeStamp: string
  nonceStr: string
  package: string
  signType: string
  paySign: string
}

/**
 * 微信支付创建请求（Native 扫码支付）
 */
export interface WeChatPaymentCreateRequest {
  plan_id: string
  billing_cycle?: BillingCycle
  attach?: string | null
}

/**
 * 微信支付响应（Native 扫码支付）
 */
export interface WeChatPaymentResponse {
  payment_id: string
  out_trade_no: string
  code_url: string | null  // Native 支付二维码链接
  transaction_id: string | null
  total_amount: string
  currency: string
  trade_state: TradeState
  trade_state_desc: string
  success_time: string | null
  time_expire: string | null
  plan_id: string
  user_id: string
  created_at: string
  updated_at: string
}

/**
 * 支付查询参数
 */
export interface PaymentQueryParams {
  status?: PaymentStatus
  start_date?: string
  end_date?: string
  page?: number
  per_page?: number
}

/**
 * 退款请求
 */
export interface RefundRequest {
  out_trade_no: string
  refund_amount: number
  refund_reason: string
}

/**
 * 退款响应
 */
export interface RefundResponse {
  success: boolean
  message: string
  refund_id?: string
  refund_amount?: string
}

/**
 * 支付订单列表项
 */
export interface PaymentOrderItem {
  payment_id: string
  out_trade_no: string
  user_id: string
  username?: string
  email?: string
  plan_name: string
  subject: string
  total_amount: string
  status: PaymentStatus
  trade_state: TradeState
  created_at: string
  success_time: string | null
  time_expire: string | null
}

// 为了向后兼容，保留旧的类型别名（可选，后续可以删除）
/**
 * @deprecated 使用 WeChatPaymentCreateRequest 代替
 */
export type AlipayPaymentCreateRequest = WeChatPaymentCreateRequest

/**
 * @deprecated 使用 WeChatPaymentResponse 代替
 */
export type AlipayPaymentResponse = WeChatPaymentResponse

/**
 * @deprecated 使用 TradeState 代替
 */
export type TradeStatus = TradeState
