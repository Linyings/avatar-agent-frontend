import {
  Input,
  Output,
  Conversion,
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Mp4OutputFormat,
  WebMOutputFormat,
  MovOutputFormat,
  CanvasSource,
  VideoSampleSink,
  AudioSampleSource,
  AudioSample,
  AudioBufferSink,
  QUALITY_LOW,
  QUALITY_MEDIUM,
  QUALITY_HIGH
} from 'mediabunny'
import type { 
  VideoCompositionInput, 
  VideoSegment, 
  CompositionProgress, 
  CompositionResult, 
  CompositionOptions,
  VideoFile,
  ScriptItem,
  TTSAudioState
} from '@/shared/types'
import { parseTimestampRange } from '@/shared/utils/timeParser'
import {
  formatBudgetBytes,
  formatBudgetDuration,
  getBrowserVideoProcessingBudget,
} from '@/shared/utils/browserProcessingBudget'
import { bindAbortSignal, createAbortError, throwIfAborted } from '@/shared/utils/abort'
import ProjectService from './projectService'

const DEFAULT_COMPOSITION_OPTIONS: CompositionOptions = {
  outputFormat: 'mp4',
  videoQuality: 'medium',
  audioQuality: 'medium'
}
const DEFAULT_BACKGROUND_MUSIC_VOLUME = 0.18
const AUDIO_SAMPLE_PEAK_LIMIT = 0.98
const STRIPPED_OBJECT_URL_PLACEHOLDER = '[object-url-stripped]'
const AUDIO_EPSILON_SECONDS = 1e-6

const isUsableAudioUrl = (value?: string | null) => (
  Boolean(value?.trim()) && value !== STRIPPED_OBJECT_URL_PLACEHOLDER
)

export const resolveSilentAudioFrameCount = (duration: number, sampleRate: number = 44100) => {
  const safeSampleRate = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 44100
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 1 / safeSampleRate
  return Math.max(1, Math.ceil(safeDuration * safeSampleRate))
}

/**
 * 校验待合成片段。
 * 注意：源视频裁剪时间段允许乱序，也允许彼此重叠；
 * 最终输出按脚本数组顺序拼接，而不是按源视频时间线重排。
 */
export function validateCompositionSegments(segments: VideoSegment[]): void {
  for (const segment of segments) {
    if (!Number.isFinite(segment.startTime) || !Number.isFinite(segment.endTime)) {
      throw new Error(`片段 ${segment.id} 的时间戳无效`)
    }

    if (segment.startTime < 0 || segment.endTime <= segment.startTime) {
      throw new Error(`片段 ${segment.id} 的时间范围无效，请检查开始时间和结束时间`)
    }

    if (segment.hasNarration && !segment.ttsAudioBlob && !segment.ttsAudioUrl) {
      throw new Error(`片段 ${segment.id} 需要 TTS 音频但未生成，请先生成所有解说音频`)
    }
  }
}

/**
 * 视频合成器类
 * 负责处理视频片段的裁剪、音频处理和拼接
 */
export class VideoComposer {
  private input: Input | null = null
  private abortController: AbortController | null = null
  private progressCallback?: (progress: CompositionProgress) => void
  private audioContext: AudioContext | null = null

  /**
   * 设置进度回调函数
   */
  setProgressCallback(callback: (progress: CompositionProgress) => void) {
    this.progressCallback = callback
  }

  /**
   * 报告进度
   */
  private reportProgress(progress: Partial<CompositionProgress>) {
    if (this.progressCallback) {
      const fullProgress: CompositionProgress = {
        phase: 'preparing',
        currentSegment: 0,
        totalSegments: 0,
        percentage: 0,
        message: '',
        ...progress
      }
      this.progressCallback(fullProgress)
    }
  }

  /**
   * 获取复用的 AudioContext，避免频繁创建/销毁带来的限制
   */
  private getAudioContext(): AudioContext {
    if (this.audioContext && this.audioContext.state === 'closed') {
      this.audioContext = null
    }

    if (!this.audioContext) {
      const Context = (window.AudioContext || (window as any).webkitAudioContext)
      this.audioContext = new Context()
    }

    return this.audioContext
  }

  private async yieldToBrowser(): Promise<void> {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  }

  private assertBrowserBudget(
    videoFile: VideoFile,
    segments: VideoSegment[],
    options: CompositionOptions
  ): void {
    if (!videoFile.file) {
      throw new Error('无法访问原始视频文件，请重新上传后重试')
    }

    const budget = getBrowserVideoProcessingBudget(options.videoQuality || 'medium')
    const totalDuration = segments.reduce((sum, segment) => sum + (segment.endTime - segment.startTime), 0)
    const issues: string[] = []

    if (videoFile.file.size > budget.maxSourceBytes) {
      issues.push(`原视频 ${formatBudgetBytes(videoFile.file.size)} 超过当前设备建议上限 ${formatBudgetBytes(budget.maxSourceBytes)}`)
    }

    if (totalDuration > budget.maxCompositionDurationSeconds) {
      issues.push(`预计输出时长 ${formatBudgetDuration(totalDuration)} 超过当前设备建议上限 ${formatBudgetDuration(budget.maxCompositionDurationSeconds)}`)
    }

    if (segments.length > budget.maxCompositionSegments) {
      issues.push(`脚本片段 ${segments.length} 段超过当前设备建议上限 ${budget.maxCompositionSegments} 段`)
    }

    if (issues.length > 0) {
      throw new Error(
        `为避免浏览器崩溃，已停止本地视频合成：${issues.join('；')}。请拆分素材/减少输出时长，或降低合成质量后重试。`
      )
    }
  }

  /**
   * 初始化视频输入
   */
  private async initializeInput(videoFile: VideoFile): Promise<void> {
    if (!videoFile.file) {
      throw new Error('无法访问原始视频文件，请重新上传后重试')
    }

    this.input = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(videoFile.file)
    })

    // 验证视频可以被处理
    const videoTrack = await this.input.getPrimaryVideoTrack()
    if (!videoTrack) {
      throw new Error('无法找到视频轨道')
    }

    const canDecode = await videoTrack.canDecode()
    if (!canDecode) {
      throw new Error('此浏览器无法解码该视频格式')
    }
  }

  /**
   * 预处理脚本数据为视频片段
   */
  prepareSegments(scriptItems: ScriptItem[], ttsAudioStates: TTSAudioState): VideoSegment[] {
    const segments: VideoSegment[] = []

    for (const item of scriptItems) {
      try {
        // 🎯 关键修复：优先使用校准后的时间戳字段
        let startTime: number
        let endTime: number
        
        if (typeof item.start === 'number' && typeof item.end === 'number') {
          // 使用校准后的精确时间戳
          startTime = item.start
          endTime = item.end
        } else if (item.timestamp) {
          // 回退到解析原始 timestamp 字符串
          const timeRange = parseTimestampRange(item.timestamp)
          startTime = timeRange.startTime
          endTime = timeRange.endTime
        } else {
          console.warn(`Item ${item._id} 缺少时间戳信息`)
          continue
        }
        
        const hasNarration = item.OST === 0
        const ttsAudio = hasNarration ? ttsAudioStates[item._id] : undefined
        const ttsAudioUrl = ttsAudio?.success && isUsableAudioUrl(ttsAudio.audioUrl)
          ? ttsAudio.audioUrl
          : undefined

        const segment: VideoSegment = {
          id: item._id,
          startTime,
          endTime,
          hasNarration,
          narrationText: hasNarration ? item.narration : undefined,
          ttsAudioUrl,
          ttsAudioBlob: ttsAudio?.success ? ttsAudio.audioBlob : undefined
        }

        segments.push(segment)
      } catch (error) {
        console.error(`解析片段失败 (ID: ${item._id}):`, error)
        throw new Error(`片段 ${item._id} 的时间戳格式无效: ${item.timestamp}`)
      }
    }

    return segments
  }

  /**
   * 验证片段数据
   */
  private validateSegments(segments: VideoSegment[]): void {
    validateCompositionSegments(segments)
  }

  /**
   * 获取输出格式配置
   */
  private getOutputFormat(options: CompositionOptions) {
    switch (options.outputFormat) {
      case 'webm':
        return new WebMOutputFormat()
      case 'mov':
        return new MovOutputFormat()
      case 'mp4':
      default:
        return new Mp4OutputFormat({ fastStart: 'in-memory' })
    }
  }

  /**
   * 获取质量配置
   */
  private getQualityConfig(quality: 'low' | 'medium' | 'high') {
    switch (quality) {
      case 'low':
        return QUALITY_LOW
      case 'high':
        return QUALITY_HIGH
      case 'medium':
      default:
        return QUALITY_MEDIUM
    }
  }

  /**
   * 裁剪单个视频片段
   */
  private async clipVideoSegment(segment: VideoSegment): Promise<Blob> {
    if (!this.input) {
      throw new Error('视频输入未初始化')
    }

    try {
      // 创建临时输出用于裁剪这个片段
      const tempOutput = new Output({
        format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
        target: new BufferTarget()
      })

      // 使用 Conversion 来处理视频裁剪
      const conversion = await Conversion.init({ 
        input: this.input, 
        output: tempOutput,
        trim: {
          start: segment.startTime,
          end: segment.endTime
        }
      })

      await conversion.execute()
      
      const buffer = tempOutput.target.buffer
      if (!buffer) {
        throw new Error('无法获取视频片段数据')
      }
      return new Blob([buffer], { type: 'video/mp4' })

    } catch (error) {
      console.error(`裁剪片段失败 (ID: ${segment.id}):`, error)
      throw new Error(`裁剪片段 ${segment.id} 失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  /**
   * 将音频 Blob 转换为 AudioBuffer
   */
  private async convertBlobToAudioBuffer(audioBlob: Blob): Promise<AudioBuffer | null> {
    try {
      console.log(`🎵 开始解码音频: type=${audioBlob.type}, size=${(audioBlob.size / 1024).toFixed(2)} KB`)

      const audioContext = this.getAudioContext()

      // 将 Blob 转换为 ArrayBuffer
      const arrayBuffer = await audioBlob.arrayBuffer()
      console.log(`📊 ArrayBuffer 大小: ${(arrayBuffer.byteLength / 1024).toFixed(2)} KB`)

      // 解码音频数据。decodeAudioData 会接管 ArrayBuffer，避免 slice 额外复制一份完整音频。
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      console.log(`✅ 音频解码成功: 时长=${audioBuffer.duration.toFixed(2)}s, 采样率=${audioBuffer.sampleRate}Hz, 声道=${audioBuffer.numberOfChannels}`)

      return audioBuffer
    } catch (error) {
      console.error('❌ 转换音频 Blob 失败:', {
        error: error instanceof Error ? error.message : error,
        blobType: audioBlob.type,
        blobSize: audioBlob.size,
        errorName: error instanceof Error ? error.name : 'Unknown'
      })
      return null
    }
  }

  /**
   * 将 AudioBuffer 转换为带时间戳的 AudioSample，支持格式统一
   */
  private convertAudioBufferToSample(audioBuffer: AudioBuffer, timestamp: number, targetSampleRate?: number, targetChannels?: number): AudioSample {
    const sourceSampleRate = audioBuffer.sampleRate
    const sourceChannels = audioBuffer.numberOfChannels
    const sourceLength = audioBuffer.length

    if (
      !Number.isFinite(sourceSampleRate)
      || sourceSampleRate <= 0
      || !Number.isFinite(sourceChannels)
      || sourceChannels <= 0
      || !Number.isFinite(sourceLength)
      || sourceLength <= 0
    ) {
      throw new Error('音频数据为空，无法创建可编码的音频片段')
    }
    
    // 使用目标参数或原始参数
    const finalSampleRate = targetSampleRate || sourceSampleRate
    const finalChannels = targetChannels || sourceChannels
    
    
    // 如果参数完全匹配，直接转换
    if (sourceSampleRate === finalSampleRate && sourceChannels === finalChannels) {
      if (sourceChannels === 1) {
        const channelData = audioBuffer.getChannelData(0)
        return new AudioSample({
          data: channelData,
          format: 'f32-planar',
          numberOfChannels: 1,
          sampleRate: finalSampleRate,
          timestamp: timestamp
        })
      } else {
        // 多声道交错格式
        const interleavedData = new Float32Array(sourceLength * sourceChannels)
        for (let channel = 0; channel < sourceChannels; channel++) {
          const channelData = audioBuffer.getChannelData(channel)
          for (let i = 0; i < sourceLength; i++) {
            interleavedData[i * sourceChannels + channel] = channelData[i]
          }
        }
        return new AudioSample({
          data: interleavedData,
          format: 'f32',
          numberOfChannels: finalChannels,
          sampleRate: finalSampleRate,
          timestamp: timestamp
        })
      }
    }
    
    // 🔧 方案2优化：使用更精确的长度计算和线性插值重采样
    // 使用 Math.round 而非 Math.floor 减少累积误差
    const targetLengthExact = sourceLength * finalSampleRate / sourceSampleRate
    const targetLength = Math.round(targetLengthExact)

    if (!Number.isFinite(targetLength) || targetLength <= 0) {
      throw new Error('音频重采样后为空，无法创建可编码的音频片段')
    }
    
    if (finalChannels === 1) {
      // 目标单声道
      const outputData = new Float32Array(targetLength)
      
      if (sourceChannels === 1) {
        // 🔧 单声道到单声道：使用线性插值重采样
        const sourceData = audioBuffer.getChannelData(0)
        for (let i = 0; i < targetLength; i++) {
          // 计算源索引（浮点数）
          const sourceIndexFloat = i * sourceSampleRate / finalSampleRate
          const sourceIndexFloor = Math.floor(sourceIndexFloat)
          const sourceIndexCeil = Math.min(sourceIndexFloor + 1, sourceLength - 1)
          const fraction = sourceIndexFloat - sourceIndexFloor
          
          // 线性插值
          const valueLower = sourceIndexFloor < sourceLength ? sourceData[sourceIndexFloor] : 0
          const valueUpper = sourceIndexCeil < sourceLength ? sourceData[sourceIndexCeil] : 0
          outputData[i] = valueLower + (valueUpper - valueLower) * fraction
        }
      } else {
        // 🔧 多声道到单声道：混音 + 线性插值
        for (let i = 0; i < targetLength; i++) {
          const sourceIndexFloat = i * sourceSampleRate / finalSampleRate
          const sourceIndexFloor = Math.floor(sourceIndexFloat)
          const sourceIndexCeil = Math.min(sourceIndexFloor + 1, sourceLength - 1)
          const fraction = sourceIndexFloat - sourceIndexFloor
          
          if (sourceIndexFloor < sourceLength) {
            let sumLower = 0
            let sumUpper = 0
            for (let ch = 0; ch < sourceChannels; ch++) {
              const channelData = audioBuffer.getChannelData(ch)
              sumLower += channelData[sourceIndexFloor]
              if (sourceIndexCeil < sourceLength) {
                sumUpper += channelData[sourceIndexCeil]
              }
            }
            const avgLower = sumLower / sourceChannels
            const avgUpper = sumUpper / sourceChannels
            outputData[i] = avgLower + (avgUpper - avgLower) * fraction
          }
        }
      }
      
      return new AudioSample({
        data: outputData,
        format: 'f32-planar',
        numberOfChannels: 1,
        sampleRate: finalSampleRate,
        timestamp: timestamp
      })
    } else {
      // 🔧 目标立体声：使用线性插值
      const outputData = new Float32Array(targetLength * finalChannels)
      
      for (let i = 0; i < targetLength; i++) {
        const sourceIndexFloat = i * sourceSampleRate / finalSampleRate
        const sourceIndexFloor = Math.floor(sourceIndexFloat)
        const sourceIndexCeil = Math.min(sourceIndexFloor + 1, sourceLength - 1)
        const fraction = sourceIndexFloat - sourceIndexFloor
        
        if (sourceIndexFloor < sourceLength) {
          if (sourceChannels === 1) {
            // 单声道到立体声：线性插值后复制到所有声道
            const channelData = audioBuffer.getChannelData(0)
            const valueLower = channelData[sourceIndexFloor]
            const valueUpper = sourceIndexCeil < sourceLength ? channelData[sourceIndexCeil] : valueLower
            const interpolatedValue = valueLower + (valueUpper - valueLower) * fraction
            
            for (let ch = 0; ch < finalChannels; ch++) {
              outputData[i * finalChannels + ch] = interpolatedValue
            }
          } else {
            // 多声道到多声道：每个声道独立线性插值
            for (let ch = 0; ch < finalChannels; ch++) {
              const sourceChannel = Math.min(ch, sourceChannels - 1)
              const channelData = audioBuffer.getChannelData(sourceChannel)
              const valueLower = channelData[sourceIndexFloor]
              const valueUpper = sourceIndexCeil < sourceLength ? channelData[sourceIndexCeil] : valueLower
              outputData[i * finalChannels + ch] = valueLower + (valueUpper - valueLower) * fraction
            }
          }
        }
      }
      
      return new AudioSample({
        data: outputData,
        format: 'f32',
        numberOfChannels: finalChannels,
        sampleRate: finalSampleRate,
        timestamp: timestamp
      })
    }
  }

  /**
   * 为片段生成静音 AudioSample
   */
  private generateSilentAudioSample(duration: number, timestamp: number, sampleRate: number = 44100, channels: number = 2): AudioSample {
    const safeSampleRate = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 44100
    const safeChannels = Number.isFinite(channels) && channels > 0 ? Math.round(channels) : 2
    const frames = resolveSilentAudioFrameCount(duration, safeSampleRate)
    
    if (safeChannels === 1) {
      const silentData = new Float32Array(frames).fill(0)
      return new AudioSample({
        data: silentData,
        format: 'f32-planar',
        numberOfChannels: 1,
        sampleRate: safeSampleRate,
        timestamp: timestamp
      })
    } else {
      const silentData = new Float32Array(frames * safeChannels).fill(0)
      return new AudioSample({
        data: silentData,
        format: 'f32',
        numberOfChannels: safeChannels,
        sampleRate: safeSampleRate,
        timestamp: timestamp
      })
    }
  }

  /**
   * 从URL获取音频文件
   */
  private async fetchAudioFromUrl(url: string): Promise<Blob> {
    try {
      // 使用ProjectService的代理下载方法来避免CORS问题
      const blob = await ProjectService.downloadProjectAudioFile(url)
      return blob

    } catch (error) {
      console.error('从URL获取音频失败:', {
        url,
        error: error instanceof Error ? error.message : error
      })

      throw new Error(`从URL获取音频失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  private resolveBackgroundMusicVolume(options: CompositionOptions): number {
    if (typeof options.backgroundMusicVolume !== 'number' || !Number.isFinite(options.backgroundMusicVolume)) {
      return DEFAULT_BACKGROUND_MUSIC_VOLUME
    }

    return Math.max(0, Math.min(1, options.backgroundMusicVolume))
  }

  private async loadBackgroundMusicBuffer(options: CompositionOptions): Promise<AudioBuffer | null> {
    const backgroundMusicUrl = options.backgroundMusicUrl?.trim()
    if (!backgroundMusicUrl) return null

    try {
      console.log('🎼 正在加载背景音乐:', backgroundMusicUrl)
      const backgroundMusicBlob = await this.fetchAudioFromUrl(backgroundMusicUrl)
      const backgroundMusicBuffer = await this.convertBlobToAudioBuffer(backgroundMusicBlob)

      if (!backgroundMusicBuffer) {
        throw new Error('背景音乐无法解码')
      }

      return backgroundMusicBuffer
    } catch (error) {
      throw new Error(`背景音乐加载失败，已停止合成，避免生成无 BGM 成片: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  private sampleAudioBuffer(
    audioBuffer: AudioBuffer,
    channel: number,
    frameIndexFloat: number
  ): number {
    if (frameIndexFloat < 0 || frameIndexFloat >= audioBuffer.length - 1) {
      const edgeIndex = Math.floor(frameIndexFloat)
      if (edgeIndex < 0 || edgeIndex >= audioBuffer.length) return 0
      return audioBuffer.getChannelData(Math.min(channel, audioBuffer.numberOfChannels - 1))[edgeIndex] ?? 0
    }

    const sourceChannel = Math.min(channel, audioBuffer.numberOfChannels - 1)
    const channelData = audioBuffer.getChannelData(sourceChannel)
    const lowerIndex = Math.floor(frameIndexFloat)
    const upperIndex = Math.min(lowerIndex + 1, audioBuffer.length - 1)
    const fraction = frameIndexFloat - lowerIndex
    const lower = channelData[lowerIndex] ?? 0
    const upper = channelData[upperIndex] ?? lower

    return lower + (upper - lower) * fraction
  }

  private createMixedAudioBuffer(params: {
    baseBuffer?: AudioBuffer | null
    duration: number
    timelineStart: number
    sampleRate: number
    channels: number
    backgroundMusicBuffer?: AudioBuffer | null
    backgroundMusicVolume: number
  }): AudioBuffer | null {
    const {
      baseBuffer,
      duration,
      timelineStart,
      sampleRate,
      channels,
      backgroundMusicBuffer,
      backgroundMusicVolume
    } = params

    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0
    if (safeDuration <= 0 || (!baseBuffer && !backgroundMusicBuffer)) return null

    const audioContext = this.getAudioContext()
    const frameCount = Math.max(1, Math.ceil(safeDuration * sampleRate))
    const output = audioContext.createBuffer(channels, frameCount, sampleRate)
    const musicDuration = backgroundMusicBuffer?.duration ?? 0

    for (let channel = 0; channel < channels; channel += 1) {
      const outputChannel = output.getChannelData(channel)

      for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        const time = frameIndex / sampleRate
        let sampleValue = 0

        if (baseBuffer) {
          const baseFrameIndex = time * baseBuffer.sampleRate
          sampleValue += this.sampleAudioBuffer(baseBuffer, channel, baseFrameIndex)
        }

        if (backgroundMusicBuffer && musicDuration > 0 && backgroundMusicVolume > 0) {
          const musicTime = (timelineStart + time) % musicDuration
          const musicFrameIndex = musicTime * backgroundMusicBuffer.sampleRate
          sampleValue += this.sampleAudioBuffer(backgroundMusicBuffer, channel, musicFrameIndex) * backgroundMusicVolume
        }

        outputChannel[frameIndex] = Math.max(-AUDIO_SAMPLE_PEAK_LIMIT, Math.min(AUDIO_SAMPLE_PEAK_LIMIT, sampleValue))
      }
    }

    return output
  }

  /**
   * 执行完整的视频合成流程
   */
  async composeVideo(input: VideoCompositionInput): Promise<CompositionResult> {
    const { originalVideoFile, scriptItems, ttsAudioStates, options } = input

    if (!originalVideoFile?.file) {
      return {
        success: false,
        error: '缺少原始视频文件'
      }
    }

    this.abortController = new AbortController()

    const compositionOptions: CompositionOptions = {
      ...DEFAULT_COMPOSITION_OPTIONS,
      ...(options ?? {})
    }

    const startTime = Date.now()

    try {
      this.reportProgress({
        phase: 'preparing',
        currentSegment: 0,
        totalSegments: 0,
        percentage: 2,
        message: '正在初始化视频输入...'
      })

      await this.initializeInput(originalVideoFile)

      this.reportProgress({
        phase: 'preparing',
        currentSegment: 0,
        totalSegments: scriptItems.length,
        percentage: 5,
        message: '正在解析脚本片段...'
      })

      const segments = this.prepareSegments(scriptItems, ttsAudioStates)

      if (segments.length === 0) {
        throw new Error('脚本中没有可合成的片段')
      }

      this.validateSegments(segments)
      this.assertBrowserBudget(originalVideoFile, segments, compositionOptions)

      // 第1步：逐段裁剪并合成
      this.reportProgress({
        phase: 'clipping',
        currentSegment: 0,
        totalSegments: segments.length,
        percentage: 10,
        message: '正在逐段裁剪并合成视频...'
      })

      // 第2步：拼接合成。解说片段会在最终混音阶段直接使用 TTS，避免中间再生成一份静音视频。
      this.reportProgress({
        phase: 'composing',
        currentSegment: 0,
        totalSegments: segments.length,
        percentage: 70,
        message: '正在拼接最终视频...'
      })

      const finalVideoBlob = await this.composeVideoSegments(segments, compositionOptions)
      await this.assertExpectedAudioTrack(finalVideoBlob, segments, compositionOptions)

      // 第3步：完成
      this.reportProgress({
        phase: 'finalizing',
        currentSegment: segments.length,
        totalSegments: segments.length,
        percentage: 100,
        message: '视频合成完成！'
      })

      const totalDuration = segments.reduce((sum, segment) => sum + (segment.endTime - segment.startTime), 0)
      const videoUrl = URL.createObjectURL(finalVideoBlob)

      console.log(`✅ 视频合成完成，总耗时 ${(Date.now() - startTime) / 1000}s`)

      return {
        success: true,
        videoUrl,
        videoBlob: finalVideoBlob,
        duration: totalDuration,
        fileSize: finalVideoBlob.size
      }
    } catch (error) {
      console.error('❌ 视频合成失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '视频合成过程中发生未知错误'
      }
    } finally {
      this.cleanup()
    }
  }

  private async assertExpectedAudioTrack(
    videoBlob: Blob,
    segments: VideoSegment[],
    options: CompositionOptions
  ) {
    const expectsAudio = Boolean(options.backgroundMusicUrl?.trim()) || segments.some(segment => segment.hasNarration)
    if (!expectsAudio) return

    const outputInput = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(videoBlob)
    })

    try {
      const audioTrack = await outputInput.getPrimaryAudioTrack()
      if (!audioTrack) {
        throw new Error('最终视频缺少音频轨，请重新执行“解说配音”和“合成最终视频”')
      }

      const duration = await audioTrack.computeDuration().catch(() => 0)
      if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error('最终视频音频轨时长为空，请检查配音音频和背景音乐资源')
      }
    } finally {
      outputInput.dispose()
    }
  }

  /**
   * 逐段裁剪并拼接视频，保障音画精确同步，并避免同时持有所有裁剪 Blob。
   */
  private async composeVideoSegments(
    segments: VideoSegment[],
    options: CompositionOptions
  ): Promise<Blob> {
    if (segments.length === 0) {
      throw new Error('没有视频片段可以拼接')
    }
    if (!this.input) {
      throw new Error('视频输入未初始化')
    }

    this.reportProgress({
      phase: 'preparing',
      currentSegment: 0,
      totalSegments: segments.length,
      percentage: 5,
      message: '正在准备合成环境...'
    })

    const sourceVideoTrack = await this.input.getPrimaryVideoTrack()
    if (!sourceVideoTrack) {
      throw new Error('原始视频缺少视频轨道')
    }

    const canvasWidth = sourceVideoTrack.displayWidth
    const canvasHeight = sourceVideoTrack.displayHeight

    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(canvasWidth, canvasHeight)
        : (() => {
            if (typeof document === 'undefined') {
              throw new Error('当前环境不支持 OffscreenCanvas，无法创建画布用于合成')
            }
            const fallbackCanvas = document.createElement('canvas')
            fallbackCanvas.width = canvasWidth
            fallbackCanvas.height = canvasHeight
            return fallbackCanvas
          })()

    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    if (!ctx) {
      throw new Error('无法获取 2D 画布上下文')
    }

    const output = new Output({
      format: this.getOutputFormat(options),
      target: new BufferTarget()
    })

    const videoSource = new CanvasSource(canvas as any, {
      codec: 'avc',
      bitrate: this.getQualityConfig(options.videoQuality || 'medium')
    })

    const audioSource = new AudioSampleSource({
      codec: 'aac',
      bitrate: this.getQualityConfig(options.audioQuality || 'medium')
    })

    output.addVideoTrack(videoSource)
    output.addAudioTrack(audioSource)
    await output.start()

    const audioParams = {
      sampleRate: null as number | null,
      channels: null as number | null
    }

    const ensureAudioParams = (sampleRate?: number | null, channels?: number | null) => {
      if (!audioParams.sampleRate && sampleRate && sampleRate > 0) {
        audioParams.sampleRate = sampleRate
      }
      if (!audioParams.channels && channels && channels > 0) {
        audioParams.channels = channels
      }
    }

    const backgroundMusicBuffer = await this.loadBackgroundMusicBuffer(options)
    const backgroundMusicVolume = this.resolveBackgroundMusicVolume(options)
    if (backgroundMusicBuffer) {
      ensureAudioParams(backgroundMusicBuffer.sampleRate, backgroundMusicBuffer.numberOfChannels)
    }

    let timelineCursor = 0

    try {
      for (let index = 0; index < segments.length; index++) {
        if (this.abortController?.signal.aborted) {
          throw new Error('用户取消了操作')
        }

        const segment = segments[index]

        this.reportProgress({
          phase: 'clipping',
          currentSegment: index + 1,
          totalSegments: segments.length,
          percentage: 10 + (index / segments.length) * 55,
          message: `正在裁剪片段 ${segment.id}...`
        })

        const blob = await this.clipVideoSegment(segment)
        await this.yieldToBrowser()

        this.reportProgress({
          phase: 'composing',
          currentSegment: index + 1,
          totalSegments: segments.length,
          percentage: 65 + (index / segments.length) * 30,
          message: `正在拼接片段 ${segment.id}...`
        })

        const input = new Input({
          formats: ALL_FORMATS,
          source: new BlobSource(blob)
        })

        try {
          const videoTrack = await input.getPrimaryVideoTrack()
          if (!videoTrack) {
            throw new Error(`片段 ${segment.id} 缺少视频轨道`)
          }

          if (videoTrack.displayWidth !== canvasWidth || videoTrack.displayHeight !== canvasHeight) {
            console.warn(
              `⚠️ 片段 ${segment.id} 的分辨率 (${videoTrack.displayWidth}x${videoTrack.displayHeight}) 与基准尺寸 (${canvasWidth}x${canvasHeight}) 不一致，画面将被缩放处理`
            )
          }

          const videoDuration = await videoTrack.computeDuration()
          const videoSink = new VideoSampleSink(videoTrack)

          const audioTrack = await input.getPrimaryAudioTrack()
          let audioSink: AudioBufferSink | null = null

          if (audioTrack && !segment.hasNarration) {
            const canDecode = await audioTrack.canDecode()
            if (canDecode) {
              audioSink = new AudioBufferSink(audioTrack)
              ensureAudioParams(audioTrack.sampleRate ?? null, audioTrack.numberOfChannels ?? null)
            } else {
              console.warn(`⚠️ 当前环境无法解码片段 ${segment.id} 的原始音轨，将改用静音补齐`)
            }
          }

          let ttsAudioBuffer: AudioBuffer | null = null
          if (segment.hasNarration) {
            let ttsAudioBlob = segment.ttsAudioBlob

            if (!ttsAudioBlob && segment.ttsAudioUrl) {
              try {
                ttsAudioBlob = await this.fetchAudioFromUrl(segment.ttsAudioUrl)
                segment.ttsAudioBlob = ttsAudioBlob
              } catch (error) {
                console.error(`❌ 下载片段 ${segment.id} 的 TTS 音频失败:`, error)
              }
            }

            if (ttsAudioBlob) {
              ttsAudioBuffer = await this.convertBlobToAudioBuffer(ttsAudioBlob)
              if (ttsAudioBuffer) {
                ensureAudioParams(ttsAudioBuffer.sampleRate, ttsAudioBuffer.numberOfChannels)
              } else {
                console.warn(`⚠️ 无法解码片段 ${segment.id} 的 TTS 音频，将使用静音`)
              }
            } else {
              console.warn(`⚠️ 片段 ${segment.id} 缺少 TTS 音频，将使用静音`)
            }
          }

          if (!audioParams.sampleRate) {
            audioParams.sampleRate = 48000
          }
          if (!audioParams.channels) {
            audioParams.channels = 2
          }

          const { audioEnd, videoEnd } = await this.mergeSegmentMedia({
            segment,
            videoSink,
            videoDuration,
            audioSink,
            ttsAudioBuffer,
            videoSource,
            audioSource,
            canvasContext: ctx,
            canvasWidth,
            canvasHeight,
            timelineStart: timelineCursor,
            audioSampleRate: audioParams.sampleRate,
            audioChannels: audioParams.channels,
            backgroundMusicBuffer,
            backgroundMusicVolume
          })

          timelineCursor = Math.max(audioEnd, videoEnd)
        } finally {
          input.dispose()
        }

        await this.yieldToBrowser()
      }

      await output.finalize()
      const buffer = output.target.buffer
      if (!buffer) {
        throw new Error('无法获取输出视频数据')
      }

      return new Blob([buffer], { type: 'video/mp4' })
    } catch (error) {
      await output.cancel().catch(cancelError => {
        console.warn('⚠️ 取消输出时发生错误:', cancelError)
      })
      throw error
    }
  }

  private async mergeSegmentMedia(params: {
    segment: VideoSegment
    videoSink: VideoSampleSink
    videoDuration: number
    audioSink: AudioBufferSink | null
    ttsAudioBuffer: AudioBuffer | null
    videoSource: CanvasSource
    audioSource: AudioSampleSource
    canvasContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
    canvasWidth: number
    canvasHeight: number
    timelineStart: number
    audioSampleRate: number
    audioChannels: number
    backgroundMusicBuffer: AudioBuffer | null
    backgroundMusicVolume: number
  }): Promise<{ audioEnd: number; videoEnd: number }> {
    const {
      segment,
      videoSink,
      videoDuration,
      audioSink,
      ttsAudioBuffer,
      videoSource,
      audioSource,
      canvasContext,
      canvasWidth,
      canvasHeight,
      timelineStart,
      audioSampleRate,
      audioChannels,
      backgroundMusicBuffer,
      backgroundMusicVolume
    } = params

    const epsilon = AUDIO_EPSILON_SECONDS
    const fallbackFrameDuration = 1 / 30

    let segmentAudioEnd = timelineStart
    let segmentVideoEnd = timelineStart

    const addAudioBuffer = async (
      baseBuffer: AudioBuffer,
      timestamp: number,
      duration: number = baseBuffer.duration,
      mixBackgroundMusic = true
    ) => {
      const audioBuffer = mixBackgroundMusic && backgroundMusicBuffer
        ? this.createMixedAudioBuffer({
            baseBuffer,
            duration,
            timelineStart: timestamp,
            sampleRate: audioSampleRate,
            channels: audioChannels,
            backgroundMusicBuffer,
            backgroundMusicVolume
          }) ?? baseBuffer
        : baseBuffer

      const audioSample = this.convertAudioBufferToSample(
        audioBuffer,
        timestamp,
        audioSampleRate,
        audioChannels
      )

      await audioSource.add(audioSample)
      segmentAudioEnd = Math.max(segmentAudioEnd, audioSample.timestamp + audioSample.duration)

      try {
        audioSample.close()
      } catch (closeError) {
        console.warn('⚠️ 关闭 AudioSample 时出错:', closeError)
      }
    }

    const addBackgroundMusicOrSilence = async (timestamp: number, duration: number) => {
      if (duration <= epsilon) return
      const minimumSampleDuration = 1 / audioSampleRate
      if (duration < minimumSampleDuration) return

      if (backgroundMusicBuffer && backgroundMusicVolume > 0) {
        const musicBuffer = this.createMixedAudioBuffer({
          baseBuffer: null,
          duration,
          timelineStart: timestamp,
          sampleRate: audioSampleRate,
          channels: audioChannels,
          backgroundMusicBuffer,
          backgroundMusicVolume
        })

        if (musicBuffer) {
          await addAudioBuffer(musicBuffer, timestamp, duration, false)
          return
        }
      }

      const silentSample = this.generateSilentAudioSample(
        duration,
        timestamp,
        audioSampleRate,
        audioChannels
      )
      await audioSource.add(silentSample)
      segmentAudioEnd = Math.max(segmentAudioEnd, silentSample.timestamp + silentSample.duration)
      try {
        silentSample.close()
      } catch (closeError) {
        console.warn('⚠️ 关闭静音 AudioSample 时出错:', closeError)
      }
    }

    try {
      if (this.abortController?.signal.aborted) {
        throw new Error('用户取消了操作')
      }

      if (ttsAudioBuffer) {
        await addAudioBuffer(ttsAudioBuffer, timelineStart)
      } else if (audioSink) {
        let audioTimestampOffset: number | null = null

        for await (const wrappedAudioBuffer of audioSink.buffers(0)) {
          if (this.abortController?.signal.aborted) {
            throw new Error('用户取消了操作')
          }

          if (!wrappedAudioBuffer) {
            continue
          }

          const rawTimestamp = wrappedAudioBuffer.timestamp ?? 0
          if (audioTimestampOffset === null) {
            audioTimestampOffset = rawTimestamp
          }

          const relativeStart = Math.max(0, rawTimestamp - audioTimestampOffset)
          const timelineTimestamp = timelineStart + relativeStart

          await addAudioBuffer(wrappedAudioBuffer.buffer, timelineTimestamp)
        }
      }
    } catch (error) {
      console.error(`❌ 片段 ${segment.id} 音频处理失败，将使用静音:`, error)
      segmentAudioEnd = timelineStart
    }

    if (!Number.isFinite(segmentAudioEnd)) {
      segmentAudioEnd = timelineStart
    }

    let pendingSample: any = null
    let pendingRelativeTimestamp = 0
    let firstVideoTimestamp: number | null = null
    let frameCount = 0

    const emitVideoSample = async (
      videoSample: any,
      relativeTimestamp: number,
      rawDuration: number
    ) => {
      const guessedDuration = videoSample?.duration ?? fallbackFrameDuration
      const safeDuration = rawDuration > epsilon ? rawDuration : guessedDuration
      const duration = safeDuration > epsilon ? safeDuration : fallbackFrameDuration
      const presentationTimestamp = timelineStart + relativeTimestamp

      canvasContext.clearRect(0, 0, canvasWidth, canvasHeight)
      try {
        videoSample.draw(canvasContext, 0, 0)
        await videoSource.add(presentationTimestamp, duration)
        segmentVideoEnd = Math.max(segmentVideoEnd, presentationTimestamp + duration)
      } finally {
        try {
          videoSample.close()
        } catch (closeError) {
          console.warn('⚠️ 关闭 VideoSample 时出错:', closeError)
        }
      }
    }

    try {
      for await (const sample of videoSink.samples(0)) {
        if (this.abortController?.signal.aborted) {
          throw new Error('用户取消了操作')
        }

        const sampleTimestamp: number = sample.timestamp ?? firstVideoTimestamp ?? 0
        if (firstVideoTimestamp === null) {
          firstVideoTimestamp = sampleTimestamp
        }

        const relativeTimestamp = Math.max(0, sampleTimestamp - (firstVideoTimestamp ?? 0))

        if (pendingSample) {
          const rawDuration = relativeTimestamp - pendingRelativeTimestamp
          await emitVideoSample(pendingSample, pendingRelativeTimestamp, rawDuration)
        }

        pendingSample = sample
        pendingRelativeTimestamp = relativeTimestamp
        frameCount += 1
      }

      if (pendingSample) {
        const remaining = Math.max(videoDuration - pendingRelativeTimestamp, 0)
        let finalDuration = remaining
        if (finalDuration <= epsilon) {
          finalDuration =
            pendingSample.duration ?? (frameCount > 0 ? videoDuration / frameCount : fallbackFrameDuration)
        }
        if (finalDuration <= epsilon) {
          finalDuration = fallbackFrameDuration
        }
        await emitVideoSample(pendingSample, pendingRelativeTimestamp, finalDuration)
      }

      if (segmentVideoEnd < timelineStart + videoDuration - epsilon) {
        const padDuration = timelineStart + videoDuration - segmentVideoEnd
        await videoSource.add(segmentVideoEnd, padDuration)
        segmentVideoEnd += padDuration
      }
    } catch (error) {
      console.error(`❌ 片段 ${segment.id} 视频处理失败，将使用静止画面:`, error)
      canvasContext.clearRect(0, 0, canvasWidth, canvasHeight)
      const fallbackDuration = Math.max(videoDuration, fallbackFrameDuration)
      await videoSource.add(timelineStart, fallbackDuration)
      segmentVideoEnd = timelineStart + fallbackDuration
    }

    const targetEnd = Math.max(segmentVideoEnd, segmentAudioEnd, timelineStart + videoDuration)

    if (segmentVideoEnd < targetEnd - epsilon) {
      await videoSource.add(segmentVideoEnd, targetEnd - segmentVideoEnd)
      segmentVideoEnd = targetEnd
    }

    if (segmentAudioEnd < targetEnd - epsilon) {
      await addBackgroundMusicOrSilence(segmentAudioEnd, targetEnd - segmentAudioEnd)
      segmentAudioEnd = Math.max(segmentAudioEnd, targetEnd)
    }

    return {
      audioEnd: segmentAudioEnd,
      videoEnd: segmentVideoEnd
    }
  }


  /**
   * 取消视频合成
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort()
    }
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    if (this.input) {
      try {
        this.input.dispose()
      } catch (error) {
        console.warn('⚠️ 释放输入资源时出错:', error)
      }
    }
    this.input = null
    this.abortController = null
    if (this.audioContext) {
      this.audioContext.close().catch(error => {
        console.warn('⚠️ 关闭 AudioContext 时出错:', error)
      })
      this.audioContext = null
    }
  }
}

/**
 * 便捷函数：创建视频合成器实例并执行合成
 */
export async function composeVideo(
  input: VideoCompositionInput,
  onProgress?: (progress: CompositionProgress) => void,
  signal?: AbortSignal
): Promise<CompositionResult> {
  const composer = new VideoComposer()
  const cleanupAbortListener = bindAbortSignal(signal, () => {
    composer.cancel()
  })
  
  if (onProgress) {
    composer.setProgressCallback(onProgress)
  }

  try {
    throwIfAborted(signal, '视频合成已取消')
    const result = await composer.composeVideo(input)
    if (signal?.aborted) {
      throw createAbortError('视频合成已取消')
    }
    return result
  } finally {
    cleanupAbortListener()
  }
}

/**
 * 验证浏览器是否支持视频合成功能
 */
export function checkVideoCompositionSupport(): {
  supported: boolean
  missingFeatures: string[]
} {
  const missingFeatures: string[] = []

  // 检查 WebCodecs API
  if (typeof VideoDecoder === 'undefined' || typeof VideoEncoder === 'undefined') {
    missingFeatures.push('WebCodecs API')
  }

  // 检查 File API
  if (typeof Blob === 'undefined' || typeof URL.createObjectURL === 'undefined') {
    missingFeatures.push('File API')
  }

  // 检查 Web Workers (可选，用于后台处理)

  return {
    supported: missingFeatures.length === 0,
    missingFeatures
  }
}

/**
 * 估算视频合成所需时间（秒）
 */
export function estimateCompositionTime(
  segments: VideoSegment[],
  totalVideoDuration: number
): number {
  // 基础估算：每秒原视频需要2-5秒处理时间
  // 有TTS的片段需要更多时间
  const baseTime = totalVideoDuration * 3
  const ttsExtraTime = segments.filter(s => s.hasNarration).length * 2
  
  return Math.max(baseTime + ttsExtraTime, 10) // 最少10秒
}
