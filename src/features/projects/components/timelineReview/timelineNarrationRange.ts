import { countNarrationCharacters } from '@/features/projects/workflow/frame/services/frameNarrationPipeline'
import type { DesktopNarrationDraftItem } from './reviewTypes'

export const timelineNarrationRange = (item: DesktopNarrationDraftItem) => {
  const target = item.targetCharacters ?? 80
  const minimum = item.minimumCharacters ?? Math.round(target * 0.7)
  const maximum = item.maximumCharacters ?? Math.round(target * 1.3)
  const actual = countNarrationCharacters(item.text)
  return { target, minimum, maximum, actual, valid: actual >= minimum && actual <= maximum }
}
