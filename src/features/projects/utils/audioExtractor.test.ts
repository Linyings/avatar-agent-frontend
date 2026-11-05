import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocked = vi.hoisted(() => {
  const inputOptions: unknown[] = []
  const conversionOptions: unknown[] = []
  const executeMock = vi.fn(async () => {})
  const disposeMock = vi.fn()
  const initMock = vi.fn(async (options: unknown) => {
    conversionOptions.push(options)
    return {
      execute: executeMock
    }
  })

  let bufferContent: ArrayBuffer | undefined = new ArrayBuffer(8)
  let blobSourceArg: unknown
  let mp3Options: unknown
  const canEncodeAudioMock = vi.fn(async () => true)
  const registerMp3EncoderMock = vi.fn()

  class BufferTarget {
    buffer?: ArrayBuffer
    constructor() {
      this.buffer = bufferContent
    }
  }

  class Output {
    target: BufferTarget
    constructor() {
      this.target = new BufferTarget()
    }
  }

  class Input {
    constructor(options: unknown) {
      inputOptions.push(options)
    }

    dispose() {
      disposeMock()
    }
  }

  class BlobSource {
    constructor(file: unknown) {
      blobSourceArg = file
    }
  }

  class Mp3OutputFormat {
    constructor(options?: unknown) {
      mp3Options = options
    }
  }

  class ConversionCanceledError extends Error {}

  return {
    inputOptions,
    conversionOptions,
    executeMock,
    initMock,
    setBufferContent: (value?: ArrayBuffer) => {
      bufferContent = value
    },
    resetCaptured: () => {
      inputOptions.length = 0
      conversionOptions.length = 0
      blobSourceArg = undefined
      mp3Options = undefined
      canEncodeAudioMock.mockClear()
      canEncodeAudioMock.mockResolvedValue(true)
      disposeMock.mockClear()
    },
    getBlobSourceArg: () => blobSourceArg,
    getMp3Options: () => mp3Options,
    classes: {
      Input,
      Output,
      BlobSource,
      Mp3OutputFormat,
      BufferTarget,
      ConversionCanceledError
    },
    Conversion: {
      init: initMock
    },
    ALL_FORMATS: ['mp4'],
    canEncodeAudioMock,
    registerMp3EncoderMock,
    disposeMock,
  }
})

vi.mock('mediabunny', () => ({
  Input: mocked.classes.Input,
  Output: mocked.classes.Output,
  BlobSource: mocked.classes.BlobSource,
  Mp3OutputFormat: mocked.classes.Mp3OutputFormat,
  BufferTarget: mocked.classes.BufferTarget,
  ConversionCanceledError: mocked.classes.ConversionCanceledError,
  Conversion: mocked.Conversion,
  ALL_FORMATS: mocked.ALL_FORMATS,
  canEncodeAudio: mocked.canEncodeAudioMock,
}))

vi.mock('@mediabunny/mp3-encoder', () => ({
  registerMp3Encoder: mocked.registerMp3EncoderMock,
}))

describe('extractAudioFromVideo', () => {
  beforeEach(() => {
    vi.resetModules()
    mocked.resetCaptured()
    mocked.setBufferContent(new ArrayBuffer(8))
    mocked.executeMock.mockClear()
    mocked.initMock.mockClear()
    mocked.registerMp3EncoderMock.mockClear()
  })

  it('在浏览器缺少原生 MP3 编码时按需注册自定义编码器', async () => {
    mocked.canEncodeAudioMock.mockResolvedValue(false)
    const { extractAudioFromVideo } = await import('./audioExtractor')

    const file = new Blob(['dummy'], { type: 'video/mp4' }) as File
    ;(file as { name: string }).name = 'fallback.mp4'

    await extractAudioFromVideo(file)

    expect(mocked.canEncodeAudioMock).toHaveBeenCalledWith('mp3')
    expect(mocked.registerMp3EncoderMock).toHaveBeenCalledTimes(1)
  })

  it('使用 Mediabunny 提取音频并返回 MP3 Blob', async () => {
    const { extractAudioFromVideo } = await import('./audioExtractor')
    const file = new Blob(['dummy'], { type: 'video/mp4' }) as File
    ;(file as { name: string }).name = 'sample.mp4'

    const blob = await extractAudioFromVideo(file)

    expect(mocked.canEncodeAudioMock).toHaveBeenCalledWith('mp3')
    expect(mocked.inputOptions[0]).toMatchObject({
      formats: mocked.ALL_FORMATS
    })
    expect(mocked.getBlobSourceArg()).toBe(file)
    expect(mocked.conversionOptions[0]).toMatchObject({
      audio: {
        sampleRate: 16000,
        numberOfChannels: 1,
        codec: 'mp3',
        bitrate: 64000
      },
      video: {
        discard: true
      }
    })
    expect(mocked.executeMock).toHaveBeenCalledTimes(1)
    expect(mocked.getMp3Options()).toBeUndefined()
    expect(blob.type).toBe('audio/mpeg')
    expect(mocked.disposeMock).toHaveBeenCalledTimes(1)
  })

  it('在提取不到音频数据时抛出错误', async () => {
    const { extractAudioFromVideo } = await import('./audioExtractor')
    mocked.setBufferContent(undefined)
    const file = new Blob(['dummy'], { type: 'video/mp4' }) as File
    ;(file as { name: string }).name = 'broken.mp4'

    await expect(extractAudioFromVideo(file)).rejects.toThrow('音频提取失败')
    expect(mocked.disposeMock).toHaveBeenCalledTimes(1)
  })
})
