import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from './AuthContext'

const mocks = vi.hoisted(() => ({
  authService: {
    getCurrentUser: vi.fn(),
    autoRefreshToken: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
  },
  tokenManager: {
    hydrate: vi.fn(),
    getAccessToken: vi.fn(),
    getUser: vi.fn(),
    setUser: vi.fn(),
    clearTokens: vi.fn(),
  },
}))

vi.mock('../services/authService', () => ({
  default: mocks.authService,
  tokenManager: mocks.tokenManager,
}))

const user = {
  user_id: 'desktop-user-1',
  username: 'desktop-user',
  email: 'desktop@example.com',
  display_name: 'Desktop User',
  avatar_url: null,
  timezone: 'Asia/Shanghai',
  language: 'zh-CN',
  is_active: true,
  is_verified: true,
  is_admin: false,
  email_verified_at: null,
  created_at: '2026-07-18T00:00:00.000Z',
  last_login_at: null,
}

function CompletionProbe() {
  const auth = useAuth()
  return (
    <>
      <button type="button" onClick={() => void auth.completeDesktopLogin()}>
        Complete desktop login
      </button>
      <span>{auth.user?.username || 'anonymous'}</span>
    </>
  )
}

describe('AuthProvider desktop login completion', () => {
  it('hydrates the desktop session and fetches the authenticated user after the browser callback', async () => {
    mocks.tokenManager.hydrate.mockResolvedValue(undefined)
    mocks.tokenManager.getAccessToken.mockReturnValue('desktop-access-token')
    mocks.tokenManager.getUser.mockReturnValue(user)
    mocks.authService.getCurrentUser.mockResolvedValue(user)

    render(
      <AuthProvider>
        <CompletionProbe />
      </AuthProvider>,
    )

    await waitFor(() => expect(mocks.tokenManager.hydrate).toHaveBeenCalled())
    mocks.tokenManager.hydrate.mockClear()
    mocks.authService.getCurrentUser.mockClear()

    await userEvent.click(screen.getByRole('button', { name: 'Complete desktop login' }))

    await waitFor(() => {
      expect(mocks.tokenManager.hydrate).toHaveBeenCalledOnce()
      expect(mocks.authService.getCurrentUser).toHaveBeenCalledOnce()
    })
    expect(screen.getByText('desktop-user')).toBeInTheDocument()
  })
})
