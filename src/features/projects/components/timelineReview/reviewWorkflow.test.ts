import { describe, expect, it, vi } from 'vitest'
import { approveTimeline, needsTimelineReview, reviewItems } from './reviewWorkflow'
import type { FrameDebugRun, GenerateVoiceoverOutput } from '../../workflow/frame'
vi.mock('../../services/material/frameInferencePipelineService', () => ({ generateFrameNarrationVoiceover: vi.fn() }))
const fixture = (length: number): FrameDebugRun => ({ records: {
  'generate-voiceover': { status: 'success', output: { voiceoverResult: {
    items: [{ _id: 1, text: '字'.repeat(length), start: 10, end: 30, org: '', local_audio_key: 'audio' }],
    audioStates: { 1: { success: true, duration: 12 } },
  } } },
} } as unknown as FrameDebugRun)
describe('web post-TTS review', () => {
  it.each([false, true])('requires review for out-of-range text with switch=%s', enabled => {
    expect(needsTimelineReview(fixture(53), enabled)).toBe(true)
    expect(needsTimelineReview(fixture(108), enabled)).toBe(true)
  })
  it('skips valid drafts unless explicitly requested', () => {
    expect(needsTimelineReview(fixture(75), false)).toBe(false)
    expect(needsTimelineReview(fixture(75), true)).toBe(true)
  })
  it('preserves human-approved ranges and accepts character deviations', () => {
    const run = fixture(53)
    const items = reviewItems(run)
    expect(items[0].end).toBe(22)
    const approved = approveTimeline(run, [{ ...items[0], start: 11, end: 25 }])
    const output = approved.records['generate-voiceover']!.output as GenerateVoiceoverOutput
    expect(output.voiceoverResult.items[0]).toMatchObject({ start: 11, end: 25, local_audio_key: 'audio' })
    expect(needsTimelineReview(approved, true)).toBe(false)
    expect(needsTimelineReview(approved, false)).toBe(false)
  })
  it('rejects stale speech after editing', () => {
    const run = fixture(53)
    expect(() => approveTimeline(run, [{ ...reviewItems(run)[0], text: '改' }])).toThrow('重新生成本段配音')
  })
})
