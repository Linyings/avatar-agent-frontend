import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioSample,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_MEDIUM,
  VideoSampleSink,
} from 'mediabunny'
import {
  formatBudgetBytes,
  formatBudgetDuration,
  getBrowserVideoProcessingBudget,
} from '@/shared/utils/browserProcessingBudget'
import { bindAbortSignal, throwIfAborted } from '@/shared/utils/abort'

export interface VideoConcatenationProgress {
  current: number
  total: number
  percentage: number
  message: string
}

const FALLBACK_FRAME_DURATION = 1 / 30
const DEFAULT_AUDIO_SAMPLE_RATE = 48000
const DEFAULT_AUDIO_CHANNELS = 2

const createCanvas = (width: number, height: number) => {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height)
  }

  if (typeof document === 'undefined') {
    throw new Error('当前环境不支持 Canvas，无法合并视频')
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

const audioBufferToSample = (
  audioBuffer: AudioBuffer,
  timestamp: number,
  targetSampleRate = DEFAULT_AUDIO_SAMPLE_RATE,
  targetChannels = DEFAULT_AUDIO_CHANNELS
): AudioSample => {
  const sourceSampleRate = audioBuffer.sampleRate
  const sourceChannels = audioBuffer.numberOfChannels
  const targetLength = Math.round(audioBuffer.length * targetSampleRate / sourceSampleRate)
  const data = new Float32Array(targetLength * targetChannels)

  for (let frame = 0; frame < targetLength; frame += 1) {
    const sourceIndexFloat = frame * sourceSampleRate / targetSampleRate
    const sourceIndexFloor = Math.floor(sourceIndexFloat)
    const sourceIndexCeil = Math.min(sourceIndexFloor + 1, audioBuffer.length - 1)
    const fraction = sourceIndexFloat - sourceIndexFloor

    for (let channel = 0; channel < targetChannels; channel += 1) {
      const sourceChannel = Math.min(channel, sourceChannels - 1)
      const sourceData = audioBuffer.getChannelData(sourceChannel)
      const lower = sourceData[sourceIndexFloor] ?? 0
      const upper = sourceData[sourceIndexCeil] ?? lower
      data[frame * targetChannels + channel] = lower + (upper - lower) * fraction
    }
  }

  return new AudioSample({
    data,
    format: 'f32',
    numberOfChannels: targetChannels,
    sampleRate: targetSampleRate,
    timestamp,
  })
}

const createSilentSample = (duration: number, timestamp: number): AudioSample => {
  const frames = Math.max(1, Math.round(duration * DEFAULT_AUDIO_SAMPLE_RATE))
  return new AudioSample({
    data: new Float32Array(frames * DEFAULT_AUDIO_CHANNELS),
    format: 'f32',
    numberOfChannels: DEFAULT_AUDIO_CHANNELS,
    sampleRate: DEFAULT_AUDIO_SAMPLE_RATE,
    timestamp,
  })
}

const assertMergeBudget = async (files: File[], inputs: Input[]) => {
  const budget = getBrowserVideoProcessingBudget('medium')
  const totalInputBytes = files.reduce((sum, file) => sum + file.size, 0)
  const durations = await Promise.all(inputs.map(input => input.computeDuration().catch(() => 0)))
  const totalDuration = durations.reduce((sum, duration) => sum + (Number.isFinite(duration) ? duration : 0), 0)
  const issues: string[] = []

  if (totalInputBytes > budget.maxTotalInputBytes) {
    issues.push(`素材总大小 ${formatBudgetBytes(totalInputBytes)} 超过当前设备建议上限 ${formatBudgetBytes(budget.maxTotalInputBytes)}`)
  }

  if (totalDuration > budget.maxMergeDurationSeconds) {
    issues.push(`合并后预计时长 ${formatBudgetDuration(totalDuration)} 超过当前设备建议上限 ${formatBudgetDuration(budget.maxMergeDurationSeconds)}`)
  }

  if (issues.length > 0) {
    throw new Error(`为避免浏览器崩溃，已停止本地视频合并：${issues.join('；')}。请减少视频数量或拆分任务后重试。`)
  }
}

/**
 * 使用 Mediabunny 将多个视频按选择顺序重编码拼接。
 * 单个视频无需重编码，调用方应直接跳过。
 */
export async function concatenateVideoFiles(
  files: File[],
  onProgress?: (progress: VideoConcatenationProgress) => void,
  signal?: AbortSignal
): Promise<File> {
  throwIfAborted(signal, '视频合并已取消')
  if (files.length === 0) {
    throw new Error('没有可合并的视频文件')
  }

  if (files.length === 1) {
    return files[0]
  }

  const inputs = files.map(file => new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(file),
  }))
  let output: Output | null = null
  let bufferTarget: BufferTarget | null = null
  let cleanupAbortListener: (() => void) | null = null

  try {
    throwIfAborted(signal, '视频合并已取消')
    await assertMergeBudget(files, inputs)
    throwIfAborted(signal, '视频合并已取消')

    const firstTrack = await inputs[0].getPrimaryVideoTrack()
    if (!firstTrack) {
      throw new Error('第 1 个视频缺少视频轨道')
    }

    const width = firstTrack.displayWidth
    const height = firstTrack.displayHeight
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    if (!ctx) {
      throw new Error('无法创建视频合并画布')
    }

    bufferTarget = new BufferTarget()
    output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: bufferTarget,
    })
    cleanupAbortListener = bindAbortSignal(signal, () => {
      void output?.cancel()
    })

    const videoSource = new CanvasSource(canvas as any, {
      codec: 'avc',
      bitrate: QUALITY_MEDIUM,
    })
    const audioSource = new AudioSampleSource({
      codec: 'aac',
      bitrate: QUALITY_MEDIUM,
    })

    output.addVideoTrack(videoSource)
    output.addAudioTrack(audioSource)
    await output.start()

    let timelineCursor = 0

    for (let index = 0; index < inputs.length; index += 1) {
      throwIfAborted(signal, '视频合并已取消')
      const input = inputs[index]
      const videoTrack = await input.getPrimaryVideoTrack()
      if (!videoTrack) {
        throw new Error(`第 ${index + 1} 个视频缺少视频轨道`)
      }

      const videoDuration = await videoTrack.computeDuration()
      const videoSink = new VideoSampleSink(videoTrack)
      const audioTrack = await input.getPrimaryAudioTrack()
      const canDecodeAudio = audioTrack ? await audioTrack.canDecode() : false
      const audioSink = audioTrack && canDecodeAudio ? new AudioBufferSink(audioTrack) : null

      onProgress?.({
        current: index + 1,
        total: inputs.length,
        percentage: Math.round((index / inputs.length) * 100),
        message: `正在合并第 ${index + 1}/${inputs.length} 个视频`,
      })

      let audioEnd = timelineCursor
      if (audioSink) {
        let firstAudioTimestamp: number | null = null
        for await (const wrappedAudioBuffer of audioSink.buffers(0)) {
          throwIfAborted(signal, '视频合并已取消')
          const rawTimestamp = wrappedAudioBuffer.timestamp ?? 0
          firstAudioTimestamp ??= rawTimestamp
          const sample = audioBufferToSample(
            wrappedAudioBuffer.buffer,
            timelineCursor + Math.max(0, rawTimestamp - firstAudioTimestamp)
          )
          await audioSource.add(sample)
          audioEnd = Math.max(audioEnd, sample.timestamp + sample.duration)
          sample.close()
        }
      }

      let videoEnd = timelineCursor
      let firstVideoTimestamp: number | null = null
      let pendingSample: any = null
      let pendingRelativeTimestamp = 0
      let frameCount = 0

      const emitVideoSample = async (sample: any, relativeTimestamp: number, rawDuration: number) => {
        const duration = rawDuration > 0
          ? rawDuration
          : sample.duration ?? (frameCount > 0 ? videoDuration / frameCount : FALLBACK_FRAME_DURATION)
        const timestamp = timelineCursor + relativeTimestamp

        ctx.clearRect(0, 0, width, height)
        sample.draw(ctx, 0, 0)
        await videoSource.add(timestamp, Math.max(duration, FALLBACK_FRAME_DURATION))
        videoEnd = Math.max(videoEnd, timestamp + Math.max(duration, FALLBACK_FRAME_DURATION))
        sample.close()
      }

      for await (const sample of videoSink.samples(0)) {
        throwIfAborted(signal, '视频合并已取消')
        const rawTimestamp: number = sample.timestamp ?? firstVideoTimestamp ?? 0
        if (firstVideoTimestamp === null) {
          firstVideoTimestamp = rawTimestamp
        }
        const relativeTimestamp = Math.max(0, rawTimestamp - firstVideoTimestamp)

        if (pendingSample) {
          await emitVideoSample(pendingSample, pendingRelativeTimestamp, relativeTimestamp - pendingRelativeTimestamp)
        }

        pendingSample = sample
        pendingRelativeTimestamp = relativeTimestamp
        frameCount += 1
      }

      if (pendingSample) {
        await emitVideoSample(pendingSample, pendingRelativeTimestamp, videoDuration - pendingRelativeTimestamp)
      }

      const targetEnd = Math.max(videoEnd, audioEnd, timelineCursor + videoDuration)
      if (videoEnd < targetEnd) {
        await videoSource.add(videoEnd, targetEnd - videoEnd)
      }
      if (audioEnd < targetEnd) {
        const silence = createSilentSample(targetEnd - audioEnd, audioEnd)
        await audioSource.add(silence)
        silence.close()
      }

      timelineCursor = targetEnd
    }

    throwIfAborted(signal, '视频合并已取消')
    await output.finalize()
    throwIfAborted(signal, '视频合并已取消')
    const buffer = bufferTarget.buffer
    if (!buffer) {
      throw new Error('视频合并失败：无法获取输出数据')
    }

    onProgress?.({
      current: files.length,
      total: files.length,
      percentage: 100,
      message: '视频合并完成',
    })

    return new File([buffer], `frame-inference-merged-${Date.now()}.mp4`, {
      type: 'video/mp4',
      lastModified: Date.now(),
    })
  } finally {
    cleanupAbortListener?.()
    inputs.forEach(input => {
      try {
        input.dispose()
      } catch (error) {
        console.warn('[VideoConcatenation] 释放输入资源失败:', error)
      }
    })
  }
}
