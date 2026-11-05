import { MantineProvider } from '@mantine/core'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import DashboardPage from './DashboardPage'
import { ProjectService } from '@/features/projects'
import { notificationService } from '@/shared/services/notificationService'
import { NotificationType, type NotificationResponse } from '@/shared/types/system'

vi.mock('@/features/projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/projects')>()

  return {
    ...actual,
    ProjectService: {
      getProjects: vi.fn(),
    },
  }
})

vi.mock('@/shared/services/notificationService', () => ({
  notificationService: {
    getUserNotifications: vi.fn(),
  },
}))

vi.mock('@/shared/hooks/useProjectPreviewUrl', () => ({
  useProjectPreviewUrl: () => null,
}))

function renderPage() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('DashboardPage announcements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ProjectService.getProjects).mockResolvedValue({
      projects: [],
      total: 0,
      has_more: false,
      page: 1,
      limit: 3,
    })
  })

  it('首页聚焦最近项目和公告，不再展示容易失真的统计卡片', async () => {
    vi.mocked(ProjectService.getProjects).mockResolvedValue({
      projects: [
        {
          id: 'project-1',
          owner_id: 'user-1',
          name: '洪水纪录片',
          is_public: false,
          tags: [],
          status: 'draft',
          created_at: '2026-05-09T08:00:00.000Z',
          updated_at: '2026-05-10T08:00:00.000Z',
          workflow: { mode: 'frame', status: 'draft', current_step: 'step_0_created', current_step_id: null, current_step_index: 0, revision: 1, steps: {}, stages: {} },
          artifacts: {},
          metadata: {},
        },
        {
          id: 'project-2',
          owner_id: 'user-1',
          name: '成片复盘',
          is_public: false,
          tags: [],
          status: 'completed',
          created_at: '2026-05-08T08:00:00.000Z',
          updated_at: '2026-05-10T07:00:00.000Z',
          workflow: { mode: 'frame', status: 'completed', current_step: 'step_14_completed', current_step_id: null, current_step_index: 14, revision: 1, steps: {}, stages: {} },
          artifacts: {},
          metadata: {},
        },
      ],
      total: 2,
      has_more: false,
      page: 1,
      limit: 3,
    })
    vi.mocked(notificationService.getUserNotifications).mockResolvedValue([])

    renderPage()

    expect(await screen.findByText('洪水纪录片')).toBeInTheDocument()
    expect(screen.getByText('成片复盘')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '公告栏' })).toBeInTheDocument()
    expect(screen.queryByText('完成/导出')).not.toBeInTheDocument()
    expect(screen.queryByText('按更新时间排序')).not.toBeInTheDocument()
    expect(screen.queryByText('可继续编辑')).not.toBeInTheDocument()
    expect(screen.queryByText('可复用成片')).not.toBeInTheDocument()
    expect(screen.queryByText('草稿')).not.toBeInTheDocument()
  })

  it('在右下角展示管理员公告而不是普通系统通知', async () => {
    const notifications: NotificationResponse[] = [
      {
        id: 'announcement-1',
        user_id: 'user-1',
        type: NotificationType.SYSTEM,
        title: '服务维护通知',
        message: '今晚 23:00 将进行系统维护。',
        data: { source: 'admin_announcement' },
        expires_at: null,
        is_read: false,
        read_at: null,
        created_at: '2026-05-09T08:00:00.000Z',
      },
      {
        id: 'system-1',
        user_id: 'user-1',
        type: NotificationType.SYSTEM,
        title: '普通系统消息',
        message: '这条不应进入公告栏。',
        data: { source: 'other' },
        expires_at: null,
        is_read: false,
        read_at: null,
        created_at: '2026-05-09T07:00:00.000Z',
      },
    ]
    vi.mocked(notificationService.getUserNotifications).mockResolvedValue(notifications)

    renderPage()

    expect(await screen.findByRole('heading', { name: '公告栏' })).toBeInTheDocument()
    expect(await screen.findByText('服务维护通知')).toBeInTheDocument()
    expect(screen.getByText('今晚 23:00 将进行系统维护。')).toBeInTheDocument()
    expect(screen.queryByText('普通系统消息')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(notificationService.getUserNotifications).toHaveBeenCalledWith({
        type: NotificationType.SYSTEM,
        limit: 20,
        offset: 0,
      })
    })
  })

  it('点击公告摘要后可以阅读完整公告正文', async () => {
    const fullMessage = [
      '亲爱的用户：',
      '',
      '新版本已正式升级为 Credit 计费方式。',
      '',
      '原账户 tokens 已按规则完成转换，并为每位付费用户额外补偿 2500 credit。',
    ].join('\n')

    vi.mocked(notificationService.getUserNotifications).mockResolvedValue([
      {
        id: 'announcement-1',
        user_id: 'user-1',
        type: NotificationType.SYSTEM,
        title: '新版本计费方式升级通知',
        message: fullMessage,
        data: { source: 'admin_announcement' },
        expires_at: null,
        is_read: false,
        read_at: null,
        created_at: '2026-05-09T08:00:00.000Z',
      },
    ])

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '查看公告：新版本计费方式升级通知' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('新版本计费方式升级通知')).toBeInTheDocument()
    expect(
      within(dialog).getByText((_, element) => element?.tagName.toLowerCase() === 'p' && element.textContent === fullMessage),
    ).toBeInTheDocument()
  })
})
