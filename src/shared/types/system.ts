// 系统支持API相关的TypeScript类型定义

// ====== 枚举类型 ======

// 通知类型枚举
export const NotificationType = {
  SYSTEM: 'system',
  PROJECT: 'project',
  PAYMENT: 'payment',
  COLLABORATION: 'collaboration',
  SECURITY: 'security'
} as const
export type NotificationType = typeof NotificationType[keyof typeof NotificationType]

// 任务状态枚举
export const JobStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
} as const
export type JobStatus = typeof JobStatus[keyof typeof JobStatus]

// 任务类型枚举
export const JobType = {
  VIDEO_ANALYSIS: 'video_analysis',
  SCRIPT_GENERATION: 'script_generation',
  TTS_SYNTHESIS: 'tts_synthesis',
  VIDEO_COMPOSITION: 'video_composition',
  SUBTITLE_EXTRACTION: 'subtitle_extraction'
} as const
export type JobType = typeof JobType[keyof typeof JobType]

// ====== 系统配置相关类型 ======

export interface SystemSettingCreateRequest {
  key: string
  value: object
  description?: string | null
  is_public?: boolean
}

export interface SystemSettingUpdateRequest {
  value?: object | null
  description?: string | null
  is_public?: boolean | null
}

export interface SystemSettingResponse {
  key: string
  value: object
  description?: string | null
  is_public?: boolean
  id: string
  updated_by?: string | null
  created_at: string
  updated_at: string
}

export interface PublicSystemSettingsResponse {
  settings: Record<string, object>
}

// ====== 通知相关类型 ======

export interface NotificationCreateRequest {
  type: NotificationType
  title: string
  message: string
  data?: object
  expires_at?: string | null
  user_id: string
}

export interface NotificationBatchCreateRequest {
  user_ids: string[]
  type: NotificationType
  title: string
  message: string
  data?: object
  expires_at?: string | null
}

export interface NotificationResponse {
  type: NotificationType
  title: string
  message: string
  data?: object
  expires_at?: string | null
  announcement_id?: string | null
  id: string
  user_id: string
  is_read: boolean
  read_at?: string | null
  created_at: string
}

export interface NotificationStatsResponse {
  total_count: number
  unread_count: number
  read_count: number
  by_type: Record<string, number>
  total?: number
  unread?: number
  read?: number
}

// ====== 异步任务相关类型 ======

export interface ProcessingJobCreateRequest {
  job_type: JobType
  input_data?: object
  priority?: number
  max_retries?: number
  project_id?: string | null
}

export interface ProcessingJobUpdateRequest {
  status?: JobStatus
  progress_percentage?: number | null
  output_data?: object | null
  error_message?: string | null
}

export interface ProcessingJobResponse {
  job_type: JobType
  input_data?: object
  priority?: number
  max_retries?: number
  id: string
  user_id?: string | null
  project_id?: string | null
  status: JobStatus
  progress_percentage: number
  output_data?: object
  error_message?: string | null
  retry_count: number
  started_at?: string | null
  completed_at?: string | null
  created_at: string
  updated_at: string
}

export interface ProcessingJobStatsResponse {
  total_count: number
  by_status: Record<string, number>
  by_type: Record<string, number>
}

// ====== 通用响应类型 ======

export interface MessageResponse {
  message: string
  success?: boolean
}

// ====== HTTP错误类型 ======

export interface ValidationError {
  loc: (string | number)[]
  msg: string
  type: string
}

export interface HTTPValidationError {
  detail?: ValidationError[]
}

// ====== 查询参数类型 ======

export interface SystemSettingsQueryParams {
  is_public?: boolean
  key_pattern?: string
  [key: string]: string | number | boolean | undefined
}

export interface NotificationsQueryParams {
  type?: NotificationType
  is_read?: boolean
  limit?: number
  offset?: number
  [key: string]: string | number | boolean | undefined
}

export interface ProcessingJobsQueryParams {
  job_type?: JobType
  status?: JobStatus
  limit?: number
  offset?: number
  [key: string]: string | number | boolean | undefined
}

// ====== 扩展类型（用于前端状态管理） ======

export interface NotificationWithActions extends NotificationResponse {
  // 是否正在处理操作（如标记已读）
  isProcessing?: boolean
  // 是否新通知（用于动画效果）
  isNew?: boolean
}

export interface ProcessingJobWithProgress extends ProcessingJobResponse {
  // 是否正在轮询更新
  isPolling?: boolean
  // 预计完成时间
  estimated_completion?: string | null
}

// ====== API响应包装类型 ======

export interface ApiResponse<T> {
  data: T
  message?: string
  success?: boolean
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  size: number
  pages: number
}

// ====== 权限相关类型 ======

export interface UserPermissions {
  can_manage_settings: boolean
  can_create_notifications: boolean
  can_view_all_jobs: boolean
  can_manage_users: boolean
}

// ====== 系统状态类型 ======

export interface SystemHealth {
  status: 'healthy' | 'warning' | 'error'
  database: boolean
  redis: boolean
  storage: boolean
  external_apis: Record<string, boolean>
  last_check: string
}
