import { authenticatedFetch } from '@/features/auth/services/authService'
import type {
  SystemSettingCreateRequest,
  SystemSettingUpdateRequest,
  SystemSettingResponse,
  PublicSystemSettingsResponse,
  SystemSettingsQueryParams,
  MessageResponse
} from '../types/system'

function normalizePublicSettingsResponse(response: unknown): PublicSystemSettingsResponse {
  if (response && typeof response === 'object') {
    const record = response as Record<string, unknown>
    if (record.settings && typeof record.settings === 'object' && !Array.isArray(record.settings)) {
      return { settings: record.settings as Record<string, object> }
    }

    return { settings: record as Record<string, object> }
  }

  return { settings: {} }
}

// 获取API基础URL
const getApiBaseUrl = (): string => {
  return import.meta.env.VITE_API_BASE_URL || ''
}

// HTTP 请求工具类 - 专用于系统配置API
class SystemHttpClient {
  private baseUrl: string

  constructor() {
    this.baseUrl = getApiBaseUrl()
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    requestOptions?: { auth?: boolean }
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
      const response = requestOptions?.auth === false
        ? await fetch(url, config)
        : await authenticatedFetch(url, config)
      
      // 处理响应
      if (!response.ok) {
        let errorMessage = `HTTP Error: ${response.status}`
        let details
        
        try {
          const errorData = await response.json()
          errorMessage = errorData.message || errorData.detail || errorMessage
          details = errorData
        } catch {
          // 如果无法解析错误响应，使用默认错误消息
        }

        const error = new Error(errorMessage) as Error & {
          status?: number
          details?: unknown
        }
        error.status = response.status
        error.details = details
        throw error
      }

      // 处理空响应
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        return await response.json()
      } else {
        return {} as T
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('网络请求失败')
    }
  }

  async get<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean>,
    options?: { auth?: boolean }
  ): Promise<T> {
    let url = endpoint
    if (params) {
      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value))
        }
      })
      url += `?${searchParams.toString()}`
    }
    return this.request<T>(url, { method: 'GET' }, options)
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
const systemHttpClient = new SystemHttpClient()

// 系统配置管理服务
export const systemService = {
  // 创建系统配置（仅管理员）
  async createSystemSetting(data: SystemSettingCreateRequest): Promise<SystemSettingResponse> {
    return await systemHttpClient.post<SystemSettingResponse>('/api/v1/system/settings', data)
  },

  // 获取系统配置列表（仅管理员）
  async getSystemSettings(params?: SystemSettingsQueryParams): Promise<SystemSettingResponse[]> {
    // 过滤掉 undefined 值以匹配 get 方法的类型要求
    const filteredParams = params ? Object.fromEntries(
      Object.entries(params).filter(([_, value]) => value !== undefined)
    ) as Record<string, string | number | boolean> : undefined

    return await systemHttpClient.get<SystemSettingResponse[]>('/api/v1/system/settings', filteredParams)
  },

  // 获取公开系统配置（无需认证）
  async getPublicSystemSettings(): Promise<PublicSystemSettingsResponse> {
    const response = await systemHttpClient.get<unknown>('/api/v1/system/settings/public', undefined, { auth: false })
    return normalizePublicSettingsResponse(response)
  },

  // 根据键名获取公开系统配置（无需认证）
  async getPublicSystemSettingByKey<T = unknown>(key: string): Promise<{ key: string; value: T }> {
    const response = await systemHttpClient.get<unknown>('/api/v1/system/settings/public', { key }, { auth: false })
    const settings = normalizePublicSettingsResponse(response).settings
    const value = settings[key]

    if (value === undefined) {
      const error = new Error(`公开系统配置不存在: ${key}`) as Error & { status?: number }
      error.status = 404
      throw error
    }

    return { key, value: value as T }
  },

  // 根据键名获取系统配置（仅管理员）
  async getSystemSettingByKey(key: string): Promise<SystemSettingResponse> {
    return await systemHttpClient.get<SystemSettingResponse>(`/api/v1/system/settings/${key}`)
  },

  // 更新系统配置（仅管理员）
  async updateSystemSetting(key: string, data: SystemSettingUpdateRequest): Promise<SystemSettingResponse> {
    return await systemHttpClient.put<SystemSettingResponse>(`/api/v1/system/settings/${key}`, data)
  },

  // 删除系统配置（仅管理员）
  async deleteSystemSetting(key: string): Promise<MessageResponse> {
    return await systemHttpClient.delete<MessageResponse>(`/api/v1/system/settings/${key}`)
  },

  // 清理过期数据（仅管理员）
  async cleanupExpiredData(): Promise<MessageResponse> {
    return await systemHttpClient.post<MessageResponse>('/api/v1/system/maintenance/cleanup-expired')
  },

  // 批量创建系统配置（仅管理员）- 便捷方法
  async bulkCreateSystemSettings(settings: SystemSettingCreateRequest[]): Promise<SystemSettingResponse[]> {
    const results = await Promise.all(
      settings.map(setting => this.createSystemSetting(setting))
    )
    return results
  },

  // 获取系统配置值（便捷方法）
  async getSystemSettingValue<T = unknown>(key: string, defaultValue?: T): Promise<T | undefined> {
    try {
      const setting = await this.getSystemSettingByKey(key)
      return setting.value as T
    } catch (error) {
      if ((error as { status?: number }).status === 404) {
        return defaultValue
      }
      throw error
    }
  },

  // 更新系统配置值（便捷方法）
  async updateSystemSettingValue(key: string, value: object, description?: string): Promise<SystemSettingResponse> {
    return await this.updateSystemSetting(key, { value, description })
  },

  // 获取所有公开配置的值（便捷方法）
  async getPublicSettingsValue<T = Record<string, unknown>>(): Promise<T> {
    const response = await this.getPublicSystemSettings()
    return response.settings as T
  }
}

// 导出默认实例
export default systemService

// 带错误处理的系统配置服务包装器
export const withSystemErrorHandling = async <T>(
  operation: () => Promise<T>,
  errorCallback?: (error: Error) => void
): Promise<T | null> => {
  try {
    return await operation()
  } catch (error) {
    console.error('系统配置操作失败:', error)
    
    if (errorCallback) {
      errorCallback(error as Error)
    }
    
    // 根据错误类型提供用户友好的错误消息
    const errorObj = error as { status?: number; message?: string }
    if (errorObj.status === 403) {
      throw new Error('您没有权限执行此操作')
    } else if (errorObj.status === 404) {
      throw new Error('请求的配置项不存在')
    } else if (errorObj.status === 422) {
      throw new Error('配置数据格式不正确')
    } else {
      throw new Error(errorObj.message || '操作失败，请稍后重试')
    }
  }
}
