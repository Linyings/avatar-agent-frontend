// 时长校准：记录每次任务的"预估成片时长 vs 实际成片时长"与"解说口播填充率"，
// 供下一次生成时动态调整软字数目标。参数随用户素材与写作风格自动收敛，
// 不写死任何系数。

export interface DurationCalibrationSample {
  finishedAt: string
  estimatedMs: number
  actualMs: number
  /** 解说口播总时长 / 解说画面窗口总时长，缺省表示本次无法统计。 */
  narrationFill?: number
}

export interface DurationCalibration {
  samples: DurationCalibrationSample[]
}

const STORAGE_KEY = 'narrato-ai:duration-calibration:v1'
const MAX_SAMPLES = 5
const MIN_FACTOR = 0.5
const MAX_FACTOR = 2
const MIN_CALIBRATION_SAMPLES = 2

export const readDurationCalibration = (storage?: Storage | null): DurationCalibration => {
  try {
    const store = storage ?? (typeof localStorage === 'undefined' ? null : localStorage)
    const raw = store?.getItem(STORAGE_KEY)
    if (!raw) return { samples: [] }
    const parsed = JSON.parse(raw) as DurationCalibration
    return {
      samples: Array.isArray(parsed.samples)
        ? parsed.samples
            .filter(sample => sample
              && Number.isFinite(sample.estimatedMs) && sample.estimatedMs > 0
              && Number.isFinite(sample.actualMs) && sample.actualMs > 0)
            .slice(-MAX_SAMPLES)
        : [],
    }
  } catch {
    return { samples: [] }
  }
}

export const writeDurationCalibrationSample = (
  sample: DurationCalibrationSample,
  storage?: Storage | null,
): void => {
  try {
    const store = storage ?? (typeof localStorage === 'undefined' ? null : localStorage)
    if (!store) return
    const current = readDurationCalibration(store)
    const samples = [...current.samples, sample].slice(-MAX_SAMPLES)
    store.setItem(STORAGE_KEY, JSON.stringify({ samples } satisfies DurationCalibration))
  } catch {
    // 校准是尽力而为的优化，写入失败不影响主流程。
  }
}

/** 实际/预估的均值比：>1 表示历史成片比预估长，<1 表示偏短。无样本时返回 1。 */
export const computeDurationFactor = (calibration: DurationCalibration): number => {
  const valid = calibration.samples.filter(sample => sample.actualMs > 0 && sample.estimatedMs > 0)
  if (valid.length === 0) return 1
  const mean = valid.reduce((total, sample) => total + sample.actualMs / sample.estimatedMs, 0) / valid.length
  return Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, mean))
}

/** 解说口播填充率：口播时长占画面窗口的比例。无样本时返回 1（视为写满）。 */
export const computeNarrationFill = (calibration: DurationCalibration): number => {
  const valid = calibration.samples.filter(sample =>
    Number.isFinite(sample.narrationFill) && (sample.narrationFill as number) > 0)
  if (valid.length === 0) return 1
  const mean = valid.reduce((total, sample) => total + (sample.narrationFill as number), 0) / valid.length
  // 单样本可能是被旧问题毒化的极端值，至少两个样本才开始补偿
  if (valid.length < MIN_CALIBRATION_SAMPLES) return 1
  return Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, mean))
}

/** 把填充率换算成生成端的内容补偿系数：写得越少，下一次软字数目标放得越宽。 */
export const computeFillCompensation = (narrationFill: number): number => (
  Math.min(1.35, Math.max(0.9, 1 / Math.max(0.35, narrationFill)))
)
