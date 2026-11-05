import { MantineProvider, Menu } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UserMenu from './UserMenu'
import { useAuth } from '../contexts/AuthContext'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

const baseUser = {
  user_id: 'user-1',
  username: '张三',
  email: 'zhangsan@example.com',
  display_name: '张三',
  avatar_url: null,
  is_active: true,
  is_verified: true,
  is_admin: false,
  timezone: 'Asia/Shanghai',
  language: 'zh-CN',
  created_at: '2026-04-26T00:00:00.000Z',
}

function renderUserMenu(extraItems?: React.ReactNode) {
  return render(
    <MantineProvider>
      <UserMenu extraItems={extraItems} />
    </MantineProvider>
  )
}

describe('UserMenu', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders a fallback avatar for Chinese display names without Latin1 base64 errors', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: baseUser,
      isAuthenticated: true,
      isLoading: false,
      token: 'token',
      isAdmin: false,
      isInitialized: true,
      login: vi.fn(),
      register: vi.fn(),
      completeDesktopLogin: vi.fn(),
      logout: vi.fn(),
      refreshToken: vi.fn(),
      updateUser: vi.fn(),
    })

    expect(() => renderUserMenu()).not.toThrow()
    expect(screen.getByText('张三')).toBeInTheDocument()
  })

  it('renders optional account-menu items with one divider before logout', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: baseUser,
      isAuthenticated: true,
      isLoading: false,
      token: 'token',
      isAdmin: false,
      isInitialized: true,
      login: vi.fn(),
      register: vi.fn(),
      completeDesktopLogin: vi.fn(),
      logout: vi.fn(),
      refreshToken: vi.fn(),
      updateUser: vi.fn(),
    })
    const user = userEvent.setup()
    renderUserMenu(<Menu.Item>检查更新</Menu.Item>)

    await user.click(screen.getByRole('button'))

    expect(await screen.findByText('检查更新')).toBeInTheDocument()
    expect(screen.getAllByRole('separator', { hidden: true })).toHaveLength(1)
  })
})
