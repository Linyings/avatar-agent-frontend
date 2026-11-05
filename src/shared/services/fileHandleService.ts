interface FileHandleData {
  id: string
  fileHandle: FileSystemFileHandle
  metadata: {
    name: string
    size: number
    type: string
    lastModified: number
  }
  createdAt: Date
  lastAccessedAt: Date
}

interface VideoFileMetadata {
  name: string
  size: number
  type: string
  lastModified: number
  duration?: number
  width?: number
  height?: number
}

class FileHandleService {
  private dbName = 'VideoFileHandles'
  private dbVersion = 1
  private storeName = 'fileHandles'
  private db: IDBDatabase | null = null

  // 检测浏览器是否支持 File System Access API
  static isSupported(): boolean {
    return 'showOpenFilePicker' in window && 'FileSystemFileHandle' in window
  }

  // 初始化 IndexedDB
  private async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve(this.db)
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' })
          store.createIndex('createdAt', 'createdAt')
          store.createIndex('lastAccessedAt', 'lastAccessedAt')
        }
      }
    })
  }

  // 请求用户选择视频文件并获取文件句柄
  async requestVideoFile(): Promise<{ fileHandle: FileSystemFileHandle; file: File; metadata: VideoFileMetadata } | null> {
    if (!FileHandleService.isSupported()) {
      throw new Error('File System Access API 不被当前浏览器支持')
    }

    try {
      if (!window.showOpenFilePicker) {
        throw new Error('File System Access API 不受支持')
      }
      const [fileHandle] = await window.showOpenFilePicker({
        types: [
          {
            description: '视频文件',
            accept: {
              'video/*': ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.m4v']
            }
          }
        ],
        excludeAcceptAllOption: true,
        multiple: false
      })

      const file = await fileHandle.getFile()
      
      // 创建视频元素来获取视频信息
      const videoUrl = URL.createObjectURL(file)
      const metadata: VideoFileMetadata = {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified
      }

      try {
        const videoInfo = await this.getVideoMetadata(videoUrl)
        metadata.duration = videoInfo.duration
        metadata.width = videoInfo.width
        metadata.height = videoInfo.height
      } catch (error) {
      } finally {
        URL.revokeObjectURL(videoUrl)
      }

      return { fileHandle, file, metadata }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // 用户取消选择
        return null
      }
      throw error
    }
  }

  // 获取视频元数据
  private getVideoMetadata(videoUrl: string): Promise<{ duration: number; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      
      video.onloadedmetadata = () => {
        resolve({
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight
        })
        video.remove()
      }
      
      video.onerror = () => {
        reject(new Error('无法加载视频元数据'))
        video.remove()
      }
      
      video.src = videoUrl
    })
  }

  // 保存文件句柄到 IndexedDB
  async saveFileHandle(projectId: string, fileHandle: FileSystemFileHandle, metadata: VideoFileMetadata): Promise<void> {
    const db = await this.initDB()
    const id = `project-${projectId}`
    
    const fileHandleData: FileHandleData = {
      id,
      fileHandle,
      metadata,
      createdAt: new Date(),
      lastAccessedAt: new Date()
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.put(fileHandleData)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // 获取项目的文件句柄
  async getFileHandle(projectId: string): Promise<FileHandleData | null> {
    const db = await this.initDB()
    const id = `project-${projectId}`

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.get(id)

      request.onsuccess = () => {
        const result = request.result
        if (result) {
          // 更新最后访问时间
          this.updateLastAccessedTime(projectId).catch(() => {})
        }
        resolve(result || null)
      }
      request.onerror = () => reject(request.error)
    })
  }

  // 检查并请求文件访问权限
  async requestFileAccess(fileHandle: FileSystemFileHandle): Promise<'granted' | 'denied'> {
    try {
      // 检查当前权限状态
      if (!fileHandle.queryPermission) {
        return 'granted' // 假设支持但没有权限API
      }
      const permission = await fileHandle.queryPermission({ mode: 'read' })
      
      if (permission === 'granted') {
        return 'granted'
      }

      // 请求权限
      if (!fileHandle.requestPermission) {
        return 'denied'
      }
      const requestResult = await fileHandle.requestPermission({ mode: 'read' })
      if (requestResult === 'prompt') {
        return 'denied' // 将 prompt 状态视为 denied
      }
      return requestResult as 'granted' | 'denied'
    } catch (error) {
      console.error('请求文件访问权限失败:', error)
      return 'denied'
    }
  }

  // 尝试获取项目的视频文件
  async getProjectVideoFile(projectId: string): Promise<{ file: File; metadata: VideoFileMetadata; fileHandle: FileSystemFileHandle } | null> {
    try {
      const handleData = await this.getFileHandle(projectId)
      if (!handleData) {
        return null
      }

      const permission = await this.requestFileAccess(handleData.fileHandle)
      if (permission !== 'granted') {
        throw new Error('文件访问权限被拒绝')
      }

      const file = await handleData.fileHandle.getFile()

      // 验证文件对象
      if (!(file as any instanceof File) && !(file as any instanceof Blob)) {
        throw new Error('获取的文件对象类型无效')
      }
      
      // 验证文件是否是预期的文件（通过大小和修改时间）
      if (file.size !== handleData.metadata.size || file.lastModified !== handleData.metadata.lastModified) {
        throw new Error('文件已被修改或替换')
      }
      

      return {
        file,
        metadata: handleData.metadata,
        fileHandle: handleData.fileHandle
      }
    } catch (error) {
      console.error('获取项目视频文件失败:', error)
      throw error
    }
  }

  // 删除项目的文件句柄
  async removeFileHandle(projectId: string): Promise<void> {
    const db = await this.initDB()
    const id = `project-${projectId}`

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.delete(id)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // 更新最后访问时间
  private async updateLastAccessedTime(projectId: string): Promise<void> {
    try {
      const db = await this.initDB()
      const id = `project-${projectId}`

      const transaction = db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      
      const getRequest = store.get(id)
      getRequest.onsuccess = () => {
        const data = getRequest.result
        if (data) {
          data.lastAccessedAt = new Date()
          store.put(data)
        }
      }
    } catch (error) {
      // 忽略更新失败，不影响主要功能
    }
  }

  // 清理旧的文件句柄（可选的清理方法）
  async cleanupOldHandles(olderThanDays: number = 30): Promise<number> {
    const db = await this.initDB()
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const index = store.index('lastAccessedAt')
      
      let deletedCount = 0
      const request = index.openCursor(IDBKeyRange.upperBound(cutoffDate))
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          cursor.delete()
          deletedCount++
          cursor.continue()
        } else {
          resolve(deletedCount)
        }
      }
      
      request.onerror = () => reject(request.error)
    })
  }

  // 获取存储统计信息
  async getStorageStats(): Promise<{ totalHandles: number; oldestAccess: Date | null; newestAccess: Date | null }> {
    const db = await this.initDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.getAll()

      request.onsuccess = () => {
        const results = request.result as FileHandleData[]
        const totalHandles = results.length
        
        let oldestAccess: Date | null = null
        let newestAccess: Date | null = null
        
        if (results.length > 0) {
          const accessTimes = results.map(r => new Date(r.lastAccessedAt))
          oldestAccess = new Date(Math.min(...accessTimes.map(d => d.getTime())))
          newestAccess = new Date(Math.max(...accessTimes.map(d => d.getTime())))
        }

        resolve({ totalHandles, oldestAccess, newestAccess })
      }
      
      request.onerror = () => reject(request.error)
    })
  }
}

// 导出单例实例
export const fileHandleService = new FileHandleService()
export default fileHandleService
export type { VideoFileMetadata, FileHandleData }