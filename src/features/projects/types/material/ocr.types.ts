// OCR 字幕提取相关类型定义

/**
 * OCR 提取模式
 * - 'asr': 语音识别模式（原有功能）
 * - 'ocr': 硬字幕识别模式（从视频画面提取字幕）
 */
export type OcrExtractionMode = 'asr' | 'ocr'

/**
 * 框选区域坐标
 * 用于指定视频中字幕出现的矩形区域
 */
export interface FrameSelectionArea {
  x: number        // 相对于视频宽度的像素坐标
  y: number        // 相对于视频高度的像素坐标
  width: number    // 框选区域宽度（像素）
  height: number   // 框选区域高度（像素）
  sourceWidth?: number   // 原始视频宽度（像素）
  sourceHeight?: number  // 原始视频高度（像素）
}

/**
 * 框选区域（标准化坐标，0-1）
 * 用于跨不同分辨率视频时保持框选位置一致性
 */
export interface NormalizedSelectionArea {
  x: number        // 0-1 之间，相对于视频宽度的比例
  y: number        // 0-1 之间，相对于视频高度的比例
  width: number    // 0-1 之间，相对于视频宽度的比例
  height: number   // 0-1 之间，相对于视频高度的比例
}

/**
 * 单帧提取结果
 */
export interface ExtractedFrame {
  id: string                    // 帧唯一标识
  timestamp: number             // 时间戳（秒）
  imageUrl: string              // Base64 或 Blob URL
  blob?: Blob                   // 图像 Blob 数据
  width: number                 // 帧宽度
  height: number                // 帧高度
  selectionArea?: FrameSelectionArea  // 裁剪区域（如果已裁剪）
}

/**
 * 合并的帧组
 * 多个帧合并为一张大图（如 10 张帧合并为 5x2 网格）
 */
export interface MergedFrameGroup {
  id: string                    // 帧组唯一标识
  startTime: number             // 起始时间（秒）
  endTime: number               // 结束时间（秒）
  frameCount: number            // 包含的帧数量
  frames: ExtractedFrame[]      // 原始帧列表
  mergedImageUrl: string        // 合并后的大图 URL
  mergedBlob?: Blob             // 合并后的 Blob
  layout: {                     // 布局信息
    columns: number             // 列数
    rows: number                // 行数
    padding: number             // 帧之间的间距（像素）
    orientation: 'grid' | 'vertical'  // 布局方向
  }
}

/**
 * OCR 提取配置
 */
export interface OcrExtractionSettings {
  mode: OcrExtractionMode       // 提取模式
  language?: string             // 识别语言（如 'zh', 'en'）
  frameRate?: number            // 帧率（每秒提取多少帧，默认 2）
  minConfidence?: number        // 最小置信度阈值（0-1，默认 0.7）
  selectionArea?: FrameSelectionArea | null  // 框选区域（null 表示全屏）
  framesPerGroup?: number       // 每组合并的帧数（默认 10）
  mergeLayout?: {               // 合并布局配置
    columns: number             // 列数（默认 5）
    rows: number                // 行数（默认 2）
    padding: number             // 间距（像素，默认 4）
  }
}

/**
 * OCR 帧提取状态
 */
export interface OcrFrameExtractionStatus {
  isProcessing: boolean
  progress: number              // 0-100
  stage: 'selecting' | 'extracting' | 'merging' | 'previewing' | 'uploading' | 'recognizing' | 'completed' | 'failed'
  currentFrame?: number         // 当前处理的帧索引
  totalFrames?: number          // 总帧数
  error?: string
  message?: string
}

/**
 * OCR 识别结果（单帧）
 */
export interface OcrFrameResult {
  frameId: string               // 对应的帧 ID
  timestamp: number             // 时间戳（秒）
  text: string                  // 识别出的文本
  confidence: number            // 置信度（0-1）
  boundingBoxes?: OcrBoundingBox[]  // 文本框位置信息
}

/**
 * OCR 文本框位置信息
 */
export interface OcrBoundingBox {
  text: string                  // 文本内容
  x: number                     // 左上角 x 坐标
  y: number                     // 左上角 y 坐标
  width: number                 // 宽度
  height: number                // 高度
  confidence: number            // 该文本框的置信度
}

/**
 * OCR 批量识别结果
 */
export interface OcrBatchResult {
  frameResults: OcrFrameResult[]  // 所有帧的识别结果
  totalFrames: number             // 总帧数
  successCount: number            // 成功识别的帧数
  failureCount: number            // 失败的帧数
  averageConfidence: number       // 平均置信度
  processingTime: number          // 处理时间（毫秒）
}

/**
 * 帧提取选项
 */
export interface FrameExtractionOptions {
  frameInterval?: number        // 帧间隔（秒，默认 0.5 即每秒 2 帧）
  framesPerGroup?: number       // 每组帧数（默认 10）
  thumbnailWidth?: number       // 单帧宽度（默认 640）
  thumbnailHeight?: number      // 单帧高度（可选，保持宽高比）
  quality?: number              // 图像质量（0-1，默认 0.95）
  format?: 'jpeg' | 'png' | 'webp'  // 图像格式（默认 'jpeg'）
  preserveSourceResolution?: boolean // 是否使用视频原始分辨率
}

/**
 * 帧合并选项
 */
export interface FrameMergeOptions {
  columns?: number              // 列数（默认 5）
  rows?: number                 // 行数（默认 2）
  padding?: number              // 间距（像素，默认 4）
  backgroundColor?: string      // 背景色（默认 '#000000'）
  quality?: number              // 合并后的图像质量（0-1，默认 0.9）
  format?: 'jpeg' | 'png' | 'webp'  // 图像格式（默认 'jpeg'）
}

/**
 * 默认 OCR 配置
 */
export const DEFAULT_OCR_CONFIG: Required<OcrExtractionSettings> = {
  mode: 'asr',
  language: 'zh',
  frameRate: 2,                 // 每秒 2 帧
  minConfidence: 0.7,
  selectionArea: null,
  framesPerGroup: 10,
  mergeLayout: {
    columns: 5,
    rows: 2,
    padding: 4
  }
}

/**
 * 默认帧提取选项
 */
export const DEFAULT_FRAME_EXTRACTION_OPTIONS: Required<FrameExtractionOptions> = {
  frameInterval: 0.5,           // 每秒 2 帧
  framesPerGroup: 10,
  thumbnailWidth: 640,
  thumbnailHeight: 360,
  quality: 0.95,
  format: 'jpeg',
  preserveSourceResolution: false
}

/**
 * 默认帧合并选项
 */
export const DEFAULT_FRAME_MERGE_OPTIONS: Required<FrameMergeOptions> = {
  columns: 5,
  rows: 2,
  padding: 4,
  backgroundColor: '#000000',
  quality: 0.9,
  format: 'jpeg'
}

/**
 * OCR API 图片输入类型
 */
export interface OcrImageInput {
  type: 'base64' | 'url'
  data: string
  mime_type?: string
}

/**
 * OCR API 请求参数
 */
export interface OcrApiRequest {
  images: OcrImageInput[]
  model?: string
}

/**
 * OCR API 响应数据
 */
export interface OcrApiResponse {
  timestamps: string[]          // 时间戳列表，如 ["35.00s", "35.50s"]
  text: string[]                // 识别文本列表
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  model: string
  request_id: string
}

/**
 * 合并后的 OCR 识别结果
 */
export interface OcrRecognitionResult {
  timestamp: string
  text: string
}

/**
 * 带远端图片 URL 的历史帧组
 * 继承 MergedFrameGroup，兼容旧项目里已保存的图片地址
 */
export interface UploadedFrameGroup extends MergedFrameGroup {
  r2Url: string                 // 历史公开访问 URL
  uploadId: string              // 上传任务 ID
  storageKey: string            // 历史存储键
  uploadedAt?: string           // 上传时间（ISO 8601 格式）
  isHistory?: boolean           // 是否为历史数据（从后端加载）
}
