import React from 'react'
import {
  Badge,
  Center,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  ThemeIcon,
} from '@mantine/core'
import {
  ClockIcon,
  CpuChipIcon,
  DocumentTextIcon,
} from '@/shared/icons/tabler'
import type { TokenUsageRecord } from '../types'

export interface UsageHistoryTableProps {
  records: TokenUsageRecord[]
  isLoading?: boolean
  emptyText?: string
}

const UsageHistoryTable: React.FC<UsageHistoryTableProps> = ({
  records,
  isLoading = false,
  emptyText = '暂无使用记录',
}) => {
  const formatDateTime = (dateStr: string): { date: string; time: string } => {
    try {
      const date = new Date(dateStr)

      if (isNaN(date.getTime())) {
        return { date: '无效日期', time: '' }
      }

      const dateString = date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).replace(/\//g, '-')

      const timeString = date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })

      return { date: dateString, time: timeString }
    } catch (error) {
      console.error('日期格式化错误:', error, '原始值:', dateStr)
      return { date: '格式错误', time: '' }
    }
  }

  const formatCreditCount = (count: number): string => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(2)}M`
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(2)}K`
    }
    return count.toLocaleString()
  }

  if (isLoading) {
    return (
      <Center py="xl">
        <Stack align="center" gap="sm">
          <Loader color="brand" />
          <Text size="sm" c="dimmed">加载中...</Text>
        </Stack>
      </Center>
    )
  }

  if (records.length === 0) {
    return (
      <Paper withBorder radius={8} p="xl" bg="rgba(255,255,255,0.01)">
        <Stack align="center" gap="sm">
          <ThemeIcon size={56} radius="md" variant="light" color="gray">
            <DocumentTextIcon className="h-7 w-7" />
          </ThemeIcon>
          <Text size="sm" c="dimmed">{emptyText}</Text>
        </Stack>
      </Paper>
    )
  }

  return (
    <ScrollArea>
      <Table striped highlightOnHover verticalSpacing="md" horizontalSpacing="md">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>时间</Table.Th>
            <Table.Th>模型</Table.Th>
            <Table.Th style={{ textAlign: 'right' }}>Credits消耗</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {records.map((record) => {
            const { date, time } = formatDateTime(record.recorded_at || record.created_at || '')

            return (
              <Table.Tr key={record.id}>
                <Table.Td>
                  <Group gap="sm" wrap="nowrap">
                    <ThemeIcon variant="light" color="gray" radius="md">
                      <ClockIcon className="h-4 w-4" />
                    </ThemeIcon>
                    <Stack gap={0}>
                      <Text size="sm" fw={600}>{date}</Text>
                      <Text size="xs" c="dimmed" ff="monospace">{time}</Text>
                    </Stack>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Group gap="sm" wrap="nowrap">
                    <ThemeIcon variant="light" color="brand" radius="md">
                      <CpuChipIcon className="h-4 w-4" />
                    </ThemeIcon>
                    <Text size="sm" ff="monospace">{record.model_name}</Text>
                  </Group>
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  <Badge color="brand" variant="light" size="lg">
                    {formatCreditCount(record.credit_count ?? record.token_count)}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            )
          })}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  )
}

export default UsageHistoryTable
