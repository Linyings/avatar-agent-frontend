import { authenticatedFetch } from '@/features/auth/services/authService'

// ==================== 类型定义 ====================

/**
 * 时间段摘要
 */
export interface PeriodSummary {
  start_date: string
  end_date: string
  total_tokens_consumed: number
  total_credits_consumed?: number
  total_requests: number
  active_users: number
  new_users: number
  total_recharged: string
  confirmed_revenue?: number
  third_party_cost?: number
  gross_profit?: number
  gross_margin?: number
  currency?: string
  missing_pricing_count?: number
}

/**
 * 系统总览响应
 */
export interface SystemOverviewResponse {
  total_users: number
  active_users: number
  admin_users: number
  verified_users: number
  total_tokens_consumed: number
  total_credits_consumed?: number
  total_recharged: string
  confirmed_revenue?: number
  third_party_cost?: number
  gross_profit?: number
  gross_margin?: number
  currency?: string
  missing_pricing_count?: number
  period_summary: PeriodSummary
}

/**
 * 用户排名项
 */
export interface UserRankingItem {
  rank: number
  user_id: string
  username: string
  email: string
  tokens_used: number
  credits_used?: number
  credit_count?: number
  request_count: number
  percentage: number
}

/**
 * 用户排名响应
 */
export interface UserRankingResponse {
  ranking: UserRankingItem[]
  period: string
  total_consumption: number
  start_date?: string
  end_date?: string
}

/**
 * 趋势数据点
 */
export interface TrendDataPoint {
  date: string
  token_count: number
  credit_count?: number
  request_count: number
  unique_users: number
  cost_amount?: number
  revenue_amount?: number
  profit_amount?: number
  currency?: string
}

/**
 * Credits 趋势响应
 */
export interface TokenTrendsResponse {
  trend_data: TrendDataPoint[]
  group_by: string
  total_tokens: number
  total_credits?: number
  total_requests: number
  cost_amount?: number
  revenue_amount?: number
  profit_amount?: number
  start_date?: string
  end_date?: string
}

/**
 * 模型使用统计项
 */
export interface ModelUsageStatsItem {
  provider?: string
  service_kind?: string
  model_id?: string
  model_name: string
  token_count: number
  credit_count?: number
  request_count: number
  unique_users: number
  percentage: number
  prompt_tokens?: number
  completion_tokens?: number
  total_model_tokens?: number
  utf8_bytes?: number
  duration_seconds?: number
  cost_amount?: number
  revenue_amount?: number
  profit_amount?: number
  gross_margin?: number
  currency?: string
  missing_pricing_count?: number
}

/**
 * 模型使用统计响应
 */
export interface ModelUsageStatsResponse {
  model_stats: ModelUsageStatsItem[]
  total_tokens: number
  total_credits?: number
  total_requests: number
  cost_amount?: number
  revenue_amount?: number
  profit_amount?: number
  gross_margin?: number
  currency?: string
  period: string
}

/**
 * API使用统计项
 */
export interface ApiUsageStatsItem {
  api_endpoint: string
  token_count: number
  credit_count?: number
  request_count: number
  unique_users: number
  percentage: number
  avg_tokens_per_request: number
  avg_credits_per_request?: number
  utf8_bytes?: number
  cost_amount?: number
  revenue_amount?: number
  profit_amount?: number
  gross_margin?: number
  currency?: string
  missing_pricing_count?: number
}

/**
 * API使用统计响应
 */
export interface ApiUsageStatsResponse {
  api_stats: ApiUsageStatsItem[]
  total_tokens: number
  total_credits?: number
  total_requests: number
  cost_amount?: number
  revenue_amount?: number
  profit_amount?: number
  gross_margin?: number
  currency?: string
  period: string
}

/**
 * 时间范围查询参数
 */
export interface TimeRangeParams {
  start_date?: string
  end_date?: string
  days?: number
}

/**
 * 用户排名查询参数
 */
export interface UserRankingParams extends TimeRangeParams {
  limit?: number
}

/**
 * Credits 趋势查询参数
 */
export interface TokenTrendsParams extends TimeRangeParams {
  group_by?: 'day' | 'week' | 'month'
}

// ==================== HTTP 请求工具类 ====================

const getApiBaseUrl = (): string => {
  return import.meta.env.VITE_API_BASE_URL || ''
}

class StatisticsHttpClient {
  private baseUrl: string

  constructor() {
    this.baseUrl = getApiBaseUrl()
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`

    // 默认请求头
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>)
    }

    const config: RequestInit = {
      ...options,
      headers
    }

    try {
      const response = await authenticatedFetch(url, config)

      // 处理响应
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          errorData.detail ||
          errorData.message ||
          `请求失败: ${response.status} ${response.statusText}`
        )
      }

      return await response.json()
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('网络请求失败')
    }
  }

  /**
   * 构建查询参数字符串
   */
  private buildQueryString(params: Record<string, any>): string {
    const searchParams = new URLSearchParams()

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value))
      }
    })

    const queryString = searchParams.toString()
    return queryString ? `?${queryString}` : ''
  }

  /**
   * GET 请求
   */
  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const queryString = params ? this.buildQueryString(params) : ''
    return this.request<T>(`${endpoint}${queryString}`, {
      method: 'GET'
    })
  }
}

// ==================== 统计分析服务 ====================

class StatisticsService {
  private client: StatisticsHttpClient

  constructor() {
    this.client = new StatisticsHttpClient()
  }

  /**
   * 获取系统总览统计
   *
   * @param params - 时间范围参数
   * @returns 系统总览数据
   */
  async getSystemOverview(params?: TimeRangeParams): Promise<SystemOverviewResponse> {
    return this.client.get<SystemOverviewResponse>(
      '/api/v1/admin/statistics/overview',
      params
    )
  }

  /**
   * 获取用户 Credits 消耗排名
   *
   * @param params - 查询参数（时间范围、限制数量）
   * @returns 用户排名数据
   */
  async getUserRanking(params?: UserRankingParams): Promise<UserRankingResponse> {
    return this.client.get<UserRankingResponse>(
      '/api/v1/admin/statistics/users/ranking',
      params
    )
  }

  /**
   * 获取 Credits 消耗趋势
   *
   * @param params - 查询参数（时间范围、分组方式）
   * @returns Credits 趋势数据
   */
  async getTokenTrends(params?: TokenTrendsParams): Promise<TokenTrendsResponse> {
    return this.client.get<TokenTrendsResponse>(
      '/api/v1/admin/statistics/tokens/trends',
      params
    )
  }

  /**
   * 获取模型使用统计
   *
   * @param params - 时间范围参数
   * @returns 模型使用统计数据
   */
  async getModelUsage(params?: TimeRangeParams): Promise<ModelUsageStatsResponse> {
    return this.client.get<ModelUsageStatsResponse>(
      '/api/v1/admin/statistics/models/usage',
      params
    )
  }

  /**
   * 获取API端点使用统计
   *
   * @param params - 时间范围参数
   * @returns API使用统计数据
   */
  async getApiUsage(params?: TimeRangeParams): Promise<ApiUsageStatsResponse> {
    return this.client.get<ApiUsageStatsResponse>(
      '/api/v1/admin/statistics/apis/usage',
      params
    )
  }
}

// 导出服务实例
export const statisticsService = new StatisticsService()
export default statisticsService
