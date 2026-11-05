/**
 * 图像处理工具函数
 * 用于 OCR 帧提取功能
 */

import imageCompression from 'browser-image-compression'

/**
 * 裁剪 Canvas 到指定区域
 * @param source 源 Canvas
 * @param x X 坐标（像素）
 * @param y Y 坐标（像素）
 * @param width 宽度（像素）
 * @param height 高度（像素）
 * @returns 裁剪后的新 Canvas
 */
export function cropCanvas(
  source: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number
): HTMLCanvasElement {
  // 创建新的 Canvas 用于存储裁剪结果
  const croppedCanvas = document.createElement('canvas')
  croppedCanvas.width = width
  croppedCanvas.height = height

  const ctx = croppedCanvas.getContext('2d')
  if (!ctx) {
    throw new Error('无法获取 Canvas 2D 上下文')
  }

  // 从源 Canvas 裁剪指定区域并绘制到新 Canvas
  ctx.drawImage(
    source,
    x, y, width, height,  // 源区域
    0, 0, width, height   // 目标区域
  )

  return croppedCanvas
}

/**
 * 合并多个 Canvas 为网格布局
 * @param canvases Canvas 数组
 * @param columns 列数
 * @param rows 行数
 * @param padding 间距（像素，默认 4）
 * @param backgroundColor 背景色（默认 '#000000'）
 * @returns 合并后的 Canvas
 */
export function mergeCanvasGrid(
  canvases: HTMLCanvasElement[],
  columns: number,
  rows: number,
  padding: number = 4,
  backgroundColor: string = '#000000'
): HTMLCanvasElement {
  if (canvases.length === 0) {
    throw new Error('Canvas 数组不能为空')
  }

  // 获取单个 Canvas 的尺寸（假设所有 Canvas 尺寸相同）
  const singleWidth = canvases[0].width
  const singleHeight = canvases[0].height

  // 计算合并后的 Canvas 尺寸
  const totalWidth = columns * singleWidth + (columns - 1) * padding
  const totalHeight = rows * singleHeight + (rows - 1) * padding

  // 创建合并后的 Canvas
  const mergedCanvas = document.createElement('canvas')
  mergedCanvas.width = totalWidth
  mergedCanvas.height = totalHeight

  const ctx = mergedCanvas.getContext('2d')
  if (!ctx) {
    throw new Error('无法获取 Canvas 2D 上下文')
  }

  // 填充背景色
  ctx.fillStyle = backgroundColor
  ctx.fillRect(0, 0, totalWidth, totalHeight)

  // 逐个绘制 Canvas 到网格
  for (let i = 0; i < canvases.length && i < columns * rows; i++) {
    const row = Math.floor(i / columns)
    const col = i % columns
    const x = col * (singleWidth + padding)
    const y = row * (singleHeight + padding)

    ctx.drawImage(canvases[i], x, y)
  }

  return mergedCanvas
}

/**
 * Canvas 转 Blob
 * @param canvas Canvas 对象
 * @param type 图像类型（默认 'image/jpeg'）
 * @param quality 质量（0-1，默认 0.9）
 * @returns Promise<Blob>
 */
export async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string = 'image/jpeg',
  quality: number = 0.9
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Canvas 转 Blob 失败'))
        }
      },
      type,
      quality
    )
  })
}

/**
 * Canvas 转 Base64 Data URL
 * @param canvas Canvas 对象
 * @param type 图像类型（默认 'image/jpeg'）
 * @param quality 质量（0-1，默认 0.9）
 * @returns Base64 Data URL 字符串
 */
export function canvasToDataURL(
  canvas: HTMLCanvasElement,
  type: string = 'image/jpeg',
  quality: number = 0.9
): string {
  return canvas.toDataURL(type, quality)
}

/**
 * Blob 转 Base64 Data URL
 * @param blob Blob 对象
 * @returns Promise<string>
 */
export async function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('FileReader result is not a string'))
      }
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Base64 Data URL 转 Blob
 * @param dataURL Base64 Data URL 字符串
 * @returns Blob 对象
 */
export function dataURLToBlob(dataURL: string): Blob {
  const arr = dataURL.split(',')
  const mimeMatch = arr[0].match(/:(.*?);/)
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg'
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }

  return new Blob([u8arr], { type: mime })
}

/**
 * 创建 Blob URL
 * @param blob Blob 对象
 * @returns Blob URL 字符串
 */
export function createBlobURL(blob: Blob): string {
  return URL.createObjectURL(blob)
}

/**
 * 释放 Blob URL
 * @param url Blob URL 字符串
 */
export function revokeBlobURL(url: string): void {
  URL.revokeObjectURL(url)
}

/**
 * 下载 Canvas 为图片文件
 * @param canvas Canvas 对象
 * @param filename 文件名（默认 'image.jpg'）
 * @param type 图像类型（默认 'image/jpeg'）
 * @param quality 质量（0-1，默认 0.9）
 */
export async function downloadCanvas(
  canvas: HTMLCanvasElement,
  filename: string = 'image.jpg',
  type: string = 'image/jpeg',
  quality: number = 0.9
): Promise<void> {
  const blob = await canvasToBlob(canvas, type, quality)
  const url = createBlobURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()

  // 释放 URL
  revokeBlobURL(url)
}

/**
 * 计算缩放后的尺寸（保持宽高比）
 * @param originalWidth 原始宽度
 * @param originalHeight 原始高度
 * @param targetWidth 目标宽度（可选）
 * @param targetHeight 目标高度（可选）
 * @returns { width: number, height: number }
 */
export function calculateScaledDimensions(
  originalWidth: number,
  originalHeight: number,
  targetWidth?: number,
  targetHeight?: number
): { width: number; height: number } {
  const aspectRatio = originalWidth / originalHeight

  if (targetWidth && targetHeight) {
    // 两者都指定，选择较小的缩放比例
    const scaleByWidth = targetWidth / originalWidth
    const scaleByHeight = targetHeight / originalHeight
    const scale = Math.min(scaleByWidth, scaleByHeight)
    return {
      width: Math.round(originalWidth * scale),
      height: Math.round(originalHeight * scale)
    }
  } else if (targetWidth) {
    // 仅指定宽度
    return {
      width: targetWidth,
      height: Math.round(targetWidth / aspectRatio)
    }
  } else if (targetHeight) {
    // 仅指定高度
    return {
      width: Math.round(targetHeight * aspectRatio),
      height: targetHeight
    }
  } else {
    // 都未指定，返回原始尺寸
    return {
      width: originalWidth,
      height: originalHeight
    }
  }
}

/**
 * 标准化框选区域坐标（转换为 0-1 之间的比例）
 * @param area 像素坐标区域
 * @param videoWidth 视频宽度
 * @param videoHeight 视频高度
 * @returns 标准化坐标区域
 */
export function normalizeSelectionArea(
  area: { x: number; y: number; width: number; height: number },
  videoWidth: number,
  videoHeight: number
): { x: number; y: number; width: number; height: number } {
  return {
    x: area.x / videoWidth,
    y: area.y / videoHeight,
    width: area.width / videoWidth,
    height: area.height / videoHeight
  }
}

/**
 * 反标准化框选区域坐标（转换为像素坐标）
 * @param normalizedArea 标准化坐标区域（0-1）
 * @param videoWidth 视频宽度
 * @param videoHeight 视频高度
 * @returns 像素坐标区域
 */
export function denormalizeSelectionArea(
  normalizedArea: { x: number; y: number; width: number; height: number },
  videoWidth: number,
  videoHeight: number
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.round(normalizedArea.x * videoWidth),
    y: Math.round(normalizedArea.y * videoHeight),
    width: Math.round(normalizedArea.width * videoWidth),
    height: Math.round(normalizedArea.height * videoHeight)
  }
}

/**
 * 限制坐标值在有效范围内
 * @param value 坐标值
 * @param min 最小值
 * @param max 最大值
 * @returns 限制后的值
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * 批量释放 Blob URL
 * @param urls Blob URL 数组
 */
export function revokeBlobURLs(urls: string[]): void {
  urls.forEach((url) => {
    if (url.startsWith('blob:')) {
      revokeBlobURL(url)
    }
  })
}

/**
 * 压缩图片 Blob（使用 browser-image-compression 实现高压缩率）
 * 目标：将 200KB 的图片压缩到 60KB 左右（约 70% 压缩率）
 * @param blob 原始图片 Blob
 * @param options 压缩选项
 * @returns Promise<{ blob: Blob, originalSize: number, compressedSize: number, compressionRatio: number }>
 */
export async function compressImageBlob(
  blob: Blob,
  options?: {
    maxSizeMB?: number           // 目标最大文件大小（MB），默认 0.15（150KB）
    maxWidthOrHeight?: number    // 最大宽度或高度，默认不限制
    quality?: number             // 初始质量 0-1，默认 0.7
    useWebWorker?: boolean       // 是否使用 Web Worker，默认 false（避免并发问题）
  }
): Promise<{
  blob: Blob
  originalSize: number
  compressedSize: number
  compressionRatio: number
}> {
  const {
    maxSizeMB = 0.15,           // 目标 150KB 以下（会自动调整质量直到达到目标）
    maxWidthOrHeight = 2500,    // 限制最大边长，对超大图片进行适度缩放
    quality = 0.7,              // 初始质量
    useWebWorker = false        // 禁用 Web Worker 避免并发问题
  } = options || {}

  const originalSize = blob.size

  try {
    // 将 Blob 转为 File（browser-image-compression 需要 File 对象）
    const file = new File([blob], 'image.jpg', { type: blob.type || 'image/jpeg' })

    // 使用 browser-image-compression 进行压缩
    const compressedBlob = await imageCompression(file, {
      maxSizeMB,                    // 目标文件大小
      maxWidthOrHeight,             // 最大边长
      initialQuality: quality,      // 初始质量
      useWebWorker,                 // 是否使用 Web Worker
      fileType: 'image/jpeg',       // 输出格式
      alwaysKeepResolution: false,  // 允许缩放以达到目标大小
      maxIteration: 10,             // 最多尝试 10 次来达到目标大小
    })

    const compressedSize = compressedBlob.size
    const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100

    return {
      blob: compressedBlob,
      originalSize,
      compressedSize,
      compressionRatio
    }
  } catch (error) {
    console.error('[ImageProcessor] 压缩失败，返回原始图片:', error)
    // 如果压缩失败，返回原始 Blob
    return {
      blob,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 0
    }
  }
}

/**
 * 批量压缩图片 Blob
 * @param blobs 图片 Blob 数组
 * @param options 压缩选项
 * @param onProgress 进度回调
 * @returns Promise<压缩结果数组>
 */
export async function compressImageBlobsBatch(
  blobs: Blob[],
  options?: {
    maxSizeMB?: number
    maxWidthOrHeight?: number
    quality?: number
    useWebWorker?: boolean
  },
  onProgress?: (current: number, total: number) => void
): Promise<Array<{
  blob: Blob
  originalSize: number
  compressedSize: number
  compressionRatio: number
}>> {
  const results: Array<{
    blob: Blob
    originalSize: number
    compressedSize: number
    compressionRatio: number
  }> = []

  for (let i = 0; i < blobs.length; i++) {
    const result = await compressImageBlob(blobs[i], options)
    results.push(result)
    onProgress?.(i + 1, blobs.length)
  }

  return results
}
