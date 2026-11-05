// 视频相关类型定义

export interface VideoFile {
  file?: File
  duration: number
  size: number
  type: string
  name: string
  url?: string
  remoteUrl?: string
  remoteObjectKey?: string
  resolution?: string      // 新增: "720 x 1280"
  aspectRatio?: string     // 新增: "9 x 16"
  width?: number           // 新增: 原始宽度
  height?: number          // 新增: 原始高度
}

export interface VideoMetadata {
  width: number
  height: number
  duration: number
  framerate: number
  bitrate?: number
  format?: string
  resolution: string       // 新增: 分辨率字符串
  aspectRatio: string      // 新增: 长宽比字符串
}

export interface VideoProcessingStatus {
  isProcessing: boolean
  progress: number
  stage: 'uploading' | 'extracting_audio' | 'capturing_thumbnail' | 'uploading_thumbnail' | 'analyzing' | 'completed' | 'failed'
  error?: string
}

export interface AudioExtractionResult {
  audioUrl: string
  duration: number
  sampleRate: number
  format: string
}
