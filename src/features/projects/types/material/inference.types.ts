// 推理相关类型定义

export interface FrameGroup {
  id: string
  startTime: number
  endTime: number
  frames: Frame[]
  analysis?: FrameGroupAnalysis
}

export interface Frame {
  id: string
  timestamp: number
  imageUrl: string
  analysis?: FrameAnalysis
}

export interface FrameAnalysis {
  description: string
  objects: string[]
  emotions: string[]
  colors: string[]
  confidence: number
  processingTime: number
}

export interface FrameGroupAnalysis {
  summary: string
  keyObjects: string[]
  sceneType: string
  mood: string
  contextRelevance: number
}

export interface InferenceProcessingStatus {
  isProcessing: boolean
  progress: number
  stage: InferenceStage
  error?: string
  estimatedTimeRemaining?: number
}

export type InferenceStage =
  | 'preparing'
  | 'extracting_frames'
  | 'analyzing_frames'
  | 'detecting_gaps'
  | 'merging_content'
  | 'generating_script'
  | 'post_processing'
  | 'completed'
  | 'failed'

export interface InferenceResult {
  scriptItems: any[] // 将来会从其他类型文件导入
  processingTime: number
  confidence: number
  metadata: {
    totalFrames: number
    analyzedFrames: number
    gaps: number
    inferenceMode: string
  }
}

// 普通推理参数
export interface NormalInferenceParams {
  subtitles: any[] // 字幕数据
  config: any // 配置参数
}

// 通用模式参数
export interface FrameByFrameInferenceParams {
  config: any
  frameInterval: number // 默认3秒
  framesPerGroup: number // 默认10帧
  includeSubtitles: boolean
}

// 新的素材阶段生成相关类型
export interface GenerationStatus {
  isGenerating: boolean
  progress: number
  stage: 'idle' | 'preparing' | 'analyzing' | 'processing' | 'inferencing' | 'post_processing' | 'finalizing' | 'completed' | 'failed' | 'cancelled'
  currentStep: string
  estimatedTimeRemaining: number
  error?: string
}

export interface SceneData {
  id: string
  startTime: number
  endTime: number
  description: string
  visualElements: string[]
  audioElements: string[]
}

export interface EmotionData {
  timeRange: [number, number]
  emotion: string
  confidence: number
  intensity: number
}

export interface SpeakerData {
  id: string
  name: string
  segments: Array<{
    startTime: number
    endTime: number
    confidence: number
  }>
}

export interface TranscriptionSegment {
  startTime: number
  endTime: number
  text: string
  speaker: string
  confidence: number
}

export interface GenerationResult {
  id: string
  projectId: string
  content: {
    scenes: SceneData[]
    emotions: EmotionData[]
    speakers: SpeakerData[]
    summary: string
    keyPoints: string[]
    transcription: TranscriptionSegment[]
  }
  timestamps: Array<{
    startTime: number
    endTime: number
    text: string
    confidence: number
  }>
  metadata: {
    generationTime: number
    processingDuration: number
    inferenceMode: string
    costEstimate: number
    qualityScore: number
  }
  createdAt: string
}
