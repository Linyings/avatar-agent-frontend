import type { NotificationType } from '@/shared/types/system'

export interface AdminNotificationBroadcastRequest {
  title: string
  message: string
  type?: NotificationType
  data?: Record<string, unknown>
  expires_at?: string | null
}

export interface AdminNotificationBroadcastResponse {
  announcement_id?: string
  success: boolean
  created_count: number
  target_user_count: number
  published_at: string
}

export interface AdminAnnouncementSummary {
  id: string
  type: NotificationType
  title: string
  message: string
  expires_at?: string | null
  published_at: string
  updated_at: string
  target_user_count: number
}

export interface AdminAnnouncementUpdateRequest {
  title: string
  message: string
  expires_at?: string | null
}

export interface AdminAnnouncementDeleteResponse {
  success: boolean
  deleted_count: number
  message: string
}
