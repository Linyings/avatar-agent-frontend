import { calibrateFrameScriptItems, composeFrameFinalVideo, hydrateFrameVoiceoverAudioStates, resolveFrameVoiceSelection, type FrameVoiceoverResult } from '@/features/projects/services/material/frameInferencePipelineService'
import { convertFrontendToNewBatch, convertNewToFrontendBatch } from '@/shared/utils/scriptDataAdapter'
import { ensureTimeFieldsBatch } from '@/shared/utils/timestampUtils'
import { throwIfAborted } from '@/shared/utils/abort'
import type { ScriptItem } from '@/shared/types'
import type { ComposeFinalVideoOutput, FrameWorkflowStep, GenerateVoiceoverOutput, MergeVideosOutput } from '../types'
import { resolveMergedVideoFile } from '../utils/media'
import { requireOutput } from '../utils/records'
import { mapProgressRange, updateWorkflowStepProgress } from '../utils/progress'

export const step12ComposeFinalVideo: FrameWorkflowStep = {
  id: 'compose-final-video',
  label: '合成最终视频',
  description: '按脚本时间线剪辑视频、叠加解说配音，并把选择的背景音乐混入成片。',
  progressWeight: 12,
  dependsOn: ['merge-videos', 'generate-voiceover'],
  effects: ['browser-media', 'network', 'temp-upload'],
  frontendWork: [
    '读取合并视频 File、配音后的脚本 items 和 TTS 音频状态。',
    '根据配音时长校准脚本时间戳，避免最终合成音画错位。',
    '调用浏览器端 videoComposer 裁剪并拼接视频，OST=0 使用解说配音，OST=1 保留原声。',
    '如果参数选择了背景音乐，会把背景音乐作为低音量底轨混入最终视频，再上传成片得到 finalVideoUrl。',
  ],
  buildInput: ({ records, config }) => {
    const merged = requireOutput<MergeVideosOutput>(records, 'merge-videos')
    const generated = requireOutput<GenerateVoiceoverOutput>(records, 'generate-voiceover')
    return {
      mergedVideo: merged.video,
      scriptItems: generated.voiceoverResult.items,
      voiceUri: generated.voiceoverResult.voiceUri,
      backgroundMusic: config.backgroundMusic ?? null,
      backgroundMusicUrl: config.backgroundMusicUrl ?? null,
    }
  },
  run: async (_input, context) => {
    throwIfAborted(context.signal, '最终视频合成已取消')
    const merged = requireOutput<MergeVideosOutput>(context.records, 'merge-videos')
    const generated = requireOutput<GenerateVoiceoverOutput>(context.records, 'generate-voiceover')
    const currentVoice = await resolveFrameVoiceSelection(context.config.voice)
    if (generated.voiceoverResult.voiceUri && currentVoice.uri !== generated.voiceoverResult.voiceUri) {
      const currentVoiceName = currentVoice.name || currentVoice.uri
      const generatedVoiceName = generated.voiceoverResult.voiceName || generated.voiceoverResult.voiceUri
      throw new Error(`当前选择的配音音色（${currentVoiceName}）和已生成配音（${generatedVoiceName}）不一致，请先重新执行“解说配音”，再合成最终视频。`)
    }
    const mergedVideoFile = await resolveMergedVideoFile(merged)
    const voicedItems = ensureTimeFieldsBatch(convertNewToFrontendBatch(generated.voiceoverResult.items)) as ScriptItem[]
    updateWorkflowStepProgress(context, 'compose-final-video', 8, '正在校准配音时间线')
    const hydratedAudioStates = await hydrateFrameVoiceoverAudioStates(voicedItems, generated.voiceoverResult.audioStates)
    const calibratedItems = generated.timelineReviewApproved
      ? voicedItems
      : await calibrateFrameScriptItems(voicedItems, hydratedAudioStates)
    const calibratedVoiceoverResult: FrameVoiceoverResult = {
      ...generated.voiceoverResult,
      audioStates: hydratedAudioStates,
      items: convertFrontendToNewBatch(calibratedItems),
    }
    const finalVideoResult = await composeFrameFinalVideo({
      projectId: context.projectId,
      sourceVideoFile: mergedVideoFile,
      sourceVideoDuration: merged.video.duration,
      scriptItems: calibratedItems,
      ttsAudioStates: calibratedVoiceoverResult.audioStates,
      config: context.config,
      onProgress: (progress) => {
        const uploadPercentage = progress.step === 'upload'
          ? Number(progress.message.match(/(\d+)%/)?.[1] ?? Number.NaN)
          : Number.NaN
        const localPercentage = progress.step === 'upload' && Number.isFinite(uploadPercentage)
          ? mapProgressRange(uploadPercentage, 0, 100, 84, 98)
          : mapProgressRange(progress.percentage, 98, 99, 12, 82)
        updateWorkflowStepProgress(context, 'compose-final-video', localPercentage, progress.message)
      },
      signal: context.signal,
    })
    throwIfAborted(context.signal, '最终视频合成已取消')
    updateWorkflowStepProgress(context, 'compose-final-video', 100, '最终视频合成已完成')

    return {
      ...finalVideoResult,
      pipelineResult: {
        ...generated.pipelineResult,
        voiceoverResult: calibratedVoiceoverResult,
        finalVideoResult: finalVideoResult.finalVideo,
      },
    } satisfies ComposeFinalVideoOutput
  },
  summarizeOutput: (output) => {
    const typed = output as ComposeFinalVideoOutput
    return {
      final_video: typed.finalVideo.artifact.key,
      size: typed.finalVideo.size,
      duration: typed.finalVideo.duration,
      background_music: typed.finalVideo.backgroundMusic?.label ?? '未选择',
    }
  },
}
