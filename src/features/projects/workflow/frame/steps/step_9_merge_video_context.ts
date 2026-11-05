import type { NarrativeUnderstandingResponse } from '@/shared/services/aiToolsService'
import { mergeFrameAnalysesIntoVideoContext, type FrameInferenceAnalysisItem, type FrameInferencePipelineResult } from '@/features/projects/services/material/frameInferencePipelineService'
import type { ExtractAudioOutput, FrameWorkflowStep, MergeVideoContextOutput, MergeVideosOutput, ValidateSubtitlesOutput } from '../types'
import { requireOutput } from '../utils/records'
import { updateWorkflowStepProgress } from '../utils/progress'
import { buildNarrativeContextWithConfirmedAnswers, sumAnalysisTokens } from '../utils/workflowValue'

export const step9MergeVideoContext: FrameWorkflowStep = {
  id: 'merge-video-context',
  label: '合并视频上下文',
  description: '把字幕上下文和视觉分析结果合并成项目后续生成脚本会使用的 video_context。',
  progressWeight: 3,
  dependsOn: ['merge-videos', 'extract-audio', 'validate-subtitles', 'decide-timeline-view', 'analyze-timeline-images', 'understand-narrative'],
  effects: [],
  frontendWork: [
    '读取字幕、初始 video_context、视觉决策和图片分析结果。',
    '按时间重叠关系把视觉摘要写回对应字幕片段。',
    '统计 visual_segments、token 总量并组装完整 frame_workflow 结果。',
    '此步骤只在前端内存中生成待写入数据，不写项目。',
  ],
  buildInput: ({ records }) => ({
    merged: requireOutput<MergeVideosOutput>(records, 'merge-videos'),
    extracted: requireOutput<ExtractAudioOutput>(records, 'extract-audio'),
    transcribed: requireOutput<ValidateSubtitlesOutput>(records, 'validate-subtitles'),
    decision: requireOutput<FrameInferencePipelineResult['decision']>(records, 'decide-timeline-view'),
    analyses: requireOutput<{ analyses: FrameInferenceAnalysisItem[] }>(records, 'analyze-timeline-images').analyses,
    narrativeUnderstanding: requireOutput<NarrativeUnderstandingResponse>(records, 'understand-narrative'),
  }),
  run: async (input, context) => {
    const { merged, extracted, transcribed, decision, analyses, narrativeUnderstanding } = input as {
      merged: MergeVideosOutput
      extracted: ExtractAudioOutput
      transcribed: ValidateSubtitlesOutput
      decision: FrameInferencePipelineResult['decision']
      analyses: FrameInferenceAnalysisItem[]
      narrativeUnderstanding: NarrativeUnderstandingResponse
    }
    updateWorkflowStepProgress(context, 'merge-video-context', 20, '正在合并字幕、视觉分析和剧情理解')
    const videoContext = {
      ...mergeFrameAnalysesIntoVideoContext(transcribed.initialVideoContext, analyses),
      narrative_context: buildNarrativeContextWithConfirmedAnswers(narrativeUnderstanding),
      narrative_updated_at: narrativeUnderstanding.updated_at ?? new Date().toISOString(),
    }
    const analysisTokens = sumAnalysisTokens(analyses)
    const narrativeTokens = narrativeUnderstanding.tokens_consumed || 0
    const validationTokens = transcribed.validation?.tokens_consumed || 0
    const pipelineResult: FrameInferencePipelineResult = {
      mergedVideo: merged.video,
      extractedAudio: extracted.audio,
      transcription: transcribed.transcription,
      subtitleResult: transcribed.subtitleResult,
      subtitlePayload: transcribed.subtitlePayload,
      subtitleValidation: transcribed.validation,
      videoContext,
      decision,
      analyses,
      narrativeUnderstanding,
      tokens: {
        transcription: transcribed.transcription.tokens_consumed || 0,
        validation: validationTokens,
        decision: decision.tokens_consumed || 0,
        analysis: analysisTokens,
        narrative: narrativeTokens,
        total: (transcribed.transcription.tokens_consumed || 0) + validationTokens + (decision.tokens_consumed || 0) + analysisTokens + narrativeTokens,
      },
    }

    updateWorkflowStepProgress(context, 'merge-video-context', 100, '合并视频上下文已完成')
    return { videoContext, pipelineResult } satisfies MergeVideoContextOutput
  },
  summarizeOutput: (output) => {
    const typed = output as MergeVideoContextOutput
    return {
      total_segments: typed.videoContext.total_segments,
      visual_segments: typed.videoContext.visual_segments,
      total_tokens: typed.pipelineResult.tokens.total,
    }
  },
}
