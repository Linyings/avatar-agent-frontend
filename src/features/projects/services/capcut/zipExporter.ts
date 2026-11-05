/**
 * 剪映草稿生成 - ZIP 导出器
 * 将草稿打包成 ZIP 文件供用户下载
 */

import JSZip from 'jszip'
import type { DraftBuildResult, ProgressCallback } from './draftBuilder'

/**
 * 将草稿导出为 ZIP 文件并触发下载
 *
 * @param buildResult 草稿构建结果
 * @param onProgress 进度回调
 */
export async function exportAsZip(
  buildResult: DraftBuildResult,
  onProgress?: ProgressCallback
): Promise<void> {
  onProgress?.({
    stage: 'exporting',
    message: '正在打包 ZIP 文件...',
    progress: 90
  })

  const { draftId, draft, meta, videoFile, audioFiles } = buildResult

  // 创建 ZIP 对象
  const zip = new JSZip()

  // 创建草稿文件夹
  const draftFolder = zip.folder(draftId)
  if (!draftFolder) {
    throw new Error('无法创建草稿文件夹')
  }

  // 1. 添加 draft_info.json
  draftFolder.file('draft_info.json', JSON.stringify(draft, null, 2))

  // 2. 添加 draft_meta_info.json
  draftFolder.file('draft_meta_info.json', JSON.stringify(meta, null, 2))

  // 3. 创建 assets 子文件夹
  const assetsFolder = draftFolder.folder('assets')
  if (!assetsFolder) {
    throw new Error('无法创建 assets 文件夹')
  }

  // 4. 添加视频文件
  const videoFolder = assetsFolder.folder('video')
  if (!videoFolder) {
    throw new Error('无法创建 video 文件夹')
  }

  videoFolder.file(videoFile.name, videoFile)

  // 5. 添加音频文件
  if (audioFiles.size > 0) {
    const audioFolder = assetsFolder.folder('audio')
    if (!audioFolder) {
      throw new Error('无法创建 audio 文件夹')
    }

    audioFiles.forEach((blob, path) => {
      // path 格式: "assets/audio/audio_1.mp3" 或 Windows 绝对路径
      // 使用跨平台分隔符正则提取文件名（支持 / 和 \）
      const fileName = path.split(/[/\\]/).pop() || `audio_${Date.now()}.mp3`
      audioFolder.file(fileName, blob)
    })
  }

  onProgress?.({
    stage: 'exporting',
    message: '正在生成 ZIP 文件...',
    progress: 95
  })

  // 6. 生成 ZIP Blob
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 6 // 中等压缩级别，平衡速度和大小
    }
  })

  onProgress?.({
    stage: 'exporting',
    message: '正在下载 ZIP 文件...',
    progress: 98
  })

  // 7. 触发浏览器下载
  const url = URL.createObjectURL(zipBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = `capcut_draft_${draftId}.zip`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // 清理 URL
  setTimeout(() => URL.revokeObjectURL(url), 1000)

  onProgress?.({
    stage: 'complete',
    message: 'ZIP 文件下载完成',
    progress: 100
  })
}
