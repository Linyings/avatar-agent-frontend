/**
 * 视频配置类型定义（简化版）
 * 与前端参数表单保持一致，用于生成推理请求。
 */

export type NarrationInputMode = 'ai'

export interface VideoConfig {
  model_level: ModelLevel
  source_language: string
  target_language: string
  audio_speed: number
  word_count_mode: WordCountMode
  word_count: string | null
  storyboard_mode: StoryboardMode
  storyboard_count: number | null
  style_mode: StyleMode
  person_view: PersonView
  clip_mode: ClipMode
  mix_ratio: number
  help_text: string
  type_script: TypeScript
  type_script_value: string
  narration_input_mode: NarrationInputMode
  custom_prompt_enabled: boolean
  custom_prompt_text: string
}

// ==================== 视频元数据 ====================

export interface VideoMetadata {
  file_size: number           // MB
  duration_seconds: number    // 秒
  resolution: string          // "720 x 1280"
  aspect_ratio: string        // "9 x 16"
}

// ==================== 枚举类型 ====================

export type ModelLevel = 'frame'

export type LegacyModelLevel = 'shallow' | 'deep'

export type ProjectInferenceMode = ModelLevel | LegacyModelLevel | 'avatar'

export type PersonView = 'first_person' | 'third_person'

export type TypeScript = 'default' | 'reference' | 'previous'

export type StyleMode = string

export type ClipMode = 'narration_only' | 'original_only' | 'smart_mix'

export type StoryboardMode = 'smart' | 'custom'

export type WordCountMode = 'auto' | 'custom'

// ==================== 选项接口 ====================

export interface StyleOption {
  value: StyleMode
  name: string
  description: string
  features?: string[]
  suitableFor?: string[]
}

export interface TypeScriptOption {
  value: TypeScript
  label: string
  description: string
  placeholder?: string
}

// ==================== 验证结果 ====================

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

// ==================== 默认值 ====================

export const DEFAULT_WORD_COUNT_VALUE = '800-1000'

export const DEFAULT_VIDEO_CONFIG: VideoConfig = {
  model_level: 'frame',
  source_language: '中文',
  target_language: '中文',
  audio_speed: 5,
  word_count_mode: 'custom',
  word_count: DEFAULT_WORD_COUNT_VALUE,
  storyboard_mode: 'custom',
  storyboard_count: 24,
  style_mode: '电影电视剧',
  person_view: 'third_person',
  clip_mode: 'smart_mix',
  mix_ratio: 40,
  help_text: '',
  type_script: 'default',
  type_script_value: '',
  narration_input_mode: 'ai',
  custom_prompt_enabled: false,
  custom_prompt_text: ''
}

const CLIP_MODE_VALUES: ClipMode[] = ['narration_only', 'original_only', 'smart_mix']
const STORYBOARD_MODE_VALUES: StoryboardMode[] = ['smart', 'custom']
const WORD_COUNT_VALUE_PATTERN = /^\d+(-\d+)?$/

const WORD_COUNT_TO_STORYBOARD: Record<string, number> = {
  '500-1000': 8,
  '800-1200': 10,
  '1000-2000': 12,
  '1000-3000': 18,
  '1000-3500': 20,
  '1500-2500': 16,
  '2000-3000': 18,
  '3000-4000': 24,
  '4000-5000': 28
}

const sanitizePersistedWordCount = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  const allowed = trimmed.replace(/[^0-9-]/g, '')
  if (!allowed) return null

  const parts = allowed.split('-').filter(Boolean)
  if (parts.length === 0) return null
  const [min, max] = parts
  if (!min) return null
  if (!max) return min
  return `${min}-${max}`
}

const clampNumber = (value: unknown, min: number, max: number, fallback: number): number => {
  const num = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number.parseFloat(value)
      : Number.NaN
  if (!Number.isFinite(num)) return fallback
  return Math.min(Math.max(num, min), max)
}

const mapWordCountToStoryboard = (wordCount: string | null): number | null => {
  if (!wordCount) return null
  const normalized = wordCount.trim()
  return WORD_COUNT_TO_STORYBOARD[normalized] ?? null
}

// ==================== 工具函数 ====================

/**
 * 创建默认配置
 * 兼容旧签名，忽略传入的视频元数据。
 */
export function createDefaultVideoConfig(_videoMetadata?: VideoMetadata | null): VideoConfig {
  return {
    ...DEFAULT_VIDEO_CONFIG
  }
}

/**
 * 验证配置
 */
export function validateVideoConfig(config: VideoConfig): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 验证音频倍速
  if (config.audio_speed < 3.5 || config.audio_speed > 6.5) {
    errors.push('音频倍速必须在 3.5-6.5 之间')
  }

  if (config.word_count_mode !== 'custom') {
    errors.push('文案字数需要使用具体的自定义数值')
  }

  if (!config.word_count || !WORD_COUNT_VALUE_PATTERN.test(config.word_count)) {
    errors.push('请填写有效的文案字数，例如 1200 或 800-1200')
  }

  if (config.storyboard_mode !== 'smart' && config.storyboard_mode !== 'custom') {
    errors.push('分镜模式无效')
  }

  if (config.storyboard_mode === 'custom') {
    const count = typeof config.storyboard_count === 'number' ? config.storyboard_count : NaN
    if (!Number.isFinite(count)) {
      errors.push('自定义分镜数不能为空')
    } else if (count < 4) {
      errors.push('分镜数至少需要 4 个')
    } else if (count > 200) {
      warnings.push('分镜数过多,可能导致视频时长过长')
    } else if (!Number.isInteger(count)) {
      warnings.push('建议使用整数分镜数,当前值会自动取整')
    }
  }

  // 验证剪辑模式
  const supportedClipModes: ClipMode[] = ['narration_only', 'original_only', 'smart_mix']
  if (!supportedClipModes.includes(config.clip_mode)) {
    errors.push('请选择有效的视频剪辑模式')
  }

  if (config.clip_mode === 'smart_mix') {
    if (config.mix_ratio < 20 || config.mix_ratio > 60) {
      errors.push('智能穿插模式下原片占比需在 20%-60% 之间')
    }
  }

  // 验证文案类型
  if (config.type_script === 'reference' || config.type_script === 'previous') {
    if (!config.type_script_value || config.type_script_value.trim().length === 0) {
      errors.push('选择参考改写或续写剧情时,必须提供具体内容')
    }
  }

  if (config.custom_prompt_enabled && (!config.custom_prompt_text || !config.custom_prompt_text.trim())) {
    errors.push('启用自定义提示词时需要填写提示内容')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

export function normalizeVideoConfigShape(rawConfig: any, fallback: VideoConfig): VideoConfig {
  if (!rawConfig || typeof rawConfig !== 'object') {
    return fallback
  }

  const clipMode: ClipMode = CLIP_MODE_VALUES.includes(rawConfig.clip_mode)
    ? rawConfig.clip_mode
    : rawConfig.is_org
      ? 'smart_mix'
      : 'narration_only'

  const sanitizedWordCount = sanitizePersistedWordCount(rawConfig.word_count)
  const storyboardFromLegacy = mapWordCountToStoryboard(sanitizedWordCount)

  const normalizedWordCount = sanitizedWordCount ?? fallback.word_count ?? DEFAULT_WORD_COUNT_VALUE

  const storyboardMode: StoryboardMode = STORYBOARD_MODE_VALUES.includes(rawConfig.storyboard_mode)
    ? rawConfig.storyboard_mode
    : (typeof rawConfig.storyboard_count === 'number' || storyboardFromLegacy)
      ? 'custom'
      : 'smart'

  const storyboardCount = storyboardMode === 'custom'
    ? clampNumber(
        typeof rawConfig.storyboard_count === 'number'
          ? rawConfig.storyboard_count
          : storyboardFromLegacy ?? 12,
        4,
        200,
        12
      )
    : null

  const mixRatio = clipMode === 'smart_mix'
    ? clampNumber(rawConfig.mix_ratio ?? rawConfig.org_ratio, 20, 60, fallback.mix_ratio)
    : 0

  const customPromptEnabled = typeof rawConfig.custom_prompt_enabled === 'boolean'
    ? rawConfig.custom_prompt_enabled
    : fallback.custom_prompt_enabled

  const customPromptText = typeof rawConfig.custom_prompt_text === 'string'
    ? rawConfig.custom_prompt_text
    : fallback.custom_prompt_text

  return {
    ...fallback,
    model_level: rawConfig.model_level === 'frame'
      ? rawConfig.model_level
      : fallback.model_level,
    source_language: rawConfig.source_language || fallback.source_language,
    target_language: rawConfig.target_language || fallback.target_language,
    audio_speed: typeof rawConfig.audio_speed === 'number' ? rawConfig.audio_speed : fallback.audio_speed,
    word_count_mode: 'custom',
    word_count: normalizedWordCount,
    storyboard_mode: storyboardMode,
    storyboard_count: storyboardCount === null ? null : Math.round(storyboardCount),
    style_mode: rawConfig.style_mode || fallback.style_mode,
    person_view: rawConfig.person_view || fallback.person_view,
    clip_mode: clipMode,
    mix_ratio: mixRatio,
    help_text: rawConfig.help_text || fallback.help_text,
    type_script: rawConfig.type_script || fallback.type_script,
    type_script_value: rawConfig.type_script_value || fallback.type_script_value,
    narration_input_mode: fallback.narration_input_mode,
    custom_prompt_enabled: customPromptEnabled,
    custom_prompt_text: customPromptText
  }
}
