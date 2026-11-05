import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkWindowsDownloadAvailability,
  formatDesktopPackageSize,
  getServerWindowsDownloadUrl,
  getLatestWindowsRelease,
  getWindowsDownloadUrl,
  isWindowsDesktopDownloadEnabled,
} from './desktopReleaseService'

const validRelease = {
  platform: 'windows',
  architecture: 'x64',
  version: '0.2.4',
  file_name: 'NarratoAI-PC-Setup-0.2.4.exe',
  file_size: 129394278,
  published_at: '2026-08-03T12:00:00Z',
  download_url: '/api/v1/desktop/download/windows',
}

describe('desktopReleaseService', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/')
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('enables the public Windows desktop download entry points', () => {
    expect(isWindowsDesktopDownloadEnabled).toBe(true)
  })

  it('loads Windows release metadata', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(validRelease), { status: 200 }))

    await expect(getLatestWindowsRelease()).resolves.toMatchObject({ version: '0.2.4' })
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/desktop/releases/windows/latest',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('rejects non-successful release responses', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }))

    await expect(getLatestWindowsRelease()).rejects.toThrow('Windows installer is unavailable')
  })

  it('rejects release metadata with invalid fields', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      ...validRelease,
      file_name: 'untrusted-installer.exe',
    }), { status: 200 }))

    await expect(getLatestWindowsRelease()).rejects.toThrow('Invalid Windows release metadata')
  })

  it('rejects a non-RFC3339 publication timestamp', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      ...validRelease,
      published_at: 'August 3, 2026',
    }), { status: 200 }))

    await expect(getLatestWindowsRelease()).rejects.toThrow('Invalid Windows release metadata')
  })

  it('rejects an impossible RFC3339 calendar date', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      ...validRelease,
      published_at: '2026-02-30T12:00:00Z',
    }), { status: 200 }))

    await expect(getLatestWindowsRelease()).rejects.toThrow('Invalid Windows release metadata')
  })

  it('accepts a calendar-valid RFC3339 numeric-offset timestamp', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      ...validRelease,
      published_at: '2024-02-29T12:00:00+08:00',
    }), { status: 200 }))

    await expect(getLatestWindowsRelease()).resolves.toMatchObject({
      published_at: '2024-02-29T12:00:00+08:00',
    })
  })

  it.each([0, -1])('rejects a non-positive package size of %i bytes', async (fileSize) => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      ...validRelease,
      file_size: fileSize,
    }), { status: 200 }))

    await expect(getLatestWindowsRelease()).rejects.toThrow('Invalid Windows release metadata')
  })

  it('builds the stable download URL', () => {
    expect(getWindowsDownloadUrl()).toBe('https://api.example.test/api/v1/desktop/download/windows')
  })

  it('uses the server download URL for channel two', () => {
    expect(getServerWindowsDownloadUrl()).toBe(
      'https://api.example.test/api/v1/desktop/download/windows?source=server',
    )
  })

  it('checks Windows download availability with HEAD', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }))

    await expect(checkWindowsDownloadAvailability()).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/desktop/download/windows',
      { method: 'HEAD' },
    )
  })

  it('rejects a non-successful Windows download availability response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }))

    await expect(checkWindowsDownloadAvailability()).rejects.toThrow('Windows installer is unavailable')
  })

  it('rejects a Windows download availability network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('network unavailable'))

    await expect(checkWindowsDownloadAvailability()).rejects.toThrow('network unavailable')
  })

  it('formats package size', () => {
    expect(formatDesktopPackageSize(129394278)).toBe('123 MB')
  })
})
