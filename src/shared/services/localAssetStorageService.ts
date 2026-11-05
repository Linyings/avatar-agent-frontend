import type { ProjectArtifact } from '@/features/projects/types/project'

type SaveProjectAssetInput = {
  projectId: string
  kind: 'source_video' | 'final_video' | 'preview_image' | string
  file: Blob
  name?: string
  type?: string
  duration?: number | null
}

type StorageNavigator = Navigator & {
  storage?: StorageManager & {
    getDirectory?: () => Promise<FileSystemDirectoryHandle>
  }
}

const assertOpfsAvailable = (): StorageNavigator => {
  if (typeof navigator === 'undefined') {
    throw new Error('当前环境不支持 OPFS，本地大文件无法保存')
  }
  const storageNavigator = navigator as StorageNavigator
  if (!storageNavigator.storage?.getDirectory) {
    throw new Error('当前浏览器不支持 OPFS，请使用支持 Origin Private File System 的浏览器')
  }
  return storageNavigator
}

const sanitizePathPart = (value: string) => (
  value
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    || 'asset'
)

const getProjectDirectory = async (projectId: string) => {
  const storageNavigator = assertOpfsAvailable()
  const root = await storageNavigator.storage!.getDirectory!()
  const projects = await root.getDirectoryHandle('projects', { create: true })
  return projects.getDirectoryHandle(sanitizePathPart(projectId), { create: true })
}

const isNotFoundError = (error: unknown) => (
  error instanceof DOMException && error.name === 'NotFoundError'
)

const getFileNameFromBlob = (file: Blob, fallback: string) => {
  const maybeFile = file as Partial<File>
  return sanitizePathPart(maybeFile.name || fallback)
}

export const localAssetStorageService = {
  async saveProjectAsset({
    projectId,
    kind,
    file,
    name,
    type,
    duration,
  }: SaveProjectAssetInput): Promise<ProjectArtifact> {
    const projectDirectory = await getProjectDirectory(projectId)
    const safeKind = sanitizePathPart(kind)
    const fileName = getFileNameFromBlob(file, name || `${safeKind}-${Date.now()}`)
    const key = `projects/${sanitizePathPart(projectId)}/${safeKind}/${Date.now()}-${fileName}`
    const kindDirectory = await projectDirectory.getDirectoryHandle(safeKind, { create: true })
    const fileHandle = await kindDirectory.getFileHandle(key.split('/').pop() || fileName, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(file)
    await writable.close()

    return {
      storage: 'opfs',
      key,
      name: fileName,
      type: type || file.type || 'application/octet-stream',
      size: file.size,
      duration: duration ?? null,
      missing: false,
      updated_at: new Date().toISOString(),
    }
  },

  async getProjectAsset(key: string): Promise<File | null> {
    if (!key.startsWith('projects/')) return null
    const parts = key.split('/').filter(Boolean)
    if (parts.length < 4) return null

    try {
      const storageNavigator = assertOpfsAvailable()
      let directory = await storageNavigator.storage!.getDirectory!()
      for (const part of parts.slice(0, -1)) {
        directory = await directory.getDirectoryHandle(part)
      }
      const fileHandle = await directory.getFileHandle(parts[parts.length - 1])
      return await fileHandle.getFile()
    } catch (error) {
      console.warn('[localAssetStorageService] OPFS 文件读取失败:', { key, error })
      return null
    }
  },

  async hasProjectAsset(key: string): Promise<boolean> {
    return Boolean(await this.getProjectAsset(key))
  },

  async deleteProjectAssets(projectId: string): Promise<void> {
    try {
      const storageNavigator = assertOpfsAvailable()
      const root = await storageNavigator.storage!.getDirectory!()
      const projects = await root.getDirectoryHandle('projects')
      await projects.removeEntry(sanitizePathPart(projectId), { recursive: true })
    } catch (error) {
      if (isNotFoundError(error)) return
      throw error
    }
  },
}
