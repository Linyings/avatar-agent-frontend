import { useState, useCallback, useRef, useEffect } from 'react'
import type { 
  VideoCompositionInput, 
  CompositionProgress, 
  CompositionResult, 
  CompositionOptions
} from '@/shared/types'
import { 
  VideoComposer, 
  checkVideoCompositionSupport,
  estimateCompositionTime
} from '@/features/projects/services/videoComposer'

interface UseVideoComposerOptions {
  defaultOptions?: Partial<CompositionOptions>
}

interface UseVideoComposerReturn {
  // 状态
  isComposing: boolean
  progress: CompositionProgress | null
  result: CompositionResult | null
  error: string | null
  isSupported: boolean
  supportInfo: { supported: boolean; missingFeatures: string[] }
  
  // 估算信息
  estimatedTime: number | null
  
  // 操作方法
  startComposition: (input: VideoCompositionInput) => Promise<void>
  cancelComposition: () => void
  clearResult: () => void
  downloadResult: (filename?: string) => void
  
  // 配置方法
  updateOptions: (options: Partial<CompositionOptions>) => void
  
  // 验证方法
  validateInput: (input: Partial<VideoCompositionInput>) => { 
    valid: boolean
    issues: string[] 
  }
}

export function useVideoComposer(options: UseVideoComposerOptions = {}): UseVideoComposerReturn {
  const [isComposing, setIsComposing] = useState(false)
  const [progress, setProgress] = useState<CompositionProgress | null>(null)
  const [result, setResult] = useState<CompositionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null)
  
  const composerRef = useRef<VideoComposer | null>(null)
  const resultRef = useRef<CompositionResult | null>(null)
  const [compositionOptions, setCompositionOptions] = useState<CompositionOptions>({
    outputFormat: 'mp4',
    videoQuality: 'medium',
    audioQuality: 'medium',
    ...options.defaultOptions
  })

  // 检查浏览器支持情况
  const supportInfo = checkVideoCompositionSupport()

  const revokeCompositionResult = useCallback((target: CompositionResult | null) => {
    if (target?.videoUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(target.videoUrl)
    }
  }, [])

  useEffect(() => {
    resultRef.current = result
  }, [result])

  useEffect(() => {
    return () => {
      composerRef.current?.cancel()
      revokeCompositionResult(resultRef.current)
      resultRef.current = null
    }
  }, [revokeCompositionResult])

  // 验证输入
  const validateInput = useCallback((input: Partial<VideoCompositionInput>) => {
    const issues: string[] = []

    // 检查原始视频文件
    if (!input.originalVideoFile) {
      issues.push('缺少原始视频文件：出于数据安全考虑，原始素材仅在本地浏览器内处理，不会上传至云端。如浏览器提示视频已失效，请重新上传文件后再尝试合成。')
    } else {
      if (!input.originalVideoFile.file) {
        issues.push('视频文件数据无效')
      }
      if (!input.originalVideoFile.duration || input.originalVideoFile.duration <= 0) {
        issues.push('视频时长无效')
      }
    }

    // 检查脚本项目
    if (!input.scriptItems || input.scriptItems.length === 0) {
      issues.push('没有脚本片段')
    } else {
      // 检查每个脚本项目
      for (let i = 0; i < input.scriptItems.length; i++) {
        const item = input.scriptItems[i]
        if (!item.timestamp) {
          issues.push(`片段 ${item._id || i + 1} 缺少时间戳`)
        }
        if (item.OST === 0 && !item.narration) {
          issues.push(`解说片段 ${item._id || i + 1} 缺少解说文本`)
        }
      }
    }

    // 检查 TTS 音频状态
    if (!input.ttsAudioStates) {
      issues.push('缺少 TTS 音频状态数据')
    } else if (input.scriptItems) {
      // 检查每个需要 TTS 的片段是否有对应的音频
      const narrativeItems = input.scriptItems.filter(item => item.OST === 0)
      for (const item of narrativeItems) {
        const ttsState = input.ttsAudioStates[item._id]
        if (!ttsState || !ttsState.success || (!ttsState.audioBlob && !ttsState.audioUrl)) {
          issues.push(`片段 ${item._id} 的 TTS 音频未生成或无效`)
        }
      }
    }

    // 检查选项
    if (input.options) {
      const { outputFormat, videoQuality, audioQuality } = input.options
      
      if (outputFormat && !['mp4', 'webm', 'mov'].includes(outputFormat)) {
        issues.push(`不支持的输出格式: ${outputFormat}`)
      }
      
      if (videoQuality && !['low', 'medium', 'high'].includes(videoQuality)) {
        issues.push(`不支持的视频质量: ${videoQuality}`)
      }
      
      if (audioQuality && !['low', 'medium', 'high'].includes(audioQuality)) {
        issues.push(`不支持的音频质量: ${audioQuality}`)
      }
    }

    return {
      valid: issues.length === 0,
      issues
    }
  }, [])

  // 开始视频合成
  const startComposition = useCallback(async (input: VideoCompositionInput) => {
    try {
      // 清除之前的状态
      setError(null)
      revokeCompositionResult(resultRef.current)
      resultRef.current = null
      setResult(null)
      setProgress(null)
      setIsComposing(true)

      // 验证输入
      const validation = validateInput(input)
      if (!validation.valid) {
        throw new Error(`输入验证失败: ${validation.issues.join(', ')}`)
      }

      // 检查浏览器支持
      if (!supportInfo.supported) {
        throw new Error(`浏览器不支持视频合成功能。缺少功能: ${supportInfo.missingFeatures.join(', ')}`)
      }

      // 估算处理时间
      const composer = new VideoComposer()
      const segments = composer.prepareSegments(input.scriptItems, input.ttsAudioStates)
      const totalDuration = segments.reduce((sum: number, seg) => sum + (seg.endTime - seg.startTime), 0)
      const estimatedTimeSeconds = estimateCompositionTime(segments, totalDuration)
      setEstimatedTime(estimatedTimeSeconds)

      const startTime = Date.now()

      // 设置进度回调
      composer.setProgressCallback((newProgress: CompositionProgress) => {
        setProgress(newProgress)
        
        // 根据进度更新预估剩余时间
        if (newProgress.percentage > 0) {
          const elapsedTime = Date.now() - startTime
          const remainingPercentage = 100 - newProgress.percentage
          const estimatedRemaining = (elapsedTime / newProgress.percentage) * remainingPercentage / 1000
          
          setProgress(prev => prev ? {
            ...prev,
            estimatedTimeRemaining: Math.max(estimatedRemaining, 0)
          } : newProgress)
        }
      })

      composerRef.current = composer

      // 执行合成
      const compositionInput: VideoCompositionInput = {
        ...input,
        options: { ...compositionOptions, ...input.options }
      }

      const compositionResult = await composer.composeVideo(compositionInput)
      
      resultRef.current = compositionResult
      setResult(compositionResult)
      
      if (!compositionResult.success) {
        setError(compositionResult.error || '视频合成失败')
      }

    } catch (error) {
      console.error('视频合成失败:', error)
      setError(error instanceof Error ? error.message : '视频合成过程中发生未知错误')
      const failedResult: CompositionResult = { success: false, error: error instanceof Error ? error.message : '未知错误' }
      resultRef.current = failedResult
      setResult(failedResult)
    } finally {
      setIsComposing(false)
      composerRef.current = null
    }
  }, [compositionOptions, revokeCompositionResult, supportInfo, validateInput])

  // 取消视频合成
  const cancelComposition = useCallback(() => {
    if (composerRef.current) {
      composerRef.current.cancel()
    }
    setIsComposing(false)
    setProgress(null)
    setError('用户取消了操作')
  }, [])

  // 清除结果
  const clearResult = useCallback(() => {
    revokeCompositionResult(resultRef.current)
    resultRef.current = null
    setResult(null)
    setError(null)
    setProgress(null)
    setEstimatedTime(null)
  }, [revokeCompositionResult])

  // 下载结果
  const downloadResult = useCallback((filename?: string) => {
    if (!result?.videoBlob) {
      return
    }

    const url = URL.createObjectURL(result.videoBlob)
    const a = document.createElement('a')
    
    // 根据输出格式确定文件扩展名
    const extension = compositionOptions.outputFormat === 'webm' ? 'webm' : 
                     compositionOptions.outputFormat === 'mov' ? 'mov' : 'mp4'
    
    a.href = url
    a.download = filename || `composed-video-${Date.now()}.${extension}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [result, compositionOptions.outputFormat])

  // 更新合成选项
  const updateOptions = useCallback((newOptions: Partial<CompositionOptions>) => {
    setCompositionOptions(prev => ({ ...prev, ...newOptions }))
  }, [])

  return {
    // 状态
    isComposing,
    progress,
    result,
    error,
    isSupported: supportInfo.supported,
    supportInfo,
    estimatedTime,
    
    // 操作方法
    startComposition,
    cancelComposition,
    clearResult,
    downloadResult,
    
    // 配置方法
    updateOptions,
    
    // 验证方法
    validateInput
  }
}

// 工具函数：格式化时间
export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  
  if (minutes > 0) {
    return `${minutes} 分 ${remainingSeconds} 秒`
  }
  return `${remainingSeconds} 秒`
}

// 工具函数：格式化文件大小
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 工具函数：获取合成阶段的中文描述
export function getPhaseDescription(phase: CompositionProgress['phase']): string {
  const descriptions = {
    preparing: '准备阶段',
    clipping: '裁剪视频',
    processing_audio: '处理音频',
    composing: '拼接视频',
    finalizing: '完成处理'
  }
  
  return descriptions[phase] || phase
}
