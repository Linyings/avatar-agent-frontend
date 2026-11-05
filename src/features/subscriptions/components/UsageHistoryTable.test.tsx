import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import UsageHistoryTable from './UsageHistoryTable'
import type { TokenUsageRecord } from '../types'

function renderTable(ui: React.ReactElement) {
  return render(
    <MantineProvider>
      {ui}
    </MantineProvider>
  )
}

const record: TokenUsageRecord = {
  id: 'record-1',
  user_id: 'user-1',
  subscription_id: 'sub-1',
  token_count: 15320,
  api_endpoint: '/v1/chat/completions',
  model_name: 'gpt-5.4',
  project_id: 'project-1',
  request_metadata: {},
  recorded_at: '2026-04-23T08:39:05.735Z',
}

describe('UsageHistoryTable', () => {
  it('加载中时显示加载态', () => {
    renderTable(
      <UsageHistoryTable
        records={[]}
        isLoading
      />
    )

    expect(screen.getByText('加载中...')).toBeInTheDocument()
  })

  it('空数据时显示空状态文案', () => {
    renderTable(
      <UsageHistoryTable
        records={[]}
        emptyText="当前没有记录"
      />
    )

    expect(screen.getByText('当前没有记录')).toBeInTheDocument()
  })

  it('展示格式化后的记录内容', () => {
    renderTable(<UsageHistoryTable records={[record]} />)

    expect(screen.getByText('gpt-5.4')).toBeInTheDocument()
    expect(screen.getByText('15.32K')).toBeInTheDocument()
    expect(screen.getByText('2026-04-23')).toBeInTheDocument()
  })
})
