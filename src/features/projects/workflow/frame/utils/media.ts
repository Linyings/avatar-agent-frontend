import type { ExtractAudioOutput, FrameDebugStepRecords, GenerateTimelineImagesOutput, MergeVideosOutput } from '../types'
import { loadFrameDebugAsset } from '../debug/storage'
import { localAssetStorageService } from '@/shared/services/localAssetStorageService'

const frameRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' ? value as Record<string, unknown> : null
)

const frameText = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
)

export class TimelineImageUnavailableError extends Error {}

export const resolveTimelineImageFile = async (
  item: GenerateTimelineImagesOutput['images'][number]
) => {
  if (typeof File !== 'undefined' && item.file instanceof File) return item.file

  const record = frameRecord(item)
  const storageKey = frameText(record?.previewStorageKey)
  if (!storageKey) {
    throw new TimelineImageUnavailableError('时间线图图片 File 已丢失，请先重新执行“生成时间线图”')
  }

  const blob = await loadFrameDebugAsset(storageKey)
  if (!blob) {
    throw new TimelineImageUnavailableError('无法从浏览器存储恢复时间线图，请先重新执行“生成时间线图”')
  }

  const fileRecord = frameRecord(record?.file)
  const imageRecord = frameRecord(record?.image)
  const fileName = frameText(fileRecord?.name) || frameText(imageRecord?.name) || `timeline-view-${item.decisionIndex}.png`
  const fileType = blob.type || frameText(fileRecord?.type) || frameText(imageRecord?.type) || 'image/png'

  return new File([blob], fileName, { type: fileType })
}

export const resolveMergedVideoFile = async (merged: MergeVideosOutput) => {
  if (typeof File !== 'undefined' && merged.file instanceof File) return merged.file

  const record = frameRecord(merged)
  const sourceArtifact = frameRecord(record?.sourceVideoArtifact)
  const sourceArtifactKey = frameText(sourceArtifact?.key)
  if (sourceArtifactKey) {
    const file = await localAssetStorageService.getProjectAsset(sourceArtifactKey)
    if (file) return file
  }

  const storageKey = frameText(record?.previewStorageKey)
  if (!storageKey) {
    throw new Error('合并视频 File 已丢失，请先重新执行“合并视频”')
  }

  const blob = await loadFrameDebugAsset(storageKey)
  if (!blob) {
    throw new Error('无法从浏览器存储恢复合并视频，请先重新执行“合并视频”')
  }

  const fileRecord = frameRecord(record?.file)
  const videoRecord = frameRecord(record?.video)
  const fileName = frameText(fileRecord?.name) || frameText(videoRecord?.name) || 'frame-inference-source.mp4'
  const fileType = blob.type || frameText(fileRecord?.type) || frameText(videoRecord?.type) || 'video/mp4'

  return new File([blob], fileName, { type: fileType })
}

export const releaseTranscriptionAudioFileReferences = (records: FrameDebugStepRecords) => {
  const extractRecord = records['extract-audio']
  const extractOutput = extractRecord?.output as ExtractAudioOutput | undefined
  if (extractRecord && extractOutput && Object.prototype.hasOwnProperty.call(extractOutput, 'file')) {
    const nextOutput: ExtractAudioOutput = { ...extractOutput }
    delete nextOutput.file
    extractRecord.output = nextOutput
    extractRecord.outputSummary = nextOutput.audio
  }

  const transcribeRecord = records.transcribe
  const transcribeInput = transcribeRecord?.input
  if (transcribeRecord && transcribeInput && typeof transcribeInput === 'object' && !Array.isArray(transcribeInput)) {
    const nextInput = { ...(transcribeInput as Record<string, unknown>) }
    delete nextInput.audioFile
    transcribeRecord.input = nextInput
  }

  if (transcribeRecord) {
    const releaseLog = '转录完成：已释放临时音频文件引用。'
    transcribeRecord.logs = (transcribeRecord.logs ?? []).includes(releaseLog)
      ? transcribeRecord.logs
      : [...(transcribeRecord.logs ?? []), releaseLog]
  }
}
