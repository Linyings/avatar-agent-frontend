import type { BuiltInVoice, ScriptItem, ServiceLevel, TTSAudioState, TTSResult } from '@/shared/types'
import { aiToolsService, type DecideTimelineViewResponse, type NarrativeUnderstandingResponse, type SubtitleValidationMetadata, type TimelineViewAnalysisResponse, type TimelineViewDecision } from '@/shared/services/aiToolsService'
import { dashscopeTempFileService } from '@/shared/services/dashscopeTempFileService'
import { loadTTSService } from '@/shared/services/ttsServiceLoader'
import { localAudioStorageService } from '@/shared/services/localAudioStorageService'
import { localAssetStorageService } from '@/shared/services/localAssetStorageService'
import type { WorkflowRequestIdentity } from '@/shared/workflowRuns/identity'
import type { ProjectArtifact } from '../../types/project'
import { getAudioDuration } from '@/shared/utils/audioUtils'
import {
  formatBudgetBytes,
  formatBudgetDuration,
  getBrowserVideoProcessingBudget,
} from '@/shared/utils/browserProcessingBudget'
import { throwIfAborted } from '@/shared/utils/abort'
import { DEFAULT_CALIBRATION_OPTIONS, checkTimestampCalibration, performTimestampCalibration } from '@/shared/utils/calibrationUtils'
import { convertFrontendToNewBatch, convertNewToFrontendBatch } from '@/shared/utils/scriptDataAdapter'
import { ensureTimeFieldsBatch } from '@/shared/utils/timestampUtils'
import { type SubtitleExtractionResult } from '../../types/material'
import { createAudioFileFromVideo } from '../../utils/audioExtractor'
import { buildSubtitlePayload } from '../../utils/subtitleTransform'
import { convertSubtitlesToVideoContext } from '../../utils/videoContextConverter'
import { generateTimelineViewImage, type TimelineTranscript } from '../timelineViewImageService'
import { scriptGenerationServiceV2, type AnchoredNarrationDraftItem, type GenerateScriptResponse, type GenerateScriptStreamEvent, type VideoConfig as ScriptGenerationVideoConfig } from '../scriptGenerationServiceV2'
import { composeVideo } from '../videoComposer'
import { concatenateVideoFiles } from './videoConcatenationService'
import VideoProcessingService from './videoProcessingService'
import ProjectService from '../projectService'
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny'
import { findBackgroundMusicByLabel, NO_BACKGROUND_MUSIC_LABEL } from '../../constants/backgroundMusic.constants'

export type FrameInferencePipelineStep =
  | 'merge_videos'
  | 'extract_audio'
  | 'transcribe'
  | 'decide'
  | 'analyze'
  | 'understand'
  | 'generate_script'
  | 'generate_voice'
  | 'calibrate'
  | 'compose'
  | 'upload'
  | 'completed'

export interface FrameInferenceProgress {
  step: FrameInferencePipelineStep
  percentage: number
  message: string
}

const EXTRACT_AUDIO_PROGRESS_START = 18
const EXTRACT_AUDIO_PROGRESS_END = 34
const FRAME_TTS_MAX_ATTEMPTS = 3
const FRAME_COMPOSE_MAX_ATTEMPTS = 2

export const FRAME_INFERENCE_DEFAULT_N_FRAMES = 15
export const FRAME_INFERENCE_SECONDS_PER_VISUAL_SEGMENT = 60
export const FRAME_INFERENCE_DEFAULT_OUTPUT_DURATION_MS = 4 * 60_000

export interface FrameOutputDurationRecommendation {
  minMs: number
  maxMs: number
}

export interface FrameOutputPlan {
  targetDurationMs: number
  recommendedDuration: FrameOutputDurationRecommendation
  visualSegmentCount: number
  analysisWindowSeconds: number
}

const OUTPUT_DURATION_STEP_MS = 30_000
const MIN_OUTPUT_DURATION_MS = 60_000
const MAX_ANALYSIS_WINDOW_SECONDS = 600
const MIN_ANALYSIS_WINDOW_SECONDS = 90

const finitePositiveNumber = (value?: number | null) => (
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
)

const clampNumber = (value: number, min: number, max: number) => (
  Math.min(max, Math.max(min, value))
)

const roundOutputDuration = (value: number) => (
  Math.round(value / OUTPUT_DURATION_STEP_MS) * OUTPUT_DURATION_STEP_MS
)

export const resolveFrameOutputDurationRecommendation = (
  sourceDurationMs?: number | null,
): FrameOutputDurationRecommendation => {
  const sourceMs = finitePositiveNumber(sourceDurationMs)
  const sourceMinutes = sourceMs ? sourceMs / 60_000 : null
  const rangeMinutes = sourceMinutes === null
    ? [3, 5]
    : sourceMinutes < 5
      ? [1, 2]
      : sourceMinutes < 15
        ? [2, 4]
        : sourceMinutes < 30
          ? [2, 5]
          : sourceMinutes < 60
            ? [2, 8]
            : sourceMinutes < 120
              ? [2, 12]
              : [2, 15]
  const allowedMaxMs = sourceMs ? Math.max(MIN_OUTPUT_DURATION_MS, Math.floor(sourceMs)) : 15 * 60_000
  const minMs = clampNumber(roundOutputDuration(rangeMinutes[0] * 60_000), MIN_OUTPUT_DURATION_MS, allowedMaxMs)
  const maxMs = clampNumber(roundOutputDuration(rangeMinutes[1] * 60_000), minMs, allowedMaxMs)
  return { minMs, maxMs }
}

export const resolveFrameOutputPlan = (
  outputDurationMs?: number | null,
  sourceDurationMs?: number | null,
): FrameOutputPlan => {
  const recommendedDuration = resolveFrameOutputDurationRecommendation(sourceDurationMs)
  const sourceMs = finitePositiveNumber(sourceDurationMs)
  const allowedMaxMs = sourceMs ? Math.max(MIN_OUTPUT_DURATION_MS, Math.floor(sourceMs)) : Number.POSITIVE_INFINITY
  const requestedMs = finitePositiveNumber(outputDurationMs) ?? FRAME_INFERENCE_DEFAULT_OUTPUT_DURATION_MS
  const targetDurationMs = clampNumber(
    roundOutputDuration(requestedMs),
    MIN_OUTPUT_DURATION_MS,
    allowedMaxMs,
  )
  const targetDurationSeconds = targetDurationMs / 1000

  return {
    targetDurationMs,
    recommendedDuration,
    visualSegmentCount: Math.max(1, Math.ceil(targetDurationSeconds / FRAME_INFERENCE_SECONDS_PER_VISUAL_SEGMENT)),
    analysisWindowSeconds: clampNumber(
      Math.round(targetDurationSeconds / 30) * 30,
      MIN_ANALYSIS_WINDOW_SECONDS,
      MAX_ANALYSIS_WINDOW_SECONDS,
    ),
  }
}

export const isRetriableFrameAudioCompositionError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /AudioData|AudioSample|numberOfFrames|音频轨时长为空|音频数据为空|音频重采样后为空/i.test(message)
}

const formatErrorMessage = (error: unknown) => (
  error instanceof Error ? error.message : String(error ?? '未知错误')
)

const createFrameCompositionError = (error: unknown, retried: boolean) => {
  const originalMessage = formatErrorMessage(error)
  if (!isRetriableFrameAudioCompositionError(error)) {
    return new Error(originalMessage)
  }

  return new Error(
    retried
      ? `最终视频合成时遇到空音频片段，已自动重试仍失败。请重新执行“解说配音”后再合成；如果仍失败，请尝试取消背景音乐或检查异常片段。原始错误：${originalMessage}`
      : `最终视频合成时遇到空音频片段。请重新执行“解说配音”后再合成；如果仍失败，请尝试取消背景音乐或检查异常片段。原始错误：${originalMessage}`
  )
}

export const resolveFrameInferenceMaxDecisions = (outputDurationMs?: number | null) => (
  resolveFrameOutputPlan(outputDurationMs).visualSegmentCount
)

export interface FrameInferenceConfig {
  outputLanguage: string | null
  selectionRatio?: number
  outputDurationMs?: number
  narrationRatio?: number
  defaultNFrames: number
  maxDecisions: number
  decisionPrompt?: string
  analysisPrompt?: string
  narrationStyleId?: string | null
  narrationStyleTitle?: string | null
  wordCount?: string | number | null
  personView?: 'first_person' | 'third_person'
  clipMode?: string
  originalRatio?: number
  audioSpeed?: number
  customPrompt?: string | null
  reviewNarrationScript?: boolean
  voice?: string | null
  voiceName?: string | null
  videoName?: string | null
  backgroundMusic?: string | null
  backgroundMusicId?: number | null
  backgroundMusicUrl?: string | null
}

export interface ScribeWord {
  text: string
  start: number
  end: number
  type?: string
  confidence?: number
  speakerId?: number | string
}

export interface ScribePhrase {
  text: string
  start: number
  end: number
  confidence?: number
  speakerId?: number | string
}

export interface ElevenLabsScribeResponse {
  success: boolean
  provider: string
  model: string
  raw_result: unknown
  packed_transcript: string
  phrases: unknown[]
  words: unknown[]
  audio_events: unknown[]
  text_content: string
  language_code: string
  duration: number
  tokens_consumed: number
  updated_at: string
}

export interface FrameInferenceAnalysisItem {
  decisionIndex: number
  decision: TimelineViewDecision
  image: {
    name: string
    size: number
    objectKey: string
    ossUrl: string
  }
  response: TimelineViewAnalysisResponse
}

export interface FrameInferencePipelineResult {
  mergedVideo: {
    name: string
    size: number
    type: string
    duration: number
  }
  extractedAudio: {
    name: string
    size: number
    type: string
  }
  transcription: ElevenLabsScribeResponse
  subtitleValidation?: SubtitleValidationMetadata
  subtitleResult: SubtitleExtractionResult
  subtitlePayload: ReturnType<typeof buildSubtitlePayload>
  videoContext: ReturnType<typeof convertSubtitlesToVideoContext>
  decision: DecideTimelineViewResponse
  analyses: FrameInferenceAnalysisItem[]
  narrativeUnderstanding: NarrativeUnderstandingResponse
  scriptResponse?: GenerateScriptResponse
  narrationDraftItems?: AnchoredNarrationDraftItem[]
  approvedNarrationDraftItems?: AnchoredNarrationDraftItem[]
  voiceoverResult?: FrameVoiceoverResult
  finalVideoResult?: FrameFinalVideoResult
  tokens: {
    transcription: number
    validation?: number
    decision: number
    analysis: number
    narrative: number
    script?: number
    total: number
  }
}

interface FrameInferencePipelineInput {
  projectId: string
  files: File[]
  config: FrameInferenceConfig
  signal?: AbortSignal
  onProgress?: (progress: FrameInferenceProgress) => void
  onScriptStream?: (event: GenerateScriptStreamEvent) => void
}

const report = (
  onProgress: FrameInferencePipelineInput['onProgress'],
  progress: FrameInferenceProgress
) => {
  onProgress?.(progress)
}

const revokeObjectUrl = (url?: string | null) => {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

const assertFrameBrowserBudget = (files: File[], mergedVideoFile: File, mergedVideoDuration: number) => {
  const budget = getBrowserVideoProcessingBudget('medium')
  const totalInputBytes = files.reduce((sum, file) => sum + file.size, 0)
  const issues: string[] = []

  if (totalInputBytes > budget.maxTotalInputBytes) {
    issues.push(`素材总大小 ${formatBudgetBytes(totalInputBytes)} 超过当前设备建议上限 ${formatBudgetBytes(budget.maxTotalInputBytes)}`)
  }

  if (mergedVideoFile.size > budget.maxSourceBytes) {
    issues.push(`合并后视频 ${formatBudgetBytes(mergedVideoFile.size)} 超过当前设备建议上限 ${formatBudgetBytes(budget.maxSourceBytes)}`)
  }

  if (mergedVideoDuration > budget.maxMergeDurationSeconds) {
    issues.push(`视频时长 ${formatBudgetDuration(mergedVideoDuration)} 超过当前设备建议上限 ${formatBudgetDuration(budget.maxMergeDurationSeconds)}`)
  }

  if (issues.length > 0) {
    throw new Error(`为避免浏览器崩溃，已停止通用模式任务：${issues.join('；')}。请拆分素材或减少视频时长后重试。`)
  }
}

export const mapExtractAudioConversionProgress = (progress: number) => {
  const ratio = Number.isFinite(progress) ? progress : 0
  const boundedRatio = Math.max(0, Math.min(1, ratio))
  return Math.round(
    EXTRACT_AUDIO_PROGRESS_START
    + (EXTRACT_AUDIO_PROGRESS_END - EXTRACT_AUDIO_PROGRESS_START) * boundedRatio
  )
}

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN

  return Number.isFinite(parsed) ? parsed : null
}

const toNonEmptyString = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
)

const DEFAULT_VOICE_URI = 'https://store.narratoai.cn/tts/qjc.mp3'
const DEFAULT_SERVICE_LEVEL: ServiceLevel = 'basic'

export interface FrameVoiceSelection {
  uri: string
  name?: string
  type?: BuiltInVoice['type']
  serviceLevel: ServiceLevel
}

const getVoiceServiceLevel = (voiceType?: BuiltInVoice['type'] | null): ServiceLevel => (
  voiceType === 'advanced' ? 'premium' : DEFAULT_SERVICE_LEVEL
)

const toSpeakerId = (value: unknown): number | string | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

export const normalizeScribeWords = (value: unknown): ScribeWord[] => {
  if (!Array.isArray(value)) return []

  const words: ScribeWord[] = []

  value.forEach((item) => {
    if (!item || typeof item !== 'object') return
    const record = item as Record<string, unknown>
    const text = toNonEmptyString(record.text ?? record.word)
    const start = toFiniteNumber(record.start)
    const end = toFiniteNumber(record.end)

    if (!text || start === null || end === null || end < start) return

    words.push({
      text,
      start,
      end,
      type: toNonEmptyString(record.type) || undefined,
      confidence: toFiniteNumber(record.confidence) ?? undefined,
      speakerId: toSpeakerId(record.speaker_id ?? record.speaker),
    })
  })

  return words
}

const normalizeScribePhrases = (value: unknown): ScribePhrase[] => {
  if (!Array.isArray(value)) return []

  const phrases: ScribePhrase[] = []

  value.forEach((item) => {
    if (!item || typeof item !== 'object') return
    const record = item as Record<string, unknown>
    const text = toNonEmptyString(record.text)
    const start = toFiniteNumber(record.start)
    const end = toFiniteNumber(record.end)

    if (!text || start === null || end === null || end < start) return

    phrases.push({
      text,
      start,
      end,
      confidence: toFiniteNumber(record.confidence) ?? undefined,
      speakerId: toSpeakerId(record.speaker_id ?? record.speaker),
    })
  })

  return phrases
}

const buildSegmentsFromWords = (words: ScribeWord[]): ScribePhrase[] => {
  if (words.length === 0) return []

  const segments: ScribePhrase[] = []
  let currentWords: ScribeWord[] = []

  const flush = () => {
    if (currentWords.length === 0) return
    const text = currentWords.map((word) => word.text).join(' ').replace(/\s+/g, ' ').trim()
    if (!text) {
      currentWords = []
      return
    }

    const start = currentWords[0].start
    const end = currentWords[currentWords.length - 1].end
    const speakerId = currentWords[0].speakerId
    const confidenceValues = currentWords
      .map((word) => word.confidence)
      .filter((item): item is number => typeof item === 'number')

    segments.push({
      text,
      start,
      end,
      confidence: confidenceValues.length > 0
        ? confidenceValues.reduce((sum, item) => sum + item, 0) / confidenceValues.length
        : undefined,
      speakerId,
    })
    currentWords = []
  }

  words.forEach((word, index) => {
    currentWords.push(word)

    const nextWord = words[index + 1]
    const gap = nextWord ? nextWord.start - word.end : Number.POSITIVE_INFINITY
    const speakerChanged = nextWord?.speakerId !== undefined
      && word.speakerId !== undefined
      && nextWord.speakerId !== word.speakerId
    const shouldBreak = speakerChanged || gap >= 0.8 || currentWords.length >= 18 || /[.!?。！？]$/.test(word.text)

    if (shouldBreak) {
      flush()
    }
  })

  flush()
  return segments
}

export const buildFrameSubtitleExtractionResult = (
  transcription: ElevenLabsScribeResponse
): SubtitleExtractionResult => {
  const phrases = normalizeScribePhrases(transcription.phrases)
  const words = normalizeScribeWords(transcription.words)
  const phraseSource = phrases.length > 0 ? phrases : buildSegmentsFromWords(words)

  if (phraseSource.length === 0) {
    throw new Error('转录结果中没有可用的字幕片段')
  }

  const segments = phraseSource.map((phrase, index) => ({
      id: String(index + 1),
      startTime: phrase.start,
      endTime: phrase.end,
      text: phrase.text,
      confidence: phrase.confidence ?? 0.95,
      speakerId: phrase.speakerId,
    }))

  const totalDuration = Math.max(
    toFiniteNumber(transcription.duration) ?? 0,
    segments[segments.length - 1]?.endTime ?? 0
  )

  return {
    segments,
    language: transcription.language_code || 'auto',
    totalDuration,
    processingTime: 0,
    confidence: segments.reduce((sum, item) => sum + (item.confidence ?? 0.95), 0) / segments.length,
  }
}

export const buildDecisionSegments = (subtitles: SubtitleExtractionResult) => {
  return subtitles.segments.map((segment) => ({
    start: segment.startTime,
    end: segment.endTime,
    text: segment.text,
  }))
}

export const getVideoDuration = async (file: File): Promise<number> => {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(file),
  })

  try {
    return await input.computeDuration()
  } finally {
    input.dispose()
  }
}

const saveProjectPreview = async (projectId: string, file: File) => {
  try {
    const thumbnailBlob = await VideoProcessingService.captureVideoThumbnail(file, undefined, 500)
    await ProjectService.uploadProjectPreview(projectId, thumbnailBlob)
  } catch (error) {
    console.warn('[FrameInference] 保存项目预览图失败，已跳过', error)
  }
}

export const extractAudioForTranscription = async (
  mergedVideoFile: File,
  onProgress?: FrameInferencePipelineInput['onProgress'],
  signal?: AbortSignal
) => {
  return createAudioFileFromVideo(mergedVideoFile, {
    signal,
    onProgress: (progress) => {
      const boundedRatio = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0))
      report(onProgress, {
        step: 'extract_audio',
        percentage: mapExtractAudioConversionProgress(boundedRatio),
        message: `正在提取并压缩音频为 MP3 ${Math.round(boundedRatio * 100)}%`,
      })
    },
  })
}

export const buildTranscript = (transcription: ElevenLabsScribeResponse): TimelineTranscript => ({
  words: normalizeScribeWords(transcription.words).map((word) => ({
    text: word.text,
    start: word.start,
    end: word.end,
    type: word.type,
  })),
})

const buildVisualSummary = (response: TimelineViewAnalysisResponse): string => {
  const summary = toNonEmptyString(response.analysis?.summary)
  if (summary) return summary

  const concerns = Array.isArray(response.analysis?.concerns)
    ? response.analysis.concerns.map((item) => toNonEmptyString(item)).filter(Boolean)
    : []
  if (concerns.length > 0) {
    return concerns.join('；')
  }

  return toNonEmptyString(response.content) || '已生成视觉辅助分析'
}

export const mergeFrameAnalysesIntoVideoContext = (
  videoContext: ReturnType<typeof convertSubtitlesToVideoContext>,
  analyses: FrameInferenceAnalysisItem[]
) => {
  const nextItems = { ...videoContext.items }

  analyses.forEach((item) => {
    const summary = buildVisualSummary(item.response)
    Object.entries(nextItems).forEach(([key, segment]) => {
      const overlaps = item.decision.end > segment.start_time && item.decision.start < segment.end_time
      if (!overlaps) return

      const existing = toNonEmptyString(segment.visual)
      nextItems[key] = {
        ...segment,
        visual: existing ? `${existing}\n${summary}` : summary,
      }
    })
  })

  const visualSegments = Object.values(nextItems).filter((item) => toNonEmptyString(item.visual)).length

  return {
    ...videoContext,
    items: nextItems,
    visual_segments: visualSegments,
    merged_at: Date.now(),
  }
}

export const attachNarrativeUnderstandingToVideoContext = (
  videoContext: ReturnType<typeof convertSubtitlesToVideoContext>,
  narrativeUnderstanding: NarrativeUnderstandingResponse
) => ({
  ...videoContext,
  narrative_context: narrativeUnderstanding.analysis ?? null,
  narrative_updated_at: narrativeUnderstanding.updated_at ?? new Date().toISOString(),
})

export const buildFrameScriptGenerationConfig = (
  config: FrameInferenceConfig
): ScriptGenerationVideoConfig => ({
  model_level: 'frame',
  target_language: config.outputLanguage || 'zh-CN',
  audio_speed: config.audioSpeed ?? 5,
  word_count: String(config.wordCount ?? 1200),
  person_view: config.personView ?? 'third_person',
  style_mode: config.narrationStyleId || config.narrationStyleTitle || '电影电视剧',
  is_org: true,
  org_ratio: config.originalRatio ?? 20,
  mix_ratio: config.originalRatio ?? 20,
  clip_mode: config.clipMode ?? 'smart_mix',
  output_duration_ms: config.outputDurationMs,
  narration_ratio: config.narrationRatio,
})

export interface FrameVoiceoverResult {
  items: ScriptItem[]
  audioStates: TTSAudioState
  voiceUri: string
  voiceName?: string
  voiceType?: BuiltInVoice['type']
  serviceLevel: ServiceLevel
  generatedCount: number
}

export interface FrameFinalVideoResult {
  name: string
  size: number
  type: string
  duration?: number
  artifact: ProjectArtifact
  backgroundMusic: {
    label: string
    id?: number | null
    url?: string | null
  } | null
}

export interface ComposeFrameFinalVideoResult {
  file: File
  finalVideo: FrameFinalVideoResult
}

export const calibrateFrameScriptItems = async (
  scriptItems: ScriptItem[],
  ttsAudioStates: TTSAudioState
): Promise<ScriptItem[]> => {
  const calibration = await checkTimestampCalibration(scriptItems, ttsAudioStates, DEFAULT_CALIBRATION_OPTIONS)
  if (!calibration.hasItemsToCalibrate) {
    return scriptItems
  }

  return performTimestampCalibration(
    scriptItems,
    calibration.items.filter(item => item.needsCalibration),
    DEFAULT_CALIBRATION_OPTIONS
  )
}

const isRealAudioBlob = (value: unknown): value is Blob => (
  typeof Blob !== 'undefined' && value instanceof Blob
)

const isUsableAudioUrl = (value?: string | null) => (
  Boolean(value?.trim()) && value !== '[object-url-stripped]'
)

export const hydrateFrameVoiceoverAudioStates = async (
  scriptItems: ScriptItem[],
  ttsAudioStates: TTSAudioState
): Promise<TTSAudioState> => {
  const nextStates: TTSAudioState = { ...ttsAudioStates }
  const frontendItems = ensureTimeFieldsBatch(scriptItems) as ScriptItem[]

  for (const item of frontendItems) {
    if (item.OST !== 0) continue

    const current = nextStates[item._id]
    if (isRealAudioBlob(current?.audioBlob) || isUsableAudioUrl(current?.audioUrl)) {
      continue
    }

    if (!item.local_audio_key) {
      continue
    }

    const audioBlob = await localAudioStorageService.getAudioBlob(item.local_audio_key)
    if (!audioBlob) {
      nextStates[item._id] = {
        ...current,
        success: false,
        error: '本地配音缓存未找到，请重新执行“解说配音”',
      }
      continue
    }

    nextStates[item._id] = {
      ...current,
      success: true,
      audioBlob,
      audioUrl: URL.createObjectURL(audioBlob),
      duration: current?.duration ?? item.duration,
    }
  }

  return nextStates
}

const resolveFrameBackgroundMusic = (config: FrameInferenceConfig) => {
  const configuredUrl = toNonEmptyString(config.backgroundMusicUrl)
  const option = findBackgroundMusicByLabel(config.backgroundMusic)
  const url = configuredUrl || option?.url || ''
  if (!url) return null

  return {
    label: option?.label || toNonEmptyString(config.backgroundMusic) || NO_BACKGROUND_MUSIC_LABEL,
    id: config.backgroundMusicId ?? option?.id ?? null,
    url,
  }
}

const makeSafeVideoBaseName = (name?: string | null) => {
  const cleaned = toNonEmptyString(name)
    .replace(/\.[^.]+$/, '')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'frame-inference-final'
}

export const composeFrameFinalVideo = async ({
  projectId,
  sourceVideoFile,
  sourceVideoDuration,
  scriptItems,
  ttsAudioStates,
  config,
  onProgress,
  signal,
}: {
  projectId: string
  sourceVideoFile: File
  sourceVideoDuration: number
  scriptItems: ScriptItem[]
  ttsAudioStates: TTSAudioState
  config: FrameInferenceConfig
  onProgress?: FrameInferencePipelineInput['onProgress']
  signal?: AbortSignal
}): Promise<ComposeFrameFinalVideoResult> => {
  throwIfAborted(signal, '最终视频合成已取消')
  const sourceVideoUrl = URL.createObjectURL(sourceVideoFile)
  const backgroundMusic = resolveFrameBackgroundMusic(config)
  const existingAudioUrls = new Set(
    Object.values(ttsAudioStates)
      .map(state => state?.audioUrl)
      .filter((url): url is string => Boolean(url))
  )
  const hydratedAudioUrlsToRelease = new Set<string>()
  const collectHydratedAudioUrls = (states: TTSAudioState) => {
    Object.values(states)
      .map(state => state?.audioUrl)
      .filter((url): url is string => Boolean(url) && !existingAudioUrls.has(url))
      .forEach(url => hydratedAudioUrlsToRelease.add(url))
  }
  let hydratedAudioStates = await hydrateFrameVoiceoverAudioStates(scriptItems, ttsAudioStates)
  collectHydratedAudioUrls(hydratedAudioStates)
  let compositionPreviewUrl: string | null = null

  try {
    let composition: Awaited<ReturnType<typeof composeVideo>> | null = null
    let lastCompositionError: unknown = null
    let didRetryComposition = false

    for (let attempt = 1; attempt <= FRAME_COMPOSE_MAX_ATTEMPTS; attempt += 1) {
      throwIfAborted(signal, '最终视频合成已取消')

      if (attempt > 1) {
        didRetryComposition = true
        report(onProgress, {
          step: 'compose',
          percentage: 98,
          message: '正在重新加载配音音频并重试最终视频合成',
        })
        hydratedAudioStates = await hydrateFrameVoiceoverAudioStates(scriptItems, ttsAudioStates)
        collectHydratedAudioUrls(hydratedAudioStates)
      } else {
        report(onProgress, {
          step: 'compose',
          percentage: 98,
          message: backgroundMusic ? `正在合成最终视频并混入背景音乐：${backgroundMusic.label}` : '正在合成最终视频',
        })
      }

      try {
        composition = await composeVideo(
          {
            originalVideoFile: {
              file: sourceVideoFile,
              url: sourceVideoUrl,
              duration: sourceVideoDuration,
            },
            scriptItems,
            ttsAudioStates: hydratedAudioStates,
            options: {
              outputFormat: 'mp4',
              videoQuality: 'medium',
              audioQuality: 'medium',
              backgroundMusicUrl: backgroundMusic?.url ?? null,
            },
          },
          progress => {
            report(onProgress, {
              step: 'compose',
              percentage: Math.min(99, 98 + Math.round(progress.percentage * 0.01)),
              message: progress.message,
            })
          },
          signal
        )
      } catch (error) {
        throwIfAborted(signal, '最终视频合成已取消')
        lastCompositionError = error

        if (attempt >= FRAME_COMPOSE_MAX_ATTEMPTS || !isRetriableFrameAudioCompositionError(error)) {
          break
        }

        continue
      }
      throwIfAborted(signal, '最终视频合成已取消')
      compositionPreviewUrl = composition.videoUrl ?? null

      if (composition.success && composition.videoBlob) {
        lastCompositionError = null
        break
      }

      lastCompositionError = new Error(composition.error || '最终视频合成失败')
      revokeObjectUrl(compositionPreviewUrl)
      compositionPreviewUrl = null

      if (attempt >= FRAME_COMPOSE_MAX_ATTEMPTS || !isRetriableFrameAudioCompositionError(lastCompositionError)) {
        break
      }
    }

    if (!composition?.success || !composition.videoBlob) {
      throw createFrameCompositionError(lastCompositionError || composition?.error || '最终视频合成失败', didRetryComposition)
    }

    const fileName = `${makeSafeVideoBaseName(config.videoName)}-${Date.now()}.mp4`
    const file = new File([composition.videoBlob], fileName, {
      type: 'video/mp4',
      lastModified: Date.now(),
    })
    throwIfAborted(signal, '最终视频保存已取消')
    report(onProgress, {
      step: 'upload',
      percentage: 99,
      message: '正在保存最终视频到本地 OPFS',
    })
    const artifact = await localAssetStorageService.saveProjectAsset({
      projectId,
      kind: 'final_video',
      file,
      name: file.name,
      type: file.type || 'video/mp4',
      duration: composition.duration,
    })

    return {
      file,
      finalVideo: {
        name: file.name,
        size: file.size,
        type: file.type || 'video/mp4',
        duration: composition.duration,
        artifact,
        backgroundMusic,
      },
    }
  } finally {
    revokeObjectUrl(compositionPreviewUrl)
    revokeObjectUrl(sourceVideoUrl)
    hydratedAudioUrlsToRelease.forEach(revokeObjectUrl)
  }
}

export const resolveFrameVoiceSelection = async (preferredName?: string | null): Promise<FrameVoiceSelection> => {
  const { fetchBuiltInVoices } = await loadTTSService()
  const voices = await fetchBuiltInVoices()
  if (!voices.length) {
    return {
      uri: DEFAULT_VOICE_URI,
      serviceLevel: DEFAULT_SERVICE_LEVEL,
    }
  }

  const normalizedPreferredName = preferredName?.trim()
  const preferred = normalizedPreferredName
    ? voices.find(voice => (
      voice.uri === normalizedPreferredName
      || voice.name === normalizedPreferredName
      || voice.name.includes(normalizedPreferredName)
    ))
    : null
  const selected = preferred ?? voices.find(voice => voice.type === 'basic') ?? voices[0]

  return {
    uri: selected?.uri || DEFAULT_VOICE_URI,
    name: selected?.name,
    type: selected?.type,
    serviceLevel: getVoiceServiceLevel(selected?.type),
  }
}

export const resolveFrameVoiceUri = async (preferredName?: string | null): Promise<string> => (
  (await resolveFrameVoiceSelection(preferredName)).uri
)

export const generateFrameNarrationVoiceover = async ({
  projectId,
  backendProjectId,
  scriptItems,
  voiceUri,
  voiceName,
  voiceType,
  serviceLevel = DEFAULT_SERVICE_LEVEL,
  onProgress,
  signal,
  workflowIdentity,
}: {
  projectId: string
  backendProjectId?: string
  scriptItems: ScriptItem[]
  voiceUri: string
  voiceName?: string
  voiceType?: BuiltInVoice['type']
  serviceLevel?: ServiceLevel
  onProgress?: FrameInferencePipelineInput['onProgress']
  signal?: AbortSignal
  workflowIdentity?: WorkflowRequestIdentity
}): Promise<FrameVoiceoverResult> => {
  const { generateTTSWithVoiceUri } = await loadTTSService()
  const nextItems = [...scriptItems]
  const audioStates: TTSAudioState = {}
  const narrativeItems = nextItems.filter(item => item.OST === 0)

  for (let index = 0; index < narrativeItems.length; index += 1) {
    throwIfAborted(signal, '解说配音已取消')
    const item = narrativeItems[index]
    const narrationText = (item.text || item.narration || '').trim()
    if (!narrationText) continue
    const segmentWorkflowIdentity = workflowIdentity
      ? {
          ...workflowIdentity,
          workflowStepId: index === 0
            ? workflowIdentity.workflowStepId
            : `${workflowIdentity.workflowStepId}:${index + 1}`,
        }
      : undefined

    report(onProgress, {
      step: 'generate_voice',
      percentage: 97 + Math.round((index / Math.max(1, narrativeItems.length)) * 2),
      message: `正在生成解说配音 ${index + 1}/${narrativeItems.length}`,
    })

    let ttsResult: TTSResult | null = null
    let duration: number | undefined
    let lastError: unknown = null

    for (let attempt = 1; attempt <= FRAME_TTS_MAX_ATTEMPTS; attempt += 1) {
      throwIfAborted(signal, '解说配音已取消')

      if (attempt > 1) {
        report(onProgress, {
          step: 'generate_voice',
          percentage: 97 + Math.round((index / Math.max(1, narrativeItems.length)) * 2),
          message: `正在重试片段 ${item._id} 配音 ${attempt}/${FRAME_TTS_MAX_ATTEMPTS}`,
        })
      }

      let attemptResult: TTSResult | null = null
      try {
        attemptResult = await generateTTSWithVoiceUri(narrationText, voiceUri, {
          speed: 1,
          volume: 1,
          service_level: serviceLevel,
          projectId: backendProjectId,
          signal,
          workflowIdentity: segmentWorkflowIdentity,
        })
        throwIfAborted(signal, '解说配音已取消')

        if (!attemptResult.success) {
          throw new Error(attemptResult.error || `片段 ${item._id} 配音生成失败`)
        }
        if (!attemptResult.audioBlob || attemptResult.audioBlob.size <= 0) {
          throw new Error(`片段 ${item._id} 配音音频为空`)
        }

        const resolvedDuration = typeof attemptResult.duration === 'number' && Number.isFinite(attemptResult.duration) && attemptResult.duration > 0
          ? attemptResult.duration
          : await getAudioDuration(attemptResult.audioBlob)

        if (!Number.isFinite(resolvedDuration) || resolvedDuration <= 0) {
          throw new Error(`片段 ${item._id} 配音音频时长为空`)
        }

        ttsResult = attemptResult
        duration = resolvedDuration
        lastError = null
        break
      } catch (error) {
        lastError = error
        if (attemptResult?.audioUrl) {
          revokeObjectUrl(attemptResult.audioUrl)
        }
        if (attempt >= FRAME_TTS_MAX_ATTEMPTS) {
          break
        }
      }
    }

    if (!ttsResult?.audioBlob || !duration) {
      throw new Error(`片段 ${item._id} 配音生成失败：${formatErrorMessage(lastError)}`)
    }

    const localAudioKey = await localAudioStorageService.saveNarrationAudio({
      projectId,
      itemId: item._id,
      blob: ttsResult.audioBlob,
      duration,
    })
    const audioUrl = URL.createObjectURL(ttsResult.audioBlob)
    revokeObjectUrl(ttsResult.audioUrl && ttsResult.audioUrl !== audioUrl ? ttsResult.audioUrl : null)

    audioStates[item._id] = {
      success: true,
      audioBlob: ttsResult.audioBlob,
      audioUrl,
      duration,
    }

    const targetIndex = nextItems.findIndex(candidate => candidate._id === item._id)
    if (targetIndex >= 0) {
      nextItems[targetIndex] = {
        ...nextItems[targetIndex],
        audio_url: audioUrl,
        audio: audioUrl,
        local_audio_key: localAudioKey,
        audio_storage: 'local',
        local_audio_missing: false,
        duration,
      }
    }
  }

  return {
    items: convertFrontendToNewBatch(nextItems),
    audioStates,
    voiceUri,
    voiceName,
    voiceType,
    serviceLevel,
    generatedCount: Object.keys(audioStates).length,
  }
}

export async function runFrameInferencePipeline({
  projectId,
  files,
  config,
  signal,
  onProgress,
  onScriptStream,
}: FrameInferencePipelineInput): Promise<FrameInferencePipelineResult> {
  throwIfAborted(signal, '通用模式任务已停止')
  if (!projectId) {
    throw new Error('缺少项目 ID，无法开始通用模式')
  }
  if (!files.length) {
    throw new Error('请先选择至少一个视频')
  }

  report(onProgress, {
    step: 'merge_videos',
    percentage: 4,
    message: files.length > 1 ? '正在按上传顺序合并视频' : '只有一个视频，跳过合并',
  })

  const mergedVideoFile = files.length > 1
    ? await concatenateVideoFiles(files, (progress) => {
        report(onProgress, {
          step: 'merge_videos',
          percentage: Math.min(18, Math.round(progress.percentage * 0.18)),
          message: progress.message,
        })
      }, signal)
    : files[0]

  throwIfAborted(signal, '通用模式任务已停止')
  await saveProjectPreview(projectId, mergedVideoFile)
  const mergedVideoDuration = await getVideoDuration(mergedVideoFile)
  assertFrameBrowserBudget(files, mergedVideoFile, mergedVideoDuration)

  const defaultNFrames = FRAME_INFERENCE_DEFAULT_N_FRAMES
  const maxDecisions = resolveFrameInferenceMaxDecisions(config.outputDurationMs)

  report(onProgress, {
    step: 'extract_audio',
    percentage: 18,
    message: '正在从合并后视频提取 MP3 音频',
  })

  let extractedAudioFile: File | null = await extractAudioForTranscription(mergedVideoFile, onProgress, signal)
  const extractedAudio = {
    name: extractedAudioFile.name,
    size: extractedAudioFile.size,
    type: extractedAudioFile.type || 'audio/mpeg',
  }

  report(onProgress, {
    step: 'transcribe',
    percentage: 36,
    message: '正在转录提取后的音频',
  })

  let transcription: ElevenLabsScribeResponse
  try {
    transcription = await aiToolsService.transcribeWithFunASR(
      extractedAudioFile,
      config.outputLanguage,
      { projectId, signal }
    )
  } finally {
    extractedAudioFile = null
  }
  const subtitleResult = buildFrameSubtitleExtractionResult(transcription)
  const subtitlePayload = buildSubtitlePayload(subtitleResult.segments)
  const initialVideoContext = convertSubtitlesToVideoContext(subtitleResult)

  report(onProgress, {
    step: 'decide',
    percentage: 50,
    message: '正在判断哪些片段需要视觉辅助',
  })

  const decision = await aiToolsService.decideTimelineView({
    projectId,
    videoContext: transcription.packed_transcript,
    transcript: transcription.text_content,
    segments: buildDecisionSegments(subtitleResult),
    maxDecisions,
    defaultNFrames,
    prompt: config.decisionPrompt,
  }, { signal })

  const transcript = buildTranscript(transcription)
  const decisions = Array.isArray(decision.decisions) ? decision.decisions : []
  const analyses: FrameInferenceAnalysisItem[] = []

  for (let index = 0; index < decisions.length; index += 1) {
    throwIfAborted(signal, '视觉分析已取消')
    const currentDecision = decisions[index]
    const nFrames = Math.max(1, Math.round(currentDecision.n_frames || defaultNFrames))

    report(onProgress, {
      step: 'analyze',
      percentage: Math.min(92, 62 + Math.round((index / Math.max(1, decisions.length)) * 28)),
      message: `正在分析视觉辅助片段 ${index + 1} / ${decisions.length}`,
    })

    const generatedImage = await generateTimelineViewImage({
      video: mergedVideoFile,
      start: currentDecision.start,
      end: currentDecision.end,
      nFrames,
      transcript,
      signal,
    })

    const uploadResult = await dashscopeTempFileService.uploadImageFile(generatedImage.file, undefined, undefined, signal)
    const response = await aiToolsService.analyzeTimelineViewImage({
      projectId,
      imageOssUrl: uploadResult.ossUrl,
      start: currentDecision.start,
      end: currentDecision.end,
      nFrames,
      prompt: config.analysisPrompt,
    }, { signal })

    analyses.push({
      decisionIndex: index + 1,
      decision: currentDecision,
      image: {
        name: generatedImage.file.name,
        size: generatedImage.file.size,
        objectKey: uploadResult.objectKey,
        ossUrl: uploadResult.ossUrl,
      },
      response,
    })
  }

  report(onProgress, {
    step: 'understand',
    percentage: 94,
    message: '正在理解剧情、人物关系、情绪曲线和关键事件',
  })

  const narrativeUnderstanding = await aiToolsService.analyzeNarrativeContextStream({
    projectId,
    videoContext: transcription.packed_transcript,
    transcript: transcription.text_content,
    segments: subtitleResult.segments.map((segment) => ({
      start: segment.startTime,
      end: segment.endTime,
      text: segment.text,
      speaker_id: segment.speakerId,
    })),
    decisions: decision.decisions,
    visualAnalyses: analyses.map((item) => ({
      start: item.decision.start,
      end: item.decision.end,
      reason: item.decision.reason,
      summary: item.response.analysis?.summary ?? item.response.content,
      visual_events: item.response.analysis?.visual_events,
      concerns: item.response.analysis?.concerns,
      recommendations: item.response.analysis?.recommendations,
    })),
    language: config.outputLanguage,
  }, { signal })

  const videoContext = attachNarrativeUnderstandingToVideoContext(
    mergeFrameAnalysesIntoVideoContext(initialVideoContext, analyses),
    narrativeUnderstanding
  )
  const analysisTokens = analyses.reduce((sum, item) => sum + (item.response.tokens_consumed || 0), 0)
  const narrativeTokens = narrativeUnderstanding.tokens_consumed || 0

  report(onProgress, {
    step: 'generate_script',
    percentage: 97,
    message: '正在基于合并视频上下文生成解说文案和画面匹配',
  })

  const scriptResponse = await scriptGenerationServiceV2.generateScriptStream(
    {
      project_id: projectId,
      video_config: buildFrameScriptGenerationConfig(config),
      video_context: videoContext,
      ...(config.customPrompt?.trim() ? { custom_prompt: config.customPrompt.trim() } : {}),
    },
    {
      onEvent: onScriptStream,
      signal,
    }
  )
  const scriptTokens = scriptResponse.usage.total_tokens || 0
  const frontendScriptItems = ensureTimeFieldsBatch(convertNewToFrontendBatch(scriptResponse.items)) as ScriptItem[]
  const voiceSelection = await resolveFrameVoiceSelection(config.voice)
  const voiceoverResult = await generateFrameNarrationVoiceover({
    projectId,
    scriptItems: frontendScriptItems,
    voiceUri: voiceSelection.uri,
    voiceName: voiceSelection.name,
    voiceType: voiceSelection.type,
    serviceLevel: voiceSelection.serviceLevel,
    onProgress,
    signal,
  })

  report(onProgress, {
    step: 'calibrate',
    percentage: 98,
    message: '正在根据配音时长校准最终合成时间线',
  })

  const voicedFrontendItems = ensureTimeFieldsBatch(convertNewToFrontendBatch(voiceoverResult.items)) as ScriptItem[]
  const calibratedItems = await calibrateFrameScriptItems(voicedFrontendItems, voiceoverResult.audioStates)
  const calibratedVoiceoverResult: FrameVoiceoverResult = {
    ...voiceoverResult,
    items: convertFrontendToNewBatch(calibratedItems),
  }

  const finalVideoResult = await composeFrameFinalVideo({
    projectId,
    sourceVideoFile: mergedVideoFile,
    sourceVideoDuration: mergedVideoDuration,
    scriptItems: calibratedItems,
    ttsAudioStates: calibratedVoiceoverResult.audioStates,
    config,
    onProgress,
    signal,
  })

  report(onProgress, {
    step: 'completed',
    percentage: 100,
    message: '通用模式最终视频已生成',
  })

  return {
    mergedVideo: {
      name: mergedVideoFile.name,
      size: mergedVideoFile.size,
      type: mergedVideoFile.type || 'video/mp4',
      duration: mergedVideoDuration,
    },
    extractedAudio,
    transcription,
    subtitleResult,
    subtitlePayload,
    videoContext,
    decision,
    analyses,
    narrativeUnderstanding,
    scriptResponse,
    voiceoverResult: calibratedVoiceoverResult,
    finalVideoResult: finalVideoResult.finalVideo,
    tokens: {
      transcription: transcription.tokens_consumed || 0,
      decision: decision.tokens_consumed || 0,
      analysis: analysisTokens,
      narrative: narrativeTokens,
      script: scriptTokens,
      total: (transcription.tokens_consumed || 0) + (decision.tokens_consumed || 0) + analysisTokens + narrativeTokens + scriptTokens,
    },
  }
}
