import { useEffect, useMemo, useState } from 'react'
import type { Project } from '@/features/projects'
import { localAssetStorageService } from '@/shared/services/localAssetStorageService'

const isLocalPreviewProject = (project: Project) => (
  project.artifacts.preview_image?.storage === 'opfs' && Boolean(project.artifacts.preview_image.key)
)

interface LocalVideoSource {
  id: string
  name: string
  path: string
  size: number
  type: string
  lastModified: number
  sha256: string
}

interface DesktopThumbnailApi {
  media?: {
    thumbnail?: (source: LocalVideoSource) => Promise<{ data: ArrayBuffer; type: string }>
  }
}

const getDesktopThumbnail = () => (
  (window as Window & { narratoDesktop?: DesktopThumbnailApi }).narratoDesktop?.media?.thumbnail
)

const getLocalSource = (project: Project) => {
  const source = project.artifacts.source_video
  if (source?.storage !== 'local' || !source.key) return undefined
  const sha256 = project.metadata.desktop_source_sha256
  if (typeof sha256 !== 'string') return undefined
  const lastModified = Date.parse(source.updated_at || project.updated_at)
  return {
    id: project.id,
    name: source.name || project.name,
    path: source.key,
    size: source.size || 0,
    type: source.type || 'video/mp4',
    lastModified: Number.isFinite(lastModified) ? lastModified : 0,
    sha256,
  }
}

export const useProjectPreviewUrl = (project: Project): string | undefined => {
  const fallbackUrl = useMemo(
    () => project.thumbnail_url,
    [project.thumbnail_url]
  )
  const [localUrl, setLocalUrl] = useState<string | undefined>()

  useEffect(() => {
    let isActive = true
    let objectUrl: string | undefined

    setLocalUrl(undefined)

    if (!isLocalPreviewProject(project) || project.artifacts.preview_image?.missing) {
      return undefined
    }

    const key = project.artifacts.preview_image?.key
    if (!key) return undefined

    void localAssetStorageService.getProjectAsset(key)
      .then(file => {
        if (!isActive || !file) return
        objectUrl = URL.createObjectURL(file)
        setLocalUrl(objectUrl)
      })
      .catch(error => {
        console.warn('恢复本地项目预览图失败:', error)
      })

    return () => {
      isActive = false
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [project.id, project.artifacts.preview_image?.key, project.artifacts.preview_image?.missing, project.artifacts.preview_image?.storage])

  useEffect(() => {
    if (fallbackUrl || (isLocalPreviewProject(project) && !project.artifacts.preview_image?.missing)) {
      return undefined
    }

    const source = getLocalSource(project)
    const thumbnail = getDesktopThumbnail()
    if (!source || !thumbnail) return undefined

    let isActive = true
    let objectUrl: string | undefined

    setLocalUrl(undefined)
    void thumbnail(source)
      .then(image => {
        if (!isActive) return
        objectUrl = URL.createObjectURL(new Blob([image.data], { type: image.type }))
        setLocalUrl(objectUrl)
      })
      .catch(() => undefined)

    return () => {
      isActive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [fallbackUrl, project.id, project.name, project.updated_at, project.artifacts.preview_image?.missing, project.artifacts.preview_image?.storage, project.artifacts.source_video?.key, project.artifacts.source_video?.name, project.artifacts.source_video?.size, project.artifacts.source_video?.storage, project.artifacts.source_video?.type, project.artifacts.source_video?.updated_at])

  return localUrl || fallbackUrl || undefined
}
