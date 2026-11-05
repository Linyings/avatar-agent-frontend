/**
 * 剪映草稿生成 - File System Access API 实现
 * 直接在用户磁盘上创建草稿文件夹，避免内存溢出
 * 仅支持 Chrome/Edge 86+ 浏览器
 */

import type { DraftBuildResult } from './draftBuilder'
import type { ProgressCallback } from './types'
import type { ExportResult } from './index'

/**
 * 检测浏览器是否支持 File System Access API
 */
export function detectFileSystemSupport(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showDirectoryPicker' in window &&
    typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
  )
}

/**
 * 流式写入文件
 * 支持 string 和 Blob 类型
 */
async function writeFileStreaming(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
  content: string | Blob
): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()

  try {
    if (typeof content === 'string') {
      await writable.write(content)
      await writable.close()
      return
    } else {
      // Blob 使用流式写入
      const stream = content.stream()
      await stream.pipeTo(writable)
    }
  } catch (error) {
    await writable.abort()
    throw error
  }
}

/**
 * 分块复制视频文件（避免内存峰值）
 * 每次处理 64MB
 */
async function copyVideoFileStreaming(
  fileHandle: FileSystemFileHandle,
  videoFile: File,
  onProgress?: (percent: number) => void
): Promise<void> {
  const writable = await fileHandle.createWritable()
  const chunkSize = 64 * 1024 * 1024 // 64MB

  try {
    let offset = 0

    while (offset < videoFile.size) {
      const end = Math.min(offset + chunkSize, videoFile.size)
      const chunk = videoFile.slice(offset, end)
      const buffer = await chunk.arrayBuffer()

      await writable.write(buffer)

      offset = end
      const progress = Math.min(100, (offset / videoFile.size) * 100)
      onProgress?.(progress)
    }

    await writable.close()
  } catch (error) {
    await writable.abort()
    throw error
  }
}

/**
 * 创建文件夹（如果不存在）
 */
async function ensureDirectory(
  parentHandle: FileSystemDirectoryHandle,
  name: string
): Promise<FileSystemDirectoryHandle> {
  return await parentHandle.getDirectoryHandle(name, { create: true })
}

/**
 * 格式化错误信息
 */
function formatError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return '用户取消了文件夹选择'
    }

    if (error.name === 'NotAllowedError') {
      return '没有权限访问该文件夹，请选择其他位置或检查浏览器权限设置'
    }

    if (error.name === 'QuotaExceededError') {
      return '磁盘空间不足，请清理磁盘后重试'
    }

    if (error.name === 'NotFoundError') {
      return '文件或文件夹不存在，可能已被删除'
    }

    if (error.name === 'InvalidStateError') {
      return '文件系统状态异常，请重试'
    }

    return `创建草稿失败：${error.message}`
  }

  return '创建草稿时发生未知错误'
}

/**
 * 请求用户选择文件夹（必须在用户交互事件中调用）
 */
export async function requestDirectoryHandle(): Promise<FileSystemDirectoryHandle> {
  const picker = (
    window as Window & {
      showDirectoryPicker?: (options?: {
        mode?: 'read' | 'readwrite'
        startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos'
      }) => Promise<FileSystemDirectoryHandle>
    }
  ).showDirectoryPicker

  if (!picker) {
    throw new Error('浏览器不支持 File System Access API')
  }

  try {
    return await picker({
      mode: 'readwrite',
      startIn: 'documents'
    })
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('用户取消了文件夹选择')
    }
    throw error
  }
}

/**
 * 导出草稿到文件系统（主函数）
 * 使用 File System Access API 直接创建文件夹和文件
 *
 * @param buildResult 草稿构建结果
 * @param baseDirHandle 用户选择的目录句柄
 * @param onProgress 进度回调
 * @returns 导出结果
 */
export async function exportDirectlyToFileSystem(
  buildResult: DraftBuildResult,
  baseDirHandle: FileSystemDirectoryHandle,
  onProgress?: ProgressCallback
): Promise<ExportResult> {
  const { draftId, draft, meta, videoFile, audioFiles } = buildResult

  try {
    onProgress?.({
      stage: 'creating',
      message: '正在创建草稿文件夹...',
      progress: 5
    })

    // ===== 2. 创建草稿文件夹结构 =====
    const draftFolder = await ensureDirectory(baseDirHandle, draftId)
    const assetsFolder = await ensureDirectory(draftFolder, 'assets')
    const videoFolder = await ensureDirectory(assetsFolder, 'video')
    const audioFolder = await ensureDirectory(assetsFolder, 'audio')

    onProgress?.({
      stage: 'writing',
      message: '正在写入配置文件...',
      progress: 10
    })

    // ===== 3. 写入 JSON 配置文件 =====
    await writeFileStreaming(
      draftFolder,
      'draft_info.json',
      JSON.stringify(draft, null, 2)
    )

    onProgress?.({
      stage: 'writing',
      message: '正在写入元数据...',
      progress: 15
    })

    await writeFileStreaming(
      draftFolder,
      'draft_meta_info.json',
      JSON.stringify(meta, null, 2)
    )

    // ===== 4. 写入音频文件 =====
    const audioCount = audioFiles.size
    if (audioCount > 0) {
      let currentAudio = 0

      for (const [path, blob] of audioFiles.entries()) {
        currentAudio++

        // 提取文件名（支持 Windows 和 Unix 路径分隔符）
        const fileName = path.split(/[/\\]/).pop() || `audio_${Date.now()}.mp3`

        onProgress?.({
          stage: 'writing',
          message: `正在写入音频文件 ${currentAudio}/${audioCount}...`,
          progress: 15 + Math.floor((currentAudio / audioCount) * 25),
          currentItem: currentAudio,
          totalItems: audioCount
        })

        await writeFileStreaming(audioFolder, fileName, blob)
      }
    }

    onProgress?.({
      stage: 'writing',
      message: '正在复制视频文件...',
      progress: 40
    })

    // ===== 5. 复制视频文件（分块处理） =====
    const videoFileHandle = await videoFolder.getFileHandle(videoFile.name, {
      create: true
    })

    await copyVideoFileStreaming(videoFileHandle, videoFile, (percent) => {
      // 视频复制占 40-100% 的进度
      const totalProgress = 40 + Math.floor(percent * 0.6)

      onProgress?.({
        stage: 'writing',
        message: `正在复制视频文件 ${percent.toFixed(1)}%...`,
        progress: totalProgress
      })
    })

    // ===== 6. 完成 =====
    onProgress?.({
      stage: 'complete',
      message: '草稿创建完成！',
      progress: 100
    })

    return {
      success: true,
      draftId,
      message: `草稿已创建成功，可直接在剪映中打开\n位置：${baseDirHandle.name}/${draftId}`
    }
  } catch (error: unknown) {
    console.error('[fileSystemExporter] 导出失败:', error)

    const errorMessage = formatError(error)
    throw new Error(errorMessage)
  }
}

/**
 * 检查浏览器和文件大小，返回导出建议
 */
export function getExportRecommendation(videoSize: number): {
  canExport: boolean
  useFileSystem: boolean
  message: string
  warnings?: string[]
} {
  const supportsFS = detectFileSystemSupport()
  const sizeInGB = videoSize / (1024 * 1024 * 1024)
  const sizeLimit = 1 * 1024 * 1024 * 1024 // 1GB

  if (supportsFS) {
    // 支持 File System API，可以处理任意大小
    return {
      canExport: true,
      useFileSystem: true,
      message: '您的浏览器支持直接创建草稿，无需下载 ZIP 文件',
      warnings:
        sizeInGB > 5
          ? [`视频文件较大 (${sizeInGB.toFixed(2)}GB)，复制可能需要几分钟时间`]
          : undefined
    }
  }

  // 不支持 File System API
  if (videoSize < sizeLimit) {
    // 小文件可以使用 ZIP 降级方案
    return {
      canExport: true,
      useFileSystem: false,
      message: '将以 ZIP 方式导出（需手动解压）',
      warnings: [
        '建议使用 Chrome 或 Edge 86+ 版本获得更好体验',
        '大文件可能导致浏览器卡顿'
      ]
    }
  }

  // 大文件 + 不支持 API = 阻断
  return {
    canExport: false,
    useFileSystem: false,
    message: '当前浏览器不支持大文件导出',
    warnings: [
      `视频文件 ${sizeInGB.toFixed(2)}GB 超出限制（最大 1GB）`,
      '请使用 Chrome 或 Edge 86+ 版本',
      '或将视频文件压缩至 1GB 以下'
    ]
  }
}
