import type { GenerateScriptResponse } from '@/features/projects/services/scriptGenerationServiceV2'
import { generateFrameNarrationVoiceover, resolveFrameVoiceSelection } from '@/features/projects/services/material/frameInferencePipelineService'
import { convertNewToFrontendBatch } from '@/shared/utils/scriptDataAdapter'
import { ensureTimeFieldsBatch } from '@/shared/utils/timestampUtils'
import { throwIfAborted } from '@/shared/utils/abort'
import type { ScriptItem } from '@/shared/types'
import { getFrameWorkflowBackendProjectId, type FrameWorkflowStep, type GenerateVoiceoverOutput, type MatchNarrationVisualsOutput } from '../types'
import { requireOutput } from '../utils/records'
import { mapProgressRange, updateWorkflowStepProgress } from '../utils/progress'

export const step11GenerateVoiceover: FrameWorkflowStep = {
  id: 'generate-voiceover',
  label: '解说配音',
  description: '复用通用模式的 TTS 逻辑，为解说片段生成配音文件并写入本地音频缓存。',
  progressWeight: 8,
  dependsOn: ['match-narration-visuals'],
  effects: ['network', 'browser-media'],
  frontendWork: [
    '读取 match-narration-visuals 返回的脚本 items。',
    '把新格式脚本转成前端脚本格式，筛选 text 不为空的解说片段。',
    '调用 TTS 接口生成音频 Blob，并写入浏览器 IndexedDB 本地音频缓存。',
    '把 local_audio_key、audio_storage、duration 写回脚本 items，供配音页和合成流程使用。',
  ],
  backendRoutes: [
    {
      method: 'POST',
      path: '/api/v1/tools/text-to-speech-with-uri',
      handler: 'TTS 文本转语音工具',
      purpose: '按解说片段逐条生成配音音频。',
    },
  ],
  buildInput: ({ records, config }) => {
    const matched = requireOutput<MatchNarrationVisualsOutput>(records, 'match-narration-visuals')
    return {
      scriptItems: matched.scriptResponse.items,
      voice: config.voice ?? null,
    }
  },
  run: async (input, context) => {
    throwIfAborted(context.signal, '解说配音已取消')
    const matched = requireOutput<MatchNarrationVisualsOutput>(context.records, 'match-narration-visuals')
    const typedInput = input as { scriptItems: GenerateScriptResponse['items']; voice?: string | null }
    const frontendItems = ensureTimeFieldsBatch(convertNewToFrontendBatch(typedInput.scriptItems)) as ScriptItem[]
    if (matched.passthrough) {
      const voiceoverResult = {
        items: typedInput.scriptItems,
        audioStates: {},
        voiceUri: '',
        serviceLevel: 'basic' as const,
        generatedCount: 0,
      }
      context.appendStepLog?.('generate-voiceover', '纯原片模式已跳过 TTS。')
      updateWorkflowStepProgress(context, 'generate-voiceover', 100, '纯原片模式无需配音')
      return {
        voiceoverResult,
        pipelineResult: {
          ...matched.pipelineResult,
          voiceoverResult,
        },
      } satisfies GenerateVoiceoverOutput
    }
    const voiceSelection = await resolveFrameVoiceSelection(typedInput.voice)
    updateWorkflowStepProgress(context, 'generate-voiceover', 5, '正在准备解说配音')
    const voiceoverResult = await generateFrameNarrationVoiceover({
      projectId: context.projectId,
      backendProjectId: getFrameWorkflowBackendProjectId(context),
      scriptItems: frontendItems,
      voiceUri: voiceSelection.uri,
      voiceName: voiceSelection.name,
      voiceType: voiceSelection.type,
      serviceLevel: voiceSelection.serviceLevel,
      onProgress: (progress) => {
        updateWorkflowStepProgress(
          context,
          'generate-voiceover',
          mapProgressRange(progress.percentage, 97, 99, 10, 94),
          progress.message
        )
      },
      signal: context.signal,
      workflowIdentity: context.workflowRequestIdentity,
    })
    throwIfAborted(context.signal, '解说配音已取消')
    updateWorkflowStepProgress(context, 'generate-voiceover', 100, '解说配音已完成')
    return {
      voiceoverResult,
      pipelineResult: {
        ...matched.pipelineResult,
        voiceoverResult,
      },
    } satisfies GenerateVoiceoverOutput
  },
  summarizeOutput: (output) => {
    const typed = output as GenerateVoiceoverOutput
    return {
      generated: typed.voiceoverResult.generatedCount,
      voice: typed.voiceoverResult.voiceUri,
      voice_name: typed.voiceoverResult.voiceName ?? null,
      service_level: typed.voiceoverResult.serviceLevel,
      script_items: typed.voiceoverResult.items.length,
    }
  },
}
