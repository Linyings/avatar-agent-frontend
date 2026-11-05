import { authenticatedFetch } from '@/features/auth/services/authService'
import type {
  AdminAnnouncementDeleteResponse,
  AdminAnnouncementSummary,
  AdminAnnouncementUpdateRequest,
  AdminNotificationBroadcastRequest,
  AdminNotificationBroadcastResponse,
} from '@/features/admin/types/notification'

const getApiBaseUrl = (): string => {
  return import.meta.env.VITE_API_BASE_URL || ''
}

class HttpClient {
  private baseUrl: string

  constructor() {
    this.baseUrl = getApiBaseUrl()
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {})
    }

    const response = await authenticatedFetch(url, {
      ...options,
      headers,
    })

    if (!response.ok) {
      let errorMessage = `请求失败（${response.status}）`

      try {
        const errorData = await response.json()
        errorMessage = errorData.message || errorData.detail || errorMessage
      } catch {
        // ignore json parse failure and keep fallback message
      }

      const error = new Error(errorMessage) as Error & { status?: number }
      error.status = response.status
      throw error
    }

    const contentType = response.headers.get('content-type')
    if (contentType && contentType.includes('application/json')) {
      return await response.json()
    }

    return {} as T
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'GET',
    })
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    })
  }
}

const httpClient = new HttpClient()

export const adminNotificationService = {
  async broadcastNotification(
    data: AdminNotificationBroadcastRequest
  ): Promise<AdminNotificationBroadcastResponse> {
    return await httpClient.post<AdminNotificationBroadcastResponse>('/api/v1/admin/notifications/broadcast', data)
  },

  async listAnnouncements(): Promise<AdminAnnouncementSummary[]> {
    return await httpClient.get<AdminAnnouncementSummary[]>('/api/v1/admin/notifications/announcements')
  },

  async updateAnnouncement(
    announcementId: string,
    data: AdminAnnouncementUpdateRequest,
  ): Promise<AdminAnnouncementSummary> {
    return await httpClient.put<AdminAnnouncementSummary>(`/api/v1/admin/notifications/announcements/${encodeURIComponent(announcementId)}`, data)
  },

  async deleteAnnouncement(announcementId: string): Promise<AdminAnnouncementDeleteResponse> {
    return await httpClient.delete<AdminAnnouncementDeleteResponse>(`/api/v1/admin/notifications/announcements/${encodeURIComponent(announcementId)}`)
  },
}

export default adminNotificationService
