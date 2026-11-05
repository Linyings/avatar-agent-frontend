import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter } from 'react-router-dom'
import OAuthCallbackPage from './OAuthCallbackPage'
import { useAuth } from '@/features/auth'
import { authService } from '@/features/auth/services/authService'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/features/auth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/features/auth/services/authService', () => ({
  authService: {
    exchangeOAuthTicket: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}))

const tokenResponse = {
  message: 'OAuth login complete',
  success: true,
  user_id: 'user-1',
  username: 'narrato',
  email: 'user@example.com',
  tokens: {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    token_type: 'Bearer',
    expires_in: 3600,
  },
}

const user = {
  user_id: 'user-1',
  username: 'narrato',
  email: 'user@example.com',
  display_name: 'Narrato User',
  avatar_url: null,
  timezone: 'Asia/Shanghai',
  language: 'zh',
  is_active: true,
  is_verified: true,
  is_admin: false,
  email_verified_at: null,
  created_at: '2026-01-01T00:00:00Z',
  last_login_at: '2026-01-01T00:00:00Z',
}

describe('OAuthCallbackPage', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('continues to the backend-issued desktop authorization destination', async () => {
    vi.mocked(useAuth).mockReturnValue({
      updateUser: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(authService.exchangeOAuthTicket).mockResolvedValue({
      ...tokenResponse,
      redirect_path: '/desktop/authorize?request_id=req-1&state=state-1&locale=zh-CN',
    })
    vi.mocked(authService.getCurrentUser).mockResolvedValue(user)

    render(
      <MemoryRouter initialEntries={['/auth/oauth/callback?ticket=ticket-1']}>
        <MantineProvider>
          <OAuthCallbackPage />
        </MantineProvider>
      </MemoryRouter>,
    )

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(
      '/desktop/authorize?request_id=req-1&state=state-1&locale=zh-CN',
      { replace: true },
    ))
  })

  it('rejects an unsafe backend-issued destination', async () => {
    vi.mocked(useAuth).mockReturnValue({
      updateUser: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(authService.exchangeOAuthTicket).mockResolvedValue({
      ...tokenResponse,
      redirect_path: 'https://attacker.example',
    })
    vi.mocked(authService.getCurrentUser).mockResolvedValue(user)

    render(
      <MemoryRouter initialEntries={['/auth/oauth/callback?ticket=ticket-2']}>
        <MantineProvider>
          <OAuthCallbackPage />
        </MantineProvider>
      </MemoryRouter>,
    )

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }))
  })
})
