const MB = 1024 * 1024
const GB = 1024 * MB
const LOCAL_VIDEO_SOURCE_LIMIT_BYTES = 2 * GB

export type BrowserVideoQuality = 'low' | 'medium' | 'high'

export interface BrowserVideoProcessingBudget {
  deviceMemoryGB: number
  maxSourceBytes: number
  maxTotalInputBytes: number
  maxCompositionDurationSeconds: number
  maxMergeDurationSeconds: number
  maxCompositionSegments: number
}

const getDeviceMemoryGB = () => {
  if (typeof navigator === 'undefined') return 4

  const memory = Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory)
  return Number.isFinite(memory) && memory > 0 ? memory : 4
}

const getQualityMultiplier = (quality: BrowserVideoQuality = 'medium') => {
  switch (quality) {
    case 'low':
      return 1.5
    case 'high':
      return 0.65
    case 'medium':
    default:
      return 1
  }
}

export const getBrowserVideoProcessingBudget = (
  quality: BrowserVideoQuality = 'medium'
): BrowserVideoProcessingBudget => {
  const deviceMemoryGB = getDeviceMemoryGB()
  const qualityMultiplier = getQualityMultiplier(quality)

  if (deviceMemoryGB >= 8) {
    return {
      deviceMemoryGB,
      maxSourceBytes: LOCAL_VIDEO_SOURCE_LIMIT_BYTES,
      maxTotalInputBytes: LOCAL_VIDEO_SOURCE_LIMIT_BYTES,
      maxCompositionDurationSeconds: Math.round(20 * 60 * qualityMultiplier),
      maxMergeDurationSeconds: 30 * 60,
      maxCompositionSegments: 120,
    }
  }

  if (deviceMemoryGB >= 4) {
    return {
      deviceMemoryGB,
      maxSourceBytes: LOCAL_VIDEO_SOURCE_LIMIT_BYTES,
      maxTotalInputBytes: LOCAL_VIDEO_SOURCE_LIMIT_BYTES,
      maxCompositionDurationSeconds: Math.round(10 * 60 * qualityMultiplier),
      maxMergeDurationSeconds: 15 * 60,
      maxCompositionSegments: 80,
    }
  }

  return {
    deviceMemoryGB,
    maxSourceBytes: LOCAL_VIDEO_SOURCE_LIMIT_BYTES,
    maxTotalInputBytes: LOCAL_VIDEO_SOURCE_LIMIT_BYTES,
    maxCompositionDurationSeconds: Math.round(5 * 60 * qualityMultiplier),
    maxMergeDurationSeconds: 8 * 60,
    maxCompositionSegments: 50,
  }
}

export const formatBudgetBytes = (bytes: number) => {
  if (bytes >= 1024 * MB) return `${(bytes / (1024 * MB)).toFixed(1)}GB`
  return `${Math.round(bytes / MB)}MB`
}

export const formatBudgetDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const restSeconds = Math.round(seconds % 60)
  if (minutes <= 0) return `${restSeconds}秒`
  if (restSeconds === 0) return `${minutes}分钟`
  return `${minutes}分${restSeconds}秒`
}
