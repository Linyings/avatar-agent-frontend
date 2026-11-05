import { describe, expect, it, vi } from 'vitest'
import { step9MergeVideoContext } from '../../steps/step_9_merge_video_context'
import type { MergeVideoContextOutput } from '../../types'
import {
  makeAnalysesOutput,
  makeDecisionOutput,
  makeExtractAudioOutput,
  makeMergedOutput,
  makeNarrativeUnderstanding,
  makeRuntimeContext,
  makeValidateSubtitlesOutput,
  successRecord,
} from './fixtures'

describe('workflow/frame/steps/step_9_merge_video_context', () => {
  const makeContext = () => {
    const merged = makeMergedOutput()
    const extracted = makeExtractAudioOutput()
    const transcribed = makeValidateSubtitlesOutput()
    const decision = makeDecisionOutput()
    const analyses = makeAnalysesOutput()
    const narrative = makeNarrativeUnderstanding()

    return {
      context: makeRuntimeContext({
        records: {
          'merge-videos': successRecord('merge-videos', merged),
          'extract-audio': successRecord('extract-audio', extracted),
          'validate-subtitles': successRecord('validate-subtitles', transcribed),
          'decide-timeline-view': successRecord('decide-timeline-view', decision),
          'analyze-timeline-images': successRecord('analyze-timeline-images', analyses),
          'understand-narrative': successRecord('understand-narrative', narrative),
        },
        updateStepProgress: vi.fn(),
      }),
      merged,
      extracted,
      transcribed,
      decision,
      analyses,
      narrative,
    }
  }

  it('buildInput 会读取所有上下文合并依赖', () => {
    const fixtures = makeContext()

    expect(step9MergeVideoContext.buildInput(fixtures.context)).toEqual({
      merged: fixtures.merged,
      extracted: fixtures.extracted,
      transcribed: fixtures.transcribed,
      decision: fixtures.decision,
      analyses: fixtures.analyses.analyses,
      narrativeUnderstanding: fixtures.narrative,
    })
  })

  it('缺少上游输出时会阻止继续执行', () => {
    expect(() => step9MergeVideoContext.buildInput(makeRuntimeContext())).toThrow('缺少依赖步骤 merge-videos')
  })

  it('run 会把视觉摘要和剧情理解写回 video_context，并统计 token', async () => {
    const fixtures = makeContext()

    const output = await step9MergeVideoContext.run(
      step9MergeVideoContext.buildInput(fixtures.context),
      fixtures.context
    ) as MergeVideoContextOutput

    expect(output.videoContext.visual_segments).toBe(1)
    expect(output.videoContext.items['2'].visual).toContain('角色发生冲突')
    expect(output.videoContext.narrative_context).toMatchObject({
      summary: '剧情冲突升级',
    })
    expect((output.videoContext.narrative_context as { confirmed_question_answers?: unknown[] }).confirmed_question_answers).toEqual(
      expect.arrayContaining([{ question: '冲突是否升级？', answer: '是' }])
    )
    expect(output.pipelineResult).toMatchObject({
      mergedVideo: fixtures.merged.video,
      extractedAudio: fixtures.extracted.audio,
      transcription: fixtures.transcribed.transcription,
      decision: fixtures.decision,
      analyses: fixtures.analyses.analyses,
      narrativeUnderstanding: fixtures.narrative,
      tokens: {
        transcription: 88,
        validation: 44,
        decision: 55,
        analysis: 66,
        narrative: 77,
        total: 330,
      },
    })
    expect(fixtures.context.updateStepProgress).toHaveBeenLastCalledWith('merge-video-context', {
      percentage: 100,
      message: '合并视频上下文已完成',
    })
  })

  it('summarizeOutput 会暴露片段和 token 摘要', async () => {
    const fixtures = makeContext()
    const output = await step9MergeVideoContext.run(
      step9MergeVideoContext.buildInput(fixtures.context),
      fixtures.context
    ) as MergeVideoContextOutput

    expect(step9MergeVideoContext.summarizeOutput(output)).toEqual({
      total_segments: 2,
      visual_segments: 1,
      total_tokens: 330,
    })
  })
})
