import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '@mantine/core'
import AnnouncementsPage from '@/pages/admin/AnnouncementsPage'
import { AppMantineProvider } from '@/shared/mantine/AppMantineProvider'
import type {
  AdminAnnouncementSummary,
  AdminNotificationBroadcastResponse,
} from '@/features/admin/types/notification'

const {
  mockBroadcastNotification,
  mockDeleteAnnouncement,
  mockListAnnouncements,
  mockShowError,
  mockShowSuccess,
  mockUpdateAnnouncement,
} = vi.hoisted(() => ({
  mockBroadcastNotification: vi.fn(),
  mockDeleteAnnouncement: vi.fn(),
  mockListAnnouncements: vi.fn(),
  mockShowError: vi.fn(),
  mockShowSuccess: vi.fn(),
  mockUpdateAnnouncement: vi.fn(),
}))

vi.mock('@/features/admin/services/adminNotificationService', () => ({
  adminNotificationService: {
    broadcastNotification: mockBroadcastNotification,
    deleteAnnouncement: mockDeleteAnnouncement,
    listAnnouncements: mockListAnnouncements,
    updateAnnouncement: mockUpdateAnnouncement,
  },
}))

vi.mock('@/shared/contexts/ToastContext', () => ({
  useToast: () => ({
    showError: mockShowError,
    showSuccess: mockShowSuccess,
  }),
}))

vi.mock('@/shared/components/ui/ConfirmDialog', () => ({
  default: ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = '确认',
    cancelText = '取消',
  }: {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    title: string
    message: string
    confirmText?: string
    cancelText?: string
  }) => {
    if (!isOpen) {
      return null
    }

    return (
      <div role="dialog" aria-modal="true">
        <h2>{title}</h2>
        <p>{message}</p>
        <Button type="button" onClick={onClose}>
          {cancelText}
        </Button>
        <Button
          type="button"
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmText}
        </Button>
      </div>
    )
  },
}))

function renderPage() {
  return render(
    <AppMantineProvider>
      <AnnouncementsPage />
    </AppMantineProvider>,
  )
}

const publishedAnnouncement: AdminAnnouncementSummary = {
  id: 'announcement-1',
  type: 'system',
  title: '系统升级通知',
  message: '今晚 23:00 会进行短暂维护。',
  expires_at: '2026-05-10T09:30:00.000Z',
  published_at: '2026-05-09T08:30:00.000Z',
  updated_at: '2026-05-09T08:30:00.000Z',
  target_user_count: 3,
}

describe('AnnouncementsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListAnnouncements.mockResolvedValue([])
  })

  it('标题或正文为空时阻止提交并提示错误', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: '发布公告' }))

    expect(mockBroadcastNotification).not.toHaveBeenCalled()
    expect(mockShowError).toHaveBeenCalledWith('内容不完整', '请填写公告标题和正文')
  })

  it('提交成功时发送系统公告并显示触达结果', async () => {
    const user = userEvent.setup()
    const response: AdminNotificationBroadcastResponse = {
      announcement_id: 'announcement-1',
      success: true,
      created_count: 3,
      target_user_count: 3,
      published_at: '2026-05-09T08:30:00.000Z',
    }
    mockBroadcastNotification.mockResolvedValue(response)

    renderPage()

    await user.type(screen.getByRole('textbox', { name: '公告标题' }), '系统升级通知')
    await user.type(screen.getByRole('textbox', { name: '公告正文' }), '今晚 23:00 会进行短暂维护。')
    fireEvent.change(screen.getByLabelText('过期时间（可选）'), {
      target: { value: '2026-05-10T09:30' },
    })

    await user.click(screen.getByRole('button', { name: '发布公告' }))

    await waitFor(() => {
      expect(mockBroadcastNotification).toHaveBeenCalledWith({
        title: '系统升级通知',
        message: '今晚 23:00 会进行短暂维护。',
        type: 'system',
        expires_at: new Date('2026-05-10T09:30').toISOString(),
      })
    })

    expect(mockShowSuccess).toHaveBeenCalledWith('公告已发布', '已向 3 位用户发送通知')
    expect(await screen.findByText('触达用户数：3')).toBeInTheDocument()
  })

  it('可以加载已发布公告并进入编辑模式', async () => {
    const user = userEvent.setup()
    mockListAnnouncements.mockResolvedValue([publishedAnnouncement])

    renderPage()

    expect(await screen.findByText('系统升级通知')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '编辑' }))

    expect(await screen.findByRole('button', { name: '保存修改' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '公告标题' })).toHaveValue('系统升级通知')
    expect(screen.getByRole('textbox', { name: '公告正文' })).toHaveValue('今晚 23:00 会进行短暂维护。')
  })

  it('编辑已发布公告时调用更新接口并刷新列表', async () => {
    const user = userEvent.setup()
    mockListAnnouncements
      .mockResolvedValueOnce([publishedAnnouncement])
      .mockResolvedValueOnce([
        {
          ...publishedAnnouncement,
          title: '系统升级时间调整',
          message: '维护时间改到明天下午 3 点。',
          target_user_count: 2,
          updated_at: '2026-05-10T08:30:00.000Z',
        },
      ])
    mockUpdateAnnouncement.mockResolvedValue({
      ...publishedAnnouncement,
      title: '系统升级时间调整',
      message: '维护时间改到明天下午 3 点。',
      target_user_count: 2,
      updated_at: '2026-05-10T08:30:00.000Z',
    })

    renderPage()

    await screen.findByText('系统升级通知')
    await user.click(screen.getByRole('button', { name: '编辑' }))
    await user.clear(screen.getByRole('textbox', { name: '公告标题' }))
    await user.type(screen.getByRole('textbox', { name: '公告标题' }), '系统升级时间调整')
    await user.clear(screen.getByRole('textbox', { name: '公告正文' }))
    await user.type(screen.getByRole('textbox', { name: '公告正文' }), '维护时间改到明天下午 3 点。')

    await user.click(screen.getByRole('button', { name: '保存修改' }))

    await waitFor(() => {
      expect(mockUpdateAnnouncement).toHaveBeenCalledWith('announcement-1', {
        title: '系统升级时间调整',
        message: '维护时间改到明天下午 3 点。',
        expires_at: publishedAnnouncement.expires_at,
      })
    })

    expect(mockShowSuccess).toHaveBeenCalledWith('公告已更新', '已同步更新当前保留的 2 条公告通知')
    expect(await screen.findByText('系统升级时间调整')).toBeInTheDocument()
  })

  it('删除已发布公告时调用删除接口', async () => {
    const user = userEvent.setup()
    mockListAnnouncements
      .mockResolvedValueOnce([publishedAnnouncement])
      .mockResolvedValueOnce([])
    mockDeleteAnnouncement.mockResolvedValue({
      success: true,
      deleted_count: 3,
      message: '公告已删除',
    })

    renderPage()

    await screen.findByText('系统升级通知')
    await user.click(screen.getByRole('button', { name: '删除' }))
    await user.click(await screen.findByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(mockDeleteAnnouncement).toHaveBeenCalledWith('announcement-1')
    })

    expect(mockShowSuccess).toHaveBeenCalledWith('公告已删除', '已删除当前保留的 3 条公告通知')
    expect(await screen.findByText('暂无已发布公告，发布后的公告会出现在这里，方便继续编辑和删除。')).toBeInTheDocument()
  })

  it('提交失败时展示错误提示', async () => {
    const user = userEvent.setup()
    mockBroadcastNotification.mockRejectedValue(new Error('服务暂时不可用'))

    renderPage()

    await user.type(screen.getByRole('textbox', { name: '公告标题' }), '异常通知')
    await user.type(screen.getByRole('textbox', { name: '公告正文' }), '这次请求会失败。')
    await user.click(screen.getByRole('button', { name: '发布公告' }))

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('发布失败', '服务暂时不可用')
    })
  })
})
