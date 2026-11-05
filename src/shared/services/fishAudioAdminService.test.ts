import { afterEach, describe, expect, it, vi } from 'vitest'
import { fishAudioAdminService } from './fishAudioAdminService'

const createFile = (name = 'voice.mp3') => new File(['audio-bytes'], name, { type: 'audio/mpeg' })

describe('fishAudioAdminService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists self models with pagination params', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        total: 1,
        items: [{ _id: 'model-1', type: 'tts', title: 'Narrator', state: 'trained', tags: [] }],
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const result = await fishAudioAdminService.listModels({
      apiKey: 'sk-test',
      pageSize: 50,
      pageNumber: 2,
      title: 'Narrator',
    })

    expect(result.total).toBe(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/fish-audio-proxy/model?page_size=50&page_number=2&self=true&title=Narrator',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
          'Content-Type': 'application/json',
        }),
      })
    )
  })

  it('creates tts model as multipart form data', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ _id: 'model-1', type: 'tts', title: 'Narrator' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await fishAudioAdminService.createModel({
      apiKey: 'Bearer sk-test',
      title: 'Narrator',
      voices: [createFile()],
      texts: ['sample text'],
      visibility: 'private',
      description: 'desc',
      tags: ['movie', 'en'],
      enhanceAudioQuality: true,
      generateSample: false,
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = init?.body as FormData

    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ Authorization: 'Bearer sk-test' })
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('type')).toBe('tts')
    expect(body.get('train_mode')).toBe('fast')
    expect(body.get('voices')).toBeInstanceOf(File)
    expect(body.get('texts')).toBe('sample text')
  })

  it('updates model metadata with json payload', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null))

    await fishAudioAdminService.updateModel({
      apiKey: 'sk-test',
      id: 'model-1',
      title: 'Updated',
      description: 'new desc',
      visibility: 'unlist',
      tags: ['tag-a'],
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/fish-audio-proxy/model/model-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          title: 'Updated',
          description: 'new desc',
          visibility: 'unlist',
          tags: ['tag-a'],
        }),
      })
    )
  })

  it('creates speech with model header and reference id', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('audio', {
        headers: { 'Content-Type': 'audio/mpeg' },
      })
    )

    const result = await fishAudioAdminService.createSpeech({
      apiKey: 'sk-test',
      ttsModel: 's2-pro',
      text: 'hello',
      referenceId: 'model-1',
      format: 'mp3',
      sampleRate: 44100,
      mp3Bitrate: 128,
      latency: 'normal',
      temperature: 0.7,
      topP: 0.7,
      speed: 1,
      volume: 0,
    })

    expect(result.blob.type).toBe('audio/mpeg')
    const [, init] = fetchMock.mock.calls[0]

    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer sk-test',
      'Content-Type': 'application/json',
      model: 's2-pro',
    })
    expect(JSON.parse(init?.body as string)).toMatchObject({
      text: 'hello',
      reference_id: 'model-1',
      format: 'mp3',
      sample_rate: 44100,
      mp3_bitrate: 128,
      latency: 'normal',
    })
  })
})
