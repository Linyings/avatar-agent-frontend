import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authService, authenticatedFetch, getOAuthStartUrl, tokenManager } from './authService'

const encodeBase64Url = (value: string): string => (
  btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
)

const makeJwt = (payload: Record<string, unknown>) => [
  encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
  encodeBase64Url(JSON.stringify(payload)),
  'signature',
].join('.')

const makeRefreshResponse = (accessToken: string) => new Response(
  JSON.stringify({
    access_token: accessToken,
    refresh_token: 'fresh-refresh-token',
    token_type: 'bearer',
    expires_in: 1800,
  }),
  { status: 200, headers: { 'Content-Type': 'application/json' } }
)

describe('getOAuthStartUrl', () => {
  it('includes the current frontend origin for multi-domain OAuth callbacks', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
    const startUrl = new URL(getOAuthStartUrl('github', '/projects'))

    expect(startUrl.pathname).toBe('/api/v1/auth/oauth/github/start')
    expect(startUrl.searchParams.get('redirect')).toBe('/projects')
    expect(startUrl.searchParams.get('frontend_origin')).toBe(window.location.origin)
    vi.unstubAllEnvs()
  })
})

describe('authService.login', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses the same-origin API path when no API base URL is configured', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      user_id: 'user-1',
      username: 'local-user',
      email: 'local@example.test',
      tokens: {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        token_type: 'bearer',
        expires_in: 1800,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    await authService.login({ email: 'local@example.test', password: 'test-password' })

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/auth/login',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

describe('authService.authorizeDesktopRequest', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('posts the original state with the current access token and returns the server callback', async () => {
    tokenManager.setTokens({
      access_token: 'desktop-access-token',
      refresh_token: 'browser-refresh-token',
      token_type: 'bearer',
      expires_in: 1800,
    })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      callback_url: 'narratoai://auth/callback?request_id=req-1&code=one-time&state=state-1',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    await expect(authService.authorizeDesktopRequest('req-1', 'state-1')).resolves.toEqual({
      callback_url: 'narratoai://auth/callback?request_id=req-1&code=one-time&state=state-1',
    })
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/auth/desktop/requests/req-1/authorize',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ state: 'state-1' }),
        headers: expect.objectContaining({ Authorization: 'Bearer desktop-access-token' }),
      }),
    )
  })
})

describe('authenticatedFetch', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('access token 已过期时会先刷新再发送业务请求', async () => {
    const expiredToken = makeJwt({
      type: 'access',
      exp: Math.floor(Date.now() / 1000) - 10,
    })
    tokenManager.setTokens({
      access_token: expiredToken,
      refresh_token: 'refresh-token',
      token_type: 'bearer',
      expires_in: 1800,
    })

    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(makeRefreshResponse('fresh-token'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const response = await authenticatedFetch('/api/protected', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    })

    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/v1/auth/refresh')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/protected')
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      Authorization: 'Bearer fresh-token',
    })
    expect(tokenManager.getAccessToken()).toBe('fresh-token')
  })

  it('业务请求返回 401 时会刷新 token 并重试一次原请求', async () => {
    const validToken = makeJwt({
      type: 'access',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    tokenManager.setTokens({
      access_token: validToken,
      refresh_token: 'refresh-token',
      token_type: 'bearer',
      expires_in: 1800,
    })

    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ error: 'Unauthorized', message: '无效的访问令牌', success: false }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      ))
      .mockResolvedValueOnce(makeRefreshResponse('fresh-token'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))

    const response = await authenticatedFetch('/api/protected', {
      method: 'POST',
      body: JSON.stringify({ retry: true }),
    })

    await expect(response.text()).resolves.toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: `Bearer ${validToken}`,
    })
    expect(String(fetchMock.mock.calls[1][0])).toContain('/api/v1/auth/refresh')
    expect(fetchMock.mock.calls[2][1]?.headers).toMatchObject({
      Authorization: 'Bearer fresh-token',
    })
  })

  it('缺少 access token 时不会发送业务请求', async () => {
    await expect(authenticatedFetch('/api/protected')).rejects.toThrow('缺少访问令牌，请先登录')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('disposes a failed 401 response body only before the refreshed retry', async () => {
    const validToken = makeJwt({ type: 'access', exp: Math.floor(Date.now() / 1000) + 3600 })
    tokenManager.setTokens({ access_token: validToken, refresh_token: 'refresh-token', token_type: 'bearer', expires_in: 1800 })
    const cancel = vi.fn()
    const unauthorized = new Response(new ReadableStream({ cancel }), { status: 401 })
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(unauthorized)
      .mockResolvedValueOnce(makeRefreshResponse('fresh-token'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))

    await authenticatedFetch('/api/protected')

    expect(cancel).toHaveBeenCalledOnce()
  })

  it('retains a failed 401 response body when a retry is disabled', async () => {
    const validToken = makeJwt({ type: 'access', exp: Math.floor(Date.now() / 1000) + 3600 })
    tokenManager.setTokens({ access_token: validToken, refresh_token: 'refresh-token', token_type: 'bearer', expires_in: 1800 })
    const cancel = vi.fn()
    const unauthorized = new Response(new ReadableStream({ cancel }), { status: 401 })
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(unauthorized)

    const response = await authenticatedFetch('/api/protected', {}, { retryOnUnauthorized: false })

    expect(response).toBe(unauthorized)
    expect(cancel).not.toHaveBeenCalled()
  })

  it('disposes the unreturned 401 response body when its caller aborts during refresh', async () => {
    const validToken = makeJwt({ type: 'access', exp: Math.floor(Date.now() / 1000) + 3600 })
    tokenManager.setTokens({ access_token: validToken, refresh_token: 'refresh-token', token_type: 'bearer', expires_in: 1800 })
    const cancel = vi.fn()
    const unauthorized = new Response(new ReadableStream({ cancel }), { status: 401 })
    let resolveRefresh: (value: Response) => void = () => undefined
    const refreshResponse = new Promise<Response>(resolve => { resolveRefresh = resolve })
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(unauthorized)
      .mockReturnValueOnce(refreshResponse)
    const controller = new AbortController()

    const request = authenticatedFetch('/api/protected', { signal: controller.signal })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    controller.abort()

    try {
      await expect(request).rejects.toMatchObject({ name: 'AbortError' })
      expect(cancel).toHaveBeenCalledOnce()
    } finally {
      resolveRefresh(makeRefreshResponse('fresh-token'))
    }

    await vi.waitFor(() => expect(tokenManager.getAccessToken()).toBe('fresh-token'))
  })

  it('lets one caller abort while another caller keeps the shared 401 refresh alive', async () => {
    const validToken = makeJwt({ type: 'access', exp: Math.floor(Date.now() / 1000) + 3600 })
    tokenManager.setTokens({ access_token: validToken, refresh_token: 'refresh-token', token_type: 'bearer', expires_in: 1800 })
    let resolveRefresh: (value: Response) => void = () => undefined
    const refreshResponse = new Promise<Response>(resolve => { resolveRefresh = resolve })
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockReturnValueOnce(refreshResponse)
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response('second', { status: 200 }))
    const controller = new AbortController()

    const aborted = authenticatedFetch('/api/first', { signal: controller.signal })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const continued = authenticatedFetch('/api/second')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    controller.abort()

    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' })
    resolveRefresh(makeRefreshResponse('fresh-token'))

    await expect(continued).resolves.toMatchObject({ status: 200 })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
