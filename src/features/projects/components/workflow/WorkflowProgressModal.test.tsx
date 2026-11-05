import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/shared/i18n/I18nProvider'
import { MemoryRouter } from 'react-router-dom'
import { frameWorkflowSteps } from '@/features/projects/workflow/frame'
import {
  WorkflowProgressModal,
  type WorkflowProgressModalProps,
} from './WorkflowProgressModal'

const items: WorkflowProgressModalProps['items'] = frameWorkflowSteps.map((step, index) => ({
  id: step.id,
  index: index + 1,
  label: step.label,
  status: index === 0 ? 'completed' : index === 1 ? 'running' : 'pending',
  progress: index === 0 ? 100 : index === 1 ? 45 : undefined,
  message: index === 0 ? '视频合并完成' : index === 1 ? '正在提取音轨' : undefined,
}))

const defaultProps: WorkflowProgressModalProps = {
  opened: true,
  status: 'running',
  progress: 36,
  items,
  message: '正在提取音轨',
  canClose: false,
  canPause: false,
  canResume: false,
  canCancel: true,
  onClose: vi.fn(),
  onPause: vi.fn(),
  onResume: vi.fn(),
  onCancel: vi.fn(),
}

function renderModal(overrides: Partial<WorkflowProgressModalProps> = {}) {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <I18nProvider initialLocale="zh-CN">
          <WorkflowProgressModal {...defaultProps} {...overrides} />
        </I18nProvider>
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('WorkflowProgressModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all 14 Web workflow steps in order with the Web action policy', () => {
    renderModal({ canPause: false })

    const renderedSteps = Array.from(document.querySelectorAll('[data-frameflow-step]'))
    const renderedStepIds = renderedSteps.map(element => element.getAttribute('data-frameflow-step'))

    expect(frameWorkflowSteps).toHaveLength(14)
    expect(renderedStepIds).toEqual(frameWorkflowSteps.map(step => step.id))
    frameWorkflowSteps.forEach((step, index) => {
      expect(renderedSteps[index]).toHaveTextContent(step.label)
    })
    expect(screen.queryByRole('button', { name: '暂停任务' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '继续执行' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '关闭' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '停止任务' })).toBeInTheDocument()
  })

  it('renders the running progress and the same visible step list used by Web', () => {
    renderModal()

    expect(screen.getByText('正在执行通用模式')).toBeInTheDocument()
    expect(screen.getByText('合并视频')).toBeInTheDocument()
    expect(screen.getByText('提取音频')).toBeInTheDocument()
    expect(screen.getByText('转录字幕')).toBeInTheDocument()
    expect(screen.getByText('完成')).toBeInTheDocument()
    expect(screen.getByText('执行中')).toBeInTheDocument()
    expect(screen.getAllByText('等待')).toHaveLength(12)
    expect(screen.getAllByText('正在提取音轨')).toHaveLength(2)
    expect(screen.getByRole('progressbar', { name: '通用模式进度' })).toHaveAttribute('aria-valuenow', '36')
    expect(screen.queryByRole('button', { name: '暂停任务' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '停止任务' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '关闭' })).not.toBeInTheDocument()
  })

  it('renders the interrupted state with resume and close actions', () => {
    renderModal({
      status: 'interrupted',
      canClose: true,
      canPause: false,
      canResume: true,
      canCancel: false,
    })

    expect(screen.getByText('任务已中断，可继续')).toBeInTheDocument()
    expect(screen.getByText('网络或页面会话已中断。任务断点会保留 24 小时，继续后只执行未完成步骤。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '继续执行' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '关闭' })).toBeInTheDocument()
  })

  it('renders the workflow error and failed step state', () => {
    renderModal({
      status: 'error',
      error: '提取音频执行失败',
      canClose: true,
      canPause: false,
      canCancel: false,
      items: items.map(item => item.id === 'extract-audio'
        ? { ...item, status: 'failed', message: '提取音频执行失败' }
        : item),
    })

    expect(screen.getByText('通用模式失败')).toBeInTheDocument()
    expect(screen.getAllByText('提取音频执行失败')).toHaveLength(2)
    expect(screen.getByText('失败')).toBeInTheDocument()
  })

  it('keeps the original error visible without a desktop download action', () => {
    renderModal({
      status: 'error',
      error: 'provider unavailable',
      canClose: true,
      canCancel: false,
      desktopFallback: {
        title: '网页端转录暂时无法继续',
        message: '请稍后重试。当前平台只在网页中使用。',
      },
    })

    expect(screen.getByText('provider unavailable')).toBeVisible()
    expect(screen.getByText('网页端转录暂时无法继续')).toBeVisible()
    expect(screen.getByText('请稍后重试。当前平台只在网页中使用。')).toBeVisible()
    expect(screen.queryByRole('link', { name: '下载桌面端' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '下载 Windows 版' })).not.toBeInTheDocument()
  })

  it('delegates close, pause, resume, and cancel actions to callbacks', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onPause = vi.fn()
    const onResume = vi.fn()
    const onCancel = vi.fn()

    const { rerender } = renderModal({
      canPause: true,
      onClose,
      onPause,
      onResume,
      onCancel,
    })

    await user.click(screen.getByRole('button', { name: '暂停任务' }))
    await user.click(screen.getByRole('button', { name: '停止任务' }))
    expect(onPause).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)

    rerender(
      <MantineProvider>
        <MemoryRouter>
          <I18nProvider initialLocale="zh-CN">
            <WorkflowProgressModal
              {...defaultProps}
              status="interrupted"
              canClose
              canPause={false}
              canResume
              canCancel={false}
              onClose={onClose}
              onPause={onPause}
              onResume={onResume}
              onCancel={onCancel}
            />
          </I18nProvider>
        </MemoryRouter>
      </MantineProvider>,
    )

    await user.click(screen.getByRole('button', { name: '继续执行' }))
    await user.click(screen.getByRole('button', { name: '关闭' }))
    expect(onResume).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
