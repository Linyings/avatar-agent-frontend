/** Display-only estimate calibrated against general-mode outputs at 30% selection.
 * Selection is a proportion of events, not a proportion of source running time.
 * Do not use this heuristic to trim audio or enforce composition duration.
 */
export function estimateGeneralDuration(sourceMs: number, selectionRatio = 0.3) {
  if (!Number.isFinite(sourceMs) || sourceMs <= 0) return { minMs: 0, maxMs: 0 }
  const minutes = sourceMs / 60_000
  const scale = Math.min(1, Math.max(0.05, Number.isFinite(selectionRatio) ? selectionRatio : 0.3)) / 0.3
  const minMinutes = minutes <= 20 ? minutes * 0.1 : 2 + (minutes - 20) * 0.05
  const maxMinutes = minutes <= 20 ? minutes * 0.15 : 3 + (minutes - 20) * 0.1
  return {
    minMs: Math.min(sourceMs, Math.round(minMinutes * scale * 60_000)),
    maxMs: Math.min(sourceMs, Math.round(maxMinutes * scale * 60_000)),
  }
}

export const GENERAL_DURATION_HINT = '通用模式建议使用 20–40 分钟素材，剪辑效果更佳。电影等超过 1–2 小时的长素材效果可能下降，建议先分段处理。预估时长仅供参考，实际以选段和配音结果为准。'
