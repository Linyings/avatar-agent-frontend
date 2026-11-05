import { generateFrameNarrationVoiceover, type FrameVoiceoverResult } from '@/features/projects/services/material/frameInferencePipelineService'
import { convertNewToFrontendBatch } from '@/shared/utils/scriptDataAdapter'
import type { WorkflowRequestIdentity } from '@/shared/workflowRuns/identity'
import type { DesktopTimelineReviewItem } from './reviewTypes'

// Only shorten the tail inside the matched window; never move the evidence start.
export const trimNarrationReviewTail = (item: DesktopTimelineReviewItem): DesktopTimelineReviewItem => {
  const duration = item.voiceDuration
  if (!item.text.trim() || item.text.trim() !== item.voiceText?.trim()
    || !Number.isFinite(duration) || !duration || duration <= 0
    || !Number.isFinite(item.start) || !Number.isFinite(item.end)
    || item.end - item.start <= duration) return item
  return { ...item, end: item.start + duration }
}

export const attachTimelineVoices = (items: DesktopTimelineReviewItem[], voices: FrameVoiceoverResult) => items.map(item => {
  if (!item.text.trim()) return item
  const audio = voices.items.find(entry => entry._id === item._id)
  return { ...item, voiceText: audio?.text, voiceAudioKey: audio?.local_audio_key,
    voiceDuration: voices.audioStates[item._id]?.duration ?? audio?.duration }
})

export const applyTimelineToVoices = (items: DesktopTimelineReviewItem[], voices: FrameVoiceoverResult): FrameVoiceoverResult => {
  for (const item of items.filter(entry => entry.text.trim())) {
    const audio = voices.items.find(entry => entry._id === item._id)
    if (audio?.text?.trim() !== item.text.trim() || !audio?.local_audio_key) {
      throw new Error(`第 ${item._id} 段文案已修改或配音缺失，请重新生成本段配音`)
    }
    const duration = voices.audioStates[item._id]?.duration ?? audio.duration ?? 0
    if (duration > item.end - item.start + 0.05) throw new Error(`第 ${item._id} 段画面短于配音，请延长画面`)
  }
  return { ...voices, items: items.map(item => ({
    ...voices.items.find(entry => entry._id === item._id),
    _id: item._id, text: item.text, start: item.start, end: item.end, org: item.org,
  })) }
}

export async function regenerateTimelineVoice({ projectId, voices, items, itemId, workflowIdentity }: {
  projectId: string; voices: FrameVoiceoverResult; items: DesktopTimelineReviewItem[]; itemId: number;
  workflowIdentity: WorkflowRequestIdentity;
}) {
  const item = items.find(entry => entry._id === itemId)
  if (!item?.text.trim()) throw new Error('本段文案不能为空')
  if (!voices.voiceUri) throw new Error('原配音音色配置缺失，请重新执行解说配音')
  const replacement = await generateFrameNarrationVoiceover({
    projectId: `${projectId}:${workflowIdentity.workflowStepId}`,
    scriptItems: convertNewToFrontendBatch([item]),
    voiceUri: voices.voiceUri, voiceName: voices.voiceName, voiceType: voices.voiceType,
    serviceLevel: voices.serviceLevel, workflowIdentity,
  })
  const replaced = replacement.items.find(entry => entry._id === itemId)
  if (!replaced?.local_audio_key || !replacement.audioStates[itemId]?.success) throw new Error('本段配音未生成成功')
  const result: FrameVoiceoverResult = { ...voices,
    items: voices.items.map(entry => entry._id === itemId ? replaced : entry),
    audioStates: { ...voices.audioStates, [itemId]: replacement.audioStates[itemId] },
  }
  const reviewItems = attachTimelineVoices(items, result).map(entry => entry._id === itemId ? trimNarrationReviewTail(entry) : entry)
  const calibrated = reviewItems.find(entry => entry._id === itemId)!
  result.items = result.items.map(entry => entry._id === itemId ? { ...entry, start: calibrated.start, end: calibrated.end } : entry)
  return { voices: result, items: reviewItems }
}
