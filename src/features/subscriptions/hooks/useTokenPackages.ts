// Credits套餐管理Hook

import { useState, useEffect, useCallback } from 'react'
import { tokenPackageService } from '../services/tokenPackageService'
import type { TokenPackage } from '../types'

interface UseTokenPackagesReturn {
  packages: TokenPackage[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Credits套餐管理Hook
 * 用于获取和管理Credits充值套餐列表
 */
export const useTokenPackages = (): UseTokenPackagesReturn => {
  const [packages, setPackages] = useState<TokenPackage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 获取Credits套餐列表
  const fetchPackages = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await tokenPackageService.listPackages()

      // 验证返回数据
      if (!data) {
        console.error('Credits套餐列表返回数据为空')
        setPackages([])
        return
      }

      // 检查 packages 字段是否存在且为数组
      const packagesList = Array.isArray(data.packages) ? data.packages : []

      if (packagesList.length === 0) {
        console.warn('Credits套餐列表为空')
      }

      // 只显示激活的套餐，按排序顺序显示
      const activePackages = packagesList
        .filter(pkg => pkg.is_active)
        .sort((a, b) => a.sort_order - b.sort_order)

      setPackages(activePackages)
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取Credits套餐列表失败'
      setError(message)
      console.error('获取Credits套餐列表失败:', err)
      setPackages([]) // 设置为空数组，避免后续错误
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 刷新套餐列表（供外部调用）
  const refetch = useCallback(async () => {
    await fetchPackages()
  }, [fetchPackages])

  // 初始加载
  useEffect(() => {
    fetchPackages()
  }, [fetchPackages])

  return {
    packages,
    isLoading,
    error,
    refetch,
  }
}

export default useTokenPackages
