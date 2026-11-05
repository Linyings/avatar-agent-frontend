/**
 * 剪映草稿生成 - 媒体处理工具
 * 负责获取视频/音频信息和下载音频文件
 */

import { secondsToMicroseconds } from './constants'
import { fetchWithRetry } from '@/shared/utils/network'
import type { VideoInfo, AudioInfo } from './types'

/**
 * 获取视频文件信息
 * 使用 HTML5 Video 元素获取元数据
 */
export async function getVideoInfo(file: File, videoPath: string): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'

    video.onloadedmetadata = () => {
      const width = video.videoWidth
      const height = video.videoHeight
      const duration = video.duration

      // 清理资源
      URL.revokeObjectURL(video.src)

      if (!width || !height || !duration) {
        reject(new Error('无法获取视频元数据'))
        return
      }

      resolve({
        width,
        height,
        duration: secondsToMicroseconds(duration),
        path: videoPath,
        file
      })
    }

    video.onerror = () => {
      URL.revokeObjectURL(video.src)
      reject(new Error('无法加载视频文件，请确保文件格式正确'))
    }

    video.src = URL.createObjectURL(file)
  })
}

/**
 * 获取音频 Blob 的时长
 * 使用 HTML5 Audio 元素获取元数据
 */
export async function getAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio')
    audio.preload = 'metadata'

    audio.onloadedmetadata = () => {
      const duration = audio.duration
      URL.revokeObjectURL(audio.src)

      if (!duration || !isFinite(duration)) {
        reject(new Error('无法获取音频时长'))
        return
      }

      resolve(secondsToMicroseconds(duration))
    }

    audio.onerror = () => {
      URL.revokeObjectURL(audio.src)
      reject(new Error('无法加载音频文件'))
    }

    audio.src = URL.createObjectURL(blob)
  })
}

/**
 * 下载网络音频为 Blob
 * 支持 CORS 的音频 URL
 */
export async function downloadAudioAsBlob(url: string): Promise<Blob> {
  try {
    const response = await fetchWithRetry(url, undefined, {
      timeoutMs: 30_000,
      maxRetries: 3
    })

    if (!response.ok) {
      throw new Error(`下载失败: HTTP ${response.status}`)
    }

    const blob = await response.blob()

    // 验证 Blob 类型
    if (!blob.type.startsWith('audio/')) {
      console.warn(`警告: 下载的文件类型可能不是音频 (${blob.type})`)
    }

    return blob
  } catch (error) {
    console.error('下载音频失败:', error)
    throw new Error(
      error instanceof Error
        ? `下载音频失败: ${error.message}`
        : '下载音频时发生未知错误'
    )
  }
}

/**
 * 获取音频信息（包括下载和获取时长）
 */
export async function getAudioInfo(
  audioUrl: string,
  audioPath: string
): Promise<AudioInfo> {
  // 下载音频
  const blob = await downloadAudioAsBlob(audioUrl)

  // 获取时长
  const duration = await getAudioDuration(blob)

  return {
    duration,
    path: audioPath,
    blob
  }
}

/**
 * 批量下载音频文件
 * 支持进度回调
 */
export async function downloadAudiosInBatch(
  audioUrls: Array<{ url: string; path: string }>,
  onProgress?: (current: number, total: number) => void
): Promise<AudioInfo[]> {
  const results: AudioInfo[] = []

  for (let i = 0; i < audioUrls.length; i++) {
    const { url, path } = audioUrls[i]

    try {
      const audioInfo = await getAudioInfo(url, path)
      results.push(audioInfo)

      // 触发进度回调
      if (onProgress) {
        onProgress(i + 1, audioUrls.length)
      }
    } catch (error) {
      console.error(`下载音频失败 (${i + 1}/${audioUrls.length}):`, error)
      throw error
    }
  }

  return results
}
