import type { UserProfile } from '../types/auth'

interface DesktopAuthApi {
  getSession(): Promise<{ accessToken: string | null; user: UserProfile | null }>
  refresh(): Promise<{ accessToken: string | null }>
  logout(): Promise<void>
}

type DesktopWindow = Window & {
  narratoDesktop?: {
    auth?: DesktopAuthApi
  }
}

const getDesktopAuthApi = (): DesktopAuthApi | null => {
  if (typeof window === 'undefined') return null
  return (window as DesktopWindow).narratoDesktop?.auth ?? null
}

export const desktopAuthBridge = {
  isDesktop: (): boolean => getDesktopAuthApi() !== null,

  async getSession(): Promise<{ accessToken: string | null; user: UserProfile | null }> {
    const api = getDesktopAuthApi()
    if (!api) return { accessToken: null, user: null }
    return api.getSession()
  },

  async refresh(): Promise<{ accessToken: string | null }> {
    const api = getDesktopAuthApi()
    if (!api) return { accessToken: null }
    return api.refresh()
  },

  async logout(): Promise<void> {
    const api = getDesktopAuthApi()
    if (api) await api.logout()
  }
}
