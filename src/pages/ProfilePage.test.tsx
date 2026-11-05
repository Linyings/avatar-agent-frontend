import { useMantineColorScheme } from '@mantine/core'
import { render, screen, waitFor } from '@testing-library/react'
import ProfilePage from '@/pages/ProfilePage'
import { authService } from '@/features/auth/services/authService'
import type { UserProfile } from '@/features/auth/types/auth'
import { APP_COLOR_SCHEME_KEY, AppMantineProvider } from '@/shared/mantine/AppMantineProvider'

vi.mock('@/features/auth', () => ({
  useAuth: () => ({
    user: mockUser,
    updateUser: vi.fn(),
  }),
}))

vi.mock('@/features/auth/services/authService', () => ({
  authService: {
    getUserSettings: vi.fn(),
    updateProfile: vi.fn(),
    updateUserSettings: vi.fn(),
    updatePassword: vi.fn(),
  },
}))

const mockUser: UserProfile = {
  user_id: 'user-1',
  username: 'testuser',
  email: 'test@example.com',
  display_name: '测试用户',
  avatar_url: null,
  timezone: 'Asia/Shanghai',
  language: 'zh',
  is_active: true,
  is_verified: true,
  is_admin: false,
  email_verified_at: null,
  created_at: '2026-04-20T00:00:00.000Z',
  last_login_at: null,
}

function ColorSchemeProbe() {
  const { colorScheme } = useMantineColorScheme()

  return <div>当前主题:{colorScheme}</div>
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    document.documentElement.removeAttribute('data-mantine-color-scheme')
  })

  it('进入个人资料页时不会用用户设置里的主题覆盖当前全局主题', async () => {
    vi.mocked(authService.getUserSettings).mockResolvedValue({
      user_id: mockUser.user_id,
      preferences: {
        theme: 'light',
        auto_save: true,
      },
      notification_settings: {
        email_notifications: true,
      },
      updated_at: '2026-04-24T00:00:00.000Z',
    })
    localStorage.setItem(APP_COLOR_SCHEME_KEY, 'dark')

    render(
      <AppMantineProvider>
        <ColorSchemeProbe />
        <ProfilePage />
      </AppMantineProvider>,
    )

    await waitFor(() => {
      expect(authService.getUserSettings).toHaveBeenCalled()
    })

    expect(screen.getByText('当前主题:dark')).toBeInTheDocument()
    expect(localStorage.getItem(APP_COLOR_SCHEME_KEY)).toBe('dark')
    expect(document.documentElement).toHaveAttribute('data-mantine-color-scheme', 'dark')
  })

  it('在宽屏资料页中提供右侧设置栏，避免内容只堆在左侧', async () => {
    vi.mocked(authService.getUserSettings).mockResolvedValue({
      user_id: mockUser.user_id,
      preferences: {
        theme: 'dark',
        auto_save: true,
      },
      notification_settings: {
        email_notifications: true,
      },
      updated_at: '2026-04-24T00:00:00.000Z',
    })

    render(
      <AppMantineProvider>
        <ProfilePage />
      </AppMantineProvider>,
    )

    await waitFor(() => {
      expect(authService.getUserSettings).toHaveBeenCalled()
    })

    expect(screen.getByTestId('profile-content-grid')).toBeInTheDocument()
    expect(screen.getByTestId('profile-primary-column')).toBeInTheDocument()
    expect(screen.getByTestId('profile-side-column')).toBeInTheDocument()
    expect(screen.getByTestId('profile-side-column')).toHaveTextContent('账户信息')
    expect(screen.getByTestId('profile-side-column')).toHaveTextContent('偏好设置')
    expect(screen.getByTestId('profile-side-column')).toHaveTextContent('安全设置')
  })
})
