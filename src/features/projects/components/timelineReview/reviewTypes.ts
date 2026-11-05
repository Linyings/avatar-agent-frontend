export interface DesktopNarrationDraftItem {
  _id: number
  text: string
  chapter_id?: string
  event_ids?: string[]
  evidence_refs?: string[]
  source_start?: number
  source_end?: number
  priority?: 'high' | 'medium' | 'low'
  targetCharacters?: number
  minimumCharacters?: number
  maximumCharacters?: number
}
export interface DesktopTimelineReviewItem extends DesktopNarrationDraftItem {
  start: number
  end: number
  org: string
  voiceText?: string
  voiceAudioKey?: string
  voiceDuration?: number
}
export const formatNarrationTimelineTime = (seconds: number) => {
  const value = Math.max(0, seconds)
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${(value % 60).toFixed(1).padStart(4, '0')}`
}
