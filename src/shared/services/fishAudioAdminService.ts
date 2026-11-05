const FISH_AUDIO_API_BASE_URL = '/api/fish-audio-proxy'

export type FishAudioVisibility = 'public' | 'unlist' | 'private'
export type FishAudioTtsModel = 's1' | 's2-pro'
export type FishAudioFormat = 'mp3' | 'wav' | 'pcm' | 'opus'
export type FishAudioLatency = 'normal' | 'balanced' | 'low'

export interface FishAudioModel {
  _id: string
  type: 'svc' | 'tts'
  title: string
  description: string
  cover_image: string
  state: 'created' | 'training' | 'trained' | 'failed'
  tags: string[]
  created_at: string
  updated_at: string
  visibility: FishAudioVisibility
  train_mode?: 'fast' | 'full'
  samples?: unknown[]
  languages?: string[]
  default_text?: string
}

export interface FishAudioModelListResponse {
  total: number
  items: FishAudioModel[]
}

export interface ListFishAudioModelsInput {
  apiKey: string
  pageSize?: number
  pageNumber?: number
  title?: string
  self?: boolean
}

export interface CreateFishAudioModelInput {
  apiKey: string
  title: string
  voices: File[]
  texts?: string[]
  visibility: FishAudioVisibility
  description?: string
  tags?: string[]
  enhanceAudioQuality: boolean
  generateSample: boolean
}

export interface UpdateFishAudioModelInput {
  apiKey: string
  id: string
  title?: string
  description?: string
  visibility?: FishAudioVisibility
  tags?: string[]
}

export interface CreateFishAudioSpeechInput {
  apiKey: string
  ttsModel: FishAudioTtsModel
  text: string
  referenceId: string
  format: FishAudioFormat
  sampleRate?: number
  mp3Bitrate?: 64 | 128 | 192
  latency: FishAudioLatency
  temperature?: number
  topP?: number
  speed?: number
  volume?: number
}

export interface FishAudioSpeechResult {
  blob: Blob
}

const buildAuthHeader = (apiKey: string) => {
  const trimmed = apiKey.trim().replace(/^['"]|['"]$/g, '')
  const headerMatch = trimmed.match(/authorization:\s*bearer\s+(.+)$/i)
  const bearerMatch = trimmed.match(/^bearer\s+(.+)$/i)
  const token = (headerMatch?.[1] ?? bearerMatch?.[1] ?? trimmed)
    .trim()
    .replace(/^['"]|['"]$/g, '')

  return `Bearer ${token}`
}

const parseErrorPayload = async (response: Response) => {
  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    try {
      const data = await response.json() as Record<string, unknown>
      const message = data.message ?? data.detail ?? data.error

      if (typeof message === 'string') {
        return message
      }

      return JSON.stringify(data)
    } catch {
      return undefined
    }
  }

  try {
    const text = await response.text()
    return text.trim() ? text : undefined
  } catch {
    return undefined
  }
}

const ensureOk = async (response: Response) => {
  if (response.ok) {
    return
  }

  const payload = await parseErrorPayload(response)
  throw new Error(payload ?? `Fish.audio 请求失败：HTTP ${response.status}`)
}

async function requestJson<T>(path: string, apiKey: string, init: RequestInit = {}) {
  const response = await fetch(`${FISH_AUDIO_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: buildAuthHeader(apiKey),
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  await ensureOk(response)
  return await response.json() as T
}

const appendStringArray = (formData: FormData, key: string, values?: string[]) => {
  values?.filter(Boolean).forEach((value) => formData.append(key, value))
}

export const fishAudioAdminService = {
  async listModels(input: ListFishAudioModelsInput): Promise<FishAudioModelListResponse> {
    const params = new URLSearchParams()
    params.set('page_size', String(input.pageSize ?? 100))
    params.set('page_number', String(input.pageNumber ?? 1))
    params.set('self', String(input.self ?? true))

    if (input.title?.trim()) {
      params.set('title', input.title.trim())
    }

    return await requestJson<FishAudioModelListResponse>(`/model?${params.toString()}`, input.apiKey)
  },

  async createModel(input: CreateFishAudioModelInput): Promise<FishAudioModel> {
    const formData = new FormData()
    formData.append('type', 'tts')
    formData.append('title', input.title.trim())
    formData.append('train_mode', 'fast')
    formData.append('visibility', input.visibility)
    formData.append('enhance_audio_quality', String(input.enhanceAudioQuality))
    formData.append('generate_sample', String(input.generateSample))

    if (input.description?.trim()) {
      formData.append('description', input.description.trim())
    }

    input.voices.forEach((file) => formData.append('voices', file))
    appendStringArray(formData, 'texts', input.texts)
    appendStringArray(formData, 'tags', input.tags)

    const response = await fetch(`${FISH_AUDIO_API_BASE_URL}/model`, {
      method: 'POST',
      headers: {
        Authorization: buildAuthHeader(input.apiKey),
      },
      body: formData,
    })

    await ensureOk(response)
    return await response.json() as FishAudioModel
  },

  async getModel(apiKey: string, id: string): Promise<FishAudioModel> {
    return await requestJson<FishAudioModel>(`/model/${encodeURIComponent(id)}`, apiKey)
  },

  async updateModel(input: UpdateFishAudioModelInput): Promise<void> {
    const payload: Record<string, unknown> = {}

    if (input.title !== undefined) payload.title = input.title
    if (input.description !== undefined) payload.description = input.description
    if (input.visibility !== undefined) payload.visibility = input.visibility
    if (input.tags !== undefined) payload.tags = input.tags

    const response = await fetch(`${FISH_AUDIO_API_BASE_URL}/model/${encodeURIComponent(input.id)}`, {
      method: 'PATCH',
      headers: {
        Authorization: buildAuthHeader(input.apiKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    await ensureOk(response)
  },

  async deleteModel(apiKey: string, id: string): Promise<void> {
    const response = await fetch(`${FISH_AUDIO_API_BASE_URL}/model/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        Authorization: buildAuthHeader(apiKey),
      },
    })

    await ensureOk(response)
  },

  async createSpeech(input: CreateFishAudioSpeechInput): Promise<FishAudioSpeechResult> {
    const payload: Record<string, unknown> = {
      text: input.text,
      reference_id: input.referenceId.trim(),
      format: input.format,
      latency: input.latency,
      normalize: true,
      prosody: {
        speed: input.speed ?? 1,
        volume: input.volume ?? 0,
        normalize_loudness: true,
      },
    }

    if (input.sampleRate) payload.sample_rate = input.sampleRate
    if (input.format === 'mp3' && input.mp3Bitrate) payload.mp3_bitrate = input.mp3Bitrate
    if (input.temperature !== undefined) payload.temperature = input.temperature
    if (input.topP !== undefined) payload.top_p = input.topP

    const response = await fetch(`${FISH_AUDIO_API_BASE_URL}/v1/tts`, {
      method: 'POST',
      headers: {
        Authorization: buildAuthHeader(input.apiKey),
        'Content-Type': 'application/json',
        model: input.ttsModel,
      },
      body: JSON.stringify(payload),
    })

    await ensureOk(response)
    return { blob: await response.blob() }
  },
}

export default fishAudioAdminService
