// 视频处理服务
import { Input, ALL_FORMATS, BlobSource, CanvasSink } from 'mediabunny'
import type {
  VideoFile,
  VideoMetadata,
  VideoProcessingStatus,
  AudioExtractionResult
} from '../../types/material'

export class VideoProcessingService {
  private static instance: VideoProcessingService

  static getInstance(): VideoProcessingService {
    if (!VideoProcessingService.instance) {
      VideoProcessingService.instance = new VideoProcessingService()
    }
    return VideoProcessingService.instance
  }

  /**
   * 处理视频文件（不上传，仅本地处理）
   */
  async processVideo(
    file: File,
    _projectId: string,
    onProgress?: (progress: number) => void
  ): Promise<VideoFile> {
    let blobUrl: string | null = null

    try {
      // 通知开始处理
      onProgress?.(0)

      console.log('[VideoProcessingService] 开始本地处理视频:', {
        name: file.name,
        size: file.size,
        type: file.type
      })

      // 1. 创建本地 Blob URL（用于本地处理和预览）
      blobUrl = URL.createObjectURL(file)
      onProgress?.(20)

      // 2. 使用 MediaBunny 提取视频元数据
      const metadata = await this.extractVideoMetadata(file)
      console.log('[VideoProcessingService] MediaBunny 元数据提取完成:', metadata)
      onProgress?.(60)

      // 3. 创建 VideoFile 对象
      const videoFile: VideoFile = {
        file,
        url: blobUrl, // 本地 Blob URL
        duration: metadata.duration,
        size: file.size,
        type: file.type,
        name: file.name,
        width: metadata.width,
        height: metadata.height,
        resolution: metadata.resolution,
        aspectRatio: metadata.aspectRatio
      }

      onProgress?.(100)
      console.log('[VideoProcessingService] 视频本地处理完成:', {
        name: file.name,
        url: blobUrl,
        duration: metadata.duration,
        resolution: metadata.resolution,
        note: '注意：这是本地Blob URL，页面刷新后会失效'
      })

      return videoFile
    } catch (error) {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
      }
      console.error('[VideoProcessingService] 视频处理失败:', error)
      throw new Error(`视频处理失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  /**
   * 保持向后兼容的 uploadVideo 方法
   */
  async uploadVideo(
    file: File,
    projectId: string,
    onProgress?: (progress: number) => void
  ): Promise<VideoFile> {
    return this.processVideo(file, projectId, onProgress)
  }

  /**
   * 提取视频元数据（使用 MediaBunny）
   */
  private async extractVideoMetadata(file: File): Promise<VideoMetadata> {
    let input: Input | null = null

    try {
      // 使用 MediaBunny 提取详细元数据
      input = new Input({
        formats: ALL_FORMATS,
        source: new BlobSource(file)
      })

      const videoTrack = await input.getPrimaryVideoTrack()
      if (!videoTrack) {
        throw new Error('无法读取视频轨道')
      }

      const duration = await input.computeDuration()
      const { displayWidth, displayHeight } = videoTrack

      // 计算分辨率和长宽比
      const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b)
      const divisor = gcd(displayWidth, displayHeight)

      // 获取帧率
      let frameRate = 30 // 默认值
      try {
        const packetStats = await videoTrack.computePacketStats(100)
        frameRate = packetStats.averagePacketRate
      } catch (error) {
        console.warn('无法获取帧率，使用默认值:', error)
      }

      return {
        width: displayWidth,
        height: displayHeight,
        duration,
        framerate: frameRate,
        format: file.type,
        resolution: `${displayWidth} x ${displayHeight}`,
        aspectRatio: `${displayWidth/divisor} x ${displayHeight/divisor}`
      }
    } catch (error) {
      console.error('MediaBunny 元数据提取失败，回退到传统方式:', error)
      // 回退到传统方式
      return this.extractVideoMetadataFallback(file)
    } finally {
      input?.dispose()
    }
  }

  /**
   * 传统方式提取视频元数据（回退方案）
   */
  private async extractVideoMetadataFallback(file: File): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      const objectUrl = URL.createObjectURL(file)
      video.preload = 'metadata'

      video.onloadedmetadata = () => {
        const width = video.videoWidth
        const height = video.videoHeight
        const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b)
        const divisor = gcd(width, height)

        const metadata: VideoMetadata = {
          width,
          height,
          duration: video.duration,
          framerate: 30, // 默认值
          format: file.type,
          resolution: `${width} x ${height}`,
          aspectRatio: `${width/divisor} x ${height/divisor}`
        }
        URL.revokeObjectURL(objectUrl)
        resolve(metadata)
      }

      video.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('无法读取视频元数据'))
      }

      video.src = objectUrl
    })
  }

  /**
   * 提取音频
   */
  async extractAudio(
    videoFile: VideoFile,
    _projectId: string,
    onProgress?: (status: VideoProcessingStatus) => void
  ): Promise<AudioExtractionResult> {
    try {
      onProgress?.({
        isProcessing: true,
        progress: 0,
        stage: 'extracting_audio'
      })

      // 这里应该调用后端API来提取音频
      // 目前返回模拟数据
      const result: AudioExtractionResult = {
        audioUrl: '', // 后端返回的音频URL
        duration: videoFile.duration,
        sampleRate: 44100,
        format: 'wav'
      }

      onProgress?.({
        isProcessing: false,
        progress: 100,
        stage: 'completed'
      })

      return result
    } catch (error) {
      onProgress?.({
        isProcessing: false,
        progress: 0,
        stage: 'failed',
        error: error instanceof Error ? error.message : '音频提取失败'
      })
      throw error
    }
  }

  /**
   * 截取视频预览图（使用 MediaBunny）
   */
  async captureVideoThumbnail(
    file: File,
    timestamp?: number,
    maxSizeKB: number = 500
  ): Promise<Blob> {
    let input: Input | null = null

    try {
      input = new Input({
        formats: ALL_FORMATS,
        source: new BlobSource(file)
      })

      const videoTrack = await input.getPrimaryVideoTrack()
      if (!videoTrack) {
        throw new Error('无法读取视频轨道')
      }

      // 检查是否可以解码
      const decodable = await videoTrack.canDecode()
      if (!decodable) {
        throw new Error('视频无法解码')
      }

      // 使用 CanvasSink 获取缩略图
      const sink = new CanvasSink(videoTrack, {
        width: 640  // 限制缩略图宽度，自动保持比例
      })

      // 默认截取第2秒或视频10%位置的画面
      const duration = await input.computeDuration()
      const captureTime = timestamp ?? Math.min(2, duration * 0.1)

      // 获取指定时间的画面
      const result = await sink.getCanvas(captureTime)
      if (!result) {
        throw new Error('无法获取视频帧')
      }
      const canvas = result.canvas

      // 压缩图片直到小于指定大小
      let quality = 0.9
      let blob: Blob

      do {
        blob = await new Promise<Blob>((resolve, reject) => {
          if (canvas instanceof HTMLCanvasElement) {
            canvas.toBlob(
              (b) => b ? resolve(b) : reject(new Error('无法生成图片')),
              'image/jpeg',
              quality
            )
          } else {
            // OffscreenCanvas
            canvas.convertToBlob({ type: 'image/jpeg', quality })
              .then(resolve)
              .catch(reject)
          }
        })

        if (blob.size > maxSizeKB * 1024 && quality > 0.1) {
          quality -= 0.1
        } else {
          break
        }
      } while (blob.size > maxSizeKB * 1024 && quality > 0.1)

      return blob
    } catch (error) {
      console.error('MediaBunny 预览图截取失败:', error)
      throw new Error('预览图截取失败: ' + (error instanceof Error ? error.message : '未知错误'))
    } finally {
      input?.dispose()
    }
  }

  /**
   * 验证视频文件格式
   */
  validateVideoFile(file: File): { isValid: boolean; error?: string } {
    const supportedFormats = ['video/mp4', 'video/webm', 'video/ogg', 'video/avi']
    const maxSize = 1 * 1024 * 1024 * 1024 // 1GB 上限，建议控制在 40 分钟内以保证浏览器处理稳定

    if (!supportedFormats.includes(file.type)) {
      return {
        isValid: false,
        error: `不支持的视频格式。支持的格式：${supportedFormats.join(', ')}`
      }
    }

    if (file.size > maxSize) {
      return {
        isValid: false,
        error: '视频文件过大，最大支持 1GB（建议时长 ≤ 40 分钟）'
      }
    }

    return { isValid: true }
  }
}

export default VideoProcessingService.getInstance()
