import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SystemSettingsPage from '@/pages/admin/SystemSettingsPage'
import { I18nProvider } from '@/shared/i18n/I18nProvider'
import { AppMantineProvider } from '@/shared/mantine/AppMantineProvider'
import type { SystemSettingResponse } from '@/shared/types/system'

const mockLoadSettings = vi.fn()
const mockRefreshSettings = vi.fn()
const mockUpdateSetting = vi.fn()
let mockSettings: SystemSettingResponse[] = []

vi.mock('@/shared/hooks/useSystemSettings', () => ({
  useAdminSystemSettings: () => ({
    settings: mockSettings,
    loadSettings: mockLoadSettings,
    isLoading: false,
	    isSaving: false,
	    error: null,
	    createSetting: vi.fn(),
	    updateSetting: mockUpdateSetting,
	    deleteSetting: vi.fn(),
    refreshSettings: mockRefreshSettings,
    clearError: vi.fn(),
  }),
}))

vi.mock('@/shared/contexts/ToastContext', () => ({
  useToast: () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
  }),
}))

function renderPage() {
  return render(
    <AppMantineProvider>
      <MemoryRouter>
        <I18nProvider initialLocale="zh-CN">
          <SystemSettingsPage />
        </I18nProvider>
      </MemoryRouter>
    </AppMantineProvider>,
  )
}

describe('SystemSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSettings = []
    mockUpdateSetting.mockResolvedValue({} as SystemSettingResponse)
  })

  it('点击新增配置时以弹窗方式显示创建表单', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /新增配置/ }))

    const dialog = screen.getByRole('dialog', { name: '新增配置' })

    expect(dialog).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /配置键名/ })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /配置值 \(JSON\)/ })).toBeInTheDocument()
  })

  it('有配置项时使用顶部 tab 切换，避免左侧列表占用整列空间', () => {
    mockSettings = [
      {
        id: 'setting-1',
        key: 'case_video',
        value: {},
        description: '门户网站用于展示案例的素材',
        is_public: false,
        created_at: '2026-04-26T00:00:00.000Z',
        updated_at: '2026-04-26T00:00:00.000Z',
        updated_by: null,
      },
      {
        id: 'setting-2',
        key: 'tts_voices',
        value: { voices: [] },
        description: '内置音色',
        is_public: true,
        created_at: '2026-04-26T00:00:00.000Z',
        updated_at: '2026-04-26T00:00:00.000Z',
        updated_by: null,
      },
    ]

    renderPage()

    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /case_video/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /tts_voices/ })).toBeInTheDocument()
    expect(screen.queryByText('配置键列表')).not.toBeInTheDocument()
  })

  it('内置音色列表按基础音色和高级音色分组展示', async () => {
    mockSettings = [
      {
        id: 'setting-tts',
        key: 'tts_voices',
        value: {
          voices: [
            {
              name: '基础女声',
              uri: 'basic-uri',
              sample_url: 'https://example.com/basic.mp3',
              type: 'basic',
              gender: 'female',
              language: 'zh',
            },
            {
              name: '高级男声',
              uri: 'advanced-uri',
              sample_url: '',
              type: 'advanced',
              gender: 'male',
              language: 'en',
            },
          ],
        },
        description: '内置音色',
        is_public: true,
        created_at: '2026-04-26T00:00:00.000Z',
        updated_at: '2026-04-26T00:00:00.000Z',
        updated_by: null,
      },
    ]

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '内置音色列表' })).toBeInTheDocument()
    })

    expect(screen.getByRole('heading', { name: '基础音色' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '高级音色' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '基础女声' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '高级男声' })).toBeInTheDocument()
    expect(screen.getAllByText('女声').length).toBeGreaterThan(0)
    expect(screen.getAllByText('英文').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '播放预览' })).toBeInTheDocument()
  })

  it('内置音色列表支持按类型、性别和语言标签筛选展示', async () => {
    const user = userEvent.setup()
    mockSettings = [
      {
        id: 'setting-tts',
        key: 'tts_voices',
        value: {
          voices: [
            {
              name: '心中之城',
              uri: 'advanced-male-uri',
              sample_url: 'https://example.com/male.mp3',
              type: 'advanced',
              gender: 'male',
              language: 'zh',
            },
            {
              name: '温柔女声',
              uri: 'basic-female-uri',
              sample_url: '',
              type: 'basic',
              gender: 'female',
              language: 'zh',
            },
            {
              name: 'English Voice',
              uri: 'english-uri',
              sample_url: '',
              type: 'advanced',
              gender: 'female',
              language: 'en',
            },
          ],
        },
        description: '内置音色',
        is_public: true,
        created_at: '2026-04-26T00:00:00.000Z',
        updated_at: '2026-04-26T00:00:00.000Z',
        updated_by: null,
      },
    ]

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '心中之城' })).toBeInTheDocument()
    })

    await user.selectOptions(screen.getByRole('combobox', { name: '分组方式' }), 'gender')
    expect(screen.getByRole('heading', { name: '男声' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '女声' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '中文' }))

    expect(screen.getByRole('heading', { name: '心中之城' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '温柔女声' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'English Voice' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '男声' }))

    expect(screen.getByRole('heading', { name: '心中之城' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '温柔女声' })).not.toBeInTheDocument()
  })

  it('bgms 配置展示背景音乐专用管理区', async () => {
    mockSettings = [
      {
        id: 'setting-bgms',
        key: 'bgms',
        value: {
          bgms: [
            {
              id: 1,
              label: '悬疑铺底',
              fileName: '01-test.mp3',
              url: 'https://example.com/bgms/01-test.mp3',
            },
          ],
        },
        description: '背景音乐',
        is_public: true,
        created_at: '2026-04-26T00:00:00.000Z',
        updated_at: '2026-04-26T00:00:00.000Z',
        updated_by: null,
      },
    ]

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '背景音乐列表' })).toBeInTheDocument()
    })

    expect(screen.getByRole('tab', { name: /bgms/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /新增背景音乐/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '悬疑铺底' })).toBeInTheDocument()
    expect(screen.getByText('文件名：01-test.mp3')).toBeInTheDocument()
    expect(screen.getByText('https://example.com/bgms/01-test.mp3')).toBeInTheDocument()
  })
})
