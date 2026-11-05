/**
 * 管理员用户管理服务
 */
import { authenticatedFetch } from '@/features/auth/services/authService'
import type {
  AdminUserListResponse,
  AdminUserDetail,
  UserListQueryParams,
  TokenAdjustmentRequest,
  TokenAdjustmentResponse,
  UserStatusUpdateRequest,
  UserStatusUpdateResponse,
  UserRoleUpdateRequest,
  UserRoleUpdateResponse,
  UserDeleteResponse,
  ApiError
} from '../types/user'

// 获取API基础URL
const getApiBaseUrl = (): string => {
  return import.meta.env.VITE_API_BASE_URL || ''
}

// HTTP 请求工具类
class HttpClient {
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
      ...(options.headers as Record<string, string> || {})
    }

    const config: RequestInit = {
      ...options,
      headers
    }

    try {
      const response = await authenticatedFetch(url, config)

      // 处理响应
      if (!response.ok) {
        let errorMessage = `请求失败（${response.status}）`
        let errorCode: string | undefined
        let details: unknown

        try {
          const errorData = await response.json()

          if (errorData) {
            // 处理不同格式的错误响应
            if (typeof errorData.detail === 'string') {
              errorMessage = errorData.detail
            } else if (errorData.message) {
              errorMessage = errorData.message
            } else if (errorData.detail?.message) {
              errorMessage = errorData.detail.message
            }

            if (errorData.code || errorData.detail?.error) {
              errorCode = errorData.code || errorData.detail?.error
            }

            details = errorData.details || errorData.detail
          }
        } catch {
          // 解析失败，使用默认错误消息
        }

        const error: ApiError = {
          message: errorMessage,
          status: response.status,
          details,
          code: errorCode
        }
        throw error
      }

      // 处理JSON响应
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        return await response.json()
      } else {
        return {} as T
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'message' in error) {
        throw error
      }
      const apiError: ApiError = {
        message: '网络请求失败'
      }
      throw apiError
    }
  }

  async get<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
    let url = endpoint
    if (params) {
      const queryParams = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, String(value))
        }
      })
      const queryString = queryParams.toString()
      if (queryString) {
        url += `?${queryString}`
      }
    }
    return this.request<T>(url, { method: 'GET' })
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined
    })
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined
    })
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' })
  }
}

// 创建HTTP客户端实例
const httpClient = new HttpClient()

/**
 * 管理员用户管理服务
 */
export const adminUserService = {
  /**
   * 获取用户列表
   * 支持搜索、筛选、分页、排序
   */
  async listUsers(params?: UserListQueryParams): Promise<AdminUserListResponse> {
    return await httpClient.get<AdminUserListResponse>('/api/v1/admin/users', params as Record<string, unknown>)
  },

  /**
   * 获取用户详细信息
   */
  async getUserDetail(userId: string): Promise<AdminUserDetail> {
    return await httpClient.get<AdminUserDetail>(`/api/v1/admin/users/${userId}`)
  },

  /**
   * 调整用户Credits额度
   * @param userId 用户ID
   * @param data 调整请求数据
   */
  async adjustUserTokens(
    userId: string,
    data: TokenAdjustmentRequest
  ): Promise<TokenAdjustmentResponse> {
    return await httpClient.post<TokenAdjustmentResponse>(
      `/api/v1/admin/users/${userId}/credits`,
      data
    )
  },

  /**
   * 更新用户状态（封号/解封）
   * @param userId 用户ID
   * @param data 状态更新数据
   */
  async updateUserStatus(
    userId: string,
    data: UserStatusUpdateRequest
  ): Promise<UserStatusUpdateResponse> {
    return await httpClient.put<UserStatusUpdateResponse>(
      `/api/v1/admin/users/${userId}/status`,
      data
    )
  },

  /**
   * 更新用户权限（设置/取消管理员）
   * @param userId 用户ID
   * @param data 权限更新数据
   */
  async updateUserRole(
    userId: string,
    data: UserRoleUpdateRequest
  ): Promise<UserRoleUpdateResponse> {
    return await httpClient.put<UserRoleUpdateResponse>(
      `/api/v1/admin/users/${userId}/role`,
      data
    )
  },

  /**
   * 彻底删除用户及其关联数据
   * @param userId 用户ID
   */
  async deleteUserPermanently(userId: string): Promise<UserDeleteResponse> {
    return await httpClient.delete<UserDeleteResponse>(`/api/v1/admin/users/${userId}`)
  }
}

export default adminUserService
