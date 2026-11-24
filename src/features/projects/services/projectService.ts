import type { ProjectNarrationConfig } from '@/shared/types'
import { localAssetStorageService } from '@/shared/services/localAssetStorageService'
import { cleanupDeletedProjectLocalData } from './projectLocalCleanup'
// 项目管理服务层，封装所有项目相关的API调用
import type {
  Project,
  ProjectCreateRequest,
  ProjectUpdateRequest,
  ProjectQueryParams,
  ProjectListResponse,
  MessageResponse,
  SubtitleVisualData,
  VideoContext,
  ProjectArtifacts,
  ProjectMetadata,
  ProjectWorkflow,
  FrameWorkflowStepKey,
  ProjectSubtitleItem,
} from '../types/project'
import { authenticatedFetch, tokenManager } from '@/features/auth/services/authService'
import { fetchWithRetry } from '@/shared/utils/network'

// The local web deployment proxies /api to the local backend. An unset Vite
// variable becomes undefined at build time, which must not become part of a
// request URL such as /undefined/api/v1/projects/.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
const R2_BASE_URL = import.meta.env.VITE_R2_BASE_URL
const STORE_AUDIO_BASE_URL = 'https://store.narratoai.cn'

const buildDevMediaProxyUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url)
    const pathAndQuery = `${parsed.pathname}${parsed.search}`

    if (R2_BASE_URL && url.startsWith(R2_BASE_URL)) {
      return url.replace(R2_BASE_URL, '/api/r2-proxy')
    }

    if (parsed.origin === STORE_AUDIO_BASE_URL) {
      return `/api/store-proxy${pathAndQuery}`
    }
  } catch {
    return null
  }

  return null
}

const buildBackendMediaProxyUrl = (url: string) => (
  `${API_BASE_URL}/api/v1/tools/media-proxy?url=${encodeURIComponent(url)}`
)

type ProjectMediaDownloadOptions = {
  mediaLabel: string
  defaultContentType: string
  timeoutMs?: number
}

const downloadProjectMediaFile = async (
  url: string,
  {
    mediaLabel,
    defaultContentType,
    timeoutMs = 30_000,
  }: ProjectMediaDownloadOptions
): Promise<Blob> => {
  const fetchMedia = async (targetUrl: string, init?: RequestInit) => fetchWithRetry(targetUrl, init, {
    timeoutMs,
    maxRetries: 3
  })
  const candidateUrls = [
    import.meta.env.DEV ? buildDevMediaProxyUrl(url) : null,
    url,
    API_BASE_URL ? buildBackendMediaProxyUrl(url) : null,
  ].filter((item): item is string => Boolean(item))
  let lastError: unknown

  for (const candidateUrl of candidateUrls) {
    const isBackendProxy = candidateUrl.includes('/api/v1/tools/media-proxy')

    try {
      const response = isBackendProxy
        ? await authenticatedFetch(candidateUrl, {
            signal: AbortSignal.timeout(timeoutMs),
          })
        : await fetchMedia(candidateUrl)
      const contentType = response.headers.get('Content-Type') || defaultContentType

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        console.error(`❌ ${mediaLabel}下载失败:`, {
          status: response.status,
          statusText: response.statusText,
          contentType,
          url,
          candidateUrl,
          errorPreview: errorText.substring(0, 200)
        })
        throw new Error(`下载${mediaLabel}文件失败: ${response.status} ${response.statusText}`)
      }

      if (contentType.toLowerCase().includes('text/html')) {
        const htmlContent = await response.text().catch(() => '')
        console.error(`❌ 返回了 HTML 页面而不是${mediaLabel}文件:`, {
          contentType,
          size: htmlContent.length,
          preview: htmlContent.substring(0, 200),
          url,
          candidateUrl
        })
        throw new Error(`${mediaLabel}文件不存在或返回了 HTML 内容`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const blob = new Blob([arrayBuffer], { type: contentType })

      console.log(`✅ ${mediaLabel}下载成功: type=${blob.type}, size=${(blob.size / 1024).toFixed(2)} KB`)
      return blob
    } catch (error) {
      lastError = error
      console.warn(`⚠️ ${mediaLabel}下载通道失败，准备尝试下一个通道:`, {
        candidateUrl,
        error: error instanceof Error ? error.message : error,
      })
    }
  }

  throw new Error(`下载${mediaLabel}文件失败: ${lastError instanceof Error ? lastError.message : '未知错误'}`)
}

type WorkflowRouteStep = 'video-source' | 'subtitles' | 'config' | 'script' | 'voiceover'
export type WorkflowSaveResults = Partial<Record<WorkflowRouteStep | FrameWorkflowStepKey, Record<string, unknown>>>
type WorkflowFieldsUpdate = {
  video_url?: string | null
  subtitle?: Record<string, unknown> | null
  video_config?: Record<string, unknown> | null
  video_context?: VideoContext | Record<string, any> | null
  ai_analysis_script?: Record<string, any> | null
  audio_url?: string | null
  mp3_url?: string | null
  workflow?: ProjectWorkflow
  artifacts?: ProjectArtifacts
  metadata?: ProjectMetadata
}

type WorkflowStepSavePlan = {
  step: WorkflowRouteStep
  responseKey: 'video_source' | 'subtitles' | 'config' | 'script' | 'voiceover'
  dependsOn?: 'video_source' | 'subtitles' | 'config' | 'script'
  data: unknown
}

let isRedirectingDueToUnauthorized = false

const handleUnauthorizedResponse = (status: number, responseText: string): string | null => {
  if (status !== 401) {
    return null
  }

  let message = '登录状态已过期，请重新登录'

  try {
    const parsed = JSON.parse(responseText) as Record<string, unknown>
    const detail = parsed.detail as unknown

    if (typeof detail === 'string' && detail.trim().length > 0) {
      message = detail
    } else if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
      const detailObj = detail as Record<string, unknown>
      const detailMessage = detailObj.message
      const detailError = detailObj.error

      if (typeof detailMessage === 'string' && detailMessage.trim().length > 0) {
        message = detailMessage
      } else if (typeof detailError === 'string' && detailError.trim().length > 0) {
        message = detailError
      }
    } else {
      const rootMessage = parsed.message
      if (typeof rootMessage === 'string' && rootMessage.trim().length > 0) {
        message = rootMessage
      }
    }
  } catch {
    // ignore parse errors, fallback to default message
  }

  tokenManager.clearTokens()

  if (typeof window !== 'undefined') {
    const loginPath = '/login'

    if (!isRedirectingDueToUnauthorized && window.location.pathname !== loginPath) {
      isRedirectingDueToUnauthorized = true
      window.location.replace(loginPath)
    }
  }

  return message
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const frameStepIdByKey: Partial<Record<FrameWorkflowStepKey, string>> = {
  step_1_merge_videos: 'merge-videos',
  step_2_extract_audio: 'extract-audio',
  step_3_transcribe: 'transcribe',
  step_4_validate_subtitles: 'validate-subtitles',
  step_5_decide_timeline_view: 'decide-timeline-view',
  step_6_generate_timeline_images: 'generate-timeline-images',
  step_7_analyze_timeline_images: 'analyze-timeline-images',
  step_8_understand_narrative: 'understand-narrative',
  step_9_merge_video_context: 'merge-video-context',
  step_10_generate_narration_script: 'generate-narration-script',
  step_10_match_narration_visuals: 'match-narration-visuals',
  step_11_generate_voiceover: 'generate-voiceover',
  step_12_compose_final_video: 'compose-final-video',
  step_13_persist_project: 'persist-project',
}

const frameStepIndexByKey: Record<FrameWorkflowStepKey, number> = {
  step_0_created: 0,
  step_1_merge_videos: 1,
  step_2_extract_audio: 2,
  step_3_transcribe: 3,
  step_4_validate_subtitles: 4,
  step_5_decide_timeline_view: 5,
  step_6_generate_timeline_images: 6,
  step_7_analyze_timeline_images: 7,
  step_8_understand_narrative: 8,
  step_9_merge_video_context: 9,
  step_10_generate_narration_script: 10,
  step_10_match_narration_visuals: 11,
  step_11_generate_voiceover: 12,
  step_12_compose_final_video: 13,
  step_13_persist_project: 14,
  step_14_completed: 15,
}

const legacyFrameStepIndexByKey: Record<string, number> = {
  step_13_completed: 13,
}

const makeDefaultWorkflow = (status: Project['status'] = 'draft'): ProjectWorkflow => ({
  mode: 'frame',
  status,
  current_step: 'step_0_created',
  current_step_id: null,
  current_step_index: 0,
  revision: 1,
  steps: {},
  stages: {
    source_video: {},
    subtitles: {},
    config: {},
    script: {},
    voiceover: {},
    final_video: {},
  },
})

const normalizeWorkflow = (value: unknown, status: Project['status'] = 'draft'): ProjectWorkflow => {
  const base = makeDefaultWorkflow(status)
  const workflow = isPlainObject(value) ? { ...base, ...value } as ProjectWorkflow : base
  workflow.steps = isPlainObject(workflow.steps) ? workflow.steps : {}
  workflow.stages = isPlainObject(workflow.stages) ? { ...base.stages, ...workflow.stages } : base.stages
  workflow.current_step = (workflow.current_step || 'step_0_created') as FrameWorkflowStepKey
  workflow.current_step_index = frameStepIndexByKey[workflow.current_step] ?? legacyFrameStepIndexByKey[String(workflow.current_step)] ?? workflow.current_step_index ?? 0
  workflow.current_step_id = frameStepIdByKey[workflow.current_step] as ProjectWorkflow['current_step_id'] ?? null
  workflow.revision = Number(workflow.revision || 1)
  return workflow
}

const normalizeProject = (project: Project): Project => ({
  ...project,
  workflow: normalizeWorkflow(project.workflow, project.status),
  artifacts: isPlainObject(project.artifacts) ? project.artifacts as ProjectArtifacts : {},
  metadata: isPlainObject(project.metadata) ? project.metadata as ProjectMetadata : {},
})

const normalizeProjectListResponse = (response: unknown): ProjectListResponse => {
  const root = isPlainObject(response) ? response : {}
  const data = isPlainObject(root.data) ? root.data : root
  const projects = Array.isArray(data.projects)
    ? (data.projects as Project[]).map(normalizeProject)
    : Array.isArray(data.items)
      ? (data.items as Project[]).map(normalizeProject)
      : Array.isArray(data.data)
        ? (data.data as Project[]).map(normalizeProject)
        : []

  const total = typeof data.total === 'number'
    ? data.total
    : typeof root.total === 'number'
      ? root.total
      : projects.length
  const page = typeof data.page === 'number' ? data.page : 1
  const limit = typeof data.limit === 'number' ? data.limit : projects.length
  const hasMore = typeof data.has_more === 'boolean'
    ? data.has_more
    : typeof data.hasMore === 'boolean'
      ? data.hasMore
      : false

  return {
    projects,
    items: projects,
    total,
    page,
    limit,
    has_more: hasMore,
  }
}

class ProjectService {
  private static async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`
    
    const response = await authenticatedFetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
    const responseText = await response.text()

    if (!response.ok) {
      const unauthorizedMessage = handleUnauthorizedResponse(response.status, responseText)
      const fallbackMessage = responseText
        ? `API Error: ${response.status} ${responseText}`
        : `API Error: ${response.status}`

      throw new Error(unauthorizedMessage ?? fallbackMessage)
    }

    if (!responseText) {
      return {} as T
    }

    return JSON.parse(responseText) as T
  }

  // 项目CRUD操作
  
  static async createProject(data: ProjectCreateRequest): Promise<Project> {
    const project = await this.request<Project>('/api/v1/projects/', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    return normalizeProject(project)
  }

  static async getProjects(params?: ProjectQueryParams): Promise<ProjectListResponse> {
    const searchParams = new URLSearchParams()
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach(v => searchParams.append(key, String(v)))
          } else {
            searchParams.append(key, String(value))
          }
        }
      })
    }

    const queryString = searchParams.toString()
    const endpoint = queryString ? `/api/v1/projects/?${queryString}` : '/api/v1/projects/'
    
    const response = await this.request<unknown>(endpoint)
    return normalizeProjectListResponse(response)
  }

  static async getProject(projectId: string): Promise<Project> {
    return normalizeProject(await this.request<Project>(`/api/v1/projects/${projectId}`))
  }

  static async getProjectWorkflow(projectId: string): Promise<any> {
    return this.request<any>(`/api/v1/projects/${projectId}/workflow`)
  }

  static async saveProjectWorkflowStep(
    projectId: string,
    step: string,
    data: {
      workflow_revision: number
      dependency_hash?: string
      data?: unknown
      [key: string]: unknown
    }
  ): Promise<any> {
    return this.request<any>(`/api/v1/projects/${projectId}/workflow/steps/${step}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  static async saveWorkflowFields(
    projectId: string,
    updates: WorkflowFieldsUpdate
  ): Promise<WorkflowSaveResults> {
    const plans: WorkflowStepSavePlan[] = []

    if (
      Object.prototype.hasOwnProperty.call(updates, 'video_url') ||
      Object.prototype.hasOwnProperty.call(updates, 'video_context')
    ) {
      const data: Record<string, unknown> = {}
      if (Object.prototype.hasOwnProperty.call(updates, 'video_url')) {
        data.video_url = updates.video_url ?? null
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'video_context')) {
        data.video_context = updates.video_context ?? null
      }
      plans.push({ step: 'video-source', responseKey: 'video_source', data })
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'subtitle')) {
      plans.push({ step: 'subtitles', responseKey: 'subtitles', dependsOn: 'video_source', data: updates.subtitle ?? {} })
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'video_config')) {
      plans.push({ step: 'config', responseKey: 'config', dependsOn: 'subtitles', data: updates.video_config ?? null })
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'ai_analysis_script')) {
      plans.push({ step: 'script', responseKey: 'script', dependsOn: 'config', data: updates.ai_analysis_script ?? null })
    }
    if (
      Object.prototype.hasOwnProperty.call(updates, 'audio_url') ||
      Object.prototype.hasOwnProperty.call(updates, 'mp3_url')
    ) {
      plans.push({
        step: 'voiceover',
        responseKey: 'voiceover',
        dependsOn: 'script',
        data: {
          audio_url: updates.audio_url ?? null,
          mp3_url: updates.mp3_url ?? null,
        },
      })
    }

    const results: WorkflowSaveResults = {}

    if (plans.length > 0) {
      const workflow = await this.getProjectWorkflow(projectId) as Record<string, any>
      let revision = Number(
        workflow.workflow_revision ??
        workflow.workflow_root?.revision ??
        workflow.revision ??
        1
      )
      const contentHashes: Partial<Record<WorkflowStepSavePlan['responseKey'], string>> = {
        video_source: typeof workflow.video_source?.content_hash === 'string' ? workflow.video_source.content_hash : undefined,
        subtitles: typeof workflow.subtitles?.content_hash === 'string' ? workflow.subtitles.content_hash : undefined,
        config: typeof workflow.config?.content_hash === 'string' ? workflow.config.content_hash : undefined,
        script: typeof workflow.script?.content_hash === 'string' ? workflow.script.content_hash : undefined,
      }

      for (const plan of plans) {
        const body: {
          workflow_revision: number
          dependency_hash?: string
          data: unknown
        } = {
          workflow_revision: revision,
          data: plan.data,
        }
        const dependencyHash = plan.dependsOn ? contentHashes[plan.dependsOn] : undefined
        if (dependencyHash) {
          body.dependency_hash = dependencyHash
        }

        const result = await this.saveProjectWorkflowStep(projectId, plan.step, body)
        results[plan.step] = result
        revision = Number(result.workflow_revision ?? revision)
        if (typeof result.content_hash === 'string') {
          contentHashes[plan.responseKey] = result.content_hash
        }
      }
    }

    if (updates.workflow || updates.artifacts || updates.metadata) {
      const project = await this.getProject(projectId)
      const updatedProject = await this.updateProject(projectId, {
        workflow: updates.workflow ?? project.workflow,
        artifacts: updates.artifacts ?? project.artifacts,
        metadata: updates.metadata ?? project.metadata,
      })
      results[updatedProject.workflow.current_step] = {
        workflow_revision: updatedProject.workflow.revision,
      }
    }

    return results
  }

  static async saveProjectVideoSource(
    projectId: string,
    data: { video_url?: string | null; video_context?: VideoContext | Record<string, any> | null }
  ): Promise<Project | any> {
    await this.saveWorkflowFields(projectId, data)
    return this.getProject(projectId)
  }

  static async saveProjectSubtitles(
    projectId: string,
    subtitle: Record<string, ProjectSubtitleItem> | null
  ): Promise<Project | any> {
    await this.saveWorkflowFields(projectId, { subtitle: subtitle ?? {} })
    return this.getProject(projectId)
  }

  static async saveProjectGenerationConfig(
    projectId: string,
    config: Record<string, unknown> | null
  ): Promise<Project | any> {
    await this.saveWorkflowFields(projectId, { video_config: config ?? null })
    return this.getProject(projectId)
  }

  static async saveProjectScript(
    projectId: string,
    script: Record<string, any> | null
  ): Promise<Project | any> {
    await this.saveWorkflowFields(projectId, { ai_analysis_script: script ?? null })
    return this.getProject(projectId)
  }

  static async saveProjectVoiceover(
    projectId: string,
    data: { audio_url?: string | null; mp3_url?: string | null }
  ): Promise<Project | any> {
    await this.saveWorkflowFields(projectId, data)
    return this.getProject(projectId)
  }

  static async updateProject(projectId: string, data: ProjectUpdateRequest): Promise<Project> {
    const project = await this.request<Project>(`/api/v1/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    return normalizeProject(project)
  }

  static async releaseBillingReservations(projectId: string, reason: 'workflow_failed' | 'workflow_cancelled' | string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/v1/projects/${projectId}/billing-reservations/release`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
  }

  static async deleteProject(projectId: string): Promise<MessageResponse> {
    const response = await this.request<MessageResponse>(`/api/v1/projects/${projectId}`, {
      method: 'DELETE',
    })
    await cleanupDeletedProjectLocalData(projectId)
    return response
  }

  // JSON 数据存储

  static async saveSubtitleVisualData(
    projectId: string,
    data: SubtitleVisualData | null
  ): Promise<Project> {
    const project = await this.getProject(projectId)
    const workflow = normalizeWorkflow(project.workflow, project.status)
    const nextWorkflow = normalizeWorkflow({
      ...workflow,
      revision: workflow.revision + 1,
      stages: {
        ...workflow.stages,
        subtitles: {
          ...(workflow.stages.subtitles ?? {}),
          data: {
            ...((workflow.stages.subtitles?.data as Record<string, unknown> | undefined) ?? {}),
            subtitle_visual_data: data,
          },
          updated_at: new Date().toISOString(),
        },
      },
    }, project.status)
    return this.updateProject(projectId, { workflow: nextWorkflow })
  }

  static async saveAiAnalysisScript(
    projectId: string,
    script: Record<string, any> | null
  ): Promise<Project> {
    return this.saveProjectScript(projectId, script) as Promise<Project>
  }

  static async saveNarrationConfig(
    projectId: string,
    config: ProjectNarrationConfig | null
  ): Promise<Project> {
    return this.saveProjectGenerationConfig(projectId, config as Record<string, unknown> | null) as Promise<Project>
  }

  // 保存解说配置（新版本 - 匹配文档结构）
  static async saveConfiguration(
    projectId: string,
    config: any // NarrationConfiguration from config.types.ts
  ): Promise<Project> {
    return this.saveProjectGenerationConfig(projectId, config) as Promise<Project>
  }

  // 保存生成的 video_context 数据
  static async saveVideoContext(
    projectId: string,
    videoContext: VideoContext
  ): Promise<Project> {
    return this.saveProjectVideoSource(projectId, {
      video_context: videoContext,
    }) as Promise<Project>
  }

  // 下载项目文件内容（开发环境使用代理，生产环境需要其他方案）
  static async downloadProjectFileContent(url: string): Promise<string> {
    // 开发环境：使用 Vite 代理绕过 CORS
    if (import.meta.env.DEV) {
      // 将 R2_BASE_URL/path 转换为 /dev-proxy/path
      const proxyUrl = url.replace(R2_BASE_URL, '/dev-proxy')
      
      const response = await fetch(proxyUrl)
      if (!response.ok) {
        throw new Error(`下载文件失败: ${response.status} ${response.statusText}`)
      }
      return response.text()
    }
    
    // 生产环境：直接访问（假设是同源或已配置CORS）
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`下载文件失败: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }

  // 下载项目JSON文件并解析（用于帧描述等结构化数据）
  static async downloadProjectJsonFile<T = any>(url: string): Promise<T> {
    const content = await this.downloadProjectFileContent(url)
    try {
      return JSON.parse(content)
    } catch (error) {
      throw new Error('JSON文件格式错误，无法解析')
    }
  }

  // 下载项目音频文件（开发环境使用代理，生产环境需要其他方案）
  static async downloadProjectAudioFile(url: string): Promise<Blob> {
    return downloadProjectMediaFile(url, {
      mediaLabel: '音频',
      defaultContentType: 'audio/mpeg',
      timeoutMs: 30_000,
    })
  }

  // 下载项目视频文件，强制转为 Blob 后由前端触发本地保存
  static async downloadProjectVideoFile(url: string): Promise<Blob> {
    return downloadProjectMediaFile(url, {
      mediaLabel: '视频',
      defaultContentType: 'video/mp4',
      timeoutMs: 60_000,
    })
  }

  // 下载项目图片文件（开发环境使用代理，生产环境需要其他方案）
  static async downloadProjectImageFile(url: string): Promise<Blob> {
    // 开发环境：使用 Vite 代理绕过 CORS
    if (import.meta.env.DEV) {
      // 将 R2_BASE_URL/path 转换为 /dev-proxy/path
      const proxyUrl = url.replace(R2_BASE_URL, '/dev-proxy')
      
      const response = await fetch(proxyUrl)
      if (!response.ok) {
        throw new Error(`下载图片文件失败: ${response.status} ${response.statusText}`)
      }
      return response.blob()
    }
    
    // 生产环境：直接访问（假设是同源或已配置CORS）
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`下载图片文件失败: ${response.status} ${response.statusText}`)
    }
    return response.blob()
  }

  // 上传项目预览图
  static async uploadProjectPreview(
    projectId: string,
    imageFile: Blob
  ): Promise<void> {
    const project = await this.getProject(projectId)
    const preview = await localAssetStorageService.saveProjectAsset({
      projectId,
      kind: 'preview_image',
      file: imageFile,
      name: `preview-${projectId}.png`,
      type: imageFile.type || 'image/png',
    })

    await this.updateProject(projectId, {
      artifacts: {
        ...project.artifacts,
        preview_image: preview,
      },
    })
  }

  // ==================== 新增：按需内容加载 API ====================
  // ==================== 新增：按需内容加载 API ====================

  // 按需获取项目内容

  // ==================== 增强的文件下载方法 ====================

  // 从URL下载内容（支持缓存）
  static async downloadContentFromUrl(
    url: string,
    options?: {
      etag?: string  // 用于条件请求
      timeout?: number
    }
  ): Promise<{ content: string; etag?: string }> {
    const headers: Record<string, string> = {}

    if (options?.etag) {
      headers['If-None-Match'] = options.etag
    }

    const response = await fetch(url, {
      headers,
      signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined
    })

    if (response.status === 304) {
      // 内容未修改，返回缓存指示
      throw new Error('NOT_MODIFIED')
    }

    if (!response.ok) {
      throw new Error(`下载文件失败: ${response.status} ${response.statusText}`)
    }

    const content = await response.text()
    const etag = response.headers.get('etag') || undefined

    return { content, etag }
  }

  // ==================== 素材页面二次进入 API ====================

  // 获取项目字幕数据
  static async getProjectSubtitle(projectId: string): Promise<any> {
    const project = await this.getProject(projectId)
    return project.workflow.stages.subtitles?.data ?? null
  }

  // 获取项目视频配置
  static async getProjectVideoConfig(projectId: string): Promise<any> {
    const project = await this.getProject(projectId)
    return project.workflow.stages.config?.data ?? null
  }

  // 获取项目视频上下文
  static async getProjectVideoContext(projectId: string): Promise<any> {
    const project = await this.getProject(projectId)
    const sourceVideo = project.workflow.stages.source_video?.data
    return isPlainObject(sourceVideo) ? sourceVideo.video_context ?? sourceVideo : null
  }

  // 获取项目AI脚本
  static async getProjectAiScript(projectId: string): Promise<any> {
    const project = await this.getProject(projectId)
    const scriptStage = project.workflow.stages.script?.data
    const result = isPlainObject(scriptStage) ? scriptStage.ai_analysis_script ?? scriptStage : null
    if (result && isPlainObject(result) && Array.isArray(result.items)) {
      const { ensureTimeFieldsBatch } = await import('@/shared/utils/timestampUtils')
      result.items = ensureTimeFieldsBatch(result.items)
    }
    return result
  }

}

export default ProjectService
