import type {
  AnchoredNarrationDraftItem,
  NarrationDraftItem,
} from '@/features/projects/services/scriptGenerationServiceV2'

export const isAnchoredNarrationDraftItem = (
  item: NarrationDraftItem | null | undefined,
): item is AnchoredNarrationDraftItem => {
  const candidate = item as Partial<AnchoredNarrationDraftItem> | null | undefined
  return Number.isInteger(candidate?._id)
    && typeof candidate?.text === 'string'
    && typeof candidate?.chapter_id === 'string'
    && candidate.chapter_id.length > 0
    && Array.isArray(candidate.event_ids)
    && candidate.event_ids.length > 0
    && Array.isArray(candidate.evidence_refs)
    && typeof candidate.source_start === 'number'
    && Number.isFinite(candidate.source_start)
    && typeof candidate.source_end === 'number'
    && Number.isFinite(candidate.source_end)
    && candidate.source_end > candidate.source_start
    && (candidate.priority === 'high' || candidate.priority === 'medium' || candidate.priority === 'low')
}

export const hasAnchoredNarrationDraftItems = (
  items: readonly NarrationDraftItem[] | null | undefined,
): items is AnchoredNarrationDraftItem[] => (
  Boolean(items?.length) && items!.every(isAnchoredNarrationDraftItem)
)

export const applyNarrationTextEdits = (
  originalItems: readonly AnchoredNarrationDraftItem[],
  editedItems: readonly NarrationDraftItem[],
): AnchoredNarrationDraftItem[] => {
  if (!hasAnchoredNarrationDraftItems(originalItems)) {
    throw new Error('旧文案缺少声画锚点，需要重新生成解说文案')
  }
  if (editedItems.length !== originalItems.length) {
    throw new Error('审核时不能增删解说段落')
  }

  return originalItems.map((original, index) => {
    const edited = editedItems[index]
    if (!edited || edited._id !== original._id) {
      throw new Error('审核时不能增删或重排解说段落')
    }
    const text = edited.text.trim()
    if (!text) throw new Error('每段解说文案都不能为空')
    return { ...original, text }
  })
}
