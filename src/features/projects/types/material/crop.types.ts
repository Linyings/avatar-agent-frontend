/**
 * 视频裁剪相关类型定义
 */

/**
 * 视频裁剪设置
 */
export interface VideoCropSettings {
  /** 起始时间（秒） */
  startTime: number
  /** 结束时间（秒） */
  endTime: number
}

/**
 * 视频裁剪状态
 */
export interface VideoCropStatus {
  /** 是否正在处理 */
  isProcessing: boolean
  /** 进度（0-100） */
  progress: number
  /** 当前阶段 */
  stage: 'idle' | 'initializing' | 'processing' | 'finalizing' | 'completed' | 'failed'
  /** 状态消息 */
  message?: string
  /** 错误消息 */
  error?: string
}

/**
 * 视频裁剪结果
 */
export interface VideoCropResult {
  /** 裁剪后的视频 Blob */
  blob: Blob
  /** 裁剪后的时长（秒） */
  duration: number
  /** 文件大小（字节） */
  size: number
  /** MIME 类型 */
  type: string
}
