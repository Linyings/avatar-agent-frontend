/**
 * AI 工具服务，封装对后端 AI 分析接口的调用
 */
import type { FrameAnalysisResult } from '@/shared/types'
import { authenticatedFetch } from '@/features/auth/services/authService'
import { dashscopeTempFileService } from '@/shared/services/dashscopeTempFileService'
import { createAbortError, throwIfAborted } from '@/shared/utils/abort'
import {
  withWorkflowIdentityInJson,
  withWorkflowIdentityInQuery,
  type WorkflowRequestIdentity,
} from '@/shared/workflowRuns/identity'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
const SSE_FRAME_SEPARATOR = /\r\n\r\n|\n\n|\r\r/
const DEFAULT_SCRIBE_POLL_INTERVAL_MS = 3000

const extractSSEFrames = (input: string): { frames: string[]; remainingBuffer: string } => {
  const frames: string[] = []
  let remainingBuffer = input
  let separatorMatch = remainingBuffer.match(SSE_FRAME_SEPARATOR)

  while (separatorMatch && separatorMatch.index !== undefined) {
    frames.push(remainingBuffer.slice(0, separatorMatch.index))
    remainingBuffer = remainingBuffer.slice(separatorMatch.index + separatorMatch[0].length)
    separatorMatch = remainingBuffer.match(SSE_FRAME_SEPARATOR)
  }

  return { frames, remainingBuffer }
}

const parseSSEEvent = (raw: string): { event: string; data: string } | null => {
  const lines = raw.split(/\r?\n/)
  let event = 'message'
  const data: string[] = []
  lines.forEach((line) => {
    if (line.startsWith('event:')) event = line.slice('event:'.length).trim()
    if (line.startsWith('data:')) data.push(line.slice('data:'.length).trim())
  })
  if (!data.length) return null
  return { event, data: data.join('\n') }
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

// 分析图片的请求接口
export interface AnalyzeImagesRequest {
  images: Array<{
    type: 'file' | 'url' | 'base64'
    data: string  // base64 数据（type=file或base64）或 URL（type=url）
    mime_type: string
  }>
  // 新增：字幕上下文（可选）
  previous_subtitle?: string  // 格式: "[1.21s-3.12s] 文本\n[3.12s-5.55s] 文本\n..."
  next_subtitle?: string      // 格式: "[5.12s-8.32s] 文本\n[8.32s-10.55s] 文本\n..."
}

// 后端返回的分析结果（简化版 - 仅保留 summary）
export interface AnalyzeImagesResponse {
  content: string  // 原始内容（可能包含JSON字符串）
  summary: string  // 画面分析总结
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  model: string
  request_id: string
}

export interface TimelineViewAnalysisResult {
  summary?: string
  visual_events?: unknown[]
  cut_safety?: unknown
  concerns?: string[]
  recommendations?: string[]
  [key: string]: unknown
}

export interface TimelineViewAnalysisResponse {
  success: boolean
  provider: string
  model: string
  timeline_image_url: string
  timeline_image_size: number
  range: {
    start: number
    end: number
    duration: number
    has_start?: boolean
    has_end?: boolean
  }
  n_frames: number
  content: string
  analysis: TimelineViewAnalysisResult | null
  raw_result: unknown
  usage: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  request_id: string
  tokens_consumed: number
  updated_at: string
}

export interface AnalyzeTimelineViewImageRequest {
  imageOssUrl: string
  start?: number | null
  end?: number | null
  nFrames?: number | null
  prompt?: string
  model?: string
  accessToken?: string
  projectId?: string
}

export type TimelineViewAnalysisStreamEvent =
  | { type: 'stage'; stage: string; message: string }
  | { type: 'answer_delta'; delta: string }
  | { type: 'completed'; response: TimelineViewAnalysisResponse }
  | { type: 'error'; message: string }

export interface TimelineViewDecision {
  start: number
  end: number
  priority: 'high' | 'medium' | 'low' | string
  trigger_type: string
  reason: string
  expected_question?: string
  n_frames?: number
  [key: string]: unknown
}

export interface TimelineViewDecisionAnalysis {
  summary?: string
  needs_timeline_view?: boolean
  decisions?: TimelineViewDecision[]
  skipped?: Array<{ start?: number; end?: number; reason?: string; [key: string]: unknown }>
  confidence?: string
  global_notes?: string[]
  [key: string]: unknown
}

export interface DecideTimelineViewRequest {
  videoContext?: string
  transcript?: string
  segments?: unknown[]
  observedGaps?: unknown[]
  candidateCuts?: unknown[]
  renderedCuts?: unknown[]
  maxDecisions?: number
  defaultNFrames?: number
  prompt?: string
  projectId?: string
}

export interface DecideTimelineViewResponse {
  success: boolean
  provider: string
  model: string
  content: string
  analysis: TimelineViewDecisionAnalysis
  decisions: TimelineViewDecision[]
  usage: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  request_id: string
  tokens_consumed: number
  updated_at: string
}

export type DecideTimelineViewStreamEvent =
  | { type: 'stage'; stage: string; message: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'answer_delta'; delta: string }
  | { type: 'completed'; response: DecideTimelineViewResponse }
  | { type: 'error'; message: string }

export interface ElevenLabsScribeResponse {
  success: boolean
  provider: string
  model: string
  status?: 'completed' | 'processing'
  transcription_id?: string
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

export interface SubtitleValidationSegment {
  id?: string | number
  start?: number
  end?: number
  start_time?: number
  end_time?: number
  text?: string
  subtitle?: string
  speaker_id?: number | string
  speakerId?: number | string
  [key: string]: unknown
}

export interface ValidateSubtitlesRequest {
  segments: SubtitleValidationSegment[]
  /** Read-only neighboring context; the provider must never return these items. */
  contextSegments?: SubtitleValidationSegment[]
  language?: string | null
  projectId?: string
}

export interface SubtitleValidationMetadata {
  status: 'completed' | 'degraded'
  model: string
  request_id: string
  tokens_consumed: number
  corrections_count: number
  updated_at: string
  fallback_chunks?: number
  total_chunks?: number
  fallback_segments?: number
  warning?: string
}

export interface SubtitleValidationResponse {
  success: boolean
  provider: string
  model: string
  content: string
  analysis: Record<string, unknown>
  subtitles: Record<string, SubtitleValidationSegment>
  segments: SubtitleValidationSegment[]
  validation: SubtitleValidationMetadata
  usage: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  request_id: string
  tokens_consumed: number
  updated_at: string
}

export type SubtitleValidationStreamEvent =
  | { type: 'stage'; stage: string; message: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'answer_delta'; delta: string }
  | { type: 'completed'; response: SubtitleValidationResponse }
  | { type: 'error'; message: string }

interface ElevenLabsScribeSubmitResponse {
  success: boolean
  provider?: string
  model?: string
  status?: 'processing' | 'completed'
  transcription_id?: string
  poll_interval_seconds?: number
  raw_result?: unknown
}

export interface TranscriptionPollOptions {
  projectId?: string
  signal?: AbortSignal
  pollIntervalMs?: number
  onPolling?: (state: { attempt: number; elapsedMs: number; transcriptionId: string }) => void
}

export interface FunASRTranscriptionOptions extends TranscriptionPollOptions {
  workflowIdentity?: WorkflowRequestIdentity
}

export interface AiToolsWorkflowStreamOptions<TEvent> {
  signal?: AbortSignal
  onEvent?: (event: TEvent) => void
  workflowIdentity?: WorkflowRequestIdentity
}

interface FunASRSubmitResponse {
  success?: boolean
  task_id?: string
  status?: string
  message?: string
}

interface FunASRSegmentItem {
  start_time?: number
  end_time?: number
  start?: number
  end?: number
  subtitle?: string
  text?: string
  speaker_id?: number | string
  channel_id?: number | string
  confidence?: number
}

interface FunASRQueryResponse {
  success?: boolean
  task_id?: string
  status?: string
  progress?: number
  message?: string
  error?: string
  content?: Record<string, FunASRSegmentItem> | FunASRSegmentItem[] | string | null
  raw_result?: unknown
  text_content?: string
  duration?: number
  language?: string
  model?: string
  vendor?: string
  tokens_consumed?: number
  updated_at?: string
}

export interface NarrativeUnderstandingAnalysis {
  summary?: string
  plot?: Record<string, unknown>
  characters?: unknown[]
  relationships?: unknown[]
  emotion_curve?: unknown[]
  events?: unknown[]
  conflicts?: unknown[]
  themes?: unknown[]
  open_questions?: unknown[]
  confirmed_question_answers?: unknown[]
  [key: string]: unknown
}

export interface AnalyzeNarrativeContextRequest {
  videoContext?: string
  transcript?: string
  segments?: unknown[]
  decisions?: unknown[]
  visualAnalyses?: unknown[]
  cacheContext?: unknown
  language?: string | null
  prompt?: string
  projectId?: string
}

export interface NarrativeUnderstandingResponse {
  success: boolean
  provider: string
  model: string
  content: string
  analysis: NarrativeUnderstandingAnalysis
  confirmed_question_answers?: unknown[]
  characters: unknown[]
  relationships: unknown[]
  emotion_curve: unknown[]
  events: unknown[]
  usage: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  request_id: string
  tokens_consumed: number
  updated_at: string
}

export type NarrativeUnderstandingStreamEvent =
  | { type: 'stage'; stage: string; message: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'answer_delta'; delta: string }
  | { type: 'completed'; response: NarrativeUnderstandingResponse }
  | { type: 'error'; message: string }

/**
 * AI 工具服务类
 */
export class AiToolsService {
  private static async request<T>(
    endpoint: string,
    options: RequestInit = {},
    fallbackMessage: string = '请求失败'
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`

    const response = await authenticatedFetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> | undefined),
      },
    })

    const responseText = await response.text()

    if (!response.ok) {
      throw this.buildApiError(response, responseText, fallbackMessage)
    }

    if (!responseText) {
      return {} as T
    }

    try {
      return JSON.parse(responseText) as T
    } catch {
      return {} as T
    }
  }

  static async decideTimelineView(
    request: DecideTimelineViewRequest,
    options?: AiToolsWorkflowStreamOptions<DecideTimelineViewStreamEvent>
  ): Promise<DecideTimelineViewResponse> {
    return this.decideTimelineViewStream(request, options)
  }

  static async decideTimelineViewStream(
    request: DecideTimelineViewRequest,
    options?: AiToolsWorkflowStreamOptions<DecideTimelineViewStreamEvent>
  ): Promise<DecideTimelineViewResponse> {
    throwIfAborted(options?.signal, '视觉片段判断已取消')
    const url = `${API_BASE_URL}/api/v1/tools/timeline-view/decide`
    const response = await authenticatedFetch(url, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.withWorkflowIdentity(this.buildDecideTimelineViewBody(request), options?.workflowIdentity)),
      signal: options?.signal,
    })

    if (!response.ok) {
      const rawText = await response.text().catch(() => '')
      throw this.buildApiError(response, rawText, '流式视觉辅助图决策失败')
    }

    if (!response.body) {
      throw new Error('浏览器不支持流式响应')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finalResult: DecideTimelineViewResponse | null = null

    while (true) {
      throwIfAborted(options?.signal, '视觉片段判断已取消')
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const extracted = extractSSEFrames(buffer)
      buffer = extracted.remainingBuffer

      for (const rawEvent of extracted.frames) {
        const parsedEvent = parseSSEEvent(rawEvent)
        if (!parsedEvent) continue

        let payload: unknown
        try {
          payload = JSON.parse(parsedEvent.data)
        } catch {
          continue
        }

        if (parsedEvent.event === 'stage') {
          const data = isRecord(payload) ? payload : {}
          options?.onEvent?.({
            type: 'stage',
            stage: typeof data.stage === 'string' ? data.stage : '',
            message: typeof data.message === 'string' ? data.message : '',
          })
        } else if (parsedEvent.event === 'thinking_delta') {
          const data = isRecord(payload) ? payload : {}
          options?.onEvent?.({ type: 'thinking_delta', delta: typeof data.delta === 'string' ? data.delta : '' })
        } else if (parsedEvent.event === 'answer_delta') {
          const data = isRecord(payload) ? payload : {}
          options?.onEvent?.({ type: 'answer_delta', delta: typeof data.delta === 'string' ? data.delta : '' })
        } else if (parsedEvent.event === 'completed') {
          const data = isRecord(payload) ? payload : {}
          const usage = isRecord(data.usage) ? data.usage : {}
          const responseData: DecideTimelineViewResponse = {
            success: data.success !== false,
            provider: typeof data.provider === 'string' ? data.provider : 'openai',
            model: typeof data.model === 'string' ? data.model : '',
            content: typeof data.content === 'string' ? data.content : '',
            analysis: isRecord(data.analysis) ? data.analysis : {},
            decisions: Array.isArray(data.decisions) ? data.decisions as TimelineViewDecision[] : [],
            usage: {
              prompt_tokens: Number(usage.prompt_tokens || 0),
              completion_tokens: Number(usage.completion_tokens || 0),
              total_tokens: Number(usage.total_tokens || 0),
            },
            request_id: typeof data.request_id === 'string' ? data.request_id : '',
            tokens_consumed: Number(data.tokens_consumed || 0),
            updated_at: typeof data.updated_at === 'string' ? data.updated_at : new Date().toISOString(),
          }
          finalResult = responseData
          options?.onEvent?.({ type: 'completed', response: responseData })
          void reader.cancel()
          return responseData
        } else if (parsedEvent.event === 'error') {
          const data = isRecord(payload) ? payload : {}
          const message = typeof data.message === 'string' && data.message.trim()
            ? data.message.trim()
            : '流式视觉辅助图决策失败'
          options?.onEvent?.({ type: 'error', message })
          throw new Error(message)
        }
      }
    }

    if (!finalResult) {
      throw new Error('流式判断已结束，但未收到最终视觉片段决策')
    }

    return finalResult
  }

  static async transcribeWithElevenLabs(
    file: File,
    languageCode?: string | null,
    options?: TranscriptionPollOptions
  ): Promise<ElevenLabsScribeResponse> {
    throwIfAborted(options?.signal, '音频转录已取消')
    const url = `${API_BASE_URL}/api/v1/tools/elevenlabs/scribe/transcribe`

    const formData = new FormData()
    formData.append('file', file)

    if (languageCode?.trim()) {
      formData.append('language_code', languageCode.trim())
    }
    if (options?.projectId?.trim()) {
      formData.append('project_id', options.projectId.trim())
    }

    const response = await authenticatedFetch(url, {
      method: 'POST',
      body: formData,
      signal: options?.signal,
    })

    const responseText = await response.text()
    if (!response.ok) {
      throw this.buildApiError(response, responseText, '音频转录失败')
    }

    const submission = this.parseScribeResponse(responseText) as ElevenLabsScribeSubmitResponse
    if (this.isCompletedScribeResponse(submission)) {
      return submission
    }

    const transcriptionId = typeof submission.transcription_id === 'string'
      ? submission.transcription_id.trim()
      : ''
    if (!transcriptionId) {
      throw new Error('音频转录任务创建失败：后端未返回 transcription_id')
    }

    const pollIntervalMs = this.resolveScribePollIntervalMs(submission, options?.pollIntervalMs)
    const startedAt = Date.now()
    let attempt = 0

    while (true) {
      throwIfAborted(options?.signal, '音频转录已取消')
      await this.waitForScribePollInterval(pollIntervalMs, options?.signal)
      attempt += 1
      options?.onPolling?.({ attempt, elapsedMs: Date.now() - startedAt, transcriptionId })

      const projectQuery = options?.projectId?.trim()
        ? `?project_id=${encodeURIComponent(options.projectId.trim())}`
        : ''
      const pollResponse = await authenticatedFetch(`${url}/${encodeURIComponent(transcriptionId)}${projectQuery}`, {
        method: 'GET',
        signal: options?.signal,
      })
      const pollText = await pollResponse.text()
      if (!pollResponse.ok) {
        throw this.buildApiError(pollResponse, pollText, '查询音频转录结果失败')
      }
      const pollPayload = this.parseScribeResponse(pollText) as ElevenLabsScribeSubmitResponse
      if (this.isCompletedScribeResponse(pollPayload)) {
        return pollPayload
      }
      if (pollPayload.status === 'processing') {
        continue
      }
      throw new Error('音频转录轮询返回格式异常')
    }
  }

  static async transcribeWithFunASR(
    file: File,
    languageCode?: string | null,
    options?: FunASRTranscriptionOptions
  ): Promise<ElevenLabsScribeResponse> {
    throwIfAborted(options?.signal, '音频转录已取消')
    const uploadResult = options?.workflowIdentity
      ? await dashscopeTempFileService.uploadAudioFile(
        file,
        'funasr',
        undefined,
        undefined,
        options.signal,
        options.workflowIdentity,
      )
      : await dashscopeTempFileService.uploadAudioFile(
        file,
        'funasr',
        undefined,
        undefined,
        options?.signal,
      )

    const submitResponse = await authenticatedFetch(`${API_BASE_URL}/api/v1/tools/funasr/asr/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.withWorkflowIdentity({
        file_url: uploadResult.ossUrl,
        channel_id: [0],
        diarization_enabled: true,
        ...(options?.projectId?.trim() ? { project_id: options.projectId.trim() } : {}),
      }, options?.workflowIdentity)),
      signal: options?.signal,
    })

    const submitText = await submitResponse.text()
    if (!submitResponse.ok) {
      throw this.buildApiError(submitResponse, submitText, '提交 FunASR 音频转录失败')
    }

    const submission = this.parseFunASRResponse(submitText) as FunASRSubmitResponse
    const taskId = typeof submission.task_id === 'string' ? submission.task_id.trim() : ''
    if (!taskId) {
      throw new Error(submission.message || 'FunASR 音频转录任务创建失败：后端未返回 task_id')
    }

    const pollIntervalMs = options?.pollIntervalMs && options.pollIntervalMs > 0
      ? options.pollIntervalMs
      : DEFAULT_SCRIBE_POLL_INTERVAL_MS
    const startedAt = Date.now()
    let attempt = 0

    while (true) {
      throwIfAborted(options?.signal, '音频转录已取消')
      await this.waitForScribePollInterval(pollIntervalMs, options?.signal)
      attempt += 1
      options?.onPolling?.({ attempt, elapsedMs: Date.now() - startedAt, transcriptionId: taskId })

      const query = new URLSearchParams()
      if (options?.projectId?.trim()) {
        query.set('project_id', options.projectId.trim())
      }
      const queryWithIdentity = options?.workflowIdentity
        ? withWorkflowIdentityInQuery(query, options.workflowIdentity)
        : query
      const projectQuery = queryWithIdentity.toString()
        ? `?${queryWithIdentity.toString()}`
        : ''
      const pollResponse = await authenticatedFetch(`${API_BASE_URL}/api/v1/tools/funasr/asr/query/${encodeURIComponent(taskId)}${projectQuery}`, {
        method: 'GET',
        signal: options?.signal,
      })
      const pollText = await pollResponse.text()
      if (!pollResponse.ok) {
        throw this.buildApiError(pollResponse, pollText, '查询 FunASR 音频转录结果失败')
      }

      const result = this.parseFunASRResponse(pollText) as FunASRQueryResponse
      const status = typeof result.status === 'string' ? result.status.toUpperCase() : ''
      if (status === 'FAILED' || result.success === false) {
        throw new Error(result.error || result.message || 'FunASR 音频转录失败')
      }
      if (status === 'SUCCEEDED' || status === 'COMPLETED') {
        return this.toScribeCompatibleTranscription(result, taskId, file.name, languageCode)
      }
      if (status === 'PENDING' || status === 'RUNNING' || status === 'PROCESSING') {
        continue
      }
      throw new Error(result.message || 'FunASR 音频转录轮询返回格式异常')
    }
  }

  static async validateSubtitlesStream(
    request: ValidateSubtitlesRequest,
    options?: AiToolsWorkflowStreamOptions<SubtitleValidationStreamEvent>
  ): Promise<SubtitleValidationResponse> {
    throwIfAborted(options?.signal, '字幕校对已取消')
    const url = `${API_BASE_URL}/api/v1/tools/frame-workflow/subtitles/validate`
    const response = await authenticatedFetch(url, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.withWorkflowIdentity(this.buildSubtitleValidationBody(request), options?.workflowIdentity)),
      signal: options?.signal,
    })

    if (!response.ok) {
      const rawText = await response.text().catch(() => '')
      throw this.buildApiError(response, rawText, '流式字幕校对失败')
    }

    if (!response.body) {
      throw new Error('浏览器不支持流式响应')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finalResult: SubtitleValidationResponse | null = null

    while (true) {
      throwIfAborted(options?.signal, '字幕校对已取消')
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const extracted = extractSSEFrames(buffer)
      buffer = extracted.remainingBuffer

      for (const rawEvent of extracted.frames) {
        const parsedEvent = parseSSEEvent(rawEvent)
        if (!parsedEvent) continue

        let payload: unknown
        try {
          payload = JSON.parse(parsedEvent.data)
        } catch {
          continue
        }

        if (parsedEvent.event === 'stage') {
          const data = isRecord(payload) ? payload : {}
          options?.onEvent?.({
            type: 'stage',
            stage: typeof data.stage === 'string' ? data.stage : '',
            message: typeof data.message === 'string' ? data.message : '',
          })
        } else if (parsedEvent.event === 'thinking_delta') {
          const data = isRecord(payload) ? payload : {}
          options?.onEvent?.({ type: 'thinking_delta', delta: typeof data.delta === 'string' ? data.delta : '' })
        } else if (parsedEvent.event === 'answer_delta') {
          const data = isRecord(payload) ? payload : {}
          options?.onEvent?.({ type: 'answer_delta', delta: typeof data.delta === 'string' ? data.delta : '' })
        } else if (parsedEvent.event === 'completed') {
          const data = isRecord(payload) ? payload : {}
          const usage = isRecord(data.usage) ? data.usage : {}
          const analysis = isRecord(data.analysis) ? data.analysis : {}
          const segments = this.normalizeSubtitleValidationSegments(data.segments, data.subtitles)
          const subtitles = this.subtitleSegmentsToRecord(segments)
          const tokensConsumed = Number(data.tokens_consumed || usage.total_tokens || 0)
          const responseData: SubtitleValidationResponse = {
            success: data.success !== false,
            provider: typeof data.provider === 'string' ? data.provider : 'openai',
            model: typeof data.model === 'string' ? data.model : '',
            content: typeof data.content === 'string' ? data.content : '',
            analysis,
            subtitles,
            segments,
            validation: {
              status: 'completed',
              model: typeof data.model === 'string' ? data.model : '',
              request_id: typeof data.request_id === 'string' ? data.request_id : '',
              tokens_consumed: tokensConsumed,
              corrections_count: Number(data.corrections_count || analysis.corrections_count || 0),
              updated_at: typeof data.updated_at === 'string' ? data.updated_at : new Date().toISOString(),
            },
            usage: {
              prompt_tokens: Number(usage.prompt_tokens || 0),
              completion_tokens: Number(usage.completion_tokens || 0),
              total_tokens: Number(usage.total_tokens || 0),
            },
            request_id: typeof data.request_id === 'string' ? data.request_id : '',
            tokens_consumed: tokensConsumed,
            updated_at: typeof data.updated_at === 'string' ? data.updated_at : new Date().toISOString(),
          }
          finalResult = responseData
          options?.onEvent?.({ type: 'completed', response: responseData })
          void reader.cancel()
          return responseData
        } else if (parsedEvent.event === 'error') {
          const data = isRecord(payload) ? payload : {}
          const message = typeof data.message === 'string' && data.message.trim()
            ? data.message.trim()
            : '流式字幕校对失败'
          options?.onEvent?.({ type: 'error', message })
          throw new Error(message)
        }
      }
    }

    if (!finalResult) {
      throw new Error('流式字幕校对已结束，但未收到最终结果')
    }

    return finalResult
  }

  private static parseScribeResponse(rawText: string): ElevenLabsScribeSubmitResponse | ElevenLabsScribeResponse {
    if (!rawText) {
      return {} as ElevenLabsScribeSubmitResponse
    }
    try {
      return JSON.parse(rawText) as ElevenLabsScribeSubmitResponse | ElevenLabsScribeResponse
    } catch {
      return {} as ElevenLabsScribeSubmitResponse
    }
  }

  private static isCompletedScribeResponse(value: ElevenLabsScribeSubmitResponse | ElevenLabsScribeResponse): value is ElevenLabsScribeResponse {
    return isRecord(value)
      && typeof value.packed_transcript === 'string'
      && Array.isArray(value.phrases)
      && Array.isArray(value.words)
  }

  private static parseFunASRResponse(rawText: string): FunASRSubmitResponse | FunASRQueryResponse {
    if (!rawText) {
      return {}
    }
    try {
      return JSON.parse(rawText) as FunASRSubmitResponse | FunASRQueryResponse
    } catch {
      return {}
    }
  }

  private static toScribeCompatibleTranscription(
    response: FunASRQueryResponse,
    taskId: string,
    filename: string,
    requestedLanguage?: string | null
  ): ElevenLabsScribeResponse {
    const phrases = this.normalizeFunASRSegments(response.content)
    const duration = Math.max(
      this.toFiniteNumber(response.duration) ?? 0,
      phrases.reduce((max, phrase) => Math.max(max, phrase.end), 0)
    )
    const textContent = typeof response.text_content === 'string' && response.text_content.trim()
      ? response.text_content.trim()
      : phrases.map((phrase) => phrase.text).join('\n')
    const words = phrases.map((phrase) => ({
      text: phrase.text,
      start: phrase.start,
      end: phrase.end,
      type: 'word',
      confidence: phrase.confidence ?? 0.95,
      ...(phrase.speaker_id !== undefined ? { speaker_id: phrase.speaker_id } : {}),
    }))
    const language = typeof response.language === 'string' && response.language.trim()
      ? response.language.trim()
      : requestedLanguage?.trim() || 'auto'

    return {
      success: response.success !== false,
      provider: 'funasr',
      model: typeof response.model === 'string' && response.model.trim() ? response.model.trim() : 'fun-asr',
      status: 'completed',
      transcription_id: taskId,
      raw_result: response.raw_result ?? response,
      packed_transcript: this.renderFunASRPackedTranscript(filename, phrases, duration),
      phrases: phrases.map((phrase) => ({
        text: phrase.text,
        start: phrase.start,
        end: phrase.end,
        confidence: phrase.confidence ?? 0.95,
        ...(phrase.speaker_id !== undefined ? { speaker_id: phrase.speaker_id } : {}),
      })),
      words,
      audio_events: [],
      text_content: textContent,
      language_code: language,
      duration,
      tokens_consumed: this.toFiniteNumber(response.tokens_consumed) ?? 0,
      updated_at: typeof response.updated_at === 'string' ? response.updated_at : new Date().toISOString(),
    }
  }

  private static normalizeFunASRSegments(
    content: FunASRQueryResponse['content']
  ): Array<{ text: string; start: number; end: number; speaker_id?: number | string; confidence?: number }> {
    const parsedContent = typeof content === 'string'
      ? this.parseFunASRContentString(content)
      : content
    const entries = Array.isArray(parsedContent)
      ? parsedContent.map((item, index) => [String(index + 1), item] as const)
      : isRecord(parsedContent)
        ? Object.entries(parsedContent)
        : []

    const segments: Array<{ id: string; text: string; start: number; end: number; speaker_id?: number | string; confidence?: number }> = []
    entries.forEach(([id, item]) => {
      if (!isRecord(item)) return
      const start = this.toFiniteNumber(item.start_time ?? item.start)
      const end = this.toFiniteNumber(item.end_time ?? item.end)
      const text = typeof item.subtitle === 'string' && item.subtitle.trim()
        ? item.subtitle.trim()
        : typeof item.text === 'string'
          ? item.text.trim()
          : ''
      if (!text || start === null || end === null || end < start) return
      const speaker = this.normalizeSpeakerId(item.speaker_id)
      const confidence = this.toFiniteNumber(item.confidence)
      segments.push({
        id,
        text,
        start,
        end,
        ...(speaker !== undefined ? { speaker_id: speaker } : {}),
        ...(confidence !== null ? { confidence } : {}),
      })
    })

    return segments.sort((left, right) => left.start - right.start || Number(left.id) - Number(right.id))
  }

  private static parseFunASRContentString(content: string): FunASRQueryResponse['content'] {
    try {
      return JSON.parse(content) as FunASRQueryResponse['content']
    } catch {
      return null
    }
  }

  private static renderFunASRPackedTranscript(
    filename: string,
    phrases: Array<{ text: string; start: number; end: number; speaker_id?: number | string }>,
    duration: number
  ): string {
    const baseName = this.transcriptBaseName(filename)
    const lines = [
      '# Packed transcripts',
      '',
      'Phrase-level transcript generated by FunASR.',
      'Use `[start-end]` ranges to address cuts while retaining subtitle-boundary precision.',
      '',
      `## ${baseName}  (duration: ${this.formatTranscriptDuration(duration)}, ${phrases.length} phrases)`,
    ]
    if (phrases.length === 0) {
      lines.push('  _no speech detected_')
      return lines.join('\n')
    }
    phrases.forEach((phrase) => {
      const speaker = phrase.speaker_id !== undefined
        ? ` ${String(phrase.speaker_id).startsWith('speaker_') ? `S${String(phrase.speaker_id).slice('speaker_'.length)}` : String(phrase.speaker_id)}`
        : ''
      lines.push(`  [${this.formatTranscriptTime(phrase.start)}-${this.formatTranscriptTime(phrase.end)}]${speaker} ${phrase.text}`)
    })
    return lines.join('\n')
  }

  private static transcriptBaseName(filename: string): string {
    const fallback = 'funasr_transcript'
    const name = filename.split(/[\\/]/).pop()?.trim() || fallback
    const extensionIndex = name.lastIndexOf('.')
    return extensionIndex > 0 ? name.slice(0, extensionIndex) : name
  }

  private static formatTranscriptTime(seconds: number): string {
    return seconds.toFixed(2).padStart(6, '0')
  }

  private static formatTranscriptDuration(seconds: number): string {
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`
    }
    const minutes = Math.floor(seconds / 60)
    const remaining = seconds - minutes * 60
    return `${minutes}m ${remaining.toFixed(1).padStart(4, '0')}s`
  }

  private static normalizeSpeakerId(value: unknown): number | string | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) return value.trim()
    return undefined
  }

  private static toFiniteNumber(value: unknown): number | null {
    const parsed = typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN
    return Number.isFinite(parsed) ? parsed : null
  }

  private static buildSubtitleValidationBody(request: ValidateSubtitlesRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {}
    if (Array.isArray(request.segments)) {
      body.segments = request.segments
    }
    if (Array.isArray(request.contextSegments)) {
      body.context_segments = request.contextSegments
    }
    if (request.language?.trim()) {
      body.language = request.language.trim()
    }
    if (request.projectId?.trim()) {
      body.project_id = request.projectId.trim()
    }
    return body
  }

  private static normalizeSubtitleValidationSegments(
    segments: unknown,
    subtitles: unknown
  ): SubtitleValidationSegment[] {
    if (Array.isArray(segments)) {
      return segments.filter(isRecord).map((item) => item as SubtitleValidationSegment)
    }
    if (Array.isArray(subtitles)) {
      return subtitles.filter(isRecord).map((item) => item as SubtitleValidationSegment)
    }
    if (isRecord(subtitles)) {
      return Object.entries(subtitles)
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([id, item]) => isRecord(item) ? { id, ...item } as SubtitleValidationSegment : null)
        .filter((item): item is SubtitleValidationSegment => Boolean(item))
    }
    return []
  }

  private static subtitleSegmentsToRecord(
    segments: SubtitleValidationSegment[]
  ): Record<string, SubtitleValidationSegment> {
    return segments.reduce<Record<string, SubtitleValidationSegment>>((acc, segment, index) => {
      const id = String(segment.id ?? index + 1)
      acc[id] = segment
      return acc
    }, {})
  }

  private static resolveScribePollIntervalMs(
    submission: ElevenLabsScribeSubmitResponse,
    overrideMs?: number
  ): number {
    if (typeof overrideMs === 'number' && Number.isFinite(overrideMs) && overrideMs > 0) {
      return overrideMs
    }
    const fromServer = submission.poll_interval_seconds
    if (typeof fromServer === 'number' && Number.isFinite(fromServer) && fromServer > 0) {
      return Math.round(fromServer * 1000)
    }
    return DEFAULT_SCRIBE_POLL_INTERVAL_MS
  }

  private static waitForScribePollInterval(ms: number, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal, '音频转录已取消')
    return new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        cleanup()
        resolve()
      }, ms)
      const onAbort = () => {
        globalThis.clearTimeout(timer)
        cleanup()
        reject(createAbortError('音频转录已取消'))
      }
      const cleanup = () => signal?.removeEventListener('abort', onAbort)
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  /**
   * 批量分析图片
   */
  static async analyzeImages(
    images: Array<{
      canvas?: HTMLCanvasElement | null;
      imageUrl?: string | null;
      base64Data?: string;
      mimeType?: string;
    }>,
    subtitleContext?: {
      previousSubtitles?: Array<{ start: number; end: number; text: string }>  // 最多10段
      nextSubtitles?: Array<{ start: number; end: number; text: string }>      // 最多10段
    }
  ): Promise<AnalyzeImagesResponse> {
    // 转换图片数据，优先使用 base64 方式
    const imageData: Array<{ type: 'file' | 'base64' | 'url'; data: string; mime_type: string }> = []

    for (const image of images) {
      // 优先使用直接提供的 base64 数据
      if (image.base64Data) {
        imageData.push({
          type: 'base64',
          data: image.base64Data,
          mime_type: image.mimeType || 'image/jpeg'
        })
      }
      // 其次使用 imageUrl（如果是data URL则转换为base64）
      else if (image.imageUrl) {
        if (image.imageUrl.startsWith('data:')) {
          // data URL，转换为 base64
          try {
            const base64Data = image.imageUrl.split(',')[1]
            const mimeMatch = image.imageUrl.match(/^data:([^;]+);/)
            const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg'

            imageData.push({
              type: 'base64',
              data: base64Data,
              mime_type: mimeType
            })
          } catch (error) {
              continue
          }
        } else {
          // 普通 URL
          imageData.push({
            type: 'url',
            data: image.imageUrl,
            mime_type: 'image/jpeg'
          })
        }
      }
      // 最后才使用 Canvas
      else if (image.canvas instanceof HTMLCanvasElement) {
        try {
          const dataUrl = image.canvas.toDataURL('image/jpeg', 0.8)
          const base64Data = dataUrl.split(',')[1] // 移除 data:image/jpeg;base64, 前缀

          imageData.push({
            type: 'base64',
            data: base64Data,
            mime_type: 'image/jpeg'
          })
        } catch (error) {
          continue // 跳过这张图片
        }
      } else {
        continue // 跳过无效的图片数据
      }
    }

    if (imageData.length === 0) {
      throw new Error('没有可分析的图片数据')
    }

    const requestBody: AnalyzeImagesRequest = {
      images: imageData
    }

    // 格式化并添加字幕上下文（如果提供）
    if (subtitleContext?.previousSubtitles?.length) {
      requestBody.previous_subtitle = subtitleContext.previousSubtitles
        .map(s => `[${s.start.toFixed(2)}s-${s.end.toFixed(2)}s] ${s.text}`)
        .join('\n')
    }

    if (subtitleContext?.nextSubtitles?.length) {
      requestBody.next_subtitle = subtitleContext.nextSubtitles
        .map(s => `[${s.start.toFixed(2)}s-${s.end.toFixed(2)}s] ${s.text}`)
        .join('\n')
    }

    return this.request<AnalyzeImagesResponse>(
      '/api/v1/tools/analyze-images',
      {
        method: 'POST',
        body: JSON.stringify(requestBody)
      },
      '画面分析失败'
    )
  }

  static async analyzeTimelineViewImage(
    request: AnalyzeTimelineViewImageRequest,
    options?: AiToolsWorkflowStreamOptions<TimelineViewAnalysisStreamEvent>
  ): Promise<TimelineViewAnalysisResponse> {
    throwIfAborted(options?.signal, '视觉辅助图分析已取消')
    const body: Record<string, unknown> = {
      image_oss_url: request.imageOssUrl,
    }
    if (typeof request.start === 'number' && Number.isFinite(request.start)) {
      body.start = request.start
    }
    if (typeof request.end === 'number' && Number.isFinite(request.end)) {
      body.end = request.end
    }
    if (typeof request.nFrames === 'number' && Number.isFinite(request.nFrames)) {
      body.n_frames = Math.round(request.nFrames)
    }
    if (request.prompt?.trim()) {
      body.prompt = request.prompt.trim()
    }
    if (request.model?.trim()) {
      body.model = request.model.trim()
    }
    if (request.projectId?.trim()) {
      body.project_id = request.projectId.trim()
    }

    const url = `${API_BASE_URL}/api/v1/tools/timeline-view/analyze`
    const response = await authenticatedFetch(url, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.withWorkflowIdentity(body, options?.workflowIdentity)),
      signal: options?.signal,
    }, {
      accessToken: request.accessToken,
      missingTokenMessage: '缺少访问令牌，请先登录或填写 Bearer Token',
    })

    if (!response.ok) {
      const responseText = await response.text().catch(() => '')
      throw this.buildApiError(response, responseText, '视觉辅助图分析失败')
    }

    if (!response.body) {
      throw new Error('浏览器不支持流式响应')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finalResult: TimelineViewAnalysisResponse | null = null

    while (true) {
      throwIfAborted(options?.signal, '视觉辅助图分析已取消')
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const extracted = extractSSEFrames(buffer)
      buffer = extracted.remainingBuffer

      for (const rawEvent of extracted.frames) {
        const parsedEvent = parseSSEEvent(rawEvent)
        if (!parsedEvent) continue

        let payload: unknown
        try {
          payload = JSON.parse(parsedEvent.data)
        } catch {
          continue
        }

        if (parsedEvent.event === 'stage') {
          const data = isRecord(payload) ? payload : {}
          options?.onEvent?.({
            type: 'stage',
            stage: typeof data.stage === 'string' ? data.stage : '',
            message: typeof data.message === 'string' ? data.message : '',
          })
        } else if (parsedEvent.event === 'answer_delta') {
          const data = isRecord(payload) ? payload : {}
          options?.onEvent?.({ type: 'answer_delta', delta: typeof data.delta === 'string' ? data.delta : '' })
        } else if (parsedEvent.event === 'completed') {
          const data = isRecord(payload) ? payload : {}
          const usage = isRecord(data.usage) ? data.usage : {}
          const range = isRecord(data.range) ? data.range : {}
          const responseData: TimelineViewAnalysisResponse = {
            success: data.success !== false,
            provider: typeof data.provider === 'string' ? data.provider : 'dashscope',
            model: typeof data.model === 'string' ? data.model : '',
            timeline_image_url: typeof data.timeline_image_url === 'string' ? data.timeline_image_url : '',
            timeline_image_size: Number(data.timeline_image_size || 0),
            range: {
              start: Number(range.start || 0),
              end: Number(range.end || 0),
              duration: Number(range.duration || 0),
              has_start: Boolean(range.has_start),
              has_end: Boolean(range.has_end),
            },
            n_frames: Number(data.n_frames || 0),
            content: typeof data.content === 'string' ? data.content : '',
            analysis: isRecord(data.analysis) ? data.analysis : null,
            raw_result: data.raw_result,
            usage: {
              prompt_tokens: Number(usage.prompt_tokens || 0),
              completion_tokens: Number(usage.completion_tokens || 0),
              total_tokens: Number(usage.total_tokens || 0),
            },
            request_id: typeof data.request_id === 'string' ? data.request_id : '',
            tokens_consumed: Number(data.tokens_consumed || 0),
            updated_at: typeof data.updated_at === 'string' ? data.updated_at : new Date().toISOString(),
          }
          finalResult = responseData
          options?.onEvent?.({ type: 'completed', response: responseData })
          void reader.cancel()
          return responseData
        } else if (parsedEvent.event === 'error') {
          const data = isRecord(payload) ? payload : {}
          const message = typeof data.message === 'string' && data.message.trim()
            ? data.message.trim()
            : '流式视觉辅助图分析失败'
          options?.onEvent?.({ type: 'error', message })
          throw new Error(message)
        }
      }
    }

    if (!finalResult) {
      throw new Error('流式视觉辅助图分析已结束，但未收到最终结果')
    }

    return finalResult
  }

  static async analyzeNarrativeContext(
    request: AnalyzeNarrativeContextRequest,
    options?: AiToolsWorkflowStreamOptions<NarrativeUnderstandingStreamEvent>,
  ): Promise<NarrativeUnderstandingResponse> {
    return this.analyzeNarrativeContextStream(request, options)
  }

  static async analyzeNarrativeContextStream(
    request: AnalyzeNarrativeContextRequest,
    options?: AiToolsWorkflowStreamOptions<NarrativeUnderstandingStreamEvent>
  ): Promise<NarrativeUnderstandingResponse> {
    throwIfAborted(options?.signal, '剧情理解已取消')
    const url = `${API_BASE_URL}/api/v1/tools/frame-workflow/narrative-analyze`
    const response = await authenticatedFetch(url, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.withWorkflowIdentity(this.buildNarrativeContextBody(request), options?.workflowIdentity)),
      signal: options?.signal,
    })

    if (!response.ok) {
      const rawText = await response.text().catch(() => '')
      throw this.buildApiError(response, rawText, '流式剧情理解失败')
    }

    if (!response.body) {
      throw new Error('浏览器不支持流式响应')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finalResult: NarrativeUnderstandingResponse | null = null

    while (true) {
      throwIfAborted(options?.signal, '剧情理解已取消')
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const extracted = extractSSEFrames(buffer)
      buffer = extracted.remainingBuffer

      for (const rawEvent of extracted.frames) {
        const parsedEvent = parseSSEEvent(rawEvent)
        if (!parsedEvent) continue

        let payload: unknown
        try {
          payload = JSON.parse(parsedEvent.data)
        } catch {
          continue
        }

        if (parsedEvent.event === 'stage') {
          const data = isRecord(payload) ? payload : {}
          options?.onEvent?.({
            type: 'stage',
            stage: typeof data.stage === 'string' ? data.stage : '',
            message: typeof data.message === 'string' ? data.message : '',
          })
        } else if (parsedEvent.event === 'thinking_delta') {
          const data = isRecord(payload) ? payload : {}
          options?.onEvent?.({ type: 'thinking_delta', delta: typeof data.delta === 'string' ? data.delta : '' })
        } else if (parsedEvent.event === 'answer_delta') {
          const data = isRecord(payload) ? payload : {}
          options?.onEvent?.({ type: 'answer_delta', delta: typeof data.delta === 'string' ? data.delta : '' })
        } else if (parsedEvent.event === 'completed') {
          const data = isRecord(payload) ? payload : {}
          const usage = isRecord(data.usage) ? data.usage : {}
          const analysis = isRecord(data.analysis) ? data.analysis as NarrativeUnderstandingAnalysis : {}
          const responseData: NarrativeUnderstandingResponse = {
            success: data.success !== false,
            provider: typeof data.provider === 'string' ? data.provider : 'openai',
            model: typeof data.model === 'string' ? data.model : '',
            content: typeof data.content === 'string' ? data.content : '',
            analysis,
            confirmed_question_answers: Array.isArray(data.confirmed_question_answers) ? data.confirmed_question_answers : undefined,
            characters: Array.isArray(data.characters) ? data.characters : [],
            relationships: Array.isArray(data.relationships) ? data.relationships : [],
            emotion_curve: Array.isArray(data.emotion_curve) ? data.emotion_curve : [],
            events: Array.isArray(data.events) ? data.events : [],
            usage: {
              prompt_tokens: Number(usage.prompt_tokens || 0),
              completion_tokens: Number(usage.completion_tokens || 0),
              total_tokens: Number(usage.total_tokens || 0),
            },
            request_id: typeof data.request_id === 'string' ? data.request_id : '',
            tokens_consumed: Number(data.tokens_consumed || 0),
            updated_at: typeof data.updated_at === 'string' ? data.updated_at : new Date().toISOString(),
          }
          finalResult = responseData
          options?.onEvent?.({ type: 'completed', response: responseData })
          void reader.cancel()
          return responseData
        } else if (parsedEvent.event === 'error') {
          const data = isRecord(payload) ? payload : {}
          const message = typeof data.message === 'string' && data.message.trim()
            ? data.message.trim()
            : '流式剧情理解失败'
          options?.onEvent?.({ type: 'error', message })
          throw new Error(message)
        }
      }
    }

    if (!finalResult) {
      throw new Error('流式剧情理解已结束，但未收到最终结果')
    }

    return finalResult
  }

  private static buildNarrativeContextBody(request: AnalyzeNarrativeContextRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {}
    if (request.videoContext?.trim()) {
      body.video_context = request.videoContext.trim()
    }
    if (request.transcript?.trim()) {
      body.transcript = request.transcript.trim()
    }
    if (Array.isArray(request.segments)) {
      body.segments = request.segments
    }
    if (Array.isArray(request.decisions)) {
      body.decisions = request.decisions
    }
    if (Array.isArray(request.visualAnalyses)) {
      body.visual_analyses = request.visualAnalyses
    }
    if (request.cacheContext !== undefined) {
      body.cache_context = request.cacheContext
    }
    if (request.language?.trim()) {
      body.language = request.language.trim()
    }
    if (request.prompt?.trim()) {
      body.prompt = request.prompt.trim()
    }
    if (request.projectId?.trim()) {
      body.project_id = request.projectId.trim()
    }
    return body
  }

  private static buildDecideTimelineViewBody(request: DecideTimelineViewRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {}
    if (request.videoContext?.trim()) {
      body.video_context = request.videoContext.trim()
    }
    if (request.transcript?.trim()) {
      body.transcript = request.transcript.trim()
    }
    if (Array.isArray(request.segments)) {
      body.segments = request.segments
    }
    if (Array.isArray(request.observedGaps)) {
      body.observed_gaps = request.observedGaps
    }
    if (Array.isArray(request.candidateCuts)) {
      body.candidate_cuts = request.candidateCuts
    }
    if (Array.isArray(request.renderedCuts)) {
      body.rendered_cuts = request.renderedCuts
    }
    if (typeof request.maxDecisions === 'number' && Number.isFinite(request.maxDecisions)) {
      body.max_decisions = Math.max(1, Math.round(request.maxDecisions))
    }
    if (typeof request.defaultNFrames === 'number' && Number.isFinite(request.defaultNFrames)) {
      body.default_n_frames = Math.max(1, Math.round(request.defaultNFrames))
    }
    if (request.prompt?.trim()) {
      body.prompt = request.prompt.trim()
    }
    if (request.projectId?.trim()) {
      body.project_id = request.projectId.trim()
    }
    return body
  }

  private static withWorkflowIdentity<T extends Record<string, unknown>>(
    body: T,
    workflowIdentity?: WorkflowRequestIdentity,
  ): T | (T & Record<string, string>) {
    return workflowIdentity ? withWorkflowIdentityInJson(body, workflowIdentity) : body
  }

  private static buildApiError(response: Response, rawText: string, fallback: string): Error {
    const status = response.status

    let parsed: any = null
    if (rawText) {
      try {
        parsed = JSON.parse(rawText)
      } catch {
        // ignore parse errors
      }
    }

    const detail = parsed?.detail ?? null
    const errorCode: string | undefined = detail?.error_code || parsed?.error_code

    let message = detail?.error_message || parsed?.message || parsed?.error || rawText || `${fallback}: ${status}`

    if (status === 402 && detail) {
      const required = detail.required_tokens
      const remaining = detail.remaining_tokens
      const base = detail.error_message || 'Token余额不足，请升级订阅或等待下个周期'
      if (typeof required === 'number' && typeof remaining === 'number') {
        message = `${base}（需 ${required}，剩余 ${remaining}）`
      } else {
        message = base
      }
    }

    const error = new Error(message || `${fallback}: ${status}`)
    ;(error as any).status = status
    if (errorCode) {
      ;(error as any).code = errorCode
    }
    if (detail) {
      ;(error as any).detail = detail
    } else if (parsed) {
      ;(error as any).detail = parsed
    }

    return error
  }
}

/**
 * 将后端的分析结果转换为前端的 FrameAnalysisResult 格式（简化版）
 */
export function convertAnalysisResponse(
  response: AnalyzeImagesResponse
): FrameAnalysisResult[] {
  // 新接口只返回 summary，直接使用
  return [{
    success: true,
    content: response.summary || response.content || '分析完成',
    timestamp: Date.now(),
    confidence: 1.0,
    summary: response.summary
  }]
}

// 导出单例服务
export const aiToolsService = AiToolsService
