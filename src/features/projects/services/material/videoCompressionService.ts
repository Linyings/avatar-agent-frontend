/**
 * 视频压缩服务 v2.0
 * 使用 Mediabunny 实现视频压缩功能
 *
 * 核心改进：
 * 1. 基于目标大小精确计算比特率
 * 2. 帧率控制（24fps 或更低）
 * 3. 激进的音频压缩（单声道、低采样率）
 * 4. VBR 编码模式提高压缩效率
 * 5. Quality 延迟模式优化压缩质量
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
 * 视频压缩配置
 */
export interface VideoCompressionConfig {
  /** 目标文件大小（MB） */
  targetSizeMB?: number
  /** 目标分辨率宽度（如果需要降低分辨率） */
  maxWidth?: number
  /** 目标分辨率高度（如果需要降低分辨率） */
  maxHeight?: number
  /** 是否保持宽高比 */
  maintainAspectRatio?: boolean
}

/**
 * 视频压缩状态
 */
export interface VideoCompressionStatus {
  /** 是否正在处理 */
  isProcessing: boolean
  /** 进度（0-100） */
  progress: number
  /** 当前阶段 */
  stage: 'idle' | 'analyzing' | 'compressing' | 'finalizing' | 'completed' | 'failed'
  /** 状态消息 */
  message?: string
  /** 错误消息 */
  error?: string
  /** 当前尝试次数 */
  attempt?: number
}

/**
 * 视频压缩结果
 */
export interface VideoCompressionResult {
  /** 压缩后的视频 Blob */
  blob: Blob
  /** 原始文件大小（字节） */
  originalSize: number
  /** 压缩后文件大小（字节） */
  compressedSize: number
  /** 压缩率（百分比） */
  compressionRatio: number
  /** 原始分辨率 */
  originalResolution: { width: number; height: number }
  /** 压缩后分辨率 */
  compressedResolution: { width: number; height: number }
  /** 文件类型 */
  type: string
}

/**
 * 分辨率配置
 */
interface ResolutionConfig {
  width: number
  height: number
  label: string
}

/**
 * 视频压缩服务类 v2.0
 *
 * 采用科学的比特率计算方法，确保压缩后文件严格小于目标大小
 */
class VideoCompressionService {
  // 默认目标大小：50MB
  private readonly DEFAULT_TARGET_SIZE_MB = 50

  // 预设分辨率配置（从高到低）
  private readonly RESOLUTION_PRESETS: ResolutionConfig[] = [
    { width: 1280, height: 720, label: '720p' },
    { width: 854, height: 480, label: '480p' },
    { width: 640, height: 360, label: '360p' },
    { width: 480, height: 270, label: '270p' },
    { width: 426, height: 240, label: '240p' }
  ]

  // 帧率预设（从高到低）- 参考微信：24fps 是最佳平衡点
  private readonly FRAME_RATE_PRESETS = [24, 20, 15, 12]

  // 安全系数（参考微信的激进压缩策略）
  private readonly SAFETY_FACTOR = 0.70 // 更激进的压缩（微信实测：4K → 439kbps 非常低）

  /**
   * 压缩视频
   * @param videoBlob 原始视频 Blob
   * @param config 压缩配置
   * @param onStatusChange 状态变化回调
   * @returns 压缩结果
   */
  async compressVideo(
    videoBlob: Blob,
    config: VideoCompressionConfig = {},
    onStatusChange?: (status: VideoCompressionStatus) => void
  ): Promise<VideoCompressionResult> {
    const targetSizeMB = config.targetSizeMB || this.DEFAULT_TARGET_SIZE_MB
    const targetSizeBytes = targetSizeMB * 1024 * 1024

    try {
      // 分析阶段
      onStatusChange?.({
        isProcessing: true,
        progress: 0,
        stage: 'analyzing',
        message: '正在分析视频...'
      })

      // 获取视频元数据
      const input = new Input({
        source: new BlobSource(videoBlob),
        formats: ALL_FORMATS
      })

      const videoTrack = await input.getPrimaryVideoTrack()
      if (!videoTrack) {
        throw new Error('无法读取视频轨道')
      }

      // 检查音频轨道（关键：诊断音频问题）
      const audioTrack = await input.getPrimaryAudioTrack()
      const hasAudio = audioTrack !== null

      const originalWidth = videoTrack.displayWidth
      const originalHeight = videoTrack.displayHeight
      const duration = await input.computeDuration()

      console.log('[VideoCompressionService] 视频信息:', {
        originalSize: videoBlob.size,
        originalSizeMB: (videoBlob.size / 1024 / 1024).toFixed(2),
        targetSizeMB,
        duration,
        resolution: `${originalWidth}x${originalHeight}`,
        hasAudio: hasAudio,
        audioInfo: audioTrack ? {
          codec: audioTrack.codec,
          numberOfChannels: audioTrack.numberOfChannels,
          sampleRate: audioTrack.sampleRate
        } : '无音频轨道'
      })

      // 如果原始视频没有音频，给出提示
      if (!hasAudio) {
        console.warn('[VideoCompressionService] ⚠️ 原始视频没有音频轨道，压缩后的视频也将没有声音')
      }

      onStatusChange?.({
        isProcessing: true,
        progress: 10,
        stage: 'analyzing',
        message: `视频分析完成 (${originalWidth}x${originalHeight})`
      })

      // 如果原始文件已经小于目标大小，直接返回
      if (videoBlob.size <= targetSizeBytes) {
        console.log('[VideoCompressionService] 视频已符合大小要求，无需压缩')

        onStatusChange?.({
          isProcessing: true,
          progress: 100,
          stage: 'completed',
          message: '视频无需压缩'
        })

        return {
          blob: videoBlob,
          originalSize: videoBlob.size,
          compressedSize: videoBlob.size,
          compressionRatio: 0,
          originalResolution: { width: originalWidth, height: originalHeight },
          compressedResolution: { width: originalWidth, height: originalHeight },
          type: 'video/mp4'
        }
      }

      // ==================== v2.0 核心改进：参考微信压缩策略 ====================

      console.log('[VideoCompressionService] 开始压缩 - 微信策略:', {
        targetSizeMB,
        duration: duration.toFixed(2),
        originalSizeMB: (videoBlob.size / 1024 / 1024).toFixed(2),
        compressionNeeded: ((1 - targetSizeBytes / videoBlob.size) * 100).toFixed(1) + '%'
      })

      // v2.1 修复：根据实际音频声道数计算比特率
      const actualAudioBitrate = hasAudio && audioTrack
        ? (audioTrack.numberOfChannels === 1 ? 64_000 : 96_000)
        : 64_000 // 无音频时使用默认值（不影响计算）

      console.log('[VideoCompressionService] 音频比特率计算 (v2.1):', {
        hasAudio,
        channels: audioTrack?.numberOfChannels || 0,
        calculatedBitrate: actualAudioBitrate,
        calculatedBitrateKbps: (actualAudioBitrate / 1000).toFixed(0)
      })

      // 计算目标比特率（参考微信的激进策略）
      const targetVideoBitrate = this.calculateTargetBitrate(targetSizeBytes, duration, actualAudioBitrate)
      const targetAudioBitrate = actualAudioBitrate

      // 选择合适的起始分辨率（基于比特率）
      let targetResolution = this.selectResolutionByBitrate(
        { width: originalWidth, height: originalHeight },
        targetVideoBitrate
      )

      // 选择起始帧率
      let frameRateIndex = 0
      let currentFrameRate = this.FRAME_RATE_PRESETS[frameRateIndex]

      // 尝试压缩（最多5次，逐步降低分辨率和帧率）
      let attempt = 1
      const maxAttempts = 5
      let compressedBlob: Blob | null = null

      while (attempt <= maxAttempts) {
        onStatusChange?.({
          isProcessing: true,
          progress: 10 + (attempt - 1) * 15,
          stage: 'compressing',
          message: `压缩 (${targetResolution.label}@${currentFrameRate}fps)...`,
          attempt
        })

        console.log(`[VideoCompressionService] 尝试压缩 #${attempt}:`, {
          resolution: targetResolution.label,
          frameRate: currentFrameRate,
          videoBitrateMbps: (targetVideoBitrate / 1_000_000).toFixed(2),
          audioBitrateKbps: (targetAudioBitrate / 1000).toFixed(0)
        })

        try {
          compressedBlob = await this.performCompression(
            videoBlob,
            targetResolution,
            targetVideoBitrate,
            currentFrameRate,
            targetAudioBitrate,
            (progress) => {
              const baseProgress = 10 + (attempt - 1) * 15
              const adjustedProgress = baseProgress + Math.round(progress * 15)
              onStatusChange?.({
                isProcessing: true,
                progress: adjustedProgress,
                stage: 'compressing',
                message: `压缩 (${targetResolution.label}@${currentFrameRate}fps) ${Math.round(progress * 100)}%`,
                attempt
              })
            }
          )

          console.log('[VideoCompressionService] 压缩完成:', {
            attempt,
            compressedSizeMB: (compressedBlob.size / 1024 / 1024).toFixed(2),
            targetSizeMB,
            resolution: targetResolution.label,
            frameRate: currentFrameRate
          })

          // 检查压缩后的大小
          if (compressedBlob.size <= targetSizeBytes) {
            // 压缩成功
            console.log(`[VideoCompressionService] ✓ 压缩成功！文件大小: ${(compressedBlob.size / 1024 / 1024).toFixed(2)} MB`)
            break
          } else if (attempt < maxAttempts) {
            // 需要进一步优化
            const oversizeMB = (compressedBlob.size / 1024 / 1024 - targetSizeMB).toFixed(2)
            console.log(`[VideoCompressionService] 压缩后仍超过目标大小 ${oversizeMB}MB，调整参数...`)

            // 策略：先降低帧率，再降低分辨率
            if (frameRateIndex < this.FRAME_RATE_PRESETS.length - 1) {
              // 还可以降低帧率
              frameRateIndex++
              currentFrameRate = this.FRAME_RATE_PRESETS[frameRateIndex]
              console.log(`[VideoCompressionService] → 降低帧率到 ${currentFrameRate}fps`)
            } else {
              // 帧率已最低，降低分辨率并重置帧率
              targetResolution = this.getNextLowerResolution(targetResolution)
              frameRateIndex = 0
              currentFrameRate = this.FRAME_RATE_PRESETS[frameRateIndex]
              console.log(`[VideoCompressionService] → 降低分辨率到 ${targetResolution.label}`)
            }

            attempt++
            compressedBlob = null
          } else {
            // 已达到最大尝试次数，仍然超过大小限制
            const finalSizeMB = (compressedBlob.size / 1024 / 1024).toFixed(2)
            const oversizeMB = (compressedBlob.size / 1024 / 1024 - targetSizeMB).toFixed(2)

            console.error('[VideoCompressionService] 压缩失败：已尝试所有策略', {
              attempts: maxAttempts,
              finalResolution: targetResolution.label,
              finalFrameRate: currentFrameRate,
              finalSizeMB,
              targetSizeMB,
              oversizeMB
            })

            throw new Error(
              `视频压缩失败：已尝试 ${maxAttempts} 次压缩，最终大小仍为 ${finalSizeMB}MB（超出 ${oversizeMB}MB）。\n\n` +
              `建议：裁剪更短的视频片段（建议每段 ≤ ${Math.floor(targetSizeMB / 10)} 分钟），或将视频分成更多段。`
            )
          }
        } catch (error) {
          console.error(`[VideoCompressionService] 压缩尝试 #${attempt} 失败:`, error)

          // 如果是我们自己抛出的错误（已达最大尝试次数），直接抛出
          if (error instanceof Error && error.message.includes('已尝试')) {
            throw error
          }

          // 其他错误，尝试调整参数重试
          if (attempt === maxAttempts) {
            throw new Error(`视频压缩失败: ${error instanceof Error ? error.message : '未知错误'}`)
          }

          // 降低参数重试
          if (frameRateIndex < this.FRAME_RATE_PRESETS.length - 1) {
            frameRateIndex++
            currentFrameRate = this.FRAME_RATE_PRESETS[frameRateIndex]
          } else {
            targetResolution = this.getNextLowerResolution(targetResolution)
            frameRateIndex = 0
            currentFrameRate = this.FRAME_RATE_PRESETS[frameRateIndex]
          }
          attempt++
        }
      }

      if (!compressedBlob) {
        throw new Error('视频压缩失败：未能生成压缩结果')
      }

      // 最终化
      onStatusChange?.({
        isProcessing: true,
        progress: 95,
        stage: 'finalizing',
        message: '正在完成处理...'
      })

      // 获取压缩后的分辨率
      const compressedInput = new Input({
        source: new BlobSource(compressedBlob),
        formats: ALL_FORMATS
      })
      const compressedTrack = await compressedInput.getPrimaryVideoTrack()
      const compressedWidth = compressedTrack?.displayWidth || targetResolution.width
      const compressedHeight = compressedTrack?.displayHeight || targetResolution.height

      // 计算压缩率
      const compressionRatio = ((videoBlob.size - compressedBlob.size) / videoBlob.size) * 100

      onStatusChange?.({
        isProcessing: true,
        progress: 100,
        stage: 'completed',
        message: `视频压缩完成！(${compressionRatio.toFixed(1)}% 减少)`
      })

      return {
        blob: compressedBlob,
        originalSize: videoBlob.size,
        compressedSize: compressedBlob.size,
        compressionRatio,
        originalResolution: { width: originalWidth, height: originalHeight },
        compressedResolution: { width: compressedWidth, height: compressedHeight },
        type: 'video/mp4'
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '视频压缩失败'

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
   * 计算目标视频比特率（v2.1 优化版本）
   *
   * 微信实测数据：
   * - 4K (29801kbps) → 640x336, 24fps, 439kbps
   * - 音频：64kbps 单声道（或 96kbps 立体声）
   *
   * v2.1 改进：接受实际音频比特率，支持动态音频配置
   *
   * @param targetSizeBytes 目标文件大小（字节）
   * @param durationSeconds 视频时长（秒）
   * @param audioBitrate 实际音频比特率（单声道64kbps，立体声96kbps）
   * @returns 目标视频比特率（bps）
   */
  private calculateTargetBitrate(
    targetSizeBytes: number,
    durationSeconds: number,
    audioBitrate: number
  ): number {
    // 1. 计算总比特率（bits per second）
    const totalBitrate = (targetSizeBytes * 8) / durationSeconds

    // 2. 扣除实际音频比特率（v2.1: 支持单声道和立体声）
    const videoBitrate = totalBitrate - audioBitrate

    // 3. 应用安全系数（参考微信的激进压缩）
    const safeBitrate = videoBitrate * this.SAFETY_FACTOR

    console.log('[VideoCompressionService] 比特率计算 (v2.1 动态音频):', {
      targetSizeMB: (targetSizeBytes / 1024 / 1024).toFixed(2),
      durationSeconds: durationSeconds.toFixed(2),
      totalBitrate: Math.round(totalBitrate),
      totalBitrateKbps: (totalBitrate / 1_000).toFixed(0),
      audioBitrateKbps: (audioBitrate / 1_000).toFixed(0),
      videoBitrate: Math.round(videoBitrate),
      videoBitrateKbps: (videoBitrate / 1_000).toFixed(0),
      safeBitrate: Math.round(safeBitrate),
      safeBitrateKbps: (safeBitrate / 1_000).toFixed(0),
      safetyFactor: this.SAFETY_FACTOR
    })

    return Math.round(safeBitrate)
  }

  /**
   * 执行实际的压缩操作（v2.0 优化版本）
   *
   * @param videoBlob 原始视频
   * @param targetResolution 目标分辨率
   * @param videoBitrate 视频比特率
   * @param frameRate 目标帧率
   * @param audioBitrate 音频比特率
   * @param onProgress 进度回调
   */
  private async performCompression(
    videoBlob: Blob,
    targetResolution: ResolutionConfig,
    videoBitrate: number,
    frameRate: number,
    audioBitrate: number,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    // 创建输入
    const input = new Input({
      source: new BlobSource(videoBlob),
      formats: ALL_FORMATS
    })

    // 创建输出
    const output = new Output({
      format: new Mp4OutputFormat({
        fastStart: 'in-memory'
      }),
      target: new BufferTarget()
    })

    // 检查原始视频是否有音频
    const audioTrack = await input.getPrimaryAudioTrack()
    const hasAudio = audioTrack !== null

    console.log('[VideoCompressionService] 压缩参数:', {
      resolution: targetResolution.label,
      width: targetResolution.width,
      height: targetResolution.height,
      videoBitrate: videoBitrate,
      videoBitrateMbps: (videoBitrate / 1_000_000).toFixed(2),
      frameRate,
      audioBitrate,
      audioBitrateKbps: (audioBitrate / 1000).toFixed(0),
      hasAudio: hasAudio,
      originalAudioInfo: audioTrack ? {
        codec: audioTrack.codec,
        channels: audioTrack.numberOfChannels,
        sampleRate: audioTrack.sampleRate
      } : '无音频'
    })

    // 创建转换配置（重要：只在有音频时才配置音频选项）
    const conversionConfig: any = {
      input,
      output,
      video: {
        width: targetResolution.width,
        height: targetResolution.height,
        fit: 'contain', // 保持宽高比
        codec: 'avc', // H.264
        bitrate: videoBitrate, // 精确控制视频比特率
        frameRate: frameRate, // 降低帧率减小文件大小
        // VBR 模式（更高效的压缩）
        bitrateMode: 'variable',
        // Quality 模式（更好的压缩质量）
        latencyMode: 'quality',
        // 增加关键帧间隔（减小文件大小）
        keyFrameInterval: 5
      }
    }

    // 只有当原始视频有音频时，才配置音频压缩
    if (hasAudio && audioTrack) {
      console.log('[VideoCompressionService] ✓ 检测到音频轨道，配置音频压缩...')

      // 关键修复：保持原始音频参数，避免声道转换和采样率转换失败
      const originalChannels = audioTrack.numberOfChannels
      const originalSampleRate = audioTrack.sampleRate

      // 根据声道数动态调整比特率
      // 单声道：64 kbps (微信策略)
      // 立体声：96 kbps (保证质量)
      const dynamicAudioBitrate = originalChannels === 1 ? 64_000 : 96_000

      console.log('[VideoCompressionService] 音频配置策略 (v2.1 修复):', {
        strategy: 'preserve-original',
        originalChannels,
        originalSampleRate,
        usedChannels: originalChannels,
        usedSampleRate: originalSampleRate,
        bitrate: dynamicAudioBitrate,
        bitrateKbps: (dynamicAudioBitrate / 1000).toFixed(0)
      })

      conversionConfig.audio = {
        numberOfChannels: originalChannels, // 保持原始声道数（避免转换失败）
        sampleRate: originalSampleRate, // 保持原始采样率（避免重采样失败）
        bitrate: dynamicAudioBitrate, // 动态比特率（根据声道数）
        codec: 'aac', // AAC 编码
        fullCodecString: 'mp4a.40.2' // 明确指定 AAC-LC 编码器（WebCodecs 标准）
      }
    } else {
      console.warn('[VideoCompressionService] ⚠️ 原始视频无音频轨道，将生成无声视频')
    }

    // 创建转换任务
    const conversion = await Conversion.init(conversionConfig)

    // 监听进度
    conversion.onProgress = (progress: number) => {
      onProgress?.(progress)
    }

    // 执行转换
    await conversion.execute()
    await output.finalize()

    // 获取压缩后的数据
    const compressedBuffer = output.target.buffer
    if (!compressedBuffer) {
      throw new Error('压缩失败：未能生成输出数据')
    }

    return new Blob([compressedBuffer], { type: 'video/mp4' })
  }

  /**
   * 根据比特率选择合适的分辨率（参考微信策略）
   *
   * 微信实测：640x336 用 439kbps
   * 经验公式（更激进）：
   * - 720p: 800-1500 kbps
   * - 480p: 400-800 kbps
   * - 360p: 200-400 kbps
   * - 270p: 100-200 kbps
   * - 240p: 50-100 kbps
   *
   * @param originalResolution 原始分辨率
   * @param targetBitrate 目标比特率（bps）
   * @returns 推荐的分辨率配置
   */
  private selectResolutionByBitrate(
    originalResolution: { width: number; height: number },
    targetBitrate: number
  ): ResolutionConfig {
    const bitrateKbps = targetBitrate / 1_000

    console.log('[VideoCompressionService] 选择分辨率 (微信策略):', {
      targetBitrateKbps: bitrateKbps.toFixed(0),
      originalResolution: `${originalResolution.width}x${originalResolution.height}`,
      referenceWeChatSettings: '640x336 @ 439kbps'
    })

    // 选择合适的分辨率（参考微信的激进策略）
    let selectedResolution: ResolutionConfig

    if (bitrateKbps >= 800) {
      // 800+ kbps：使用 720p
      selectedResolution = this.RESOLUTION_PRESETS[0] // 720p
    } else if (bitrateKbps >= 400) {
      // 400-800 kbps：使用 480p
      selectedResolution = this.RESOLUTION_PRESETS[1] // 480p
    } else if (bitrateKbps >= 200) {
      // 200-400 kbps：使用 360p
      selectedResolution = this.RESOLUTION_PRESETS[2] // 360p
    } else if (bitrateKbps >= 100) {
      // 100-200 kbps：使用 270p
      selectedResolution = this.RESOLUTION_PRESETS[3] // 270p
    } else {
      // <100 kbps：使用 240p
      selectedResolution = this.RESOLUTION_PRESETS[4] // 240p
    }

    // 确保不超过原始分辨率
    if (selectedResolution.width > originalResolution.width) {
      // 找到第一个不超过原始分辨率的预设
      for (const preset of this.RESOLUTION_PRESETS) {
        if (preset.width <= originalResolution.width) {
          selectedResolution = preset
          break
        }
      }
    }

    console.log('[VideoCompressionService] 最终选择:', {
      resolution: selectedResolution.label,
      dimensions: `${selectedResolution.width}x${selectedResolution.height}`,
      estimatedQuality: bitrateKbps >= 400 ? '优秀' : bitrateKbps >= 200 ? '良好' : '可接受'
    })

    return selectedResolution
  }

  /**
   * 获取下一个更低的分辨率
   */
  private getNextLowerResolution(currentResolution: ResolutionConfig): ResolutionConfig {
    const currentIndex = this.RESOLUTION_PRESETS.findIndex(
      preset => preset.label === currentResolution.label
    )

    if (currentIndex === -1 || currentIndex === this.RESOLUTION_PRESETS.length - 1) {
      // 已经是最低分辨率，进一步降低50%
      return {
        width: Math.floor(currentResolution.width * 0.7),
        height: Math.floor(currentResolution.height * 0.7),
        label: `${Math.floor(currentResolution.width * 0.7)}x${Math.floor(currentResolution.height * 0.7)}`
      }
    }

    return this.RESOLUTION_PRESETS[currentIndex + 1]
  }

  /**
   * 估算压缩后的文件大小
   * @param originalSize 原始文件大小（字节）
   * @param originalResolution 原始分辨率
   * @param targetResolution 目标分辨率
   * @returns 估算的压缩后文件大小（字节）
   */
  estimateCompressedSize(
    originalSize: number,
    originalResolution: { width: number; height: number },
    targetResolution: { width: number; height: number }
  ): number {
    const pixelRatio =
      (targetResolution.width * targetResolution.height) /
      (originalResolution.width * originalResolution.height)

    // 文件大小大约与像素数成正比
    return Math.floor(originalSize * pixelRatio)
  }
}

// 导出单例
export default new VideoCompressionService()
