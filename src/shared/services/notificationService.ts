import { authenticatedFetch } from '@/features/auth/services/authService'
import type {
  NotificationCreateRequest,
  NotificationBatchCreateRequest,
  NotificationResponse,
  NotificationStatsResponse,
  NotificationsQueryParams,
  MessageResponse
} from '../types/system'
import { NotificationType } from '../types/system'

function normalizeNotificationStatsResponse(response: unknown): NotificationStatsResponse {
  if (response && typeof response === 'object') {
    const record = response as Partial<NotificationStatsResponse> & {
      total?: number
      unread?: number
      read?: number
    }

    return {
      total_count: record.total_count ?? record.total ?? 0,
      unread_count: record.unread_count ?? record.unread ?? 0,
      read_count: record.read_count ?? record.read ?? 0,
      by_type: record.by_type ?? {},
      total: record.total,
      unread: record.unread,
      read: record.read,
    }
  }

  return {
    total_count: 0,
    unread_count: 0,
    read_count: 0,
    by_type: {},
  }
}

// 获取API基础URL
const getApiBaseUrl = (): string => {
  return import.meta.env.VITE_API_BASE_URL || ''
}

// HTTP 请求工具类 - 专用于通知API
class NotificationHttpClient {
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

  async get<T>(endpoint: string, params?: Record<string, string | number | boolean>): Promise<T> {
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
const notificationHttpClient = new NotificationHttpClient()

// 通知系统服务
export const notificationService = {
  // 创建通知（仅管理员）
  async createNotification(data: NotificationCreateRequest): Promise<NotificationResponse> {
    return await notificationHttpClient.post<NotificationResponse>('/api/v1/system/notifications', data)
  },

  // 批量创建通知（仅管理员）
  async batchCreateNotifications(data: NotificationBatchCreateRequest): Promise<NotificationResponse[]> {
    return await notificationHttpClient.post<NotificationResponse[]>('/api/v1/system/notifications/batch', data)
  },

  // 获取当前用户通知列表
  async getUserNotifications(params?: NotificationsQueryParams): Promise<NotificationResponse[]> {
    // 过滤掉 undefined 值以匹配 get 方法的类型要求
    const filteredParams = params ? Object.fromEntries(
      Object.entries(params).filter(([_, value]) => value !== undefined)
    ) as Record<string, string | number | boolean> : undefined

    return await notificationHttpClient.get<NotificationResponse[]>('/api/v1/system/notifications', filteredParams)
  },

  // 标记通知为已读
  async markNotificationAsRead(notificationId: string): Promise<NotificationResponse> {
    return await notificationHttpClient.put<NotificationResponse>(`/api/v1/system/notifications/${notificationId}/read`)
  },

  // 标记所有通知为已读
  async markAllNotificationsAsRead(): Promise<MessageResponse> {
    return await notificationHttpClient.put<MessageResponse>('/api/v1/system/notifications/read-all')
  },

  // 获取通知统计信息
  async getNotificationStats(): Promise<NotificationStatsResponse> {
    const response = await notificationHttpClient.get<unknown>('/api/v1/system/notifications/stats')
    return normalizeNotificationStatsResponse(response)
  },

  // 删除通知
  async deleteNotification(notificationId: string): Promise<MessageResponse> {
    return await notificationHttpClient.delete<MessageResponse>(`/api/v1/system/notifications/${notificationId}`)
  },

  // 获取未读通知（便捷方法）
  async getUnreadNotifications(limit = 10): Promise<NotificationResponse[]> {
    return await this.getUserNotifications({
      is_read: false,
      limit,
      offset: 0
    })
  },

  // 获取特定类型的通知（便捷方法）
  async getNotificationsByType(type: NotificationType, limit = 20): Promise<NotificationResponse[]> {
    return await this.getUserNotifications({
      type,
      limit,
      offset: 0
    })
  },

  // 批量标记多个通知为已读（便捷方法）
  async markMultipleAsRead(notificationIds: string[]): Promise<NotificationResponse[]> {
    const promises = notificationIds.map(id => this.markNotificationAsRead(id))
    return await Promise.all(promises)
  },

  // 批量删除通知（便捷方法）
  async deleteMultipleNotifications(notificationIds: string[]): Promise<MessageResponse[]> {
    const promises = notificationIds.map(id => this.deleteNotification(id))
    return await Promise.all(promises)
  },

  // 创建系统通知（便捷方法）
  async createSystemNotification(
    userId: string, 
    title: string, 
    message: string, 
    data?: object
  ): Promise<NotificationResponse> {
    return await this.createNotification({
      type: NotificationType.SYSTEM,
      title,
      message,
      user_id: userId,
      data
    })
  },

  // 创建项目相关通知（便捷方法）
  async createProjectNotification(
    userId: string,
    title: string,
    message: string,
    projectId: string,
    additionalData?: object
  ): Promise<NotificationResponse> {
    return await this.createNotification({
      type: NotificationType.PROJECT,
      title,
      message,
      user_id: userId,
      data: {
        project_id: projectId,
        ...additionalData
      }
    })
  },

  // 广播通知给多个用户（便捷方法）
  async broadcastNotification(
    userIds: string[],
    type: NotificationType,
    title: string,
    message: string,
    data?: object,
    expiresAt?: string
  ): Promise<NotificationResponse[]> {
    return await this.batchCreateNotifications({
      user_ids: userIds,
      type,
      title,
      message,
      data,
      expires_at: expiresAt || undefined
    })
  }
}

// 通知事件监听器类型
export interface NotificationEventListener {
  onNotificationReceived?: (notification: NotificationResponse) => void
  onNotificationRead?: (notificationId: string) => void
  onNotificationDeleted?: (notificationId: string) => void
}

// 通知管理器类 - 用于处理实时通知和本地状态
export class NotificationManager {
  private listeners: NotificationEventListener[] = []
  private pollingInterval: number | null = null
  private lastCheckTime: string | null = null

  constructor() {
    this.lastCheckTime = new Date().toISOString()
  }

  // 添加事件监听器
  addListener(listener: NotificationEventListener): () => void {
    this.listeners.push(listener)
    
    // 返回移除监听器的函数
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  // 触发通知接收事件
  private triggerNotificationReceived(notification: NotificationResponse): void {
    this.listeners.forEach(listener => {
      listener.onNotificationReceived?.(notification)
    })
  }

  // 触发通知已读事件
  private triggerNotificationRead(notificationId: string): void {
    this.listeners.forEach(listener => {
      listener.onNotificationRead?.(notificationId)
    })
  }

  // 触发通知删除事件
  private triggerNotificationDeleted(notificationId: string): void {
    this.listeners.forEach(listener => {
      listener.onNotificationDeleted?.(notificationId)
    })
  }

  // 开始轮询新通知
  startPolling(interval = 30000): void { // 默认30秒
    if (this.pollingInterval) {
      this.stopPolling()
    }

    this.pollingInterval = window.setInterval(async () => {
      try {
        // 获取最近的未读通知
        const notifications = await notificationService.getUnreadNotifications()
        
        // 过滤出新通知（在上次检查时间之后创建的）
        const newNotifications = notifications.filter(notification => 
          this.lastCheckTime && notification.created_at > this.lastCheckTime
        )

        // 触发新通知事件
        newNotifications.forEach(notification => {
          this.triggerNotificationReceived(notification)
        })

        // 更新最后检查时间
        this.lastCheckTime = new Date().toISOString()
      } catch (error) {
        console.error('轮询通知失败:', error)
      }
    }, interval)
  }

  // 停止轮询
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
  }

  // 标记通知为已读并触发事件
  async markAsRead(notificationId: string): Promise<void> {
    try {
      await notificationService.markNotificationAsRead(notificationId)
      this.triggerNotificationRead(notificationId)
    } catch (error) {
      console.error('标记通知已读失败:', error)
      throw error
    }
  }

  // 删除通知并触发事件
  async deleteNotification(notificationId: string): Promise<void> {
    try {
      await notificationService.deleteNotification(notificationId)
      this.triggerNotificationDeleted(notificationId)
    } catch (error) {
      console.error('删除通知失败:', error)
      throw error
    }
  }

  // 清理资源
  cleanup(): void {
    this.stopPolling()
    this.listeners = []
  }
}

// 导出全局通知管理器实例
export const globalNotificationManager = new NotificationManager()

// 导出默认服务
export default notificationService

// 错误处理包装器
export const withNotificationErrorHandling = async <T>(
  operation: () => Promise<T>,
  errorCallback?: (error: Error) => void
): Promise<T | null> => {
  try {
    return await operation()
  } catch (error) {
    console.error('通知操作失败:', error)
    
    if (errorCallback) {
      errorCallback(error as Error)
    }
    
    // 根据错误类型提供用户友好的错误消息
    const errorObj = error as { status?: number; message?: string }
    if (errorObj.status === 403) {
      throw new Error('您没有权限执行此操作')
    } else if (errorObj.status === 404) {
      throw new Error('通知不存在或已被删除')
    } else if (errorObj.status === 422) {
      throw new Error('通知数据格式不正确')
    } else {
      throw new Error(errorObj.message || '操作失败，请稍后重试')
    }
  }
}
