import { beforeEach, describe, expect, it, vi } from 'vitest'
import { step8UnderstandNarrative } from '../../steps/step_8_understand_narrative'
import {
  makeAnalysesOutput,
  makeDecisionOutput,
  makeNarrativeUnderstanding,
  makeRuntimeContext,
  makeValidateSubtitlesOutput,
  successRecord,
} from './fixtures'

const mocks = vi.hoisted(() => ({
  analyzeNarrativeContextStream: vi.fn(),
}))

vi.mock('@/shared/services/aiToolsService', () => ({
  aiToolsService: {
    analyzeNarrativeContextStream: mocks.analyzeNarrativeContextStream,
  },
}))

describe('workflow/frame/steps/step_8_understand_narrative', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.analyzeNarrativeContextStream.mockResolvedValue(makeNarrativeUnderstanding())
  })

  it('buildInput 会把字幕、说话人、决策和视觉分析整理成剧情理解输入', () => {
    const transcribed = makeValidateSubtitlesOutput()
    const decision = makeDecisionOutput()
    const analyses = makeAnalysesOutput()
    const context = makeRuntimeContext({
      config: { outputLanguage: 'en-US' },
      records: {
        'validate-subtitles': successRecord('validate-subtitles', transcribed),
        'decide-timeline-view': successRecord('decide-timeline-view', decision),
        'analyze-timeline-images': successRecord('analyze-timeline-images', analyses),
      },
    })

    const input = step8UnderstandNarrative.buildInput(context) as {
      transcript: string
      language: string
      segments: Array<{ speaker_id?: string }>
      decisions: unknown[]
      visualAnalyses: Array<{ summary: string }>
      cacheContext: Record<string, unknown>
    }

    expect(input.transcript).toBe('开场。冲突出现。')
    expect(input.language).toBe('en-US')
    expect(input.segments).toEqual([
      { start: 0, end: 1.2, text: '开场。', speaker_id: 'speaker_0' },
      { start: 1.5, end: 3, text: '冲突出现。', speaker_id: 'speaker_1' },
    ])
    expect(input.decisions).toBe(decision.decisions)
    expect(input.visualAnalyses).toEqual([
      expect.objectContaining({
        start: 1.5,
        end: 3,
        priority: 'high',
        trigger_type: 'plot',
        reason: '冲突出现',
        summary: '角色发生冲突',
      }),
    ])
    expect(input.cacheContext).toMatchObject({
      cache_schema: 'frame_workflow_shared_context_v2',
      subtitle_timeline: '[0.00-1.20] speaker_0: 开场。\n[1.50-3.00] speaker_1: 冲突出现。',
      language: 'en-US',
      decisions: expect.arrayContaining([expect.objectContaining({ reason: '冲突出现' })]),
      visual_analyses: expect.arrayContaining([expect.objectContaining({ summary: '角色发生冲突' })]),
    })
    expect(input.cacheContext).not.toHaveProperty('transcript')
    expect(input.cacheContext).not.toHaveProperty('packed_transcript')
    expect(input.cacheContext).not.toHaveProperty('segments')
  })

  it('缺少上游输出时会阻止继续执行', () => {
    expect(() => step8UnderstandNarrative.buildInput(makeRuntimeContext())).toThrow('缺少依赖步骤 validate-subtitles')
  })

  it('run 会调用剧情理解流式接口并写入流式进度日志', async () => {
    const controller = new AbortController()
    const response = makeNarrativeUnderstanding({ tokens_consumed: 123 })
    const context = makeRuntimeContext({
      signal: controller.signal,
      updateStepProgress: vi.fn(),
      appendStepLog: vi.fn(),
      updateStepLog: vi.fn(),
    })
    mocks.analyzeNarrativeContextStream.mockImplementation(async (_input, options) => {
      options.onEvent?.({ type: 'stage', stage: 'prepare', message: '正在分析剧情结构' })
      options.onEvent?.({ type: 'thinking_delta', delta: '先梳理人物关系。' })
      options.onEvent?.({ type: 'answer_delta', delta: '剧情冲突升级。' })
      options.onEvent?.({ type: 'completed', response })
      return response
    })

    const output = await step8UnderstandNarrative.run({
      transcript: '开场。冲突出现。',
      segments: [],
      decisions: [],
      visualAnalyses: [],
      language: 'zh-CN',
    }, context)

    expect(mocks.analyzeNarrativeContextStream).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        transcript: '开场。冲突出现。',
      }),
      expect.objectContaining({
        signal: controller.signal,
        onEvent: expect.any(Function),
      })
    )
    expect(context.updateStepLog).toHaveBeenCalledWith(
      'understand-narrative',
      '模型思考流：',
      '模型思考流：先梳理人物关系。'
    )
    expect(context.updateStepLog).toHaveBeenCalledWith(
      'understand-narrative',
      '模型输出：',
      '模型输出：剧情冲突升级。'
    )
    expect(output).toBe(response)
  })

  it('已取消时不会调用剧情理解服务', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(step8UnderstandNarrative.run({}, makeRuntimeContext({ signal: controller.signal }))).rejects.toThrow(
      '剧情理解已取消'
    )
    expect(mocks.analyzeNarrativeContextStream).not.toHaveBeenCalled()
  })

  it('summarizeOutput 会汇总剧情结构数量和 token', () => {
    expect(step8UnderstandNarrative.summarizeOutput(makeNarrativeUnderstanding({
      characters: ['A'],
      relationships: [{ from: 'A', to: 'B', relation: '冲突' }],
      events: [{ text: '争执' }, { text: '追逐' }],
      emotion_curve: [{ time: 2, emotion: '紧张' }],
      tokens_consumed: 77,
    }))).toEqual({
      characters: 1,
      relationships: 1,
      events: 2,
      emotions: 1,
      tokens: 77,
    })
  })
})
