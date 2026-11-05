import type { Project, ProjectMetadata, ProjectUpdateRequest } from '../types/project'

export const DEFAULT_PROJECT_NAME = '待上传视频'

export const deriveProjectNameFromFileName = (fileName?: string | null): string => {
  const trimmed = fileName?.trim() ?? ''
  const withoutExtension = trimmed.replace(/\.[^/.]+$/, '').trim()
  return withoutExtension || trimmed || DEFAULT_PROJECT_NAME
}

export const isAutoNamedProject = (
  project?: Pick<Project, 'name' | 'metadata'> | null
): boolean => {
  if (!project) return true

  const metadata = project.metadata
  if (metadata?.auto_name_from_video === false) return false

  const sourceVideoFilename = typeof metadata?.source_video_filename === 'string'
    ? metadata.source_video_filename
    : null
  const sourceVideoName = deriveProjectNameFromFileName(sourceVideoFilename)

  return metadata?.auto_name_from_video === true ||
    project.name.trim() === DEFAULT_PROJECT_NAME ||
    (Boolean(sourceVideoFilename) && project.name.trim() === sourceVideoName)
}

export const getEditableProjectVideoName = (
  project?: Pick<Project, 'name' | 'metadata'> | null
): string => {
  if (!project) return ''

  const metadata = project.metadata
  const sourceVideoFilename = typeof metadata?.source_video_filename === 'string'
    ? metadata.source_video_filename
    : null

  if (sourceVideoFilename) {
    return deriveProjectNameFromFileName(sourceVideoFilename)
  }

  return isAutoNamedProject(project) ? '' : project.name
}

export const buildAutoProjectNameUpdate = (
  project: Pick<Project, 'metadata'> | null | undefined,
  fileName: string
): Pick<ProjectUpdateRequest, 'name' | 'metadata'> => {
  const projectName = deriveProjectNameFromFileName(fileName)
  const metadata: ProjectMetadata = {
    ...(project?.metadata ?? {}),
    auto_name_from_video: true,
    source_video_filename: fileName,
  }

  return {
    name: projectName,
    metadata,
  }
}
