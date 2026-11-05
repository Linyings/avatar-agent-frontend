import type { LegacyModelLevel, ProjectInferenceMode } from '../types/material/videoConfig.types'

const STORAGE_PREFIX = 'project:inference_mode:'

const isProjectInferenceMode = (value: string | null): value is ProjectInferenceMode => (
  value === 'shallow' || value === 'deep' || value === 'frame' || value === 'avatar'
)

export const isAvatarProject = (project?: { metadata?: { inference_mode?: unknown; kind?: unknown } | null } | null) => (
  project?.metadata?.inference_mode === 'avatar' || project?.metadata?.kind === 'avatar_mvp'
)

export const isRetiredInferenceMode = (mode?: ProjectInferenceMode | null): mode is LegacyModelLevel => (
  mode === 'shallow' || mode === 'deep'
)

export const persistInferenceMode = (projectId: string, mode: ProjectInferenceMode) => {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(`${STORAGE_PREFIX}${projectId}`, mode)
}

export const readStoredInferenceMode = (projectId?: string): ProjectInferenceMode | undefined => {
  if (typeof window === 'undefined' || !projectId) return undefined
  const stored = window.sessionStorage.getItem(`${STORAGE_PREFIX}${projectId}`)
  return isProjectInferenceMode(stored) ? stored : undefined
}

export const resolveInferenceMode = (
  projectId?: string,
  metadataMode?: ProjectInferenceMode | null
): ProjectInferenceMode | undefined => {
  return metadataMode ?? readStoredInferenceMode(projectId)
}
