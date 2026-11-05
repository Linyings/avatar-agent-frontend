import { beforeEach, describe, expect, it, vi } from 'vitest'
import { singleNarrationText, step10GenerateNarrationScript } from '../../steps/step_10_generate_narration_script'
import type { GenerateNarrationScriptOutput } from '../../types'
import { buildNarrationChapterGenerationConstraints } from '../../services/frameNarrationPipeline'
import {
  makeMergeVideoContextOutput,
  makeNarrativeUnderstanding,
  makeRuntimeContext,
  successRecord,
} from './fixtures'

const mocks = vi.hoisted(() => ({
  generateNarrationDraftStream: vi.fn(),
  generateNarrationHumanizeStream: vi.fn(),
  generateNarrationRepairStream: vi.fn(),
  generateNarrationStructuredStream: vi.fn(),
}))

vi.mock('@/features/projects/services/scriptGenerationServiceV2', () => ({
  scriptGenerationServiceV2: mocks,
}))

const makeNarrationReadyMerged = () => {
  const merged = makeMergeVideoContextOutput()
  const event = {
    event_id: 'event-001',
    start: 0.1,
    end: 1,
    type: 'plot',
    description: '两名角色的冲突在开场爆发',
    importance: 'high',
    evidence: ['开场。'],
  }
  const narrativeUnderstanding = makeNarrativeUnderstanding({
    analysis: {
      ...merged.pipelineResult.narrativeUnderstanding.analysis,
      events: [event],
    },
    events: [event],
  })
  return {
    ...merged,
    pipelineResult: {
      ...merged.pipelineResult,
      narrativeUnderstanding,
    },
  }
}

describe('workflow/frame/steps/step_10_generate_narration_script', () => {
  it.each([false, true])('passes out-of-range narration onward after three rewrites (review=%s)', async enabled => {
    const context = makeRuntimeContext({ config: { selectionRatio: 1, narrationRatio: 1, reviewNarrationScript: enabled },
      records: { 'merge-video-context': successRecord('merge-video-context', makeNarrationReadyMerged()) },
      appendStepLog: vi.fn(), updateStepProgress: vi.fn() })
    mocks.generateNarrationDraftStream.mockResolvedValue({ items: [{ _id: 1, text: '字'.repeat(53) }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, model: 'flash', request_id: 'mock', metadata: {} })
    mocks.generateNarrationStructuredStream.mockResolvedValue({ result: { passed: true, issues: [],
      coverage: [{ event_id: 'event-001', covered: true, item_ids: [1] }], evidence_gaps: [], patches: [] },
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, model: 'pro', request_id: 'mock-review' })
    const output = await step10GenerateNarrationScript.run(step10GenerateNarrationScript.buildInput(context), context) as GenerateNarrationScriptOutput
    expect(mocks.generateNarrationDraftStream).toHaveBeenCalledTimes(4)
    expect(output.reviewRequired).toBe(false)
    expect(output.approvedDraftItems?.[0].text).toBe('字'.repeat(53))
  })
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('buildInput creates the layered narration context and preserves PC config fields', () => {
    const merged = makeNarrationReadyMerged()
    const context = makeRuntimeContext({
      config: {
        outputLanguage: 'en-US',
        audioSpeed: 6,
        wordCount: '600',
        narrationStyleId: 'drama',
        customPrompt: '  更悬疑一点  ',
        outputDurationMs: 240_000,
        narrationRatio: 0.5,
      },
      records: {
        'merge-video-context': successRecord('merge-video-context', merged),
      },
    })

    expect(step10GenerateNarrationScript.buildInput(context)).toMatchObject({
      video_config: expect.objectContaining({
        model_level: 'frame',
        target_language: 'en-US',
        audio_speed: 6,
        style_mode: 'drama',
        output_duration_ms: 240_000,
        narration_ratio: 0.5,
      }),
      video_context: expect.objectContaining({
        context_schema: 'frame_narration_dynamic_context_v1',
      }),
      cache_context: expect.objectContaining({
        cache_schema: 'frame_narration_layered_context_v1',
        story_event_index: expect.arrayContaining([
          expect.objectContaining({ event_id: 'event-001' }),
        ]),
      }),
      custom_prompt: expect.stringContaining('更悬疑一点'),
    })
  })

  it('rejects a missing merged video context', () => {
    expect(() => step10GenerateNarrationScript.buildInput(makeRuntimeContext())).toThrow(
      '缺少依赖步骤 merge-video-context'
    )
  })

  it('uses one complete 80-character item for one selected narration event', () => {
    expect(buildNarrationChapterGenerationConstraints(
      { target_characters: 80 },
      { itemCount: 1 },
    )).toMatchObject({
      minimum: 56,
      target: 80,
      maximum: 104,
      required_item_count: 1,
      per_item_target_characters: 80,
      per_item_maximum_characters: 104,
    })

    expect(buildNarrationChapterGenerationConstraints(
      { target_characters: 80 },
      { itemCount: 1, guardBand: true, strictFinalRetry: true },
    )).toMatchObject({
      minimum: 56,
      target: 80,
      maximum: 104,
      required_item_count: 1,
      per_item_target_characters: 80,
      per_item_maximum_characters: 104,
      strict_final_retry: true,
    })
  })

  it('rejects multiple returned draft items for one selected event', () => {
    expect(singleNarrationText([{ _id: 1, text: '第一段' }])).toBe('第一段')
    expect(singleNarrationText([
      { _id: 1, text: '第一段' },
      { _id: 2, text: '第二段' },
    ])).toBeNull()
  })

  it('builds an original-only timeline at 0% narration without calling a model', async () => {
    const merged = makeNarrationReadyMerged()
    const context = makeRuntimeContext({
      config: {
        selectionRatio: 1,
        narrationRatio: 0,
      },
      records: {
        'merge-video-context': successRecord('merge-video-context', merged),
      },
      appendStepLog: vi.fn(),
      updateStepProgress: vi.fn(),
    })

    const output = await step10GenerateNarrationScript.run(
      step10GenerateNarrationScript.buildInput(context),
      context,
    ) as GenerateNarrationScriptOutput

    expect(Object.values(mocks).every(mock => mock.mock.calls.length === 0)).toBe(true)
    expect(output).toMatchObject({
      reviewRequired: false,
      draftItems: [],
      approvedDraftItems: [],
      scriptResponse: {
        model: 'local-original-only',
        request_id: 'local-original-only',
      },
      pipelineResult: {
        selectionPlan: {
          keepCount: 1,
          narrationCount: 0,
          originalCount: 1,
          targetCharacters: 0,
          rawSegments: [
            expect.objectContaining({ event_id: 'event-001' }),
          ],
          validSegments: [
            expect.objectContaining({ event_id: 'event-001' }),
          ],
          selectedSegments: [
            expect.objectContaining({ event_id: 'event-001' }),
          ],
          narrationSegments: [],
          originalSegments: [
            expect.objectContaining({ event_id: 'event-001' }),
          ],
          excludedSegments: [],
        },
      },
    })
    expect(output.scriptResponse?.items).toEqual([
      expect.objectContaining({
        text: '',
        org: '两名角色的冲突在开场爆发',
      }),
    ])
  })

  it('does not call a model after cancellation', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(step10GenerateNarrationScript.run(
      {},
      makeRuntimeContext({ signal: controller.signal }),
    )).rejects.toThrow('解说文案生成已取消')
    expect(Object.values(mocks).every(mock => mock.mock.calls.length === 0)).toBe(true)
  })

  it('summarizes the anchored narration pipeline shape', () => {
    expect(step10GenerateNarrationScript.summarizeOutput({
      draftItems: [],
      approvedDraftItems: [],
      reviewRequired: false,
      pipelineResult: makeMergeVideoContextOutput().pipelineResult,
    })).toEqual({
      review_required: false,
      draft_items: 0,
      chapters: 0,
      global_review_passed: false,
      global_review_degraded: false,
      model_routing: null,
    })
  })
})
