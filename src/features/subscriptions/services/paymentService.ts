// 支付相关API服务

import type {
  WeChatPaymentCreateRequest,
  WeChatPaymentResponse,
  RefundResponse,
  CreditPaymentOrder,
  CreditPaymentProvider,
} from '../types'
import { authenticatedFetch } from '@/features/auth/services/authService'
import { buildApiUrl } from './apiUrl'

// 获取API基础URL
const getApiBaseUrl = (): string => {
  return import.meta.env.VITE_API_BASE_URL || ''
}

// HTTP请求工具类
class HttpClient {
  private baseUrl: string

  constructor() {
    this.baseUrl = getApiBaseUrl()
  }

  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const response = await authenticatedFetch(buildApiUrl(this.baseUrl, endpoint, params), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '请求失败' }))
      throw new Error(error.message || error.detail || '请求失败')
    }

    return response.json()
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    const response = await authenticatedFetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '请求失败' }))
      throw new Error(error.message || error.detail || '请求失败')
    }

    return response.json()
  }
}

const httpClient = new HttpClient()

export async function createCreditPayment(packageId: string, provider: CreditPaymentProvider): Promise<CreditPaymentOrder> {
  return httpClient.post<CreditPaymentOrder>('/api/v1/credit-payments', { package_id: packageId, provider })
}

/**
 * 支付服务
 */
export const paymentService = {
  createCreditPayment,

  async getCreditPayment(outTradeNo: string): Promise<CreditPaymentOrder> {
    return httpClient.get<CreditPaymentOrder>(`/api/v1/credit-payments/${outTradeNo}`)
  },

  // ========== 微信支付 ==========

  /**
   * 创建微信支付订单
   */
  async createWeChatPayment(
    data: WeChatPaymentCreateRequest
  ): Promise<WeChatPaymentResponse> {
    return httpClient.post<WeChatPaymentResponse>(
      '/api/v1/subscriptions/payments/wechat/create',
      data
    )
  },

  /**
   * 查询支付订单状态
   */
  async queryPaymentStatus(outTradeNo: string): Promise<WeChatPaymentResponse> {
    return httpClient.get<WeChatPaymentResponse>(
      `/api/v1/subscriptions/payments/wechat/${outTradeNo}/status`
    )
  },

  /**
   * 轮询支付状态（辅助方法）
   * @param outTradeNo 商户订单号
   * @param interval 轮询间隔（毫秒）
   * @param maxAttempts 最大尝试次数
   * @param onStatusUpdate 状态更新回调
   * @param cancelSignal 取消信号（用于外部停止轮询）
   */
  async pollPaymentStatus(
    outTradeNo: string,
    interval: number = 3000,
    maxAttempts: number = 60,
    onStatusUpdate?: (payment: WeChatPaymentResponse) => void,
    cancelSignal?: { cancelled: boolean }
  ): Promise<WeChatPaymentResponse> {
    let attempts = 0
    let consecutiveErrors = 0
    let timeoutId: NodeJS.Timeout | null = null

    return new Promise((resolve, reject) => {
      const poll = async () => {
        // 检查是否已取消
        if (cancelSignal?.cancelled) {
          if (timeoutId) clearTimeout(timeoutId)
          reject(new Error('轮询已取消'))
          return
        }

        try {
          attempts++
          console.log(`🔄 轮询支付状态 [${attempts}/${maxAttempts}] | 订单号: ${outTradeNo}`)
          const payment = await this.queryPaymentStatus(outTradeNo)

          // 成功查询，重置错误计数
          consecutiveErrors = 0
          console.log(`✅ 查询成功 | 状态: ${payment.trade_state} | 订单号: ${outTradeNo}`)

          // 再次检查是否已取消
          if (cancelSignal?.cancelled) {
            if (timeoutId) clearTimeout(timeoutId)
            reject(new Error('轮询已取消'))
            return
          }

          // 通知状态更新（包裹在 try-catch 中，避免回调异常中断轮询）
          if (onStatusUpdate) {
            try {
              onStatusUpdate(payment)
            } catch (callbackError) {
              console.error('支付状态更新回调异常:', callbackError)
              // 继续轮询，不因回调异常而中断
            }
          }

          // 检查是否已完成支付（微信支付）
          if (payment.trade_state === 'SUCCESS') {
            console.log(`🎉 支付成功 | 订单号: ${outTradeNo}`)
            resolve(payment)
            return
          }

          // 检查是否支付失败或取消
          if (payment.trade_state === 'CLOSED' ||
              payment.trade_state === 'REVOKED' ||
              payment.trade_state === 'PAYERROR') {
            console.warn(`⚠️ 支付失败 | 状态: ${payment.trade_state} | 订单号: ${outTradeNo}`)
            resolve(payment)
            return
          }

          // 检查是否超过最大尝试次数
          if (attempts >= maxAttempts) {
            console.error(`⏰ 轮询超时 | 已尝试 ${attempts} 次 | 订单号: ${outTradeNo}`)
            reject(new Error('支付超时，请重试'))
            return
          }

          // 继续轮询
          console.log(`⏳ 继续轮询 | 下次查询在 ${interval/1000}秒后 | 订单号: ${outTradeNo}`)
          timeoutId = setTimeout(poll, interval)
        } catch (error) {
          consecutiveErrors++

          // 错误重试逻辑：连续失败5次后才真正停止
          if (consecutiveErrors <= 5) {
            console.warn(`轮询失败 (${consecutiveErrors}/5)，将在 ${interval}ms 后重试...`, error)
            timeoutId = setTimeout(poll, interval)
          } else {
            console.error('轮询连续失败5次，停止轮询', error)
            reject(new Error('网络连接失败，请检查网络后重试'))
          }
        }
      }

      poll()
    })
  },

  // ========== 支付管理（管理员） ==========

  /**
   * 退款（管理员）
   */
  async refundPayment(
    outTradeNo: string,
    refundAmount: number,
    refundReason: string
  ): Promise<RefundResponse> {
    return httpClient.post<RefundResponse>(
      `/api/v1/credit-payments/${outTradeNo}/refund`,
      { refund_amount: refundAmount, refund_reason: refundReason }
    )
  },

  /**
   * 关闭订单（管理员）
   */
  async closePayment(outTradeNo: string): Promise<{ message: string; success: boolean }> {
    return httpClient.post(
      `/api/v1/subscriptions/payments/${outTradeNo}/close`
    )
  },

  // ========== 辅助方法 ==========

  /**
   * 取消轮询（用于组件卸载时清理）
   */
  cancelPolling: null as (() => void) | null,
}

export default paymentService
