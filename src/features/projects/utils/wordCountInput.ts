export const normalizeWordCountInput = (value: string): string => {
  if (!value) return ''

  const allowed = value.replace(/[^0-9-]/g, '')
  if (!allowed) return ''

  const firstHyphen = allowed.indexOf('-')

  if (firstHyphen === -1) {
    return allowed.replace(/-/g, '')
  }

  const before = allowed.slice(0, firstHyphen).replace(/-/g, '')
  const after = allowed.slice(firstHyphen + 1).replace(/-/g, '')

  if (!before) {
    return after
  }

  return after ? `${before}-${after}` : before
}

export const parseWordCountRange = (
  value: string | null
): { min: number; max: number } | null => {
  if (!value) return null

  const parts = value.split('-')

  if (parts.length === 1) {
    const num = parseInt(parts[0], 10)
    if (Number.isFinite(num) && num > 0) {
      return { min: num, max: num }
    }
  } else if (parts.length === 2) {
    const min = parseInt(parts[0], 10)
    const max = parseInt(parts[1], 10)
    if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > 0) {
      return { min: Math.min(min, max), max: Math.max(min, max) }
    }
  }

  return null
}
