// Credits账户API服务

import type {
  TokenBalance,
  TokenRechargeRequest,
  TokenRechargeResponse,
  TokenPaymentStatusResponse,
  CreemCreditRechargeResponse,
  TokenRechargeRecord,
  TokenUsageStatsResponse,
  TokenUsageRecord,
  CreditLedgerRecord,
  CreditLedgerRecordDetail,
  CreditLedgerSummary,
  PaginatedResponse,
  PaginationParams
} from '../types'
import { authenticatedFetch } from '@/features/auth/services/authService'
import { buildApiUrl } from './apiUrl'

type CreditLedgerListParams = PaginationParams & {
  project_id?: string
  event_type?: string
}

type CreditLedgerListResponse = PaginatedResponse<CreditLedgerRecord> & {
  summary?: CreditLedgerSummary
}

// 获取API基础URL
const getApiBaseUrl = (): string => {
  return import.meta.env.VITE_API_BASE_URL || ''
}

// HTTP请求工具类（复用现有实现）
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

      // 402 Credits不足特殊处理
      if (response.status === 402) {
        const event = new CustomEvent('token-insufficient', {
          detail: {
            message: error.detail?.message || error.message || 'Credits余额不足',
            remaining_tokens: error.detail?.remaining_tokens,
            required_tokens: error.detail?.required_tokens,
            remaining_credits: error.detail?.remaining_credits,
            required_credits: error.detail?.required_credits
          }
        })
        window.dispatchEvent(event)
      }

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

      // 402 Credits不足特殊处理
      if (response.status === 402) {
        const event = new CustomEvent('token-insufficient', {
          detail: {
            message: error.detail?.message || error.message || 'Credits余额不足',
            remaining_tokens: error.detail?.remaining_tokens,
            required_tokens: error.detail?.required_tokens,
            remaining_credits: error.detail?.remaining_credits,
            required_credits: error.detail?.required_credits
          }
        })
        window.dispatchEvent(event)
      }

      throw new Error(error.message || error.detail || '请求失败')
    }

    return response.json()
  }
}

const httpClient = new HttpClient()

/**
 * Credits账户服务
 */
export const tokenAccountService = {
  /**
   * 获取用户Credits余额
   */
  async getBalance(): Promise<TokenBalance> {
    return httpClient.get<TokenBalance>('/api/v1/credit-accounts/balance')
  },

  /**
   * 创建充值订单
   */
  async createRecharge(packageId: string): Promise<TokenRechargeResponse> {
    const data: TokenRechargeRequest = { package_id: packageId }
    return httpClient.post<TokenRechargeResponse>('/api/v1/credit-accounts/recharge', data)
  },

  async createCreemRecharge(packageId: string): Promise<CreemCreditRechargeResponse> {
    const data: TokenRechargeRequest = { package_id: packageId }
    return httpClient.post<CreemCreditRechargeResponse>('/api/v1/credit-accounts/recharge/creem', data)
  },

  /**
   * 查询支付状态
   */
  async getPaymentStatus(outTradeNo: string): Promise<TokenPaymentStatusResponse> {
    return httpClient.get<TokenPaymentStatusResponse>(
      `/api/v1/credit-accounts/recharge/${outTradeNo}/status`
    )
  },

  /**
   * 获取充值记录列表
   * 根据接口文档：GET /api/v1/credit-accounts/recharge/records
   */
  async listRechargeRecords(params?: PaginationParams): Promise<PaginatedResponse<TokenRechargeRecord>> {
    return httpClient.get<PaginatedResponse<TokenRechargeRecord>>(
      '/api/v1/credit-accounts/recharge/records',
      params
    )
  },

  /**
   * 获取用量统计
   */
  async getUsageStats(): Promise<TokenUsageStatsResponse> {
    return httpClient.get<TokenUsageStatsResponse>('/api/v1/credit-accounts/usage/stats')
  },

  /**
   * 获取用量记录列表
   */
  async listUsageRecords(params?: PaginationParams): Promise<PaginatedResponse<TokenUsageRecord>> {
    return httpClient.get<PaginatedResponse<TokenUsageRecord>>(
      '/api/v1/credit-accounts/usage/records',
      params
    )
  },

  /**
   * 获取Credits账户流水列表
   */
  async listLedgerRecords(params?: CreditLedgerListParams): Promise<CreditLedgerListResponse> {
    return httpClient.get<CreditLedgerListResponse>(
      '/api/v1/credit-accounts/ledger/records',
      params
    )
  },

  /**
   * 获取单条Credits流水详情
   */
  async getLedgerRecordDetail(recordId: string): Promise<CreditLedgerRecordDetail> {
    return httpClient.get<CreditLedgerRecordDetail>(
      `/api/v1/credit-accounts/ledger/records/${recordId}`
    )
  }
}

export default tokenAccountService
