/**
 * 视频裁剪服务
 * 使用 Mediabunny 实现视频裁剪功能
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
import type { VideoCropSettings, VideoCropStatus, VideoCropResult } from '../../types/material/crop.types'
import type { VideoFile } from '../../types/material'

/**
 * 视频裁剪服务类
 */
class VideoCropService {
  /**
   * 裁剪视频
   * @param videoFile 原始视频文件
   * @param settings 裁剪设置
   * @param onStatusChange 状态变化回调
   * @returns 裁剪结果
   */
  async cropVideo(
    videoFile: VideoFile,
    settings: VideoCropSettings,
    onStatusChange: (status: VideoCropStatus) => void
  ): Promise<VideoCropResult> {
    const { startTime, endTime } = settings

    // 参数验证
    if (startTime < 0 || endTime <= startTime) {
      throw new Error('无效的裁剪时间范围')
    }

    if (!videoFile.file) {
      throw new Error('视频文件无效')
    }

    let input: Input | null = null

    try {
      // 初始化阶段
      onStatusChange({
        isProcessing: true,
        progress: 0,
        stage: 'initializing',
        message: '正在初始化视频处理...'
      })

      // 创建 Input（从视频文件）
      input = new Input({
        source: new BlobSource(videoFile.file),
        formats: ALL_FORMATS
      })

      // 创建 Output（输出到内存）
      const output = new Output({
        format: new Mp4OutputFormat({
          fastStart: 'in-memory' // 使用内存模式以获得最佳质量
        }),
        target: new BufferTarget()
      })

      // 监控输出文件大小
      let currentFileSize = 0
      output.target.onwrite = (_start: number, end: number) => {
        currentFileSize = Math.max(currentFileSize, end)
      }

      onStatusChange({
        isProcessing: true,
        progress: 10,
        stage: 'initializing',
        message: '视频初始化完成，准备裁剪...'
      })

      // 创建转换任务（执行裁剪）
      const conversion = await Conversion.init({
        input,
        output,
        trim: {
          start: startTime,
          end: endTime
        }
      })

      onStatusChange({
        isProcessing: true,
        progress: 20,
        stage: 'processing',
        message: '正在裁剪视频...'
      })

      // 监听转换进度（Mediabunny 官方 API）
      conversion.onProgress = (progress: number) => {
        // progress 是 0-1 之间的数字
        const percentage = Math.round(progress * 100)
        const adjustedProgress = 20 + Math.round(progress * 70) // 20-90%

        onStatusChange({
          isProcessing: true,
          progress: adjustedProgress,
          stage: 'processing',
          message: `正在裁剪视频... ${percentage}%`
        })
      }

      // 执行转换（使用官方的 execute 方法）
      await conversion.execute()

      onStatusChange({
        isProcessing: true,
        progress: 90,
        stage: 'finalizing',
        message: '正在完成处理...'
      })

      // 完成输出
      await output.finalize()

      // 获取裁剪后的视频数据
      const croppedBuffer = output.target.buffer
      if (!croppedBuffer) {
        throw new Error('视频裁剪失败：未能生成输出数据')
      }
      const croppedBlob = new Blob([croppedBuffer], { type: 'video/mp4' })

      onStatusChange({
        isProcessing: true,
        progress: 100,
        stage: 'completed',
        message: '视频裁剪完成！'
      })

      // 返回结果
      return {
        blob: croppedBlob,
        duration: endTime - startTime,
        size: croppedBlob.size,
        type: 'video/mp4'
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '视频裁剪失败'

      onStatusChange({
        isProcessing: false,
        progress: 0,
        stage: 'failed',
        error: errorMessage,
        message: errorMessage
      })

      throw new Error(errorMessage)
    } finally {
      input?.dispose()
    }
  }

  /**
   * 从裁剪结果创建新的 VideoFile 对象
   * @param originalVideo 原始视频文件
   * @param cropResult 裁剪结果
   * @returns 新的 VideoFile 对象
   */
  async createVideoFileFromCropResult(
    originalVideo: VideoFile,
    cropResult: VideoCropResult
  ): Promise<VideoFile> {
    // 创建新的 File 对象
    const croppedFile = new File(
      [cropResult.blob],
      originalVideo.name.replace(/\.(mp4|mov|avi|mkv)$/i, '_cropped.mp4'),
      { type: cropResult.type }
    )

    // 创建 Blob URL
    const blobUrl = URL.createObjectURL(cropResult.blob)

    // 创建视频元素以获取分辨率
    const video = document.createElement('video')
    video.preload = 'metadata'

    return new Promise((resolve, reject) => {
      video.onloadedmetadata = () => {
        const newVideoFile: VideoFile = {
          file: croppedFile,
          name: croppedFile.name,
          size: cropResult.size,
          type: cropResult.type,
          url: blobUrl,
          duration: cropResult.duration,
          resolution: `${video.videoWidth}x${video.videoHeight}`,
          width: video.videoWidth,
          height: video.videoHeight
        }

        resolve(newVideoFile)
      }

      video.onerror = () => {
        URL.revokeObjectURL(blobUrl)
        reject(new Error('无法加载裁剪后的视频元数据'))
      }

      video.src = blobUrl
    })
  }

  /**
   * 取消视频裁剪（如果正在进行）
   * 注意：Mediabunny 可能不支持中途取消，这个方法作为占位符
   */
  async cancelCrop(): Promise<void> {
    // 目前 Mediabunny 没有明确的取消机制
    // 这里可以在未来添加中断逻辑
    console.warn('视频裁剪取消功能尚未实现')
  }
}

// 导出单例
export default new VideoCropService()
