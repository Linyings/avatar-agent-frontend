// Credits使用统计Hook

import { useState, useEffect, useCallback } from 'react'
import { tokenService } from '../services'
import type {
  TokenUsageStatsResponse,
  TokenUsageRecord,
  PaginatedResponse
} from '../types'

interface UseTokenUsageReturn {
  stats: TokenUsageStatsResponse | null
  records: TokenUsageRecord[]
  isLoading: boolean
  error: string | null
  refreshStats: () => Promise<void>
  loadRecords: (page?: number, perPage?: number) => Promise<void>
  checkAvailability: (requiredTokens: number) => Promise<boolean>
}

/**
 * Credits使用统计Hook
 */
export const useTokenUsage = (): UseTokenUsageReturn => {
  const [stats, setStats] = useState<TokenUsageStatsResponse | null>(null)
  const [records, setRecords] = useState<TokenUsageRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 获取使用统计
  const fetchStats = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await tokenService.getUsageStats()
      setStats(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取Credits统计失败'
      setError(message)
      console.error('获取Credits统计失败:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 刷新统计
  const refreshStats = useCallback(async () => {
    await fetchStats()
  }, [fetchStats])

  // 加载使用记录
  const loadRecords = useCallback(async (page: number = 1, perPage: number = 20) => {
    try {
      setError(null)
      const data: PaginatedResponse<TokenUsageRecord> = await tokenService.listUsageRecords({
        page,
        per_page: perPage,
      })
      setRecords(data.items)
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取使用记录失败'
      setError(message)
      console.error('获取使用记录失败:', err)
    }
  }, [])

  // 检查Credits可用性
  const checkAvailability = useCallback(async (requiredTokens: number): Promise<boolean> => {
    try {
      const result = await tokenService.checkAvailability(requiredTokens)
      return result.available
    } catch (err) {
      console.error('检查Credits可用性失败:', err)
      return false
    }
  }, [])

  // 初始加载
  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  return {
    stats,
    records,
    isLoading,
    error,
    refreshStats,
    loadRecords,
    checkAvailability,
  }
}

export default useTokenUsage
