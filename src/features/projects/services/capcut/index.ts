/**
 * 剪映草稿生成 - 统一导出接口
 * 智能选择导出方式：优先 File System API，降级到 ZIP
 */

import type { ScriptItem } from '@/shared/types'
import { buildDraft, type DraftBuildResult } from './draftBuilder'
import { exportAsZip } from './zipExporter'
import {
  detectFileSystemSupport,
  exportDirectlyToFileSystem
} from './fileSystemExporter'
import type { ProgressCallback, BrowserCapability, ExtraAudioAsset } from './types'

/**
 * 导出选项
 */
export interface ExportOptions {
  /** 剪映草稿目录的绝对路径（用于生成剪映可识别的素材绝对路径） */
  draftPath: string
  /** 进度回调 */
  onProgress?: ProgressCallback
  /** 文件系统目录句柄（File System API 模式使用） */
  dirHandle?: FileSystemDirectoryHandle
  /** 需要随草稿一起导出的额外音频素材，例如通用模式背景音乐 */
  extraAudioAssets?: ExtraAudioAsset[]
}

/**
 * 导出结果
 */
export interface ExportResult {
  success: boolean
  draftId: string
  message: string
}

/**
 * 导出剪映草稿（主入口）
 * 智能选择导出方式：
 * 1. 支持 File System API：直接创建草稿到磁盘
 * 2. 不支持 + 视频 < 1GB：降级到 ZIP
 * 3. 不支持 + 视频 >= 1GB：阻断并提示
 *
 * @param videoFile 视频文件
 * @param scriptItems 脚本数据
 * @param options 导出选项
 */
export async function exportToCapcut(
  videoFile: File,
  scriptItems: ScriptItem[],
  options: ExportOptions
): Promise<ExportResult> {
  const { draftPath, dirHandle, onProgress, extraAudioAssets = [] } = options
  const sanitizedDraftPath = draftPath.trim()

  if (!sanitizedDraftPath) {
    throw new Error('草稿目录路径不能为空，请提供剪映草稿目录的绝对路径')
  }

  try {
    // 检测导出策略
    const capability = checkCompatibility(videoFile.size)

    if (capability.strategy === 'blocked') {
      // 阻断：大文件 + 不支持 API
      const errorMessage =
        capability.limitations?.join('\n') || '视频文件过大，当前浏览器不支持'
      throw new Error(errorMessage)
    }

    // 根据策略选择导出方式
    if (capability.strategy === 'filesystem') {
      // File System Access API 导出
      if (!dirHandle) {
        throw new Error('File System API 模式需要提供 dirHandle')
      }

      // 构建草稿
      const buildResult: DraftBuildResult = await buildDraft(
        videoFile,
        scriptItems,
        sanitizedDraftPath,
        onProgress,
        extraAudioAssets
      )

      return await exportDirectlyToFileSystem(buildResult, dirHandle, onProgress)
    } else {
      // 降级：ZIP 导出
      const buildResult: DraftBuildResult = await buildDraft(
        videoFile,
        scriptItems,
        sanitizedDraftPath,
        onProgress,
        extraAudioAssets
      )

      await exportAsZip(buildResult, onProgress)
      return {
        success: true,
        draftId: buildResult.draftId,
        message: `ZIP 文件已下载，请解压到剪映草稿目录：${sanitizedDraftPath}`
      }
    }
  } catch (error) {
    console.error('导出剪映草稿失败:', error)
    throw error
  }
}

/**
 * 检查浏览器兼容性和导出策略
 *
 * @param videoSize 视频文件大小（字节），可选
 * @returns 浏览器能力和推荐策略
 */
export function checkCompatibility(videoSize?: number): BrowserCapability {
  const supportsFS = detectFileSystemSupport()
  const sizeLimit = 1024 * 1024 * 1024 // 1GB

  // 支持 File System Access API
  if (supportsFS) {
    const sizeInGB = videoSize ? videoSize / (1024 * 1024 * 1024) : 0
    const warnings: string[] = []

    if (videoSize && sizeInGB > 5) {
      warnings.push(`视频文件较大 (${sizeInGB.toFixed(2)}GB)，复制可能需要几分钟时间`)
    }

    return {
      supportsFileSystemAPI: true,
      strategy: 'filesystem',
      message: '✨ 您的浏览器支持直接创建草稿，无需下载 ZIP 文件',
      limitations: warnings.length > 0 ? warnings : undefined
    }
  }

  // 不支持 File System API
  if (!videoSize || videoSize < sizeLimit) {
    // 小文件可以使用 ZIP 降级方案
    return {
      supportsFileSystemAPI: false,
      strategy: 'zip',
      message: '⚠️ 将以 ZIP 方式导出（需手动解压）',
      limitations: [
        '建议使用 Chrome 或 Edge 86+ 版本获得更好体验',
        videoSize && videoSize > 500 * 1024 * 1024 ? '大文件可能导致浏览器卡顿' : ''
      ].filter(Boolean)
    }
  }

  // 大文件 + 不支持 API = 阻断
  const sizeInGB = videoSize / (1024 * 1024 * 1024)
  return {
    supportsFileSystemAPI: false,
    strategy: 'blocked',
    message: '❌ 当前浏览器不支持大文件导出',
    limitations: [
      `视频文件 ${sizeInGB.toFixed(2)}GB 超出限制（最大 1GB）`,
      '请使用 Chrome 或 Edge 86+ 版本',
      '或将视频文件压缩至 1GB 以下'
    ]
  }
}

// 导出工具函数
export { requestDirectoryHandle } from './fileSystemExporter'
export { buildFrameCapcutExportPayload } from './frameExportAdapter'
export type { FrameCapcutExportPayload } from './frameExportAdapter'

// 导出类型
export type { ProgressCallback, ExportProgress, ExtraAudioAsset } from './types'
