import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authenticatedFetch: vi.fn(),
}))

const workflowIdentity = {
  workflowRunId: '11111111-1111-4111-8111-111111111111',
  workflowStepId: 'transcribe-upload',
  workflowInputHash: 'a'.repeat(64),
  clientInstanceId: 'web.test-client',
}

vi.mock('@/features/auth/services/authService', () => ({
  authenticatedFetch: mocks.authenticatedFetch,
}))

import {
  buildDashScopeTempObjectKey,
  dashscopeTempFileService,
  type DashScopeUploadPolicyResponse
} from './dashscopeTempFileService'

class MockXMLHttpRequest {
  static instances: MockXMLHttpRequest[] = []

  status = 0
  statusText = 'OK'
  method?: string
  url?: string
  formData?: FormData
  uploadListeners: Record<string, Array<(event: ProgressEvent) => void>> = {}
  listeners: Record<string, Array<() => void>> = {}
  upload = {
    addEventListener: (name: string, handler: (event: ProgressEvent) => void) => {
      this.uploadListeners[name] ??= []
      this.uploadListeners[name].push(handler)
    }
  }

  constructor() {
    MockXMLHttpRequest.instances.push(this)
  }

  addEventListener(name: string, handler: () => void) {
    this.listeners[name] ??= []
    this.listeners[name].push(handler)
  }

  open(method: string, url: string) {
    this.method = method
    this.url = url
  }

  send(formData: FormData) {
    this.formData = formData
    this.status = 200
    this.uploadListeners.progress?.forEach(listener => {
      listener({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent)
    })
    this.listeners.load?.forEach(listener => listener())
  }
}

describe('dashscopeTempFileService', () => {
  beforeEach(() => {
    MockXMLHttpRequest.instances = []
    vi.stubGlobal('fetch', vi.fn())
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest as unknown as typeof XMLHttpRequest)
    vi.stubGlobal('crypto', {
      randomUUID: () => 'uuid-1234'
    })
    mocks.authenticatedFetch.mockReset()
    mocks.authenticatedFetch.mockImplementation(async (
      input: RequestInfo | URL,
      init?: RequestInit,
      options?: { accessToken?: string | null }
    ) => {
      const headers = {
        ...(init?.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${options?.accessToken ?? 'test-token'}`
      }
      return fetch(input, { ...init, headers })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('buildDashScopeTempObjectKey 会保留扩展名并追加唯一文件名', () => {
    expect(buildDashScopeTempObjectKey('dashscope-instant/tmp', 'voice.mp3')).toBe(
      'dashscope-instant/tmp/uuid-1234.mp3'
    )
  })

  it('uploadAudioFile 会获取凭证并上传到 DashScope 临时存储', async () => {
    const policy: DashScopeUploadPolicyResponse = {
      provider: 'funasr',
      model: 'fun-asr',
      upload_host: 'https://dashscope-upload.example.com',
      upload_dir: 'dashscope-instant/tmp',
      oss_access_key_id: 'access-key',
      policy: 'policy-value',
      signature: 'signature-value',
      x_oss_object_acl: 'default',
      x_oss_forbid_overwrite: 'true',
      expires_in_hours: 48,
      requested_at: '2026-04-20T00:00:00Z',
      required_headers: {
        'X-DashScope-OssResourceResolve': 'enable'
      }
    }

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => policy
    } as Response)

    const progress = vi.fn()
    const file = new File(['audio'], 'voice.mp3', { type: 'audio/mpeg' })
    const result = await dashscopeTempFileService.uploadAudioFile(file, 'funasr', progress)

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/tools/dashscope/temp-files/upload-policy'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token'
        })
      })
    )

    expect(result).toEqual({
      objectKey: 'dashscope-instant/tmp/uuid-1234.mp3',
      ossUrl: 'oss://dashscope-instant/tmp/uuid-1234.mp3'
    })

    expect(progress).toHaveBeenCalledWith(50)

    const xhr = MockXMLHttpRequest.instances[0]
    expect(xhr.method).toBe('POST')
    expect(xhr.url).toBe('https://dashscope-upload.example.com')
    expect(xhr.formData?.get('OSSAccessKeyId')).toBe('access-key')
    expect(xhr.formData?.get('Signature')).toBe('signature-value')
    expect(xhr.formData?.get('policy')).toBe('policy-value')
    expect(xhr.formData?.get('x-oss-object-acl')).toBe('default')
    expect(xhr.formData?.get('x-oss-forbid-overwrite')).toBe('true')
    expect(xhr.formData?.get('key')).toBe('dashscope-instant/tmp/uuid-1234.mp3')
    expect(xhr.formData?.get('success_action_status')).toBe('200')
    expect(xhr.formData?.get('file')).toBeInstanceOf(File)
  })

  it('uploadImageFile 会使用 qwen-vision 获取临时存储凭证', async () => {
    const policy: DashScopeUploadPolicyResponse = {
      provider: 'qwen-vision',
      model: 'qwen3.6-plus',
      upload_host: 'https://dashscope-upload.example.com',
      upload_dir: 'dashscope-instant/tmp',
      oss_access_key_id: 'access-key',
      policy: 'policy-value',
      signature: 'signature-value',
      x_oss_object_acl: 'default',
      x_oss_forbid_overwrite: 'true',
      expires_in_hours: 48,
      requested_at: '2026-04-20T00:00:00Z',
      required_headers: {
        'X-DashScope-OssResourceResolve': 'enable'
      }
    }

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => policy
    } as Response)

    const file = new File(['image'], 'timeline.png', { type: 'image/png' })
    const workflowIdentity = {
      workflowRunId: '0185f76a-9e4d-7ed6-9ef7-9f34e7e1b6fd',
      workflowStepId: 'analyze-timeline-images',
      workflowInputHash: 'a'.repeat(64),
      clientInstanceId: 'web.tab-1',
    }
    const result = await dashscopeTempFileService.uploadImageFile(file, 'manual-token', undefined, undefined, workflowIdentity)

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/tools/dashscope/temp-files/upload-policy'),
      expect.objectContaining({
        body: JSON.stringify({
          provider: 'qwen-vision',
          workflow_run_id: workflowIdentity.workflowRunId,
          workflow_step_id: workflowIdentity.workflowStepId,
          workflow_input_hash: workflowIdentity.workflowInputHash,
          client_instance_id: workflowIdentity.clientInstanceId,
        }),
        headers: expect.objectContaining({
          Authorization: 'Bearer manual-token'
        })
      })
    )
    expect(result.ossUrl).toBe('oss://dashscope-instant/tmp/uuid-1234.png')
  })

  it('uploadAudioFile 在请求 FunASR 上传凭证时发送工作流身份', async () => {
    const policy: DashScopeUploadPolicyResponse = {
      provider: 'funasr',
      model: 'fun-asr',
      upload_host: 'https://dashscope-upload.example.com',
      upload_dir: 'dashscope-instant/tmp',
      oss_access_key_id: 'access-key',
      policy: 'policy-value',
      signature: 'signature-value',
      x_oss_object_acl: 'default',
      x_oss_forbid_overwrite: 'true',
      expires_in_hours: 48,
      requested_at: '2026-04-20T00:00:00Z',
      required_headers: {},
    }
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => policy } as Response)

    await dashscopeTempFileService.uploadAudioFile(
      new File(['audio'], 'voice.mp3', { type: 'audio/mpeg' }),
      'funasr',
      undefined,
      undefined,
      undefined,
      workflowIdentity,
    )

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/tools/dashscope/temp-files/upload-policy'),
      expect.objectContaining({
        body: JSON.stringify({
          provider: 'funasr',
          workflow_run_id: workflowIdentity.workflowRunId,
          workflow_step_id: workflowIdentity.workflowStepId,
          workflow_input_hash: workflowIdentity.workflowInputHash,
          client_instance_id: workflowIdentity.clientInstanceId,
        }),
      }),
    )
  })
})
