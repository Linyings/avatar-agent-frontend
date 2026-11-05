import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ProjectService } from '@/features/projects'
import type { Project, ProjectCreateRequest, ProjectListResponse, ProjectQueryParams } from '@/features/projects/types/project'
import type { ModelLevel } from '@/features/projects/types/material/videoConfig.types'
import { useToast } from '@/shared/contexts/ToastContext'
import { persistInferenceMode } from '@/features/projects/utils/inferenceMode'
import { DEFAULT_PROJECT_NAME } from '@/features/projects/utils/projectNaming'
import { cleanupDeletedProjectLocalData } from '@/features/projects/services/projectLocalCleanup'
import {
  ProjectListView,
  type ProjectCreateKind,
  type ProjectListViewMode,
  type ProjectModeFilter,
} from '@/features/projects/components/ProjectListView'

const DEFAULT_INFERENCE_MODE: ModelLevel = 'frame'

const resolveProjectListItems = (response: ProjectListResponse): Project[] => {
  if (Array.isArray(response.projects)) return response.projects

  const fallbackItems = (response as ProjectListResponse & { items?: Project[] }).items
  return Array.isArray(fallbackItems) ? fallbackItems : []
}
const ProjectListPage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { showError, showSuccess } = useToast()

  const [viewMode, setViewMode] = useState<ProjectListViewMode>(() => {
    const saved = localStorage.getItem('project-list-view-mode')
    return (saved as ProjectListViewMode) || 'card'
  })

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMode, setSelectedMode] = useState<ProjectModeFilter>(
    searchParams.get('mode') === 'avatar' ? 'avatar' : 'all',
  )
  const [sortBy, setSortBy] = useState('updated_at')
  const [sortOrder] = useState<'asc' | 'desc'>('desc')

  const [_hasMore, setHasMore] = useState(false)
  const [_total, setTotal] = useState(0)
  const [_page, setPage] = useState(0)

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latestRequestRef = useRef(0)
  const pendingListRequestRef = useRef<{
    key: string
    promise: Promise<ProjectListResponse>
  } | null>(null)

  useEffect(() => {
    if (searchParams.get('mode') === 'avatar') setSelectedMode('avatar')
  }, [searchParams])

  useEffect(() => {
    let ignore = false

    async function fetchProjects() {
      const requestId = latestRequestRef.current + 1
      latestRequestRef.current = requestId
      setIsLoading(true)
      setError(null)
      setPage(0)
      let requestPromise: Promise<ProjectListResponse> | null = null

      try {
        const queryParams: ProjectQueryParams = {
          limit: 50,
          offset: 0,
          sort_by: sortBy,
          sort_order: sortOrder,
        }

        if (searchQuery) {
          queryParams.q = searchQuery
        }

        const requestKey = JSON.stringify(queryParams)
        const pendingRequest = pendingListRequestRef.current
        const activeRequestPromise = pendingRequest?.key === requestKey
          ? pendingRequest.promise
          : ProjectService.getProjects(queryParams)
        requestPromise = activeRequestPromise

        pendingListRequestRef.current = {
          key: requestKey,
          promise: activeRequestPromise,
        }

        const response = await activeRequestPromise

        if (!ignore && requestId === latestRequestRef.current) {
          const nextProjects = resolveProjectListItems(response)
          setProjects(nextProjects)
          setTotal(response.total)
          setHasMore(response.has_more)
        }
      } catch (error) {
        if (!ignore && requestId === latestRequestRef.current) {
          console.error('获取项目列表失败:', error)
          setError(error instanceof Error ? error.message : '获取项目列表失败')
        }
      } finally {
        if (requestPromise && pendingListRequestRef.current?.promise === requestPromise) {
          pendingListRequestRef.current = null
        }

        if (!ignore && requestId === latestRequestRef.current) {
          setIsLoading(false)
        }
      }
    }

    if (searchQuery !== '') {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(fetchProjects, 300)
    } else {
      fetchProjects()
    }

    return () => {
      ignore = true
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [searchQuery, sortBy, sortOrder])

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  const handleProjectCreated = (project: Project) => {
    setProjects((prev) => [project, ...prev])
    setTotal((prev) => prev + 1)
  }

  const handleCreateProject = async (kind: ProjectCreateKind = 'frame') => {
    if (isCreatingProject) return
    const mode = kind === 'avatar' ? 'avatar' : DEFAULT_INFERENCE_MODE

    try {
      setIsCreatingProject(true)
      setError(null)

      const createData: ProjectCreateRequest = mode === 'avatar'
        ? {
            name: '数字人口播',
            metadata: { inference_mode: 'avatar' },
          }
        : {
            name: DEFAULT_PROJECT_NAME,
            metadata: {
              inference_mode: DEFAULT_INFERENCE_MODE,
              auto_name_from_video: true,
            },
          }

      const project = await ProjectService.createProject(createData)
      const projectWithMode: Project = {
        ...project,
        metadata: {
          ...(project.metadata ?? {}),
          inference_mode: mode,
        },
      }

      persistInferenceMode(project.id, mode)
      handleProjectCreated(projectWithMode)
      navigate(mode === 'avatar'
        ? `/projects/${project.id}/avatar`
        : `/projects/${project.id}/material/upload`)
    } catch (error) {
      console.error('创建项目失败:', error)
      const message = error instanceof Error ? error.message : '创建项目失败'
      setError(message)
      showError('创建项目失败', message)
    } finally {
      setIsCreatingProject(false)
    }
  }

  const handleViewModeChange = (mode: ProjectListViewMode) => {
    setViewMode(mode)
    localStorage.setItem('project-list-view-mode', mode)
  }

  const handleDeleteProject = async (projectId: string) => {
    setDeletingId(projectId)

    try {
      await ProjectService.deleteProject(projectId)
      await cleanupDeletedProjectLocalData(projectId)
      setProjects((prev) => prev.filter((project) => project.id !== projectId))
      setTotal((prev) => Math.max(0, prev - 1))
      showSuccess('项目已删除')
    } catch (error) {
      console.error('删除项目失败:', error)
      showError('删除项目失败', error instanceof Error ? error.message : undefined)
    } finally {
      setDeletingId(null)
    }
  }
  return (
    <>
      <ProjectListView
        projects={projects}
        isLoading={isLoading}
        isCreatingProject={isCreatingProject}
        deletingId={deletingId}
        error={error}
        searchQuery={searchQuery}
        selectedMode={selectedMode}
        sortBy={sortBy}
        viewMode={viewMode}
        onSearchQueryChange={setSearchQuery}
        onSelectedModeChange={setSelectedMode}
        onSortByChange={setSortBy}
        onViewModeChange={handleViewModeChange}
        onCreateProject={(kind) => {
          if (!isCreatingProject) void handleCreateProject(kind)
        }}
        onDeleteProject={handleDeleteProject}
        onClearError={() => setError(null)}
      />
    </>
  )
}

export default ProjectListPage
