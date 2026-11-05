// 字幕处理服务
import type {
  SubtitleExtractionResult,
  SubtitleExtractionSettings,
  SubtitleGap,
  SubtitleProcessingStatus,
  SubtitleSegment,
  VideoFile
} from '../../types/material'
import { buildSubtitleExtractionResult, buildSubtitlePayload, type SubtitleTaskResponse } from '../../utils/subtitleTransform'
import { createAudioFileFromVideo } from '../../utils/audioExtractor'
import ProjectService from '../projectService'
import { authenticatedFetch } from '@/features/auth/services/authService'
import { dashscopeTempFileService } from '@/shared/services/dashscopeTempFileService'

const POLL_INTERVAL = 3000
const MAX_POLL_ATTEMPTS = 60

type UploadedAudioResource = {
  audioUrl: string
}

type HostedAsrProvider = 'qwen3' | 'funasr'
type Qwen3TaskStatus = 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'
type HostedAsrTaskStatus = Qwen3TaskStatus | 'RUNNING'

type Qwen3SubmitResponse = {
  success?: boolean
  task_id?: string
  status?: HostedAsrTaskStatus | string
  message?: string
}

type Qwen3TaskResponse = {
  success?: boolean
  task_id?: string
  status?: HostedAsrTaskStatus | string
  progress?: number
  message?: string
  error?: string
  content?: Record<string, { start_time?: number; end_time?: number; subtitle?: string; speaker_id?: number | string }>
  processing_time?: number
}

type HostedAsrProfile = {
  provider: HostedAsrProvider
  label: string
  submitPath: string
  queryPath: string
  submitMessage: string
  queuedMessage: string
  processingMessage: string
  timeoutMessage: string
  authenticationMessage: string
  buildRequestBody: (audioUrl: string, settings: SubtitleExtractionSettings) => Record<string, unknown>
}

// 后端 API
const BACKEND_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export class SubtitleService {
  private static instance: SubtitleService

  static getInstance(): SubtitleService {
    if (!SubtitleService.instance) {
      SubtitleService.instance = new SubtitleService()
    }
    return SubtitleService.instance
  }

  /**
   * 提取字幕（支持 Qwen3 和 FunASR）
   */
  async extractSubtitles(
    videoFile: VideoFile,
    projectId: string,
    settings: SubtitleExtractionSettings,
    onProgress?: (status: SubtitleProcessingStatus) => void
  ): Promise<SubtitleExtractionResult> {
    if (!videoFile?.file) {
      throw new Error('未找到可用于识别的原始视频文件')
    }

    if (!projectId) {
      throw new Error('缺少项目ID，无法进行字幕提取')
    }

    const provider: HostedAsrProvider = settings.provider === 'qwen3' ? 'qwen3' : 'funasr'
    console.log('[SubtitleService] 使用托管 ASR 服务:', provider)
    return await this.extractSubtitlesWithHostedAPI(
      provider,
      videoFile,
      projectId,
      settings,
      onProgress
    )
  }

  /**
   * 使用托管语音识别引擎提取字幕
   */
  private async extractSubtitlesWithHostedAPI(
    provider: HostedAsrProvider,
    videoFile: VideoFile,
    projectId: string,
    settings: SubtitleExtractionSettings,
    onProgress?: (status: SubtitleProcessingStatus) => void
  ): Promise<SubtitleExtractionResult> {
    const profile = this.getHostedAsrProfile(provider)

    try {
      const audioResource = await this.prepareHostedAudioResource(provider, videoFile, projectId, onProgress)

      onProgress?.({
        isProcessing: true,
        progress: 30,
        stage: 'transcribing',
        message: profile.submitMessage
      })

      const taskId = await this.submitHostedTranscriptionTask(profile, audioResource.audioUrl, settings)

      onProgress?.({
        isProcessing: true,
        progress: 35,
        stage: 'transcribing',
        message: profile.queuedMessage
      })

      const taskResult = await this.pollHostedTaskStatus(profile, taskId, settings, onProgress)

      const extraction = buildSubtitleExtractionResult(taskResult, {
        language: settings.language,
        fallbackText: 'subtitle'
      })

      if (!extraction) {
        throw new Error('字幕内容为空，请稍后重试')
      }

      if (settings.persistToProject !== false) {
        const subtitlePayload = buildSubtitlePayload(extraction.segments)

        try {
          await ProjectService.saveProjectSubtitles(projectId, subtitlePayload)
        } catch (saveError) {
          const message = saveError instanceof Error ? saveError.message : '项目字幕保存失败'
          throw new Error(`字幕保存失败: ${message}`)
        }
      }

      onProgress?.({
        isProcessing: false,
        progress: 100,
        stage: 'completed',
        message: '字幕识别完成'
      })

      return extraction
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `${profile.label} 字幕提取失败`
      throw new Error(errorMessage)
    }
  }

  /**
   * 识别字幕间隙
   */
  async detectSubtitleGaps(
    segments: SubtitleSegment[],
    totalDuration: number
  ): Promise<SubtitleGap[]> {
    const gaps: SubtitleGap[] = []

    for (let i = 0; i < segments.length - 1; i++) {
      const currentEnd = segments[i].endTime
      const nextStart = segments[i + 1].startTime

      if (nextStart - currentEnd > 1) {
        gaps.push({
          startTime: currentEnd,
          endTime: nextStart,
          duration: nextStart - currentEnd,
          type: 'silence'
        })
      }
    }

    if (segments.length > 0 && segments[0].startTime > 1) {
      gaps.unshift({
        startTime: 0,
        endTime: segments[0].startTime,
        duration: segments[0].startTime,
        type: 'silence'
      })
    }

    const lastSegment = segments[segments.length - 1]
    if (lastSegment && totalDuration - lastSegment.endTime > 1) {
      gaps.push({
        startTime: lastSegment.endTime,
        endTime: totalDuration,
        duration: totalDuration - lastSegment.endTime,
        type: 'silence'
      })
    }

    return gaps
  }

  /**
   * 格式化字幕为SRT格式
   */
  formatToSRT(segments: SubtitleSegment[]): string {
    return segments
      .map((segment, index) => {
        const startTime = this.formatTime(segment.startTime)
        const endTime = this.formatTime(segment.endTime)
        return `${index + 1}\n${startTime} --> ${endTime}\n${segment.text}\n`
      })
      .join('\n')
  }

  private async prepareHostedAudioResource(
    provider: HostedAsrProvider,
    videoFile: VideoFile,
    projectId: string,
    onProgress?: (status: SubtitleProcessingStatus) => void
  ): Promise<UploadedAudioResource> {
    const audioFile = await this.generateAudioFile(videoFile, onProgress)
    const uploadResult = await this.uploadAudioToDashScope(audioFile, provider, projectId)

    onProgress?.({
      isProcessing: true,
      progress: 20,
      stage: 'transcribing',
      message: '音频上传完成，准备提交识别'
    })

    return uploadResult
  }

  /**
   * 上传音频文件到 DashScope 临时存储（百炼专用）
   */
  private async uploadAudioToDashScope(
    audioFile: File,
    provider: HostedAsrProvider,
    projectId: string,
    onProgress?: (percent: number) => void
  ): Promise<UploadedAudioResource> {
    try {
      console.log('[SubtitleService] 开始上传音频到 DashScope 临时存储:', {
        fileName: audioFile.name,
        fileSize: audioFile.size,
        fileType: audioFile.type,
        provider,
        projectId
      })

      const result = await dashscopeTempFileService.uploadAudioFile(audioFile, provider, (percent) => {
        console.log(`[SubtitleService] DashScope 临时上传进度: ${percent}%`)
        onProgress?.(percent)
      })

      console.log('[SubtitleService] 文件已上传到 DashScope 临时存储:', {
        objectKey: result.objectKey,
        ossUrl: result.ossUrl,
        provider
      })

      return {
        audioUrl: result.ossUrl
      }
    } catch (error) {
      console.error('[SubtitleService] DashScope 临时上传失败:', error)
      throw new Error(
        `上传音频到 DashScope 临时存储失败: ${error instanceof Error ? error.message : '未知错误'}`
      )
    }
  }

  /**
   * 获取托管 ASR 引擎配置
   */
  private getHostedAsrProfile(provider: HostedAsrProvider): HostedAsrProfile {
    if (provider === 'funasr') {
      return {
        provider,
        label: 'FunASR',
        submitPath: '/api/v1/tools/funasr/asr/submit',
        queryPath: '/api/v1/tools/funasr/asr/query',
        submitMessage: '正在提交 FunASR 识别任务',
        queuedMessage: 'FunASR 已接收音频，正在执行短字幕切分和说话人识别',
        processingMessage: 'FunASR 正在识别音频并区分说话人',
        timeoutMessage: 'FunASR 字幕识别任务超时，请稍后重试',
        authenticationMessage: '未登录，请先登录后再使用 FunASR 识别服务',
        buildRequestBody: (audioUrl, settings) => ({
          file_url: audioUrl,
          channel_id: [0],
          diarization_enabled: settings.enableSpeakerDiarization ?? true,
          ...(typeof settings.speakerCount === 'number' ? { speaker_count: settings.speakerCount } : {})
        })
      }
    }

    return {
      provider,
      label: 'Qwen3',
      submitPath: '/api/v1/tools/qwen3/asr/submit',
      queryPath: '/api/v1/tools/qwen3/asr/query',
      submitMessage: '正在提交 Qwen3 识别任务',
      queuedMessage: 'Qwen3 引擎已排队处理音频',
      processingMessage: 'Qwen3 引擎正在识别音频',
      timeoutMessage: 'Qwen3 字幕识别任务超时，请稍后重试',
      authenticationMessage: '未登录，请先登录后再使用 Qwen3 识别服务',
      buildRequestBody: (audioUrl, settings) => ({
        file_url: audioUrl,
        language: settings.language ?? 'zh',
        enable_itn: settings.enableItn ?? false,
        channel_id: [0]
      })
    }
  }

  /**
   * 提交托管转录任务
   */
  private async submitHostedTranscriptionTask(
    profile: HostedAsrProfile,
    audioUrl: string,
    settings: SubtitleExtractionSettings
  ): Promise<string> {
    const response = await authenticatedFetch(`${BACKEND_API_BASE_URL}${profile.submitPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(profile.buildRequestBody(audioUrl, settings))
    }, {
      missingTokenMessage: profile.authenticationMessage
    })

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('认证失败，请重新登录')
      }
      const message = await safeReadError(response)
      throw new Error(`提交 ${profile.label} 识别任务失败：${message}`)
    }

    const result = (await response.json()) as Qwen3SubmitResponse

    if (!result.task_id) {
      throw new Error(result.message || `服务器未返回 ${profile.label} 任务 ID`)
    }

    return result.task_id
  }

  private async generateAudioFile(
    videoFile: VideoFile,
    onProgress?: (status: SubtitleProcessingStatus) => void
  ): Promise<File> {
    if (!videoFile?.file) {
      throw new Error('无法访问本地视频文件，请重新上传或重新选择文件')
    }

    onProgress?.({
      isProcessing: true,
      progress: 5,
      stage: 'analyzing',
      message: '正在准备音频资源'
    })

    const audioFile = await createAudioFileFromVideo(videoFile.file, {
      onProgress: (value) => {
        onProgress?.({
          isProcessing: true,
          progress: 5 + Math.round(value * 15),
          stage: 'analyzing',
          message: `正在提取音频 (${Math.round(value * 100)}%)`
        })
      }
    })

    onProgress?.({
      isProcessing: true,
      progress: 20,
      stage: 'transcribing',
      message: '音频提取完成，准备上传音频'
    })

    return audioFile
  }

  private async pollHostedTaskStatus(
    profile: HostedAsrProfile,
    taskId: string,
    settings: SubtitleExtractionSettings,
    onProgress?: (status: SubtitleProcessingStatus) => void
  ): Promise<SubtitleTaskResponse> {
    let attempts = 0
    let completedWithoutContentAttempts = 0

    while (attempts < MAX_POLL_ATTEMPTS) {
      if (attempts > 0) {
        await this.delay(POLL_INTERVAL)
      }

      const response = await authenticatedFetch(`${BACKEND_API_BASE_URL}${profile.queryPath}/${taskId}`, {}, {
        missingTokenMessage: profile.authenticationMessage
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('认证失败，请重新登录')
        }
        const message = await safeReadError(response)
        throw new Error(`查询 ${profile.label} 字幕任务失败：${message}`)
      }

      const result = (await response.json()) as Qwen3TaskResponse
      const normalizedStatus = (result.status ?? '').toUpperCase() as HostedAsrTaskStatus | string

      if (normalizedStatus === 'FAILED') {
        throw new Error(result.error || result.message || `${profile.label} 字幕识别任务失败`)
      }

      if (typeof result.progress === 'number') {
        const normalizedProgress = Math.min(95, Math.max(35, 35 + result.progress * 0.5))
        onProgress?.({
          isProcessing: true,
          progress: normalizedProgress,
          stage: 'transcribing',
          message: result.message || profile.processingMessage
        })
      }

      if (normalizedStatus === 'SUCCEEDED') {
        if (result.content && Object.keys(result.content).length > 0) {
          onProgress?.({
            isProcessing: true,
            progress: 95,
            stage: 'post_processing',
            message: '识别完成，正在整理字幕片段'
          })

          return {
            success: result.success ?? true,
            status: 'completed',
            task_id: result.task_id ?? taskId,
            content: result.content,
            processing_time: result.processing_time,
            language: settings.language ?? 'zh'
          }
        }

        completedWithoutContentAttempts += 1
        if (completedWithoutContentAttempts >= 5) {
          throw new Error(`${profile.label} 字幕识别任务完成但未返回内容，请稍后重试`)
        }
      }

      attempts += 1
    }

    throw new Error(profile.timeoutMessage)
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 1000)

    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms
      .toString()
      .padStart(3, '0')}`
  }
}

export default SubtitleService.getInstance()

const safeReadError = async (response: Response): Promise<string> => {
  try {
    const text = await response.text()
    return text || `${response.status}`
  } catch (_error) {
    return `${response.status}`
  }
}
