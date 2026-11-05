// Token使用历史记录展示相关类型定义

import type { TokenUsageRecord, PaginatedResponse } from './index'

/**
 * 历史记录表格列定义
 */
export interface UsageHistoryColumn {
  key: keyof TokenUsageRecord | 'actions'
  label: string
  width?: string
  align?: 'left' | 'center' | 'right'
  sortable?: boolean
  render?: (record: TokenUsageRecord) => React.ReactNode
}

/**
 * 历史记录筛选参数
 */
export interface UsageHistoryFilters {
  api_endpoint?: string
  model_name?: string
  date_from?: string
  date_to?: string
  project_id?: string
}

/**
 * 历史记录排序参数
 */
export interface UsageHistorySorting {
  field: keyof TokenUsageRecord
  order: 'asc' | 'desc'
}

/**
 * 分页信息
 */
export interface PaginationInfo {
  current: number
  pageSize: number
  total: number
  totalPages: number
}

/**
 * 使用历史记录响应数据
 */
export type UsageHistoryData = PaginatedResponse<TokenUsageRecord>
