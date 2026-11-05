// Credits余额管理Hook

import { useState, useEffect, useCallback } from 'react'
import { tokenAccountService } from '../services/tokenAccountService'
import type { TokenBalance } from '../types'

interface UseTokenBalanceReturn {
  balance: TokenBalance | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Credits余额管理Hook
 * 用于获取和管理用户的Credits余额信息
 */
export const useTokenBalance = (): UseTokenBalanceReturn => {
  const [balance, setBalance] = useState<TokenBalance | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 获取Credits余额
  const fetchBalance = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await tokenAccountService.getBalance()
      setBalance(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取Credits余额失败'
      setError(message)
      console.error('获取Credits余额失败:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 刷新余额（供外部调用）
  const refetch = useCallback(async () => {
    await fetchBalance()
  }, [fetchBalance])

  // 初始加载
  useEffect(() => {
    fetchBalance()
  }, [fetchBalance])

  return {
    balance,
    isLoading,
    error,
    refetch,
  }
}

export default useTokenBalance
