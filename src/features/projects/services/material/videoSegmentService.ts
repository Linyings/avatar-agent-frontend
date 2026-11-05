/**
 * 视频分段服务
 * 根据视频时长智能分段并裁剪视频
 */

import {
  Input,
  Output,
  Conversion,
  BlobSource,
  BufferTarget,
  Mp4OutputFormat,
  ALL_FORMATS
} from 'mediabunny'

/**
 * 时间范围
 */
export interface TimeRange {
  /** 起始时间（秒） */
  start: number
  /** 结束时间（秒） */
  end: number
}

/**
 * 视频分段配置
 */
export interface VideoSegmentConfig {
  /** 最大单段时长（秒），默认 20 分钟 = 1200 秒（配合 v2.0 微信压缩策略） */
  maxSegmentDuration?: number
  /** 最大总时长（秒），默认 60 分钟 = 3600 秒 */
  maxTotalDuration?: number
}

/**
 * 视频分段状态
 */
export interface VideoSegmentStatus {
  /** 是否正在处理 */
  isProcessing: boolean
  /** 进度（0-100） */
  progress: number
  /** 当前阶段 */
  stage: 'idle' | 'analyzing' | 'segmenting' | 'completed' | 'failed'
  /** 状态消息 */
  message?: string
  /** 当前处理的分段索引 */
  currentSegment?: number
  /** 总分段数 */
  totalSegments?: number
  /** 错误消息 */
  error?: string
}

/**
 * 视频分段结果
 */
export interface VideoSegmentResult {
  /** 分段视频 Blob 数组 */
  segments: Blob[]
  /** 分段时间范围 */
  timeRanges: TimeRange[]
  /** 原始视频时长 */
  originalDuration: number
  /** 分段数量 */
  segmentCount: number
}

/**
 * 视频分段服务类
 */
class VideoSegmentService {
  // 默认配置（参考微信策略：20 分钟分段，配合激进压缩算法）
  private readonly DEFAULT_MAX_SEGMENT_DURATION = 20 * 60 // 20 分钟（每段 ~200kbps，360p 画质）
  private readonly DEFAULT_MAX_TOTAL_DURATION = 60 * 60 // 60 分钟

  /**
   * 根据时长计算分段范围
   * @param duration 视频总时长（秒）
   * @param config 分段配置
   * @returns 时间范围数组
   */
  calculateSegmentRanges(duration: number, config: VideoSegmentConfig = {}): TimeRange[] {
    const maxSegmentDuration = config.maxSegmentDuration || this.DEFAULT_MAX_SEGMENT_DURATION
    const maxTotalDuration = config.maxTotalDuration || this.DEFAULT_MAX_TOTAL_DURATION

    // 验证总时长
    if (duration > maxTotalDuration) {
      throw new Error(
        `视频时长不能超过 ${Math.floor(maxTotalDuration / 60)} 分钟，当前时长：${Math.floor(duration / 60)} 分钟 ${Math.floor(duration % 60)} 秒`
      )
    }

    // 计算需要的分段数
    const segmentCount = Math.ceil(duration / maxSegmentDuration)

    if (segmentCount === 1) {
      // 不需要分段
      return [{ start: 0, end: duration }]
    }

    // 等分视频
    const segmentDuration = duration / segmentCount
    const ranges: TimeRange[] = []

    for (let i = 0; i < segmentCount; i++) {
      ranges.push({
        start: i * segmentDuration,
        end: Math.min((i + 1) * segmentDuration, duration)
      })
    }

    console.log('[VideoSegmentService] 计算分段范围:', {
      duration: `${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}`,
      segmentCount,
      segmentDuration: `${Math.floor(segmentDuration / 60)}:${Math.floor(segmentDuration % 60).toString().padStart(2, '0')}`,
      ranges: ranges.map(r => ({
        start: `${Math.floor(r.start / 60)}:${Math.floor(r.start % 60).toString().padStart(2, '0')}`,
        end: `${Math.floor(r.end / 60)}:${Math.floor(r.end % 60).toString().padStart(2, '0')}`
      }))
    })

    return ranges
  }

  /**
   * 获取视频时长
   * @param videoBlob 视频 Blob
   * @returns 视频时长（秒）
   */
  async getVideoDuration(videoBlob: Blob): Promise<number> {
    let input: Input | null = null

    try {
      // 使用 Mediabunny 获取时长
      input = new Input({
        source: new BlobSource(videoBlob),
        formats: ALL_FORMATS
      })

      const duration = await input.computeDuration()
      return duration
    } catch (error) {
      console.error('[VideoSegmentService] Mediabunny 获取时长失败，使用回退方案:', error)

      // 回退方案：使用 video 元素
      return new Promise((resolve, reject) => {
        const video = document.createElement('video')
        const objectUrl = URL.createObjectURL(videoBlob)
        video.preload = 'metadata'

        video.onloadedmetadata = () => {
          const duration = video.duration
          URL.revokeObjectURL(objectUrl)
          resolve(duration)
        }

        video.onerror = () => {
          URL.revokeObjectURL(objectUrl)
          reject(new Error('无法读取视频时长'))
        }

        video.src = objectUrl
      })
    } finally {
      input?.dispose()
    }
  }

  /**
   * 分段视频
   * @param videoBlob 原始视频 Blob
   * @param config 分段配置
   * @param onStatusChange 状态变化回调
   * @returns 分段结果
   */
  async segmentVideo(
    videoBlob: Blob,
    config: VideoSegmentConfig = {},
    onStatusChange?: (status: VideoSegmentStatus) => void
  ): Promise<VideoSegmentResult> {
    try {
      // 分析阶段
      onStatusChange?.({
        isProcessing: true,
        progress: 0,
        stage: 'analyzing',
        message: '正在分析视频时长...'
      })

      // 获取视频时长
      const duration = await this.getVideoDuration(videoBlob)

      console.log('[VideoSegmentService] 视频时长:', {
        duration,
        durationFormatted: `${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}`
      })

      onStatusChange?.({
        isProcessing: true,
        progress: 10,
        stage: 'analyzing',
        message: `视频时长：${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}`
      })

      // 计算分段范围
      const timeRanges = this.calculateSegmentRanges(duration, config)
      const segmentCount = timeRanges.length

      console.log('[VideoSegmentService] 分段方案:', {
        segmentCount,
        ranges: timeRanges
      })

      onStatusChange?.({
        isProcessing: true,
        progress: 20,
        stage: 'segmenting',
        message: `将视频分为 ${segmentCount} 段`,
        totalSegments: segmentCount
      })

      // 如果只有一段，直接返回原视频
      if (segmentCount === 1) {
        onStatusChange?.({
          isProcessing: true,
          progress: 100,
          stage: 'completed',
          message: '视频无需分段'
        })

        return {
          segments: [videoBlob],
          timeRanges,
          originalDuration: duration,
          segmentCount: 1
        }
      }

      // 分段裁剪
      const segments: Blob[] = []

      for (let i = 0; i < segmentCount; i++) {
        const range = timeRanges[i]
        const segmentNumber = i + 1

        onStatusChange?.({
          isProcessing: true,
          progress: 20 + (i / segmentCount) * 70,
          stage: 'segmenting',
          message: `正在处理第 ${segmentNumber}/${segmentCount} 段...`,
          currentSegment: segmentNumber,
          totalSegments: segmentCount
        })

        console.log(`[VideoSegmentService] 裁剪分段 ${segmentNumber}/${segmentCount}:`, {
          start: range.start,
          end: range.end,
          duration: range.end - range.start
        })

        // 执行裁剪
        const segmentBlob = await this.cropSegment(videoBlob, range, (progress) => {
          const baseProgress = 20 + (i / segmentCount) * 70
          const segmentProgress = (progress / 100) * (70 / segmentCount)
          onStatusChange?.({
            isProcessing: true,
            progress: baseProgress + segmentProgress,
            stage: 'segmenting',
            message: `正在处理第 ${segmentNumber}/${segmentCount} 段... ${progress}%`,
            currentSegment: segmentNumber,
            totalSegments: segmentCount
          })
        })

        segments.push(segmentBlob)

        console.log(`[VideoSegmentService] 分段 ${segmentNumber} 完成:`, {
          size: segmentBlob.size,
          sizeMB: (segmentBlob.size / 1024 / 1024).toFixed(2)
        })
      }

      // 完成
      onStatusChange?.({
        isProcessing: true,
        progress: 100,
        stage: 'completed',
        message: `视频分段完成！共 ${segmentCount} 段`
      })

      return {
        segments,
        timeRanges,
        originalDuration: duration,
        segmentCount
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '视频分段失败'

      onStatusChange?.({
        isProcessing: false,
        progress: 0,
        stage: 'failed',
        error: errorMessage,
        message: errorMessage
      })

      throw new Error(errorMessage)
    }
  }

  /**
   * 裁剪单个分段
   * @param videoBlob 原始视频 Blob
   * @param range 时间范围
   * @param onProgress 进度回调（0-100）
   * @returns 裁剪后的 Blob
   */
  private async cropSegment(
    videoBlob: Blob,
    range: TimeRange,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    // 创建输入
    const input = new Input({
      source: new BlobSource(videoBlob),
      formats: ALL_FORMATS
    })

    try {
      // 创建输出
      const output = new Output({
        format: new Mp4OutputFormat({
          fastStart: 'in-memory'
        }),
        target: new BufferTarget()
      })

      // 创建转换任务（执行裁剪）
      const conversion = await Conversion.init({
        input,
        output,
        trim: {
          start: range.start,
          end: range.end
        }
      })

      // 监听进度
      conversion.onProgress = (progress: number) => {
        onProgress?.(Math.round(progress * 100))
      }

      // 执行转换
      await conversion.execute()
      await output.finalize()

      // 获取结果
      const buffer = output.target.buffer
      if (!buffer) {
        throw new Error('裁剪失败：未能生成输出数据')
      }

      return new Blob([buffer], { type: 'video/mp4' })
    } finally {
      input.dispose()
    }
  }

  /**
   * 获取分段策略描述
   * @param duration 视频时长（秒）
   * @param config 分段配置
   * @returns 分段策略描述
   */
  getSegmentStrategy(duration: number, config: VideoSegmentConfig = {}): string {
    const maxSegmentDuration = config.maxSegmentDuration || this.DEFAULT_MAX_SEGMENT_DURATION
    const maxTotalDuration = config.maxTotalDuration || this.DEFAULT_MAX_TOTAL_DURATION
    const durationMinutes = Math.floor(duration / 60)

    if (duration > maxTotalDuration) {
      return `❌ 视频时长超过限制（${Math.floor(maxTotalDuration / 60)} 分钟）`
    }

    const segmentCount = Math.ceil(duration / maxSegmentDuration)

    if (segmentCount === 1) {
      return `✓ 视频时长在 ${Math.floor(maxSegmentDuration / 60)} 分钟以内，无需分段`
    } else if (segmentCount === 2) {
      return `✓ 视频时长 ${durationMinutes} 分钟，将分为 2 段处理`
    } else if (segmentCount === 3) {
      return `✓ 视频时长 ${durationMinutes} 分钟，将分为 3 段处理`
    } else {
      return `✓ 视频时长 ${durationMinutes} 分钟，将分为 ${segmentCount} 段处理`
    }
  }
}

// 导出单例
export default new VideoSegmentService()
