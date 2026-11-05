import React, { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Group,
  NativeSelect,
  Paper,
  Progress,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { ChartBarIcon, ArrowPathIcon, CalendarIcon, UsersIcon, CpuChipIcon, CreditCardIcon, TrophyIcon, ChartPieIcon, CodeBracketIcon } from '@/shared/icons/tabler'
import AppPageShell from '@/shared/components/ui/AppPageShell'
import PageHeader from '@/shared/components/ui/PageHeader'
import SurfaceCard from '@/shared/components/ui/SurfaceCard'
import StatusChip from '@/shared/components/ui/StatusChip'
import statisticsService from '@/shared/services/statisticsService'
import type {
  ApiUsageStatsResponse,
  ModelUsageStatsResponse,
  SystemOverviewResponse,
  TokenTrendsResponse,
  UserRankingResponse,
} from '@/shared/services/statisticsService'

const TIME_RANGE_OPTIONS = [
  { label: '最近7天', value: '7' },
  { label: '最近30天', value: '30' },
  { label: '最近90天', value: '90' },
  { label: '自定义', value: 'custom' },
]

const colorMap = {
  blue: '#60a5fa',
  purple: '#a78bfa',
  green: '#6b9aff',
  yellow: '#fbbf24',
  orange: '#fb923c',
} as const

type AccentColor = keyof typeof colorMap

interface StatsCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ComponentType<{ style?: React.CSSProperties }>
  color: AccentColor
}

function StatsCard({ title, value, subtitle, icon: Icon, color }: StatsCardProps) {
  const accent = colorMap[color]

  return (
    <SurfaceCard
      tone="subtle"
      p="xl"
      style={{
        borderColor: `${accent}33`,
        background: `${accent}12`,
      }}
    >
      <Group justify="space-between" align="flex-start" gap="md">
        <div>
          <Text size="sm" c="dimmed">{title}</Text>
          <Title order={2} mt={4} style={{ color: accent }}>{value}</Title>
          {subtitle ? <Text size="xs" c="gray.5" mt={4}>{subtitle}</Text> : null}
        </div>
        <Box
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `${accent}1f`,
            color: accent,
          }}
        >
          <Icon style={{ width: 28, height: 28 }} />
        </Box>
      </Group>
    </SurfaceCard>
  )
}

function PercentageBar({ percentage, color }: { percentage: number; color: string }) {
  return (
    <Progress
      value={Math.min(percentage, 100)}
      color={color}
      radius="xl"
      size="sm"
      styles={{ root: { background: 'rgba(255, 255, 255, 0.08)' } }}
    />
  )
}

const formatMoney = (value?: number | string) => {
  const numericValue = typeof value === 'string' ? Number(value) : value
  return `¥${Number(numericValue ?? 0).toFixed(2)}`
}

const formatPercent = (value?: number) => `${Number(value ?? 0).toFixed(1)}%`

const creditsOf = (item: { credit_count?: number; token_count: number }) => item.credit_count ?? item.token_count

const formatBytes = (value?: number) => {
  const bytes = Number(value ?? 0)
  if (bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes.toLocaleString()} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export const AnalyticsPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<number | 'custom'>(30)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const [overview, setOverview] = useState<SystemOverviewResponse | null>(null)
  const [userRanking, setUserRanking] = useState<UserRankingResponse | null>(null)
  const [tokenTrends, setTokenTrends] = useState<TokenTrendsResponse | null>(null)
  const [modelUsage, setModelUsage] = useState<ModelUsageStatsResponse | null>(null)
  const [apiUsage, setApiUsage] = useState<ApiUsageStatsResponse | null>(null)

  const loadAllStatistics = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const params = timeRange === 'custom'
        ? { start_date: startDate, end_date: endDate }
        : { days: timeRange }

      const [overviewData, rankingData, trendsData, modelData, apiData] = await Promise.all([
        statisticsService.getSystemOverview(params),
        statisticsService.getUserRanking({ ...params, limit: 10 }),
        statisticsService.getTokenTrends({
          ...params,
          group_by: timeRange === 7 ? 'day' : timeRange === 30 ? 'day' : 'week',
        }),
        statisticsService.getModelUsage(params),
        statisticsService.getApiUsage(params),
      ])

      setOverview(overviewData)
      setUserRanking(rankingData)
      setTokenTrends(trendsData)
      setModelUsage(modelData)
      setApiUsage(apiData)
    } catch (err) {
      console.error('加载统计数据失败:', err)
      setError(err instanceof Error ? err.message : '加载统计数据失败')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadAllStatistics()
  }, [])

  const handleTimeRangeChange = (value: string | null) => {
    const nextValue = value === 'custom' ? 'custom' : Number(value ?? 30)
    setTimeRange(nextValue)
    if (nextValue !== 'custom') {
      void loadAllStatistics()
    }
  }

  const applyCustomDateRange = () => {
    if (startDate && endDate) {
      void loadAllStatistics()
    }
  }

  return (
    <AppPageShell size="xl">
      <PageHeader
        title="统计分析"
        subtitle="系统使用统计和数据分析"
        actions={
          <Group gap="sm" justify="flex-end">
            <Group gap="xs" wrap="nowrap">
              <CalendarIcon style={{ width: 18, height: 18, color: '#94a3b8' }} />
              <NativeSelect
                value={String(timeRange)}
                onChange={(event) => handleTimeRangeChange(event.currentTarget.value)}
                data={TIME_RANGE_OPTIONS}
                styles={{
                  input: {
                    minWidth: 132,
                    background: 'rgba(20, 25, 34, 0.88)',
                    borderColor: 'rgba(255, 255, 255, 0.08)',
                    color: '#fff',
                  },
                }}
              />
            </Group>

            {timeRange === 'custom' ? (
              <Group gap="xs" wrap="nowrap">
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  style={{
                    background: 'rgba(20, 25, 34, 0.88)',
                    color: '#fff',
                    borderRadius: 8,
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    padding: '8px 12px',
                  }}
                />
                <Text c="dimmed" size="sm">至</Text>
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  style={{
                    background: 'rgba(20, 25, 34, 0.88)',
                    color: '#fff',
                    borderRadius: 8,
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    padding: '8px 12px',
                  }}
                />
                <Button onClick={applyCustomDateRange} disabled={!startDate || !endDate}>
                  应用
                </Button>
              </Group>
            ) : null}

            <Button
              variant="default"
              onClick={() => loadAllStatistics()}
              disabled={isLoading}
              leftSection={<ArrowPathIcon style={{ width: 16, height: 16 }} />}
            >
              {isLoading ? '加载中...' : '刷新'}
            </Button>
          </Group>
        }
      />

      {error ? (
        <Alert color="red" title="加载失败" variant="light" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      {overview ? (
        <Stack gap="lg">
          <div>
            <Title order={3} mb="md">系统总览</Title>
            <SimpleGrid cols={{ base: 1, md: 2, lg: 4 }} spacing="md">
              <StatsCard title="总用户数" value={overview.total_users} subtitle={`活跃: ${overview.active_users}`} icon={UsersIcon} color="blue" />
              <StatsCard title="管理员数" value={overview.admin_users} subtitle={`已验证: ${overview.verified_users}`} icon={UsersIcon} color="purple" />
              <StatsCard title="累计 Credits 消耗" value={(overview.total_credits_consumed ?? overview.total_tokens_consumed).toLocaleString()} icon={CpuChipIcon} color="green" />
              <StatsCard title="累计充值" value={formatMoney(overview.total_recharged)} icon={CreditCardIcon} color="yellow" />
            </SimpleGrid>
          </div>

          <Paper p="lg" radius="lg" withBorder>
            <Title order={4} mb="md">时间段统计（{overview.period_summary.start_date} - {overview.period_summary.end_date}）</Title>
            <SimpleGrid cols={{ base: 1, md: 2, lg: 5 }} spacing="md">
              <div>
                <Text size="sm" c="dimmed">Credits 消耗</Text>
                <Text size="xl" fw={700} c="brand.4">{(overview.period_summary.total_credits_consumed ?? overview.period_summary.total_tokens_consumed).toLocaleString()}</Text>
              </div>
              <div>
                <Text size="sm" c="dimmed">总请求数</Text>
                <Text size="xl" fw={700} c="blue.4">{overview.period_summary.total_requests.toLocaleString()}</Text>
              </div>
              <div>
                <Text size="sm" c="dimmed">活跃用户</Text>
                <Text size="xl" fw={700} c="violet.4">{overview.period_summary.active_users}</Text>
              </div>
              <div>
                <Text size="sm" c="dimmed">新增用户</Text>
                <Text size="xl" fw={700} c="green.4">{overview.period_summary.new_users}</Text>
              </div>
              <div>
                <Text size="sm" c="dimmed">充值金额</Text>
                <Text size="xl" fw={700} c="yellow.4">{formatMoney(overview.period_summary.total_recharged)}</Text>
              </div>
            </SimpleGrid>
          </Paper>

          <Paper p="lg" radius="lg" withBorder>
            <Group justify="space-between" mb="md">
              <Title order={4}>成本与利润（人民币）</Title>
              {(overview.missing_pricing_count ?? 0) > 0 ? (
                <StatusChip tone="warning">缺失价格规则 {overview.missing_pricing_count}</StatusChip>
              ) : null}
            </Group>
            <SimpleGrid cols={{ base: 1, md: 2, lg: 4 }} spacing="md">
              <SurfaceCard tone="subtle">
                <Text size="sm" c="dimmed">确认收入</Text>
                <Text size="xl" fw={700} c="green.4">{formatMoney(overview.confirmed_revenue)}</Text>
              </SurfaceCard>
              <SurfaceCard tone="subtle">
                <Text size="sm" c="dimmed">第三方成本（人民币）</Text>
                <Text size="xl" fw={700} c="orange.4">{formatMoney(overview.third_party_cost)}</Text>
              </SurfaceCard>
              <SurfaceCard tone="subtle">
                <Text size="sm" c="dimmed">毛利</Text>
                <Text size="xl" fw={700} c={(overview.gross_profit ?? 0) >= 0 ? 'brand.4' : 'red.4'}>{formatMoney(overview.gross_profit)}</Text>
              </SurfaceCard>
              <SurfaceCard tone="subtle">
                <Text size="sm" c="dimmed">毛利率</Text>
                <Text size="xl" fw={700} c={(overview.gross_margin ?? 0) >= 0 ? 'violet.4' : 'red.4'}>{formatPercent(overview.gross_margin)}</Text>
              </SurfaceCard>
            </SimpleGrid>
          </Paper>
        </Stack>
      ) : null}

      {userRanking ? (
        <Paper p="lg" radius="lg" withBorder>
          <Group gap="sm" mb="md">
            <TrophyIcon style={{ width: 24, height: 24, color: colorMap.yellow }} />
            <Title order={3}>用户 Credits 消耗排名</Title>
            <Text size="sm" c="dimmed">（总消耗: {userRanking.total_consumption.toLocaleString()} Credits）</Text>
          </Group>

          <ScrollArea>
            <Table horizontalSpacing="md" verticalSpacing="sm" style={{ minWidth: 760 }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>排名</Table.Th>
                  <Table.Th>用户</Table.Th>
                  <Table.Th>邮箱</Table.Th>
                  <Table.Th>Credits 消耗</Table.Th>
                  <Table.Th>请求次数</Table.Th>
                  <Table.Th>占比</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {userRanking.ranking.map((user) => (
                  <Table.Tr key={user.user_id}>
                    <Table.Td>
                      <StatusChip
                        tone={
                          user.rank === 1 ? 'warning' : user.rank === 2 ? 'neutral' : user.rank === 3 ? 'danger' : 'brand'
                        }
                      >
                        {user.rank}
                      </StatusChip>
                    </Table.Td>
                    <Table.Td>{user.username}</Table.Td>
                    <Table.Td><Text c="dimmed">{user.email}</Text></Table.Td>
                    <Table.Td><Text c="brand.4" fw={600}>{(user.credits_used ?? user.credit_count ?? user.tokens_used).toLocaleString()}</Text></Table.Td>
                    <Table.Td><Text c="blue.4">{user.request_count.toLocaleString()}</Text></Table.Td>
                    <Table.Td>
                      <Group gap="sm" wrap="nowrap">
                        <Box style={{ flex: 1 }}>
                          <PercentageBar percentage={user.percentage} color="brand" />
                        </Box>
                        <Text size="sm" c="dimmed" style={{ minWidth: 52, textAlign: 'right' }}>
                          {user.percentage.toFixed(1)}%
                        </Text>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>
      ) : null}

      {tokenTrends ? (
        <Paper p="lg" radius="lg" withBorder>
          <Group gap="sm" mb="md">
            <ChartBarIcon style={{ width: 24, height: 24, color: colorMap.green }} />
            <Title order={3}>Credits 消耗趋势</Title>
            <Text size="sm" c="dimmed">（分组方式: {tokenTrends.group_by}）</Text>
          </Group>

          <SimpleGrid cols={{ base: 1, md: 2, lg: 5 }} spacing="md" mb="md">
            <SurfaceCard tone="subtle">
              <Text size="sm" c="dimmed">总 Credits 消耗</Text>
              <Text size="xl" fw={700} c="brand.4">{(tokenTrends.total_credits ?? tokenTrends.total_tokens).toLocaleString()}</Text>
            </SurfaceCard>
            <SurfaceCard tone="subtle">
              <Text size="sm" c="dimmed">总请求数</Text>
              <Text size="xl" fw={700} c="blue.4">{tokenTrends.total_requests.toLocaleString()}</Text>
            </SurfaceCard>
            <SurfaceCard tone="subtle">
              <Text size="sm" c="dimmed">平均每日消耗</Text>
              <Text size="xl" fw={700} c="violet.4">
                {Math.round((tokenTrends.total_credits ?? tokenTrends.total_tokens) / Math.max(tokenTrends.trend_data.length, 1)).toLocaleString()}
              </Text>
            </SurfaceCard>
            <SurfaceCard tone="subtle">
              <Text size="sm" c="dimmed">总成本</Text>
              <Text size="xl" fw={700} c="orange.4">{formatMoney(tokenTrends.cost_amount)}</Text>
            </SurfaceCard>
            <SurfaceCard tone="subtle">
              <Text size="sm" c="dimmed">总利润</Text>
              <Text size="xl" fw={700} c={(tokenTrends.profit_amount ?? 0) >= 0 ? 'green.4' : 'red.4'}>{formatMoney(tokenTrends.profit_amount)}</Text>
            </SurfaceCard>
          </SimpleGrid>

          <ScrollArea>
            <Table horizontalSpacing="md" verticalSpacing="sm" style={{ minWidth: 760 }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>时间</Table.Th>
                  <Table.Th>Credits 消耗</Table.Th>
                  <Table.Th>请求次数</Table.Th>
                  <Table.Th>独立用户</Table.Th>
                  <Table.Th>成本</Table.Th>
                  <Table.Th>利润</Table.Th>
                  <Table.Th>消耗占比</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {tokenTrends.trend_data.map((point, index) => (
                  <Table.Tr key={index}>
                    <Table.Td>{point.date}</Table.Td>
                    <Table.Td><Text c="brand.4" fw={600}>{creditsOf(point).toLocaleString()}</Text></Table.Td>
                    <Table.Td><Text c="blue.4">{point.request_count.toLocaleString()}</Text></Table.Td>
                    <Table.Td><Text c="violet.4">{point.unique_users}</Text></Table.Td>
                    <Table.Td><Text c="orange.4">{formatMoney(point.cost_amount)}</Text></Table.Td>
                    <Table.Td><Text c={(point.profit_amount ?? 0) >= 0 ? 'green.4' : 'red.4'}>{formatMoney(point.profit_amount)}</Text></Table.Td>
                    <Table.Td>
                      <PercentageBar
                        percentage={((point.credit_count ?? point.token_count) / Math.max(tokenTrends.total_credits ?? tokenTrends.total_tokens, 1)) * 100}
                        color="brand"
                      />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>
      ) : null}

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        {modelUsage ? (
          <Paper p="lg" radius="lg" withBorder>
            <Group gap="sm" mb="md">
              <ChartPieIcon style={{ width: 24, height: 24, color: colorMap.purple }} />
              <Title order={3}>模型成本与利润</Title>
            </Group>

            <Text size="sm" c="dimmed" mb="md">
              总 Credits: <Text span c="brand.4" fw={700}>{(modelUsage.total_credits ?? modelUsage.total_tokens).toLocaleString()}</Text>
              {' | '}
              总请求: <Text span c="blue.4" fw={700}>{modelUsage.total_requests.toLocaleString()}</Text>
              {' | '}
              成本: <Text span c="orange.4" fw={700}>{formatMoney(modelUsage.cost_amount)}</Text>
              {' | '}
              利润: <Text span c={(modelUsage.profit_amount ?? 0) >= 0 ? 'green.4' : 'red.4'} fw={700}>{formatMoney(modelUsage.profit_amount)}</Text>
            </Text>

            <Stack gap="md">
              {modelUsage.model_stats.map((model, index) => (
                <SurfaceCard key={index} tone="subtle">
                  <Group justify="space-between" align="center" mb="xs">
                    <div>
                      <Text fw={500}>{model.model_id || model.model_name}</Text>
                      <Text size="xs" c="dimmed">
                        {[model.provider, model.service_kind].filter(Boolean).join(' / ') || '未标记服务'}
                      </Text>
                    </div>
                    <Group gap="xs">
                      {(model.missing_pricing_count ?? 0) > 0 ? <StatusChip tone="warning">缺价格 {model.missing_pricing_count}</StatusChip> : null}
                      <Text size="sm" c="dimmed">{model.percentage.toFixed(1)}%</Text>
                    </Group>
                  </Group>
                  <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs" mb="sm">
                    <Text size="xs" c="dimmed">Credits: <Text span c="brand.4">{creditsOf(model).toLocaleString()}</Text></Text>
                    <Text size="xs" c="dimmed">模型Token: <Text span c="violet.4">{(model.total_model_tokens ?? 0).toLocaleString()}</Text></Text>
                    <Text size="xs" c="dimmed">UTF-8字节: <Text span c="cyan.4">{formatBytes(model.utf8_bytes)}</Text></Text>
                    <Text size="xs" c="dimmed">时长: <Text span c="yellow.4">{Math.round(model.duration_seconds ?? 0)}s</Text></Text>
                    <Text size="xs" c="dimmed">请求: <Text span c="blue.4">{model.request_count.toLocaleString()}</Text></Text>
                    <Text size="xs" c="dimmed">用户: <Text span c="violet.4">{model.unique_users}</Text></Text>
                    <Text size="xs" c="dimmed">成本: <Text span c="orange.4">{formatMoney(model.cost_amount)}</Text></Text>
                    <Text size="xs" c="dimmed">收入: <Text span c="green.4">{formatMoney(model.revenue_amount)}</Text></Text>
                    <Text size="xs" c="dimmed">利润: <Text span c={(model.profit_amount ?? 0) >= 0 ? 'green.4' : 'red.4'}>{formatMoney(model.profit_amount)}</Text></Text>
                    <Text size="xs" c="dimmed">毛利率: <Text span c={(model.gross_margin ?? 0) >= 0 ? 'brand.4' : 'red.4'}>{formatPercent(model.gross_margin)}</Text></Text>
                  </SimpleGrid>
                  <PercentageBar percentage={model.percentage} color="violet" />
                </SurfaceCard>
              ))}
            </Stack>
          </Paper>
        ) : null}

        {apiUsage ? (
          <Paper p="lg" radius="lg" withBorder>
            <Group gap="sm" mb="md">
              <CodeBracketIcon style={{ width: 24, height: 24, color: colorMap.orange }} />
              <Title order={3}>API 使用成本</Title>
            </Group>

            <Text size="sm" c="dimmed" mb="md">
              总 Credits: <Text span c="brand.4" fw={700}>{(apiUsage.total_credits ?? apiUsage.total_tokens).toLocaleString()}</Text>
              {' | '}
              总请求: <Text span c="blue.4" fw={700}>{apiUsage.total_requests.toLocaleString()}</Text>
              {' | '}
              成本: <Text span c="orange.4" fw={700}>{formatMoney(apiUsage.cost_amount)}</Text>
              {' | '}
              利润: <Text span c={(apiUsage.profit_amount ?? 0) >= 0 ? 'green.4' : 'red.4'} fw={700}>{formatMoney(apiUsage.profit_amount)}</Text>
            </Text>

            <Stack gap="md">
              {apiUsage.api_stats.map((api, index) => (
                <SurfaceCard key={index} tone="subtle">
                  <Group justify="space-between" align="center" mb="xs">
                    <Text fw={500} size="sm">{api.api_endpoint}</Text>
                    <Group gap="xs">
                      {(api.missing_pricing_count ?? 0) > 0 ? <StatusChip tone="warning">缺价格 {api.missing_pricing_count}</StatusChip> : null}
                      <Text size="sm" c="dimmed">{api.percentage.toFixed(1)}%</Text>
                    </Group>
                  </Group>
                  <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs" mb="sm">
                    <Text size="xs" c="dimmed">Credits: <Text span c="brand.4">{creditsOf(api).toLocaleString()}</Text></Text>
                    <Text size="xs" c="dimmed">请求: <Text span c="blue.4">{api.request_count.toLocaleString()}</Text></Text>
                    <Text size="xs" c="dimmed">用户: <Text span c="violet.4">{api.unique_users}</Text></Text>
                    <Text size="xs" c="dimmed">UTF-8字节: <Text span c="cyan.4">{formatBytes(api.utf8_bytes)}</Text></Text>
                    <Text size="xs" c="dimmed">平均: <Text span c="yellow.4">{(api.avg_credits_per_request ?? api.avg_tokens_per_request).toFixed(0)}</Text></Text>
                    <Text size="xs" c="dimmed">成本: <Text span c="orange.4">{formatMoney(api.cost_amount)}</Text></Text>
                    <Text size="xs" c="dimmed">收入: <Text span c="green.4">{formatMoney(api.revenue_amount)}</Text></Text>
                    <Text size="xs" c="dimmed">利润: <Text span c={(api.profit_amount ?? 0) >= 0 ? 'green.4' : 'red.4'}>{formatMoney(api.profit_amount)}</Text></Text>
                    <Text size="xs" c="dimmed">毛利率: <Text span c={(api.gross_margin ?? 0) >= 0 ? 'brand.4' : 'red.4'}>{formatPercent(api.gross_margin)}</Text></Text>
                  </SimpleGrid>
                  <PercentageBar percentage={api.percentage} color="orange" />
                </SurfaceCard>
              ))}
            </Stack>
          </Paper>
        ) : null}
      </SimpleGrid>
    </AppPageShell>
  )
}

export default AnalyticsPage
