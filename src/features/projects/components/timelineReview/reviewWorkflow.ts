import type { FrameDebugRun, GenerateNarrationScriptOutput, GenerateVoiceoverOutput } from '../../workflow/frame'
import { attachTimelineVoices, applyTimelineToVoices, trimNarrationReviewTail } from './timelineVoiceover'
import { timelineNarrationRange } from './timelineNarrationRange'
import type { DesktopTimelineReviewItem } from './reviewTypes'

export function reviewItems(run: FrameDebugRun): DesktopTimelineReviewItem[] {
  const voice = run.records['generate-voiceover']?.output as GenerateVoiceoverOutput | undefined
  if (!voice) return []
  const draft = run.records['generate-narration-script']?.output as GenerateNarrationScriptOutput | undefined
  const items = voice.voiceoverResult.items.map(item => ({
    ...draft?.draftItems?.find(entry => entry._id === item._id),
    ...item, start: item.start ?? Number(item.start_time) / 1000, end: item.end ?? Number(item.end_time) / 1000,
    text: item.text ?? '', org: item.org ?? '', targetCharacters: 80, minimumCharacters: 56, maximumCharacters: 104,
  }))
  return attachTimelineVoices(items, voice.voiceoverResult).map(trimNarrationReviewTail)
}

export function needsTimelineReview(run: FrameDebugRun, enabled: boolean): boolean {
  const voice = run.records['generate-voiceover']?.output as GenerateVoiceoverOutput | undefined
  return Boolean(voice && !voice.timelineReviewApproved && reviewItems(run).length
    && (enabled || reviewItems(run).some(item => item.text.trim() && !timelineNarrationRange(item).valid)))
}

export function approveTimeline(run: FrameDebugRun, items: DesktopTimelineReviewItem[]): FrameDebugRun {
  const record = run.records['generate-voiceover']!
  const output = record.output as GenerateVoiceoverOutput
  const voices = applyTimelineToVoices(items, output.voiceoverResult)
  return { ...run, records: { ...run.records, 'generate-voiceover': { ...record, output: {
    ...output, timelineReviewApproved: true, voiceoverResult: voices,
    pipelineResult: { ...output.pipelineResult, voiceoverResult: voices },
  } } } }
}
