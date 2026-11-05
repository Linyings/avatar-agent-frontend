import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Alert, Badge, Button, FileButton, Group, Slider, Stack, Stepper, Text } from '@mantine/core'
import { Link, useNavigate } from 'react-router-dom'
import {
  SparklesIcon,
  FilmIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ScissorsIcon,
  ArrowUpTrayIcon,
  ExclamationTriangleIcon
} from '@/shared/icons/tabler'
import type { ScriptItem, VideoFile, AudioGenerationStatus, CalibrationResult, CalibrationOptions, ServiceLevel, TTSVoiceConfig, TTSAudioState } from '@/shared/types'
import { VideoComposer } from '@/shared/components/video/VideoComposer'
import { useProject } from '../../contexts/ProjectContext'
import ProjectService from '../../services/projectService'
import DubbingScriptTable from './DubbingScriptTable'
import { audioPlayer, type AudioPlayerState } from '@/shared/services/audioPlayerService'
import ConfirmDialog from '@/shared/components/ui/ConfirmDialog'
import TimestampCalibrationDialog from '@/shared/components/ui/TimestampCalibrationDialog'
import { useToast } from '@/shared/contexts/ToastContext'
import { checkTimestampCalibration, performTimestampCalibration, DEFAULT_CALIBRATION_OPTIONS } from '@/shared/utils/calibrationUtils'
import CapcutExportModal from '@/shared/components/ui/CapcutExportModal'
import { exportToCapcut, type ExportProgress } from '../../services/capcut'
import { VoiceSelector } from '@/shared/components/tts/VoiceSelector'
import { loadTTSService } from '@/shared/services/ttsServiceLoader'
import { localAudioStorageService } from '@/shared/services/localAudioStorageService'
import { getAudioDuration } from '@/shared/utils/audioUtils'
import {
  WorkflowActionBar,
  WorkflowHeaderBackButton,
  WorkflowPageShell,
  WorkflowPanel,
  WorkflowRail,
  WorkflowState,
  WorkflowWorkbenchShell,
  type WorkflowRailItem,
} from '@/shared/components/ui/WorkflowPrimitives'

const formatDuration = (seconds?: number) => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return '待获取'
  }

  const minutes = Math.floor(seconds / 60)
  const restSeconds = Math.round(seconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(restSeconds).padStart(2, '0')}`
}

const hasPlayableAudio = (item: ScriptItem) => Boolean(item.audio_url || item.audio)

const revokeObjectUrl = (url?: string | null) => {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

const DubbingStage: React.FC = () => {
  // 从项目上下文获取项目信息
  const { currentProject, materialData } = useProject()
  const { showSuccess, showError } = useToast()
  const navigate = useNavigate()

  // 核心状态
  const [scriptItems, setScriptItems] = useState<ScriptItem[]>([])
  const scriptItemsRef = useRef<ScriptItem[]>([])
  const audioObjectUrlsRef = useRef<Map<number, string>>(new Map())
  const uploadedVideoObjectUrlRef = useRef<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audioGenerationStatus, setAudioGenerationStatus] = useState<Map<number, AudioGenerationStatus>>(new Map())
  const [currentPlayingId, setCurrentPlayingId] = useState<number | null>(null)
  const [showVideoComposer, setShowVideoComposer] = useState(false)
  const [uploadedVideoFile, setUploadedVideoFile] = useState<VideoFile | null>(null)

  // 确认对话框状态
  const [clearAllConfirm, setClearAllConfirm] = useState(false)
  const [clearSingleConfirm, setClearSingleConfirm] = useState<number | null>(null)

  // 校准弹窗状态
  const [showCalibrationDialog, setShowCalibrationDialog] = useState(false)
  const [calibrationResult, setCalibrationResult] = useState<CalibrationResult | null>(null)
  const [isAnalyzingCalibration, setIsAnalyzingCalibration] = useState(false)

  // 音频播放状态
  const [, setAudioPlayerState] = useState<AudioPlayerState>(audioPlayer.getState())

  // 操作状态
  const [, setIsSaving] = useState(false)
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [shouldAutoCalibrate, setShouldAutoCalibrate] = useState(false)
  const autoCalibrationInFlightRef = useRef(false)

  // 剪映导出状态
  const [showCapcutModal, setShowCapcutModal] = useState(false)

  // TTS配置状态
  const [voiceConfig, setVoiceConfig] = useState<TTSVoiceConfig>({ mode: 'builtin' })
  const [ttsSpeed, setTtsSpeed] = useState<number>(1.0)
  const [ttsVolume, setTtsVolume] = useState<number>(1.0)
  const serviceLevel = useMemo<ServiceLevel>(() => (
    voiceConfig.mode === 'builtin' && voiceConfig.selectedVoiceType === 'advanced' ? 'premium' : 'basic'
  ), [voiceConfig.mode, voiceConfig.selectedVoiceType])

  // 视频时长状态（用于从 materialData 获取的视频）
  const [materialVideoDuration, setMaterialVideoDuration] = useState<number>(0)

  const hasUsableLocalFile = (video: any): video is VideoFile & { file: File } => {
    if (!video?.file) return false
    return video.file instanceof File && video.file.size > 0
  }

  const createManagedAudioUrl = useCallback((itemId: number, audioBlob: Blob) => {
    const previousUrl = audioObjectUrlsRef.current.get(itemId)
    if (previousUrl) {
      URL.revokeObjectURL(previousUrl)
    }

    const audioUrl = URL.createObjectURL(audioBlob)
    audioObjectUrlsRef.current.set(itemId, audioUrl)
    return audioUrl
  }, [])

  const revokeUploadedVideoObjectUrl = useCallback(() => {
    if (uploadedVideoObjectUrlRef.current) {
      URL.revokeObjectURL(uploadedVideoObjectUrlRef.current)
      uploadedVideoObjectUrlRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      audioObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
      audioObjectUrlsRef.current.clear()
      revokeUploadedVideoObjectUrl()
    }
  }, [revokeUploadedVideoObjectUrl])

  // 直接使用 TTS 服务，避免重复调用
  // 移除 useTTS hook，因为它与组件内状态管理冲突

  // 状态管理辅助函数 - 简化 audioGenerationStatus 更新逻辑
  // const updateAudioStatus = useCallback((itemId: number, status: AudioGenerationStatus) => {
  //   setAudioGenerationStatus(prev => {
  //     const newMap = new Map(prev)
  //     newMap.set(itemId, status)
  //     return newMap
  //   })
  // }, [])

  const restoreLocalAudioItems = useCallback(async (items: ScriptItem[]) => {
    const restoredItems = await Promise.all(items.map(async (item) => {
      if (!item.local_audio_key) return item

      try {
        const audioBlob = await localAudioStorageService.getAudioBlob(item.local_audio_key)
        if (!audioBlob) {
          if (item.audio_url || item.audio) {
            return { ...item, local_audio_missing: false }
          }

          return {
            ...item,
            audio_url: undefined,
            audio: undefined,
            local_audio_missing: true
          }
        }

        const audioUrl = createManagedAudioUrl(item._id, audioBlob)
        return {
          ...item,
          audio_url: audioUrl,
          audio: audioUrl,
          audio_storage: 'local' as const,
          local_audio_missing: false
        }
      } catch (storageError) {
        console.warn('恢复本地音频缓存失败:', storageError)
        return item.audio_url || item.audio
          ? { ...item, local_audio_missing: false }
          : {
              ...item,
              audio_url: undefined,
              audio: undefined,
              local_audio_missing: true
            }
      }
    }))

    return restoredItems
  }, [createManagedAudioUrl])

  // 获取 AI 脚本数据
  const fetchAiScript = useCallback(async () => {
    if (!currentProject) return

    setLoading(true)
    setError(null)

    try {
      const aiScriptData = await ProjectService.getProjectAiScript(currentProject.id)
      console.log('配音页面获取到的AI脚本数据(原始):', aiScriptData)

      if (aiScriptData && aiScriptData.items) {
        // 使用智能转换函数将后端数据转换为前端格式
        const { smartConvertToFrontendBatch } = await import('@/shared/utils/scriptDataAdapter')
        const convertedItems = smartConvertToFrontendBatch(aiScriptData.items)

        // 确保所有脚本项都有完整的时间字段（支持新旧格式）
        const { ensureTimeFieldsBatch } = await import('@/shared/utils/timestampUtils')
        const normalizedItems = ensureTimeFieldsBatch(convertedItems) as ScriptItem[]
        const restoredItems = await restoreLocalAudioItems(normalizedItems)

        console.log('配音页面转换后的脚本数据:', restoredItems)
        scriptItemsRef.current = restoredItems
        setScriptItems(restoredItems)
      } else {
        scriptItemsRef.current = []
        setScriptItems([])
      }
    } catch (err) {
      console.error('获取AI脚本失败:', err)
      setError(err instanceof Error ? err.message : '获取脚本数据失败')
    } finally {
      setLoading(false)
    }
  }, [currentProject, restoreLocalAudioItems])

  // 初始化加载数据
  useEffect(() => {
    fetchAiScript()
  }, [fetchAiScript])

  // 监听音频播放器状态变化
  useEffect(() => {
    const unsubscribe = audioPlayer.onStateChange((state) => {
      setAudioPlayerState(state)
    })

    return unsubscribe
  }, [])

  // 检查音频状态
  const checkAudioStatus = useCallback(() => {
    const narrativeItems = scriptItems.filter(item => item.OST === 0)
    const needsGeneration = narrativeItems.filter(item => !hasPlayableAudio(item))
    const hasAudio = narrativeItems.filter(hasPlayableAudio)

    return { needsGeneration, hasAudio, narrativeItems }
  }, [scriptItems])

  const persistScriptItems = useCallback(async (items: ScriptItem[]) => {
    if (!currentProject) return

    const { convertFrontendToNewBatch } = await import('@/shared/utils/scriptDataAdapter')
    const newFormatItems = convertFrontendToNewBatch(items)

    await ProjectService.saveProjectScript(currentProject.id, {
      items: newFormatItems,
      updated_at: new Date().toISOString()
    })
  }, [currentProject])

  const saveGeneratedAudioLocally = useCallback(async (
    itemId: number,
    audioBlob: Blob,
    fallbackDuration?: number
  ) => {
    if (!currentProject) {
      throw new Error('项目不存在，无法保存本地音频')
    }

    const duration = typeof fallbackDuration === 'number' && Number.isFinite(fallbackDuration) && fallbackDuration > 0
      ? fallbackDuration
      : await getAudioDuration(audioBlob).catch(() => undefined)
    const localAudioKey = await localAudioStorageService.saveNarrationAudio({
      projectId: currentProject.id,
      itemId,
      blob: audioBlob,
      duration
    })
    const audioUrl = createManagedAudioUrl(itemId, audioBlob)

    const updatedItems = scriptItemsRef.current.map(item =>
      item._id === itemId
        ? {
            ...item,
            audio_url: audioUrl,
            audio: audioUrl,
            local_audio_key: localAudioKey,
            audio_storage: 'local' as const,
            local_audio_missing: false,
            duration: duration ?? item.duration
          }
        : item
    )

    scriptItemsRef.current = updatedItems
    setScriptItems(updatedItems)
    return updatedItems
  }, [createManagedAudioUrl, currentProject])


  // 生成单个音频 - 支持内置音色和自定义音色
  const generateAudio = useCallback(async (itemId: number, text: string) => {
    if (!currentProject) return
    const projectId = currentProject.id

    const currentItem = scriptItemsRef.current.find(item => item._id === itemId)
    const narrationText = (text || currentItem?.text || currentItem?.narration || '').trim()

    if (!narrationText) {
      showError('生成失败', '解说文本为空，无法生成音频')
      return
    }

    // 验证音色配置
    if (voiceConfig.mode === 'builtin' && !voiceConfig.selectedVoiceUri) {
      showError('缺少音色', '请先选择内置音色')
      return
    }
    if (voiceConfig.mode === 'custom' && !voiceConfig.customAudioFile) {
      showError('缺少音色', '请先上传自定义音色文件')
      return
    }

    // 更新状态为生成中
    setAudioGenerationStatus(prev => {
      const newMap = new Map(prev)
      newMap.set(itemId, { status: 'generating' })
      return newMap
    })

    let voiceUri: string | null = null
    let needsCleanup = false // 标记是否需要清理临时音色

    try {
      const {
        uploadReferenceVoice,
        generateTTSWithBuiltInVoice,
        generateTTSWithVoiceUri
      } = await loadTTSService()

      let ttsResult

      if (voiceConfig.mode === 'builtin') {
        // 使用内置音色，直接生成，无需上传和删除
        ttsResult = await generateTTSWithBuiltInVoice(narrationText, voiceConfig.selectedVoiceUri!, {
          speed: ttsSpeed,
          volume: ttsVolume,
          service_level: serviceLevel
        })
      } else {
        // 使用自定义音色，需要上传获取URI后再生成，最后清理
        voiceUri = await uploadReferenceVoice(voiceConfig.customAudioFile!, serviceLevel)
        needsCleanup = true

        ttsResult = await generateTTSWithVoiceUri(narrationText, voiceUri, {
          speed: ttsSpeed,
          volume: ttsVolume,
          service_level: serviceLevel,
          projectId
        })
      }

      if (!ttsResult.success || !ttsResult.audioBlob) {
        throw new Error(ttsResult.error || '音频生成失败')
      }

      try {
        // 更新状态为本地保存中
        setAudioGenerationStatus(prev => {
          const newMap = new Map(prev)
          newMap.set(itemId, { status: 'uploading' })
          return newMap
        })

        const updatedItems = await saveGeneratedAudioLocally(itemId, ttsResult.audioBlob, ttsResult.duration)
        await persistScriptItems(updatedItems)

        // 更新状态为完成
        setAudioGenerationStatus(prev => {
          const newMap = new Map(prev)
          newMap.set(itemId, { status: 'completed' })
          return newMap
        })
      } finally {
        revokeObjectUrl(ttsResult.audioUrl)
      }

      console.log(`音频已保存到浏览器本地缓存: itemId=${itemId}`)
    } catch (error) {
      console.error('生成音频失败:', error)
      setAudioGenerationStatus(prev => {
        const newMap = new Map(prev)
        newMap.set(itemId, {
          status: 'failed',
          error: error instanceof Error ? error.message : '生成失败'
        })
        return newMap
      })

      showError('生成失败', error instanceof Error ? error.message : '音频生成失败，请重试')
    }
    finally {
      // 仅当使用自定义音色时才需要清理临时音色
      if (needsCleanup && voiceUri) {
        try {
          const { deleteReferenceVoice } = await loadTTSService()
          await deleteReferenceVoice(voiceUri, serviceLevel)
        } catch (cleanupError) {
          console.warn('清理参考音色失败（非致命错误）:', cleanupError)
        }
      }
    }
  }, [currentProject, persistScriptItems, saveGeneratedAudioLocally, voiceConfig, ttsSpeed, ttsVolume, serviceLevel, showError])

  // 批量生成所有音频 - 支持内置音色和自定义音色
  const generateAllAudio = useCallback(async () => {
    if (!currentProject) return
    const projectId = currentProject.id

    const { needsGeneration } = checkAudioStatus()

    if (needsGeneration.length === 0) {
      console.log('没有需要生成的音频')
      return
    }

    // 验证音色配置
    if (voiceConfig.mode === 'builtin' && !voiceConfig.selectedVoiceUri) {
      showError('缺少音色', '请先选择内置音色')
      return
    }
    if (voiceConfig.mode === 'custom' && !voiceConfig.customAudioFile) {
      showError('缺少音色', '请先上传自定义音色文件')
      return
    }

    // 设置所有待生成项为生成中状态
    needsGeneration.forEach(item => {
      setAudioGenerationStatus(prev => {
        const newMap = new Map(prev)
        newMap.set(item._id, { status: 'generating' })
        return newMap
      })
    })

    let successCount = 0
    let failureCount = 0
    let voiceUri: string | null = null
    let needsCleanup = false

    try {
      // 步骤1: 获取 voice_uri
      if (voiceConfig.mode === 'builtin') {
        // 内置音色直接使用URI，无需上传
        voiceUri = voiceConfig.selectedVoiceUri!
        console.log('使用内置音色，voice_uri:', voiceUri)
      } else {
        // 自定义音色需要上传获取URI
        console.log('上传自定义音色...')
        const { uploadReferenceVoice } = await loadTTSService()
        voiceUri = await uploadReferenceVoice(voiceConfig.customAudioFile!, serviceLevel)
        needsCleanup = true
        console.log('自定义音色上传成功，voice_uri:', voiceUri)
      }

      // 步骤2: 批量生成音频
      const { generateTTSWithVoiceUri } = await loadTTSService()

      // 使用并发控制，每次处理 3 个音频，避免 API 限流
      const BATCH_SIZE = 3

      for (let i = 0; i < needsGeneration.length; i += BATCH_SIZE) {
        const batch = needsGeneration.slice(i, i + BATCH_SIZE)

        // 并发处理当前批次
        const batchPromises = batch.map(async (item) => {
          try {
            // 生成音频
            const narrationText = item.narration || item.text || ''
            if (!narrationText.trim()) {
              throw new Error('解说文本为空')
            }

            const ttsResult = await generateTTSWithVoiceUri(narrationText, voiceUri!, {
              speed: ttsSpeed,
              volume: ttsVolume,
              service_level: serviceLevel,
              projectId
            })

            if (!ttsResult.success || !ttsResult.audioBlob) {
              throw new Error(ttsResult.error || '音频生成失败')
            }

            try {
              // 更新状态为本地保存中
              setAudioGenerationStatus(prev => {
                const newMap = new Map(prev)
                newMap.set(item._id, { status: 'uploading' })
                return newMap
              })

              await saveGeneratedAudioLocally(item._id, ttsResult.audioBlob, ttsResult.duration)

              // 更新状态为完成
              setAudioGenerationStatus(prev => {
                const newMap = new Map(prev)
                newMap.set(item._id, { status: 'completed' })
                return newMap
              })
            } finally {
              revokeObjectUrl(ttsResult.audioUrl)
            }

            successCount++
            console.log(`音频已保存到浏览器本地缓存: ${item._id} (${successCount}/${needsGeneration.length})`)

          } catch (error) {
            failureCount++
            console.error(`音频生成失败 (itemId: ${item._id}):`, error)
            setAudioGenerationStatus(prev => {
              const newMap = new Map(prev)
              newMap.set(item._id, {
                status: 'failed',
                error: error instanceof Error ? error.message : '生成失败'
              })
              return newMap
            })
          }
        })

        // 等待当前批次完成
        await Promise.allSettled(batchPromises)

        // 批次间添加短暂延迟，避免 API 限流
        if (i + BATCH_SIZE < needsGeneration.length) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      const totalProcessed = successCount + failureCount
      console.log(`批量生成完成！成功 ${successCount} 个，失败 ${failureCount} 个，共处理 ${totalProcessed} 个音频文件`)

      // 批量生成完成后自动保存脚本
      if (successCount > 0) {
        if (currentProject) {
          try {
            console.log('批量生成完成，开始自动保存脚本...')

            await persistScriptItems(scriptItemsRef.current)

            console.log('脚本保存成功(本地音频索引):', scriptItemsRef.current)
            showSuccess('保存完成', `已自动保存 ${successCount} 个本地音频索引`)
          } catch (saveError) {
            console.error('自动保存脚本失败:', saveError)
            showError('保存失败', '自动保存脚本失败，请手动保存')
          }
        }

        setShouldAutoCalibrate(true)
      }

    } catch (error) {
      console.error('批量生成音频过程中出错:', error)

      // 将所有未处理的状态设为失败
      needsGeneration.forEach(item => {
        setAudioGenerationStatus(prev => {
          const currentStatus = prev.get(item._id)
          if (currentStatus?.status === 'generating') {
            const newMap = new Map(prev)
            newMap.set(item._id, { status: 'failed', error: '批量生成中断' })
            return newMap
          }
          return prev
        })
      })
    } finally {
      // 步骤3: 仅当使用自定义音色时才清理临时音色
      if (needsCleanup && voiceUri) {
        try {
          console.log('清理临时音色...')
          const { deleteReferenceVoice } = await loadTTSService()
          await deleteReferenceVoice(voiceUri, serviceLevel)
          console.log('临时音色清理成功')
        } catch (cleanupError) {
          console.warn('清理临时音色失败（非致命错误）:', cleanupError)
        }
      }
    }
  }, [checkAudioStatus, currentProject, persistScriptItems, saveGeneratedAudioLocally, voiceConfig, ttsSpeed, ttsVolume, serviceLevel, showSuccess, showError])

  // 保存脚本到后端
  const saveScript = useCallback(async () => {
    if (!currentProject) return

    setIsSaving(true)
    try {
      await persistScriptItems(scriptItemsRef.current)
      console.log('脚本保存成功(新格式):', scriptItemsRef.current)
    } catch (error) {
      console.error('保存脚本失败:', error)
      console.error('保存脚本失败，请重试')
    } finally {
      setIsSaving(false)
    }
  }, [currentProject, persistScriptItems])
  // 清理所有音频 URL
  const handleClearAllAudio = useCallback(async () => {
    if (!currentProject) return
    setClearAllConfirm(true)
  }, [currentProject])

  // 执行清理所有音频操作
  const executeCleanAllAudio = useCallback(async () => {
    if (!currentProject) return

    try {
      setIsSaving(true)

      await Promise.all(scriptItems
        .filter(item => item.local_audio_key)
        .map(item => localAudioStorageService.deleteAudio(item.local_audio_key!).catch(deleteError => {
          console.warn('清理本地音频缓存失败:', deleteError)
        })))
      audioObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
      audioObjectUrlsRef.current.clear()

      // 清理所有音频引用
      const clearedItems = scriptItems.map(item => ({
        ...item,
        audio_url: undefined,
        audio: undefined,
        local_audio_key: undefined,
        audio_storage: undefined,
        local_audio_missing: undefined,
        duration: undefined
      }))

      scriptItemsRef.current = clearedItems
      setScriptItems(clearedItems)

      // 清理音频生成状态
      setAudioGenerationStatus(new Map())

      await persistScriptItems(clearedItems)

      showSuccess('清理完成', '音频已全部清理完成！')
    } catch (error) {
      console.error('清理音频失败:', error)
      showError('清理失败', '清理音频失败，请重试')
    } finally {
      setIsSaving(false)
    }
  }, [currentProject, persistScriptItems, scriptItems, showSuccess, showError])

  // 清理单个音频
  const clearSingleAudio = useCallback(async (itemId: number) => {
    if (!currentProject) return
    setClearSingleConfirm(itemId)
  }, [currentProject])

  // 执行清理单个音频操作
  const executeClearSingleAudio = useCallback(async (itemId: number) => {
    if (!currentProject) return

    try {
      setIsSaving(true)

      const targetItem = scriptItems.find(item => item._id === itemId)
      if (targetItem?.local_audio_key) {
        await localAudioStorageService.deleteAudio(targetItem.local_audio_key).catch(deleteError => {
          console.warn('清理本地音频缓存失败:', deleteError)
        })
      }
      const objectUrl = audioObjectUrlsRef.current.get(itemId)
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
        audioObjectUrlsRef.current.delete(itemId)
      }

      // 清理指定项的音频引用
      const updatedItems = scriptItems.map(item =>
        item._id === itemId
          ? {
              ...item,
              audio_url: undefined,
              audio: undefined,
              local_audio_key: undefined,
              audio_storage: undefined,
              local_audio_missing: undefined,
              duration: undefined
            }
          : item
      )

      scriptItemsRef.current = updatedItems
      setScriptItems(updatedItems)

      // 清理该项的音频生成状态
      setAudioGenerationStatus(prev => {
        const newMap = new Map(prev)
        newMap.delete(itemId)
        return newMap
      })

      await persistScriptItems(updatedItems)

      showSuccess('删除完成', '音频已删除完成！')
    } catch (error) {
      console.error('删除音频失败:', error)
      showError('删除失败', '删除音频失败，请重试')
    } finally {
      setIsSaving(false)
    }
  }, [currentProject, persistScriptItems, scriptItems, showSuccess, showError])

  // 时间戳校准功能 - 分析并显示校准弹窗
  const calibrateTimestamps = useCallback(async () => {
    const { hasAudio } = checkAudioStatus()

    if (hasAudio.length === 0) {
      showError('无音频文件', '没有音频文件可以校准，请先生成音频')
      return
    }

    setIsAnalyzingCalibration(true)
    try {
      // 构建 TTS 音频状态映射，用于校准分析
      const ttsAudioStates: TTSAudioState = {}

      for (const item of hasAudio) {
        const audioUrl = item.audio_url || item.audio
        if (!audioUrl) continue

        const itemDuration = (() => {
          if (typeof item.duration === 'number' && isFinite(item.duration) && item.duration > 0) {
            return item.duration
          }
          const legacyDuration = (item as { audio_duration?: number }).audio_duration
          if (typeof legacyDuration === 'number' && isFinite(legacyDuration) && legacyDuration > 0) {
            return legacyDuration
          }
          return undefined
        })()

        ttsAudioStates[item._id] = {
          success: true,
          audioUrl,
          duration: itemDuration,
          isFromBackend: true
        }
      }

      // 使用校准工具函数分析需要校准的项目
      const result = await checkTimestampCalibration(
        scriptItems,
        ttsAudioStates,
        DEFAULT_CALIBRATION_OPTIONS
      )

      if (!result.hasItemsToCalibrate) {
        const checkedCount = result.items.filter(item =>
          Number.isFinite(item.audioDuration) && item.audioDuration > 0
        ).length
        const unreadableCount = result.items.length - checkedCount

        if (checkedCount === 0 || unreadableCount > 0) {
          showError(
            '校准分析不完整',
            `有 ${Math.max(unreadableCount, hasAudio.length - checkedCount)} 个音频片段无法读取时长，未能确认是否需要校准`
          )
          return
        }

        showSuccess('无需校准', '所有音频片段的时长都在允许范围内，无需校准')
        return
      }

      // 显示校准弹窗
      setCalibrationResult(result)
      setShowCalibrationDialog(true)
    } catch (error) {
      console.error('校准分析失败:', error)
      showError('分析失败', '校准分析失败，请重试')
    } finally {
      setIsAnalyzingCalibration(false)
    }
  }, [checkAudioStatus, scriptItems, showSuccess, showError])

  const handleManualCalibrate = useCallback(async () => {
    setShouldAutoCalibrate(false)
    await calibrateTimestamps()
  }, [calibrateTimestamps])

  useEffect(() => {
    if (!shouldAutoCalibrate) return
    if (isAnalyzingCalibration || isCalibrating || autoCalibrationInFlightRef.current) return

    const runAutoCalibration = async () => {
      autoCalibrationInFlightRef.current = true
      setShouldAutoCalibrate(false)

      try {
        await calibrateTimestamps()
      } catch (error) {
        console.error('自动触发校准失败:', error)
      } finally {
        autoCalibrationInFlightRef.current = false
      }
    }

    runAutoCalibration()
  }, [shouldAutoCalibrate, isAnalyzingCalibration, isCalibrating, calibrateTimestamps])

  // 校准确认处理函数
  const handleConfirmCalibration = useCallback(async (options: CalibrationOptions) => {
    if (!calibrationResult) return

    setIsCalibrating(true)
    try {
      // 使用校准工具函数执行校准
      const calibratedItems = performTimestampCalibration(
        scriptItems,
        calibrationResult.items.filter(item => item.needsCalibration),
        options
      )

      scriptItemsRef.current = calibratedItems
      setScriptItems(calibratedItems)

      const calibratedCount = calibrationResult.items.filter(item => item.needsCalibration).length
      showSuccess('校准完成', `已成功校准 ${calibratedCount} 个音频片段的时间戳`)

      // 校准完成后自动保存脚本
      await saveScript()
    } catch (error) {
      console.error('执行校准失败:', error)
      showError('校准失败', '执行校准时发生错误，请重试')
    } finally {
      setIsCalibrating(false)
      setShowCalibrationDialog(false)
      setCalibrationResult(null)
    }
  }, [calibrationResult, scriptItems, showSuccess, showError, saveScript])

  // 校准跳过处理函数
  const handleSkipCalibration = useCallback(() => {
    showSuccess('已跳过校准', '时间戳校准已跳过，您可以稍后再进行校准')
    setShowCalibrationDialog(false)
    setCalibrationResult(null)
  }, [showSuccess])


  // 音频播放控制
  const playAudio = useCallback(async (itemId: number, audioUrl: string) => {
    try {
      // 停止当前播放
      audioPlayer.stop()

      // 设置当前播放的项目ID
      setCurrentPlayingId(itemId)

      // 加载并播放音频（AudioPlayerService 内部已处理跨域问题）
      await audioPlayer.loadFromUrl(audioUrl)
      audioPlayer.play()

      // 音频播放结束时清除当前播放ID
      const unsubscribe = audioPlayer.onStateChange((state) => {
        if (!state.isPlaying && state.currentTime >= state.duration && state.duration > 0) {
          setCurrentPlayingId(null)
          unsubscribe() // 清理监听器
        }
      })
    } catch (error) {
      console.error('播放音频失败:', error)
      setCurrentPlayingId(null)

      // 记录错误日志
      console.error('音频播放失败:', error instanceof Error ? error.message : '音频播放失败')
    }
  }, [])

  const pauseAudio = useCallback(() => {
    audioPlayer.pause()
    setCurrentPlayingId(null)
  }, [])

  // 获取视频时长的辅助函数
  const getVideoDuration = useCallback((file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.preload = 'metadata'

      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src)
        resolve(video.duration)
      }

      video.onerror = () => {
        URL.revokeObjectURL(video.src)
        reject(new Error('无法加载视频文件'))
      }

      video.src = URL.createObjectURL(file)
    })
  }, [])

  // 获取 materialData 视频的时长（仅当 videoFile 是纯 File 对象时）
  useEffect(() => {
    const loadMaterialVideoDuration = async () => {
      if (!materialData?.videoFile) return

      // 检查是否已经包含 duration
      const videoData = materialData.videoFile as any
      if (videoData.duration && typeof videoData.duration === 'number' && videoData.duration > 0) {
        // 已有 duration，无需异步获取
        console.log('[DubbingStage] 视频已包含 duration，跳过异步获取')
        setMaterialVideoDuration(videoData.duration)
        return
      }

      // 只有当 videoFile 是纯 File 对象时才进行异步获取
      if (materialData.videoFile instanceof File) {
        try {
          console.log('[DubbingStage] 开始异步获取视频时长...')
          const duration = await getVideoDuration(materialData.videoFile as File)
          setMaterialVideoDuration(duration)
          console.log('[DubbingStage] 视频时长异步获取完成:', duration)
        } catch (error) {
          console.error('[DubbingStage] 获取视频时长失败:', error)
          setMaterialVideoDuration(0)
        }
      }
    }

    loadMaterialVideoDuration()
  }, [materialData?.videoFile, getVideoDuration])

  // 构建 TTS 音频状态映射（用于视频合成）
  const buildTTSAudioStates = useCallback((items: ScriptItem[]) => {
    const ttsAudioStates: TTSAudioState = {}

    items.forEach(item => {
      // 只处理解说片段（OST === 0）且有音频URL的项
      const audioUrl = item.audio_url || item.audio
      if (item.OST === 0 && audioUrl) {
        ttsAudioStates[item._id] = {
          success: true,
          audioUrl,
          duration: typeof item.duration === 'number' ? item.duration : undefined,
          isFromBackend: true // 标记这是从后端加载的音频
        }
      }
    })

    return ttsAudioStates
  }, [])

  // 从项目上下文获取原始视频文件
  // 智能处理 materialData.videoFile：如果已包含 duration，直接使用；否则异步获取
  const originalVideoFile = useMemo<VideoFile | undefined>(() => {
    if (hasUsableLocalFile(uploadedVideoFile)) {
      return uploadedVideoFile
    }

    const videoData = materialData?.videoFile as VideoFile | File | null | undefined
    if (!hasUsableLocalFile(videoData)) {
      return undefined
    }

    const casted = videoData as VideoFile
    if (typeof casted.duration !== 'number' || casted.duration <= 0) {
      if (materialVideoDuration > 0) {
        return {
          ...casted,
          duration: materialVideoDuration
        }
      }
    }
    return casted
  }, [uploadedVideoFile, materialData?.videoFile, materialVideoDuration])

  const needsVideoReupload = Boolean(materialData?.videoFile && !originalVideoFile)

  // 计算视频文件名
  const videoFileName = useMemo(() => {
    const file = originalVideoFile?.file
    if (file instanceof File) {
      return file.name
    }
    if (originalVideoFile && typeof (originalVideoFile as any).name === 'string') {
      return (originalVideoFile as any).name as string
    }
    return '未选择'
  }, [originalVideoFile])

  // 处理文件选择（外部上传处理）
  const handleFileChange = useCallback(async (file: File | null) => {
    if (!file) return

    if (!file.type.startsWith('video/')) {
      showError('文件类型错误', '请选择视频文件')
      return
    }

    try {
      const duration = await getVideoDuration(file)
      const url = URL.createObjectURL(file)
      revokeUploadedVideoObjectUrl()
      uploadedVideoObjectUrlRef.current = url

      const videoFile: VideoFile = {
        file,
        url,
        duration
      }

      setUploadedVideoFile(videoFile)
      showSuccess('上传成功', `已选择视频: ${file.name}`)
    } catch (error) {
      console.error('Failed to get video duration:', error)
      showError('视频加载失败', '无法读取视频时长，请重试')
    }
  }, [getVideoDuration, revokeUploadedVideoObjectUrl, showError, showSuccess])

  // 下载 JSON 文件功能
  const handleDownloadJSON = async () => {
    // 将前端数据转换为新格式后下载
    const { convertFrontendToNewBatch } = await import('@/shared/utils/scriptDataAdapter')
    const newFormatItems = convertFrontendToNewBatch(scriptItems)

    const dataToDownload = {
      items: newFormatItems,
      updated_at: new Date().toISOString()
    }

    const blob = new Blob([JSON.stringify(dataToDownload, null, 2)], {
      type: 'application/json'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')

    a.href = url
    a.download = `dubbing-script-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // 导出到剪映草稿（前端实现）
  const handleExportToCapcut = useCallback(
    async (
      videoFile: File,
      draftPath: string,
      dirHandle?: FileSystemDirectoryHandle,
      onProgress?: (progress: ExportProgress) => void
    ) => {
      try {
        // 调用前端导出服务
        const result = await exportToCapcut(videoFile, scriptItems, {
          draftPath,
          dirHandle,
          onProgress: (progress) => {
            console.log('导出进度:', progress)
            onProgress?.(progress)
          }
        })

        if (result.success) {
          // 导出成功
          showSuccess('导出成功', result.message)

          // 关闭 Modal
          setShowCapcutModal(false)
        }
      } catch (error) {
        console.error('导出到剪映草稿失败:', error)

        // 错误已经在 Modal 中显示，这里只记录日志
        throw error
      }
    },
    [scriptItems, showSuccess]
  )

  // 处理脚本数据变更
  const handleScriptChange = useCallback((newData: ScriptItem[]) => {
    scriptItemsRef.current = newData
    setScriptItems(newData)
  }, [])

  // 处理音色配置变更
  const handleVoiceConfigChange = useCallback((config: TTSVoiceConfig) => {
    setVoiceConfig(config)
  }, [])

  // 处理音色配置错误
  const handleVoiceConfigError = useCallback((error: string) => {
    showError('音色配置错误', error)
  }, [showError])

  const audioSummary = useMemo(() => {
    const narrativeItems = scriptItems.filter(item => item.OST === 0)
    const hasAudio = narrativeItems.filter(hasPlayableAudio)
    const needsGeneration = narrativeItems.filter(item => !hasPlayableAudio(item))

    return {
      narrativeItems,
      hasAudio,
      needsGeneration,
      generatedCount: hasAudio.length,
      pendingCount: needsGeneration.length,
    }
  }, [scriptItems])

  const navigateToProjectStep = useCallback((path: string) => {
    if (!currentProject?.id) return
    navigate(`/projects/${currentProject.id}${path}`)
  }, [currentProject?.id, navigate])

  const railItems: WorkflowRailItem[] = [
    { id: 'upload', label: '上传视频', status: 'completed', description: '素材已处理', onSelect: () => navigateToProjectStep('/material/upload') },
    { id: 'crop', label: '裁剪视频', status: 'completed', description: '范围已确认', onSelect: () => navigateToProjectStep('/material/upload') },
    { id: 'recognize', label: '识别字幕', status: 'completed', description: 'ASR / OCR / SRT', onSelect: () => navigateToProjectStep('/material/upload') },
    { id: 'review', label: '校对字幕', status: 'completed', description: '字幕可用于分析', onSelect: () => navigateToProjectStep('/material/upload') },
    { id: 'config', label: '配置参数', status: 'completed', description: '策略已确认', onSelect: () => navigateToProjectStep('/material/config?section=quick') },
    { id: 'preview-script', label: '预览脚本', status: 'completed', description: `${scriptItems.length} 条脚本`, onSelect: () => navigateToProjectStep('/analysis') },
    {
      id: 'dubbing',
      label: '配音制作',
      status: 'current',
      description: audioSummary.generatedCount > 0 ? `已配音 ${audioSummary.generatedCount} 条` : '生成配音音频',
    },
    {
      id: 'compose',
      label: '合成视频',
      status: audioSummary.generatedCount > 0 ? 'upcoming' : 'disabled',
      description: originalVideoFile?.file ? '可合成预览' : '等待原视频',
      disabled: audioSummary.generatedCount === 0,
      onSelect: audioSummary.generatedCount > 0 ? () => setShowVideoComposer(true) : undefined,
    },
  ]
  const activeRailIndex = Math.max(0, railItems.findIndex((item) => item.status === 'current'))

  const mobileProgress = (
    <WorkflowPanel tone="subtle" p="md" radius="lg">
      <Stepper active={activeRailIndex} size="xs" allowNextStepsSelect={false}>
        {railItems.map((item) => (
          <Stepper.Step key={item.id} label={item.label} />
        ))}
      </Stepper>
    </WorkflowPanel>
  )

  const pageMeta = (
    <Group gap="xs" wrap="wrap" justify="flex-end">
      <Badge variant="light" size="lg">当前 · 配音制作</Badge>
      <Badge variant="outline" color="gray" size="lg">脚本 · {scriptItems.length} 条</Badge>
      <Badge variant="outline" color="gray" size="lg">
        已配音 · {audioSummary.generatedCount}/{audioSummary.narrativeItems.length}
      </Badge>
      <Badge variant="outline" color="gray" size="lg">视频 · {formatDuration(originalVideoFile?.duration)}</Badge>
    </Group>
  )

  // 检查是否有数据加载
  if (loading) {
    return (
      <WorkflowPageShell width="narrow">
        <WorkflowState loading title="正在加载脚本数据..." description="请稍候，正在从后端获取脚本内容。" />
      </WorkflowPageShell>
    )
  }

  // 检查是否有错误
  if (error) {
    return (
      <WorkflowPageShell width="narrow">
        <WorkflowState
          tone="danger"
          title="加载失败"
          description={error}
          action={
            <Button color="brand" onClick={fetchAiScript} leftSection={<ArrowPathIcon width={18} height={18} />}>
              重新加载
            </Button>
          }
        />
      </WorkflowPageShell>
    )
  }

  // 检查是否没有脚本数据
  if (scriptItems.length === 0) {
    return (
      <WorkflowPageShell width="narrow">
        <WorkflowState
          title="脚本未生成"
          description="请先在分析阶段生成编辑脚本。"
          action={
            <Button
              component={Link}
              to={`/projects/${currentProject?.id}/analysis`}
              color="brand"
              leftSection={<SparklesIcon width={18} height={18} />}
            >
              返回分析页面
            </Button>
          }
        />
      </WorkflowPageShell>
    )
  }

  const mainContent = (
    <Stack gap="lg">
      <VoiceSelector
        value={voiceConfig}
        onChange={handleVoiceConfigChange}
        onError={handleVoiceConfigError}
      />

      <WorkflowPanel>
        <Group justify="space-between" align="center" gap="lg">
          <Stack gap={4}>
            <Text fw={700}>语速与音量</Text>
            <Text c="var(--app-muted)" size="sm">调整配音节奏和输出音量。</Text>
          </Stack>
          <Group gap="xl" wrap="wrap" style={{ flex: 1 }} justify="flex-end">
            <Group gap="md" miw={{ base: '100%', sm: 260 }}>
              <Text size="sm" fw={700} miw={40}>语速</Text>
              <Slider min={0.8} max={1.4} step={0.1} value={ttsSpeed} onChange={setTtsSpeed} style={{ flex: 1 }} />
              <Text fw={700} miw={48}>{ttsSpeed.toFixed(1)}x</Text>
            </Group>
            <Group gap="md" miw={{ base: '100%', sm: 260 }}>
              <Text size="sm" fw={700} miw={40}>音量</Text>
              <Slider min={0} max={2} step={0.1} value={ttsVolume} onChange={setTtsVolume} style={{ flex: 1 }} />
              <Text fw={700} miw={48}>{ttsVolume.toFixed(1)}x</Text>
            </Group>
          </Group>
        </Group>
      </WorkflowPanel>

      <DubbingScriptTable
        data={scriptItems}
        onChange={handleScriptChange}
        onGenerateAudio={generateAudio}
        onPlayAudio={playAudio}
        onPauseAudio={pauseAudio}
        onClearSingleAudio={clearSingleAudio}
        audioGenerationStatus={audioGenerationStatus}
        currentPlayingId={currentPlayingId}
        globalOperations={{
          onGenerateAll: generateAllAudio,
          onCalibrateAll: handleManualCalibrate,
          onSaveScript: saveScript,
          onClearAllAudio: handleClearAllAudio
        }}
        isAnalyzingCalibration={isAnalyzingCalibration}
        isCalibrating={isCalibrating}
      />

      <WorkflowPanel>
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" gap="md">
            <Stack gap={4}>
              <Text fw={700}>合成预览</Text>
              <Text c="var(--app-muted)" size="sm">
                使用原视频和已生成配音预览最终效果，也可以导出剪映草稿继续精剪。
              </Text>
            </Stack>
            <Badge variant="light" color={originalVideoFile?.file ? 'brand' : 'yellow'}>
              {originalVideoFile?.file ? videoFileName : '需要原视频'}
            </Badge>
          </Group>

          {!originalVideoFile?.file && (
            <Alert color="yellow" variant="light" icon={<ExclamationTriangleIcon width={18} height={18} />}>
              原始素材仅在本地浏览器内处理，不会上传至云端。如浏览器提示视频已失效，请重新上传文件后再尝试合成。
            </Alert>
          )}

          {showVideoComposer && (
            <VideoComposer
              originalVideoFile={originalVideoFile || null}
              scriptItems={scriptItems}
              ttsAudioStates={buildTTSAudioStates(scriptItems)}
              needsVideoReupload={needsVideoReupload}
              onCompositionComplete={() => {
                // 合成完成后的处理逻辑
              }}
            />
          )}
        </Stack>
      </WorkflowPanel>
    </Stack>
  )

  const actionBar = (
    <WorkflowActionBar>
      <Group justify="space-between" gap="md" wrap="wrap">
        <Text size="sm" c="var(--app-muted)">
          待生成 {audioSummary.pendingCount} 条配音，完成后可合成预览或导出剪映草稿。
        </Text>
        <Group gap="sm" wrap="wrap">
          <Button
            variant="light"
            color="gray"
            onClick={handleDownloadJSON}
            leftSection={<ArrowDownTrayIcon width={16} height={16} />}
          >
            下载脚本
          </Button>
          <Button
            variant="light"
            color="gray"
            onClick={fetchAiScript}
            disabled={loading}
            leftSection={<ArrowPathIcon width={16} height={16} />}
          >
            刷新数据
          </Button>
          <FileButton onChange={handleFileChange} accept="video/*">
            {(props) => (
              <Button {...props} variant="light" color="gray" leftSection={<ArrowUpTrayIcon width={16} height={16} />}>
                {originalVideoFile?.file instanceof File ? '重新上传视频' : '上传视频'}
              </Button>
            )}
          </FileButton>
          <Button
            onClick={() => setShowCapcutModal(true)}
            disabled={!originalVideoFile?.file}
            variant="light"
            color="gray"
            leftSection={<ScissorsIcon width={16} height={16} />}
            title={!originalVideoFile?.file ? '请先上传原始视频' : '导出到剪映草稿'}
          >
            导出剪映
          </Button>
          {!showVideoComposer && (
            <Button
              onClick={() => setShowVideoComposer(true)}
              disabled={!originalVideoFile?.file}
              color="brand"
              leftSection={<FilmIcon width={16} height={16} />}
              title={!originalVideoFile?.file ? '请先上传原始视频' : '开始视频合成'}
            >
              合成预览
            </Button>
          )}
        </Group>
      </Group>
    </WorkflowActionBar>
  )

  return (
    <>
      <WorkflowWorkbenchShell
        title="配音制作"
        titleLeading={<WorkflowHeaderBackButton onClick={() => navigate('/projects')} />}
        description="管理脚本配音、时间戳校准和最终视频合成。"
        width="wide"
        meta={pageMeta}
        rail={<WorkflowRail items={railItems} title="内容生成流程" />}
        mobileProgress={mobileProgress}
        main={mainContent}
        actionBar={actionBar}
      />

      {/* 确认对话框 */}
      <ConfirmDialog
        isOpen={clearAllConfirm}
        onClose={() => setClearAllConfirm(false)}
        onConfirm={executeCleanAllAudio}
        title="清理音频确认"
        message="确定要清理所有已生成的音频吗？此操作不可撤销。"
        type="danger"
        confirmText="确定清理"
        cancelText="取消"
      />

      <ConfirmDialog
        isOpen={clearSingleConfirm !== null}
        onClose={() => setClearSingleConfirm(null)}
        onConfirm={() => {
          if (clearSingleConfirm !== null) {
            executeClearSingleAudio(clearSingleConfirm)
          }
        }}
        title="删除音频确认"
        message="确定要删除这个音频吗？此操作不可撤销。"
        type="danger"
        confirmText="确定删除"
        cancelText="取消"
      />

      {/* 时间戳校准弹窗 */}
      {calibrationResult && (
        <TimestampCalibrationDialog
          isOpen={showCalibrationDialog}
          onClose={() => {
            setShowCalibrationDialog(false)
            setCalibrationResult(null)
          }}
          calibrationResult={calibrationResult}
          onConfirmCalibration={handleConfirmCalibration}
          onSkipCalibration={handleSkipCalibration}
        />
      )}

      {/* 剪映导出弹窗 */}
      <CapcutExportModal
        isOpen={showCapcutModal}
        onClose={() => setShowCapcutModal(false)}
        onExport={handleExportToCapcut}
        existingVideoFile={originalVideoFile?.file instanceof File ? originalVideoFile.file : undefined}
      />
    </>
  )
}

export default DubbingStage
