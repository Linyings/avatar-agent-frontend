import React, { useState, useEffect, useCallback } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Collapse,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core'
import {
  ClockIcon,
  ArrowPathIcon,
  FunnelIcon,
  XMarkIcon,
  ChevronDownIcon,
} from '@/shared/icons/tabler'
import { tokenService } from '../services'
import UsageHistoryTable from './UsageHistoryTable'
import Pagination from './Pagination'
import type { TokenUsageRecord, PaginatedResponse } from '../types'

export interface UsageHistorySectionProps {
  className?: string
}

const UsageHistorySection: React.FC<UsageHistorySectionProps> = ({
  className = '',
}) => {
  const [records, setRecords] = useState<TokenUsageRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [isExpanded, setIsExpanded] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    model_name: '',
    project_id: '',
  })

  const loadRecords = useCallback(async (page: number = currentPage, size: number = pageSize) => {
    try {
      setIsLoading(true)
      setError(null)

      const response: PaginatedResponse<TokenUsageRecord> = await tokenService.listUsageRecords({
        page,
        per_page: size,
      })

      setRecords(response.items)
      setTotal(response.total)
      setTotalPages(response.total_pages)
      setCurrentPage(response.page)
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取使用记录失败'
      setError(message)
      console.error('获取使用记录失败:', err)
    } finally {
      setIsLoading(false)
    }
  }, [currentPage, pageSize])

  useEffect(() => {
    if (isExpanded) {
      loadRecords()
    }
  }, [isExpanded, loadRecords])

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    loadRecords(page, pageSize)
  }

  const handlePageSizeChange = (size: number) => {
    setPageSize(size)
    setCurrentPage(1)
    loadRecords(1, size)
  }

  const filteredRecords = React.useMemo(() => {
    let filtered = [...records]

    if (filters.model_name) {
      filtered = filtered.filter((record) =>
        record.model_name.toLowerCase().includes(filters.model_name.toLowerCase())
      )
    }

    if (filters.project_id) {
      filtered = filtered.filter((record) =>
        record.project_id?.toLowerCase().includes(filters.project_id.toLowerCase())
      )
    }

    return filtered
  }, [records, filters])

  const clearFilters = () => {
    setFilters({
      model_name: '',
      project_id: '',
    })
  }

  const hasActiveFilters = Boolean(filters.model_name || filters.project_id)

  return (
    <Paper withBorder radius={8} p="lg" className={className}>
      <Stack gap="md">
        <Group justify="space-between" align="center" wrap="wrap">
          <UnstyledButton onClick={() => setIsExpanded((value) => !value)}>
            <Group gap="md" wrap="nowrap">
              <ThemeIcon size={44} radius="md" variant="light" color="brand">
                <ClockIcon className="h-6 w-6" />
              </ThemeIcon>
              <Stack gap={2}>
                <Title order={3}>使用历史记录</Title>
                <Text size="sm" c="dimmed">查看详细的 Credits 使用记录</Text>
              </Stack>
            </Group>
          </UnstyledButton>

          <Group gap="xs">
            {isExpanded && (
              <>
                <ActionIcon
                  variant={showFilters || hasActiveFilters ? 'filled' : 'default'}
                  color={showFilters || hasActiveFilters ? 'brand' : 'gray'}
                  aria-label="筛选"
                  onClick={() => setShowFilters((value) => !value)}
                >
                  <FunnelIcon className="h-5 w-5" />
                </ActionIcon>
                <ActionIcon
                  variant="default"
                  aria-label="刷新"
                  loading={isLoading}
                  onClick={() => loadRecords(currentPage, pageSize)}
                >
                  <ArrowPathIcon className="h-5 w-5" />
                </ActionIcon>
              </>
            )}
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label={isExpanded ? '收起' : '展开'}
              onClick={() => setIsExpanded((value) => !value)}
            >
              <ChevronDownIcon
                className="h-5 w-5"
                style={{ transform: isExpanded ? 'rotate(180deg)' : undefined }}
              />
            </ActionIcon>
          </Group>
        </Group>

        <Collapse expanded={isExpanded}>
          <Stack gap="md">
            <Collapse expanded={showFilters}>
              <Paper withBorder radius={8} p="md" bg="rgba(255,255,255,0.01)">
                <Group align="end" grow>
                  <TextInput
                    label="模型名称"
                    placeholder="输入模型名称筛选..."
                    value={filters.model_name}
                    onChange={(event) => setFilters((prev) => ({ ...prev, model_name: event.currentTarget.value }))}
                  />
                  <TextInput
                    label="项目 ID"
                    placeholder="输入项目ID筛选..."
                    value={filters.project_id}
                    onChange={(event) => setFilters((prev) => ({ ...prev, project_id: event.currentTarget.value }))}
                  />
                  {hasActiveFilters && (
                    <Button
                      variant="light"
                      color="gray"
                      leftSection={<XMarkIcon className="h-4 w-4" />}
                      onClick={clearFilters}
                    >
                      清除筛选
                    </Button>
                  )}
                </Group>
              </Paper>
            </Collapse>

            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}

            <UsageHistoryTable
              records={filteredRecords}
              isLoading={isLoading}
              emptyText={hasActiveFilters ? '没有匹配的记录' : '暂无使用记录'}
            />

            {!isLoading && filteredRecords.length > 0 && (
              <Pagination
                current={currentPage}
                pageSize={pageSize}
                total={total}
                totalPages={totalPages}
                onChange={handlePageChange}
                onSizeChange={handlePageSizeChange}
                showQuickJumper
                showSizeChanger
              />
            )}
          </Stack>
        </Collapse>
      </Stack>
    </Paper>
  )
}

export default UsageHistorySection
