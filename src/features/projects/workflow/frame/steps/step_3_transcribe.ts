import { aiToolsService } from '@/shared/services/aiToolsService'
import { buildFrameSubtitleExtractionResult } from '@/features/projects/services/material/frameInferencePipelineService'
import { buildSubtitlePayload } from '@/features/projects/utils/subtitleTransform'
import { convertSubtitlesToVideoContext } from '@/features/projects/utils/videoContextConverter'
import { throwIfAborted } from '@/shared/utils/abort'
import { getFrameWorkflowBackendProjectId, type ExtractAudioOutput, type FrameWorkflowStep, type TranscribeOutput } from '../types'
import { requireOutput } from '../utils/records'
import { updateWorkflowStepProgress } from '../utils/progress'

export const step3Transcribe: FrameWorkflowStep = {
  id: 'transcribe',
  label: '转录字幕',
  description: '把前端提取出的 MP3 音频提交给后端转录能力，并在前端转换为项目字幕结构。',
  progressWeight: 10,
  dependsOn: ['extract-audio'],
  effects: ['network'],
  frontendWork: [
    '读取 extract-audio 输出的 audioFile。',
    '把输出语言和音频文件传给 aiToolsService。',
    '把后端 FunASR 响应归一化为字幕片段。',
    '生成 subtitlePayload 和初始 video_context。',
  ],
  backendRoutes: [
    {
      method: 'POST',
      path: '/api/v1/tools/dashscope/temp-files/upload-policy',
      handler: 'DashScope 临时文件上传凭证',
      purpose: '获取 FunASR 音频临时上传凭证。',
    },
    {
      method: 'POST',
      path: '/api/v1/tools/funasr/asr/submit',
      handler: 'FunASR 转录任务提交工具',
      purpose: '提交音频 oss:// 地址并返回 task_id。',
    },
    {
      method: 'GET',
      path: '/api/v1/tools/funasr/asr/query/:task_id',
      handler: 'FunASR 转录任务查询工具',
      purpose: '按 task_id 轮询并下载转录结果。',
    },
  ],
  buildInput: ({ records, config }) => {
    const extracted = requireOutput<ExtractAudioOutput>(records, 'extract-audio')
    if (!(extracted.file instanceof File)) {
      throw new Error('提取出的临时音频文件已释放，请从“提取音频”步骤重新执行')
    }
    return {
      audioFile: extracted.file,
      outputLanguage: config.outputLanguage,
    }
  },
  run: async (input, context) => {
    throwIfAborted(context.signal, '音频转录已取消')
    const { audioFile, outputLanguage } = input as { audioFile: File; outputLanguage: string | null }
    updateWorkflowStepProgress(context, 'transcribe', 5, '正在上传音频文件')
    updateWorkflowStepProgress(context, 'transcribe', 20, '音频已上传，正在等待转录结果')
    const transcription = await aiToolsService.transcribeWithFunASR(audioFile, outputLanguage, {
      projectId: getFrameWorkflowBackendProjectId(context),
      signal: context.signal,
      workflowIdentity: context.workflowRequestIdentity,
      onPolling: ({ attempt }) => {
        const percentage = Math.min(80, 20 + attempt * 5)
        updateWorkflowStepProgress(context, 'transcribe', percentage, `转录处理中，正在第 ${attempt} 次查询结果`)
      },
    })
    throwIfAborted(context.signal, '音频转录已取消')
    updateWorkflowStepProgress(context, 'transcribe', 85, '转录完成，正在生成字幕结构')
    updateWorkflowStepProgress(context, 'transcribe', 100, '字幕转录已完成')
    const subtitleResult = buildFrameSubtitleExtractionResult(transcription)
    const subtitlePayload = buildSubtitlePayload(subtitleResult.segments)
    const initialVideoContext = convertSubtitlesToVideoContext(subtitleResult)

    return {
      transcription,
      subtitleResult,
      subtitlePayload,
      initialVideoContext,
    } satisfies TranscribeOutput
  },
  summarizeOutput: (output) => {
    const typed = output as TranscribeOutput
    return {
      language: typed.subtitleResult.language,
      segments: typed.subtitleResult.segments.length,
      tokens: typed.transcription.tokens_consumed || 0,
    }
  },
}
