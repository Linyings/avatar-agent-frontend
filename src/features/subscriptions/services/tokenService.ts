// Credits使用统计相关API服务
// 注意：本服务已重定向到tokenAccountService，推荐使用tokenAccountService

import type {
  TokenConsumptionRequest,
  TokenAvailabilityResponse,
  TokenUsageStatsResponse,
  TokenUsageRecord,
  PaginatedResponse,
  PaginationParams
} from '../types'
import { tokenAccountService } from './tokenAccountService'
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

  async post<T>(endpoint: string, data?: any, queryParams?: Record<string, any>): Promise<T> {
    const response = await authenticatedFetch(buildApiUrl(this.baseUrl, endpoint, queryParams), {
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

/**
 * Credits服务
 */
export const tokenService = {
  // ========== Credits使用统计 ==========

  /**
   * 获取Credits使用统计
   * @deprecated 请使用 tokenAccountService.getUsageStats()
   */
  async getUsageStats(): Promise<TokenUsageStatsResponse> {
    // 重定向到新的API
    return tokenAccountService.getUsageStats()
  },

  /**
   * 获取Credits使用记录列表
   * @deprecated 请使用 tokenAccountService.listUsageRecords()
   */
  async listUsageRecords(
    params?: PaginationParams
  ): Promise<PaginatedResponse<TokenUsageRecord>> {
    // 重定向到新的API
    return tokenAccountService.listUsageRecords(params)
  },

  /**
   * 检查Credits可用性
   * @deprecated 请使用 tokenAccountService.getBalance() 然后手动检查余额
   */
  async checkAvailability(requiredTokens: number): Promise<TokenAvailabilityResponse> {
    // 基于新的余额API实现
    const balance = await tokenAccountService.getBalance()
    const remainingCredits = balance.remaining_credits ?? balance.remaining_tokens
    return {
      available: remainingCredits >= requiredTokens,
      remaining_tokens: balance.remaining_tokens,
      required_tokens: requiredTokens,
      remaining_credits: remainingCredits,
      required_credits: requiredTokens,
      message: remainingCredits >= requiredTokens
        ? 'Credits充足'
        : `Credits不足，还需${requiredTokens - remainingCredits}`
    }
  },

  /**
   * 消费Credits（内部API）
   */
  async consumeTokens(data: TokenConsumptionRequest): Promise<{
    success: boolean
    remaining_tokens: number
    message: string
  }> {
    return httpClient.post(
      '/api/v1/subscriptions/tokens/consume',
      data
    )
  },

  // ========== 辅助方法 ==========

  /**
   * 格式化Credits数量
   */
  formatTokenCount(tokens: number): string {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`
    }
    return tokens.toString()
  },

  /**
   * 计算使用百分比
   */
  calculateUsagePercentage(used: number, limit: number): number {
    if (limit === 0) return 0
    return Math.round((used / limit) * 100)
  },

  /**
   * 获取使用状态（正常/警告/危险）
   */
  getUsageStatus(percentage: number): 'normal' | 'warning' | 'danger' {
    if (percentage >= 90) return 'danger'
    if (percentage >= 70) return 'warning'
    return 'normal'
  },

  /**
   * 获取使用状态颜色
   */
  getUsageColor(percentage: number): string {
    const status = this.getUsageStatus(percentage)
    switch (status) {
      case 'danger':
        return '#ef4444' // red-500
      case 'warning':
        return '#f59e0b' // amber-500
      default:
        return '#3f7cff' // 主色
    }
  },
}

export default tokenService
