import {authenticatedFetch} from '@/features/auth/services/authService'

export type AvatarConfig = {enabled: boolean; configured: boolean; baseline_approved: boolean; message: string; provider?: string; model?: string; protocol?: string; resolution?: string; voice?: string; tts_model?: string}
export type AvatarShot = {
  id: string; angle: string; framing: string; status: string; error?: string
  submission?: string
  provider_task_id?: string; keyword?: string; text?: string
  clip: {duration: number; audio_correlation?: number}
}
export type AvatarTask = {
  id: string; status: string; stage: string; title: string; script: string
  shots: AvatarShot[]; duration: number; review_required: boolean; error?: string
  stage_seconds: Record<string, number>; baseline?: boolean
  provider?: string; model?: string
  voice?: string
}

const root = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/avatar-mvp`
async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await authenticatedFetch(root + path, init)
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.message || `请求失败（${response.status}）`)
  }
  return response
}

export const avatarMvpService = {
  async config(signal?: AbortSignal): Promise<AvatarConfig> {
    return (await request('/config', {signal})).json()
  },
  async latestForProject(projectId: string, signal?: AbortSignal): Promise<AvatarTask | null> {
    const response = await authenticatedFetch(`${root}/projects/${encodeURIComponent(projectId)}/task`, {signal})
    if (response.status === 404) return null
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error((body as {message?: string}).message || `请求失败（${response.status}）`)
    }
    return response.json()
  },
  async create(photo: File, script: string, title: string, requestId: string, projectId?: string): Promise<AvatarTask> {
    const body = new FormData()
    body.set('photo', photo)
    body.set('script', script)
    body.set('title', title)
    body.set('client_request_id', requestId)
    if (projectId) body.set('project_id', projectId)
    return (await request('/tasks', {method: 'POST', body})).json()
  },
  async get(id: string, signal?: AbortSignal): Promise<AvatarTask> {
    return (await request(`/tasks/${encodeURIComponent(id)}`, {signal})).json()
  },
  async retry(id: string): Promise<AvatarTask> {
    return (await request(`/tasks/${encodeURIComponent(id)}/retry`, {method: 'POST'})).json()
  },
  async video(id: string, signal?: AbortSignal): Promise<Blob> {
    return (await request(`/tasks/${encodeURIComponent(id)}/video`, {signal})).blob()
  },
}
