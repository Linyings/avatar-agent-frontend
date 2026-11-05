// 订阅管理Hook

import { useState, useEffect, useCallback } from 'react'
import { subscriptionService } from '../services'
import type {
  UserSubscriptionResponse,
  SubscriptionUpgradeRequest,
  SubscriptionCancelRequest,
  SubscriptionOperationResponse
} from '../types'

interface UseSubscriptionReturn {
  subscription: UserSubscriptionResponse | null
  isLoading: boolean
  error: string | null
  refreshSubscription: () => Promise<void>
  upgradeSubscription: (data: SubscriptionUpgradeRequest) => Promise<SubscriptionOperationResponse>
  cancelSubscription: (data?: SubscriptionCancelRequest) => Promise<SubscriptionOperationResponse>
}

/**
 * 用户订阅管理Hook
 */
export const useSubscription = (): UseSubscriptionReturn => {
  const [subscription, setSubscription] = useState<UserSubscriptionResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 获取当前订阅信息
  const fetchSubscription = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await subscriptionService.getCurrentSubscription()
      setSubscription(data.subscription)
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取订阅信息失败'
      setError(message)
      console.error('获取订阅信息失败:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 刷新订阅信息
  const refreshSubscription = useCallback(async () => {
    await fetchSubscription()
  }, [fetchSubscription])

  // 升级订阅
  const upgradeSubscription = useCallback(
    async (data: SubscriptionUpgradeRequest): Promise<SubscriptionOperationResponse> => {
      try {
        const result = await subscriptionService.upgradeSubscription(data)
        // 升级成功后刷新订阅信息
        await fetchSubscription()
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : '升级订阅失败'
        throw new Error(message)
      }
    },
    [fetchSubscription]
  )

  // 取消订阅
  const cancelSubscription = useCallback(
    async (data?: SubscriptionCancelRequest): Promise<SubscriptionOperationResponse> => {
      try {
        const result = await subscriptionService.cancelSubscription(data)
        // 取消成功后刷新订阅信息
        await fetchSubscription()
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : '取消订阅失败'
        throw new Error(message)
      }
    },
    [fetchSubscription]
  )

  // 初始加载
  useEffect(() => {
    fetchSubscription()
  }, [fetchSubscription])

  return {
    subscription,
    isLoading,
    error,
    refreshSubscription,
    upgradeSubscription,
    cancelSubscription,
  }
}

export default useSubscription
