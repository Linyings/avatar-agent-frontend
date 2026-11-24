import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react'
import { debounce } from 'lodash'
import ProjectService from '../services/projectService'
import type { SubtitleExtractionResult } from '../types/material'
import { buildSubtitleExtractionResultFromPayload } from '../utils/subtitleTransform'
import type {
  Project,
  ProjectDetail,
  ProjectContextState,
  MaterialData,
  AnalysisData,
  ScriptData,
  StageStatus,
  ProjectCreateRequest,
  SubtitleVisualData,
  ProjectUpdateRequest,
  ProjectSubtitleItem
} from '../types/project'
import { persistInferenceMode } from '../utils/inferenceMode'

const ensureProjectDetail = (project: Project): ProjectDetail => {
  const collaboratorCount = (project as ProjectDetail).collaborator_count ?? 0
  const userPermissions = (project as ProjectDetail).user_permissions ?? []
  const userRole = (project as ProjectDetail).user_role
  const detailedMetadata = (project as ProjectDetail).detailed_metadata

  return {
    ...project,
    collaborator_count: collaboratorCount,
    user_permissions: userPermissions,
    user_role: userRole,
    detailed_metadata: detailedMetadata
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const isEmptyObject = (value: unknown): boolean => {
  if (!isPlainObject(value)) return false
  return Object.keys(value).length === 0
}

const getWorkflowStageData = <T,>(project: Project, stage: string): T | null => {
  const value = project.workflow.stages[stage]?.data
  return value === undefined ? null : value as T
}

const getProjectSubtitlePayload = (project: Project): Record<string, ProjectSubtitleItem> | null => {
  const data = getWorkflowStageData<Record<string, unknown>>(project, 'subtitles')
  if (!data) return null
  if (isPlainObject(data.subtitle)) return data.subtitle as Record<string, ProjectSubtitleItem>
  if (isPlainObject(data.subtitle_payload)) return data.subtitle_payload as Record<string, ProjectSubtitleItem>
  return data as Record<string, ProjectSubtitleItem>
}

const getProjectVideoConfig = (project: Project): Record<string, unknown> | null => (
  getWorkflowStageData<Record<string, unknown>>(project, 'config')
)

const getProjectAiScript = (project: Project): Record<string, any> | null => {
  const data = getWorkflowStageData<Record<string, any>>(project, 'script')
  if (!data) return null
  return isPlainObject(data.ai_analysis_script) ? data.ai_analysis_script as Record<string, any> : data
}

const getProjectSubtitleVisualData = (project: Project): SubtitleVisualData | null => {
  const data = getWorkflowStageData<Record<string, unknown>>(project, 'subtitles')
  if (!data || !isPlainObject(data.subtitle_visual_data)) return null
  return data.subtitle_visual_data as SubtitleVisualData
}

interface ProjectContextValue extends ProjectContextState {
  // 项目操作
  loadProject: (projectId: string) => Promise<void>
  createProject: (data: ProjectCreateRequest) => Promise<string>
  updateProject: (updates: Partial<Project>) => Promise<void>
  deleteProject: (projectId: string) => Promise<void>
  refreshProject: () => Promise<void>
  
  // 阶段数据管理
  updateMaterialData: (data: Partial<MaterialData>) => void
  updateAnalysisData: (data: Partial<AnalysisData>) => void
  updateScriptData: (data: Partial<ScriptData>) => void
  
  // 数据持久化
  saveSubtitleVisualData: (patch: Partial<SubtitleVisualData> | null) => Promise<void>
  
  // AI 脚本保存
  saveAiScript: (scriptData: any) => Promise<void>
  
  // 阶段状态管理
  updateStageStatus: (stage: keyof StageStatus, status: Partial<StageStatus[keyof StageStatus]>) => void
  
  // 手动保存
  saveProject: () => Promise<void>
  
  // 清理状态
  clearProject: () => void
  
  // 错误处理
  clearError: () => void
}

const mergeSubtitleVisualData = (
  current: SubtitleVisualData | null | undefined,
  patch: Partial<SubtitleVisualData>
): SubtitleVisualData => {
  const next: SubtitleVisualData = {
    ...(current ?? {}),
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'subtitle_result')) {
    next.subtitle_result = patch.subtitle_result ?? null
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'frame_descriptions')) {
    next.frame_descriptions = patch.frame_descriptions ?? null
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'frame_groups')) {
    next.frame_groups = patch.frame_groups ?? undefined
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'summary')) {
    next.summary = patch.summary ?? undefined
  }

  next.last_updated_at = new Date().toISOString()

  return next
}

const restoreSubtitleResultFromProject = (
  project: ProjectDetail | Project
): SubtitleExtractionResult | null => {
  const subtitlePayload = getProjectSubtitlePayload(project as Project)
  if (!subtitlePayload || isEmptyObject(subtitlePayload)) {
    return null
  }

  return buildSubtitleExtractionResultFromPayload(subtitlePayload, {
    language: (project as ProjectDetail).metadata?.language ?? 'zh'
  })
}

type ProjectAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_PROJECT'; payload: Project | null }
  | { type: 'SET_PROJECT_DETAIL'; payload: ProjectDetail | null }
  | { type: 'SET_MATERIAL_DATA'; payload: MaterialData | null }
  | { type: 'SET_ANALYSIS_DATA'; payload: AnalysisData | null }
  | { type: 'SET_SCRIPT_DATA'; payload: ScriptData | null }
  | { type: 'SET_STAGE_STATUS'; payload: StageStatus | null }
  | { type: 'UPDATE_MATERIAL_DATA'; payload: Partial<MaterialData> }
  | { type: 'UPDATE_ANALYSIS_DATA'; payload: Partial<AnalysisData> }
  | { type: 'UPDATE_SCRIPT_DATA'; payload: Partial<ScriptData> }
  | { type: 'UPDATE_STAGE_STATUS'; payload: { stage: keyof StageStatus; status: Partial<StageStatus[keyof StageStatus]> } }
  | { type: 'SET_LAST_SAVED'; payload: Date | null }
  | { type: 'CLEAR_ALL' }

function projectReducer(state: ProjectContextState, action: ProjectAction): ProjectContextState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }
    case 'SET_SAVING':
      return { ...state, isSaving: action.payload }
    case 'SET_ERROR':
      return { ...state, error: action.payload }
    case 'SET_PROJECT':
      return { ...state, currentProject: action.payload }
    case 'SET_PROJECT_DETAIL':
      return { ...state, projectDetail: action.payload }
    case 'SET_MATERIAL_DATA':
      return { ...state, materialData: action.payload }
    case 'SET_ANALYSIS_DATA':
      return { ...state, analysisData: action.payload }
    case 'SET_SCRIPT_DATA':
      return { ...state, scriptData: action.payload }
    case 'SET_STAGE_STATUS':
      return { ...state, stageStatus: action.payload }
    case 'UPDATE_MATERIAL_DATA':
      return {
        ...state,
        materialData: state.materialData 
          ? { ...state.materialData, ...action.payload }
          : action.payload as MaterialData
      }
    case 'UPDATE_ANALYSIS_DATA':
      return {
        ...state,
        analysisData: state.analysisData
          ? { ...state.analysisData, ...action.payload }
          : action.payload as AnalysisData
      }
    case 'UPDATE_SCRIPT_DATA':
      return {
        ...state,
        scriptData: state.scriptData
          ? { ...state.scriptData, ...action.payload }
          : action.payload as ScriptData
      }
    case 'UPDATE_STAGE_STATUS':
      return {
        ...state,
        stageStatus: state.stageStatus
          ? {
              ...state.stageStatus,
              [action.payload.stage]: {
                ...state.stageStatus[action.payload.stage],
                ...action.payload.status
              }
            }
          : {
              material: { completed: false, hasVideo: false, hasFrames: false, hasSubtitles: false, hasAnalysis: false, hasNarrationAudios: false },
              analysis: { completed: false, hasSceneAnalysis: false, hasAiScript: false },
              dubbing: { completed: false, hasScriptItems: false, hasAudioFiles: false, hasOutputVideo: false },
              [action.payload.stage]: action.payload.status
            } as StageStatus
      }
    case 'SET_LAST_SAVED':
      return { ...state, lastSaved: action.payload }
    case 'CLEAR_ALL':
      return {
        currentProject: null,
        projectDetail: null,
        materialData: null,
        analysisData: null,
        scriptData: null,
        stageStatus: null,
        isLoading: false,
        isSaving: false,
        lastSaved: null,
        error: null
      }
    default:
      return state
  }
}

const initialState: ProjectContextState = {
  currentProject: null,
  projectDetail: null,
  materialData: null,
  analysisData: null,
  scriptData: null,
  stageStatus: null,
  isLoading: false,
  isSaving: false,
  lastSaved: null,
  error: null
}

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined)

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(projectReducer, initialState)

  // 使用 ref 来缓存 currentProject，避免不必要的依赖更新
  const currentProjectRef = useRef(state.currentProject)

  // 更新 currentProjectRef
  useEffect(() => {
    currentProjectRef.current = state.currentProject
  }, [state.currentProject])

  // 自动保存逻辑（防抖5秒）
  const debouncedSave = useCallback(
    debounce(async () => {
      if (!state.currentProject) return

      const updateData: ProjectUpdateRequest = {}

      if (state.scriptData !== undefined) {
        const nextAiScript = state.scriptData ?? null
        const currentAiScript = getProjectAiScript(state.currentProject) ?? null

        const nextIsEmpty = nextAiScript === null || isEmptyObject(nextAiScript)
        const currentIsEmpty = currentAiScript === null || isEmptyObject(currentAiScript)

        let shouldPersist = false

        if (nextIsEmpty && currentIsEmpty) {
          shouldPersist = false
        } else if (isPlainObject(nextAiScript) && isPlainObject(currentAiScript)) {
          try {
            shouldPersist = JSON.stringify(nextAiScript) !== JSON.stringify(currentAiScript)
          } catch (error) {
            console.warn('比较脚本数据失败，回退到保存', error)
            shouldPersist = true
          }
        } else {
          shouldPersist = nextAiScript !== currentAiScript
        }

        if (shouldPersist) {
          const workflow = {
            ...state.currentProject.workflow,
            revision: state.currentProject.workflow.revision + 1,
            stages: {
              ...state.currentProject.workflow.stages,
              script: {
                ...(state.currentProject.workflow.stages.script ?? {}),
                data: { ai_analysis_script: nextAiScript ?? undefined },
                updated_at: new Date().toISOString(),
              },
            },
          }
          updateData.workflow = workflow
        }
      }

      if (Object.keys(updateData).length === 0) {
        return
      }

      try {
        dispatch({ type: 'SET_SAVING', payload: true })
        const updatedProject = await ProjectService.updateProject(state.currentProject.id, updateData)
        dispatch({ type: 'SET_PROJECT', payload: updatedProject })
        if (state.projectDetail) {
          dispatch({
            type: 'SET_PROJECT_DETAIL',
            payload: {
              ...state.projectDetail,
              ...updatedProject,
            },
          })
        }
        dispatch({ type: 'SET_LAST_SAVED', payload: new Date() })
      } catch (error) {
        console.error('自动保存失败:', error)
        dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : '自动保存失败' })
      } finally {
        dispatch({ type: 'SET_SAVING', payload: false })
      }
    }, 5000),
    [state.currentProject, state.projectDetail, state.scriptData]
  )

  // 监听数据变化，触发自动保存
  useEffect(() => {
    if (state.currentProject) {
      debouncedSave()
    }
    return () => {
      debouncedSave.cancel()
    }
  }, [state.scriptData, debouncedSave, state.currentProject])

  // 加载项目
  const loadProject = useCallback(async (projectId: string) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true })
      dispatch({ type: 'SET_ERROR', payload: null })

      // 🔥 修复：立即清空当前项目引用，防止后续操作使用旧项目 ID
      dispatch({ type: 'SET_PROJECT', payload: null })
      dispatch({ type: 'SET_PROJECT_DETAIL', payload: null })

      // 清空所有阶段数据，防止新项目显示旧项目的缓存数据
      dispatch({ type: 'SET_MATERIAL_DATA', payload: null })
      dispatch({ type: 'SET_ANALYSIS_DATA', payload: null })
      dispatch({ type: 'SET_SCRIPT_DATA', payload: null })
      dispatch({ type: 'SET_STAGE_STATUS', payload: null })

      console.log('[ProjectContext] 开始加载新项目:', projectId)

      // 获取项目基本信息，新结构直接包含 workflow / artifacts / metadata
      const projectPayload = await ProjectService.getProject(projectId)
      const projectDetail = ensureProjectDetail(projectPayload)

      console.log('[ProjectContext] 新项目数据加载完成:', {
        id: projectDetail.id,
        name: projectDetail.name
      })

      const inferenceMode = projectDetail.metadata?.inference_mode
      if (inferenceMode) {
        persistInferenceMode(projectDetail.id, inferenceMode)
      }

      dispatch({ type: 'SET_PROJECT', payload: projectDetail })
      dispatch({ type: 'SET_PROJECT_DETAIL', payload: projectDetail })


      const subtitleVisual = getProjectSubtitleVisualData(projectDetail) ?? null
      const restoredSubtitleResult = restoreSubtitleResultFromProject(projectDetail)
      const subtitleResult = restoredSubtitleResult ?? subtitleVisual?.subtitle_result ?? null
      const frameDescriptions = subtitleVisual?.frame_descriptions ?? null
      const frameGroupsSummary = subtitleVisual?.frame_groups ?? []
      const rawAiScriptData = getProjectAiScript(projectDetail)
      const aiScriptData = isPlainObject(rawAiScriptData) && isEmptyObject(rawAiScriptData)
        ? null
        : rawAiScriptData

      const sourceVideoArtifact = projectDetail.artifacts.source_video ?? null

      const fallbackDuration = (() => {
        const metadataDuration = Number(sourceVideoArtifact?.duration ?? 0)
        if (!Number.isNaN(metadataDuration) && metadataDuration > 0) {
          return metadataDuration
        }
        const extractionDuration = (subtitleResult as SubtitleExtractionResult | null)?.totalDuration
        return extractionDuration ?? 0
      })()

      const materialData: MaterialData = {
        frameGroups: (frameGroupsSummary as any[]) || [],
        subtitleResult: subtitleResult ?? null,
        frameDescriptions: frameDescriptions ?? null,
        analysisResults: frameDescriptions?.items ?? [],
        configuration: getProjectVideoConfig(projectDetail) ?? undefined,
        videoFile: sourceVideoArtifact
          ? {
              name: sourceVideoArtifact.name || 'uploaded-video.mp4',
              size: sourceVideoArtifact.size ?? 0,
              duration: fallbackDuration,
              type: sourceVideoArtifact.type || 'video/mp4',
              artifact: sourceVideoArtifact,
              localKey: sourceVideoArtifact.key,
            }
          : undefined
      }
      dispatch({ type: 'SET_MATERIAL_DATA', payload: materialData })

      const analysisData: AnalysisData = {
        analysisResults: frameDescriptions?.items ?? [],
        script_data: aiScriptData ?? null,
        analysis_completed: Boolean(aiScriptData),
        analysis_date: aiScriptData ? new Date().toISOString() : undefined,
        narration_config: getProjectVideoConfig(projectDetail) as any
      }
      dispatch({ type: 'SET_ANALYSIS_DATA', payload: analysisData })

      dispatch({ type: 'SET_SCRIPT_DATA', payload: aiScriptData ?? null })

      // 更新阶段状态
      const audioStateMap = (aiScriptData as any)?.audioStates ?? {}
      const hasAudioFiles = Boolean(audioStateMap && Object.keys(audioStateMap).length > 0)

      const stageStatus: StageStatus = {
        material: {
          completed: Boolean(subtitleResult && (frameDescriptions?.items?.length ?? 0) > 0),
          hasVideo: Boolean(materialData.videoFile ?? sourceVideoArtifact),
          hasFrames: Array.isArray(frameGroupsSummary) && frameGroupsSummary.length > 0,
          hasSubtitles: Boolean(subtitleResult),
          hasAnalysis: Boolean(frameDescriptions?.items?.length),
          hasNarrationAudios: hasAudioFiles,
          hasConfiguration: Boolean(getProjectVideoConfig(projectDetail) && !isEmptyObject(getProjectVideoConfig(projectDetail))),
          hasGenerationResult: Boolean(aiScriptData)
        },
        analysis: {
          completed: Boolean(aiScriptData),
          hasSceneAnalysis: Boolean(frameDescriptions?.items?.length),
          hasAiScript: Boolean(aiScriptData)
        },
        dubbing: {
          completed: projectDetail.status === 'completed',
          hasScriptItems: Boolean((aiScriptData as any)?.items?.length),
          hasAudioFiles,
          hasOutputVideo: Boolean(projectDetail.artifacts.final_video)
        }
      }
      dispatch({ type: 'SET_STAGE_STATUS', payload: stageStatus })



    } catch (error) {
      console.error('ProjectContext: 加载项目失败:', error)
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : '加载项目失败' })
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }, [])

  // 创建项目
  const createProject = useCallback(async (data: ProjectCreateRequest): Promise<string> => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true })
      dispatch({ type: 'SET_ERROR', payload: null })

      const project = await ProjectService.createProject(data)
      const inferenceMode = data.metadata?.inference_mode
      const projectWithMode = inferenceMode
        ? {
            ...project,
            metadata: {
              ...(project.metadata ?? {}),
              inference_mode: inferenceMode
            }
          }
        : project
      if (inferenceMode) {
        persistInferenceMode(projectWithMode.id, inferenceMode)
      }
      dispatch({ type: 'SET_PROJECT', payload: projectWithMode })

      // 初始化空的阶段数据
      dispatch({ type: 'SET_MATERIAL_DATA', payload: {} })
      dispatch({ type: 'SET_ANALYSIS_DATA', payload: {} })
      dispatch({ type: 'SET_SCRIPT_DATA', payload: {} })

      return projectWithMode.id
    } catch (error) {
      console.error('创建项目失败:', error)
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : '创建项目失败' })
      throw error
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }, [])

  // 更新项目
  const updateProject = useCallback(async (updates: Partial<Project>) => {
    if (!state.currentProject) return

    try {
      dispatch({ type: 'SET_SAVING', payload: true })
      const normalizedUpdates: Partial<Project> = { ...updates }
      const hasNameUpdate = typeof updates.name === 'string'
      const hasExplicitAutoNameFlag = updates.metadata
        ? Object.prototype.hasOwnProperty.call(updates.metadata, 'auto_name_from_video')
        : false

      if (hasNameUpdate && !hasExplicitAutoNameFlag) {
        normalizedUpdates.metadata = {
          ...(state.currentProject.metadata ?? {}),
          ...(updates.metadata ?? {}),
          auto_name_from_video: false,
        }
      }

      const updatedProject = await ProjectService.updateProject(state.currentProject.id, normalizedUpdates as ProjectUpdateRequest)
      const inferenceMode = normalizedUpdates.metadata?.inference_mode ?? updatedProject.metadata?.inference_mode
      if (inferenceMode) {
        persistInferenceMode(updatedProject.id, inferenceMode)
      }
      dispatch({ type: 'SET_PROJECT', payload: updatedProject })

      const subtitleResult = restoreSubtitleResultFromProject(updatedProject)
      dispatch({ type: 'UPDATE_MATERIAL_DATA', payload: { subtitleResult: subtitleResult ?? null } })
      dispatch({
        type: 'UPDATE_STAGE_STATUS',
        payload: {
          stage: 'material',
          status: {
            hasSubtitles: Boolean(subtitleResult),
            hasGenerationResult: Boolean(getProjectAiScript(updatedProject))
          }
        }
      })

      if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'workflow')) {
        const nextScriptData = getProjectAiScript(updatedProject) ?? null
        dispatch({ type: 'SET_SCRIPT_DATA', payload: nextScriptData as any })
        dispatch({
          type: 'UPDATE_ANALYSIS_DATA',
          payload: {
            script_data: nextScriptData,
            analysis_completed: Boolean(nextScriptData),
            analysis_date: nextScriptData ? new Date().toISOString() : undefined
          }
        })
        dispatch({
          type: 'UPDATE_STAGE_STATUS',
          payload: {
            stage: 'analysis',
            status: {
              hasAiScript: Boolean(nextScriptData),
              completed: Boolean(nextScriptData)
            }
          }
        })
      }

      if (state.projectDetail) {
        dispatch({
          type: 'SET_PROJECT_DETAIL',
          payload: {
            ...state.projectDetail,
            ...updatedProject
          }
        })
      }
      dispatch({ type: 'SET_LAST_SAVED', payload: new Date() })
    } catch (error) {
      console.error('更新项目失败:', error)
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : '更新项目失败' })
      throw error
    } finally {
      dispatch({ type: 'SET_SAVING', payload: false })
    }
  }, [state.currentProject, state.projectDetail])

  // 删除项目
  const deleteProject = useCallback(async (projectId: string) => {
    try {
      await ProjectService.deleteProject(projectId)
      dispatch({ type: 'CLEAR_ALL' })
    } catch (error) {
      console.error('删除项目失败:', error)
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : '删除项目失败' })
    }
  }, [])

  // 刷新项目
  const refreshProject = useCallback(async () => {
    if (state.currentProject) {
      await loadProject(state.currentProject.id)
    }
  }, [state.currentProject, loadProject])

  // 更新阶段数据
  const updateMaterialData = useCallback((data: Partial<MaterialData>) => {
    dispatch({ type: 'UPDATE_MATERIAL_DATA', payload: data })
  }, [])

  const updateAnalysisData = useCallback((data: Partial<AnalysisData>) => {
    dispatch({ type: 'UPDATE_ANALYSIS_DATA', payload: data })
  }, [])

  const updateScriptData = useCallback((data: Partial<ScriptData>) => {
    dispatch({ type: 'UPDATE_SCRIPT_DATA', payload: data })
  }, [])

  // 更新阶段状态
  const updateStageStatus = useCallback((stage: keyof StageStatus, status: Partial<StageStatus[keyof StageStatus]>) => {
    dispatch({ type: 'UPDATE_STAGE_STATUS', payload: { stage, status } })
  }, [])

  const saveSubtitleVisualData = useCallback(
    async (patch: Partial<SubtitleVisualData> | null) => {
      if (!state.currentProject) throw new Error('没有当前项目')

      try {
        dispatch({ type: 'SET_SAVING', payload: true })

        const nextData = patch === null
          ? null
          : mergeSubtitleVisualData(getProjectSubtitleVisualData(state.currentProject), patch)

        const updatedProject = await ProjectService.saveSubtitleVisualData(
          state.currentProject.id,
          nextData
        )

        const mergedProject: Project = {
          ...state.currentProject,
          ...updatedProject,
        }

        const mergedDetail: ProjectDetail | null = state.projectDetail
          ? {
              ...state.projectDetail,
              ...updatedProject,
            }
          : null

        dispatch({ type: 'SET_PROJECT', payload: mergedProject })
        if (mergedDetail) {
          dispatch({ type: 'SET_PROJECT_DETAIL', payload: mergedDetail })
        }

        if (patch === null) {
          dispatch({ type: 'SET_MATERIAL_DATA', payload: null })
        } else {
          const materialPatch: Partial<MaterialData> = {}

          if (Object.prototype.hasOwnProperty.call(patch, 'subtitle_result')) {
            materialPatch.subtitleResult = patch.subtitle_result ?? null
          }

          if (Object.prototype.hasOwnProperty.call(patch, 'frame_descriptions')) {
            (materialPatch as any).frameDescriptions = patch.frame_descriptions ?? null
            if (patch.frame_descriptions?.items) {
              (materialPatch as any).analysisResults = patch.frame_descriptions.items
            } else if (patch.frame_descriptions === null) {
              (materialPatch as any).analysisResults = []
            }
          }

          if (Object.prototype.hasOwnProperty.call(patch, 'frame_groups')) {
            materialPatch.frameGroups = (patch.frame_groups ?? []) as any
          }

          if (Object.keys(materialPatch).length > 0) {
            dispatch({ type: 'UPDATE_MATERIAL_DATA', payload: materialPatch })
          }
        }

        dispatch({ type: 'SET_LAST_SAVED', payload: new Date() })
      } catch (error) {
        console.error('保存素材数据失败:', error)
        dispatch({
          type: 'SET_ERROR',
          payload: error instanceof Error ? error.message : '保存素材数据失败'
        })
      } finally {
        dispatch({ type: 'SET_SAVING', payload: false })
      }
    },
    [state.currentProject, state.projectDetail]
  )

  // 手动保存
  const saveProject = useCallback(async () => {
    debouncedSave.cancel() // 取消防抖，立即保存
    await debouncedSave.flush() // 立即执行保存
  }, [debouncedSave])

  // 清理状态
  const clearProject = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' })
  }, [])

  // 清理错误
  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null })
  }, [])

  // 专门的 AI 脚本保存方法
  const saveAiScript = useCallback(async (scriptData: any) => {
    const current = currentProjectRef.current
    if (!current) {
      throw new Error('没有当前项目')
    }

    try {
      dispatch({ type: 'SET_SAVING', payload: true })

      const updatedProject = await ProjectService.saveProjectScript(
        current.id,
        scriptData ?? null
      ) as Project

      const mergedDetail: ProjectDetail | null = state.projectDetail
        ? {
            ...state.projectDetail,
            ...updatedProject,
          }
        : null

      dispatch({ type: 'SET_PROJECT', payload: updatedProject })
      if (mergedDetail) {
        dispatch({ type: 'SET_PROJECT_DETAIL', payload: mergedDetail })
      }

      updateAnalysisData({
        script_data: scriptData,
        analysis_completed: Boolean(scriptData),
        analysis_date: new Date().toISOString()
      })

      dispatch({ type: 'SET_SCRIPT_DATA', payload: scriptData })
      updateStageStatus('analysis', {
        hasAiScript: Boolean(scriptData),
        completed: Boolean(scriptData)
      })
      dispatch({ type: 'SET_LAST_SAVED', payload: new Date() })
    } catch (error) {
      console.error('保存 AI 脚本失败:', error)
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : '保存 AI 脚本失败'
      })
      throw error
    } finally {
      dispatch({ type: 'SET_SAVING', payload: false })
    }
  }, [state.projectDetail, updateAnalysisData, updateStageStatus])

  const contextValue: ProjectContextValue = {
    ...state,
    loadProject,
    createProject,
    updateProject,
    deleteProject,
    refreshProject,
    updateMaterialData,
    updateAnalysisData,
    updateScriptData,
    updateStageStatus,
    saveSubtitleVisualData,
    saveProject,
    clearProject,
    clearError,
    saveAiScript
  }

  return (
    <ProjectContext.Provider value={contextValue}>
      {children}
    </ProjectContext.Provider>
  )
}

export const useProject = () => {
  const context = useContext(ProjectContext)
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider')
  }
  return context
}
