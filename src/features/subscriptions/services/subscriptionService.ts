// 订阅相关API服务

import type {
  SubscriptionPlanCreateRequest,
  SubscriptionPlanUpdateRequest,
  SubscriptionPlanResponse,
  UserSubscriptionResponse,
  SubscriptionUpgradeRequest,
  SubscriptionCancelRequest,
  SubscriptionOperationResponse,
  SubscriptionStatsResponse,
  PaginatedResponse,
  PaginationParams,
  CurrentSubscriptionResponse,
  SubscriptionCheckoutRequest,
  CheckoutResponse,
  CreemCheckoutSyncRequest,
  CreemCheckoutSyncResponse,
  PortalResponse,
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

  private async request<T>(url: string, init: RequestInit, options?: { auth?: boolean }): Promise<T> {
    const requestInit: RequestInit = {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> | undefined),
      },
    }
    const response = options?.auth === false
      ? await fetch(url, requestInit)
      : await authenticatedFetch(url, requestInit)

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '请求失败' }))
      throw new Error(error.message || error.detail || '请求失败')
    }

    return response.json()
  }

  async get<T>(endpoint: string, params?: Record<string, any>, options?: { auth?: boolean }): Promise<T> {
    return this.request<T>(buildApiUrl(this.baseUrl, endpoint, params), {
      method: 'GET',
    }, options)
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
    })
  }
}

const httpClient = new HttpClient()

function normalizeSubscriptionPlanPayload<
  T extends SubscriptionPlanCreateRequest | SubscriptionPlanUpdateRequest,
>(data: T): T {
  const payload = { ...data } as Record<string, any>

  if (payload.price_monthly !== undefined && payload.price_monthly !== null) {
    payload.price_monthly = Number(payload.price_monthly)
  }
  if (payload.price_yearly !== undefined && payload.price_yearly !== null) {
    payload.price_yearly = Number(payload.price_yearly)
  }
  if (payload.monthly_credits === undefined && payload.monthly_token_limit !== undefined) {
    payload.monthly_credits = payload.monthly_token_limit
  }

  return payload as T
}

/**
 * 订阅服务
 */
export const subscriptionService = {
  // ========== 订阅计划管理 ==========

  /**
   * 获取订阅计划列表
   */
  async listPlans(params?: PaginationParams): Promise<PaginatedResponse<SubscriptionPlanResponse>> {
    return httpClient.get<PaginatedResponse<SubscriptionPlanResponse>>(
      '/api/v1/subscriptions/plans',
      params,
      { auth: false }
    )
  },

  async listAdminPlans(params?: PaginationParams): Promise<PaginatedResponse<SubscriptionPlanResponse>> {
    return httpClient.get<PaginatedResponse<SubscriptionPlanResponse>>(
      '/api/v1/subscriptions/admin/plans',
      params
    )
  },

  /**
   * 获取单个订阅计划
   */
  async getPlan(planName: string): Promise<SubscriptionPlanResponse> {
    return httpClient.get<SubscriptionPlanResponse>(
      `/api/v1/subscriptions/plans/${planName}`,
      undefined,
      { auth: false }
    )
  },

  /**
   * 创建订阅计划（管理员）
   */
  async createPlan(data: SubscriptionPlanCreateRequest): Promise<SubscriptionPlanResponse> {
    return httpClient.post<SubscriptionPlanResponse>(
      '/api/v1/subscriptions/plans',
      normalizeSubscriptionPlanPayload(data)
    )
  },

  /**
   * 更新订阅计划（管理员）
   */
  async updatePlan(
    planId: string,
    data: SubscriptionPlanUpdateRequest
  ): Promise<SubscriptionPlanResponse> {
    return httpClient.put<SubscriptionPlanResponse>(
      `/api/v1/subscriptions/plans/${planId}`,
      normalizeSubscriptionPlanPayload(data)
    )
  },

  /**
   * 删除订阅计划（管理员）
   */
  async deletePlan(planId: string, options?: { hard?: boolean }): Promise<{ message: string }> {
    const suffix = options?.hard ? '?hard=true' : ''
    return httpClient.delete<{ message: string }>(
      `/api/v1/subscriptions/plans/${planId}${suffix}`
    )
  },

  // ========== 用户订阅管理 ==========

  /**
   * 获取当前用户订阅信息
   */
  async getCurrentSubscription(): Promise<CurrentSubscriptionResponse> {
    return httpClient.get<CurrentSubscriptionResponse>('/api/v1/subscriptions/current')
  },

  /**
   * 初始化用户订阅（新用户注册）
   */
  async initializeSubscription(
    planName: string = 'free',
    billingCycle: string = 'monthly'
  ): Promise<UserSubscriptionResponse> {
    return httpClient.post<UserSubscriptionResponse>(
      '/api/v1/subscriptions/initialize',
      { plan_name: planName, billing_cycle: billingCycle }
    )
  },

  /**
   * 升级/降级订阅
   */
  async upgradeSubscription(
    data: SubscriptionUpgradeRequest
  ): Promise<SubscriptionOperationResponse> {
    return httpClient.post<SubscriptionOperationResponse>(
      '/api/v1/subscriptions/upgrade',
      data
    )
  },

  async createCheckout(data: SubscriptionCheckoutRequest): Promise<CheckoutResponse> {
    return httpClient.post<CheckoutResponse>('/api/v1/subscriptions/checkout', data)
  },

  async syncCreemCheckout(data: CreemCheckoutSyncRequest): Promise<CreemCheckoutSyncResponse> {
    return httpClient.post<CreemCheckoutSyncResponse>('/api/v1/billing/creem/checkout/sync', data)
  },

  async createPortal(): Promise<PortalResponse> {
    return httpClient.post<PortalResponse>('/api/v1/subscriptions/portal')
  },

  /**
   * 取消订阅
   */
  async cancelSubscription(
    data?: SubscriptionCancelRequest
  ): Promise<SubscriptionOperationResponse> {
    return httpClient.post<SubscriptionOperationResponse>(
      '/api/v1/subscriptions/cancel',
      data || {}
    )
  },

  // ========== 统计信息 ==========

  /**
   * 获取订阅统计（管理员）
   */
  async getStats(): Promise<SubscriptionStatsResponse> {
    return httpClient.get<SubscriptionStatsResponse>('/api/v1/subscriptions/stats')
  },

  // ========== 管理任务 ==========

  /**
   * 重置月度Token计数器（管理员）
   */
  async resetMonthlyTokens(): Promise<{ message: string; affected_count: number }> {
    return httpClient.post('/api/v1/subscriptions/tasks/reset-tokens')
  },

  /**
   * 处理过期订阅（管理员）
   */
  async handleExpiredSubscriptions(): Promise<{ message: string; affected_count: number }> {
    return httpClient.post('/api/v1/subscriptions/tasks/handle-expired')
  },

  // ========== 调试接口 ==========

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return httpClient.get('/api/v1/subscriptions/health', undefined, { auth: false })
  },

  /**
   * 调试用户订阅（管理员）
   */
  async debugUserSubscription(userId: string): Promise<any> {
    return httpClient.get(`/api/v1/subscriptions/debug/user/${userId}`)
  },
}

export default subscriptionService
