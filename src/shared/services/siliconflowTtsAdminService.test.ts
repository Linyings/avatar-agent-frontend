import { afterEach, describe, expect, it, vi } from 'vitest'
import { siliconflowTtsAdminService } from './siliconflowTtsAdminService'

const createFile = (name = 'voice.mp3') => new File(['audio-bytes'], name, { type: 'audio/mpeg' })

describe('siliconflowTtsAdminService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads custom voice list with bearer authorization', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        results: [
          {
            model: 'IndexTeam/IndexTTS-2',
            customName: 'narrator',
            text: '样本文本',
            uri: 'speech:narrator:abc:def',
          },
        ],
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const voices = await siliconflowTtsAdminService.listVoices('sk-test')

    expect(voices).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.siliconflow.cn/v1/audio/voice/list',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
          'Content-Type': 'application/json',
        }),
      })
    )
  })

  it('accepts SiliconFlow singular result field for voice list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        result: [
          {
            model: 'FunAudioLLM/CosyVoice2-0.5B',
            customName: 'voice-1',
            text: '样本文本',
            uri: 'speech:voice-1:abc:def',
          },
          {
            model: 'FunAudioLLM/CosyVoice2-0.5B',
            customName: 'voice-2',
            text: '另一段文本',
            uri: 'speech:voice-2:abc:def',
          },
        ],
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const voices = await siliconflowTtsAdminService.listVoices('sk-test')

    expect(voices).toHaveLength(2)
    expect(voices[0].customName).toBe('voice-1')
  })

  it('uploads a reference voice as multipart form data', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ uri: 'speech:narrator:abc:def' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const result = await siliconflowTtsAdminService.uploadVoice({
      apiKey: 'Bearer sk-test',
      file: createFile(),
      model: 'IndexTeam/IndexTTS-2',
      customName: 'narrator',
      text: '样本文本',
    })

    expect(result.uri).toBe('speech:narrator:abc:def')
    const [, init] = fetchMock.mock.calls[0]
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ Authorization: 'Bearer sk-test' })
    expect(init?.body).toBeInstanceOf(FormData)
    expect((init?.body as FormData).get('customName')).toBe('narrator')
  })

  it('normalizes copied authorization header values', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), {
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await siliconflowTtsAdminService.listVoices('Authorization: Bearer "sk-copied"')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.siliconflow.cn/v1/audio/voice/list',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-copied',
        }),
      })
    )
  })

  it('creates speech and returns the audio blob with trace id', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Blob(['audio'], { type: 'audio/mpeg' }), {
        headers: {
          'Content-Type': 'audio/mpeg',
          'x-siliconcloud-trace-id': 'trace-123',
        },
      })
    )

    const result = await siliconflowTtsAdminService.createSpeech({
      apiKey: 'sk-test',
      model: 'fnlp/MOSS-TTSD-v0.5',
      input: '你好',
      voice: 'fnlp/MOSS-TTSD-v0.5:alex',
      responseFormat: 'mp3',
      sampleRate: 44100,
      stream: false,
      speed: 1,
      gain: 0,
    })

    expect(result.traceId).toBe('trace-123')
    expect(result.blob.type).toBe('audio/mpeg')
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init?.body as string)).toMatchObject({
      model: 'fnlp/MOSS-TTSD-v0.5',
      input: '你好',
      voice: 'fnlp/MOSS-TTSD-v0.5:alex',
      response_format: 'mp3',
      sample_rate: 44100,
      stream: false,
      speed: 1,
      gain: 0,
    })
  })

  it('sends transcription audio as multipart form data', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ text: '识别文本' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const result = await siliconflowTtsAdminService.transcribe({
      apiKey: 'sk-test',
      file: createFile('speech.wav'),
      model: 'FunAudioLLM/SenseVoiceSmall',
    })

    expect(result.text).toBe('识别文本')
    const [, init] = fetchMock.mock.calls[0]
    expect(init?.headers).toEqual({ Authorization: 'Bearer sk-test' })
    expect((init?.body as FormData).get('model')).toBe('FunAudioLLM/SenseVoiceSmall')
  })

  it('surfaces SiliconFlow json error details', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'invalid api key' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await expect(siliconflowTtsAdminService.listVoices('bad-key')).rejects.toThrow('invalid api key')
  })
})
