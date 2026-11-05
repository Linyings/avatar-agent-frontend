import {
  Input,
  Output,
  Conversion,
  ConversionCanceledError,
  Mp3OutputFormat,
  BufferTarget,
  BlobSource,
  ALL_FORMATS,
  canEncodeAudio
} from 'mediabunny'
import { bindAbortSignal, createAbortError, isAbortError, throwIfAborted } from '@/shared/utils/abort'

export interface AudioExtractionOptions {
  sampleRate?: number
  numberOfChannels?: number
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}

// MP3 配置常量
const DEFAULT_SAMPLE_RATE = 16000
const DEFAULT_CHANNELS = 1
const DEFAULT_BITRATE = 64000 // 64 kbps - medium 质量，适合语音识别
const DEFAULT_CODEC = 'mp3'

// MP3 编码器注册状态
let mp3EncoderRegistered = false

/**
 * 确保 MP3 编码器已注册
 * 只在浏览器不支持原生 MP3 编码时注册自定义编码器
 */
async function ensureMp3EncoderRegistered(): Promise<void> {
  if (mp3EncoderRegistered) {
    return
  }

  const hasNativeSupport = await canEncodeAudio('mp3')

  if (!hasNativeSupport) {
    console.log('[AudioExtractor] 浏览器不支持原生 MP3 编码，注册自定义编码器')
    const { registerMp3Encoder } = await import('@mediabunny/mp3-encoder')
    registerMp3Encoder()
  } else {
    console.log('[AudioExtractor] 浏览器支持原生 MP3 编码')
  }

  mp3EncoderRegistered = true
}

export const extractAudioFromVideo = async (
  file: File,
  options: AudioExtractionOptions = {}
): Promise<Blob> => {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE
  const numberOfChannels = options.numberOfChannels ?? DEFAULT_CHANNELS
  let input: Input | null = null
  let conversion: Conversion | null = null
  let cleanupAbortListener: (() => void) | null = null

  try {
    throwIfAborted(options.signal, '音频提取已取消')
    // 确保 MP3 编码器已注册
    await ensureMp3EncoderRegistered()
    throwIfAborted(options.signal, '音频提取已取消')

    console.log('[AudioExtractor] 开始提取音频:', {
      fileName: file.name,
      fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      format: 'MP3',
      bitrate: `${DEFAULT_BITRATE / 1000} kbps`,
      sampleRate: `${sampleRate} Hz`,
      channels: numberOfChannels
    })

    input = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(file)
    })

    const bufferTarget = new BufferTarget()
    const output = new Output({
      format: new Mp3OutputFormat(),
      target: bufferTarget
    })

    conversion = await Conversion.init({
      input,
      output,
      audio: {
        sampleRate,
        numberOfChannels,
        codec: DEFAULT_CODEC,
        bitrate: DEFAULT_BITRATE
      },
      video: {
        discard: true // 丢弃视频轨道，只保留音频
      }
    })

    if (options.onProgress) {
      conversion.onProgress = options.onProgress
    }

    cleanupAbortListener = bindAbortSignal(options.signal, () => {
      void conversion?.cancel()
    })
    throwIfAborted(options.signal, '音频提取已取消')
    await conversion.execute()
    throwIfAborted(options.signal, '音频提取已取消')

    const buffer = bufferTarget.buffer
    if (!buffer || buffer.byteLength === 0) {
      throw new Error('音频提取失败: 无法获取音频数据')
    }

    console.log('[AudioExtractor] 音频提取完成:', {
      outputSize: `${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`,
      compressionRatio: `${((1 - buffer.byteLength / file.size) * 100).toFixed(1)}%`
    })

    return new Blob([buffer], { type: 'audio/mpeg' })
  } catch (error) {
    if (isAbortError(error) || error instanceof ConversionCanceledError) {
      throw createAbortError('音频提取已取消')
    }

    const message = error instanceof Error ? error.message : '音频提取失败'
    console.error('[AudioExtractor] 音频提取失败:', message)
    throw new Error(message)
  } finally {
    cleanupAbortListener?.()
    input?.dispose()
  }
}

export const createAudioFileFromVideo = async (
  file: File,
  options?: AudioExtractionOptions
): Promise<File> => {
  const audioBlob = await extractAudioFromVideo(file, options)
  const timestamp = Date.now()
  const name = file.name.replace(/\.[^/.]+$/, '')
  const audioFile = new File([audioBlob], `${name}-${timestamp}.mp3`, {
    type: 'audio/mpeg'
  })

  console.log('[AudioExtractor] 音频文件创建完成:', {
    fileName: audioFile.name,
    fileSize: `${(audioFile.size / 1024 / 1024).toFixed(2)} MB`,
    type: audioFile.type
  })

  return audioFile
}
