const SILICONFLOW_API_BASE_URL = 'https://api.siliconflow.cn/v1'

export interface SiliconFlowVoice {
  model: string
  customName: string
  text: string
  uri: string
}

export interface SiliconFlowVoiceListResponse {
  result?: SiliconFlowVoice[]
  results?: SiliconFlowVoice[]
}

export interface UploadVoiceInput {
  apiKey: string
  file: File
  model: string
  customName: string
  text: string
}

export interface CreateSpeechInput {
  apiKey: string
  model: string
  input: string
  voice: string
  responseFormat: 'mp3' | 'opus' | 'wav' | 'pcm'
  sampleRate?: number
  stream: boolean
  speed?: number
  gain?: number
  maxTokens?: number
}

export interface SpeechResult {
  blob: Blob
  traceId: string | null
}

export interface TranscriptionInput {
  apiKey: string
  file: File
  model: 'FunAudioLLM/SenseVoiceSmall' | 'TeleAI/TeleSpeechASR'
}

export interface TranscriptionResult {
  text: string
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
  throw new Error(payload ?? `SiliconFlow 请求失败：HTTP ${response.status}`)
}

async function requestJson<T>(path: string, apiKey: string, init: RequestInit = {}) {
  const response = await fetch(`${SILICONFLOW_API_BASE_URL}${path}`, {
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

export const siliconflowTtsAdminService = {
  async listVoices(apiKey: string): Promise<SiliconFlowVoice[]> {
    const data = await requestJson<SiliconFlowVoiceListResponse>('/audio/voice/list', apiKey)
    if (Array.isArray(data.result)) {
      return data.result
    }

    return Array.isArray(data.results) ? data.results : []
  },

  async uploadVoice(input: UploadVoiceInput): Promise<{ uri: string }> {
    const formData = new FormData()
    formData.append('file', input.file)
    formData.append('model', input.model.trim())
    formData.append('customName', input.customName.trim())
    formData.append('text', input.text.trim())

    const response = await fetch(`${SILICONFLOW_API_BASE_URL}/uploads/audio/voice`, {
      method: 'POST',
      headers: {
        Authorization: buildAuthHeader(input.apiKey),
      },
      body: formData,
    })

    await ensureOk(response)
    return await response.json() as { uri: string }
  },

  async deleteVoice(apiKey: string, uri: string): Promise<string> {
    return await requestJson<string>('/audio/voice/deletions', apiKey, {
      method: 'POST',
      body: JSON.stringify({ uri }),
    })
  },

  async createSpeech(input: CreateSpeechInput): Promise<SpeechResult> {
    const payload: Record<string, unknown> = {
      model: input.model.trim(),
      input: input.input,
      voice: input.voice.trim(),
      response_format: input.responseFormat,
      stream: input.stream,
    }

    if (input.sampleRate) payload.sample_rate = input.sampleRate
    if (input.speed) payload.speed = input.speed
    if (input.gain !== undefined) payload.gain = input.gain
    if (input.maxTokens) payload.max_tokens = input.maxTokens

    const response = await fetch(`${SILICONFLOW_API_BASE_URL}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: buildAuthHeader(input.apiKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    await ensureOk(response)

    return {
      blob: await response.blob(),
      traceId: response.headers.get('x-siliconcloud-trace-id'),
    }
  },

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    const formData = new FormData()
    formData.append('file', input.file)
    formData.append('model', input.model)

    const response = await fetch(`${SILICONFLOW_API_BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: buildAuthHeader(input.apiKey),
      },
      body: formData,
    })

    await ensureOk(response)
    return await response.json() as TranscriptionResult
  },
}

export default siliconflowTtsAdminService
