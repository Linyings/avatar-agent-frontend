import { localAssetStorageService } from '@/shared/services/localAssetStorageService'
import { localAudioStorageService } from '@/shared/services/localAudioStorageService'
import { fetchWithRetry } from '@/shared/utils/network'
import { convertNewToFrontendBatch } from '@/shared/utils/scriptDataAdapter'
import { ensureTimeFieldsBatch } from '@/shared/utils/timestampUtils'
import type { ScriptItem } from '@/shared/types'
import type { FrameInferencePipelineResult } from '@/features/projects/services/material/frameInferencePipelineService'
import type { FrameDebugRun, MergeVideosOutput } from '@/features/projects/workflow/frame'
import type { ProjectArtifact } from '@/features/projects/types/project'
import type { ExtraAudioAsset, NarrationAudioAsset } from './types'

const BACKGROUND_MUSIC_FILE_NAME = 'background_music.mp3'
const BACKGROUND_MUSIC_VOLUME = 0.18

export interface FrameCapcutExportPayload {
  videoFile: File
  scriptItems: ScriptItem[]
  extraAudioAssets: ExtraAudioAsset[]
  narrationAudioAssets?: NarrationAudioAsset[]
  release: () => void
}

interface BuildFrameCapcutExportPayloadInput {
  result: FrameInferencePipelineResult | null
  workflowRun?: FrameDebugRun | null
  sourceVideoArtifact?: ProjectArtifact | null
  sourceVideoFile?: File
}

const isRealBlob = (value: unknown): value is Blob => (
  typeof Blob !== 'undefined' && value instanceof Blob && value.size > 0
)

const resolveSourceVideoFile = async ({
  sourceVideoFile,
  workflowRun,
  sourceVideoArtifact
}: Pick<
  BuildFrameCapcutExportPayloadInput,
  'sourceVideoFile' | 'workflowRun' | 'sourceVideoArtifact'
>): Promise<File> => {
  if (sourceVideoFile) return sourceVideoFile

  const mergeOutput = workflowRun?.records['merge-videos']?.output as MergeVideosOutput | undefined
  if (typeof File !== 'undefined' && mergeOutput?.file instanceof File) return mergeOutput.file

  const artifactKey = mergeOutput?.sourceVideoArtifact?.key || sourceVideoArtifact?.key
  if (artifactKey) {
    const file = await localAssetStorageService.getProjectAsset(artifactKey)
    if (file) return file
  }

  throw new Error('本地源视频缺失，请重新选择原视频或重新执行通用模式')
}

const restoreNarrationAudio = async (
  item: ScriptItem,
  result: FrameInferencePipelineResult
) => {
  const state = result.voiceoverResult?.audioStates?.[item._id]
  if (isRealBlob(state?.audioBlob)) {
    return {
      blob: state.audioBlob,
      duration: state.duration
    }
  }

  if (item.local_audio_key) {
    const blob = await localAudioStorageService.getAudioBlob(item.local_audio_key)
    if (blob) {
      return {
        blob,
        duration: item.duration ?? state?.duration
      }
    }
  }

  throw new Error(`片段 ${item._id} 的解说音频缺失，请重新执行“解说配音”`)
}

const getBackgroundMusic = (result: FrameInferencePipelineResult) => {
  const backgroundMusic = result.finalVideoResult?.backgroundMusic
  if (!backgroundMusic?.url) return null

  return backgroundMusic
}

const downloadBackgroundMusic = async (url: string) => {
  const response = await fetchWithRetry(url, undefined, {
    timeoutMs: 30_000,
    maxRetries: 3
  })
  if (!response.ok) {
    throw new Error(`背景音乐下载失败: HTTP ${response.status}`)
  }
  const blob = await response.blob()
  if (!blob.size) {
    throw new Error('背景音乐文件为空，请重新选择背景音乐')
  }
  return blob
}

export async function buildFrameCapcutExportPayload({
  result,
  workflowRun,
  sourceVideoArtifact,
  sourceVideoFile
}: BuildFrameCapcutExportPayloadInput): Promise<FrameCapcutExportPayload> {
  if (!result?.voiceoverResult?.items?.length) {
    throw new Error('通用模式尚未生成配音脚本，请先完成通用模式')
  }

  const videoFile = await resolveSourceVideoFile({
    sourceVideoFile,
    workflowRun,
    sourceVideoArtifact
  })
  const managedObjectUrls: string[] = []
  let released = false
  const release = () => {
    if (released) return
    released = true
    managedObjectUrls.forEach(url => URL.revokeObjectURL(url))
    managedObjectUrls.length = 0
  }
  const createManagedObjectUrl = (blob: Blob) => {
    const url = URL.createObjectURL(blob)
    if (released) {
      URL.revokeObjectURL(url)
    } else {
      managedObjectUrls.push(url)
    }
    return url
  }

  try {
    const frontendItems = ensureTimeFieldsBatch(
      convertNewToFrontendBatch(result.voiceoverResult.items)
    ) as ScriptItem[]

    const narrationAudioAssets: NarrationAudioAsset[] = []
    const scriptItems = await Promise.all(frontendItems.map(async (item) => {
      if (item.OST === 1 || item.org) return item

      const narrationText = (item.text || item.narration || '').trim()
      if (!narrationText) return item

      const audio = await restoreNarrationAudio(item, result)
      narrationAudioAssets.push({
        itemId: item._id,
        blob: audio.blob,
        duration: audio.duration
      })
      const audioUrl = createManagedObjectUrl(audio.blob)

      return {
        ...item,
        audio_url: audioUrl,
        audio: audioUrl,
        duration: item.duration ?? audio.duration
      }
    }))

    const extraAudioAssets: ExtraAudioAsset[] = []
    const backgroundMusic = getBackgroundMusic(result)
    if (backgroundMusic?.url) {
      const blob = await downloadBackgroundMusic(backgroundMusic.url)
      extraAudioAssets.push({
        fileName: BACKGROUND_MUSIC_FILE_NAME,
        blob,
        volume: BACKGROUND_MUSIC_VOLUME
      })
    }

    return {
      videoFile,
      scriptItems,
      extraAudioAssets,
      narrationAudioAssets: narrationAudioAssets.sort((left, right) => left.itemId - right.itemId),
      release
    }
  } catch (error) {
    release()
    throw error
  }
}
