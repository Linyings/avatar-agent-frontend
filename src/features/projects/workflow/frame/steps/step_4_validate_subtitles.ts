import { aiToolsService, type SubtitleValidationResponse, type SubtitleValidationSegment } from '@/shared/services/aiToolsService'
import { buildSubtitlePayload } from '@/features/projects/utils/subtitleTransform'
import { convertSubtitlesToVideoContext } from '@/features/projects/utils/videoContextConverter'
import type { SubtitleSegment } from '@/features/projects/types/material'
import { throwIfAborted } from '@/shared/utils/abort'
import type { WorkflowRequestIdentity } from '@/shared/workflowRuns/identity'
import { getFrameWorkflowBackendProjectId, type FrameWorkflowStep, type TranscribeOutput, type ValidateSubtitlesOutput } from '../types'
import { requireOutput } from '../utils/records'
import { updateWorkflowStepProgress } from '../utils/progress'
import { appendStreamPreviewChunk, streamPreview } from '../utils/workflowValue'

const textFromValidationSegment = (segment: SubtitleValidationSegment | undefined, fallback: string) => {
  const text = typeof segment?.subtitle === 'string' ? segment.subtitle : segment?.text
  return typeof text === 'string' && text.trim() ? text.trim() : fallback
}

const speakerFromValidationSegment = (
  segment: SubtitleValidationSegment | undefined,
  fallback: SubtitleSegment['speakerId']
) => {
  const speaker = segment?.speaker_id ?? segment?.speakerId
  if (typeof speaker === 'number' && Number.isFinite(speaker)) return speaker
  if (typeof speaker === 'string' && speaker.trim()) return speaker.trim()
  return fallback
}

const finiteNumber = (value: unknown): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
)

const startFromValidationSegment = (
  segment: SubtitleValidationSegment | undefined,
  fallback?: SubtitleSegment
) => finiteNumber(segment?.start ?? segment?.start_time) ?? fallback?.startTime ?? null

const endFromValidationSegment = (
  segment: SubtitleValidationSegment | undefined,
  fallback?: SubtitleSegment
) => finiteNumber(segment?.end ?? segment?.end_time) ?? fallback?.endTime ?? null

const sourceSegmentsById = (segments: SubtitleSegment[]) => (
  segments.reduce<Record<string, SubtitleSegment>>((acc, segment) => {
    if (segment.id) {
      acc[String(segment.id)] = segment
    }
    return acc
  }, {})
)

const buildCorrectedSegments = (
  source: TranscribeOutput,
  validation: SubtitleValidationResponse
): { segments: SubtitleSegment[]; correctionsCount: number } => {
  const sourceSegments = source.subtitleResult.segments
  const byId = sourceSegmentsById(sourceSegments)
  const validationSegments = validation.segments.length > 0 ? validation.segments : []

  if (validationSegments.length === 0) {
    return {
      segments: sourceSegments,
      correctionsCount: 0,
    }
  }

  let correctionsCount = 0
  const segments = validationSegments
    .map((validated, index): SubtitleSegment | null => {
      const fallback = validated.id !== undefined && validated.id !== null
        ? byId[String(validated.id)] ?? sourceSegments[index]
        : sourceSegments[index]
      const text = textFromValidationSegment(validated, fallback?.text ?? '')
      const startTime = startFromValidationSegment(validated, fallback)
      const endTime = endFromValidationSegment(validated, fallback)
      if (!text || startTime === null || endTime === null || endTime <= startTime) {
        return null
      }
      const speakerId = speakerFromValidationSegment(validated, fallback?.speakerId)
      if (
        !fallback
        || text !== fallback.text
        || speakerId !== fallback.speakerId
        || startTime !== fallback.startTime
        || endTime !== fallback.endTime
      ) {
        correctionsCount += 1
      }
      return {
        id: String(index + 1),
        startTime,
        endTime,
        text,
        confidence: fallback?.confidence ?? source.subtitleResult.confidence,
        speakerId,
      } satisfies SubtitleSegment
    })
    .filter((segment): segment is SubtitleSegment => segment !== null)
    .sort((left, right) => left.startTime - right.startTime)
    .map((segment, index) => ({
      ...segment,
      id: String(index + 1),
    }))

  if (segments.length === 0) {
    return {
      segments: sourceSegments,
      correctionsCount: 0,
    }
  }

  if (segments.length !== sourceSegments.length) {
    correctionsCount = Math.max(correctionsCount, Math.abs(segments.length - sourceSegments.length))
  }

  return {
    segments,
    correctionsCount,
  }
}

const correctedPhraseFromSegment = (segment: SubtitleSegment) => {
  const phrase: Record<string, unknown> = {
    text: segment.text,
    start: segment.startTime,
    end: segment.endTime,
  }
  if (segment.speakerId !== undefined) {
    phrase.speaker_id = segment.speakerId
    phrase.speaker = segment.speakerId
  }
  return phrase
}

const buildPackedTranscript = (segments: SubtitleSegment[]) => (
  segments
    .map((segment) => {
      const speaker = segment.speakerId !== undefined ? ` ${segment.speakerId}:` : ''
      return `[${segment.startTime.toFixed(2)}-${segment.endTime.toFixed(2)}]${speaker} ${segment.text}`
    })
    .join('\n')
)

const applyCorrectedPhrases = (phrases: unknown[], segments: SubtitleSegment[]) => {
  if (phrases.length !== segments.length) {
    return segments.map(correctedPhraseFromSegment)
  }
  return phrases.map((phrase, index) => {
    const segment = segments[index]
    if (!segment || typeof phrase !== 'object' || phrase === null || Array.isArray(phrase)) {
      return segment ? correctedPhraseFromSegment(segment) : phrase
    }
    const nextPhrase: Record<string, unknown> = {
      ...(phrase as Record<string, unknown>),
      text: segment.text,
      start: segment.startTime,
      end: segment.endTime,
    }
    if (segment.speakerId !== undefined) {
      nextPhrase.speaker_id = segment.speakerId
      nextPhrase.speaker = segment.speakerId
    } else {
      delete nextPhrase.speaker_id
      delete nextPhrase.speaker
    }
    return nextPhrase
  })
}

const countCorrectedSegments = (
  validation: SubtitleValidationResponse,
  fallbackCorrectionsCount: number
) => {
  if (validation.validation.corrections_count > 0) {
    return validation.validation.corrections_count
  }
  const analysisCorrections = validation.analysis.corrections_count
  if (typeof analysisCorrections === 'number' && Number.isFinite(analysisCorrections) && analysisCorrections > 0) {
    return analysisCorrections
  }
  return fallbackCorrectionsCount
}

const SUBTITLE_VALIDATION_CHUNK_SIZE = 20
const SUBTITLE_VALIDATION_CHUNK_DURATION_MS = 90 * 1000
const SUBTITLE_VALIDATION_CONTEXT_SIZE = 2

export interface SubtitleValidationChunk {
  targetSegments: SubtitleValidationSegment[]
  contextSegments: SubtitleValidationSegment[]
}

export const chunkSubtitleSegments = (segments: SubtitleValidationSegment[]): SubtitleValidationChunk[] => {
  const chunks: SubtitleValidationChunk[] = []
  let targetStartIndex = 0

  while (targetStartIndex < segments.length) {
    const chunkStartTime = finiteNumber(segments[targetStartIndex].start ?? segments[targetStartIndex].start_time) ?? 0
    let targetEndIndex = targetStartIndex
    while (targetEndIndex < segments.length && targetEndIndex - targetStartIndex < SUBTITLE_VALIDATION_CHUNK_SIZE) {
      const segmentStartTime = finiteNumber(segments[targetEndIndex].start ?? segments[targetEndIndex].start_time) ?? chunkStartTime
      const segmentEndTime = finiteNumber(segments[targetEndIndex].end ?? segments[targetEndIndex].end_time) ?? segmentStartTime
      if (targetEndIndex > targetStartIndex && (Math.max(segmentStartTime, segmentEndTime) - chunkStartTime) * 1000 >= SUBTITLE_VALIDATION_CHUNK_DURATION_MS) {
        break
      }
      targetEndIndex += 1
    }

    // A single unusually long subtitle still forms a valid one-item target chunk.
    if (targetEndIndex === targetStartIndex) {
      targetEndIndex += 1
    }

    const targetSegments = segments.slice(targetStartIndex, targetEndIndex)
    const contextStartIndex = Math.max(0, targetStartIndex - SUBTITLE_VALIDATION_CONTEXT_SIZE)
    const contextEndIndex = Math.min(segments.length, targetEndIndex + SUBTITLE_VALIDATION_CONTEXT_SIZE)
    const targetIds = new Set(targetSegments.map((segment, index) => String(segment.id ?? targetStartIndex + index + 1)))
    const contextSegments = segments
      .slice(contextStartIndex, contextEndIndex)
      .filter((segment, index) => !targetIds.has(String(segment.id ?? contextStartIndex + index + 1)))

    chunks.push({ targetSegments, contextSegments })
    targetStartIndex = targetEndIndex
  }
  return chunks
}

const chunkIdentity = (identity: WorkflowRequestIdentity | undefined, chunkIndex: number, attempt: number) => identity
  ? { ...identity, workflowStepId: `${identity.workflowStepId}.chunk-${chunkIndex + 1}.attempt-${attempt + 1}` }
  : undefined

export const mergeSubtitleValidationResponses = (responses: SubtitleValidationResponse[], source: SubtitleValidationSegment[]) => {
  const expectedIds = source.map((segment, index) => String(segment.id ?? index + 1))
  const returned = responses.flatMap((response) => response.segments)
  const returnedIds = returned.map((segment) => String(segment.id ?? ''))
  const expectedIdSet = new Set(expectedIds)
  const returnedIdSet = new Set(returnedIds)
  if (
    returned.length !== expectedIds.length
    || returnedIds.some((id) => !id || !expectedIdSet.has(id))
    || returnedIdSet.size !== expectedIdSet.size
    || [...expectedIdSet].some((id) => !returnedIdSet.has(id))
  ) {
    throw new Error(`字幕校对分片合并失败: expected ${expectedIds.length} target segments, received ${returned.length}`)
  }

  const returnedById = new Map(returned.map((segment) => [String(segment.id), segment]))
  const orderedSegments = expectedIds.map((id) => returnedById.get(id) as SubtitleValidationSegment)
  const first = responses[0]
  return {
    ...first,
    segments: orderedSegments,
    content: responses.map((response) => response.content).filter(Boolean).join('\n'),
    tokens_consumed: responses.reduce((total, response) => total + (response.tokens_consumed || 0), 0),
    usage: {
      prompt_tokens: responses.reduce((total, response) => total + (response.usage.prompt_tokens || 0), 0),
      completion_tokens: responses.reduce((total, response) => total + (response.usage.completion_tokens || 0), 0),
      total_tokens: responses.reduce((total, response) => total + (response.usage.total_tokens || 0), 0),
    },
  }
}

const validateSubtitleValidationChunkResponse = (
  response: SubtitleValidationResponse,
  targetSegments: SubtitleValidationSegment[]
) => {
  const expectedIds = targetSegments.map((segment, index) => String(segment.id ?? index + 1))
  const returnedIds = response.segments.map((segment) => String(segment.id ?? ''))
  if (
    returnedIds.length !== expectedIds.length
    || new Set(returnedIds).size !== expectedIds.length
    || returnedIds.some((id) => !id || !expectedIds.includes(id))
    || expectedIds.some((id) => !returnedIds.includes(id))
  ) {
    throw new Error(`字幕校对分片响应无效: expected ${expectedIds.length} target segments, received ${returnedIds.length}`)
  }
  return response
}

const subtitleValidationErrorCode = (error: unknown) => {
  if (!error || typeof error !== 'object') return ''
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code.trim().toLowerCase() : ''
}

const subtitleValidationErrorStatus = (error: unknown) => {
  if (!error || typeof error !== 'object') return null
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' && Number.isFinite(status) ? status : null
}

const isSystemicSubtitleValidationError = (error: unknown) => {
  const code = subtitleValidationErrorCode(error)
  if (new Set([
    'billing_configuration_invalid',
    'insufficient_credits',
    'credit_balance_unavailable',
  ]).has(code)) {
    return true
  }
  const status = subtitleValidationErrorStatus(error)
  return status === 401 || status === 403
}

const fallbackSubtitleValidationResponse = (
  targetSegments: SubtitleValidationSegment[],
  reason: string
): SubtitleValidationResponse => {
  const updatedAt = new Date().toISOString()
  return {
    success: true,
    provider: 'fallback',
    model: 'original-transcript',
    request_id: '',
    content: '',
    analysis: { degraded: true, reason },
    subtitles: Object.fromEntries(targetSegments.map((segment, index) => [String(segment.id ?? index + 1), segment])),
    segments: targetSegments.map((segment, index) => ({
      ...segment,
      id: String(segment.id ?? index + 1),
    })),
    validation: {
      status: 'degraded',
      model: 'original-transcript',
      request_id: '',
      tokens_consumed: 0,
      corrections_count: 0,
      updated_at: updatedAt,
      warning: reason,
    },
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
    tokens_consumed: 0,
    updated_at: updatedAt,
  }
}

const repairSubtitleValidationChunkResponse = (
  response: SubtitleValidationResponse,
  targetSegments: SubtitleValidationSegment[]
) => {
  const targetSegmentsById = new Map(
    targetSegments.map((segment, index) => [String(segment.id ?? index + 1), segment])
  )
  const validReturnedById = new Map<string, SubtitleValidationSegment>()
  response.segments.forEach((segment) => {
    const id = String(segment.id ?? '')
    const fallback = targetSegmentsById.get(id)
    if (!id || !fallback || validReturnedById.has(id)) return
    const text = textFromValidationSegment(segment, '')
    // Providers may return only corrected text and speaker. Preserve those corrections
    // while retaining the original, already-validated timestamps for the same segment.
    const start = finiteNumber(segment.start ?? segment.start_time)
      ?? finiteNumber(fallback.start ?? fallback.start_time)
    const end = finiteNumber(segment.end ?? segment.end_time)
      ?? finiteNumber(fallback.end ?? fallback.end_time)
    if (!text || start === null || end === null || end <= start) return
    validReturnedById.set(id, segment)
  })

  let fallbackSegments = 0
  const segments = targetSegments.map((source, index) => {
    const id = String(source.id ?? index + 1)
    const returned = validReturnedById.get(id)
    if (returned) {
      const sourceStart = finiteNumber(source.start ?? source.start_time)
      const sourceEnd = finiteNumber(source.end ?? source.end_time)
      let start = finiteNumber(returned.start ?? returned.start_time) ?? sourceStart
      let end = finiteNumber(returned.end ?? returned.end_time) ?? sourceEnd

      if (start === null || end === null || end <= start) {
        start = sourceStart
        end = sourceEnd
      }

      if (start === null || end === null || end <= start) {
        fallbackSegments += 1
        return { ...source, id }
      }

      return {
        ...returned,
        id,
        start,
        end,
      }
    }
    fallbackSegments += 1
    return { ...source, id }
  })

  return {
    response: {
      ...response,
      segments,
      subtitles: Object.fromEntries(segments.map((segment) => [String(segment.id), segment])),
    },
    fallbackSegments,
  }
}

export const step4ValidateSubtitles: FrameWorkflowStep = {
  id: 'validate-subtitles',
  label: '校对字幕',
  description: '使用 OpenAI Flash 模型深度校对转录字幕，修正语义错位、错别字、断句和上下文中明显错误的说话人。',
  progressWeight: 6,
  dependsOn: ['transcribe'],
  effects: ['network'],
  frontendWork: [
    '读取 transcribe 输出的字幕段、packed_transcript 和 text_content。',
    '调用后端字幕校对流式接口，接收模型思考与输出增量。',
    '根据模型返回的完整 segments 接受文本、speaker_id、断句和合理时间范围修正。',
    '生成修正后的 subtitlePayload 和 initialVideoContext，作为后续唯一字幕来源。',
  ],
  backendRoutes: [
    {
      method: 'POST',
      path: '/api/v1/tools/frame-workflow/subtitles/validate',
      handler: 'Frame Workflow 字幕校对工具',
      purpose: '使用 OpenAI Flash 模型根据上下文深度校对字幕语义、断句和说话人。',
    },
  ],
  buildInput: ({ records, config }) => {
    const transcribed = requireOutput<TranscribeOutput>(records, 'transcribe')
    return {
      language: config.outputLanguage ?? transcribed.subtitleResult.language,
      segments: transcribed.subtitleResult.segments.map((segment) => ({
        id: segment.id,
        start: segment.startTime,
        end: segment.endTime,
        text: segment.text,
        speaker_id: segment.speakerId,
        confidence: segment.confidence,
      })),
    }
  },
  run: async (input, context) => {
    throwIfAborted(context.signal, '字幕校对已取消')
    const transcribed = requireOutput<TranscribeOutput>(context.records, 'transcribe')
    const sourceInput = input as Parameters<typeof aiToolsService.validateSubtitlesStream>[0]
    const chunks = chunkSubtitleSegments(sourceInput.segments)
    const responses: SubtitleValidationResponse[] = []
    let fallbackChunks = 0
    let fallbackSegments = 0
    let systemicFailure: unknown = null
    updateWorkflowStepProgress(context, 'validate-subtitles', 5, '正在提交字幕校对请求')
    context.appendStepLog?.('validate-subtitles', '已开始监听字幕校对流式输出')

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      throwIfAborted(context.signal, '字幕校对已取消')
      const chunk = chunks[chunkIndex]
      let response: SubtitleValidationResponse | null = null
      let lastError: unknown = null

      if (systemicFailure) {
        const reason = systemicFailure instanceof Error ? systemicFailure.message : '字幕校对服务当前不可用'
        response = fallbackSubtitleValidationResponse(chunk.targetSegments, reason)
        fallbackChunks += 1
        fallbackSegments += chunk.targetSegments.length
      }

      for (let attempt = 0; attempt < 2 && !response; attempt += 1) {
        throwIfAborted(context.signal, '字幕校对已取消')
        let streamedThinking = ''
        let streamedAnswer = ''
        try {
          const candidate = await aiToolsService.validateSubtitlesStream(
            {
              ...sourceInput,
              segments: chunk.targetSegments,
              contextSegments: chunk.contextSegments,
              projectId: getFrameWorkflowBackendProjectId(context),
            },
            {
              signal: context.signal,
              workflowIdentity: chunkIdentity(context.workflowRequestIdentity, chunkIndex, attempt),
              onEvent: (event) => {
                if (event.type === 'stage') {
                  updateWorkflowStepProgress(context, 'validate-subtitles', 10, event.message || event.stage)
                  context.appendStepLog?.('validate-subtitles', `流式阶段：${event.message || event.stage}`)
                  return
                }
                if (event.type === 'thinking_delta') {
                  streamedThinking = appendStreamPreviewChunk(streamedThinking, event.delta)
                  const thinkingProgress = Math.min(45, 15 + Math.min(streamedThinking.length / 80, 30))
                  context.updateStepLog?.('validate-subtitles', '模型思考流：', `模型思考流：${streamPreview(streamedThinking)}`)
                  updateWorkflowStepProgress(context, 'validate-subtitles', Math.round(thinkingProgress), '正在接收字幕校对思考流')
                  return
                }
                if (event.type === 'answer_delta') {
                  streamedAnswer = appendStreamPreviewChunk(streamedAnswer, event.delta)
                  const answerProgress = Math.min(92, 50 + Math.min(streamedAnswer.length / 60, 42))
                  context.updateStepLog?.('validate-subtitles', '模型输出：', `模型输出：${streamPreview(streamedAnswer, 800)}`)
                  updateWorkflowStepProgress(context, 'validate-subtitles', Math.round(answerProgress), '正在接收字幕校对结果')
                  return
                }
                if (event.type === 'completed') {
                  updateWorkflowStepProgress(context, 'validate-subtitles', 100, '字幕校对已完成')
                  context.appendStepLog?.('validate-subtitles', `流式完成：模型 ${event.response.model || '未知'}，Token ${event.response.tokens_consumed || 0}`)
                  return
                }
                if (event.type === 'error') {
                  context.appendStepLog?.('validate-subtitles', `流式错误：${event.message}`)
                }
              },
            }
          )
          const repaired = repairSubtitleValidationChunkResponse(candidate, chunk.targetSegments)
          response = validateSubtitleValidationChunkResponse(repaired.response, chunk.targetSegments)
          if (repaired.fallbackSegments > 0) {
            fallbackChunks += 1
            fallbackSegments += repaired.fallbackSegments
            context.appendStepLog?.(
              'validate-subtitles',
              `字幕校对分片 ${chunkIndex + 1}/${chunks.length} 的模型响应缺少或包含无效字幕 ${repaired.fallbackSegments} 条，已用原始字幕补齐`
            )
          }
        } catch (error) {
          lastError = error
          if (context.signal?.aborted) throw error
          if (isSystemicSubtitleValidationError(error)) {
            systemicFailure = error
            context.appendStepLog?.(
              'validate-subtitles',
              `字幕校对服务配置不可用（${subtitleValidationErrorCode(error) || 'systemic_error'}），本分片及后续分片将沿用原始字幕继续`
            )
            break
          }
          context.appendStepLog?.('validate-subtitles', `字幕校对分片 ${chunkIndex + 1}/${chunks.length} 第 ${attempt + 1} 次失败，${attempt === 0 ? '将重试当前分片' : '已达到重试上限'}`)
        }
      }
      if (!response) {
        const reason = lastError instanceof Error ? lastError.message : `字幕校对分片 ${chunkIndex + 1} 请求失败`
        response = fallbackSubtitleValidationResponse(chunk.targetSegments, reason)
        fallbackChunks += 1
        fallbackSegments += chunk.targetSegments.length
        context.appendStepLog?.('validate-subtitles', `字幕校对分片 ${chunkIndex + 1}/${chunks.length} 已降级为原始字幕，工作流继续执行`)
      }
      responses.push(response)
      context.appendStepLog?.(`validate-subtitles`, `字幕校对分片 ${chunkIndex + 1}/${chunks.length} 完成（目标 ${chunk.targetSegments.length} 条，上下文 ${chunk.contextSegments.length} 条）`)
      updateWorkflowStepProgress(context, 'validate-subtitles', Math.round(10 + ((chunkIndex + 1) / chunks.length) * 85), `已完成字幕校对分片 ${chunkIndex + 1}/${chunks.length}`)
    }

    const response = mergeSubtitleValidationResponses(responses, sourceInput.segments)
    const degraded = fallbackChunks > 0 || fallbackSegments > 0

    const { segments, correctionsCount } = buildCorrectedSegments(transcribed, response)
    const subtitleResult = {
      ...transcribed.subtitleResult,
      segments,
      confidence: transcribed.subtitleResult.confidence,
    }
    const subtitlePayload = buildSubtitlePayload(segments)
    const initialVideoContext = convertSubtitlesToVideoContext(subtitleResult)
    const transcription = {
      ...transcribed.transcription,
      phrases: applyCorrectedPhrases(transcribed.transcription.phrases, segments),
      packed_transcript: buildPackedTranscript(segments),
      text_content: segments.map((segment) => segment.text).join(''),
      updated_at: response.updated_at,
    }

    return {
      transcription,
      subtitleResult,
      subtitlePayload,
      initialVideoContext,
      validation: {
        ...response.validation,
        status: degraded ? 'degraded' : 'completed',
        corrections_count: countCorrectedSegments(response, correctionsCount),
        fallback_chunks: fallbackChunks,
        total_chunks: chunks.length,
        fallback_segments: fallbackSegments,
        warning: degraded ? '字幕校对部分或全部未完成，已使用原始转录字幕补齐并继续' : undefined,
      },
    } satisfies ValidateSubtitlesOutput
  },
  summarizeOutput: (output) => {
    const typed = output as ValidateSubtitlesOutput
    return {
      segments: typed.subtitleResult.segments.length,
      corrections: typed.validation.corrections_count,
      tokens: typed.validation.tokens_consumed,
      model: typed.validation.model,
    }
  },
}
