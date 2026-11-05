import { describe, expect, it } from 'vitest'
import type { AnchoredNarrationDraftItem } from '@/features/projects/services/scriptGenerationServiceV2'
import {
  applyNarrationTextEdits,
  hasAnchoredNarrationDraftItems,
} from '../../services/frameNarrationReview'

const anchoredItem: AnchoredNarrationDraftItem = {
  _id: 1,
  text: '原始文案',
  chapter_id: 'chapter-01',
  event_ids: ['event-001'],
  evidence_refs: ['subtitle-001'],
  source_start: 12,
  source_end: 24,
  priority: 'high',
}

describe('frame narration review', () => {
  it('accepts complete narration anchors and rejects legacy drafts', () => {
    expect(hasAnchoredNarrationDraftItems([anchoredItem])).toBe(true)
    expect(hasAnchoredNarrationDraftItems([{ _id: 1, text: '旧文案' }])).toBe(false)
  })

  it('changes only text and preserves every anchor field', () => {
    const tamperedItem: AnchoredNarrationDraftItem = {
      ...anchoredItem,
      text: '人工修改后的文案',
      chapter_id: 'tampered-chapter',
      event_ids: ['tampered-event'],
      evidence_refs: [],
      source_start: 100,
      source_end: 200,
      priority: 'low',
    }
    const result = applyNarrationTextEdits([anchoredItem], [tamperedItem])

    expect(result).toEqual([{ ...anchoredItem, text: '人工修改后的文案' }])
  })

  it('rejects structural changes and empty rows', () => {
    expect(() => applyNarrationTextEdits([anchoredItem], [])).toThrow('不能增删')
    expect(() => applyNarrationTextEdits([anchoredItem], [{ _id: 2, text: '重排' }])).toThrow('不能增删或重排')
    expect(() => applyNarrationTextEdits([anchoredItem], [{ _id: 1, text: '   ' }])).toThrow('不能为空')
  })
})
