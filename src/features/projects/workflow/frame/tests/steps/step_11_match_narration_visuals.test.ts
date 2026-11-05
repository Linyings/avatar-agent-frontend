import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnchoredNarrationDraftItem } from '@/features/projects/services/scriptGenerationServiceV2'
import { assessMatchedNarrationMix, step11MatchNarrationVisuals } from '../../steps/step_11_match_narration_visuals'
import type { MatchNarrationVisualsOutput } from '../../types'
import {
  makeGenerateNarrationScriptOutput,
  makeMergeVideoContextOutput,
  makeRuntimeContext,
  makeScriptResponse,
  successRecord,
} from './fixtures'

const mocks = vi.hoisted(() => ({
  matchNarrationVisualsStream: vi.fn(),
}))

const makeAnchoredDraft = (id: number, text: string): AnchoredNarrationDraftItem => ({
  _id: id,
  text,
  chapter_id: 'chapter-01',
  event_ids: [`event-${String(id).padStart(3, '0')}`],
  evidence_refs: [`subtitle-${String(id).padStart(3, '0')}`],
  source_start: (id - 1) * 10,
  source_end: id * 10,
  priority: 'high',
})

const originalOnlySelectionPlan = {
  selectionRatio: 0.3,
  narrationRatio: 0,
  rawSegmentCount: 2,
  validSegmentCount: 2,
  excludedSegmentCount: 0,
  keepCount: 2,
  targetCharacters: 0,
  narrationCount: 0,
  originalCount: 2,
  narrationSeconds: 0,
  originalSeconds: 20,
  estimatedDurationMs: 20_000,
  openingEndingRanges: [],
  advertisementRanges: [],
  rawSegments: [],
  validSegments: [],
  selectedSegments: [],
  narrationSegments: [],
  originalSegments: [],
  excludedSegments: [],
}

vi.mock('@/features/projects/services/scriptGenerationServiceV2', () => ({
  scriptGenerationServiceV2: {
    matchNarrationVisualsStream: mocks.matchNarrationVisualsStream,
  },
}))

describe('workflow/frame/steps/step_11_match_narration_visuals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.matchNarrationVisualsStream.mockResolvedValue(makeScriptResponse())
  })

  it('100% 解说时间线不要求补原片开场', () => {
    expect(assessMatchedNarrationMix([
      { _id: 1, text: '第一段解说', start: 0, end: 8, org: '' },
      { _id: 2, text: '第二段解说', start: 8, end: 16, org: '' },
    ], 1, {
      allowNarrationOnly: true,
      allowLeadingNarration: true,
    }).issues).toEqual([])
  })

  it('0% 解说时 buildInput 会走纯原片透传路径', () => {
    const baseline = makeGenerateNarrationScriptOutput()
    const generated = makeGenerateNarrationScriptOutput({
      draftItems: [],
      approvedDraftItems: [],
      pipelineResult: {
        ...baseline.pipelineResult,
        selectionPlan: originalOnlySelectionPlan,
      },
    })
    const context = makeRuntimeContext({
      records: {
        'generate-narration-script': successRecord('generate-narration-script', generated),
      },
    })

    expect(step11MatchNarrationVisuals.buildInput(context)).toEqual({ passthrough: true })
  })

  it('开启校验文案时 buildInput 会读取已审核草稿和合并上下文', () => {
    const merged = makeMergeVideoContextOutput()
    const approvedDraftItems = [
      makeAnchoredDraft(1, '第一句审核文案。'),
      makeAnchoredDraft(2, '第二句审核文案。'),
    ]
    const generated = makeGenerateNarrationScriptOutput({
      scriptResponse: undefined,
      draftItems: [makeAnchoredDraft(1, '旧草稿。')],
      approvedDraftItems,
      reviewRequired: true,
      pipelineResult: merged.pipelineResult,
    })
    const context = makeRuntimeContext({
      config: {
        reviewNarrationScript: true,
        customPrompt: '  保留反转节奏  ',
      },
      records: {
        'merge-video-context': successRecord('merge-video-context', merged),
        'generate-narration-script': successRecord('generate-narration-script', generated),
      },
    })

    expect(step11MatchNarrationVisuals.buildInput(context)).toEqual({
      video_config: expect.objectContaining({
        model_level: 'frame',
        target_language: 'zh-CN',
      }),
      video_context: merged.videoContext,
      cache_context: expect.objectContaining({
        cache_schema: 'frame_workflow_shared_context_v2',
      }),
      script_items: approvedDraftItems,
      custom_prompt: '保留反转节奏',
      model_profile: 'pro',
    })
  })

  it('开启校验文案但缺少草稿时会阻止继续执行', () => {
    const merged = makeMergeVideoContextOutput()
    const generated = makeGenerateNarrationScriptOutput({
      scriptResponse: undefined,
      draftItems: [],
      approvedDraftItems: [],
      reviewRequired: true,
      pipelineResult: merged.pipelineResult,
    })

    expect(() => step11MatchNarrationVisuals.buildInput(makeRuntimeContext({
      config: { reviewNarrationScript: true },
      records: {
        'merge-video-context': successRecord('merge-video-context', merged),
        'generate-narration-script': successRecord('generate-narration-script', generated),
      },
    }))).toThrow('缺少已审核的解说文案草稿')
  })

  it('0% 解说时 run 会复用纯原片时间线', async () => {
    const baseline = makeGenerateNarrationScriptOutput()
    const generated = makeGenerateNarrationScriptOutput({
      draftItems: [],
      approvedDraftItems: [],
      pipelineResult: {
        ...baseline.pipelineResult,
        selectionPlan: originalOnlySelectionPlan,
      },
    })
    const context = makeRuntimeContext({
      records: {
        'generate-narration-script': successRecord('generate-narration-script', generated),
      },
      updateStepProgress: vi.fn(),
      appendStepLog: vi.fn(),
    })

    const output = await step11MatchNarrationVisuals.run({ passthrough: true }, context)

    expect(mocks.matchNarrationVisualsStream).not.toHaveBeenCalled()
    expect(output).toEqual({
      scriptResponse: generated.scriptResponse,
      passthrough: true,
      pipelineResult: {
        ...generated.pipelineResult,
        approvedNarrationDraftItems: [],
        scriptResponse: generated.scriptResponse,
      },
    })
    expect(context.updateStepProgress).toHaveBeenCalledWith('match-narration-visuals', {
      percentage: 100,
      message: '纯原片时间线已确认',
    })
  })

  it('开启校验文案时 run 会调用画面匹配流式接口并累加 token', async () => {
    const merged = makeMergeVideoContextOutput()
    const approvedDraftItems = [
      makeAnchoredDraft(1, '第一句审核文案。'),
      makeAnchoredDraft(2, '第二句审核文案。'),
    ]
    const generated = makeGenerateNarrationScriptOutput({
      scriptResponse: undefined,
      draftItems: approvedDraftItems,
      approvedDraftItems,
      reviewRequired: true,
      pipelineResult: merged.pipelineResult,
    })
    const response = makeScriptResponse({
      usage: { prompt_tokens: 7, completion_tokens: 11, total_tokens: 18 },
    })
    const controller = new AbortController()
    const context = makeRuntimeContext({
      signal: controller.signal,
      config: { reviewNarrationScript: true },
      records: {
        'merge-video-context': successRecord('merge-video-context', merged),
        'generate-narration-script': successRecord('generate-narration-script', generated),
      },
      updateStepProgress: vi.fn(),
      appendStepLog: vi.fn(),
      updateStepLog: vi.fn(),
    })
    mocks.matchNarrationVisualsStream.mockImplementation(async (_input, options) => {
      options.onEvent?.({ type: 'stage', stage: 'prompt', message: '正在匹配画面' })
      options.onEvent?.({ type: 'thinking_delta', delta: '先锁定时间段。' })
      options.onEvent?.({ type: 'answer_delta', delta: '匹配结果。' })
      options.onEvent?.({ type: 'usage', usage: response.usage })
      options.onEvent?.({ type: 'completed', items: response.items, usage: response.usage, model: response.model, request_id: response.request_id })
      return response
    })

    const output = await step11MatchNarrationVisuals.run(
      step11MatchNarrationVisuals.buildInput(context),
      context
    ) as MatchNarrationVisualsOutput

    expect(mocks.matchNarrationVisualsStream).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'project-1',
        video_context: merged.videoContext,
        script_items: approvedDraftItems,
      }),
      expect.objectContaining({
        signal: controller.signal,
        onEvent: expect.any(Function),
      })
    )
    expect(context.updateStepLog).toHaveBeenCalledWith(
      'match-narration-visuals',
      '模型输出：',
      '模型输出：匹配结果。'
    )
    expect(output.scriptResponse).toMatchObject({
      model: response.model,
      request_id: response.request_id,
      usage: response.usage,
    })
    expect(output.scriptResponse.items).toEqual([
      expect.objectContaining({ _id: 1, text: '第一句审核文案。' }),
      expect.objectContaining({ _id: 2, text: '第二句审核文案。' }),
    ])
    const matchTokens = response.usage.total_tokens * mocks.matchNarrationVisualsStream.mock.calls.length
    expect(output.pipelineResult).toMatchObject({
      approvedNarrationDraftItems: approvedDraftItems,
      scriptResponse: output.scriptResponse,
      tokens: {
        script: (merged.pipelineResult.tokens.script || 0) + matchTokens,
        total: (merged.pipelineResult.tokens.total || 0) + matchTokens,
      },
    })
  })

  it('已取消时不会调用画面匹配服务', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(step11MatchNarrationVisuals.run({ passthrough: true }, makeRuntimeContext({ signal: controller.signal }))).rejects.toThrow(
      '画面匹配已取消'
    )
    expect(mocks.matchNarrationVisualsStream).not.toHaveBeenCalled()
  })

  it('summarizeOutput 会汇总匹配数量、是否透传、token 和模型', () => {
    expect(step11MatchNarrationVisuals.summarizeOutput({
      scriptResponse: makeScriptResponse({ model: 'match-model', usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } }),
      pipelineResult: makeMergeVideoContextOutput().pipelineResult,
    })).toEqual({
      script_items: 2,
      passthrough: false,
      tokens: 3,
      model: 'match-model',
    })
  })
})
