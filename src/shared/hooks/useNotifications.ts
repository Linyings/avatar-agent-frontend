import { useState, useEffect, useCallback, useRef } from 'react'
import {
  notificationService,
  globalNotificationManager,
  withNotificationErrorHandling,
  type NotificationEventListener
} from '../services/notificationService'
import type {
  NotificationsQueryParams,
  NotificationWithActions
} from '../types/system'
import { NotificationType } from '../types/system'

// Hook 状态接口
interface UseNotificationsState {
  notifications: NotificationWithActions[]
  isLoading: boolean
  isPolling: boolean
  error: string | null
  hasMore: boolean
}

// Hook 配置接口
interface UseNotificationsConfig {
  autoLoad?: boolean // 自动加载通知
  enablePolling?: boolean // 启用轮询
  pollingInterval?: number // 轮询间隔（毫秒）
  pageSize?: number // 每页大小
  markReadOnClick?: boolean // 点击时自动标记已读
  filterParams?: NotificationsQueryParams // 过滤参数
}

// Hook 返回值接口
interface UseNotificationsReturn extends UseNotificationsState {
  // 数据操作
  loadNotifications: (params?: NotificationsQueryParams) => Promise<void>
  loadMore: () => Promise<void>
  refreshNotifications: () => Promise<void>
  
  // 通知操作
  markAsRead: (notificationId: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  deleteNotification: (notificationId: string) => Promise<void>
  
  // 批量操作
  markMultipleAsRead: (notificationIds: string[]) => Promise<void>
  deleteMultiple: (notificationIds: string[]) => Promise<void>
  
  // 轮询控制
  startPolling: () => void
  stopPolling: () => void
  
  // 工具方法
  getUnreadCount: () => number
  getNotificationsByType: (type: NotificationType) => NotificationWithActions[]
  clearError: () => void
}

export const useNotifications = (config: UseNotificationsConfig = {}): UseNotificationsReturn => {
  const {
    autoLoad = true,
    enablePolling = false,
    pollingInterval = 30000,
    pageSize = 20,
    markReadOnClick = true,
    filterParams = {}
  } = config

  // 状态管理
  const [state, setState] = useState<UseNotificationsState>({
    notifications: [],
    isLoading: false,
    isPolling: false,
    error: null,
    hasMore: true
  })

  // 引用
  const currentOffset = useRef(0)
  const mountedRef = useRef(true)
  const listenerRemoveRef = useRef<(() => void) | null>(null)

  // 安全的状态更新
  const safeSetState = useCallback((updater: Partial<UseNotificationsState> | ((prev: UseNotificationsState) => Partial<UseNotificationsState>)) => {
    if (mountedRef.current) {
      setState(prevState => ({
        ...prevState,
        ...(typeof updater === 'function' ? updater(prevState) : updater)
      }))
    }
  }, [])

  // 加载通知统计
  // 加载通知列表
  const loadNotifications = useCallback(async (params: NotificationsQueryParams = {}) => {
    if (!mountedRef.current) return

    safeSetState({ isLoading: true, error: null })

    try {
      const mergedParams = {
        ...filterParams,
        ...params,
        limit: pageSize,
        offset: params.offset ?? 0
      }

      const notifications = await withNotificationErrorHandling(() => 
        notificationService.getUserNotifications(mergedParams)
      )

      if (notifications) {
        const notificationsWithActions: NotificationWithActions[] = notifications.map((notification: NotificationWithActions) => ({
          ...notification,
          isProcessing: false,
          isNew: false
        }))

        // 重置偏移量
        currentOffset.current = mergedParams.offset || 0

        safeSetState({
          notifications: notificationsWithActions,
          hasMore: notifications.length === pageSize,
          isLoading: false
        })
      }
    } catch (error) {
      safeSetState({
        error: (error as Error).message,
        isLoading: false
      })
    }
  }, [safeSetState, filterParams, pageSize])

  // 加载更多通知
  const loadMore = useCallback(async () => {
    if (!mountedRef.current || state.isLoading || !state.hasMore) return

    safeSetState({ isLoading: true })

    try {
      const nextOffset = currentOffset.current + pageSize
      const params = {
        ...filterParams,
        limit: pageSize,
        offset: nextOffset
      }

      const notifications = await withNotificationErrorHandling(() => 
        notificationService.getUserNotifications(params)
      )

      if (notifications) {
        const notificationsWithActions: NotificationWithActions[] = notifications.map((notification: NotificationWithActions) => ({
          ...notification,
          isProcessing: false,
          isNew: false
        }))

        currentOffset.current = nextOffset

        safeSetState((prevState: UseNotificationsState) => ({
          notifications: [...prevState.notifications, ...notificationsWithActions],
          hasMore: notifications.length === pageSize,
          isLoading: false
        }))
      }
    } catch (error) {
      safeSetState({
        error: (error as Error).message,
        isLoading: false
      })
    }
  }, [state.isLoading, state.hasMore, safeSetState, filterParams, pageSize])

  // 刷新通知列表
  const refreshNotifications = useCallback(async () => {
    await loadNotifications({ offset: 0 })
  }, [loadNotifications])

  // 标记通知为已读
  const markAsRead = useCallback(async (notificationId: string) => {
    if (!mountedRef.current) return

    // 乐观更新
    safeSetState((prevState: UseNotificationsState) => ({
      notifications: prevState.notifications.map((notification: NotificationWithActions) =>
        notification.id === notificationId
          ? { ...notification, isProcessing: true }
          : notification
      )
    }))

    try {
      await withNotificationErrorHandling(() => globalNotificationManager.markAsRead(notificationId))

      safeSetState((prevState: UseNotificationsState) => ({
        notifications: prevState.notifications.map((notification: NotificationWithActions) =>
          notification.id === notificationId
            ? { ...notification, is_read: true, read_at: new Date().toISOString(), isProcessing: false }
            : notification
        )
      }))

    } catch (error) {
      // 回滚乐观更新
      safeSetState((prevState: UseNotificationsState) => ({
        notifications: prevState.notifications.map((notification: NotificationWithActions) =>
          notification.id === notificationId
            ? { ...notification, isProcessing: false }
            : notification
        ),
        error: (error as Error).message
      }))
    }
  }, [safeSetState])

  // 标记所有通知为已读
  const markAllAsRead = useCallback(async () => {
    if (!mountedRef.current) return

    try {
      await withNotificationErrorHandling(() => notificationService.markAllNotificationsAsRead())
      
      safeSetState((prevState: UseNotificationsState) => ({
        notifications: prevState.notifications.map((notification: NotificationWithActions) => ({
          ...notification,
          is_read: true,
          read_at: new Date().toISOString()
        }))
      }))

    } catch (error) {
      safeSetState({ error: (error as Error).message })
    }
  }, [safeSetState])

  // 删除通知
  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!mountedRef.current) return

    // 乐观更新
    safeSetState((prevState: UseNotificationsState) => ({
      notifications: prevState.notifications.map((notification: NotificationWithActions) =>
        notification.id === notificationId
          ? { ...notification, isProcessing: true }
          : notification
      )
    }))

    try {
      await withNotificationErrorHandling(() => globalNotificationManager.deleteNotification(notificationId))
      
      safeSetState((prevState: UseNotificationsState) => ({
        notifications: prevState.notifications.filter((notification: NotificationWithActions) => notification.id !== notificationId)
      }))

    } catch (error) {
      // 回滚乐观更新
      safeSetState((prevState: UseNotificationsState) => ({
        notifications: prevState.notifications.map((notification: NotificationWithActions) =>
          notification.id === notificationId
            ? { ...notification, isProcessing: false }
            : notification
        ),
        error: (error as Error).message
      }))
    }
  }, [safeSetState])

  // 批量标记已读
  const markMultipleAsRead = useCallback(async (notificationIds: string[]) => {
    if (!mountedRef.current) return

    try {
      await withNotificationErrorHandling(() => notificationService.markMultipleAsRead(notificationIds))
      
      safeSetState((prevState: UseNotificationsState) => ({
        notifications: prevState.notifications.map((notification: NotificationWithActions) =>
          notificationIds.includes(notification.id)
            ? { ...notification, is_read: true, read_at: new Date().toISOString() }
            : notification
        )
      }))

    } catch (error) {
      safeSetState({ error: (error as Error).message })
    }
  }, [safeSetState])

  // 批量删除通知
  const deleteMultiple = useCallback(async (notificationIds: string[]) => {
    if (!mountedRef.current) return

    try {
      await withNotificationErrorHandling(() => notificationService.deleteMultipleNotifications(notificationIds))
      
      safeSetState((prevState: UseNotificationsState) => ({
        notifications: prevState.notifications.filter((notification: NotificationWithActions) => !notificationIds.includes(notification.id))
      }))

    } catch (error) {
      safeSetState({ error: (error as Error).message })
    }
  }, [safeSetState])

  // 开始轮询
  const startPolling = useCallback(() => {
    if (!state.isPolling) {
      globalNotificationManager.startPolling(pollingInterval)
      safeSetState({ isPolling: true })
    }
  }, [state.isPolling, pollingInterval, safeSetState])

  // 停止轮询
  const stopPolling = useCallback(() => {
    if (state.isPolling) {
      globalNotificationManager.stopPolling()
      safeSetState({ isPolling: false })
    }
  }, [state.isPolling, safeSetState])

  // 获取未读通知数量
  const getUnreadCount = useCallback(() => {
    return state.notifications.filter((notification: NotificationWithActions) => !notification.is_read).length
  }, [state.notifications])

  // 按类型获取通知
  const getNotificationsByType = useCallback((type: NotificationType) => {
    return state.notifications.filter((notification: NotificationWithActions) => notification.type === type)
  }, [state.notifications])

  // 清除错误
  const clearError = useCallback(() => {
    safeSetState({ error: null })
  }, [safeSetState])

  // 设置通知事件监听器
  useEffect(() => {
    const listener: NotificationEventListener = {
      onNotificationReceived: (notification) => {
        if (!mountedRef.current) return
        
        const notificationWithActions: NotificationWithActions = {
          ...notification,
          isProcessing: false,
          isNew: true
        }

        safeSetState((prevState: UseNotificationsState) => ({
          notifications: [
            notificationWithActions,
            ...prevState.notifications.filter((item: NotificationWithActions) => item.id !== notification.id)
          ]
        }))

      },

      onNotificationRead: (notificationId) => {
        if (!mountedRef.current) return
        
        safeSetState((prevState: UseNotificationsState) => ({
          notifications: prevState.notifications.map((notification: NotificationWithActions) =>
            notification.id === notificationId
              ? { ...notification, is_read: true, read_at: new Date().toISOString() }
              : notification
          )
        }))
      },

      onNotificationDeleted: (notificationId) => {
        if (!mountedRef.current) return
        
        safeSetState((prevState: UseNotificationsState) => ({
          notifications: prevState.notifications.filter((notification: NotificationWithActions) => notification.id !== notificationId)
        }))
      }
    }

    listenerRemoveRef.current = globalNotificationManager.addListener(listener)

    return () => {
      if (listenerRemoveRef.current) {
        listenerRemoveRef.current()
      }
    }
  }, [safeSetState])

  // 初始化和清理
  useEffect(() => {
    if (autoLoad) {
      loadNotifications()
    }

    if (enablePolling) {
      startPolling()
    }

    return () => {
      mountedRef.current = false
      stopPolling()
    }
  }, [autoLoad, enablePolling])

  return {
    // 状态
    ...state,
    
    // 数据操作
    loadNotifications,
    loadMore,
    refreshNotifications,
    
    // 通知操作
    markAsRead: markReadOnClick ? markAsRead : markAsRead,
    markAllAsRead,
    deleteNotification,
    
    // 批量操作
    markMultipleAsRead,
    deleteMultiple,
    
    // 轮询控制
    startPolling,
    stopPolling,
    
    // 工具方法
    getUnreadCount,
    getNotificationsByType,
    clearError
  }
}
