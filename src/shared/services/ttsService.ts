import type { TTSResult, ServiceLevel } from '@/shared/types'
import type { BuiltInVoice } from '@/shared/types'
import { authenticatedFetch } from '@/features/auth/services/authService'
import systemService from './systemService'
import { isAbortError, throwIfAborted } from '@/shared/utils/abort'
import { normalizeLocalizedTextMap } from '@/shared/i18n/localizedText'
import {
  validateWorkflowRequestIdentity,
  type WorkflowRequestIdentity,
} from '@/shared/workflowRuns/identity'

// TTS API 配置
const TTS_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
const BUILT_IN_TTS_BASE_URL = 'https://store.narratoai.cn/tts'

export const BUILT_IN_TTS_VOICES: BuiltInVoice[] = [
  {
    name: '董宇辉',
    uri: 'speech:dong-yuhui-zh-male:clzkyf4vy00e5qr6hywum4u84:cwdmjyebcnnmfrwihqmd',
    sample_url: `${BUILT_IN_TTS_BASE_URL}/dong-yuhui-zh-male.mp3`,
    type: 'basic',
    gender: 'male',
    language: 'zh'
  },
  {
    name: '仿真人',
    uri: 'speech:fangzhenren-ad-fake-news-zh-male:clzkyf4vy00e5qr6hywum4u84:lkowsszmlxioiwbemcsr',
    sample_url: `${BUILT_IN_TTS_BASE_URL}/fangzhenren-ad-fake-news-zh-male.mp3`,
    type: 'basic',
    gender: 'male',
    language: 'zh'
  },
  {
    name: '风吟纪录片解说',
    uri: 'speech:fengyin-jilupian-jieshuo-zh-male:clzkyf4vy00e5qr6hywum4u84:ukpxipwsoofmwfusolls',
    sample_url: `${BUILT_IN_TTS_BASE_URL}/fengyin-jilupian-jieshuo-zh-male.mp3`,
    type: 'basic',
    gender: 'male',
    language: 'zh'
  },
  {
    name: '顾我电影解说',
    uri: 'speech:guwo-dianying-jieshuo-zh-male:clzkyf4vy00e5qr6hywum4u84:xnvbzyaxffieyetmxtvc',
    sample_url: `${BUILT_IN_TTS_BASE_URL}/guwo-dianying-jieshuo-zh-male.mp3`,
    type: 'basic',
    gender: 'male',
    language: 'zh'
  },
  {
    name: '贾小军',
    uri: 'speech:jia-xiaojun-final-zh-male:clzkyf4vy00e5qr6hywum4u84:nesyufuydbvhvvagjkjr',
    sample_url: `${BUILT_IN_TTS_BASE_URL}/jia-xiaojun-final-zh-male.mp3`,
    type: 'basic',
    gender: 'male',
    language: 'zh'
  },
  {
    name: '军事解说',
    uri: 'speech:junshi-zh-male:clzkyf4vy00e5qr6hywum4u84:zlainwnkrifbltvjivzw',
    sample_url: `${BUILT_IN_TTS_BASE_URL}/junshi-zh-male.mp3`,
    type: 'basic',
    gender: 'male',
    language: 'zh'
  },
  {
    name: '祁同伟',
    uri: 'speech:qi-tongwei-v2-zh-male:clzkyf4vy00e5qr6hywum4u84:drfbemtppnflhfpcpbdd',
    sample_url: `${BUILT_IN_TTS_BASE_URL}/qi-tongwei-v2-zh-male.mp3`,
    type: 'basic',
    gender: 'male',
    language: 'zh'
  },
  {
    name: '赛马娘曼波欧耶版',
    uri: 'speech:saima-niang-mambo-oye-zh-female:clzkyf4vy00e5qr6hywum4u84:vmlnorrngoqknteainas',
    sample_url: `${BUILT_IN_TTS_BASE_URL}/saima-niang-mambo-oye-zh-female.mp3`,
    type: 'basic',
    gender: 'female',
    language: 'zh'
  }
]

type PublicTtsVoicesSetting = {
  voices?: unknown
}

const normalizeBuiltInVoice = (voice: unknown): BuiltInVoice | null => {
  if (!voice || typeof voice !== 'object') return null

  const record = voice as Record<string, unknown>
  const uri = typeof record.uri === 'string' ? record.uri.trim() : ''
  const name = typeof record.name === 'string' ? record.name.trim() : ''

  if (!uri || !name) return null
  const name_i18n = normalizeLocalizedTextMap(record.name_i18n)

  return {
    uri,
    name,
    ...(name_i18n ? { name_i18n } : {}),
    sample_url: typeof record.sample_url === 'string' ? record.sample_url.trim() : '',
    type: record.type === 'advanced' ? 'advanced' : 'basic',
    gender: typeof record.gender === 'string' ? record.gender.trim() : undefined,
    language: typeof record.language === 'string' ? record.language.trim() : undefined,
  }
}

/**
 * 验证 TTS API 配置
 */
export function validateTTSConfig(): boolean {
  return !!(TTS_API_BASE_URL && TTS_API_BASE_URL.trim().length > 0)
}

/**
 * 获取 TTS 配置状态
 */
export function getTTSConfigStatus() {
  return {
    hasBackendApi: validateTTSConfig(),
    apiBaseUrl: TTS_API_BASE_URL
  }
}

/**
 * 下载音频文件
 */
export function downloadAudio(audioBlob: Blob, filename: string = 'tts-audio.mp3') {
  const url = URL.createObjectURL(audioBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * 释放音频 URL 资源
 */
export function revokeAudioURL(audioUrl: string) {
  URL.revokeObjectURL(audioUrl)
}

/**
 * 常用语音预设
 */
export const VOICE_PRESETS = [
  {
    name: '男声',
    value: 'FunAudioLLM/CosyVoice2-0.5B:alex',
    description: '标准普通话男声'
  },
  {
    name: '女声',
    value: 'FunAudioLLM/CosyVoice2-0.5B:anna',
    description: '标准普通话女声'
  }
]

/**
 * 上传参考音频，返回 voice_uri（用于批量生成优化）
 * @param file 参考音频文件
 * @param service_level TTS服务等级: basic / premium，默认 basic
 * @returns voice_uri 字符串
 */
export async function uploadReferenceVoice(file: File, service_level: ServiceLevel = 'basic'): Promise<string> {
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('service_level', service_level)

    const response = await authenticatedFetch(`${TTS_API_BASE_URL}/api/v1/tools/upload-reference-voice`, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`上传参考音频失败: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const result = await response.json()
    if (!result.voice_uri) {
      throw new Error('API 未返回 voice_uri')
    }

    return result.voice_uri
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : '上传参考音频失败')
  }
}

/**
 * 使用 voice_uri 生成语音（批量生成优化版本）
 * @param text 需要转换的文本
 * @param voiceUri 参考音频的 URI（通过 uploadReferenceVoice 获取）
 * @param options 可选配置
 * @param options.speed 语速控制（0.8-1.4倍速，默认1.0）
 * @param options.volume 音量倍数控制（0.0-2.0，默认1.0）
 * @param options.service_level TTS服务等级: basic / premium，默认 basic
 * @param options.projectId 项目 ID，用于消费流水关联项目
 */
export async function generateTTSWithVoiceUri(
  text: string,
  voiceUri: string,
  options?: {
    speed?: number
    volume?: number
    service_level?: ServiceLevel
    projectId?: string
    signal?: AbortSignal
    workflowIdentity?: WorkflowRequestIdentity
  }
): Promise<TTSResult> {
  try {
    throwIfAborted(options?.signal, '语音生成已取消')
    // 验证输入参数
    if (!text || text.trim().length === 0) {
      throw new Error('文本内容不能为空')
    }
    if (!voiceUri || voiceUri.trim().length === 0) {
      throw new Error('voice_uri 不能为空')
    }

    // 构建 FormData 请求体
    const formData = new FormData()
    formData.append('text', text.trim())
    formData.append('voice_uri', voiceUri)

    // 添加速度参数（默认 1.0，范围 0.8-1.4）
    const speed = options?.speed ?? 1.0
    formData.append('speed', speed.toString())

    // 添加音量参数（默认 1.0，范围 0.0-2.0）
    const volume = options?.volume ?? 1.0
    formData.append('volume', volume.toString())

    // 添加服务等级参数（默认 basic）
    const serviceLevel = options?.service_level ?? 'basic'
    formData.append('service_level', serviceLevel)

    if (options?.projectId?.trim()) {
      formData.append('project_id', options.projectId.trim())
    }
    if (options?.workflowIdentity) {
      const identity = validateWorkflowRequestIdentity(options.workflowIdentity)
      formData.append('workflow_run_id', identity.workflowRunId)
      formData.append('workflow_step_id', identity.workflowStepId)
      formData.append('workflow_input_hash', identity.workflowInputHash)
      formData.append('client_instance_id', identity.clientInstanceId)
    }

    const response = await authenticatedFetch(`${TTS_API_BASE_URL}/api/v1/tools/text-to-speech-with-uri`, {
      method: 'POST',
      body: formData,
      signal: options?.signal
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`TTS API 调用失败: ${response.status} ${response.statusText} - ${errorText}`)
    }

    // 获取音频数据
    const audioBlob = await response.blob()
    throwIfAborted(options?.signal, '语音生成已取消')

    if (audioBlob.size === 0) {
      throw new Error('API 返回的音频数据为空')
    }

    // 创建音频 URL
    const audioUrl = URL.createObjectURL(audioBlob)

    return {
      success: true,
      audioUrl,
      audioBlob,
      isGenerating: false
    }

  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : '语音生成失败，请稍后重试',
      isGenerating: false
    }
  }
}

/**
 * 删除临时参考音色
 * @param voiceUri 参考音频的 URI
 * @param service_level TTS服务等级: basic / premium，默认 basic
 */
export async function deleteReferenceVoice(voiceUri: string, service_level: ServiceLevel = 'basic'): Promise<void> {
  try {
    const response = await authenticatedFetch(`${TTS_API_BASE_URL}/api/v1/tools/voice/${encodeURIComponent(voiceUri)}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ service_level })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`删除参考音频失败: ${response.status} ${response.statusText} - ${errorText}`)
    }
  } catch (error) {
    console.warn('删除参考音频失败（非致命错误）:', error instanceof Error ? error.message : '删除失败')
  }
}

/**
 * 获取内置音色列表
 * @returns 内置音色列表
 */
export async function fetchBuiltInVoices(): Promise<BuiltInVoice[]> {
  try {
    const setting = await systemService.getPublicSystemSettingByKey<PublicTtsVoicesSetting>('tts_voices')
    const configuredVoices = Array.isArray(setting.value?.voices)
      ? setting.value.voices.map(normalizeBuiltInVoice).filter((voice): voice is BuiltInVoice => Boolean(voice))
      : []

    return configuredVoices.length > 0 ? configuredVoices : BUILT_IN_TTS_VOICES
  } catch (error) {
    console.warn('读取系统内置音色配置失败，使用本地默认音色:', error)
    return BUILT_IN_TTS_VOICES
  }
}

/**
 * 直接使用内置音色URI生成音频（无需上传和删除临时音色）
 * @param text 需要转换的文本
 * @param voiceUri 内置音色URI
 * @param options 可选配置
 * @param options.speed 语速控制（0.8-1.4倍速，默认1.0）
 * @param options.volume 音量倍数控制（0.0-2.0，默认1.0）
 * @param options.service_level TTS服务等级: basic / premium，默认 basic
 */
export async function generateTTSWithBuiltInVoice(
  text: string,
  voiceUri: string,
  options?: {
    speed?: number
    volume?: number
    service_level?: ServiceLevel
  }
): Promise<TTSResult> {
  // 内置音色直接使用 generateTTSWithVoiceUri，无需删除逻辑
  return await generateTTSWithVoiceUri(text, voiceUri, options)
}
