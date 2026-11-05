import {
  ALL_FORMATS,
  AudioBufferSink,
  BlobSource,
  CanvasSink,
  Input,
} from 'mediabunny'
import { isAbortError, throwIfAborted } from '@/shared/utils/abort'

type TimelineWord = {
  type?: string
  text?: string
  start?: number
  end?: number
}

export type TimelineTranscript = {
  words?: TimelineWord[]
}

export type TimelineViewImageInput = {
  video: File
  start?: number | null
  end?: number | null
  nFrames: number
  transcript?: TimelineTranscript | null
  onProgress?: (progress: number, label: string) => void
  signal?: AbortSignal
}

export type TimelineViewImageResult = {
  file: File
  blob: Blob
  canvas: HTMLCanvasElement
  start: number
  end: number
  nFrames: number
}

type ExtractedFrame = {
  canvas: HTMLCanvasElement | OffscreenCanvas
  timestamp: number
}

const BG = '#121216'
const FG = '#ebebeb'
const DIM = '#6e6e78'
const ACCENT = '#ff8c3c'
const SILENCE = 'rgba(50, 80, 120, 0.47)'
const WAVE = 'rgb(140, 180, 255)'
const WAVE_FILL = 'rgba(140, 180, 255, 0.24)'
export const TIMELINE_IMAGE_BROWSER_DECODE_ERROR = '当前浏览器无法解码该视频。请切换到最新版 Google Chrome 或 Microsoft Edge 后重试。'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const toFinite = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const formatTime = (seconds: number) => `${seconds.toFixed(2)}s`

export const isTimelineViewImageDecodeError = (error: unknown) => {
  if (isAbortError(error)) return false
  const message = error instanceof Error ? error.message : String(error)
  return /decod/i.test(message) || /无法解码/.test(message)
}

const getFrameTimes = (start: number, end: number, nFrames: number) => {
  const count = clamp(Math.round(nFrames), 1, 24)
  if (count === 1) return [(start + end) / 2]
  const step = (end - start) / (count - 1)
  return Array.from({ length: count }, (_, index) => start + index * step)
}

const wordsInRange = (transcript: TimelineTranscript | null | undefined, start: number, end: number) => {
  if (!Array.isArray(transcript?.words)) return []
  return transcript.words.filter((word) => {
    const wordStart = word.start
    const wordEnd = word.end
    return typeof wordStart === 'number'
      && typeof wordEnd === 'number'
      && wordEnd > start
      && wordStart < end
  })
}

const findSilences = (words: TimelineWord[], start: number, end: number, threshold = 0.4) => {
  const gaps: Array<[number, number]> = []
  let previousEnd = start

  for (const word of words) {
    if (word.type === 'spacing') continue
    const wordStart = Math.max(start, toFinite(word.start, start))
    const wordEnd = toFinite(word.end, wordStart)
    if (wordStart - previousEnd >= threshold) {
      gaps.push([previousEnd, wordStart])
    }
    previousEnd = Math.max(previousEnd, wordEnd)
  }

  if (end - previousEnd >= threshold) {
    gaps.push([previousEnd, end])
  }
  return gaps
}

const canvasToBlob = (canvas: HTMLCanvasElement, type = 'image/png', quality = 0.92) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) resolve(blob)
    else reject(new Error('生成视觉辅助图失败'))
  }, type, quality)
})

async function extractFrames(
  input: Input,
  start: number,
  end: number,
  nFrames: number,
  onProgress?: TimelineViewImageInput['onProgress'],
  signal?: AbortSignal
) {
  throwIfAborted(signal, '时间线图生成已取消')
  const videoTrack = await input.getPrimaryVideoTrack()
  if (!videoTrack) throw new Error('视频缺少画面轨道')
  if (!(await videoTrack.canDecode())) throw new Error('当前浏览器无法解码该视频')

  const sink = new CanvasSink(videoTrack, { width: 320 })
  const times = getFrameTimes(start, end, nFrames)
  const frames: ExtractedFrame[] = []

  for (let index = 0; index < times.length; index += 1) {
    throwIfAborted(signal, '时间线图生成已取消')
    const frame = await sink.getCanvas(times[index])
    throwIfAborted(signal, '时间线图生成已取消')
    if (frame) {
      frames.push({ canvas: frame.canvas, timestamp: frame.timestamp })
    }
    onProgress?.(15 + ((index + 1) / times.length) * 35, '抽取画面帧')
  }

  if (frames.length === 0) throw new Error('未能抽取视频帧')
  return frames
}

async function computeEnvelope(
  input: Input,
  start: number,
  end: number,
  samples: number,
  onProgress?: TimelineViewImageInput['onProgress'],
  signal?: AbortSignal
) {
  throwIfAborted(signal, '时间线图生成已取消')
  const envelope = new Float32Array(samples)
  const audioTrack = await input.getPrimaryAudioTrack()
  if (!audioTrack || !(await audioTrack.canDecode())) return envelope

  const sink = new AudioBufferSink(audioTrack)
  let bufferCount = 0

  for await (const wrapped of sink.buffers(start, end)) {
    throwIfAborted(signal, '时间线图生成已取消')
    const audioBuffer = wrapped.buffer
    const channelCount = Math.max(1, audioBuffer.numberOfChannels)
    const sampleRate = audioBuffer.sampleRate

    for (let channel = 0; channel < channelCount; channel += 1) {
      const data = audioBuffer.getChannelData(channel)
      for (let i = 0; i < data.length; i += 1) {
        const t = wrapped.timestamp + i / sampleRate
        if (t < start || t >= end) continue
        const bin = clamp(Math.floor(((t - start) / Math.max(0.001, end - start)) * samples), 0, samples - 1)
        envelope[bin] += data[i] * data[i] / channelCount
      }
    }

    bufferCount += 1
    if (bufferCount % 8 === 0) {
      onProgress?.(55, '计算音频波形')
    }
  }

  let max = 0
  for (let i = 0; i < envelope.length; i += 1) {
    envelope[i] = Math.sqrt(envelope[i])
    max = Math.max(max, envelope[i])
  }
  if (max > 0) {
    for (let i = 0; i < envelope.length; i += 1) {
      envelope[i] /= max
    }
  }
  return envelope
}

function renderTimelineCanvas(input: {
  videoName: string
  start: number
  end: number
  nFrames: number
  frames: ExtractedFrame[]
  envelope: Float32Array
  transcript?: TimelineTranscript | null
}) {
  const frameH = 180
  const filmstripY = 50
  const waveY = filmstripY + frameH + 20
  const waveH = 220
  const labelY = waveY + waveH + 10
  const canvasHeight = labelY + 60
  const resized = input.frames.map((frame) => {
    const source = frame.canvas
    const width = 'width' in source ? source.width : 320
    const height = 'height' in source ? source.height : frameH
    const newW = Math.max(1, Math.round(frameH * (width / Math.max(1, height))))
    return { ...frame, width: newW, height: frameH }
  })

  const totalFrameW = resized.reduce((sum, frame) => sum + frame.width, 0) + Math.max(0, resized.length - 1) * 4
  const contentW = Math.max(1400, totalFrameW)
  const canvasWidth = Math.max(1920, contentW + 100)
  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth
  canvas.height = canvasHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')

  ctx.fillStyle = BG
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.font = '22px Menlo, Monaco, Consolas, monospace'
  ctx.fillStyle = FG
  ctx.fillText(
    `${input.videoName}   ${formatTime(input.start)} -> ${formatTime(input.end)}   (${(input.end - input.start).toFixed(2)}s, ${input.nFrames} frames)`,
    50,
    30
  )

  const stripWidth = canvasWidth - 100
  let cursor = 50
  let drawWidth = 0
  if (totalFrameW <= stripWidth) {
    for (const frame of resized) {
      ctx.drawImage(frame.canvas, cursor, filmstripY, frame.width, frame.height)
      cursor += frame.width + 4
    }
    drawWidth = cursor - 50
  } else {
    const scale = stripWidth / totalFrameW
    const newH = Math.round(frameH * scale)
    const gap = Math.max(2, Math.round(4 * scale))
    for (const frame of resized) {
      const newW = Math.max(1, Math.round(frame.width * scale))
      ctx.drawImage(frame.canvas, cursor, filmstripY + Math.round((frameH - newH) / 2), newW, newH)
      cursor += newW + gap
    }
    drawWidth = cursor - 50
  }

  const stripX0 = 50
  const stripX1 = 50 + drawWidth
  const stripSpan = Math.max(1, stripX1 - stripX0)
  const timeToX = (time: number) => stripX0 + ((time - input.start) / Math.max(0.001, input.end - input.start)) * stripSpan

  ctx.fillStyle = '#1c1c22'
  ctx.fillRect(stripX0, waveY, stripSpan, waveH)

  const words = wordsInRange(input.transcript, input.start, input.end)
  const silences = words.length ? findSilences(words, input.start, input.end, 0.4) : []
  ctx.fillStyle = SILENCE
  for (const [a, b] of silences) {
    const xa = timeToX(a)
    const xb = timeToX(b)
    ctx.fillRect(xa, waveY, Math.max(1, xb - xa), waveH)
  }

  const midY = waveY + waveH / 2
  const maxAmp = waveH / 2 - 8
  ctx.beginPath()
  input.envelope.forEach((value, index) => {
    const x = stripX0 + (index * stripSpan) / Math.max(1, input.envelope.length - 1)
    const y = midY - value * maxAmp
    if (index === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.strokeStyle = WAVE
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.lineTo(stripX1, midY)
  for (let index = input.envelope.length - 1; index >= 0; index -= 1) {
    const value = input.envelope[index]
    const x = stripX0 + (index * stripSpan) / Math.max(1, input.envelope.length - 1)
    const y = midY + value * maxAmp
    ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fillStyle = WAVE_FILL
  ctx.fill()

  ctx.font = '12px Menlo, Monaco, Consolas, monospace'
  ctx.fillStyle = FG
  ctx.strokeStyle = DIM
  let lastLabelX = -9999
  for (const word of words) {
    if (word.type && word.type !== 'word') continue
    const wordStart = word.start
    const wordEnd = word.end
    const text = word.text?.trim()
    if (!text || typeof wordStart !== 'number' || typeof wordEnd !== 'number') continue
    if (wordEnd - wordStart < 0.05) continue
    const cx = (timeToX(wordStart) + timeToX(wordEnd)) / 2
    if (cx - lastLabelX < 28) continue
    ctx.beginPath()
    ctx.moveTo(cx, waveY - 4)
    ctx.lineTo(cx, waveY)
    ctx.stroke()
    ctx.fillText(text, cx + 2, waveY - 8)
    lastLabelX = cx
  }

  const rulerY = waveY + waveH + 2
  ctx.font = '14px Menlo, Monaco, Consolas, monospace'
  ctx.fillStyle = DIM
  ctx.strokeStyle = DIM
  for (let i = 0; i <= 6; i += 1) {
    const frac = i / 6
    const t = input.start + frac * (input.end - input.start)
    const x = stripX0 + frac * stripSpan
    ctx.beginPath()
    ctx.moveTo(x, rulerY)
    ctx.lineTo(x, rulerY + 6)
    ctx.stroke()
    ctx.fillText(formatTime(t), x - 20, rulerY + 22)
  }

  if (silences.length > 0) {
    ctx.fillStyle = DIM
    ctx.fillText(`shaded bands = silences >= 400ms (${silences.length} gap(s))`, stripX0, labelY + 42)
  }

  ctx.strokeStyle = ACCENT
  ctx.lineWidth = 1
  ctx.strokeRect(stripX0, filmstripY, stripSpan, frameH)
  return canvas
}

export async function generateTimelineViewImage({
  video,
  start,
  end,
  nFrames,
  transcript,
  onProgress,
  signal,
}: TimelineViewImageInput): Promise<TimelineViewImageResult> {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(video),
  })

  try {
    throwIfAborted(signal, '时间线图生成已取消')
    onProgress?.(5, '读取视频信息')
    const duration = await input.computeDuration()
    throwIfAborted(signal, '时间线图生成已取消')
    const safeStart = clamp(toFinite(start, 0), 0, Math.max(0, duration - 0.1))
    const defaultEnd = Math.min(duration, safeStart + 30)
    const safeEnd = clamp(toFinite(end, defaultEnd), safeStart + 0.1, duration)
    const safeNFrames = clamp(Math.round(nFrames || 10), 1, 24)

    const frames = await extractFrames(input, safeStart, safeEnd, safeNFrames, onProgress, signal)
    onProgress?.(55, '计算音频波形')
    const envelope = await computeEnvelope(input, safeStart, safeEnd, 2000, onProgress, signal)
    throwIfAborted(signal, '时间线图生成已取消')
    onProgress?.(78, '绘制视觉辅助图')
    const canvas = renderTimelineCanvas({
      videoName: video.name,
      start: safeStart,
      end: safeEnd,
      nFrames: safeNFrames,
      frames,
      envelope,
      transcript,
    })
    const blob = await canvasToBlob(canvas, 'image/png')
    throwIfAborted(signal, '时间线图生成已取消')
    const file = new File([blob], `${video.name.replace(/\.[^.]+$/, '')}_${safeStart.toFixed(2)}-${safeEnd.toFixed(2)}.timeline.png`, {
      type: 'image/png',
    })
    onProgress?.(100, '视觉辅助图已生成')
    return { file, blob, canvas, start: safeStart, end: safeEnd, nFrames: safeNFrames }
  } catch (error) {
    if (isTimelineViewImageDecodeError(error)) {
      throw new Error(TIMELINE_IMAGE_BROWSER_DECODE_ERROR)
    }
    throw error
  } finally {
    ;(input as { dispose?: () => void }).dispose?.()
  }
}
