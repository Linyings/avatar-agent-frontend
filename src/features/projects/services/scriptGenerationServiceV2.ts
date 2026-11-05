/**
 * 视频脚本生成服务 V2
 * 默认主流程采用单轮 SSE：一次生成解说文案与画面匹配脚本。
 * 文案审核开启时可拆分为“生成文案草稿”和“画面匹配”两个 SSE 调用。
 *
 * API 文档: docs/video-script-generation-v2.md
 */

import { authenticatedFetch } from '@/features/auth/services/authService'
import { throwIfAborted } from '@/shared/utils/abort'
import { withWorkflowIdentityInJson, type WorkflowRequestIdentity } from '@/shared/workflowRuns/identity'

// Local web deployments proxy /api to the local backend. Vite replaces an
// unset variable with undefined, so keep this as a same-origin path.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

const SSE_FRAME_YIELD_BATCH_SIZE = 8

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const SSE_FRAME_SEPARATOR = /\r\n\r\n|\n\n|\r\r/

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

const yieldToBrowser = () => new Promise<void>((resolve) => {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(() => resolve())
    return
  }

  globalThis.setTimeout(resolve, 0)
})

const formatUnknownErrorText = (value: unknown): string => {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  if (Array.isArray(value)) {
    const messages = value
      .map(item => formatUnknownErrorText(item))
      .filter(Boolean)

    return messages.join('\n').trim()
  }

  if (isRecord(value)) {
    const nestedPriority = ['error_message', 'details', 'message', 'msg']

    for (const key of nestedPriority) {
      const candidate = formatUnknownErrorText(value[key])
      if (candidate) {
        return candidate
      }
    }

    const loc = Array.isArray(value.loc)
      ? value.loc.map(item => formatUnknownErrorText(item)).filter(Boolean).join('.')
      : ''
    const msg = formatUnknownErrorText(value.msg)

    if (loc && msg) {
      return `${loc}: ${msg}`
    }

    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return ''
    }
  }

  return ''
}

const buildApiError = (response: Response, rawText: string, fallback: string): Error => {
  let parsed: unknown = null

  if (rawText) {
    try {
      parsed = JSON.parse(rawText)
    } catch {
      parsed = null
    }
  }

  const detail = isRecord(parsed) ? parsed.detail : null
  const message = [
    isRecord(detail) ? formatUnknownErrorText(detail.error_message) : '',
    isRecord(detail) ? formatUnknownErrorText(detail.details) : '',
    isRecord(detail) ? formatUnknownErrorText(detail.message) : '',
    !isRecord(detail) ? formatUnknownErrorText(detail) : '',
    rawText.trim(),
    `${fallback}: ${response.status} ${response.statusText}`.trim()
  ].find(Boolean)

  const error = new Error(message || fallback) as Error & {
    status?: number
    detail?: unknown
    rawText?: string
    code?: string
    retryable?: boolean
    requestId?: string
  }

  error.status = response.status
  error.detail = detail ?? parsed
  error.rawText = rawText
  const structuredDetail = isRecord(detail)
    ? detail
    : isRecord(parsed)
      ? parsed
      : {}
  if (typeof structuredDetail.code === 'string') error.code = structuredDetail.code
  if (typeof structuredDetail.retryable === 'boolean') error.retryable = structuredDetail.retryable
  if (typeof structuredDetail.request_id === 'string') error.requestId = structuredDetail.request_id

  return error
}

const parseSSEEvent = (rawEvent: string): ParsedSSEEvent | null => {
  const normalized = rawEvent.replace(/\r\n/g, '\n').trim()
  if (!normalized || normalized.startsWith(':')) {
    return null
  }

  let event = 'message'
  const dataLines: string[] = []

  for (const line of normalized.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim() || 'message'
      continue
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim())
    }
  }

  const data = dataLines.join('\n').trim()
  if (!data) {
    return null
  }

  return { event, data }
}

// ============ 类型定义 ============

export interface VideoConfig {
  model_level?: 'frame'
  target_language: string
  audio_speed: number
  word_count: string
  person_view: 'first_person' | 'third_person'
  help_text?: string
  type_script?: 'default' | 'reference' | 'previous'
  type_script_value?: string
  style_mode?: string
  is_org?: boolean
  org_ratio?: number
  clip_mode?: string
  source_language?: string
  storyboard_mode?: string
  storyboard_count?: number | null
  word_count_mode?: string
  mix_ratio?: number
  output_duration_ms?: number
  narration_ratio?: number
  custom_prompt_enabled?: boolean
  custom_prompt_text?: string
}

export interface VideoContextItem {
  start_time: number
  end_time: number
  subtitle: string
  visual: string
  speaker_id?: number | string
}

export interface VideoContextMap {
  [key: string]: VideoContextItem
}

export interface GenerateScriptRequest {
  video_config: VideoConfig
  video_context: unknown
  cache_context?: unknown
  custom_prompt?: string
  project_id?: string
  model_profile?: 'flash' | 'pro'
  model_operation?:
    | 'initial'
    | 'quality_repair'
    | 'contract_repair'
    | 'compression'
    | 'fallback'
    | 'narration_outline'
    | 'narration_segment'
    | 'narration_humanize'
    | 'narration_global_review'
    | 'narration_global_repair'
    | 'narration_compression'
}

export type GenerateNarrationDraftRequest = GenerateScriptRequest
export type NarrationRepairPatchKind = 'text' | 'timeline'

export interface MatchNarrationVisualsRequest extends GenerateScriptRequest {
  script_items: AnchoredNarrationDraftItem[]
}

interface ParsedSSEEvent {
  event: string
  data: string
}

// ============ 响应类型 ============

export interface TokenUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export type BaseGenerateScriptStreamEvent<TItem> =
  | {
      type: 'stage'
      stage: string
      message: string
      metadata?: Record<string, unknown> | null
    }
  | {
      type: 'thinking_delta'
      delta: string
    }
  | {
      type: 'answer_delta'
      delta: string
    }
  | {
      type: 'usage'
      usage: TokenUsage
    }
  | {
      type: 'completed'
      items: TItem[]
      usage: TokenUsage
      model: string
      request_id: string
      metadata?: Record<string, unknown>
    }
  | {
      type: 'error'
      message: string
      code?: string
      retryable?: boolean
      requestId?: string
    }

export type GenerateScriptStreamEvent = BaseGenerateScriptStreamEvent<ScriptItem>
export type GenerateNarrationDraftStreamEvent = BaseGenerateScriptStreamEvent<NarrationDraftItem>
export type GenerateNarrationRepairStreamEvent = BaseGenerateScriptStreamEvent<NarrationRepairPatch>
export type MatchNarrationVisualsStreamEvent = BaseGenerateScriptStreamEvent<ScriptItem>

export interface ScriptItem {
  _id: number
  text: string
  start: number
  end: number
  org: string
}

type ScriptItemPayload = Partial<ScriptItem> & { id?: number | string; _id?: number | string }
type NarrationDraftItemPayload = Partial<NarrationDraftItem> & { id?: number | string; _id?: number | string }
type NarrationRepairPatchPayload = Partial<NarrationRepairPatch> & { id?: number | string; _id?: number | string }

const normalizeScriptItems = (items: ScriptItemPayload[]): ScriptItem[] => {
  const usedIds = new Set<number>()

  return items.map((item, index) => {
    const rawId = item._id ?? item.id
    let nextId = typeof rawId === 'number'
      ? Math.trunc(rawId)
      : typeof rawId === 'string' && rawId.trim()
        ? Math.trunc(Number(rawId))
        : Number.NaN

    if (!Number.isFinite(nextId) || nextId <= 0 || usedIds.has(nextId)) {
      nextId = index + 1
      while (usedIds.has(nextId)) {
        nextId += 1
      }
    }

    usedIds.add(nextId)

    return {
      _id: nextId,
      text: typeof item.text === 'string' ? item.text : '',
      start: typeof item.start === 'number' ? item.start : 0,
      end: typeof item.end === 'number' ? item.end : 0,
      org: typeof item.org === 'string' ? item.org : ''
    }
  })
}

export interface NarrationDraftItem {
  _id: number
  text: string
}

export type NarrationEventPriority = 'high' | 'medium' | 'low'

export interface AnchoredNarrationDraftItem extends NarrationDraftItem {
  chapter_id: string
  event_ids: string[]
  evidence_refs: string[]
  source_start: number
  source_end: number
  priority: NarrationEventPriority
}

const normalizeNarrationDraftItems = (items: NarrationDraftItemPayload[]): NarrationDraftItem[] => {
  const usedIds = new Set<number>()

  return items
    .map((item, index) => {
      const rawId = item._id ?? item.id
      let nextId = typeof rawId === 'number'
        ? Math.trunc(rawId)
        : typeof rawId === 'string' && rawId.trim()
          ? Math.trunc(Number(rawId))
          : Number.NaN

      if (!Number.isFinite(nextId) || nextId <= 0 || usedIds.has(nextId)) {
        nextId = index + 1
        while (usedIds.has(nextId)) {
          nextId += 1
        }
      }

      usedIds.add(nextId)

      return {
        _id: nextId,
        text: typeof item.text === 'string' ? item.text : ''
      }
    })
    .filter(item => item.text.trim().length > 0)
}

export interface NarrationRepairPatch {
  _id: number
  text?: string
  start?: number
  end?: number
}

const normalizeNarrationCompressionItems = (items: NarrationDraftItemPayload[]): NarrationDraftItem[] => items.map((item, index) => ({
  _id: typeof item._id === 'number' ? item._id : Number(item._id ?? item.id ?? index + 1),
  text: typeof item.text === 'string' ? item.text : '',
}))

const normalizeNarrationRepairPatches = (items: NarrationRepairPatchPayload[]): NarrationRepairPatch[] => {
  return items.flatMap((item) => {
    const rawId = item._id ?? item.id
    const id = typeof rawId === 'number'
      ? rawId
      : typeof rawId === 'string' && rawId.trim()
        ? Number(rawId)
        : Number.NaN
    if (!Number.isInteger(id) || id <= 0) return []

    const patch: NarrationRepairPatch = { _id: id }
    if (typeof item.text === 'string') patch.text = item.text
    if (typeof item.start === 'number' && Number.isFinite(item.start)) patch.start = item.start
    if (typeof item.end === 'number' && Number.isFinite(item.end)) patch.end = item.end
    return [patch]
  })
}

export interface GenerateScriptResponse {
  items: ScriptItem[]
  usage: TokenUsage
  model: string
  request_id: string
  metadata?: Record<string, unknown>
}

export interface GenerateNarrationDraftResponse {
  items: NarrationDraftItem[]
  usage: TokenUsage
  model: string
  request_id: string
  metadata?: Record<string, unknown>
}

export interface GenerateNarrationRepairResponse {
  items: NarrationRepairPatch[]
  usage: TokenUsage
  model: string
  request_id: string
  metadata?: Record<string, unknown>
}

export interface GenerateNarrationStructuredResponse {
  result: Record<string, unknown>
  usage: TokenUsage
  model: string
  request_id: string
  metadata?: Record<string, unknown>
}

export type MatchNarrationVisualsResponse = GenerateScriptResponse

export interface GenerateScriptStreamOptions<TItem = ScriptItem> {
  signal?: AbortSignal
  onEvent?: (event: BaseGenerateScriptStreamEvent<TItem>) => void
}

export interface WorkflowGenerateScriptStreamOptions<TItem = ScriptItem>
  extends GenerateScriptStreamOptions<TItem> {
  workflowIdentity?: WorkflowRequestIdentity
}

// ============ 服务类 ============

class ScriptGenerationServiceV2 {
  async generateScriptStream(
    request: GenerateScriptRequest,
    options?: WorkflowGenerateScriptStreamOptions<ScriptItem>
  ): Promise<GenerateScriptResponse> {
    return this.streamItems({
      endpoint: `${API_BASE_URL}/api/v1/tools/generate-script-stream`,
      request,
      options,
      workflowIdentity: options?.workflowIdentity,
      normalizeItems: normalizeScriptItems,
      abortMessage: '解说文案生成已取消',
      apiErrorMessage: '流式生成脚本失败',
      missingResultMessage: '流式生成已结束，但未收到最终脚本结果',
      streamErrorMessage: '流式生成脚本失败',
    })
  }

  async generateNarrationDraftStream(
    request: GenerateNarrationDraftRequest,
    options?: WorkflowGenerateScriptStreamOptions<NarrationDraftItem>
  ): Promise<GenerateNarrationDraftResponse> {
    return this.streamItems({
      endpoint: `${API_BASE_URL}/api/v1/tools/generate-narration-draft-stream`,
      request,
      options,
      workflowIdentity: options?.workflowIdentity,
      normalizeItems: normalizeNarrationDraftItems,
      abortMessage: '解说文案草稿生成已取消',
      apiErrorMessage: '流式生成解说文案草稿失败',
      missingResultMessage: '流式生成已结束，但未收到最终文案草稿',
      streamErrorMessage: '流式生成解说文案草稿失败',
    })
  }

  async generateNarrationHumanizeStream(
    request: GenerateNarrationDraftRequest,
    options?: WorkflowGenerateScriptStreamOptions<NarrationDraftItem>,
  ): Promise<GenerateNarrationDraftResponse> {
    return this.streamItems({
      endpoint: `${API_BASE_URL}/api/v1/tools/generate-narration-draft-stream`,
      request: { ...request, model_operation: 'narration_humanize' },
      options,
      workflowIdentity: options?.workflowIdentity,
      normalizeItems: normalizeNarrationCompressionItems,
      abortMessage: '\u89e3\u8bf4\u6587\u6848\u62df\u4eba\u5316\u6539\u5199\u5df2\u53d6\u6d88',
      apiErrorMessage: '\u89e3\u8bf4\u6587\u6848\u62df\u4eba\u5316\u6539\u5199\u5931\u8d25',
      missingResultMessage: '\u62df\u4eba\u5316\u6539\u5199\u5df2\u7ed3\u675f\uff0c\u4f46\u672a\u6536\u5230\u6709\u6548\u6587\u6848',
      streamErrorMessage: '\u89e3\u8bf4\u6587\u6848\u62df\u4eba\u5316\u6539\u5199\u5931\u8d25',
    })
  }

  async generateNarrationRepairStream(
    request: GenerateScriptRequest,
    patchKind: NarrationRepairPatchKind,
    options?: WorkflowGenerateScriptStreamOptions<NarrationRepairPatch>
  ): Promise<GenerateNarrationRepairResponse> {
    return this.streamItems({
      endpoint: patchKind === 'timeline'
        ? `${API_BASE_URL}/api/v1/tools/generate-script-stream`
        : `${API_BASE_URL}/api/v1/tools/generate-narration-draft-stream`,
      request,
      options,
      workflowIdentity: options?.workflowIdentity,
      normalizeItems: normalizeNarrationRepairPatches,
      abortMessage: '解说文案修正已取消',
      apiErrorMessage: '流式修正解说文案失败',
      missingResultMessage: '流式修正已结束，但未收到最终补丁结果',
      streamErrorMessage: '流式修正解说文案失败',
    })
  }

  async generateNarrationCompressionStream(
    request: GenerateScriptRequest,
    options?: WorkflowGenerateScriptStreamOptions<NarrationDraftItem>,
  ): Promise<GenerateNarrationDraftResponse> {
    return this.streamItems({
      endpoint: `${API_BASE_URL}/api/v1/tools/generate-narration-draft-stream`,
      request: { ...request, model_operation: 'narration_compression' },
      options,
      workflowIdentity: options?.workflowIdentity,
      normalizeItems: normalizeNarrationCompressionItems,
      abortMessage: 'narration compression cancelled',
      apiErrorMessage: 'narration compression failed',
      missingResultMessage: 'narration compression returned no result',
      streamErrorMessage: 'narration compression failed',
    })
  }

  async generateNarrationStructuredStream(
    request: GenerateNarrationDraftRequest,
    options?: WorkflowGenerateScriptStreamOptions<NarrationDraftItem>
  ): Promise<GenerateNarrationStructuredResponse> {
    const response = await this.generateNarrationDraftStream(request, options)
    const structured = response.metadata?.structured_result
    if (!isRecord(structured)) {
      throw new Error('模型未返回有效的结构化文案结果')
    }
    return {
      result: structured,
      usage: response.usage,
      model: response.model,
      request_id: response.request_id,
      metadata: response.metadata,
    }
  }

  async matchNarrationVisualsStream(
    request: MatchNarrationVisualsRequest,
    options?: WorkflowGenerateScriptStreamOptions<ScriptItem>
  ): Promise<MatchNarrationVisualsResponse> {
    return this.streamItems({
      endpoint: `${API_BASE_URL}/api/v1/tools/match-narration-visuals-stream`,
      request,
      options,
      workflowIdentity: options?.workflowIdentity,
      normalizeItems: normalizeScriptItems,
      abortMessage: '画面匹配已取消',
      apiErrorMessage: '流式匹配画面失败',
      missingResultMessage: '流式匹配已结束，但未收到最终脚本结果',
      streamErrorMessage: '流式匹配画面失败',
    })
  }

  private async streamItems<TItem, TResponse extends { items: TItem[]; usage: TokenUsage; model: string; request_id: string; metadata?: Record<string, unknown> }>({
    endpoint,
    request,
    options,
    workflowIdentity,
    normalizeItems,
    abortMessage,
    apiErrorMessage,
    missingResultMessage,
    streamErrorMessage,
  }: {
    endpoint: string
    request: GenerateScriptRequest
    options?: GenerateScriptStreamOptions<TItem>
    workflowIdentity?: WorkflowRequestIdentity
    normalizeItems: (items: Array<Partial<TItem> & { id?: number | string; _id?: number | string }>) => TItem[]
    abortMessage: string
    apiErrorMessage: string
    missingResultMessage: string
    streamErrorMessage: string
  }): Promise<TResponse> {
    throwIfAborted(options?.signal, abortMessage)
    const response = await authenticatedFetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        workflowIdentity ? withWorkflowIdentityInJson({ ...request }, workflowIdentity) : request,
      ),
      signal: options?.signal
    })

    if (!response.ok) {
      const rawText = await response.text().catch(() => '')
      throw buildApiError(response, rawText, apiErrorMessage)
    }

    if (!response.body) {
      throw new Error('浏览器不支持流式响应')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finalResult: TResponse | null = null
    let processedFrameCount = 0

    while (true) {
      throwIfAborted(options?.signal, abortMessage)
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const extractedFrames = extractSSEFrames(buffer)
      buffer = extractedFrames.remainingBuffer

      for (const rawEvent of extractedFrames.frames) {
        const parsedEvent = parseSSEEvent(rawEvent)
        if (!parsedEvent) continue

        let payload: unknown
        try {
          payload = JSON.parse(parsedEvent.data)
        } catch {
          continue
        }

        switch (parsedEvent.event) {
          case 'stage': {
            const data = isRecord(payload) ? payload : {}
            options?.onEvent?.({
              type: 'stage',
              stage: typeof data.stage === 'string' ? data.stage : '',
              message: typeof data.message === 'string' ? data.message : '',
              metadata: isRecord(data.metadata) ? data.metadata : null
            })
            break
          }
          case 'thinking_delta': {
            const data = isRecord(payload) ? payload : {}
            options?.onEvent?.({
              type: 'thinking_delta',
              delta: typeof data.delta === 'string' ? data.delta : ''
            })
            break
          }
          case 'answer_delta': {
            const data = isRecord(payload) ? payload : {}
            options?.onEvent?.({
              type: 'answer_delta',
              delta: typeof data.delta === 'string' ? data.delta : ''
            })
            break
          }
          case 'usage': {
            if (!isRecord(payload)) break
            const usage: TokenUsage = {
              prompt_tokens: Number(payload.prompt_tokens || 0),
              completion_tokens: Number(payload.completion_tokens || 0),
              total_tokens: Number(payload.total_tokens || 0)
            }
            options?.onEvent?.({ type: 'usage', usage })
            break
          }
          case 'completed': {
            const data = isRecord(payload) ? payload : {}
            finalResult = {
              items: normalizeItems(Array.isArray(data.items) ? data.items as Array<Partial<TItem> & { id?: number | string; _id?: number | string }> : []),
              usage: {
                prompt_tokens: Number(isRecord(data.usage) ? data.usage.prompt_tokens || 0 : 0),
                completion_tokens: Number(isRecord(data.usage) ? data.usage.completion_tokens || 0 : 0),
                total_tokens: Number(isRecord(data.usage) ? data.usage.total_tokens || 0 : 0)
              },
              model: typeof data.model === 'string' ? data.model : '',
              request_id: typeof data.request_id === 'string' ? data.request_id : '',
              metadata: isRecord(data.metadata) ? data.metadata : undefined
            } as TResponse
            options?.onEvent?.({ type: 'completed', ...finalResult })
            void reader.cancel()
            return finalResult
          }
          case 'error': {
            const data = isRecord(payload) ? payload : {}
            const message = formatUnknownErrorText(data.message) || streamErrorMessage
            const code = typeof data.code === 'string' ? data.code : undefined
            const retryable = typeof data.retryable === 'boolean' ? data.retryable : undefined
            const requestId = typeof data.request_id === 'string' ? data.request_id : undefined
            options?.onEvent?.({ type: 'error', message, code, retryable, requestId })
            const error = new Error(message) as Error & {
              code?: string
              retryable?: boolean
              requestId?: string
            }
            error.code = code
            error.retryable = retryable
            error.requestId = requestId
            throw error
          }
          default:
            break
        }

        processedFrameCount += 1
        if (processedFrameCount % SSE_FRAME_YIELD_BATCH_SIZE === 0) {
          await yieldToBrowser()
        }
      }
    }

    if (!finalResult) {
      throw new Error(missingResultMessage)
    }

    return finalResult
  }

}

// 导出单例
export const scriptGenerationServiceV2 = new ScriptGenerationServiceV2()
