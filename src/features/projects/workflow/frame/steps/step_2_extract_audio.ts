import { extractAudioForTranscription } from '@/features/projects/services/material/frameInferencePipelineService'
import { throwIfAborted } from '@/shared/utils/abort'
import type { ExtractAudioOutput, FrameWorkflowStep, MergeVideosOutput } from '../types'
import { resolveMergedVideoFile } from '../utils/media'
import { requireOutput } from '../utils/records'
import { mapProgressRange, updateWorkflowStepProgress } from '../utils/progress'

export const step2ExtractAudio: FrameWorkflowStep = {
  id: 'extract-audio',
  label: '提取音频',
  description: '从合并后的视频中抽取音轨，并在浏览器侧压缩成 MP3 文件供转录接口使用。',
  progressWeight: 8,
  dependsOn: ['merge-videos'],
  effects: ['browser-media'],
  frontendWork: [
    '读取 merge-videos 输出的 mergedVideoFile。',
    '使用 mediabunny Conversion 丢弃视频轨，只输出语音识别需要的音频轨。',
    '编码为 16 kHz 单声道 MP3，避免在浏览器内累计大体积 PCM/WAV 数据。',
    '输出 extractedAudio 摘要和真实音频 File。',
  ],
  buildInput: ({ records }) => {
    const merged = requireOutput<MergeVideosOutput>(records, 'merge-videos')
    return { merged }
  },
  run: async (input, context) => {
    throwIfAborted(context.signal, '音频提取已取消')
    const { mergedVideoFile, merged } = input as { mergedVideoFile?: File; merged?: MergeVideosOutput }
    const sourceFile = mergedVideoFile instanceof File
      ? mergedVideoFile
      : merged
        ? await resolveMergedVideoFile(merged)
        : null
    if (!sourceFile) {
      throw new Error('合并视频 File 已丢失，请先重新执行“合并视频”')
    }
    updateWorkflowStepProgress(context, 'extract-audio', 5, '正在初始化 MP3 音频提取')
    const file = await extractAudioForTranscription(sourceFile, (progress) => {
      updateWorkflowStepProgress(
        context,
        'extract-audio',
        mapProgressRange(progress.percentage, 18, 34, 10, 92),
        progress.message
      )
    }, context.signal)
    throwIfAborted(context.signal, '音频提取已取消')
    updateWorkflowStepProgress(context, 'extract-audio', 100, '音频提取已完成')
    return {
      file,
      audio: {
        name: file.name,
        size: file.size,
        type: file.type || 'audio/mpeg',
      },
    } satisfies ExtractAudioOutput
  },
  summarizeOutput: (output) => (output as ExtractAudioOutput).audio,
}
