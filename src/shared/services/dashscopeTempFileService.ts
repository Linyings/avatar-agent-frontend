import { authenticatedFetch } from '@/features/auth/services/authService'
import { bindAbortSignal, createAbortError, throwIfAborted } from '@/shared/utils/abort'
import { withWorkflowIdentityInJson, type WorkflowRequestIdentity } from '@/shared/workflowRuns/identity'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export type DashScopeTempFileProvider = 'qwen3' | 'funasr' | 'qwen-vision'
export type DashScopeAsrProvider = 'qwen3' | 'funasr'

export interface DashScopeUploadPolicyResponse {
  provider: DashScopeTempFileProvider
  model: string
  upload_host: string
  upload_dir: string
  oss_access_key_id: string
  policy: string
  signature: string
  x_oss_object_acl: string
  x_oss_forbid_overwrite: string
  expires_in_hours: number
  requested_at: string
  required_headers: Record<string, string>
}

export interface DashScopeTempUploadResult {
  objectKey: string
  ossUrl: string
}

export type UploadProgressCallback = (percent: number) => void

const AUDIO_UPLOAD_MAX_ATTEMPTS = 3

class DashScopeUploadError extends Error {
  readonly retryable: boolean
  readonly loadedBytes?: number
  readonly totalBytes?: number

  constructor(
    message: string,
    retryable: boolean,
    loadedBytes?: number,
    totalBytes?: number,
  ) {
    super(message)
    this.name = 'DashScopeUploadError'
    this.retryable = retryable
    this.loadedBytes = loadedBytes
    this.totalBytes = totalBytes
  }
}


const getFileExtension = (fileName: string): string => {
  const lastDotIndex = fileName.lastIndexOf('.')
  return lastDotIndex >= 0 ? fileName.slice(lastDotIndex) : ''
}

const createUniqueId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

export const buildDashScopeTempObjectKey = (uploadDir: string, fileName: string): string => {
  const normalizedDir = uploadDir.replace(/\/+$/, '')
  const extension = getFileExtension(fileName)
  return `${normalizedDir}/${createUniqueId()}${extension}`
}

export const dashscopeTempFileService = {
  async getUploadPolicy(
    provider: DashScopeTempFileProvider,
    accessToken?: string | null,
    signal?: AbortSignal,
    workflowIdentity?: WorkflowRequestIdentity,
  ): Promise<DashScopeUploadPolicyResponse> {
    throwIfAborted(signal, '上传已被取消')
    const body = workflowIdentity
      ? withWorkflowIdentityInJson({ provider }, workflowIdentity)
      : { provider }
    const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/tools/dashscope/temp-files/upload-policy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal
    }, {
      accessToken,
      missingTokenMessage: '未找到访问令牌，请先登录'
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`获取 DashScope 上传凭证失败（${response.status}）: ${errorText}`)
    }

    return await response.json()
  },

  async uploadWithPolicy(
    file: File,
    policy: DashScopeUploadPolicyResponse,
    onProgress?: UploadProgressCallback,
    signal?: AbortSignal
  ): Promise<DashScopeTempUploadResult> {
    throwIfAborted(signal, '上传已被取消')
    const objectKey = buildDashScopeTempObjectKey(policy.upload_dir, file.name)

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      let loadedBytes: number | undefined
      let totalBytes: number | undefined
      let settled = false
      const cleanupAbortListener = bindAbortSignal(signal, () => {
        xhr.abort()
      })
      const settle = (callback: () => void) => {
        if (settled) return
        settled = true
        cleanupAbortListener()
        callback()
      }

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          loadedBytes = event.loaded
          totalBytes = event.total
          if (onProgress) {
            const percent = Math.round((event.loaded / event.total) * 100)
            onProgress(percent)
          }
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          settle(resolve)
          return
        }

        const retryable = xhr.status === 408 || xhr.status === 429 || xhr.status >= 500
        settle(() => reject(new DashScopeUploadError(
          `上传到 DashScope 临时存储失败（HTTP ${xhr.status}）: ${xhr.statusText}`,
          retryable,
          loadedBytes,
          totalBytes,
        )))
      })

      xhr.addEventListener('error', () => {
        settle(() => reject(new DashScopeUploadError(
          '网络错误，上传到 DashScope 临时存储失败',
          true,
          loadedBytes,
          totalBytes,
        )))
      })

      xhr.addEventListener('abort', () => {
        settle(() => reject(createAbortError('上传已被取消')))
      })

      const formData = new FormData()
      formData.append('OSSAccessKeyId', policy.oss_access_key_id)
      formData.append('Signature', policy.signature)
      formData.append('policy', policy.policy)
      formData.append('x-oss-object-acl', policy.x_oss_object_acl)
      formData.append('x-oss-forbid-overwrite', policy.x_oss_forbid_overwrite)
      formData.append('key', objectKey)
      formData.append('success_action_status', '200')
      formData.append('file', file)

      xhr.open('POST', policy.upload_host)
      xhr.send(formData)
    })

    return {
      objectKey,
      ossUrl: `oss://${objectKey}`
    }
  },

  async uploadAudioFile(
    file: File,
    provider: DashScopeAsrProvider,
    onProgress?: UploadProgressCallback,
    accessToken?: string | null,
    signal?: AbortSignal,
    workflowIdentity?: WorkflowRequestIdentity,
  ): Promise<DashScopeTempUploadResult> {
    let lastError: DashScopeUploadError | undefined
    for (let attempt = 1; attempt <= AUDIO_UPLOAD_MAX_ATTEMPTS; attempt += 1) {
      throwIfAborted(signal, '上传已被取消')
      const policy = await this.getUploadPolicy(provider, accessToken, signal, workflowIdentity)
      try {
        return await this.uploadWithPolicy(file, policy, onProgress, signal)
      } catch (error) {
        if (!(error instanceof DashScopeUploadError) || !error.retryable) throw error
        lastError = error
      }
    }

    const progress = lastError?.loadedBytes !== undefined && lastError.totalBytes !== undefined
      ? `${lastError.loadedBytes}/${lastError.totalBytes} 字节`
      : '未知'
    throw new Error(`上传到 DashScope 临时存储失败：已尝试 ${AUDIO_UPLOAD_MAX_ATTEMPTS} 次，最后一次上传进度 ${progress}`)
  },

  async uploadImageFile(
    file: File,
    accessToken?: string | null,
    onProgress?: UploadProgressCallback,
    signal?: AbortSignal,
    workflowIdentity?: WorkflowRequestIdentity,
  ): Promise<DashScopeTempUploadResult> {
    const policy = await this.getUploadPolicy('qwen-vision', accessToken, signal, workflowIdentity)
    return await this.uploadWithPolicy(file, policy, onProgress, signal)
  }
}

export default dashscopeTempFileService
