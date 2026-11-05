import {
  Input,
  ALL_FORMATS,
  BlobSource,
  CanvasSink,
} from 'mediabunny'
import type { VideoFile, VideoFrame, FrameGroup, ExtractionSettings } from '@/shared/types'

// 错误信息国际化映射
const ERROR_MESSAGES: Record<string, string> = {
  'When both options.width and options.height are provided, options.fit must also be provided.': 
    '当同时提供宽度和高度时，必须指定图像适配模式。',
  'Failed to initialize video input': '初始化视频输入失败',
  'No video track found': '未找到视频轨道',
  'Video cannot be decoded in this browser': '此浏览器无法解码该视频',
  'Failed to extract frame': '提取帧失败',
  '提供的文件不是有效的 Blob 对象': '提供的文件不是有效的 Blob 对象',
  'blob must be a Blob': '文件对象必须是有效的 Blob 类型',
}

// 转换错误信息为中文
const translateError = (error: string): string => {
  return ERROR_MESSAGES[error] || error
}

export class VideoProcessor {
  private input: Input | null = null
  
  async initialize(videoFile: VideoFile): Promise<void> {
    // 确保 videoFile.file 是有效的 Blob 对象
    if (!(videoFile.file instanceof Blob)) {
      throw new Error('提供的文件不是有效的 Blob 对象')
    }
    
    this.input = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(videoFile.file),
    })
  }

  async extractFrames(
    videoFile: VideoFile,
    settings: ExtractionSettings,
    onProgress?: (progress: number) => void
  ): Promise<FrameGroup[]> {
    try {
      // 总是重新初始化以确保使用正确的文件
      await this.initialize(videoFile)
      
      if (!this.input) {
        throw new Error(translateError('Failed to initialize video input'))
      }


      const videoTrack = await this.input.getPrimaryVideoTrack()
      if (!videoTrack) {
        throw new Error(translateError('No video track found'))
      }

      const canDecode = await videoTrack.canDecode()
      if (!canDecode) {
        throw new Error(translateError('Video cannot be decoded in this browser'))
      }

      // 获取视频时长
      const duration = await videoTrack.computeDuration()
      const startTimestamp = await videoTrack.getFirstTimestamp()
      
      // 创建画布渲染器
      const canvasSinkOptions: {
        width: number
        height?: number
        fit?: 'fill' | 'contain' | 'cover'
      } = {
        width: settings.thumbnailWidth,
      }
      
      // 如果同时提供了width和height，必须指定fit参数
      if (settings.thumbnailHeight) {
        canvasSinkOptions.height = settings.thumbnailHeight
        canvasSinkOptions.fit = settings.fit || 'contain' // 默认使用contain模式，保持宽高比
      }
      
      const sink = new CanvasSink(videoTrack, canvasSinkOptions)

      // 计算提取点
      const totalFrames = Math.floor(duration / settings.interval)
      const totalGroups = Math.ceil(totalFrames / settings.framesPerGroup)
      
      const groups: FrameGroup[] = []
      let processedFrames = 0

      for (let groupIndex = 0; groupIndex < totalGroups; groupIndex++) {
        const groupStartTime = startTimestamp + (groupIndex * settings.framesPerGroup * settings.interval)
        const groupEndTime = Math.min(
          startTimestamp + ((groupIndex + 1) * settings.framesPerGroup * settings.interval),
          startTimestamp + duration
        )

        const group: FrameGroup = {
          id: `group-${groupIndex}`,
          name: `第 ${groupIndex + 1} 组`,
          startTime: groupStartTime,
          endTime: groupEndTime,
          frames: []
        }


        // 为当前组提取帧
        for (let frameIndex = 0; frameIndex < settings.framesPerGroup; frameIndex++) {
          const timestamp = groupStartTime + (frameIndex * settings.interval)
          
          // 检查是否超出视频总时长
          if (timestamp >= startTimestamp + duration) break

          try {
            const result = await sink.getCanvas(timestamp)
            
            if (result) {
              const frame: VideoFrame = {
                canvas: result.canvas,
                timestamp: result.timestamp,
                duration: result.duration,
              }

              group.frames.push(frame)
              processedFrames++

              // 更新进度
              if (onProgress) {
                const progress = (processedFrames / totalFrames) * 100
                onProgress(Math.min(progress, 100))
              }
            } else {
              continue
            }
          } catch (error) {
            console.warn('Frame extraction skipped at timestamp:', timestamp, error)
          }
        }

        if (group.frames.length > 0) {
          groups.push(group)
        }
      }

      return groups
    } catch (error) {
      console.error('Error during frame extraction:', error)
      // 转换错误信息为中文
      if (error instanceof Error) {
        const translatedMessage = translateError(error.message)
        throw new Error(translatedMessage)
      }
      throw error
    }
  }

  async getVideoMetadata(videoFile: VideoFile): Promise<{
    duration: number
    width: number
    height: number
    frameRate?: number
  }> {
    if (!this.input) {
      await this.initialize(videoFile)
    }

    if (!this.input) {
      throw new Error('Failed to initialize video input')
    }

    const videoTrack = await this.input.getPrimaryVideoTrack()
    if (!videoTrack) {
      throw new Error('No video track found')
    }

    const duration = await videoTrack.computeDuration()
    
    // 估算帧率
    let frameRate: number | undefined
    try {
      const stats = await videoTrack.computePacketStats(100)
      frameRate = stats.averagePacketRate
    } catch {
      frameRate = undefined
    }

    return {
      duration,
      width: videoTrack.displayWidth,
      height: videoTrack.displayHeight,
      frameRate
    }
  }

  dispose(): void {
    this.input = null
  }
}

// 工具函数
export const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

export const canvasToImageUrl = (canvas: HTMLCanvasElement | OffscreenCanvas): string => {
  if (canvas instanceof HTMLCanvasElement) {
    return canvas.toDataURL('image/jpeg', 0.8)
  }
  // For OffscreenCanvas, we would need to convert to ImageBitmap first
  // This is a simplified version
  return ''
}