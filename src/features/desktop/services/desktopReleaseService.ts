/**
 * Whether the web frontend exposes the Windows desktop download entry points.
 * Temporarily disabled while the desktop client is validated internally.
 * Flip to \	rue\ to re-enable the download buttons.
 */
export const isWindowsDesktopDownloadEnabled = true

export interface WindowsDesktopRelease {
  platform: 'windows'
  architecture: 'x64'
  version: string
  file_name: string
  file_size: number
  published_at: string
  download_url: '/api/v1/desktop/download/windows'
}

const apiUrl = (path: string) => `${(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')}${path}`
const RFC3339_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

function hasValidRfc3339CalendarDate(value: string): boolean {
  const match = RFC3339_TIMESTAMP.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1) return false

  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= daysInMonth[month - 1]
}

function isWindowsDesktopRelease(value: unknown): value is WindowsDesktopRelease {
  if (!value || typeof value !== 'object') return false
  const release = value as Record<string, unknown>
  return release.platform === 'windows'
    && release.architecture === 'x64'
    && typeof release.version === 'string'
    && /^\d+\.\d+\.\d+$/.test(release.version)
    && typeof release.file_name === 'string'
    && release.file_name === `NarratoAI-PC-Setup-${release.version}.exe`
    && typeof release.file_size === 'number'
    && Number.isSafeInteger(release.file_size)
    && release.file_size > 0
    && typeof release.published_at === 'string'
    && hasValidRfc3339CalendarDate(release.published_at)
    && !Number.isNaN(Date.parse(release.published_at))
    && release.download_url === '/api/v1/desktop/download/windows'
}

export const getWindowsDownloadUrl = () => apiUrl('/api/v1/desktop/download/windows')

export const getServerWindowsDownloadUrl = () => apiUrl('/api/v1/desktop/download/windows?source=server')

export async function checkWindowsDownloadAvailability(): Promise<void> {
  const response = await fetch(getWindowsDownloadUrl(), { method: 'HEAD' })
  if (!response.ok) throw new Error('Windows installer is unavailable')
}

export async function getLatestWindowsRelease(): Promise<WindowsDesktopRelease> {
  const response = await fetch(apiUrl('/api/v1/desktop/releases/windows/latest'), {
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error('Windows installer is unavailable')
  const value: unknown = await response.json()
  if (!isWindowsDesktopRelease(value)) throw new Error('Invalid Windows release metadata')
  return value
}

export const formatDesktopPackageSize = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`
