/**
 * OCR 帧提取服务
 *
 * 基于 FrameExtractionService，增加框选区域裁剪功能
 * 用于从视频中提取硬字幕区域的帧
 */

import { Input, ALL_FORMATS, BlobSource, CanvasSink } from 'mediabunny'
import { authenticatedFetch } from '@/features/auth/services/authService'
import type {
  ExtractedFrame,
  MergedFrameGroup,
  FrameSelectionArea,
  FrameExtractionOptions,
  FrameMergeOptions,
  OcrFrameExtractionStatus,
  OcrImageInput,
  OcrApiRequest,
  OcrApiResponse,
  UploadedFrameGroup
} from '../../types/material'
import {
  DEFAULT_FRAME_EXTRACTION_OPTIONS,
  DEFAULT_FRAME_MERGE_OPTIONS
} from '../../types/material'
import {
  cropCanvas,
  mergeCanvasGrid,
  canvasToDataURL,
  canvasToBlob,
  createBlobURL,
  clamp,
  compressImageBlob
} from '@/shared/utils/imageProcessor'
import { buildOcrImageInputFromGroup, mergeOcrTimestamps } from '../../utils/ocrSubtitleHelpers'
import type { ProjectSubtitleItem } from '../../types/project'

export const OCR_PARALLEL_MODELS = [
  'Qwen/Qwen3-VL-235B-A22B-Instruct',
  'Qwen/Qwen3-VL-32B-Instruct',
  'Qwen/Qwen3-VL-8B-Instruct',
  'Qwen/Qwen3-VL-30B-A3B-Instruct',
  'Qwen/Qwen3.5-4B'
] as const

const OCR_REQUEST_MAX_RETRIES = 2
const OCR_REQUEST_TIMEOUT_MS = 60_000
const OCR_RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504])

interface OcrRecognitionTask {
  imageInput: OcrImageInput | null
  label: string
}

export class OcrFrameService {
  private static instance: OcrFrameService

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private isRetryableStatus(status: number): boolean {
    return OCR_RETRYABLE_STATUS.has(status)
  }

  private isAbortError(error: unknown): error is Error | DOMException {
    return (
      (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError')
    )
  }

  private getRetryModel(initialModel: string, attempt: number): string {
    const modelIndex = OCR_PARALLEL_MODELS.indexOf(initialModel as typeof OCR_PARALLEL_MODELS[number])

    if (modelIndex === -1) {
      return initialModel
    }

    return OCR_PARALLEL_MODELS[(modelIndex + attempt) % OCR_PARALLEL_MODELS.length]
  }

  private async requestOcrWithRetry(
    apiBaseUrl: string,
    requestBody: OcrApiRequest,
    signal: AbortSignal | undefined,
    taskLabel: string,
    model: string
  ): Promise<OcrApiResponse | null> {
    let lastError: unknown = null

    for (let attempt = 0; attempt <= OCR_REQUEST_MAX_RETRIES; attempt++) {
      if (signal?.aborted) {
        const abortError = new Error('OCR 识别已取消')
        abortError.name = 'AbortError'
        throw abortError
      }

      const currentModel = this.getRetryModel(model, attempt)
      const timedRequestController = new AbortController()
      let didTimeout = false
      let parentAborted = false
      const timeoutId = setTimeout(() => {
        didTimeout = true
        timedRequestController.abort()
      }, OCR_REQUEST_TIMEOUT_MS)

      const handleParentAbort = () => {
        parentAborted = true
        timedRequestController.abort()
      }

      signal?.addEventListener('abort', handleParentAbort, { once: true })

      try {
        const response = await authenticatedFetch(`${apiBaseUrl}/api/v1/tools/ocr-images`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...requestBody,
            model: currentModel
          }),
          signal: timedRequestController.signal
        }, {
          missingTokenMessage: '未登录，无法调用 OCR 服务'
        })

        if (response.ok) {
          clearTimeout(timeoutId)
          signal?.removeEventListener('abort', handleParentAbort)
          return await response.json()
        }

        const errorText = await response.text()
        lastError = new Error(`${response.status}: ${errorText}`)

        const shouldRetry = this.isRetryableStatus(response.status) && attempt < OCR_REQUEST_MAX_RETRIES
        if (!shouldRetry) {
          console.error(`${taskLabel} 使用模型 ${currentModel} 识别失败:`, errorText)
          clearTimeout(timeoutId)
          signal?.removeEventListener('abort', handleParentAbort)
          return null
        }

        const retryDelay = 800 * (attempt + 1)
        console.warn(
          `${taskLabel} 使用模型 ${currentModel} 识别失败（${response.status}），` +
          `${retryDelay}ms 后进行第 ${attempt + 1}/${OCR_REQUEST_MAX_RETRIES} 次重试`
        )
        clearTimeout(timeoutId)
        signal?.removeEventListener('abort', handleParentAbort)
        await this.delay(retryDelay)
      } catch (error) {
        clearTimeout(timeoutId)
        signal?.removeEventListener('abort', handleParentAbort)

        if (parentAborted && this.isAbortError(error)) {
          throw error
        }

        lastError = error

        if (didTimeout && attempt < OCR_REQUEST_MAX_RETRIES) {
          const retryDelay = 800 * (attempt + 1)
          const nextModel = this.getRetryModel(model, attempt + 1)
          console.warn(
            `${taskLabel} 使用模型 ${currentModel} 请求超时（${OCR_REQUEST_TIMEOUT_MS / 1000}s），` +
            `切换到模型 ${nextModel}，${retryDelay}ms 后进行第 ${attempt + 1}/${OCR_REQUEST_MAX_RETRIES} 次重试`
          )
          await this.delay(retryDelay)
          continue
        }

        if (attempt >= OCR_REQUEST_MAX_RETRIES) {
          console.error(`${taskLabel} 使用模型 ${currentModel} 处理异常:`, error)
          return null
        }

        const retryDelay = 800 * (attempt + 1)
        const nextModel = this.getRetryModel(model, attempt + 1)
        console.warn(
          `${taskLabel} 使用模型 ${currentModel} 请求异常，` +
          `切换到模型 ${nextModel}，${retryDelay}ms 后进行第 ` +
          `${attempt + 1}/${OCR_REQUEST_MAX_RETRIES} 次重试`,
          error
        )
        await this.delay(retryDelay)
      }
    }

    if (lastError) {
      console.error(`${taskLabel} 使用模型 ${model} 最终失败:`, lastError)
    }

    return null
  }

  static getInstance(): OcrFrameService {
    if (!OcrFrameService.instance) {
      OcrFrameService.instance = new OcrFrameService()
    }
    return OcrFrameService.instance
  }

  /**
   * 提取视频帧（仅提取框选区域）
   * @param file 视频文件
   * @param videoDuration 视频时长（秒）
   * @param selectionArea 框选区域（如果为 null 则提取全帧）
   * @param options 提取选项
   * @param onProgress 进度回调
   * @returns 提取的帧数组
   */
  async extractFramesInArea(
    file: File,
    videoDuration: number,
    selectionArea: FrameSelectionArea | null,
    options?: Partial<FrameExtractionOptions>,
    onProgress?: (status: OcrFrameExtractionStatus) => void
  ): Promise<ExtractedFrame[]> {
    const mergedOptions = {
      ...DEFAULT_FRAME_EXTRACTION_OPTIONS,
      ...options
    }

    const {
      frameInterval,
      thumbnailWidth,
      thumbnailHeight,
      quality,
      format,
      preserveSourceResolution
    } = mergedOptions

    try {
      onProgress?.({
        isProcessing: true,
        progress: 0,
        stage: 'extracting',
        message: '正在初始化视频解码器...'
      })

      // 初始化 MediaBunny Input
      const input = new Input({
        formats: ALL_FORMATS,
        source: new BlobSource(file)
      })

      const videoTrack = await input.getPrimaryVideoTrack()
      if (!videoTrack) {
        throw new Error('无法读取视频轨道')
      }

      const decodable = await videoTrack.canDecode()
      if (!decodable) {
        throw new Error('视频无法解码，可能不支持该编码格式')
      }

      const sourceVideoWidth = Math.max(videoTrack.displayWidth, 1)
      const sourceVideoHeight = Math.max(videoTrack.displayHeight, 1)

      // 创建 CanvasSink
      const aspectRatio = sourceVideoWidth / sourceVideoHeight
      const targetWidth = preserveSourceResolution
        ? sourceVideoWidth
        : Math.max(Math.round(thumbnailWidth), 1)
      const targetHeight = preserveSourceResolution
        ? sourceVideoHeight
        : Math.max(
            thumbnailHeight && thumbnailHeight > 0
              ? Math.round(thumbnailHeight)
              : Math.round(targetWidth / aspectRatio),
            1
          )

      const sink = new CanvasSink(videoTrack, {
        width: targetWidth,
        height: targetHeight,
        fit: 'contain'
      })

      // 计算总帧数
      const totalFrames = Math.ceil(videoDuration / frameInterval)
      const frames: ExtractedFrame[] = []

      // 逐个提取帧
      for (let i = 0; i < totalFrames; i++) {
        const timestamp = i * frameInterval

        // 确保不超过视频时长
        if (timestamp >= videoDuration) {
          break
        }

        try {
          // 提取当前时间点的帧
          const result = await sink.getCanvas(timestamp)

          if (result?.canvas) {
            const sourceCanvas: HTMLCanvasElement =
              result.canvas instanceof HTMLCanvasElement
                ? result.canvas
                : (() => {
                    const convertedCanvas = document.createElement('canvas')
                    convertedCanvas.width = result.canvas.width
                    convertedCanvas.height = result.canvas.height
                    const context = convertedCanvas.getContext('2d')
                    if (context) {
                      context.drawImage(result.canvas as any, 0, 0)
                    }
                    return convertedCanvas
                  })()

            let finalCanvas: HTMLCanvasElement = sourceCanvas

            // 如果指定了框选区域，则裁剪
            if (selectionArea) {
              const canvasWidth = sourceCanvas.width
              const canvasHeight = sourceCanvas.height

              const baseWidth = Math.max(selectionArea.sourceWidth ?? sourceVideoWidth, 1)
              const baseHeight = Math.max(selectionArea.sourceHeight ?? sourceVideoHeight, 1)

              const normalizedX = clamp(selectionArea.x / baseWidth, 0, 1)
              const normalizedY = clamp(selectionArea.y / baseHeight, 0, 1)
              const normalizedWidth = clamp(selectionArea.width / baseWidth, 0, 1)
              const normalizedHeight = clamp(selectionArea.height / baseHeight, 0, 1)

              const effectiveWidth = Math.min(normalizedWidth, 1 - normalizedX)
              const effectiveHeight = Math.min(normalizedHeight, 1 - normalizedY)

              if (effectiveWidth > 0 && effectiveHeight > 0) {
                const canvasAspect = canvasWidth / canvasHeight
                const videoAspect = baseWidth / baseHeight

                let videoDisplayWidth: number
                let videoDisplayHeight: number
                let offsetX: number
                let offsetY: number

                if (canvasAspect > videoAspect) {
                  videoDisplayHeight = canvasHeight
                  videoDisplayWidth = videoDisplayHeight * videoAspect
                  offsetX = (canvasWidth - videoDisplayWidth) / 2
                  offsetY = 0
                } else {
                  videoDisplayWidth = canvasWidth
                  videoDisplayHeight = videoDisplayWidth / videoAspect
                  offsetX = 0
                  offsetY = (canvasHeight - videoDisplayHeight) / 2
                }

                const cropX = clamp(
                  Math.round(offsetX + normalizedX * videoDisplayWidth),
                  0,
                  canvasWidth
                )
                const cropY = clamp(
                  Math.round(offsetY + normalizedY * videoDisplayHeight),
                  0,
                  canvasHeight
                )

                const maxCropWidth = Math.max(0, canvasWidth - cropX)
                const maxCropHeight = Math.max(0, canvasHeight - cropY)

                if (maxCropWidth > 0 && maxCropHeight > 0) {
                  const cropWidth = clamp(
                    Math.round(effectiveWidth * videoDisplayWidth),
                    0,
                    maxCropWidth
                  )
                  const cropHeight = clamp(
                    Math.round(effectiveHeight * videoDisplayHeight),
                    0,
                    maxCropHeight
                  )

                  if (cropWidth > 0 && cropHeight > 0) {
                    finalCanvas = cropCanvas(
                      sourceCanvas,
                      cropX,
                      cropY,
                      cropWidth,
                      cropHeight
                    )
                  }
                }
              }
            }

            // 转换为 Base64
            const imageUrl = canvasToDataURL(finalCanvas, `image/${format}`, quality)

            // 转换为 Blob（可选，用于上传）
            const blob = await canvasToBlob(finalCanvas, `image/${format}`, quality)

            frames.push({
              id: `frame_${i + 1}_${timestamp.toFixed(2)}`,
              timestamp,
              imageUrl,
              blob,
              width: finalCanvas.width,
              height: finalCanvas.height,
              selectionArea: selectionArea ? { ...selectionArea } : undefined
            })
          }
        } catch (error) {
          console.error(`[OcrFrameService] 提取帧 ${i + 1} 失败:`, error)
        }

        // 更新进度
        const progress = Math.round(((i + 1) / totalFrames) * 100)
        onProgress?.({
          isProcessing: true,
          progress,
          stage: 'extracting',
          currentFrame: i + 1,
          totalFrames,
          message: `正在提取第 ${i + 1}/${totalFrames} 帧...`
        })
      }

      onProgress?.({
        isProcessing: false,
        progress: 100,
        stage: 'completed',
        message: `成功提取 ${frames.length} 帧`
      })

      return frames
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '帧提取失败'
      onProgress?.({
        isProcessing: false,
        progress: 0,
        stage: 'failed',
        error: errorMessage,
        message: errorMessage
      })
      throw new Error(`OCR 帧提取失败: ${errorMessage}`)
    }
  }

  /**
   * 合并帧生成拼接图（支持网格或竖排）
   * @param frames 提取的帧数组
   * @param options 合并选项
   * @param onProgress 进度回调
   * @returns 合并后的帧组数组
   */
  async mergeFrames(
    frames: ExtractedFrame[],
    options?: Partial<FrameMergeOptions>,
    onProgress?: (status: OcrFrameExtractionStatus) => void
  ): Promise<MergedFrameGroup[]> {
    const mergedOptions = {
      ...DEFAULT_FRAME_MERGE_OPTIONS,
      ...options
    }

    const {
      columns,
      rows,
      padding,
      backgroundColor,
      quality,
      format
    } = mergedOptions

    const framesPerGroup = columns * rows
    const totalGroups = Math.ceil(frames.length / framesPerGroup)
    const mergedGroups: MergedFrameGroup[] = []

    try {
      onProgress?.({
        isProcessing: true,
        progress: 0,
        stage: 'merging',
        message: '正在合并帧...'
      })

      for (let groupIndex = 0; groupIndex < totalGroups; groupIndex++) {
        const startIdx = groupIndex * framesPerGroup
        const endIdx = Math.min(startIdx + framesPerGroup, frames.length)
        const groupFrames = frames.slice(startIdx, endIdx)

        // 将 Base64 转换为 Canvas
        const canvases: HTMLCanvasElement[] = []
        for (const frame of groupFrames) {
          const canvas = await this.dataURLToCanvas(frame.imageUrl)
          canvases.push(canvas)
        }

        // 合并为网格或竖排拼接
        const mergedCanvas =
          columns === 1
            ? this.createVerticalStripCanvas(groupFrames, canvases, padding, backgroundColor)
            : mergeCanvasGrid(canvases, columns, rows, padding, backgroundColor)

        // 转换为 Base64 和 Blob
        const mergedImageUrl = canvasToDataURL(mergedCanvas, `image/${format}`, quality)
        const mergedBlob = await canvasToBlob(mergedCanvas, `image/${format}`, quality)

        mergedGroups.push({
          id: `group_${groupIndex + 1}`,
          startTime: groupFrames[0].timestamp,
          endTime: groupFrames[groupFrames.length - 1].timestamp,
          frameCount: groupFrames.length,
          frames: groupFrames,
          mergedImageUrl,
          mergedBlob,
          layout: {
            columns,
            rows: columns === 1 ? groupFrames.length : rows,
            padding,
            orientation: columns === 1 ? 'vertical' : 'grid'
          }
        })

        // 更新进度
        const progress = Math.round(((groupIndex + 1) / totalGroups) * 100)
        onProgress?.({
          isProcessing: true,
          progress,
          stage: 'merging',
          message: `正在合并第 ${groupIndex + 1}/${totalGroups} 组...`
        })
      }

      onProgress?.({
        isProcessing: false,
        progress: 100,
        stage: 'completed',
        message: `成功合并 ${mergedGroups.length} 组帧`
      })

      return mergedGroups
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '帧合并失败'
      onProgress?.({
        isProcessing: false,
        progress: 0,
        stage: 'failed',
        error: errorMessage,
        message: errorMessage
      })
      throw new Error(`帧合并失败: ${errorMessage}`)
    }
  }

  /**
   * 导出合并后的帧组（生成下载链接）
   * @param mergedGroups 合并的帧组
   * @returns Blob URL 数组
   */
  exportMergedFrames(mergedGroups: MergedFrameGroup[]): string[] {
    return mergedGroups.map((group) => {
      if (group.mergedBlob) {
        return createBlobURL(group.mergedBlob)
      }
      return group.mergedImageUrl
    })
  }

  /**
   * 提取并合并（一站式方法）
   * @param file 视频文件
   * @param videoDuration 视频时长
   * @param selectionArea 框选区域
   * @param onProgress 进度回调
   * @returns 合并后的帧组
   */
  async extractAndMerge(
    file: File,
    videoDuration: number,
    selectionArea: FrameSelectionArea | null,
    onProgress?: (status: OcrFrameExtractionStatus) => void
  ): Promise<MergedFrameGroup[]> {
    // 1. 提取帧（0-70% 进度）
    const frames = await this.extractFramesInArea(
      file,
      videoDuration,
      selectionArea,
      undefined,
      (status) => {
        if (status.progress !== undefined) {
          onProgress?.({
            ...status,
            progress: Math.round(status.progress * 0.7)
          })
        }
      }
    )

    // 2. 合并帧（70-100% 进度）
    const mergedGroups = await this.mergeFrames(
      frames,
      undefined,
      (status) => {
        if (status.progress !== undefined) {
          onProgress?.({
            ...status,
            progress: 70 + Math.round(status.progress * 0.3)
          })
        }
      }
    )

    return mergedGroups
  }

  /**
   * 工具方法：Base64 Data URL 转 Canvas
   */
  private async dataURLToCanvas(dataURL: string): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0)
          resolve(canvas)
        } else {
          reject(new Error('无法获取 Canvas 2D 上下文'))
        }
      }
      img.onerror = () => reject(new Error('图片加载失败'))
      img.src = dataURL
    })
  }

  /**
   * 将帧竖向拼接并绘制时间戳标签
   */
  private createVerticalStripCanvas(
    frames: ExtractedFrame[],
    canvases: HTMLCanvasElement[],
    padding: number,
    backgroundColor: string
  ): HTMLCanvasElement {
    if (canvases.length === 0) {
      throw new Error('无法拼接空的帧列表')
    }

    const singleWidth = canvases[0].width
    const singleHeight = canvases[0].height

    const gap = Math.max(padding, 4)
    const margin = Math.max(Math.round(gap * 1.5), 12)

    const totalWidth = singleWidth + margin * 2
    const totalHeight =
      canvases.length * singleHeight + (canvases.length - 1) * gap + margin * 2

    const mergedCanvas = document.createElement('canvas')
    mergedCanvas.width = totalWidth
    mergedCanvas.height = totalHeight

    const ctx = mergedCanvas.getContext('2d')
    if (!ctx) {
      throw new Error('无法获取 Canvas 2D 上下文')
    }

    // 背景
    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, totalWidth, totalHeight)

    const fontSize = Math.max(Math.round(singleHeight * 0.12), 32)
    ctx.font = `bold ${fontSize}px "Inter", "PingFang SC", "Helvetica Neue", Arial, sans-serif`
    ctx.textBaseline = 'top'

    const labelPaddingX = 12
    const labelPaddingY = 6

    canvases.forEach((canvas, index) => {
      const y = margin + index * (singleHeight + gap)
      ctx.drawImage(canvas, margin, y, singleWidth, singleHeight)

      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
      ctx.strokeRect(margin - 1, y - 1, singleWidth + 2, singleHeight + 2)

      const frame = frames[index]
      const label = this.formatTimestampLabel(frame?.timestamp ?? 0)

      const metrics = ctx.measureText(label)
      const labelWidth = metrics.width + labelPaddingX * 2
      const labelHeight = fontSize + labelPaddingY * 2

      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
      ctx.fillRect(margin, y, labelWidth, labelHeight)

      ctx.fillStyle = '#ffffff'
      ctx.fillText(label, margin + labelPaddingX, y + labelPaddingY)
    })

    return mergedCanvas
  }

  private formatTimestampLabel(seconds: number): string {
    return seconds.toFixed(2)
  }

  /**
   * 调用 OCR API 识别图片中的文字，并合并相同字幕
   * 每次只发送一张图片，但会以 5 个模型并发调度识别，最后统一合并所有识别结果
   * @param frames 提取的帧数组（使用单帧，不使用合并后的图片）
   * @param onProgress 进度回调
   * @returns 合并后的字幕数组（按时间排序，相同字幕已合并）
   */
  async recognizeFrames(
    frames: ExtractedFrame[],
    onProgress?: (status: OcrFrameExtractionStatus) => void
  ): Promise<ProjectSubtitleItem[]> {
    if (frames.length === 0) {
      return []
    }

    const tasks: OcrRecognitionTask[] = frames.map((frame, index) => ({
      label: `第 ${index + 1} 帧`,
      imageInput: {
        type: 'base64' as const,
        data: frame.imageUrl,
        mime_type: frame.imageUrl.startsWith('data:image/png')
          ? 'image/png'
          : frame.imageUrl.startsWith('data:image/webp')
          ? 'image/webp'
          : 'image/jpeg'
      }
    }))

    return this.recognizeTaskItems(tasks, '帧', onProgress)
  }

  /**
   * 压缩合并后的帧组（使用 browser-image-compression 实现高压缩率）
   * 目标：将 200KB 的图片压缩到 60-80KB 左右（约 60-70% 压缩率）
   * @param mergedGroups 合并的帧组数组
   * @param onProgress 压缩进度回调
   * @returns 压缩后的帧组数组
   */
  async compressMergedGroups(
    mergedGroups: MergedFrameGroup[],
    onProgress?: (status: OcrFrameExtractionStatus) => void
  ): Promise<MergedFrameGroup[]> {
    if (mergedGroups.length === 0) {
      return []
    }

    const total = mergedGroups.length
    const compressedGroups: MergedFrameGroup[] = []
    let totalOriginalSize = 0
    let totalCompressedSize = 0

    try {
      onProgress?.({
        isProcessing: true,
        progress: 0,
        stage: 'merging',
        message: '正在压缩图片...'
      })

      for (let i = 0; i < mergedGroups.length; i++) {
        const group = mergedGroups[i]

        if (!group.mergedBlob) {
          throw new Error(`帧组 ${group.id} 缺少 Blob 数据`)
        }

        // 使用 browser-image-compression 进行高压缩率处理
        // 目标：将 200KB 压缩到 60-80KB 左右（约 60-70% 压缩率）
        const compressionResult = await compressImageBlob(group.mergedBlob, {
          maxSizeMB: 0.05,           // 目标 80KB（单个合并图的目标大小）
          maxWidthOrHeight: 2200,    // 最大边长 2500px（保证 OCR 清晰度）
          quality: 0.60,             // 初始质量
          useWebWorker: false        // 禁用 Web Worker 避免并发问题
        })

        totalOriginalSize += compressionResult.originalSize
        totalCompressedSize += compressionResult.compressedSize

        // 将压缩后的 Blob 转为 DataURL（用于预览）
        const compressedDataURL = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(compressionResult.blob)
        })

        // 创建压缩后的帧组
        compressedGroups.push({
          ...group,
          mergedBlob: compressionResult.blob,
          mergedImageUrl: compressedDataURL
        })

        // 更新进度
        const progress = Math.round(((i + 1) / total) * 100)
        onProgress?.({
          isProcessing: true,
          progress,
          stage: 'merging',
          message: `正在压缩第 ${i + 1}/${total} 张图片...`
        })
      }

      const compressionRatio = ((totalOriginalSize - totalCompressedSize) / totalOriginalSize) * 100
      const savedMB = (totalOriginalSize - totalCompressedSize) / (1024 * 1024)

      onProgress?.({
        isProcessing: false,
        progress: 100,
        stage: 'completed',
        message: `压缩完成！节省空间 ${savedMB.toFixed(2)} MB (${compressionRatio.toFixed(1)}%)`
      })

      console.log('[OcrFrameService] 压缩统计:', {
        总图片数: total,
        原始大小: `${(totalOriginalSize / (1024 * 1024)).toFixed(2)} MB`,
        压缩后大小: `${(totalCompressedSize / (1024 * 1024)).toFixed(2)} MB`,
        节省空间: `${savedMB.toFixed(2)} MB`,
        压缩比: `${compressionRatio.toFixed(1)}%`
      })

      return compressedGroups
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '图片压缩失败'
      onProgress?.({
        isProcessing: false,
        progress: 0,
        stage: 'failed',
        error: errorMessage,
        message: errorMessage
      })
      throw new Error(`图片压缩失败: ${errorMessage}`)
    }
  }

  /**
   * 识别已上传到 R2 的帧组（使用 R2 URL 而非 Base64），并自动合并相同字幕
   * @param uploadedGroups 已上传的帧组数组
   * @param onProgress 进度回调
   * @returns 合并后的字幕数组（按时间排序，相同字幕已合并）
   */
  async recognizeUploadedGroups(
    uploadedGroups: UploadedFrameGroup[],
    onProgress?: (status: OcrFrameExtractionStatus) => void,
    options?: { signal?: AbortSignal }
  ): Promise<ProjectSubtitleItem[]> {
    return this.recognizeMergedGroups(uploadedGroups, onProgress, options)
  }

  /**
   * 识别合并后的帧组，优先直接发送 base64 Data URL；历史项目若仍保留 R2 URL 也可兼容识别。
   * @param mergedGroups 合并后的帧组数组
   * @param onProgress 进度回调
   * @returns 合并后的字幕数组（按时间排序，相同字幕已合并）
   */
  async recognizeMergedGroups(
    mergedGroups: MergedFrameGroup[],
    onProgress?: (status: OcrFrameExtractionStatus) => void,
    options?: { signal?: AbortSignal }
  ): Promise<ProjectSubtitleItem[]> {
    if (mergedGroups.length === 0) {
      return []
    }

    const tasks: OcrRecognitionTask[] = mergedGroups.map((group, index) => ({
      label: `第 ${index + 1} 组`,
      imageInput: buildOcrImageInputFromGroup(group)
    }))

    tasks.forEach((task, index) => {
      if (!task.imageInput) {
        console.warn(
          `[OcrFrameService] 第 ${index + 1} 组缺少可识别图片数据，已跳过`,
          mergedGroups[index]?.id
        )
      }
    })

    return this.recognizeTaskItems(tasks, '组', onProgress, options)
  }

  private async recognizeTaskItems(
    tasks: OcrRecognitionTask[],
    unitLabel: '帧' | '组',
    onProgress?: (status: OcrFrameExtractionStatus) => void,
    options?: { signal?: AbortSignal }
  ): Promise<ProjectSubtitleItem[]> {
    const signal = options?.signal
    const totalTasks = tasks.length
    const allTimestamps: string[] = []
    const allTexts: string[] = []
    let processedTasks = 0
    let nextTaskIndex = 0

    const createAbortError = () => {
      const error = new Error('OCR 识别已取消')
      error.name = 'AbortError'
      return error
    }
    const throwIfAborted = () => {
      if (signal?.aborted) {
        throw createAbortError()
      }
    }

    try {
      throwIfAborted()

      onProgress?.({
        isProcessing: true,
        progress: 0,
        stage: 'recognizing',
        message: '正在准备 OCR 识别...',
        currentFrame: 0,
        totalFrames: totalTasks
      })

      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

      const updateProgress = () => {
        const currentProgress = Math.round((processedTasks / totalTasks) * 100)
        onProgress?.({
          isProcessing: true,
          progress: currentProgress,
          stage: 'recognizing',
          currentFrame: processedTasks,
          totalFrames: totalTasks,
          message: `正在并发识别 ${processedTasks}/${totalTasks} ${unitLabel}...`
        })
      }

      const worker = async (model: string) => {
        while (true) {
          throwIfAborted()

          const currentIndex = nextTaskIndex
          nextTaskIndex += 1

          if (currentIndex >= tasks.length) {
            return
          }

          const task = tasks[currentIndex]
          if (!task.imageInput) {
            processedTasks += 1
            updateProgress()
            continue
          }

          const requestBody: OcrApiRequest = {
            images: [task.imageInput],
            model
          }

          try {
            const apiResponse = await this.requestOcrWithRetry(
              apiBaseUrl,
              requestBody,
              signal,
              task.label,
              model
            )

            if (apiResponse?.timestamps && apiResponse.text) {
              allTimestamps.push(...apiResponse.timestamps)
              allTexts.push(...apiResponse.text)
            }
          } catch (taskError) {
            if (this.isAbortError(taskError)) {
              throw taskError
            }
            if (taskError instanceof Error && /认证失败|未登录|Authentication required/.test(taskError.message)) {
              throw taskError
            }
            console.error(`${task.label} 使用模型 ${model} 处理异常:`, taskError)
          } finally {
            processedTasks += 1
            updateProgress()
          }
        }
      }

      await Promise.all(OCR_PARALLEL_MODELS.map((model) => worker(model)))

      const frameInterval = DEFAULT_FRAME_EXTRACTION_OPTIONS.frameInterval
      const mergedSubtitles = mergeOcrTimestamps(allTimestamps, allTexts, frameInterval)

      onProgress?.({
        isProcessing: false,
        progress: 100,
        stage: 'completed',
        message: `成功识别并合并为 ${mergedSubtitles.length} 条字幕`
      })

      return mergedSubtitles
    } catch (error) {
      if (this.isAbortError(error)) {
        onProgress?.({
          isProcessing: false,
          progress: Math.round((processedTasks / totalTasks) * 100),
          stage: 'previewing',
          message: 'OCR 识别已取消'
        })
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : 'OCR 识别失败'
      onProgress?.({
        isProcessing: false,
        progress: 0,
        stage: 'failed',
        error: errorMessage,
        message: errorMessage
      })
      throw new Error(`OCR 识别失败: ${errorMessage}`)
    }
  }

  /**
   * 导出 OCR 识别结果为 JSON 文件（ASR格式）
   * @param results 合并后的字幕数组
   * @param filename 文件名（默认为 'ocr-subtitles.json'）
   */
  exportRecognitionResults(results: ProjectSubtitleItem[], filename = 'ocr-subtitles.json'): void {
    // 转换为ASR格式
    const asrFormat = results.reduce<Record<string, ProjectSubtitleItem>>((acc, subtitle, index) => {
      acc[String(index + 1)] = subtitle
      return acc
    }, {})

    const exportData = {
      subtitle: asrFormat,
      metadata: {
        total_segments: results.length,
        source: 'ocr',
        exported_at: new Date().toISOString()
      }
    }

    const jsonContent = JSON.stringify(exportData, null, 2)
    const blob = new Blob([jsonContent], { type: 'application/json' })
    const url = createBlobURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    // 清理 Blob URL
    URL.revokeObjectURL(url)
  }
}

export default OcrFrameService.getInstance()
