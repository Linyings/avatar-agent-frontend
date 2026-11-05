// Credits套餐API服务

import type {
  TokenPackage,
  TokenPackageListResponse,
  TokenPackageCreateRequest,
  TokenPackageUpdateRequest
} from '../types'
import { authenticatedFetch } from '@/features/auth/services/authService'
import { buildApiUrl } from './apiUrl'

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

function normalizeTokenPackagePayload<T extends TokenPackageCreateRequest | TokenPackageUpdateRequest>(data: T): T {
  return {
    ...data,
    credit_amount: data.credit_amount ?? data.token_amount,
    bonus_credits: data.bonus_credits ?? data.bonus_tokens,
    price: data.price === undefined ? data.price : Number(data.price),
  }
}

/**
 * Credits套餐服务
 */
export const tokenPackageService = {
  /**
   * 获取Credits套餐列表（用户端）
   * 根据接口文档：GET /api/v1/credit-packages/packages
   */
  async listPackages(): Promise<TokenPackageListResponse> {
    try {
      // 使用正确的接口端点，不带分页参数将返回所有激活的套餐
      const response = await httpClient.get<any>('/api/v1/credit-packages/packages', undefined, { auth: false })

      console.log('Credits套餐列表响应:', response)

      // 处理不同的返回格式
      // 如果后端直接返回数组
      if (Array.isArray(response)) {
        return {
          packages: response,
          total: response.length
        }
      }

      // 如果后端返回对象且包含 packages 字段
      if (response && typeof response === 'object' && 'packages' in response) {
        return {
          packages: Array.isArray(response.packages) ? response.packages : [],
          total: response.total || response.packages.length
        }
      }

      // 如果后端返回对象且包含 items 字段（分页格式）
      if (response && typeof response === 'object' && 'items' in response) {
        return {
          packages: Array.isArray(response.items) ? response.items : [],
          total: response.total || response.items.length
        }
      }

      // 默认返回空数组
      console.warn('Credits套餐列表返回格式不符合预期:', response)
      return {
        packages: [],
        total: 0
      }
    } catch (error) {
      console.error('获取Credits套餐列表失败:', error)
      throw error
    }
  },

  async listAdminPackages(): Promise<TokenPackageListResponse> {
    const response = await httpClient.get<any>('/api/v1/credit-packages/admin/packages', {
      page: 1,
      per_page: 100,
    })

    if (response && typeof response === 'object' && 'items' in response) {
      return {
        packages: Array.isArray(response.items) ? response.items : [],
        total: response.total || response.items.length,
      }
    }

    if (response && typeof response === 'object' && 'packages' in response) {
      return {
        packages: Array.isArray(response.packages) ? response.packages : [],
        total: response.total || response.packages.length,
      }
    }

    return {
      packages: Array.isArray(response) ? response : [],
      total: Array.isArray(response) ? response.length : 0,
    }
  },

  /**
   * 创建套餐（管理员）
   * 根据接口文档：POST /api/v1/credit-packages/packages
   */
  async createPackage(data: TokenPackageCreateRequest): Promise<TokenPackage> {
    return httpClient.post<TokenPackage>('/api/v1/credit-packages/packages', normalizeTokenPackagePayload(data))
  },

  /**
   * 更新套餐（管理员）
   * 根据接口文档：PUT /api/v1/credit-packages/packages/{package_id}
   */
  async updatePackage(id: string, data: TokenPackageUpdateRequest): Promise<TokenPackage> {
    return httpClient.put<TokenPackage>(`/api/v1/credit-packages/packages/${id}`, normalizeTokenPackagePayload(data))
  },

  /**
   * 删除套餐（管理员）
   * 根据接口文档：DELETE /api/v1/credit-packages/packages/{package_id}
   */
  async deletePackage(id: string, options?: { hard?: boolean }): Promise<{ message: string }> {
    const suffix = options?.hard ? '?hard=true' : ''
    return httpClient.delete<{ message: string }>(`/api/v1/credit-packages/packages/${id}${suffix}`)
  }
}

export default tokenPackageService
