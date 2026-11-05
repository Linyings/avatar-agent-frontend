import { aiToolsService, type NarrativeUnderstandingResponse } from '@/shared/services/aiToolsService'
import type { FrameInferenceAnalysisItem, FrameInferencePipelineResult } from '@/features/projects/services/material/frameInferencePipelineService'
import { throwIfAborted } from '@/shared/utils/abort'
import { getFrameWorkflowBackendProjectId, type FrameWorkflowStep, type ValidateSubtitlesOutput } from '../types'
import { requireOutput } from '../utils/records'
import { updateWorkflowStepProgress } from '../utils/progress'
import { appendStreamPreviewChunk, narrativeCount, streamPreview } from '../utils/workflowValue'
import { buildFrameWorkflowCacheContext } from '../utils/cacheContext'

export const step8UnderstandNarrative: FrameWorkflowStep = {
  id: 'understand-narrative',
  label: '剧情理解',
  description: '使用文本大模型综合字幕、说话人和视觉分析，生成剧情理解、人物关系、情绪曲线和事件抽取。',
  progressWeight: 8,
  dependsOn: ['validate-subtitles', 'decide-timeline-view', 'analyze-timeline-images'],
  effects: ['network'],
  frontendWork: [
    '读取转录文本、字幕段、timeline 决策和视觉分析结果。',
    '保留 speaker_id，构造剧情理解输入。',
    '调用后端文本大模型流式工具，要求输出结构化 JSON。',
    '输出人物、关系、情绪曲线、事件和全局剧情摘要。',
  ],
  backendRoutes: [
    {
      method: 'POST',
      path: '/api/v1/tools/frame-workflow/narrative-analyze',
      handler: 'Frame Workflow 剧情理解工具',
      purpose: '基于字幕、说话人和视觉分析，抽取剧情、人物关系、情绪曲线和关键事件。',
    },
  ],
  buildInput: ({ records, config }) => {
    const transcribed = requireOutput<ValidateSubtitlesOutput>(records, 'validate-subtitles')
    const decision = requireOutput<FrameInferencePipelineResult['decision']>(records, 'decide-timeline-view')
    const analyses = requireOutput<{ analyses: FrameInferenceAnalysisItem[] }>(records, 'analyze-timeline-images').analyses
    return {
      videoContext: transcribed.transcription.packed_transcript,
      transcript: transcribed.transcription.text_content,
      segments: transcribed.subtitleResult.segments.map((segment) => ({
        start: segment.startTime,
        end: segment.endTime,
        text: segment.text,
        speaker_id: segment.speakerId,
      })),
      decisions: decision.decisions,
      visualAnalyses: analyses.map((item) => ({
        start: item.decision.start,
        end: item.decision.end,
        priority: item.decision.priority,
        trigger_type: item.decision.trigger_type,
        reason: item.decision.reason,
        summary: item.response.analysis?.summary ?? item.response.content,
        visual_events: item.response.analysis?.visual_events,
        concerns: item.response.analysis?.concerns,
        recommendations: item.response.analysis?.recommendations,
      })),
      cacheContext: buildFrameWorkflowCacheContext({
        transcription: transcribed.transcription,
        subtitleResult: transcribed.subtitleResult,
        decision,
        analyses,
        language: config.outputLanguage,
      }),
      language: config.outputLanguage,
    }
  },
  run: async (input, context) => {
    throwIfAborted(context.signal, '剧情理解已取消')
    let streamedThinking = ''
    let streamedAnswer = ''
    let hasReachedAnswer = false
    updateWorkflowStepProgress(context, 'understand-narrative', 5, '正在提交剧情理解请求')
    context.appendStepLog?.('understand-narrative', '已开始监听剧情理解流式输出')
    return aiToolsService.analyzeNarrativeContextStream(
      {
        ...(input as Parameters<typeof aiToolsService.analyzeNarrativeContextStream>[0]),
        projectId: getFrameWorkflowBackendProjectId(context),
      },
      {
        signal: context.signal,
        workflowIdentity: context.workflowRequestIdentity,
        onEvent: (event) => {
          if (event.type === 'stage') {
            updateWorkflowStepProgress(context, 'understand-narrative', 10, event.message || event.stage)
            context.appendStepLog?.('understand-narrative', `流式阶段：${event.message || event.stage}`)
            return
          }
          if (event.type === 'thinking_delta') {
            streamedThinking = appendStreamPreviewChunk(streamedThinking, event.delta)
            const thinkingProgress = Math.min(45, 15 + Math.min(streamedThinking.length / 80, 30))
            context.updateStepLog?.(
              'understand-narrative',
              '模型思考流：',
              `模型思考流：${streamPreview(streamedThinking)}`
            )
            updateWorkflowStepProgress(context, 'understand-narrative', Math.round(thinkingProgress), '正在接收剧情理解思考流')
            return
          }
          if (event.type === 'answer_delta') {
            if (!hasReachedAnswer) {
              hasReachedAnswer = true
            }
            streamedAnswer = appendStreamPreviewChunk(streamedAnswer, event.delta)
            const answerProgress = Math.min(92, 50 + Math.min(streamedAnswer.length / 60, 42))
            context.updateStepLog?.(
              'understand-narrative',
              '模型输出：',
              `模型输出：${streamPreview(streamedAnswer)}`
            )
            updateWorkflowStepProgress(context, 'understand-narrative', Math.round(answerProgress), '正在接收剧情理解结果')
            return
          }
          if (event.type === 'completed') {
            updateWorkflowStepProgress(context, 'understand-narrative', 100, '剧情理解已完成')
            context.appendStepLog?.('understand-narrative', `流式完成：模型 ${event.response.model || '未知'}，Token ${event.response.tokens_consumed || 0}`)
            return
          }
          if (event.type === 'error') {
            context.appendStepLog?.('understand-narrative', `流式错误：${event.message}`)
          }
        },
      }
    )
  },
  summarizeOutput: (output) => {
    const typed = output as NarrativeUnderstandingResponse
    return {
      characters: narrativeCount(typed.characters ?? typed.analysis?.characters),
      relationships: narrativeCount(typed.relationships ?? typed.analysis?.relationships),
      events: narrativeCount(typed.events ?? typed.analysis?.events),
      emotions: narrativeCount(typed.emotion_curve ?? typed.analysis?.emotion_curve),
      tokens: typed.tokens_consumed || 0,
    }
  },
}
