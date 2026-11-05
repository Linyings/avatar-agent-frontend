import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Center,
  Divider,
  Drawer,
  Group,
  Loader,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core'
import AppPageShell from '@/shared/components/ui/AppPageShell'
import {
  ArrowPathIcon,
  ClockIcon,
  CreditCardIcon,
  DocumentTextIcon,
  EyeIcon,
  FolderOpenIcon,
  MagnifyingGlassIcon,
  TableCellsIcon,
  XMarkIcon,
} from '@/shared/icons/tabler'
import { tokenAccountService } from '@/features/subscriptions/services'
import Pagination from '@/features/subscriptions/components/Pagination'
import type { CreditLedgerRecord, CreditLedgerRecordDetail, CreditLedgerSummary, CreditLedgerUsageDetail } from '@/features/subscriptions/types'

const elevatedSurfaceStyle = {
  background: 'var(--app-surface-elevated)',
  borderColor: 'var(--app-border)',
  boxShadow: 'var(--app-shadow)',
} as const

const brandSoftIconStyle = {
  background: 'var(--app-brand-soft-bg)',
  border: '1px solid var(--app-brand-soft-border)',
} as const

const pageSizeOptions = 20

const eventLabels: Record<string, string> = {
  consume: '消费',
  recharge: '充值',
  admin_adjustment: '管理员调整',
}

const consumeItemLabel = 'Credits 消费'
const consumeItemLabels = new Set(['LLM 消费', 'Vision 消费', 'ASR 消费', 'TTS 消费', consumeItemLabel])

const serviceKindLabels: Record<string, string> = {
  llm: 'LLM',
  vision: 'VLM',
  asr: 'ASR',
  tts: 'TTS',
}

const emptyLedgerSummary: CreditLedgerSummary = {
  income: 0,
  expense: 0,
  net: 0,
  total_consumed_credits: 0,
  project_id: null,
  project_name: '',
}

const normalizeNumber = (value: unknown, fallback = 0) => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
)

const buildSummaryFromRecords = (items: CreditLedgerRecord[]): CreditLedgerSummary => {
  const income = items
    .filter((record) => record.change_amount > 0)
    .reduce((sum, record) => sum + record.change_amount, 0)
  const expense = items
    .filter((record) => record.event_type === 'consume' && record.change_amount < 0)
    .reduce((sum, record) => sum + Math.abs(record.change_amount), 0)

  return {
    ...emptyLedgerSummary,
    income,
    expense,
    net: income - expense,
    total_consumed_credits: expense,
  }
}

const normalizeLedgerSummary = (
  summary: CreditLedgerSummary | undefined,
  items: CreditLedgerRecord[],
  projectId: string
): CreditLedgerSummary => {
  const fallback = buildSummaryFromRecords(items)
  return {
    income: normalizeNumber(summary?.income, fallback.income),
    expense: normalizeNumber(summary?.expense, fallback.expense),
    net: normalizeNumber(summary?.net, fallback.net),
    total_consumed_credits: normalizeNumber(
      summary?.total_consumed_credits,
      normalizeNumber(summary?.expense, fallback.total_consumed_credits)
    ),
    project_id: summary?.project_id ?? (projectId || null),
    project_name: summary?.project_name ?? '',
  }
}

const normalizeLedgerTotal = (
  declaredTotal: unknown,
  loadedCount: number,
  page: number,
  pageSize: number
) => {
  const total = normalizeNumber(declaredTotal, loadedCount)
  const minimumVisibleTotal = Math.max(0, page - 1) * pageSize + loadedCount
  return Math.max(total, minimumVisibleTotal)
}

const normalizeLedgerTotalPages = (
  declaredTotalPages: unknown,
  total: number,
  pageSize: number
) => {
  const calculated = pageSize > 0 ? Math.ceil(total / pageSize) : 0
  const totalPages = normalizeNumber(declaredTotalPages, calculated)
  return Math.max(totalPages, calculated)
}

const ConsumptionRecordsPage: React.FC = () => {
  const [records, setRecords] = useState<CreditLedgerRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(pageSizeOptions)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [projectIdInput, setProjectIdInput] = useState('')
  const [activeProjectId, setActiveProjectId] = useState('')
  const [loadedProjectId, setLoadedProjectId] = useState('')
  const [ledgerSummary, setLedgerSummary] = useState<CreditLedgerSummary>(emptyLedgerSummary)
  const [detailRecord, setDetailRecord] = useState<CreditLedgerRecordDetail | null>(null)
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const requestSeqRef = useRef(0)

  const loadRecords = useCallback(async (page = 1, size = pageSizeOptions, projectId = '') => {
    const requestSeq = requestSeqRef.current + 1
    requestSeqRef.current = requestSeq

    try {
      setIsLoading(true)
      setError(null)
      const normalizedProjectId = projectId.trim()
      const response = await tokenAccountService.listLedgerRecords({
        page,
        per_page: size,
        ...(normalizedProjectId ? { project_id: normalizedProjectId } : {}),
      })
      if (requestSeq !== requestSeqRef.current) {
        return
      }

      const items = Array.isArray(response.items) ? response.items : []
      const nextPageSize = response.per_page ?? size
      const nextPage = response.page || page
      const nextTotal = normalizeLedgerTotal(response.total, items.length, nextPage, nextPageSize)

      setRecords(items)
      setTotal(nextTotal)
      setCurrentPage(nextPage)
      setPageSize(nextPageSize)
      setTotalPages(normalizeLedgerTotalPages(response.total_pages, nextTotal, nextPageSize))
      setLedgerSummary(normalizeLedgerSummary(response.summary, items, normalizedProjectId))
      setLoadedProjectId(normalizedProjectId)
    } catch (err) {
      if (requestSeq !== requestSeqRef.current) {
        return
      }
      const message = err instanceof Error ? err.message : '获取消费记录失败'
      setError(message)
      console.error('获取消费记录失败:', err)
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadRecords(1, pageSizeOptions)
  }, [loadRecords])

  const hasRecords = records.length > 0

  const summary = ledgerSummary
  const hasActiveProjectSummary = Boolean(activeProjectId) && loadedProjectId === activeProjectId
  const activeProjectName = useMemo(() => {
    if (!hasActiveProjectSummary) return ''
    return ledgerSummary.project_name?.trim()
      || records.find((record) => record.project_id === activeProjectId)?.project_name?.trim()
      || ''
  }, [activeProjectId, hasActiveProjectSummary, ledgerSummary.project_name, records])

  const handlePageChange = (page: number) => {
    void loadRecords(page, pageSize, activeProjectId)
  }

  const handlePageSizeChange = (size: number) => {
    void loadRecords(1, size, activeProjectId)
  }

  const handleProjectSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedProjectId = projectIdInput.trim()
    setProjectIdInput(normalizedProjectId)
    setActiveProjectId(normalizedProjectId)
    void loadRecords(1, pageSize, normalizedProjectId)
  }

  const handleClearProjectSearch = () => {
    setProjectIdInput('')
    setActiveProjectId('')
    void loadRecords(1, pageSize, '')
  }

  const handleOpenDetail = async (record: CreditLedgerRecord) => {
    try {
      setDetailError(null)
      setDetailLoadingId(record.id)
      const detail = await tokenAccountService.getLedgerRecordDetail(record.id)
      setDetailRecord(detail)
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取消费详情失败'
      setDetailError(message)
      console.error('获取消费详情失败:', err)
    } finally {
      setDetailLoadingId(null)
    }
  }

  const handleCloseDetail = () => {
    setDetailRecord(null)
    setDetailError(null)
  }

  return (
    <AppPageShell py={{ base: 24, md: 40 }} gap={28}>
      <Group justify="space-between" align="end" gap="md">
        <Stack gap={4}>
          <Title order={1}>消费记录</Title>
          <Text c="dimmed">查看 Credits 的消费、充值和管理员调整明细。</Text>
        </Stack>
        <Button
          onClick={() => loadRecords(currentPage, pageSize, activeProjectId)}
          leftSection={<ArrowPathIcon width={16} height={16} />}
          variant="default"
          radius="md"
          loading={isLoading && hasRecords}
        >
          刷新
        </Button>
      </Group>

      <Paper p={{ base: 'lg', md: 'xl' }} radius={8} withBorder style={elevatedSurfaceStyle}>
        <Stack gap="lg">
          <Group justify="space-between" align="center" wrap="wrap">
            <Group gap="md">
              <ThemeIcon
                size={44}
                radius="md"
                variant="light"
                color="brand"
                style={brandSoftIconStyle}
              >
                <TableCellsIcon width={20} height={20} />
              </ThemeIcon>
              <Stack gap={2}>
                <Title order={2} size="h3">Credits 流水</Title>
              </Stack>
            </Group>

            {hasRecords && (
              <Group gap="xs">
                <Badge color="green" variant="light" radius="xl">
                  增加 +{summary.income.toLocaleString()}
                </Badge>
                <Badge color="red" variant="light" radius="xl">
                  消费 -{summary.expense.toLocaleString()}
                </Badge>
              </Group>
            )}
          </Group>

          <Stack gap="md">
            <form onSubmit={handleProjectSearch}>
              <Group align="end" gap="sm" wrap="wrap">
                <TextInput
                  label="项目 ID"
                  placeholder="输入完整项目 ID"
                  value={projectIdInput}
                  onChange={(event) => setProjectIdInput(event.currentTarget.value)}
                  leftSection={<MagnifyingGlassIcon width={16} height={16} />}
                  style={{ flex: '1 1 360px' }}
                />
                <Button
                  type="submit"
                  leftSection={<MagnifyingGlassIcon width={16} height={16} />}
                  radius="md"
                  loading={isLoading && Boolean(activeProjectId)}
                  disabled={!projectIdInput.trim()}
                >
                  检索
                </Button>
                {activeProjectId && (
                  <Button
                    type="button"
                    variant="subtle"
                    color="gray"
                    radius="md"
                    onClick={handleClearProjectSearch}
                    leftSection={<XMarkIcon width={16} height={16} />}
                  >
                    清除
                  </Button>
                )}
              </Group>
            </form>

            {hasActiveProjectSummary && (
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                <Stack gap={2}>
                  <Text size="xs" c="dimmed">单项目总消耗</Text>
                  <Text size="xl" fw={800} c="red">
                    {summary.total_consumed_credits.toLocaleString()} Credits
                  </Text>
                </Stack>
                <Stack gap={2}>
                  <Text size="xs" c="dimmed">匹配记录</Text>
                  <Text size="xl" fw={800}>
                    {total.toLocaleString()} 条
                  </Text>
                </Stack>
                <Stack gap={2}>
                  <Text size="xs" c="dimmed">{activeProjectName ? '项目名称' : '项目 ID'}</Text>
                  <Text
                    size="sm"
                    fw={600}
                    ff={activeProjectName ? undefined : 'monospace'}
                    style={{ wordBreak: 'break-all' }}
                  >
                    {activeProjectName || activeProjectId}
                  </Text>
                </Stack>
              </SimpleGrid>
            )}
          </Stack>

          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}

          {isLoading && !hasRecords ? (
            <Center py="xl">
              <Stack align="center" gap="sm">
                <Loader color="brand" />
                <Text size="sm" c="dimmed">正在加载消费记录...</Text>
              </Stack>
            </Center>
          ) : hasRecords ? (
            <>
              <ConsumptionRecordsTable
                records={records}
                loadingDetailId={detailLoadingId}
                onViewDetail={handleOpenDetail}
              />
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
            </>
          ) : (
            <Center py="xl">
              <Stack align="center" gap="sm">
                <ThemeIcon size={56} radius="md" variant="light" color="gray">
                  <DocumentTextIcon width={28} height={28} />
                </ThemeIcon>
                <Text size="sm" c="dimmed">暂无消费记录</Text>
              </Stack>
            </Center>
          )}
        </Stack>
      </Paper>
      {detailError && (
        <Alert color="red" variant="light">
          {detailError}
        </Alert>
      )}
      <LedgerDetailDrawer
        detail={detailRecord}
        onClose={handleCloseDetail}
      />
    </AppPageShell>
  )
}

function ConsumptionRecordsTable({
  records,
  loadingDetailId,
  onViewDetail,
}: {
  records: CreditLedgerRecord[]
  loadingDetailId: string | null
  onViewDetail: (record: CreditLedgerRecord) => void
}) {
  return (
    <ScrollArea>
      <Table striped highlightOnHover verticalSpacing="md" horizontalSpacing="md" miw={980}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>时间</Table.Th>
            <Table.Th>项目</Table.Th>
            <Table.Th>类型</Table.Th>
            <Table.Th style={{ textAlign: 'right' }}>变动</Table.Th>
            <Table.Th style={{ textAlign: 'right' }}>余额</Table.Th>
            <Table.Th style={{ textAlign: 'right' }}>操作</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {records.map((record) => {
            const { date, time } = formatDateTime(record.recorded_at || record.created_at)
            const projectDisplay = getProjectDisplay(record)
            const typeLabel = getRecordItemLabel(record)
            const isPositive = record.change_amount > 0

            return (
              <Table.Tr key={record.id}>
                <Table.Td>
                  <Group gap="sm" wrap="nowrap">
                    <ThemeIcon variant="light" color="gray" radius="md">
                      <ClockIcon width={16} height={16} />
                    </ThemeIcon>
                    <Stack gap={0}>
                      <Text size="sm" fw={600}>{date}</Text>
                      <Text size="xs" c="dimmed" ff="monospace">{time}</Text>
                    </Stack>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Group gap="sm" wrap="nowrap">
                    <ThemeIcon
                      variant="light"
                      color={record.event_type === 'recharge' ? 'green' : 'brand'}
                      radius="md"
                    >
                      {record.event_type === 'recharge' ? (
                        <CreditCardIcon width={16} height={16} />
                      ) : (
                        <FolderOpenIcon width={16} height={16} />
                      )}
                    </ThemeIcon>
                    <Stack gap={2}>
                      <Text size="sm" fw={600}>{projectDisplay.name}</Text>
                      <Text size="xs" c="dimmed" ff={projectDisplay.isProject ? 'monospace' : undefined}>
                        {projectDisplay.detail}
                      </Text>
                    </Stack>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Badge color={getEventColor(record.event_type)} variant="light" radius="xl" size="sm">
                    {typeLabel}
                  </Badge>
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  <Badge color={isPositive ? 'green' : 'red'} variant="light" size="lg">
                    {formatSignedCredits(record.change_amount)}
                  </Badge>
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  <Stack gap={0} align="end">
                    <Text size="sm" fw={700}>{record.balance_after.toLocaleString()}</Text>
                    <Text size="xs" c="dimmed">Credits</Text>
                  </Stack>
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  <Button
                    size="xs"
                    variant="subtle"
                    radius="md"
                    leftSection={<EyeIcon width={14} height={14} />}
                    loading={loadingDetailId === record.id}
                    onClick={() => onViewDetail(record)}
                  >
                    查看详情
                  </Button>
                </Table.Td>
              </Table.Tr>
            )
          })}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  )
}

function LedgerDetailDrawer({
  detail,
  onClose,
}: {
  detail: CreditLedgerRecordDetail | null
  onClose: () => void
}) {
  const record = detail?.record
  const projectDisplay = record ? getProjectDisplay(record) : null
  const breakdownEntries = Object.entries(detail?.service_breakdown ?? {})
    .filter(([, credits]) => credits > 0)
    .sort(([, a], [, b]) => b - a)

  return (
    <Drawer
      opened={Boolean(detail)}
      onClose={onClose}
      title="消费详情"
      position="right"
      size="min(760px, calc(100vw - 24px))"
      padding="xl"
    >
      {record && (
        <Stack gap="xl">
          <Stack gap={4}>
            <Title order={2} size="h3">{projectDisplay?.name || '账户流水'}</Title>
            <Text size="sm" c="dimmed" ff={record.project_id ? 'monospace' : undefined} style={{ wordBreak: 'break-all' }}>
              {projectDisplay?.detail || record.id}
            </Text>
          </Stack>

          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <MetricBlock label="本次变动" value={formatSignedCredits(record.change_amount)} color={record.change_amount < 0 ? 'red' : 'green'} />
            <MetricBlock label="扣费后余额" value={`${record.balance_after.toLocaleString()} Credits`} />
            <MetricBlock label="记录时间" value={formatDetailDateTime(record.recorded_at || record.created_at)} />
          </SimpleGrid>

          <Divider />

          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Title order={3} size="h4">服务拆分</Title>
              {detail?.reservation_count ? (
                <Badge variant="light" color="brand" radius="xl">
                  {detail.reservation_count} 个预留
                </Badge>
              ) : null}
            </Group>
            {breakdownEntries.length > 0 ? (
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                {breakdownEntries.map(([service, credits]) => (
                  <Group key={service} justify="space-between" wrap="nowrap">
                    <Text size="sm" fw={700}>{formatServiceKind(service)}</Text>
                    <Badge color="red" variant="light" radius="xl">
                      {credits.toLocaleString()} Credits
                    </Badge>
                  </Group>
                ))}
              </SimpleGrid>
            ) : (
              <Text size="sm" c="dimmed">暂无服务拆分数据</Text>
            )}
          </Stack>

          <Stack gap="md">
            <Title order={3} size="h4">调用明细</Title>
            {detail?.usage_records?.length ? (
              <ScrollArea>
                <Table verticalSpacing="sm" horizontalSpacing="sm" miw={680}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>服务</Table.Th>
                      <Table.Th>用量</Table.Th>
                      <Table.Th style={{ textAlign: 'right' }}>Credits</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {detail.usage_records.map((usage) => (
                      <Table.Tr key={usage.id}>
                        <Table.Td>
                          <Badge color={getUsageServiceColor(usage.service_kind)} variant="light" radius="xl">
                            {formatServiceKind(usage.service_kind)}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{formatUsageAmount(usage)}</Text>
                        </Table.Td>
                        <Table.Td style={{ textAlign: 'right' }}>
                          <Text size="sm" fw={800}>{usage.credit_count.toLocaleString()}</Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            ) : (
              <Text size="sm" c="dimmed">暂无工具调用明细</Text>
            )}
          </Stack>
        </Stack>
      )}
    </Drawer>
  )
}

function MetricBlock({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <Stack gap={4}>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="md" fw={800} c={color} style={{ wordBreak: 'break-word' }}>{value}</Text>
    </Stack>
  )
}

function getProjectDisplay(record: CreditLedgerRecord) {
  if (record.project_name) {
    return {
      name: record.project_name,
      detail: record.project_id || '无项目 ID',
      isProject: Boolean(record.project_id),
    }
  }
  if (record.project_id) {
    return {
      name: `项目 ${record.project_id.slice(0, 8)}`,
      detail: record.project_id,
      isProject: true,
    }
  }
  if (record.event_type === 'recharge') {
    return {
      name: '账户充值',
      detail: record.reason || '账户级记录',
      isProject: false,
    }
  }
  if (record.event_type === 'admin_adjustment') {
    return {
      name: '账户调整',
      detail: record.reason || '账户级记录',
      isProject: false,
    }
  }
  return {
    name: '账户',
    detail: '未关联项目',
    isProject: false,
  }
}

function getRecordItemLabel(record: CreditLedgerRecord) {
  if (record.event_type === 'consume') {
    return consumeItemLabels.has(record.item) ? record.item : consumeItemLabel
  }
  if (record.event_type === 'admin_adjustment') {
    return record.reason || record.item || eventLabels[record.event_type] || 'Credits 变动'
  }
  return record.item || eventLabels[record.event_type] || 'Credits 变动'
}

function getEventColor(eventType: string) {
  if (eventType === 'recharge') {
    return 'green'
  }
  if (eventType === 'admin_adjustment') {
    return 'blue'
  }
  return 'red'
}

function formatServiceKind(serviceKind?: string) {
  const key = (serviceKind || '').trim().toLowerCase()
  return serviceKindLabels[key] || serviceKind || '工具调用'
}

function getUsageServiceColor(serviceKind?: string) {
  const key = (serviceKind || '').trim().toLowerCase()
  if (key === 'asr') return 'blue'
  if (key === 'tts') return 'grape'
  if (key === 'vision') return 'cyan'
  return 'brand'
}

function formatUsageAmount(usage: CreditLedgerUsageDetail) {
  if ((usage.total_model_tokens ?? 0) > 0) {
    return `${usage.total_model_tokens?.toLocaleString()} tokens`
  }
  if ((usage.utf8_bytes ?? 0) > 0) {
    return `${usage.utf8_bytes?.toLocaleString()} bytes`
  }
  if ((usage.duration_seconds ?? 0) > 0) {
    return `${usage.duration_seconds?.toLocaleString()} 秒`
  }
  if ((usage.token_count ?? 0) > 0) {
    return `${usage.token_count.toLocaleString()} tokens`
  }
  return '-'
}

function formatSignedCredits(value: number) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toLocaleString()} Credits`
}

function formatDetailDateTime(dateStr: string) {
  const { date, time } = formatDateTime(dateStr)
  return time ? `${date} ${time}` : date
}

function formatDateTime(dateStr: string): { date: string; time: string } {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) {
    return { date: '无效日期', time: '' }
  }

  return {
    date: date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).replace(/\//g, '-'),
    time: date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }),
  }
}

export default ConsumptionRecordsPage
