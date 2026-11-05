import { FRAME_INFERENCE_DEFAULT_N_FRAMES, buildDecisionSegments, resolveFrameOutputPlan } from '@/features/projects/services/material/frameInferencePipelineService'
import { aiToolsService } from '@/shared/services/aiToolsService'
import { throwIfAborted } from '@/shared/utils/abort'
import type { WorkflowRequestIdentity } from '@/shared/workflowRuns/identity'
import { getFrameWorkflowBackendProjectId, type FrameWorkflowStep, type MergeVideosOutput, type ValidateSubtitlesOutput } from '../types'
import { decideTimelineViewChunked, type ChunkedTimelineDecisionResponse, type TimelineDecisionProgress } from '../services/timelineDecisionOrchestrator'
import { requireOutput } from '../utils/records'
import { updateWorkflowStepProgress } from '../utils/progress'

const createTimelineChunkWorkflowIdentity = (
  identity: WorkflowRequestIdentity | undefined,
  chunkId: string | undefined,
): WorkflowRequestIdentity | undefined => {
  if (!identity || !chunkId) return identity
  return {
    ...identity,
    workflowStepId: `${identity.workflowStepId}.${chunkId}`,
  }
}

export const step5DecideTimelineView: FrameWorkflowStep = {
  id: 'decide-timeline-view',
  label: '判断视觉片段',
  description: '根据转录文本和字幕时间段，判断哪些时间范围需要生成视觉辅助分析。',
  progressWeight: 9,
  dependsOn: ['merge-videos', 'validate-subtitles'],
  effects: ['network'],
  frontendWork: [
    '读取 validate-subtitles 输出的修正后 phrases/words、字幕段、packed_transcript 和 text_content。',
    '长视频先按转录文本分片，提取候选点和停顿信号，筛选候选分片后并发调用后端流式决策接口。',
    '失败分片只记录诊断信息，不再生成本地兜底决策，避免污染后续时间线图。',
    '合并模型成功返回的全局 decisions 和分片状态，交给后续时间线截图步骤。',
  ],
  backendRoutes: [
    {
      method: 'POST',
      path: '/api/v1/tools/timeline-view/decide',
      handler: 'Timeline View 决策工具',
      purpose: '判断需要视觉分析的时间范围、优先级、原因和建议抽帧数。',
    },
  ],
  buildInput: ({ records, config }) => {
    const merged = requireOutput<MergeVideosOutput>(records, 'merge-videos')
    const transcribed = requireOutput<ValidateSubtitlesOutput>(records, 'validate-subtitles')
    const outputPlan = resolveFrameOutputPlan(config.outputDurationMs, merged.video.duration * 1000)
    return {
      transcription: transcribed.transcription,
      subtitleResult: transcribed.subtitleResult,
      videoContext: transcribed.transcription.packed_transcript,
      transcript: transcribed.transcription.text_content,
      segments: buildDecisionSegments(transcribed.subtitleResult),
      maxDecisions: outputPlan.visualSegmentCount,
      analysisWindowSeconds: outputPlan.analysisWindowSeconds,
      defaultNFrames: FRAME_INFERENCE_DEFAULT_N_FRAMES,
      prompt: config.decisionPrompt,
    }
  },
  run: async (input, context) => {
    throwIfAborted(context.signal, '视觉片段判断已取消')
    const { analysisWindowSeconds, ...request } = input as Parameters<typeof decideTimelineViewChunked>[0] & {
      analysisWindowSeconds: number
    }
    return decideTimelineViewChunked({
      ...request,
      projectId: getFrameWorkflowBackendProjectId(context),
    }, {
      signal: context.signal,
      windowSeconds: analysisWindowSeconds,
      decideTimelineView: (request, options) => {
        const { chunkId, ...streamOptions } = options ?? {}
        return aiToolsService.decideTimelineViewStream(request, {
          ...streamOptions,
          workflowIdentity: createTimelineChunkWorkflowIdentity(context.workflowRequestIdentity, chunkId),
        })
      },
      onProgress: (progress: TimelineDecisionProgress) => {
      updateWorkflowStepProgress(
        context,
        'decide-timeline-view',
        progress.percentage ?? null,
        progress.message,
        {
          current_chunk: progress.current_chunk,
          completed_chunks: progress.completed_chunks ?? 0,
          total_chunks: progress.total_chunks ?? 0,
        },
      )
      context.updateStepLog?.('decide-timeline-view', '分片进度：', `分片进度：${progress.message}`)
      },
    })
  },
  summarizeOutput: (output) => {
    const typed = output as ChunkedTimelineDecisionResponse
    return {
      decisions: typed.decisions?.length ?? 0,
      tokens: typed.tokens_consumed || 0,
      strategy: typed.strategy?.mode,
      chunks: typed.strategy?.chunk_count ?? typed.chunks?.length ?? 0,
      source_windows: typed.strategy?.source_window_count ?? typed.chunks?.length ?? 0,
      ai_windows: typed.strategy?.model_window_count ?? typed.strategy?.chunk_count ?? 0,
      candidate_segments: typed.strategy?.candidate_segment_count ?? typed.decisions?.length ?? 0,
      failed_chunks: typed.failed_chunks?.length ?? 0,
      skipped_chunks: typed.strategy?.skipped_count ?? 0,
    }
  },
}
