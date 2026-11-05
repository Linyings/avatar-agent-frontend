/**
 * 全局类型声明
 * 用于扩展浏览器 API 和第三方库的类型定义
 */

// 扩展全局类型定义
declare global {
  // File System Access API 类型声明
  interface FileSystemFileHandle {
    queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>
    requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>
  }

  interface FilePickerOptions {
    types?: Array<{
      description?: string
      accept: Record<string, string[]>
    }>
    excludeAcceptAllOption?: boolean
    multiple?: boolean
  }

  interface Window {
    showOpenFilePicker?: (options?: FilePickerOptions) => Promise<FileSystemFileHandle[]>
  }

  // 扩展 DOMException 以支持 instanceof 检查
  interface DOMException {
    name: string
    message: string
  }
}

export {}