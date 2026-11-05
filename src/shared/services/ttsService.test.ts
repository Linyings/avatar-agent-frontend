import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authenticatedFetch } from '@/features/auth/services/authService'
import {
  BUILT_IN_TTS_VOICES,
  fetchBuiltInVoices,
  generateTTSWithVoiceUri,
  uploadReferenceVoice,
} from './ttsService'
import systemService from './systemService'

vi.mock('@/features/auth/services/authService', () => ({
  authenticatedFetch: vi.fn(),
}))

vi.mock('./systemService', () => ({
  default: {
    getPublicSystemSettingByKey: vi.fn(),
  },
}))

describe('ttsService 内置音色', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:tts-audio'),
    })
  })

  it('固定提供项目配音使用的 8 个内置音色', async () => {
    vi.mocked(systemService.getPublicSystemSettingByKey).mockRejectedValue(new Error('not configured'))

    await expect(fetchBuiltInVoices()).resolves.toEqual(BUILT_IN_TTS_VOICES)

    expect(BUILT_IN_TTS_VOICES).toEqual([
      {
        name: '董宇辉',
        uri: 'speech:dong-yuhui-zh-male:clzkyf4vy00e5qr6hywum4u84:cwdmjyebcnnmfrwihqmd',
        sample_url: 'https://store.narratoai.cn/tts/dong-yuhui-zh-male.mp3',
        type: 'basic',
        gender: 'male',
        language: 'zh',
      },
      {
        name: '仿真人',
        uri: 'speech:fangzhenren-ad-fake-news-zh-male:clzkyf4vy00e5qr6hywum4u84:lkowsszmlxioiwbemcsr',
        sample_url: 'https://store.narratoai.cn/tts/fangzhenren-ad-fake-news-zh-male.mp3',
        type: 'basic',
        gender: 'male',
        language: 'zh',
      },
      {
        name: '风吟纪录片解说',
        uri: 'speech:fengyin-jilupian-jieshuo-zh-male:clzkyf4vy00e5qr6hywum4u84:ukpxipwsoofmwfusolls',
        sample_url: 'https://store.narratoai.cn/tts/fengyin-jilupian-jieshuo-zh-male.mp3',
        type: 'basic',
        gender: 'male',
        language: 'zh',
      },
      {
        name: '顾我电影解说',
        uri: 'speech:guwo-dianying-jieshuo-zh-male:clzkyf4vy00e5qr6hywum4u84:xnvbzyaxffieyetmxtvc',
        sample_url: 'https://store.narratoai.cn/tts/guwo-dianying-jieshuo-zh-male.mp3',
        type: 'basic',
        gender: 'male',
        language: 'zh',
      },
      {
        name: '贾小军',
        uri: 'speech:jia-xiaojun-final-zh-male:clzkyf4vy00e5qr6hywum4u84:nesyufuydbvhvvagjkjr',
        sample_url: 'https://store.narratoai.cn/tts/jia-xiaojun-final-zh-male.mp3',
        type: 'basic',
        gender: 'male',
        language: 'zh',
      },
      {
        name: '军事解说',
        uri: 'speech:junshi-zh-male:clzkyf4vy00e5qr6hywum4u84:zlainwnkrifbltvjivzw',
        sample_url: 'https://store.narratoai.cn/tts/junshi-zh-male.mp3',
        type: 'basic',
        gender: 'male',
        language: 'zh',
      },
      {
        name: '祁同伟',
        uri: 'speech:qi-tongwei-v2-zh-male:clzkyf4vy00e5qr6hywum4u84:drfbemtppnflhfpcpbdd',
        sample_url: 'https://store.narratoai.cn/tts/qi-tongwei-v2-zh-male.mp3',
        type: 'basic',
        gender: 'male',
        language: 'zh',
      },
      {
        name: '赛马娘曼波欧耶版',
        uri: 'speech:saima-niang-mambo-oye-zh-female:clzkyf4vy00e5qr6hywum4u84:vmlnorrngoqknteainas',
        sample_url: 'https://store.narratoai.cn/tts/saima-niang-mambo-oye-zh-female.mp3',
        type: 'basic',
        gender: 'female',
        language: 'zh',
      },
    ])
  })

  it('优先使用公开系统配置中的 tts_voices', async () => {
    vi.mocked(systemService.getPublicSystemSettingByKey).mockResolvedValue({
      key: 'tts_voices',
      value: {
        voices: [
          {
            uri: 'e76f1bc68df94505ae195c8d5316448c',
            name: '心中之城',
            name_i18n: {
              'zh-CN': '心中之城',
              en: 'City in the Heart',
            },
            type: 'advanced',
            gender: 'male',
            language: 'zh',
            sample_url: 'https://store.narratoai.cn/tts/xinzhong-zhicheng-zh-male.mp3',
          },
        ],
      },
    })

    await expect(fetchBuiltInVoices()).resolves.toEqual([
      {
        uri: 'e76f1bc68df94505ae195c8d5316448c',
        name: '心中之城',
        name_i18n: {
          'zh-CN': '心中之城',
          en: 'City in the Heart',
        },
        type: 'advanced',
        gender: 'male',
        language: 'zh',
        sample_url: 'https://store.narratoai.cn/tts/xinzhong-zhicheng-zh-male.mp3',
      },
    ])
  })

  it('生成语音时通过 authenticatedFetch 复用令牌刷新逻辑', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(new Response('audio-data', {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
    }))

    await expect(generateTTSWithVoiceUri('你好', 'voice://demo', {
      speed: 1.1,
      volume: 0.9,
      service_level: 'basic',
      projectId: 'project-1',
      workflowIdentity: {
        workflowRunId: '0185f76a-9e4d-7ed6-9ef7-9f34e7e1b6fd',
        workflowStepId: 'generate-voiceover',
        workflowInputHash: 'a'.repeat(64),
        clientInstanceId: 'web.tab-1',
      },
    })).resolves.toMatchObject({
      success: true,
      audioUrl: 'blob:tts-audio',
      isGenerating: false,
    })

    expect(authenticatedFetch).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(authenticatedFetch).mock.calls[0]
    expect(String(url)).toContain('/api/v1/tools/text-to-speech-with-uri')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeInstanceOf(FormData)
    expect(init?.headers).toBeUndefined()
    const body = init?.body as FormData
    expect(body.get('workflow_run_id')).toBe('0185f76a-9e4d-7ed6-9ef7-9f34e7e1b6fd')
    expect(body.get('workflow_step_id')).toBe('generate-voiceover')
    expect(body.get('workflow_input_hash')).toBe('a'.repeat(64))
    expect(body.get('client_instance_id')).toBe('web.tab-1')
  })

  it('上传参考音色时通过 authenticatedFetch 复用令牌刷新逻辑', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(new Response(JSON.stringify({
      voice_uri: 'voice://uploaded',
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }))

    const file = new File(['audio-data'], 'voice.mp3', { type: 'audio/mpeg' })

    await expect(uploadReferenceVoice(file, 'basic')).resolves.toBe('voice://uploaded')

    expect(authenticatedFetch).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(authenticatedFetch).mock.calls[0]
    expect(String(url)).toContain('/api/v1/tools/upload-reference-voice')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeInstanceOf(FormData)
    expect(init?.headers).toBeUndefined()
  })
})
