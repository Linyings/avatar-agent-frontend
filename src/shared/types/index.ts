export interface VideoFile {
  file?: File
  url: string
  duration?: number
  width?: number
  height?: number
}

export interface VideoFrame {
  canvas?: HTMLCanvasElement | OffscreenCanvas  // 可选：从视频提取时有canvas
  imageUrl?: string  // 可选：从后端恢复时有imageUrl
  timestamp: number
  duration: number
  blob?: Blob
}

// 结构化帧分析数据
export interface FrameStructuredData {
  frameNumber: number
  calculatedTimestamp: number
  formattedTime: string
  picture?: string
  sceneType?: string
  keyElements?: string[]
  content?: string
  summary?: string
  [key: string]: any // 允许其他动态字段
}

// 帧分析项接口
export interface FrameAnalysisItem {
  frameNumber: number
  picture: string
  sceneType: string
  keyElements?: string[]
  visualQuality?: string
  formattedTime: string
  // 新增时间戳字段
  absoluteTimestamp: number      // 整数秒，用于排序和比较
  calculatedTimestamp: number    // 精确的浮点数时间戳
  [key: string]: any // 允许其他动态字段
}

export interface FrameAnalysisResult {
  success: boolean
  content?: string
  error?: string
  timestamp?: number
  confidence?: number
  structuredData?: FrameStructuredData | FrameStructuredData[] // 支持单个对象或数组格式
  // 保持向后兼容的字段
  summary?: string
  allAnalysisItems?: FrameAnalysisItem[] // 使用具体类型替代 any[]
}

export interface FrameGroup {
  id: string
  name: string
  startTime: number
  endTime: number
  frames: VideoFrame[]
  analysisResult?: FrameAnalysisResult
  isAnalyzing?: boolean
  isPlaceholder?: boolean
}

export interface CleanFrameGroup {
  id: string
  name: string
  startTime: number
  endTime: number
  analysisResult?: FrameAnalysisResult
  isAnalyzing?: boolean
}

export interface ExtractionSettings {
  interval: number // 提取间隔（秒）
  framesPerGroup: number // 每组帧数
  thumbnailWidth: number
  thumbnailHeight?: number
  fit?: 'fill' | 'contain' | 'cover' // 图像适配模式
}

export interface AnalysisItem {
  _id: number
  timestamp: string // 格式: "00:00:05,000-00:00:10,000" (向后兼容)
  picture: string // 画面描述
  narration: string // 旁白内容
  OST: number // 配乐状态：0=无配乐, 1=有配乐
  start_time?: number // 开始时间（毫秒）- 新格式
  end_time?: number // 结束时间（毫秒）- 新格式
  thumbnail?: string // 缩略图 base64
  audioWaveform?: number[] // 音频波形数据
}

export interface AnalysisResult {
  items: AnalysisItem[]
  totalDuration?: string
  totalSegments?: number
  processingTime?: number
}

// 字幕提取相关类型
export type SubtitleOutputFormat = 'srt' | 'json'
export type SubtitleTaskStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type SubtitleLayout = 'original_only' | 'translation_only' | 'bilingual'
export type SubtitleProvider = 'qwen3' | 'funasr'

export interface SubtitleExtractionSettings {
  provider: SubtitleProvider  // ASR 服务商：Qwen3 或 FunASR
  outputFormat?: SubtitleOutputFormat  // 内部使用，固定为 json
  needWordTimestamp: boolean
  layout?: SubtitleLayout | string
  language?: string
  enableItn?: boolean // Qwen3 引擎专用：是否启用 ITN 口语转写，默认关闭
  enableSpeakerDiarization?: boolean // FunASR 专用：是否开启说话人识别，默认开启
  speakerCount?: number // FunASR 专用：说话人数参考值
  persistToProject?: boolean // 是否在识别完成后立即保存字幕
}

// JSON 字幕项接口
export interface SubtitleJsonItem {
  start_time: number
  end_time: number
  original_subtitle: string
  translated_subtitle: string
}

// JSON 字幕内容接口
export interface SubtitleJsonContent {
  [key: string]: SubtitleJsonItem
}

export interface SubtitleTask {
  task_id: string
  status: SubtitleTaskStatus
  progress: number
  message?: string
  estimated_time?: number
  created_at?: string
  updated_at?: string
  error?: string
}

export interface SubtitleSegment {
  start: number
  end: number
  text: string
  confidence?: number
}

export interface SubtitleResult {
  success: boolean
  task_id?: string
  status?: SubtitleTaskStatus
  content?: string | SubtitleJsonContent
  segments?: SubtitleSegment[]
  output_format?: string
  processing_time?: number
  segments_count?: number
  error?: string
  isPlaceholder?: boolean
  fileInfo?: {
    filename: string
    size: number
    url: string
    lastModified: string
  }
}

// 脚本生成相关类型
export interface ScriptItem {
  _id: number

  // === 新格式字段 (AI 生成) ===
  text?: string // 解说文案片段 (若为穿插原片则为空字符串)
  start: number // 开始时间（秒，精确到小数点后两位）
  end: number // 结束时间（秒，精确到小数点后两位）
  org?: string // 穿插原片对应字幕 (若为解说片段则为空字符串)

  // === 旧格式字段 (向后兼容) ===
  timestamp?: string // 格式: "00:00:05,000-00:00:10,000" (向后兼容)
  picture?: string // 画面描述 (向后兼容)
  narration?: string // 旁白内容 (向后兼容,新格式使用 text)
  OST?: number // 0=解说, 1=原片 (向后兼容,新格式通过 text/org 判断)
  start_time?: number // 开始时间（毫秒）- AI 生成的新格式
  end_time?: number // 结束时间（毫秒）- AI 生成的新格式

  // === 配音阶段字段 ===
  audio_url?: string // R2存储的音频文件URL（配音生成后）
  audio?: string // 配音页面使用的音频字段别名
  local_audio_key?: string // 浏览器本地缓存中的音频键
  audio_storage?: 'local' | 'cloud' // 音频主要存储位置
  local_audio_missing?: boolean // 本地缓存被清理或无法恢复
  duration?: number // 配音音频时长（秒）
}

export interface ScriptGenerationResult {
  success: boolean
  items: ScriptItem[]
  processing_time?: number
  total_duration?: string
  error?: string
}

// TTS (文本转语音) 相关类型
export type ServiceLevel = 'basic' | 'premium'

export interface TTSRequest {
  model?: string
  input: string
  voice?: string
  speed?: number // 语速控制（0.8-1.4倍速，默认1.0）
  volume?: number // 音量倍数控制（0.0-2.0，默认1.0）
  referenceAudio?: File // 可选的参考音色文件
  service_level?: ServiceLevel // TTS服务等级: basic / premium
}

export interface TTSResult {
  success: boolean
  audioUrl?: string
  audioBlob?: Blob
  error?: string
  isGenerating?: boolean
  duration?: number
  text?: string
  isFromBackend?: boolean  // 标记这是从后端加载的音频
}

export interface TTSAudioState {
  [scriptItemId: number]: TTSResult
}

export interface TTSVoicePreset {
  name: string
  value: string
  description?: string
}

// 内置音色定义
export interface BuiltInVoice {
  uri: string
  name: string
  name_i18n?: Partial<Record<string, string>>
  type: 'basic' | 'advanced'
  sample_url: string
  gender?: string
  language?: string
}

// 音色配置模式
export type VoiceMode = 'builtin' | 'custom'

// TTS音色配置
export interface TTSVoiceConfig {
  mode: VoiceMode
  selectedVoiceUri?: string  // 内置音色URI
  selectedVoiceName?: string  // 内置音色名称
  selectedVoiceType?: 'basic' | 'advanced'  // 内置音色类型
  customAudioFile?: File     // 自定义音色文件
}

// 音色列表响应
export interface VoicesResponse {
  voices: BuiltInVoice[]
}

// 视频合成相关类型
export interface VideoSegment {
  id: number
  startTime: number // 秒
  endTime: number   // 秒
  hasNarration: boolean // OST === 0
  narrationText?: string
  ttsAudioUrl?: string
  ttsAudioBlob?: Blob
}

export interface CompositionProgress {
  phase: 'preparing' | 'clipping' | 'processing_audio' | 'composing' | 'finalizing'
  currentSegment: number
  totalSegments: number
  percentage: number
  message: string
  estimatedTimeRemaining?: number // 秒
}

export interface CompositionResult {
  success: boolean
  videoUrl?: string
  videoBlob?: Blob
  duration?: number
  fileSize?: number
  error?: string
}

export interface CompositionOptions {
  outputFormat: 'mp4' | 'webm' | 'mov'
  videoQuality: 'low' | 'medium' | 'high'
  audioQuality: 'low' | 'medium' | 'high'
  frameRate?: number
  backgroundMusicUrl?: string | null
  backgroundMusicVolume?: number
}

export interface VideoCompositionInput {
  originalVideoFile: VideoFile
  scriptItems: ScriptItem[]
  ttsAudioStates: TTSAudioState
  options?: CompositionOptions
}

// 时间戳校准相关类型
export interface TimestampCalibrationItem {
  _id: number
  timestamp: string
  originalDuration: number // 原视频片段时长（秒）
  audioDuration: number // 音频实际时长（秒）
  difference: number // 时长差异（秒）
  needsCalibration: boolean // 是否需要校准
}

export interface CalibrationResult {
  hasItemsToCalibrate: boolean
  items: TimestampCalibrationItem[]
  totalDifference: number // 总时长差异
}

export interface CalibrationOptions {
  toleranceSeconds: number // 容忍的时长差异阈值（秒）
  autoAdjustSubsequent: boolean // 是否自动调整后续片段时间
}

// 素材页面配置相关类型
export type InferenceMode = 'standard' | 'full'
export type ModelLevel = 'basic' | 'advanced' | 'full_perception'

export interface InferenceModeOption {
  id: InferenceMode
  name: string
  description: string
  icon?: string
  color?: string
}

export interface ModelLevelOption {
  id: ModelLevel
  name: string
  description: string
  icon?: string
  color?: string
}

// 项目配置相关类型
export interface ProjectInferenceConfig {
  model_level: ModelLevel
  model_options: ModelLevel[]
  model_descriptions: Record<ModelLevel, string>
}

export interface ProjectLanguageConfig {
  source_language: string
  target_language: string
  supported_languages: string[]
}

export interface NarrationStyleOption {
  id: string
  name: string
  category: 'universal' | 'character_focused' | 'emotional' | 'scene_based' | 'genre_specific'
  description?: string
}

export interface ProjectNarrationConfig {
  source: 'ai_generated' | 'custom_script'
  source_options: string[]
  custom_script_text?: string

  person_view: 'first_person' | 'third_person'
  person_view_options: string[]

  word_count_mode: 'auto' | 'custom'
  word_count_options: string[]
  custom_word_count?: number

  style_mode: string
  style_options: NarrationStyleOption[]
}

// 视频剪辑配置接口
export interface ProjectVideoConfig {
  narration_type: 'full_narration' | 'mixed' | 'original_only'
  narration_type_options: string[]
  original_footage_ratio: number
  ratio_range: {
    min: number
    max: number
  }
}

// 自定义提示词配置接口
export interface ProjectCustomPromptConfig {
  enabled: boolean
  prompt_text: string
}

// 视频元数据接口
export interface VideoMetadata {
  file_size: number          // 文件大小,单位 MB
  duration_seconds: number   // 视频时长，单位秒
  resolution: string         // 视频分辨率 (如 "720 x 1280")
  aspect_ratio: string       // 宽高比 (如 "9 x 16")
}

// 完整的项目配置JSON接口
export interface ProjectConfigJSON {
  version: string
  project_name: string
  video_metadata?: VideoMetadata  // 新增：视频元数据
  inference_config: ProjectInferenceConfig
  language_config: ProjectLanguageConfig
  narration_config: ProjectNarrationConfig
  video_config: ProjectVideoConfig
  custom_prompt: ProjectCustomPromptConfig
}

// 新增：UI配置状态接口（用于React组件状态管理）
export interface DocumentConfigState {
  version: string
  project_name: string
  video_metadata?: VideoMetadata  // 新增：视频元数据
  inference_config: ProjectInferenceConfig
  language_config: ProjectLanguageConfig
  narration_config: ProjectNarrationConfig
  video_config: ProjectVideoConfig
  custom_prompt: ProjectCustomPromptConfig
}

// 新增：配置动作类型
export type DocumentConfigAction =
  | { type: 'SET_PROJECT_NAME'; payload: string }
  | { type: 'SET_VERSION'; payload: string }
  | { type: 'SET_VIDEO_METADATA'; payload: VideoMetadata }  // 新增：视频元数据动作
  | { type: 'SET_INFERENCE_CONFIG'; payload: ProjectInferenceConfig }
  | { type: 'SET_LANGUAGE_CONFIG'; payload: ProjectLanguageConfig }
  | { type: 'SET_NARRATION_CONFIG'; payload: ProjectNarrationConfig }
  | { type: 'SET_VIDEO_CONFIG'; payload: ProjectVideoConfig }
  | { type: 'SET_CUSTOM_PROMPT'; payload: ProjectCustomPromptConfig }
  | { type: 'RESET_CONFIG' }
  | { type: 'LOAD_CONFIG'; payload: Partial<DocumentConfigState> }

export interface LanguageConfig {
  input: string
  output: string
  crossLanguage: boolean
}

export interface LanguageOption {
  code: string
  name: string
  flag?: string
}

export type LengthControlMode = 'auto' | 'concise' | 'standard' | 'detailed' | 'custom'

export interface LengthControlConfig {
  mode: LengthControlMode
  customValue?: number
}

export interface CopywritingConfig {
  perspective: 'first' | 'third'
  lengthControl: LengthControlConfig
  style: 'engaging' | 'formal' | 'casual' | 'creative'
  tone: 'friendly' | 'serious' | 'humorous' | 'neutral'
  complexity: 'simple' | 'medium' | 'complex'
  length: 'short' | 'moderate' | 'long'
}

export type ClipStrategy = 'smart' | 'uniform' | 'climax' | 'dialogue'
export type NarrationType = 'full_narration' | 'mixed' | 'original_only'

export interface NarrationModeConfig {
  type: NarrationType // 解说范围：全程解说或混合模式
  originalFootageRatio: number // 原片穿插比例：0-50
}

export interface OriginalClipConfig {
  ratio: number // 0-50
  strategy: ClipStrategy
}

export interface NarrationStyleConfig {
  general: string
  specific: string
  opening: string
}

export interface CustomPromptConfig {
  enabled: boolean
  content?: string
  templates?: string[]
  history?: string[]
}

// 主要的素材配置接口
export interface MaterialConfig {
  // 推理配置
  inference: {
    mode: InferenceMode
  }

  // 语言配置
  language: LanguageConfig

  // 文案配置
  copywriting: CopywritingConfig

  // 解说模式配置
  narrationMode: NarrationModeConfig

  // 原片穿插（保留向后兼容）
  originalClip: OriginalClipConfig

  // 解说风格
  narrationStyle: NarrationStyleConfig

  // 自定义提示词
  customPrompt?: CustomPromptConfig
}

// 配置预设
export interface MaterialConfigPreset {
  id: string
  name: string
  description?: string
  config: MaterialConfig
  createdAt: string
  isDefault?: boolean
}

// 素材准备阶段的数据
export interface MaterialData {
  videoFile: VideoFile
  subtitleResult?: SubtitleResult
  config: MaterialConfig
  preset?: MaterialConfigPreset
  configJSON?: ProjectConfigJSON  // 完整的项目配置JSON
}

// UX重构：创作意图相关类型
export type CreativeIntentType = 'movie' | 'educational' | 'entertainment' | 'gaming' | 'smart' | 'custom'

export interface CreativeIntent {
  id: CreativeIntentType
  title: string
  subtitle: string
  description: string
  icon: string
  color: string
  preset: MaterialConfig
  examples: string[]
  features: string[]
}

// 视频智能分析结果
export interface VideoAnalysis {
  videoType: 'movie' | 'tv_show' | 'short_video' | 'documentary' | 'animation' | 'game' | 'other'
  language: string
  duration: number
  dialogueDensity: 'low' | 'medium' | 'high'  // 对话密集度
  paceRhythm: 'slow' | 'medium' | 'fast'      // 画面节奏
  complexity: 'simple' | 'medium' | 'complex'  // 内容复杂度
  hasMusic: boolean
  hasCaptions: boolean
  recommendedIntent: CreativeIntentType
  confidence: number
}

// 快速调整参数
export interface QuickAdjustment {
  narrativeDensity: number    // 解说密度 0-100
  style: 'professional' | 'casual' | 'humorous'  // 风格调性
  audience: 'general' | 'young' | 'professional' | 'children'  // 目标观众
}

// 向导步骤 - 优化为三步流程
export type WizardStep = 'upload' | 'configure' | 'generate'

export interface WizardState {
  currentStep: WizardStep
  videoFile?: VideoFile
  subtitleResult?: SubtitleResult
  videoAnalysis?: VideoAnalysis
  selectedIntent?: CreativeIntent
  quickAdjustment?: QuickAdjustment
  finalConfig?: MaterialConfig
  projectConfigJSON?: ProjectConfigJSON  // 完整的项目配置JSON
}

// 支持旧的类型别名以保持向后兼容
export type ProjectConfig = ProjectConfigJSON

// 配置模式和技术相关类型
export interface GenerationModeConfig {
  analysisDepth: 'shallow' | 'balanced' | 'deep'
  creativityLevel: 'conservative' | 'moderate' | 'creative'
  processingSpeed: 'fast' | 'standard' | 'thorough'
}

export interface TechniqueConfig {
  transitionStyle: 'smooth' | 'sharp' | 'creative'
  emphasisLevel: 'subtle' | 'moderate' | 'strong'
  paceControl: 'fixed' | 'adaptive' | 'dynamic'
}

export interface TimingControlConfig {
  segmentDuration: 'auto' | 'short' | 'medium' | 'long'
  pauseLength: 'minimal' | 'natural' | 'extended'
  speedAdjustment: number
}

export interface ContentControlConfig {
  includeIntro: boolean
  includeConclusion: boolean
  keyPointEmphasis: boolean
  redundancyReduction: boolean
}

// 导出音频相关类型
export * from './audio'
