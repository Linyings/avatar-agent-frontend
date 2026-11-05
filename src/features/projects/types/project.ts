// 项目管理相关类型定义
import type {
  SubtitleResult,
  FrameAnalysisResult,
  CleanFrameGroup,
  ProjectNarrationConfig
} from '@/shared/types'
import type { ProjectInferenceMode } from './material/videoConfig.types'

export interface ProjectMetadata {
  language?: string
  inference_mode?: ProjectInferenceMode
  auto_name_from_video?: boolean
  source_video_filename?: string | null
  frame_inference_config?: Record<string, unknown>
  [key: string]: unknown
}

// video_context 类型定义（与API示例保持一致）
export interface VideoContext {
  items: {
    [key: string]: {
      id?: string
      start_time: number
      end_time: number
      subtitle: string
      visual: string
      speaker_id?: number | string
    }
  }
  total_segments: number
  subtitle_segments: number
  visual_segments: number
  merged_at: number
  narrative_context?: unknown
  narrative_updated_at?: string
}

export type ProjectStatus = 'draft' | 'processing' | 'completed' | 'archived'
export type ProjectStage = 'material' | 'analysis' | 'dubbing'
export type FileType = 'srt' | 'frames' | 'frame-descriptions' | 'ai-script' | 'narration'
export type ProjectArtifactStorage = 'opfs' | 'local' | 'remote' | 'cloud'

export type FrameWorkflowStepKey =
  | 'step_0_created'
  | 'step_1_merge_videos'
  | 'step_2_extract_audio'
  | 'step_3_transcribe'
  | 'step_4_validate_subtitles'
  | 'step_5_decide_timeline_view'
  | 'step_6_generate_timeline_images'
  | 'step_7_analyze_timeline_images'
  | 'step_8_understand_narrative'
  | 'step_9_merge_video_context'
  | 'step_10_generate_narration_script'
  | 'step_10_match_narration_visuals'
  | 'step_11_generate_voiceover'
  | 'step_12_compose_final_video'
  | 'step_13_persist_project'
  | 'step_14_completed'

export type FrameWorkflowStepId =
  | 'merge-videos'
  | 'extract-audio'
  | 'transcribe'
  | 'validate-subtitles'
  | 'decide-timeline-view'
  | 'generate-timeline-images'
  | 'analyze-timeline-images'
  | 'understand-narrative'
  | 'merge-video-context'
  | 'generate-narration-script'
  | 'match-narration-visuals'
  | 'generate-voiceover'
  | 'compose-final-video'
  | 'persist-project'

export interface ProjectArtifact {
  storage: ProjectArtifactStorage
  key: string
  name: string
  type: string
  size: number
  duration?: number | null
  missing?: boolean
  updated_at: string
}

export interface ProjectArtifacts {
  source_video?: ProjectArtifact | null
  final_video?: ProjectArtifact | null
  preview_image?: ProjectArtifact | null
  [key: string]: ProjectArtifact | null | undefined
}

export type ProjectWorkflowStepStatus = 'idle' | 'running' | 'success' | 'error' | 'skipped' | 'cancelled'

export interface ProjectWorkflowStepState {
  status?: ProjectWorkflowStepStatus
  progress?: Record<string, unknown>
  started_at?: string
  completed_at?: string
  updated_at?: string
  duration_ms?: number
  summary?: Record<string, unknown>
  error?: string | null
  [key: string]: unknown
}

export interface ProjectWorkflowStage<T = unknown> {
  data?: T
  updated_at?: string
  summary?: Record<string, unknown>
  [key: string]: unknown
}

export interface ProjectWorkflow {
  mode: ProjectInferenceMode
  status: ProjectStatus | 'idle' | 'active'
  current_step: FrameWorkflowStepKey
  current_step_id?: FrameWorkflowStepId | null
  current_step_index: number
  revision: number
  steps: Partial<Record<FrameWorkflowStepKey, ProjectWorkflowStepState>>
  stages: {
    source_video?: ProjectWorkflowStage
    subtitles?: ProjectWorkflowStage<any>
    config?: ProjectWorkflowStage<any>
    script?: ProjectWorkflowStage<any>
    voiceover?: ProjectWorkflowStage
    final_video?: ProjectWorkflowStage
    [key: string]: ProjectWorkflowStage | undefined
  }
  [key: string]: unknown
}

export interface SubtitleVisualData {
  subtitle_result?: SubtitleResult | null
  frame_descriptions?: {
    items?: Array<{
      id: string
      name: string
      startTime: number
      endTime: number
      frameCount?: number
      analysisResult?: FrameAnalysisResult | null
    }>
    [key: string]: unknown
  } | null
  frame_groups?: CleanFrameGroup[]
  summary?: Record<string, unknown>
  last_updated_at?: string
}

// 基础项目类型
export interface Project {
  id: string
  owner_id: string
  name: string
  description?: string
  thumbnail_url?: string
  is_public?: boolean
  tags?: string[]
  status: ProjectStatus
  created_at: string
  updated_at: string
  workflow: ProjectWorkflow
  artifacts: ProjectArtifacts
  metadata: ProjectMetadata
}

// 项目详情类型（包含协作信息）
export interface ProjectDetail extends Project {
  collaborator_count: number
  user_role?: string
  user_permissions: string[]
  detailed_metadata?: Record<string, any>
}

// 项目创建请求
export interface ProjectCreateRequest {
  name: string
  description?: string
  thumbnail_url?: string
  is_public?: boolean
  tags?: string[]
  workflow?: Partial<ProjectWorkflow>
  artifacts?: ProjectArtifacts
  metadata?: ProjectMetadata
}

// 项目更新请求
export interface ProjectUpdateRequest {
  name?: string
  description?: string
  thumbnail_url?: string
  is_public?: boolean
  tags?: string[]
  status?: ProjectStatus
  workflow?: ProjectWorkflow
  artifacts?: ProjectArtifacts
  metadata?: ProjectMetadata
}

export interface ProjectSubtitleItem {
  start_time: number  // 秒（保留小数，如 0.13, 1.05）
  end_time: number    // 秒（保留小数，如 0.13, 1.05）
  subtitle: string
  [key: string]: unknown
}

// 项目查询参数
export interface ProjectQueryParams {
  q?: string
  status?: ProjectStatus
  is_public?: boolean
  tags?: string[]
  created_after?: string
  created_before?: string
  limit?: number
  offset?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

// 项目列表响应
export interface ProjectListResponse {
  projects: Project[]
  items?: Project[]
  total: number
  page: number
  limit: number
  has_more: boolean
}

// 消息响应
export interface MessageResponse {
  message: string
  success?: boolean
}

// 视频文件句柄信息
export interface VideoFileHandleInfo {
  name: string
  size: number
  type: string
  lastModified: number
  duration?: number
  width?: number
  height?: number
  hasFileHandle?: boolean // 是否有文件句柄
  accessStatus?: 'granted' | 'denied' | 'prompt' | 'unavailable' // 文件访问状态
}

// 阶段数据类型
export interface MaterialData {
  videoFile?: any
  videoFileHandle?: VideoFileHandleInfo // 新增：文件句柄信息
  frameGroups?: any[]
  subtitleResult?: any
  frameDescriptions?: any
  extractedFrames?: any[]
  analysisResults?: any[]
  configuration?: any // 新增：素材配置信息
  generationResult?: any // 新增：生成结果
}

export interface AnalysisData {
  analyzedGroups?: any[]
  sceneDescriptions?: any[]
  analysisResults?: any[]
  subtitleLines?: any[]
  
  // 新增属性以匹配实际使用
  script_data?: any
  analysis_completed?: boolean
  analysis_date?: string
  narration_config?: ProjectNarrationConfig | null
}

export interface ScriptData {
  items?: any[]
  audioStates?: Record<string, any>
  compositionSettings?: Record<string, any>
  
  // 新增属性以匹配实际使用
  narration_script?: string
  voice_settings?: {
    voice_id: string
    speed: number
    pitch: number
  }
  audio_files?: Array<{
    id: string
    name: string
    url: string
    duration: number
  }>
  script_generated?: boolean
  script_date?: string
  audio_generated?: boolean
  audio_date?: string
}

// 文件上传响应类型
export interface FileUploadResponse {
  success: boolean
  message?: string
  file_url?: string
  audio_url?: string  // 用于解说音频上传
  item_id?: string
  filename?: string
  file_size?: number
  duration?: number
  updated?: boolean
}

// 预签名URL响应
export interface PresignedUrlResponse {
  url: string
  expires_at: string
}

// 项目阶段状态
export interface StageStatus {
  material: {
    completed: boolean
    hasVideo: boolean
    hasFrames: boolean
    hasSubtitles: boolean
    hasAnalysis: boolean
    hasNarrationAudios: boolean
    hasConfiguration?: boolean  // 新增：是否有配置信息
    hasGenerationResult?: boolean  // 新增：是否有生成结果
  }
  analysis: {
    completed: boolean
    hasSceneAnalysis: boolean
    hasAiScript: boolean
  }
  dubbing: {
    completed: boolean
    hasScriptItems: boolean
    hasAudioFiles: boolean
    hasOutputVideo: boolean
  }
}

// 项目上下文状态类型
export interface ProjectContextState {
  currentProject: Project | null
  projectDetail: ProjectDetail | null
  materialData: MaterialData | null
  analysisData: AnalysisData | null
  scriptData: ScriptData | null
  stageStatus: StageStatus | null
  isLoading: boolean
  isSaving: boolean
  lastSaved: Date | null
  error: string | null
}

// 音频清单相关类型定义
// 项目内容类型枚举
export type ProjectContentType = 'srt' | 'frame_descriptions' | 'ai_script'

// 项目内容获取响应
export interface ProjectContentResponse {
  content: any                     // 文件内容
  content_type: string             // MIME 类型
  last_modified?: string           // 最后修改时间
  etag?: string                    // ETag 用于缓存
}
