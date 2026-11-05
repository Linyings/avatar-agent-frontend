import { scriptGenerationServiceV2, type AnchoredNarrationDraftItem, type BaseGenerateScriptStreamEvent, type GenerateScriptResponse, type NarrationDraftItem, type NarrationEventPriority, type TokenUsage } from '@/features/projects/services/scriptGenerationServiceV2'
import { buildFrameScriptGenerationConfig } from '@/features/projects/services/material/frameInferencePipelineService'
import { throwIfAborted } from '@/shared/utils/abort'
import { getFrameWorkflowBackendProjectId, type FrameNarrationModelRouting, type FrameWorkflowRuntimeContext, type FrameWorkflowStep, type GenerateNarrationScriptOutput, type MergeVideoContextOutput } from '../types'
import { requireOutput } from '../utils/records'
import { updateWorkflowStepProgress } from '../utils/progress'
import { applyFrameNarrationRepair, assessFrameNarrationDraft, buildFrameNarrationRepairPlan, createFrameDurationContract } from '../services/frameDurationContract'
import { buildFrameNarrationLayeredContext, buildFrameNarrationLayeredContextPrompt } from '../services/frameNarrationContext'
import { countNarrationCharacters } from '../services/frameNarrationPipeline'
import { buildNarrationChapterGenerationConstraints, buildNarrationChapterVideoConfig, buildNarrationGlobalReviewInput, narrationRepairItemIds, requestNarrationGlobalReviewWithFallback, retrieveNarrationEvidence, validateNarrationGlobalResult, type NarrationChapterEvidence, type NarrationChapterPlan, type NarrationOutline, type NarrationRollingMemory } from '../services/frameNarrationPipeline'
import { computeAdvertisementRanges, computeOpeningEndingSongRanges, describeSegmentExclusions, normalizeStorySegments, selectSegmentsForCut, type SegmentCandidate, type TimelineSkeletonItem } from '../services/frameSegmentSelector'
import { computeDurationFactor, readDurationCalibration } from '../services/frameDurationCalibration'

const emptyUsage = (): TokenUsage => ({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 })
const addUsage = (a: TokenUsage, b: TokenUsage): TokenUsage => ({ prompt_tokens: a.prompt_tokens + b.prompt_tokens, completion_tokens: a.completion_tokens + b.completion_tokens, total_tokens: a.total_tokens + b.total_tokens })
const retryableNarrationProviderCodes = new Set(['provider_usage_missing', 'provider_protocol_error', 'provider_unavailable'])
export const shouldRetryNarrationProviderError = (
  error: unknown,
  attempt: number,
  maximumAttempts: number,
): boolean => {
  if (attempt >= maximumAttempts || !error || typeof error !== 'object') return false
  const structured = error as { code?: unknown; retryable?: unknown }
  return structured.retryable === true
    && typeof structured.code === 'string'
    && retryableNarrationProviderCodes.has(structured.code)
}
export const shouldApplyNarrationGenerationGuardBand = (attempt: number): boolean => attempt > 1
export const buildNarrationChapterAttemptStrategy = (attempt: number) => ({
  rebalanceEvents: attempt === 3,
  modelProfile: attempt === 4 ? 'pro' as const : 'flash' as const,
  strictFinalRetry: attempt === 4,
})
const scopedIdentity = (context: FrameWorkflowRuntimeContext, suffix: string) => context.workflowRequestIdentity
  ? { ...context.workflowRequestIdentity, workflowStepId: `generate-narration-script.${suffix}` }
  : undefined
const streamOptions = (context: FrameWorkflowRuntimeContext, suffix: string) => ({
  signal: context.signal,
  workflowIdentity: scopedIdentity(context, suffix),
  onEvent: (event: BaseGenerateScriptStreamEvent<unknown>) => {
    if (event.type === 'stage') context.appendStepLog?.('generate-narration-script', `${suffix}: ${event.message || event.stage}`)
    if (event.type === 'usage') context.appendStepLog?.('generate-narration-script', `${suffix}: Token ${event.usage.total_tokens}`)
    if (event.type === 'error') context.appendStepLog?.('generate-narration-script', `${suffix}: ${event.message}`)
  },
})
const structuredResult = (metadata?: Record<string, unknown>) => {
  const value = metadata?.structured_result
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
export const singleNarrationText = (items: NarrationDraftItem[]): string | null => {
  const texts = items.map(item => item.text.trim()).filter(Boolean)
  return texts.length === 1 ? texts[0] : null
}
export const itemEvidenceRefs = (structured: Record<string, unknown>, fallback: string[], allowed = fallback) => {
  const refs = new Map<number, string[]>()
  if (!Array.isArray(structured.items)) return refs
  const allowedRefs = new Set(allowed)
  structured.items.forEach((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return
    const item = raw as Record<string, unknown>
    const id = Number(item._id)
    const evidence = Array.isArray(item.evidence_refs)
      ? item.evidence_refs.filter((value): value is string => typeof value === 'string' && allowedRefs.has(value))
      : []
    if (Number.isInteger(id)) refs.set(id, evidence.length ? evidence : fallback)
  })
  return refs
}
const nextMemory = (structured: Record<string, unknown>, previous: NarrationRollingMemory, eventIds: string[], items: NarrationDraftItem[]): NarrationRollingMemory => {
  const raw = structured.rolling_memory
  const memory = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const list = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  return {
    previous_summary: typeof structured.summary === 'string' ? structured.summary : items.map(item => item.text).join(' ').slice(-500),
    covered_event_ids: [...new Set([...previous.covered_event_ids, ...eventIds, ...list(memory.covered_event_ids)])],
    character_state: list(memory.character_state),
    unresolved_threads: list(memory.unresolved_threads),
  }
}
export const isAnchoredNarrationDraftItem = (item: NarrationDraftItem): item is AnchoredNarrationDraftItem => {
  const candidate = item as Partial<AnchoredNarrationDraftItem>
  return typeof candidate.chapter_id === 'string'
    && Array.isArray(candidate.event_ids)
    && Array.isArray(candidate.evidence_refs)
    && typeof candidate.source_start === 'number'
    && Number.isFinite(candidate.source_start)
    && typeof candidate.source_end === 'number'
    && Number.isFinite(candidate.source_end)
    && candidate.source_end > candidate.source_start
    && (candidate.priority === 'high' || candidate.priority === 'medium' || candidate.priority === 'low')
}
export const isAnchoredNarrationDraftItemForChapter = (
  item: NarrationDraftItem | AnchoredNarrationDraftItem,
  chapter: NarrationChapterPlan,
): item is AnchoredNarrationDraftItem => {
  if (!isAnchoredNarrationDraftItem(item)) return false
  const chapterEventIds = new Set(chapter.event_ids)
  return item.chapter_id === chapter.chapter_id
    && item.event_ids.length > 0
    && item.event_ids.every(eventId => chapterEventIds.has(eventId))
    && item.source_start >= chapter.start
    && item.source_end <= chapter.end
}


const strongestPriority = (
  eventIds: string[],
  storyEvents: SegmentCandidate[],
): NarrationEventPriority => {
  const priorities = eventIds.flatMap(eventId => {
    const event = storyEvents.find(candidate => candidate.event_id === eventId)
    return event ? [event.priority] : []
  })
  if (priorities.includes('high')) return 'high'
  if (priorities.includes('medium')) return 'medium'
  return 'low'
}

type NarrationItemAnchorAllocation = {
  eventIds: string[]
  start: number
  end: number
}

const allocateNarrationItemAnchors = (
  chapter: NarrationChapterPlan,
  chapterEvents: SegmentCandidate[],
  itemCount: number,
): NarrationItemAnchorAllocation[] => {
  if (itemCount <= 0) return []
  const chronologicalEvents = [...chapterEvents].sort((left, right) => left.start - right.start || left.end - right.end)
  if (chronologicalEvents.length === 0) {
    const duration = Math.max(0.001, chapter.end - chapter.start)
    return Array.from({ length: itemCount }, (_, index) => ({
      eventIds: [...chapter.event_ids],
      start: chapter.start + duration * index / itemCount,
      end: chapter.start + duration * (index + 1) / itemCount,
    }))
  }

  let allocations: NarrationItemAnchorAllocation[]
  if (chronologicalEvents.length >= itemCount) {
    const baseSize = Math.floor(chronologicalEvents.length / itemCount)
    const remainder = chronologicalEvents.length % itemCount
    let cursor = 0
    allocations = Array.from({ length: itemCount }, (_, index) => {
      const size = baseSize + (index < remainder ? 1 : 0)
      const events = chronologicalEvents.slice(cursor, cursor + size)
      cursor += size
      return {
        eventIds: events.map(event => event.event_id),
        start: Math.max(chapter.start, Math.min(...events.map(event => event.start))),
        end: Math.min(chapter.end, Math.max(...events.map(event => event.end))),
      }
    })
  } else {
    const eventIndexes = Array.from(
      { length: itemCount },
      (_, index) => Math.min(chronologicalEvents.length - 1, Math.floor(index * chronologicalEvents.length / itemCount)),
    )
    allocations = eventIndexes.map((eventIndex, itemIndex) => {
      const event = chronologicalEvents[eventIndex]
      const siblingIndexes = eventIndexes.flatMap((candidate, index) => candidate === eventIndex ? [index] : [])
      const position = siblingIndexes.indexOf(itemIndex)
      const duration = Math.max(0.001, event.end - event.start)
      return {
        eventIds: [event.event_id],
        start: Math.max(chapter.start, event.start + duration * position / siblingIndexes.length),
        end: Math.min(chapter.end, event.start + duration * (position + 1) / siblingIndexes.length),
      }
    })
  }

  for (let index = 0; index < allocations.length - 1; index += 1) {
    const current = allocations[index]
    const next = allocations[index + 1]
    if (current.end <= next.start) continue
    const overlapStart = Math.max(current.start, next.start)
    const overlapEnd = Math.min(current.end, next.end)
    const boundary = overlapEnd > overlapStart
      ? overlapStart + (overlapEnd - overlapStart) / 2
      : current.start + (next.end - current.start) / 2
    current.end = boundary
    next.start = boundary
  }

  return allocations
}

export const areNarrationDraftAnchorsChronological = (
  items: Array<NarrationDraftItem | AnchoredNarrationDraftItem>,
): boolean => items.every((item, index) => (
  isAnchoredNarrationDraftItem(item)
  && (index === 0 || item.source_start >= (items[index - 1] as AnchoredNarrationDraftItem).source_end)
))

export const anchorNarrationDraftItems = (options: {
  items: NarrationDraftItem[]
  chapter: NarrationChapterPlan
  evidence: NarrationChapterEvidence
  refsById: Map<number, string[]>
  storyEvents: SegmentCandidate[]
}): AnchoredNarrationDraftItem[] => {
  const allEvidence = [...options.evidence.exact, ...options.evidence.adjacent, ...options.evidence.callbacks]
  const chapterEventIds = new Set(options.chapter.event_ids)
  const chapterEvents = options.storyEvents.filter(event => chapterEventIds.has(event.event_id))
  const allocations = allocateNarrationItemAnchors(options.chapter, chapterEvents, options.items.length)
  return options.items.map((item, itemIndex) => {
    const allocation = allocations[itemIndex]
    const allocatedEventIds = new Set(allocation.eventIds)
    const requestedEvidenceRefs = options.refsById.get(item._id) ?? options.evidence.exact.map(entry => entry.evidence_id)
    const evidenceRefs = requestedEvidenceRefs.filter((ref) => {
      const evidence = allEvidence.find(entry => entry.evidence_id === ref)
      if (!evidence) return false
      if (evidence.kind === 'event') return allocatedEventIds.has(ref)
      return evidence.end > allocation.start && evidence.start < allocation.end
    })
    for (const eventId of allocation.eventIds) {
      if (allEvidence.some(entry => entry.kind === 'event' && entry.evidence_id === eventId)) {
        evidenceRefs.push(eventId)
      }
    }
    return {
      ...item,
      chapter_id: options.chapter.chapter_id,
      event_ids: [...allocation.eventIds],
      evidence_refs: [...new Set(evidenceRefs)],
      source_start: allocation.start,
      source_end: allocation.end,
      priority: strongestPriority(allocation.eventIds, options.storyEvents),
    }
  })
}

export const step10GenerateNarrationScript: FrameWorkflowStep = {
  id: 'generate-narration-script',
  label: '生成解说文案',
  description: '按确定性选段骨架逐段生成解说文案：片段规范化、按两条进度条选段、软字数逐段生成、全局事实校验（可降级）。',
  progressWeight: 6,
  dependsOn: ['merge-video-context'],
  effects: ['network'],
  frontendWork: ['片段规范化：校验时间戳并剔除无效与片头尾曲片段。', '确定性选段：按素材选取比例与解说率计算解说集、原片集与时间线骨架。', '逐段生成解说词（软字数引导，无字数校验）。', '全局事实校验一次修复，仍未通过时带警告放行。'],
  backendRoutes: [{ method: 'POST', path: '/api/v1/tools/generate-narration-draft-stream', handler: '分层解说文案流式生成工具', purpose: '按骨架逐段生成解说词并执行全局校验。' }],
  buildInput: ({ records, config }) => {
    const merged = requireOutput<MergeVideoContextOutput>(records, 'merge-video-context')
    const contract = createFrameDurationContract(config)
    const layered = buildFrameNarrationLayeredContext(merged, contract, config.outputLanguage)
    return {
      video_config: buildFrameScriptGenerationConfig(config),
      video_context: layered.videoContext,
      cache_context: layered.cacheContext,
      custom_prompt: [config.customPrompt?.trim(), buildFrameNarrationLayeredContextPrompt(layered)].filter(Boolean).join('\n\n'),
    }
  },
  run: async (input, context) => {
    throwIfAborted(context.signal, '解说文案生成已取消')
    const request = input as { video_config: Record<string, unknown>; custom_prompt?: string }
    const merged = requireOutput<MergeVideoContextOutput>(context.records, 'merge-video-context')
    const contract = createFrameDurationContract(context.config)
    const layered = buildFrameNarrationLayeredContext(merged, contract, context.config.outputLanguage)
    const projectId = getFrameWorkflowBackendProjectId(context)
    const selectionRatio = Number(context.config.selectionRatio ?? 0.3)
    const narrationRatio = Number(context.config.narrationRatio ?? 0.5)
    const sourceDurationSeconds = layered.cacheContext.context_strategy.source_duration_seconds
    const storyEvents = layered.cacheContext.story_event_index as unknown as Array<Record<string, unknown>>
    const rawSegments = storyEvents.map((event, index) => {
      const start = Number(event.start)
      const end = Number(event.end)
      const priority: 'high' | 'medium' | 'low' = event.importance === 'high' || event.importance === 'low'
        ? event.importance
        : 'medium'
      return {
        event_id: typeof event.event_id === 'string' && event.event_id.trim()
          ? event.event_id
          : `event-${String(index + 1).padStart(3, '0')}`,
        start: Number.isFinite(start) ? start : null,
        end: Number.isFinite(end) ? end : null,
        description: typeof event.description === 'string' ? event.description.trim() : '',
        priority,
      }
    })

    // ---- 阶段A：片段规范化（时间戳校验与剔除） ----
    const subtitleItems = merged.pipelineResult.subtitleResult.segments.map(segment => ({
      start: segment.startTime,
      end: segment.endTime,
      text: segment.text,
    }))
    const openingEndingRanges = computeOpeningEndingSongRanges(subtitleItems, sourceDurationSeconds)
    const advertisementRanges = computeAdvertisementRanges({
      events: storyEvents,
      subtitleSegments: merged.pipelineResult.subtitleResult.segments,
      sourceDurationSeconds,
    })
    const sourceExclusionRanges = [...openingEndingRanges, ...advertisementRanges]
    const normalized = normalizeStorySegments({
      events: storyEvents,
      subtitleSegments: merged.pipelineResult.subtitleResult.segments,
      sourceDurationSeconds,
      excludedRanges: sourceExclusionRanges,
    })
    const exclusionSummary = describeSegmentExclusions(normalized.exclusions)
    context.appendStepLog?.(
      'generate-narration-script',
      `片段规范化：原始 ${normalized.rawCount} 个片段，有效 ${normalized.pool.length} 个${exclusionSummary ? `，剔除 ${normalized.exclusions.length} 个（${exclusionSummary}）` : ''}`,
    )
    if (normalized.pool.length === 0) {
      throw new Error('剧情理解没有产生带有效时间戳和描述的事件，无法生成可匹配画面的解说文案')
    }

    // ---- 阶段B：确定性选段（s₁ 入选比例 / s₂ 解说率） ----
    const calibration = readDurationCalibration()
    const durationFactor = computeDurationFactor(calibration)
    const selection = selectSegmentsForCut({
      pool: normalized.pool,
      selectionRatio,
      narrationRatio,
      excludedRanges: sourceExclusionRanges,
    })
    const skeleton = selection.skeleton
    const narrationSkeleton = skeleton.filter(item => item.type === 'narration')
    const estimatedMinutes = Math.max(1, Math.round(selection.estimatedDurationMs / 60000))
    context.appendStepLog?.(
      'generate-narration-script',
      `确定性选段：共 ${normalized.pool.length} 个有效片段，按素材选取比例 ${Math.round(selectionRatio * 100)}% 入选 ${selection.keepCount} 个（解说 ${selection.narrationSegments.length} 个 / 原片 ${selection.originalSegments.length} 个），解说目标 ${narrationSkeleton.reduce((total, item) => total + item.softCharacters, 0)} 字，预计成片约 ${estimatedMinutes} 分钟（时长校准系数 ${durationFactor.toFixed(2)}；目标字数只按已选解说事件计算）`,
    )
    const toPlanSegment = (segment: SegmentCandidate) => ({
      event_id: segment.event_id,
      start: segment.start,
      end: segment.end,
      description: segment.description,
      priority: segment.priority,
      quality: segment.quality,
      dialogueDensity: segment.dialogueDensity,
    })
    const selectedSegments = [...selection.narrationSegments, ...selection.originalSegments]
      .sort((left, right) => left.start - right.start || left.end - right.end)
    const selectionPlan = {
      selectionRatio,
      narrationRatio,
      rawSegmentCount: normalized.rawCount,
      validSegmentCount: normalized.pool.length,
      excludedSegmentCount: normalized.exclusions.length,
      keepCount: selection.keepCount,
      narrationCount: selection.narrationSegments.length,
      targetCharacters: narrationSkeleton.reduce((total, item) => total + item.softCharacters, 0),
      originalCount: selection.originalSegments.length,
      narrationSeconds: narrationSkeleton.reduce((total, item) => total + (item.end - item.start), 0),
      originalSeconds: selection.originalSegments.reduce((total, segment) => total + (segment.end - segment.start), 0),
      estimatedDurationMs: selection.estimatedDurationMs,
      openingEndingRanges,
      advertisementRanges,
      rawSegments,
      validSegments: normalized.pool.map(toPlanSegment),
      selectedSegments: selectedSegments.map(toPlanSegment),
      narrationSegments: selection.narrationSegments.map(toPlanSegment),
      originalSegments: selection.originalSegments.map(toPlanSegment),
      excludedSegments: normalized.exclusions.map(item => ({ ...item })),
    }
    if (narrationSkeleton.length === 0) {
      const originalOnlyResponse: GenerateScriptResponse = {
        items: skeleton
          .filter(item => item.type === 'original')
          .map((item, index) => ({
            _id: index + 1,
            text: '',
            org: item.description,
            start: item.start,
            end: item.end,
          })),
        usage: emptyUsage(),
        model: 'local-original-only',
        request_id: 'local-original-only',
      }
      context.appendStepLog?.('generate-narration-script', '解说率为 0%，已跳过文案生成和全局审查，保留纯原片时间线。')
      updateWorkflowStepProgress(context, 'generate-narration-script', 100, '纯原片时间线已生成')
      return {
        scriptResponse: originalOnlyResponse,
        draftItems: [],
        approvedDraftItems: [],
        reviewRequired: false,
        pipelineResult: {
          ...merged.pipelineResult,
          narrationDraftItems: [],
          approvedNarrationDraftItems: [],
          scriptResponse: originalOnlyResponse,
          selectionPlan,
        },
      } satisfies GenerateNarrationScriptOutput
    }

    // ---- 阶段C：逐段生成解说（软字数引导，零字数失败） ----
    const narrationLayered = {
      ...layered,
      videoContext: {
        ...layered.videoContext,
        narrative_context: layered.videoContext.narrative_context,
      },
      cacheContext: {
        ...layered.cacheContext,
        story_event_index: selection.narrationSegments,
      },
    }
    let memory: NarrationRollingMemory = { previous_summary: '', covered_event_ids: [], character_state: [], unresolved_threads: [] }
    let usage = emptyUsage()
    interface NarrationBlockResult {
      skeleton: TimelineSkeletonItem
      chapterId: string
      text: string
      evidenceRefs: string[]
      model: string
    }
    const narrationBlocks: NarrationBlockResult[] = []
    const totalBlocks = narrationSkeleton.length
    for (let index = 0; index < totalBlocks; index += 1) {
      const block = narrationSkeleton[index]
      throwIfAborted(context.signal, '解说文案生成已取消')
      updateWorkflowStepProgress(
        context,
        'generate-narration-script',
        8 + Math.round((index / totalBlocks) * 62),
        `正在生成第 ${index + 1}/${totalBlocks} 段解说`,
        { current_block: `${index + 1}/${totalBlocks}` },
      )
      const chapterId = `seg-${String(index + 1).padStart(2, '0')}`
      const chapter: NarrationChapterPlan = {
        chapter_id: chapterId,
        start: block.start,
        end: block.end,
        target_characters: block.softCharacters,
        objective: block.description,
        opening_bridge: '',
        closing_hook: '',
        event_ids: [block.eventId],
        characters: [],
        retrieval_keywords: [],
      }
      const evidence = retrieveNarrationEvidence(merged, layered, chapter)
      const inWindowSubtitles = merged.pipelineResult.subtitleResult.segments
        .filter(segment => segment.startTime < block.end && segment.endTime > block.start)
        .map(segment => segment.text)

      const segmentRequest = async (modelProfile: 'flash' | 'pro', validationFeedback: string[]) => {
        const response = await scriptGenerationServiceV2.generateNarrationDraftStream({
          video_config: buildNarrationChapterVideoConfig(request.video_config as Record<string, unknown>, chapter) as never,
          video_context: {
            operation: 'narration_segment',
            narrative_context: narrationLayered.videoContext.narrative_context,
            story_event_index: [block.eventId],
            chapter,
            item_count_range: { minimum: 1, maximum: 1 },
            generation_constraints: buildNarrationChapterGenerationConstraints(chapter, {
              guardBand: false,
              strictFinalRetry: false,
              itemCount: 1,
            }),
            segment_payload: {
              start: block.start,
              end: block.end,
              description: block.description,
              soft_characters: block.softCharacters,
              subtitles: inWindowSubtitles,
            },
            evidence,
            rolling_memory: memory,
            validation_feedback: validationFeedback,
          },
          custom_prompt: [request.custom_prompt, `本段只解说事件 ${block.eventId}，目标 ${block.softCharacters} 字，合格范围 ${Math.round(block.softCharacters * 0.7)}-${Math.round(block.softCharacters * 1.3)} 字。字数由已选事件决定，不按素材总时长或画面窗口扩写。文案必须自然流畅、保留事件因果，并严格对应 ${block.start.toFixed(2)}-${block.end.toFixed(2)} 秒的证据画面。`].filter(Boolean).join('\n\n'),
          project_id: projectId,
          model_profile: modelProfile,
          model_operation: 'narration_segment',
        }, streamOptions(context, `${chapterId}.attempt`))
        usage = addUsage(usage, response.usage)
        return response
      }

      let response: Awaited<ReturnType<typeof scriptGenerationServiceV2.generateNarrationDraftStream>> | undefined
      let lastError: unknown
      let structuralRetryUsed = false
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        try {
          response = await segmentRequest(attempt === 1 ? 'flash' : 'pro', lastError instanceof Error ? [lastError.message] : [])
        } catch (error) {
          lastError = error
          if (shouldRetryNarrationProviderError(error, attempt, 3)) {
            context.appendStepLog?.('generate-narration-script', `${chapterId} 供应商错误，正在重试 ${attempt + 1}/3`)
            continue
          }
          if (!structuralRetryUsed) {
            structuralRetryUsed = true
            context.appendStepLog?.('generate-narration-script', `${chapterId} 生成结构异常，改用 Pro 模型重试一次`)
            continue
          }
          throw error
        }
        if (!singleNarrationText(response.items)) {
          lastError = new Error('模型未返回一段有效解说文本')
          if (!structuralRetryUsed) {
            structuralRetryUsed = true
            context.appendStepLog?.('generate-narration-script', `${chapterId} 未返回单段有效文本，改用 Pro 模型重试一次`)
            continue
          }
          throw new Error(`${chapterId} 解说生成失败：模型未返回单段有效解说文本`)
        }
        break
      }
      if (!response) {
        throw new Error(`${chapterId} 解说生成失败：${lastError instanceof Error ? lastError.message : '未知错误'}`)
      }
      let combinedText = singleNarrationText(response.items)
      if (!combinedText) {
        throw new Error(`${chapterId} 解说生成失败：模型未返回单段有效解说文本`)
      }
      const structured = structuredResult(response.metadata)
      memory = nextMemory(structured, memory, [block.eventId], response.items)
      // 目标字数只由当前已选事件决定。每段必须在 70%-130% 内，
      // 重写只处理当前事件，不能改动事件、证据或时间锚点。
      const targetCharacters = block.softCharacters
      const minimumCharacters = Math.round(targetCharacters * 0.7)
      const maximumCharacters = Math.round(targetCharacters * 1.3)
      let currentCharacters = countNarrationCharacters(combinedText)
      let finalModel = response.model
      for (let rewriteAttempt = 1; (currentCharacters < minimumCharacters || currentCharacters > maximumCharacters) && rewriteAttempt <= 3; rewriteAttempt += 1) {
        throwIfAborted(context.signal, '解说文案生成已取消')
        const direction = currentCharacters > maximumCharacters
          ? `删去重复和次要细节，完整流畅地重写到 ${targetCharacters} 字左右，不得机械截句`
          : `只围绕当前事件补足动机、因果和情绪转折，完整流畅地重写到 ${targetCharacters} 字左右，不得引入新事件`
        const feedback = `当前解说 ${currentCharacters} 字，不在允许范围 ${minimumCharacters}-${maximumCharacters} 字。${direction}`
        const rewriteResponse = await scriptGenerationServiceV2.generateNarrationDraftStream({
          video_config: buildNarrationChapterVideoConfig(request.video_config as Record<string, unknown>, chapter) as never,
          video_context: {
            operation: 'narration_segment',
            narrative_context: narrationLayered.videoContext.narrative_context,
            story_event_index: [block.eventId],
            chapter,
            item_count_range: { minimum: 1, maximum: 1 },
            generation_constraints: buildNarrationChapterGenerationConstraints(chapter, {
              guardBand: true,
              strictFinalRetry: rewriteAttempt === 3,
              itemCount: 1,
            }),
            segment_payload: {
              start: block.start,
              end: block.end,
              description: block.description,
              soft_characters: targetCharacters,
              subtitles: inWindowSubtitles,
            },
            evidence,
            previous_rejected_text: combinedText,
            rolling_memory: memory,
            validation_feedback: [feedback],
          },
          custom_prompt: [request.custom_prompt, `${feedback} 保留事件 ${block.eventId} 及 ${block.start.toFixed(2)}-${block.end.toFixed(2)} 秒证据锚点；只返回一段解说正文。`].filter(Boolean).join('\n\n'),
          project_id: projectId,
          model_profile: rewriteAttempt === 3 ? 'pro' : 'flash',
          model_operation: 'narration_segment',
        }, streamOptions(context, `${chapterId}.rewrite-${rewriteAttempt}`))
        usage = addUsage(usage, rewriteResponse.usage)
        const rewriteText = singleNarrationText(rewriteResponse.items)
        if (!rewriteText) {
          context.appendStepLog?.('generate-narration-script', `${chapterId} 字数重写 ${rewriteAttempt}/3 未返回单段有效文本`)
          continue
        }
        const rewriteCharacters = countNarrationCharacters(rewriteText)
        context.appendStepLog?.('generate-narration-script', `${chapterId} 字数重写 ${rewriteAttempt}/3：${rewriteCharacters} 字（允许 ${minimumCharacters}-${maximumCharacters}）`)
        combinedText = rewriteText
        currentCharacters = rewriteCharacters
        finalModel = rewriteResponse.model
      }
      if (currentCharacters < minimumCharacters || currentCharacters > maximumCharacters) {
        context.appendStepLog?.('generate-narration-script', `${chapterId} 字数 ${currentCharacters} 不在 ${minimumCharacters}-${maximumCharacters} 范围，将在配音完成后人工审核`)
      }
      const fallbackRefs = evidence.exact.map(entry => entry.evidence_id)
      narrationBlocks.push({
        skeleton: block,
        chapterId,
        text: combinedText,
        evidenceRefs: [...new Set([...(itemEvidenceRefs(structured, fallbackRefs).get(1) ?? fallbackRefs)])],
        model: finalModel,
      })
    }

    if (narrationBlocks.length === 0) {
      throw new Error('解说块生成结果为空')
    }
    let enrichedItems: AnchoredNarrationDraftItem[] = narrationBlocks.map((block, index) => ({
      _id: index + 1,
      text: block.text,
      org: '',
      chapter_id: block.chapterId,
      event_ids: [block.skeleton.eventId],
      evidence_refs: block.evidenceRefs,
      source_start: block.skeleton.start,
      source_end: block.skeleton.end,
      priority: block.skeleton.priority,
    }))

    // ---- 全局事实校验（一次修复；仍未通过时带警告放行，不阻断流程） ----
    const firstNarration = narrationBlocks[0]
    const lastNarration = narrationBlocks[narrationBlocks.length - 1]
    const totalSoftCharacters = narrationBlocks.reduce((total, block) => total + block.skeleton.softCharacters, 0)
    const selectedContract = {
      ...contract,
      targetCharacters: totalSoftCharacters,
      minCharacters: Math.round(totalSoftCharacters * 0.7),
      maxCharacters: Math.round(totalSoftCharacters * 1.3),
    }
    const skeletonChapter: NarrationChapterPlan = {
      chapter_id: 'skeleton-01',
      start: firstNarration.skeleton.start,
      end: lastNarration.skeleton.end,
      target_characters: totalSoftCharacters,
      objective: '按确定性骨架逐段解说',
      opening_bridge: '',
      closing_hook: '',
      event_ids: narrationBlocks.map(block => block.skeleton.eventId),
      characters: [],
      retrieval_keywords: [],
    }
    const outline: NarrationOutline = { summary: memory.previous_summary.slice(0, 160), chapters: [skeletonChapter] }
    const chapters = [{
      chapter: skeletonChapter,
      evidence: { exact: [], adjacent: [], callbacks: [] } as unknown as NarrationChapterEvidence,
      items: enrichedItems,
      summary: memory.previous_summary,
      memory,
      model: narrationBlocks.map(block => block.model).join(' -> '),
      attempts: narrationBlocks.length,
      humanizerAttempts: 0,
      humanizerFallback: false,
    }]
    const assessment = assessFrameNarrationDraft(enrichedItems, selectedContract)
    const reviewInput = buildNarrationGlobalReviewInput({
      outline,
      storyEventIndex: selection.narrationSegments.map(segment => ({
        ...segment,
        selection_priority: segment.priority,
        selection_rank: 0,
        source_index: 0,
        participants: [],
        start: segment.start,
        end: segment.end,
        description: segment.description,
        event_id: segment.event_id,
      })),
      chapters,
      items: enrichedItems,
    })
    updateWorkflowStepProgress(context, 'generate-narration-script', 78, '正在执行全局剧情和证据校验')
    const reviewResolution = await requestNarrationGlobalReviewWithFallback({
      request: () => scriptGenerationServiceV2.generateNarrationStructuredStream({
        video_config: request.video_config as never, video_context: reviewInput, project_id: projectId,
        model_profile: 'pro', model_operation: 'narration_global_review',
      }, streamOptions(context, 'global-review')),
      resultFromResponse: response => response.result,
    })
    if (reviewResolution.response) usage = addUsage(usage, reviewResolution.response.usage)
    let globalReview = reviewResolution.review
    if (globalReview.degraded) {
      context.appendStepLog?.('generate-narration-script', '全局模型审查不可用，已使用本地结构校验结果继续')
    }
    const itemIds = new Set(enrichedItems.map(item => item._id))
    let deterministicIssues = validateNarrationGlobalResult(globalReview, itemIds, enrichedItems)
    if (!globalReview.passed && deterministicIssues.length === 0) {
      globalReview = { ...globalReview, passed: true }
    }
    if (deterministicIssues.length > 0) {
      const allowed = new Set(narrationRepairItemIds(globalReview, itemIds))
      if (allowed.size > 0) {
        const repairPlan = buildFrameNarrationRepairPlan(enrichedItems, assessment, selectedContract, reviewInput, 'quality')
        updateWorkflowStepProgress(context, 'generate-narration-script', 88, '正在执行一次全局证据修复')
        try {
          const repair = await scriptGenerationServiceV2.generateNarrationRepairStream({
            video_config: request.video_config as never,
            video_context: { ...repairPlan.videoContext, review: globalReview, allowed_item_ids: [...allowed] },
            project_id: projectId, model_profile: 'pro', model_operation: 'narration_global_repair',
          }, 'text', streamOptions(context, 'global-repair'))
          usage = addUsage(usage, repair.usage)
          if (!repair.items.some(item => !allowed.has(item._id))) {
            enrichedItems = applyFrameNarrationRepair(repairPlan, repair.items) as typeof enrichedItems
          }
        } catch (repairError) {
          context.appendStepLog?.('generate-narration-script', `全局修复请求失败，按原文继续：${repairError instanceof Error ? repairError.message : String(repairError)}`)
        }
      }
      const unresolvedHighSeverity = globalReview.issues
        .filter(issue => issue.severity === 'high')
        .map(issue => issue.message || issue.code || '未说明原因的高严重度问题')
      if (unresolvedHighSeverity.length > 0) {
        context.appendStepLog?.(
          'generate-narration-script',
          `全局校验存在未消除的高严重度问题，按原稿继续（可在检查器中查看）：${unresolvedHighSeverity.join('；')}`,
        )
      }
      globalReview = { ...globalReview, passed: true }
    }

    const finalAssessment = assessFrameNarrationDraft(enrichedItems, selectedContract)
    const draftItems = enrichedItems.map(item => ({ ...item, event_ids: [...item.event_ids], evidence_refs: [...item.evidence_refs] }))

    const modelRouting: FrameNarrationModelRouting = {
      initialProfile: 'flash', finalProfile: 'flash', complexityLevel: 'medium', score: 0,
      reasons: ['确定性骨架逐段生成', globalReview.degraded ? 'Global review degraded to local validation' : 'Pro global review'], escalated: false,
      metrics: { sourceDurationSeconds, outputDurationSeconds: selection.estimatedDurationMs / 1000, characters: finalAssessment.narrationCharacters, relationships: 0, events: selection.narrationSegments.length, conflicts: 0, openQuestions: 0, highPriorityDecisions: 0, evidenceWindows: layered.cacheContext.context_strategy.selected_window_count, selectedSubtitleSegments: layered.cacheContext.context_strategy.selected_subtitle_segments, qualityRefined: globalReview.patches.length > 0, evidenceComplete: !globalReview.degraded && globalReview.evidence_gaps.length === 0 },
    }
    updateWorkflowStepProgress(context, 'generate-narration-script', 100, '分段解说已生成并通过结构校验')
    const reviewRequired = false
    return {
      draftItems,
      ...(reviewRequired ? {} : { approvedDraftItems: draftItems }),
      reviewRequired,
      modelRouting,
      narrationPipeline: { outline, chapters, globalReview, usage },
      pipelineResult: {
        ...merged.pipelineResult,
        narrationDraftItems: draftItems,
        selectionPlan: { ...selectionPlan, targetCharacters: totalSoftCharacters },
        tokens: { ...merged.pipelineResult.tokens, script: usage.total_tokens, total: (merged.pipelineResult.tokens.total || 0) + usage.total_tokens },
      },
    } satisfies GenerateNarrationScriptOutput
  },
  summarizeOutput: output => {
    const typed = output as GenerateNarrationScriptOutput
    return { review_required: Boolean(typed.reviewRequired), draft_items: typed.draftItems?.length ?? 0, chapters: typed.narrationPipeline?.chapters.length ?? 0, global_review_passed: typed.narrationPipeline?.globalReview.passed ?? false, global_review_degraded: typed.narrationPipeline?.globalReview.degraded ?? false, model_routing: typed.modelRouting ?? null }
  },
}
