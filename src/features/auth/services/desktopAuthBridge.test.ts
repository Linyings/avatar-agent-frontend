import { afterEach, describe, expect, it, vi } from 'vitest'
import { desktopAuthBridge } from './desktopAuthBridge'
import { authService, tokenManager } from './authService'

const user = {
  user_id: 'user-1',
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

const originalDesktopApi = (window as typeof window & { narratoDesktop?: unknown }).narratoDesktop

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  Object.defineProperty(window, 'narratoDesktop', {
    configurable: true,
    value: originalDesktopApi,
  })
})

describe('desktopAuthBridge', () => {
  it('hydrates only in-memory credentials for a desktop session', async () => {
    const getSession = vi.fn().mockResolvedValue({ accessToken: 'desktop-access-token', user })
    Object.defineProperty(window, 'narratoDesktop', {
      configurable: true,
      value: {
        auth: {
          getSession,
          refresh: vi.fn(),
          logout: vi.fn(),
        },
      },
    })

    expect(desktopAuthBridge.isDesktop()).toBe(true)
    await tokenManager.hydrate()

    expect(getSession).toHaveBeenCalledOnce()
    expect(tokenManager.getAccessToken()).toBe('desktop-access-token')
    expect(tokenManager.getUser()).toEqual(user)
    expect(localStorage.getItem('auth_access_token')).toBeNull()
    expect(localStorage.getItem('auth_refresh_token')).toBeNull()
    expect(localStorage.getItem('auth_user')).toBeNull()
  })

  it('refreshes a desktop access token through the preload bridge', async () => {
    const refresh = vi.fn().mockResolvedValue({ accessToken: 'refreshed-desktop-access-token' })
    Object.defineProperty(window, 'narratoDesktop', {
      configurable: true,
      value: {
        auth: {
          getSession: vi.fn().mockResolvedValue({ accessToken: 'desktop-access-token', user }),
          refresh,
          logout: vi.fn(),
        },
      },
    })

    await tokenManager.hydrate()
    await authService.refreshToken()

    expect(refresh).toHaveBeenCalledOnce()
    expect(tokenManager.getAccessToken()).toBe('refreshed-desktop-access-token')
    expect(localStorage.getItem('auth_refresh_token')).toBeNull()
  })
})
