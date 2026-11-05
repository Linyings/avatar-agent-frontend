import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ConsumptionRecordsPage from '@/pages/ConsumptionRecordsPage'
import { AppMantineProvider } from '@/shared/mantine/AppMantineProvider'
import { tokenAccountService } from '@/features/subscriptions/services'
import type { CreditLedgerRecord } from '@/features/subscriptions/types'

vi.mock('@/features/subscriptions/services', () => ({
  tokenAccountService: {
    listLedgerRecords: vi.fn(),
    getLedgerRecordDetail: vi.fn(),
  },
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

const consumeRecord: CreditLedgerRecord = {
  id: 'ledger-1',
  user_id: 'user-1',
  event_type: 'consume',
  project_id: 'project-1',
  project_name: '短剧项目 A',
  item: 'LLM 消费',
  change_amount: -2,
  balance_after: 99998,
  reason: '',
  request_metadata: {},
  recorded_at: '2026-05-09T10:07:51.000Z',
  created_at: '2026-05-09T10:07:51.000Z',
  updated_at: '2026-05-09T10:07:51.000Z',
}

const rechargeRecord: CreditLedgerRecord = {
  id: 'ledger-2',
  user_id: 'user-1',
  event_type: 'recharge',
  project_id: null,
  project_name: '',
  item: '测试充值包',
  change_amount: 1500,
  balance_after: 101500,
  reason: '微信充值',
  request_metadata: {},
  recorded_at: '2026-05-09T09:00:00.000Z',
  created_at: '2026-05-09T09:00:00.000Z',
  updated_at: '2026-05-09T09:00:00.000Z',
}

const adjustmentRecord: CreditLedgerRecord = {
  id: 'ledger-3',
  user_id: 'user-1',
  event_type: 'admin_adjustment',
  project_id: null,
  project_name: '',
  item: '管理员调整',
  change_amount: 100,
  balance_after: 101600,
  reason: '测试补偿',
  request_metadata: {},
  recorded_at: '2026-05-09T08:00:00.000Z',
  created_at: '2026-05-09T08:00:00.000Z',
  updated_at: '2026-05-09T08:00:00.000Z',
}

describe('ConsumptionRecordsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(tokenAccountService.listLedgerRecords).mockResolvedValue({
      items: [consumeRecord, rechargeRecord, adjustmentRecord],
      total: 3,
      page: 1,
      per_page: 20,
      total_pages: 1,
    })
    vi.mocked(tokenAccountService.getLedgerRecordDetail).mockResolvedValue({
      record: consumeRecord,
      usage_records: [],
      service_breakdown: {},
      endpoint_breakdown: {},
      reservation_count: 0,
      billing_mode: '',
    })
  })

  it('按时间、项目、类型、变动、余额展示账户流水', async () => {
    render(
      <MemoryRouter>
        <AppMantineProvider>
          <ConsumptionRecordsPage />
        </AppMantineProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '消费记录', level: 1 })).toBeInTheDocument()
    })

    expect(screen.getByText('时间')).toBeInTheDocument()
    expect(screen.getByText('项目')).toBeInTheDocument()
    expect(screen.getByText('类型')).toBeInTheDocument()
    expect(screen.getByText('变动')).toBeInTheDocument()
    expect(screen.getByText('余额')).toBeInTheDocument()
    expect(screen.getByText('操作')).toBeInTheDocument()
    expect(screen.getByText('短剧项目 A')).toBeInTheDocument()
    expect(screen.getByText('project-1')).toBeInTheDocument()
    expect(screen.getByText('LLM 消费')).toBeInTheDocument()
    expect(screen.getAllByText('测试补偿')).toHaveLength(2)
    expect(screen.queryByText('管理员调整')).not.toBeInTheDocument()
    expect(screen.queryByText('qwen3.6-plus')).not.toBeInTheDocument()
    expect(screen.getByText('-2 Credits')).toBeInTheDocument()
    expect(screen.getByText('+1,500 Credits')).toBeInTheDocument()
    expect(screen.getByText('+100 Credits')).toBeInTheDocument()
    expect(screen.getByText('99,998')).toBeInTheDocument()
    expect(screen.getByText('101,500')).toBeInTheDocument()
    expect(screen.getByText('101,600')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '查看详情' })).toHaveLength(3)
  })

  it('点击查看详情后展示项目级服务拆分和调用明细', async () => {
    const user = userEvent.setup()
    vi.mocked(tokenAccountService.getLedgerRecordDetail).mockResolvedValue({
      record: {
        ...consumeRecord,
        item: 'Credits 消费',
        change_amount: -338,
        balance_after: 1431,
      },
      usage_records: [
        {
          id: 'usage-1',
          user_id: 'user-1',
          project_id: 'project-1',
          token_count: 120,
          credit_count: 120,
          api_endpoint: '/api/v1/tools/generate-script-stream',
          model_name: 'qwen-plus',
          model_id: 'qwen-plus',
          provider: 'dashscope',
          service_kind: 'llm',
          total_model_tokens: 120,
          recorded_at: '2026-05-09T10:01:00.000Z',
        },
        {
          id: 'usage-2',
          user_id: 'user-1',
          project_id: 'project-1',
          token_count: 0,
          credit_count: 78,
          api_endpoint: '/api/v1/tools/text-to-speech-with-uri',
          model_name: 'cosyvoice',
          model_id: 'FunAudioLLM/CosyVoice2-0.5B',
          provider: 'siliconflow',
          service_kind: 'tts',
          utf8_bytes: 26,
          recorded_at: '2026-05-09T10:02:00.000Z',
        },
      ],
      service_breakdown: {
        llm: 120,
        tts: 78,
      },
      endpoint_breakdown: {
        '/api/v1/tools/generate-script-stream': 120,
        '/api/v1/tools/text-to-speech-with-uri': 78,
      },
      reservation_count: 2,
      billing_mode: 'workflow_reservation_confirm',
    })

    render(
      <MemoryRouter>
        <AppMantineProvider>
          <ConsumptionRecordsPage />
        </AppMantineProvider>
      </MemoryRouter>,
    )

    await user.click((await screen.findAllByRole('button', { name: '查看详情' }))[0])

    expect(tokenAccountService.getLedgerRecordDetail).toHaveBeenCalledWith('ledger-1')
    expect(await screen.findByRole('dialog', { name: '消费详情' })).toBeInTheDocument()
    expect(screen.getByText('本次变动')).toBeInTheDocument()
    expect(screen.getByText('-338 Credits')).toBeInTheDocument()
    expect(screen.getByText('扣费后余额')).toBeInTheDocument()
    expect(screen.getByText('1,431 Credits')).toBeInTheDocument()
    expect(screen.getByText('服务拆分')).toBeInTheDocument()
    expect(screen.getByText('2 个预留')).toBeInTheDocument()
    expect(screen.getAllByText('LLM').length).toBeGreaterThan(0)
    expect(screen.getAllByText('120 Credits').length).toBeGreaterThan(0)
    expect(screen.getAllByText('TTS').length).toBeGreaterThan(0)
    expect(screen.getAllByText('78 Credits').length).toBeGreaterThan(0)
    expect(screen.getByText('调用明细')).toBeInTheDocument()
    expect(screen.getByText('120 tokens')).toBeInTheDocument()
    expect(screen.getByText('26 bytes')).toBeInTheDocument()
    expect(screen.queryByText('Provider / Model')).not.toBeInTheDocument()
    expect(screen.queryByText('dashscope')).not.toBeInTheDocument()
    expect(screen.queryByText('siliconflow')).not.toBeInTheDocument()
    expect(screen.queryByText('qwen-plus')).not.toBeInTheDocument()
    expect(screen.queryByText('FunAudioLLM/CosyVoice2-0.5B')).not.toBeInTheDocument()
    expect(screen.queryByText('接口拆分')).not.toBeInTheDocument()
    expect(screen.queryByText('/api/v1/tools/generate-script-stream')).not.toBeInTheDocument()
    expect(screen.queryByText('/api/v1/tools/text-to-speech-with-uri')).not.toBeInTheDocument()
  })

  it('按项目 ID 检索并展示单项目总消耗', async () => {
    const user = userEvent.setup()
    vi.mocked(tokenAccountService.listLedgerRecords)
      .mockResolvedValueOnce({
        items: [consumeRecord, rechargeRecord],
        total: 0,
        page: 1,
        per_page: 20,
        total_pages: 0,
      })
      .mockResolvedValueOnce({
        items: [
          {
            ...consumeRecord,
            change_amount: -6,
            balance_after: 99994,
          },
        ],
        total: 2,
        page: 1,
        per_page: 20,
        total_pages: 1,
        summary: {
          income: 0,
          expense: 9,
          net: -9,
          total_consumed_credits: 9,
          project_id: 'project-1',
          project_name: '短剧项目 A',
        },
      })

    render(
      <MemoryRouter>
        <AppMantineProvider>
          <ConsumptionRecordsPage />
        </AppMantineProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText('短剧项目 A')).toBeInTheDocument()

    await user.type(screen.getByLabelText('项目 ID'), ' project-1 ')
    await user.click(screen.getByRole('button', { name: '检索' }))

    await waitFor(() => {
      expect(tokenAccountService.listLedgerRecords).toHaveBeenLastCalledWith({
        page: 1,
        per_page: 20,
        project_id: 'project-1',
      })
    })
    expect(await screen.findByText('单项目总消耗')).toBeInTheDocument()
    expect(screen.getByText('9 Credits')).toBeInTheDocument()
    expect(screen.getByText('匹配记录')).toBeInTheDocument()
    expect(screen.getByText('2 条')).toBeInTheDocument()
  })

  it('忽略过期的账户级流水响应，避免覆盖项目筛选汇总', async () => {
    const user = userEvent.setup()
    const initialRequest = deferred<Awaited<ReturnType<typeof tokenAccountService.listLedgerRecords>>>()
    const projectRequest = deferred<Awaited<ReturnType<typeof tokenAccountService.listLedgerRecords>>>()

    vi.mocked(tokenAccountService.listLedgerRecords)
      .mockReturnValueOnce(initialRequest.promise)
      .mockReturnValueOnce(projectRequest.promise)

    render(
      <MemoryRouter>
        <AppMantineProvider>
          <ConsumptionRecordsPage />
        </AppMantineProvider>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('项目 ID'), 'project-1')
    await user.click(screen.getByRole('button', { name: '检索' }))

    await act(async () => {
      projectRequest.resolve({
        items: [{ ...consumeRecord, change_amount: -850 }],
        total: 28,
        page: 1,
        per_page: 20,
        total_pages: 2,
        summary: {
          income: 0,
          expense: 850,
          net: -850,
          total_consumed_credits: 850,
          project_id: 'project-1',
          project_name: '短剧项目 A',
        },
      })
      await projectRequest.promise
    })

    expect(await screen.findByText('850 Credits')).toBeInTheDocument()
    expect(screen.getByText('28 条')).toBeInTheDocument()

    await act(async () => {
      initialRequest.resolve({
        items: [],
        total: 337,
        page: 1,
        per_page: 20,
        total_pages: 17,
        summary: {
          income: 36733,
          expense: 101340577,
          net: -101303844,
          total_consumed_credits: 101340577,
          project_id: null,
          project_name: '',
        },
      })
      await initialRequest.promise
    })

    expect(screen.getByText('850 Credits')).toBeInTheDocument()
    expect(screen.getByText('28 条')).toBeInTheDocument()
    expect(screen.queryByText('101,340,577 Credits')).not.toBeInTheDocument()
    expect(screen.queryByText('337 条')).not.toBeInTheDocument()
  })
})
