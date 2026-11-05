/**
 * 剪映草稿生成 - 核心构建逻辑
 * 协调所有模块，构建完整的剪映草稿
 */

import {
  generateUUID,
  getCurrentTimeMicroseconds,
  secondsToMicroseconds,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  FPS,
  RENDER_INDEX_VIDEO,
  RENDER_INDEX_AUDIO,
  RENDER_INDEX_SUBTITLE
} from './constants'
import { getVideoInfo, downloadAudiosInBatch, getAudioDuration } from './mediaProcessor'
import { splitTextIntoLines, generateSubtitleTimeline, removeSubtitlePunctuation } from './subtitleProcessor'
import { createVideoMaterial, createAudioMaterial, createTextMaterial } from './materialBuilder'
import { createVideoSegment, createAudioSegment, createTextSegment } from './segmentBuilder'
import { createTrack } from './trackBuilder'
import type {
  Draft,
  DraftMetaInfo,
  VideoInfo,
  AudioInfo,
  ExtraAudioAsset,
  NarrationAudioAsset,
  DraftVideoMetadata
} from './types'
import type { ProgressCallback } from './types'
import type { ScriptItem } from '@/shared/types'

type PathSeparator = '/' | '\\'

function normalizeDraftBasePath(rawPath: string): {
  basePath: string
  separator: PathSeparator
} {
  const trimmed = rawPath.trim()

  if (!trimmed) {
    throw new Error('草稿目录路径不能为空，请输入剪映草稿目录的绝对路径')
  }

  const absolutePattern = /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/
  if (!absolutePattern.test(trimmed)) {
    throw new Error('草稿目录路径必须是绝对路径，例如 C:\\\\Users\\\\... 或 /Users/...')
  }

  const containsBackslash = trimmed.includes('\\')
  const containsSlash = trimmed.includes('/')
  const separator: PathSeparator =
    containsBackslash && !containsSlash ? '\\' : '/'

  const uniform = trimmed.replace(/[\\/]/g, separator)
  const trailingRegex = new RegExp(`\\${separator}+$`)
  let basePath = uniform.replace(trailingRegex, '')

  if (!basePath) {
    basePath = separator === '\\' ? uniform : '/'
  }

  if (separator === '\\' && /^[a-zA-Z]:$/.test(basePath)) {
    basePath += '\\'
  }

  return { basePath, separator }
}

function joinAbsolutePath(
  basePath: string,
  separator: PathSeparator,
  ...segments: string[]
): string {
  return segments.reduce((acc, segment) => {
    const sanitized = segment
      .replace(/[\\/]/g, separator)
      .replace(new RegExp(`^\\${separator}+`), '')
      .replace(new RegExp(`\\${separator}+$`), '')

    if (!sanitized) {
      return acc
    }

    if (acc.endsWith(separator)) {
      return `${acc}${sanitized}`
    }

    return `${acc}${separator}${sanitized}`
  }, basePath)
}

function sanitizeAssetFileName(fileName: string, fallback: string): string {
  const trimmed = fileName.trim()
  const sanitized = trimmed
    .replace(/[\\/]/g, '_')
    .replace(/[<>:"|?*]+/g, '_')
    .split('')
    .filter(char => char.charCodeAt(0) >= 32)
    .join('')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')

  return sanitized || fallback
}

// 重新导出 ProgressCallback 供其他模块使用
export type { ProgressCallback }

/**
 * 草稿构建结果
 */
export interface DraftBuildResult {
  draftId: string
  draft: Draft
  meta: DraftMetaInfo
  videoFile: File
  audioFiles: Map<string, Blob> // path -> Blob
}

/**
 * 创建草稿基础模板
 */
function createDraftTemplate(draftId: string): Draft {
  return {
    canvas_config: {
      height: VIDEO_HEIGHT,
      ratio: 'original',
      width: VIDEO_WIDTH
    },
    color_space: 0,
    config: {
      adjust_max_index: 1,
      attachment_info: [],
      combination_max_index: 1,
      export_range: null,
      extract_audio_last_index: 1,
      lyrics_recognition_id: '',
      lyrics_sync: true,
      lyrics_taskinfo: [],
      maintrack_adsorb: true,
      material_save_mode: 0,
      multi_language_current: 'none',
      multi_language_list: [],
      multi_language_main: 'none',
      multi_language_mode: 'none',
      original_sound_last_index: 1,
      record_audio_last_index: 1,
      sticker_max_index: 1,
      subtitle_keywords_config: null,
      subtitle_recognition_id: '',
      subtitle_sync: true,
      subtitle_taskinfo: [],
      system_font_list: [],
      video_mute: false,
      zoom_info_params: null
    },
    cover: null,
    create_time: getCurrentTimeMicroseconds(),
    duration: 0,
    extra_info: null,
    fps: FPS,
    free_render_index_mode_on: false,
    group_container: null,
    id: draftId,
    keyframe_graph_list: [],
    keyframes: {
      adjusts: [],
      audios: [],
      effects: [],
      filters: [],
      handwrites: [],
      stickers: [],
      texts: [],
      videos: []
    },
    last_modified_platform: {
      app_id: 3704,
      app_source: 'lv',
      app_version: '5.9.0',
      os: 'windows'
    },
    materials: {
      ai_translates: [],
      audio_balances: [],
      audio_effects: [],
      audio_fades: [],
      audio_track_indexes: [],
      audios: [],
      beats: [],
      canvases: [],
      chromas: [],
      color_curves: [],
      digital_humans: [],
      drafts: [],
      effects: [],
      flowers: [],
      green_screens: [],
      handwrites: [],
      hsl: [],
      images: [],
      log_color_wheels: [],
      loudnesses: [],
      manual_deformations: [],
      masks: [],
      material_animations: [],
      material_colors: [],
      multi_language_refs: [],
      placeholders: [],
      plugin_effects: [],
      primary_color_wheels: [],
      realtime_denoises: [],
      shapes: [],
      smart_crops: [],
      smart_relights: [],
      sound_channel_mappings: [],
      speeds: [],
      stickers: [],
      tail_leaders: [],
      text_templates: [],
      texts: [],
      time_marks: [],
      transitions: [],
      video_effects: [],
      video_trackings: [],
      videos: [],
      vocal_beautifys: [],
      vocal_separations: []
    },
    mutable_config: null,
    name: '',
    new_version: '110.0.0',
    relationships: [],
    render_index_track_mode_on: true,
    retouch_cover: null,
    source: 'default',
    static_cover_image_path: '',
    time_marks: null,
    tracks: [],
    update_time: getCurrentTimeMicroseconds(),
    version: 360000
  }
}

/**
 * 构建剪映草稿
 *
 * @param videoFile 视频文件
 * @param scriptItems 脚本数据
 * @param draftPath 剪映草稿目录的绝对路径
 * @param onProgress 进度回调
 * @param extraAudioAssets 额外音频素材，例如通用模式背景音乐
 */
export async function buildDraft(
  videoFile: File,
  scriptItems: ScriptItem[],
  draftPath: string,
  onProgress?: ProgressCallback,
  extraAudioAssets: ExtraAudioAsset[] = [],
  videoMetadata?: DraftVideoMetadata,
  narrationAudioAssets: NarrationAudioAsset[] = []
): Promise<DraftBuildResult> {
  // 生成草稿 ID
  const draftId = generateUUID()
  const { basePath: draftRootPath, separator: pathSeparator } =
    normalizeDraftBasePath(draftPath)
  const draftFolderPath = joinAbsolutePath(draftRootPath, pathSeparator, draftId)
  const assetsFolderPath = joinAbsolutePath(
    draftRootPath,
    pathSeparator,
    draftId,
    'assets'
  )
  const videoFolderPath = joinAbsolutePath(
    draftRootPath,
    pathSeparator,
    draftId,
    'assets',
    'video'
  )
  const audioFolderPath = joinAbsolutePath(
    draftRootPath,
    pathSeparator,
    draftId,
    'assets',
    'audio'
  )
  const videoAbsolutePath = joinAbsolutePath(
    videoFolderPath,
    pathSeparator,
    videoFile.name
  )
  const extraAudioInfos: Array<{
    audioInfo: AudioInfo
    targetStart: number
    targetDuration?: number
    volume: number
  }> = []

  // 报告进度：开始构建
  onProgress?.({
    stage: 'building',
    message: '正在初始化草稿...',
    progress: 0
  })

  // 获取视频信息
  const videoInfo: VideoInfo = videoMetadata
    ? { ...videoMetadata, path: videoAbsolutePath, file: videoFile }
    : await getVideoInfo(videoFile, videoAbsolutePath)

  // 2. 收集需要下载的音频
  const audioDownloads: Array<{ url: string; path: string; itemId: number }> = []
  const restoredNarrationAudios: Array<{
    asset: NarrationAudioAsset
    path: string
    itemId: number
  }> = []
  const narrationAudioByItemId = new Map(
    narrationAudioAssets.map(asset => [asset.itemId, asset])
  )
  scriptItems.forEach(item => {
    const text = item.text || item.narration || ''
    const org = item.org || ''
    const audioUrl = item.audio_url || item.audio || ''

    // 解说片段且有音频URL
    if (text && !org) {
      const audioFileName = `audio_${item._id}.mp3`
      const audioAbsolutePath = joinAbsolutePath(
        audioFolderPath,
        pathSeparator,
        audioFileName
      )

      const restoredAsset = narrationAudioByItemId.get(item._id)
      if (restoredAsset?.blob.size) {
        restoredNarrationAudios.push({
          asset: restoredAsset,
          path: audioAbsolutePath,
          itemId: item._id
        })
      } else if (audioUrl) {
        audioDownloads.push({
          url: audioUrl,
          path: audioAbsolutePath,
          itemId: item._id
        })
      }
    }
  })

  // 3. 下载所有音频
  onProgress?.({
    stage: 'downloading',
    message: `正在准备 ${restoredNarrationAudios.length + audioDownloads.length} 个音频文件...`,
    progress: 10,
    currentItem: 0,
    totalItems: restoredNarrationAudios.length + audioDownloads.length
  })

  const audioInfoMap = new Map<number, AudioInfo>()
  const audioBlobs = new Map<string, Blob>()
  const totalNarrationAudios = restoredNarrationAudios.length + audioDownloads.length
  let completedNarrationAudios = 0

  for (const { asset, path, itemId } of restoredNarrationAudios) {
    onProgress?.({
      stage: 'downloading',
      message: `正在读取本地音频 ${completedNarrationAudios + 1}/${totalNarrationAudios}...`,
      progress: 10 + Math.floor((completedNarrationAudios / totalNarrationAudios) * 30),
      currentItem: completedNarrationAudios + 1,
      totalItems: totalNarrationAudios
    })

    const duration = typeof asset.duration === 'number' && asset.duration > 0
      ? secondsToMicroseconds(asset.duration)
      : await getAudioDuration(asset.blob)
    const audioInfo: AudioInfo = { duration, path, blob: asset.blob }
    audioInfoMap.set(itemId, audioInfo)
    audioBlobs.set(path, asset.blob)
    completedNarrationAudios += 1
  }

  for (let i = 0; i < audioDownloads.length; i++) {
    const { url, path, itemId } = audioDownloads[i]

    onProgress?.({
      stage: 'downloading',
      message: `正在下载音频 ${completedNarrationAudios + 1}/${totalNarrationAudios}...`,
      progress: 10 + Math.floor((completedNarrationAudios / totalNarrationAudios) * 30),
      currentItem: completedNarrationAudios + 1,
      totalItems: totalNarrationAudios
    })

    const audioInfo = await downloadAudiosInBatch(
      [{ url, path }],
      undefined
    ).then(infos => infos[0])

    audioInfoMap.set(itemId, audioInfo)
    audioBlobs.set(path, audioInfo.blob)
    completedNarrationAudios += 1
  }

  for (let i = 0; i < extraAudioAssets.length; i++) {
    const asset = extraAudioAssets[i]
    const fileName = sanitizeAssetFileName(
      asset.fileName,
      `extra_audio_${i + 1}.mp3`
    )
    const audioAbsolutePath = joinAbsolutePath(
      audioFolderPath,
      pathSeparator,
      fileName
    )
    const duration = typeof asset.duration === 'number' && asset.duration > 0
      ? secondsToMicroseconds(asset.duration)
      : await getAudioDuration(asset.blob)

    extraAudioInfos.push({
      audioInfo: {
        duration,
        path: audioAbsolutePath,
        blob: asset.blob
      },
      targetStart: secondsToMicroseconds(asset.targetStart ?? 0),
      targetDuration: typeof asset.targetDuration === 'number' && asset.targetDuration > 0
        ? secondsToMicroseconds(asset.targetDuration)
        : undefined,
      volume: asset.volume ?? 1.0
    })
    audioBlobs.set(audioAbsolutePath, asset.blob)
  }

  // 4. 构建草稿
  onProgress?.({
    stage: 'building',
    message: '正在构建草稿结构...',
    progress: 40
  })

  const draft = createDraftTemplate(draftId)

  // 素材映射
  const videoMaterials = new Map<string, string>() // videoAbsolutePath -> materialId
  const audioMaterials = new Map<number, string>() // itemId -> materialId
  const textMaterials = new Map<string, string>() // unique key -> materialId

  // 片段列表
  const videoSegments: ReturnType<typeof createVideoSegment>[] = []
  const audioSegments: ReturnType<typeof createAudioSegment>[] = []
  const extraAudioSegments: ReturnType<typeof createAudioSegment>[] = []
  const textSegments: ReturnType<typeof createTextSegment>[] = []

  // 时间轴位置
  let currentTimelinePosition = 0
  let maxDuration = 0

  // 5. 处理每个脚本项
  for (const item of scriptItems) {
    const itemId = item._id
    const start = item.start
    const end = item.end
    const org = item.org || ''
    const text = item.text || item.narration || ''
    const duration = item.duration || 0

    // 确保视频素材已创建
    if (!videoMaterials.has(videoAbsolutePath)) {
      const videoMaterialId = generateUUID()
      const videoMaterial = createVideoMaterial(videoInfo, videoMaterialId)
      draft.materials.videos.push(videoMaterial)
      videoMaterials.set(videoAbsolutePath, videoMaterialId)
    }

    const videoMaterialId = videoMaterials.get(videoAbsolutePath)!

    if (org) {
      // ===== 原片片段（播放原音）=====
      const sourceStart = secondsToMicroseconds(start)
      const sourceEnd = secondsToMicroseconds(end)
      const sourceDuration = sourceEnd - sourceStart

      const videoSeg = createVideoSegment(
        videoMaterialId,
        sourceStart,
        sourceEnd,
        currentTimelinePosition,
        1.0 // 保持原音
      )

      videoSegments.push(videoSeg)

      currentTimelinePosition += sourceDuration
      maxDuration = Math.max(maxDuration, currentTimelinePosition)
    } else if (text && audioInfoMap.has(itemId)) {
      // ===== 解说片段（视频静音 + 解说音频 + 字幕）=====
      const audioInfo = audioInfoMap.get(itemId)!
      const audioDuration = duration > 0 ? secondsToMicroseconds(duration) : audioInfo.duration

      // 1. 创建静音视频片段
      const sourceStart = secondsToMicroseconds(start)
      const sourceEnd = Math.min(
        sourceStart + audioDuration,
        videoInfo.duration
      )

      const videoSeg = createVideoSegment(
        videoMaterialId,
        sourceStart,
        sourceEnd,
        currentTimelinePosition,
        0.0 // 视频静音
      )

      videoSegments.push(videoSeg)

      // 2. 创建音频素材和片段
      if (!audioMaterials.has(itemId)) {
        const audioMaterialId = generateUUID()
        const audioMaterial = createAudioMaterial(audioInfo, audioMaterialId)
        draft.materials.audios.push(audioMaterial)
        audioMaterials.set(itemId, audioMaterialId)
      }

      const audioMaterialId = audioMaterials.get(itemId)!
      const audioSeg = createAudioSegment(
        audioMaterialId,
        0,
        audioDuration,
        currentTimelinePosition
      )

      audioSegments.push(audioSeg)

      // 3. 创建字幕
      const subtitleLines = splitTextIntoLines(text)
        .map(removeSubtitlePunctuation)
        .filter(Boolean)
      const timeline = generateSubtitleTimeline(
        currentTimelinePosition,
        audioDuration,
        subtitleLines.length
      )

      for (let i = 0; i < subtitleLines.length; i++) {
        const line = subtitleLines[i]
        const textKey = `${itemId}_${i}`

        if (!textMaterials.has(textKey)) {
          const textMaterialId = generateUUID()
          const textMaterial = createTextMaterial(line, textMaterialId)
          draft.materials.texts.push(textMaterial)
          textMaterials.set(textKey, textMaterialId)
        }

        const textMaterialId = textMaterials.get(textKey)!
        const textSeg = createTextSegment(
          textMaterialId,
          timeline[i].start,
          timeline[i].duration
        )

        textSegments.push(textSeg)
      }

      currentTimelinePosition += audioDuration
      maxDuration = Math.max(maxDuration, currentTimelinePosition)
    }
  }

  for (const extraAudio of extraAudioInfos) {
    const audioMaterialId = generateUUID()
    const audioMaterial = createAudioMaterial(extraAudio.audioInfo, audioMaterialId)
    draft.materials.audios.push(audioMaterial)
    const targetDuration = Math.min(
      extraAudio.targetDuration ?? maxDuration,
      extraAudio.audioInfo.duration
    )

    if (targetDuration <= 0) continue

    const audioSeg = createAudioSegment(
      audioMaterialId,
      0,
      targetDuration,
      extraAudio.targetStart,
      extraAudio.volume
    )
    extraAudioSegments.push(audioSeg)
    maxDuration = Math.max(maxDuration, extraAudio.targetStart + targetDuration)
  }

  // 6. 创建轨道
  if (videoSegments.length > 0) {
    const videoTrack = createTrack('video', videoSegments, '视频', RENDER_INDEX_VIDEO)
    draft.tracks.push(videoTrack)
  }

  if (audioSegments.length > 0) {
    const audioTrack = createTrack('audio', audioSegments, '音频', RENDER_INDEX_AUDIO)
    draft.tracks.push(audioTrack)
  }

  if (extraAudioSegments.length > 0) {
    const backgroundAudioTrack = createTrack('audio', extraAudioSegments, '背景音乐', RENDER_INDEX_AUDIO + 1)
    draft.tracks.push(backgroundAudioTrack)
  }

  if (textSegments.length > 0) {
    const textTrack = createTrack('text', textSegments, '字幕', RENDER_INDEX_SUBTITLE)
    draft.tracks.push(textTrack)
  }

  // 7. 设置草稿总时长
  draft.duration = maxDuration

  // 8. 创建元数据
  const meta: DraftMetaInfo = {
    draft_id: draftId,
    draft_name: '',
    draft_cover_path: '',
    draft_fold_path: draftFolderPath,
    draft_materials_path: assetsFolderPath,
    draft_root_path: draftRootPath,
    tm_draft_create: getCurrentTimeMicroseconds(),
    tm_draft_modified: getCurrentTimeMicroseconds(),
    tm_duration: maxDuration
  }

  onProgress?.({
    stage: 'building',
    message: '草稿构建完成',
    progress: 90
  })

  return {
    draftId,
    draft,
    meta,
    videoFile,
    audioFiles: audioBlobs
  }
}
