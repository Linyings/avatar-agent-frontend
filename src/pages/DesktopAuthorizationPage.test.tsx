import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter } from 'react-router-dom'
import DesktopAuthorizationPage, {
  followDesktopAuthorizationCallback,
} from './DesktopAuthorizationPage'
import { useAuth } from '@/features/auth'
import { authService } from '@/features/auth/services/authService'
import { I18nProvider } from '@/shared/i18n/I18nProvider'

vi.mock('@/features/auth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/features/auth/services/authService', () => ({
  authService: {
    authorizeDesktopRequest: vi.fn(),
  },
}))

const validCallbackResponse = {
  callback_url: 'narratoai://auth/callback?request_id=req-1&code=one-time&state=state-1',
}

function renderPage(
  path = '/desktop/authorize?request_id=req-1&state=state-1',
  onFollowCallback = vi.fn(),
  strict = false,
) {
  const page = (
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider initialLocale="en">
        <MantineProvider>
          <DesktopAuthorizationPage onFollowCallback={onFollowCallback} />
        </MantineProvider>
      </I18nProvider>
    </MemoryRouter>
  )
  return render(strict ? <StrictMode>{page}</StrictMode> : page)
}

describe('DesktopAuthorizationPage', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    localStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  it('uses Chinese authorization copy when the desktop locale is Chinese', async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    } as ReturnType<typeof useAuth>)

    const path = '/desktop/authorize?request_id=req-1&state=state-1&locale=zh-CN'
    window.history.replaceState({}, '', path)
    vi.mocked(authService.authorizeDesktopRequest).mockResolvedValue(validCallbackResponse)
    renderPage(path, vi.fn())

    expect(screen.getByRole('heading', { name: '继续 数字人口播 桌面端' })).toBeVisible()
    await waitFor(() => expect(authService.authorizeDesktopRequest).toHaveBeenCalledTimes(1))
  })

  it('automatically authorizes an authenticated browser request before following the server callback', async () => {
    const followCallback = vi.fn()
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    } as ReturnType<typeof useAuth>)
    vi.mocked(authService.authorizeDesktopRequest).mockResolvedValue(validCallbackResponse)

    const onFollowCallback = vi.fn()
    renderPage('/desktop/authorize?request_id=req-1&state=state-1', onFollowCallback)

    await waitFor(() => {
      expect(authService.authorizeDesktopRequest).toHaveBeenCalledTimes(1)
    })
    expect(onFollowCallback).toHaveBeenCalledTimes(1)
    expect(authService.authorizeDesktopRequest).toHaveBeenCalledWith('req-1', 'state-1')

    followDesktopAuthorizationCallback(
      'narratoai://auth/callback?request_id=req-1&code=one-time&state=state-1',
      followCallback,
    )
  })

  it('authorizes only once during the StrictMode setup-cleanup-setup cycle', async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    } as ReturnType<typeof useAuth>)
    vi.mocked(authService.authorizeDesktopRequest).mockResolvedValue(validCallbackResponse)

    renderPage('/desktop/authorize?request_id=req-1&state=state-1', vi.fn(), true)

    await waitFor(() => expect(authService.authorizeDesktopRequest).toHaveBeenCalledTimes(1))
  })

  it('retries desktop authorization after a failed automatic attempt', async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    } as ReturnType<typeof useAuth>)
    vi.mocked(authService.authorizeDesktopRequest)
      .mockRejectedValueOnce(new Error('request expired'))
      .mockResolvedValueOnce(validCallbackResponse)

    renderPage()

    await screen.findByText('request expired')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(authService.authorizeDesktopRequest).toHaveBeenCalledTimes(2))
  })

  it('rejects a non-NarratoAI callback URL', () => {
    expect(() => followDesktopAuthorizationCallback('https://attacker.example/callback', vi.fn()))
      .toThrow('Invalid desktop authorization callback')
  })
})
