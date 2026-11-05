// 素材阶段状态管理相关类型

export const MaterialStageStep = {
  VIDEO_UPLOAD: 'video_upload' as const,      // 视频上传与预处理
  CONFIGURATION: 'configuration' as const,     // 解说参数配置
  GENERATION: 'generation' as const            // 生成解说
} as const

export type MaterialStageStep = typeof MaterialStageStep[keyof typeof MaterialStageStep]

export interface MaterialStageState {
  currentStep: MaterialStageStep
  isFirstEntry: boolean
  completedSteps: MaterialStageStep[]

  // 步骤状态
  videoUpload: {
    completed: boolean
    hasVideo: boolean
    hasSubtitles: boolean
    error?: string
  }

  configuration: {
    completed: boolean
    hasConfig: boolean
    error?: string
  }

  generation: {
    completed: boolean
    hasScript: boolean
    isProcessing: boolean
    error?: string
  }
}