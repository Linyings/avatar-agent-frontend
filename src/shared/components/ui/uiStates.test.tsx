import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import type { ReactNode } from 'react'
import EmptyState from './EmptyState'
import ErrorState from './ErrorState'
import AppPageShell from './AppPageShell'
import PageHeader from './PageHeader'
import LoadingState from './LoadingState'
import PageHeading from './PageHeading'
import PageSection from './PageSection'
import StatusChip from './StatusChip'
import SurfaceCard from './SurfaceCard'

function renderWithMantine(node: ReactNode) {
  return render(<MantineProvider>{node}</MantineProvider>)
}

describe('shared ui primitives', () => {
  it('renders page heading and page section content', () => {
    renderWithMantine(
      <AppPageShell>
        <PageHeader title="页面标题" subtitle="页面说明" actions={<div>操作区</div>} />
        <PageSection title="标题" description="说明">
          <PageHeading title="子标题" subtitle="子说明" />
        </PageSection>
      </AppPageShell>,
    )

    expect(screen.getByText('页面标题')).toBeInTheDocument()
    expect(screen.getByText('页面说明')).toBeInTheDocument()
    expect(screen.getByText('操作区')).toBeInTheDocument()
    expect(screen.getByText('标题')).toBeInTheDocument()
    expect(screen.getByText('说明')).toBeInTheDocument()
    expect(screen.getByText('子标题')).toBeInTheDocument()
    expect(screen.getByText('子说明')).toBeInTheDocument()
  })

  it('renders status chip and surface card content', () => {
    renderWithMantine(
      <SurfaceCard tone="highlight">
        <StatusChip tone="success">成功</StatusChip>
      </SurfaceCard>,
    )

    expect(screen.getByText('成功')).toBeInTheDocument()
  })

  it('renders loading empty and error states', () => {
    renderWithMantine(
      <>
        <LoadingState title="加载中" description="请稍候" />
        <EmptyState title="暂无内容" description="先去创建一条数据" />
        <ErrorState title="失败" description="请求超时" />
      </>,
    )

    expect(screen.getByText('加载中')).toBeInTheDocument()
    expect(screen.getByText('暂无内容')).toBeInTheDocument()
    expect(screen.getByText('失败')).toBeInTheDocument()
    expect(screen.getByText('请求超时')).toBeInTheDocument()
  })
})
