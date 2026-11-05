import React, { useState, useMemo } from 'react'
import { Alert, Badge, Button, Group, Select, SimpleGrid, Stack, Text, ThemeIcon } from '@mantine/core'
import {
  FilmIcon,
  PlayIcon,
  CogIcon,
  ExclamationTriangleIcon
} from '@/shared/icons/tabler'
import type { VideoFile, ScriptItem, TTSAudioState, CompositionOptions } from '../../types'
import { useVideoComposer } from '@/shared/hooks/useVideoComposer'
import { CompositionProgress } from './CompositionProgress'
import { CompositionResultComponent } from './CompositionResult'
import { useToast } from '../../contexts/ToastContext'
import { WorkflowPanel } from '@/shared/components/ui/WorkflowPrimitives'

interface VideoComposerProps {
  originalVideoFile: VideoFile | null
  scriptItems: ScriptItem[]
  ttsAudioStates: TTSAudioState
  onCompositionComplete?: () => void
  needsVideoReupload?: boolean
}

interface CompositionOptionsState extends CompositionOptions {
  outputFormat: 'mp4' | 'webm' | 'mov'
  videoQuality: 'low' | 'medium' | 'high'
  audioQuality: 'low' | 'medium' | 'high'
}

export const VideoComposer: React.FC<VideoComposerProps> = ({
  originalVideoFile,
  scriptItems,
  ttsAudioStates,
  onCompositionComplete,
  needsVideoReupload = false
}) => {
  const [showOptions, setShowOptions] = useState(false)
  const [options, setOptions] = useState<CompositionOptionsState>({
    outputFormat: 'mp4',
    videoQuality: 'medium',
    audioQuality: 'medium'
  })

  const { showError } = useToast()

  const {
    isComposing,
    progress,
    result,
    error,
    isSupported,
    supportInfo,
    estimatedTime,
    startComposition,
    cancelComposition,
    clearResult,
    downloadResult,
    updateOptions,
    validateInput
  } = useVideoComposer({
    defaultOptions: options
  })

  const videoFileSource = originalVideoFile?.file instanceof File ? originalVideoFile.file : null
  const videoFileName = useMemo(() => {
    if (videoFileSource) {
      return videoFileSource.name
    }

    if (originalVideoFile && typeof (originalVideoFile as any).name === 'string') {
      return (originalVideoFile as any).name as string
    }

    return '未选择'
  }, [originalVideoFile, videoFileSource])

  // 检查是否可以开始合成
  const canStartComposition = () => {
    if (!originalVideoFile || !videoFileSource || scriptItems.length === 0) {
      return false
    }
    
    const validation = validateInput({
      originalVideoFile,
      scriptItems,
      ttsAudioStates,
      options
    })
    
    return validation.valid
  }

  // 获取输入验证信息
  const getValidationIssues = () => {
    const validation = validateInput({
      originalVideoFile: originalVideoFile || undefined,
      scriptItems,
      ttsAudioStates,
      options
    })
    return validation.issues
  }

  // 开始合成
  const handleStartComposition = async () => {
    if (!originalVideoFile || !videoFileSource) {
      if (needsVideoReupload) {
        showError('需要重新上传视频', '当前项目仅保存了视频的元数据，请点击“上传视频”重新选择本地原始视频后再尝试合成。')
      } else {
        showError('缺少原始视频文件', '请先上传视频文件再开始合成。')
      }
      return
    }

    if (!canStartComposition()) {
      const issues = getValidationIssues()
      if (issues.length > 0) {
        showError('输入验证失败', issues[0])
      }
      return
    }

    await startComposition({
      originalVideoFile,
      scriptItems,
      ttsAudioStates,
      options
    })
    
    if (onCompositionComplete) {
      onCompositionComplete()
    }
  }

  // 更新选项
  const handleOptionsChange = (newOptions: Partial<CompositionOptionsState>) => {
    const updatedOptions = { ...options, ...newOptions }
    setOptions(updatedOptions)
    updateOptions(updatedOptions)
  }

  // 重新合成
  const handleRecompose = () => {
    clearResult()
    handleStartComposition()
  }

  // 如果浏览器不支持
  if (!isSupported) {
    return (
      <Alert color="red" variant="light" title="浏览器不支持" icon={<ExclamationTriangleIcon width={20} height={20} />}>
        <Text size="sm" mb="xs">您的浏览器不支持视频合成功能。缺少以下功能：</Text>
        <ul>
          {supportInfo.missingFeatures.map((feature, index) => (
            <li key={index}>{feature}</li>
          ))}
        </ul>
        <Text size="sm">请使用支持 WebCodecs API 的现代浏览器，如 Chrome 94+、Edge 94+ 等。</Text>
      </Alert>
    )
  }

  // 显示结果
  if (result) {
    return (
      <CompositionResultComponent
        result={result}
        onDownload={downloadResult}
        onRecompose={handleRecompose}
        onClear={clearResult}
      />
    )
  }

  // 显示进度
  if (isComposing && progress) {
    return (
      <CompositionProgress
        progress={progress}
        isComposing={isComposing}
        estimatedTimeRemaining={progress.estimatedTimeRemaining}
        onCancel={cancelComposition}
      />
    )
  }

  // 主界面
  const validationIssues = getValidationIssues()
  const hasIssues = validationIssues.length > 0

  return (
    <WorkflowPanel>
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <ThemeIcon variant="light" color="brand" size="lg">
              <FilmIcon width={20} height={20} />
            </ThemeIcon>
            <Text fw={700} size="lg">视频合成</Text>
          </Group>

        <Button
          onClick={() => setShowOptions(!showOptions)}
          variant="light"
          color="gray"
          title="合成设置"
          leftSection={<CogIcon width={16} height={16} />}
        >
          设置
        </Button>
        </Group>

      {showOptions && (
        <WorkflowPanel tone="subtle" shadow="none">
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <Select
              label="输出格式"
                value={options.outputFormat}
              data={[
                { value: 'mp4', label: 'MP4' },
                { value: 'webm', label: 'WebM' },
                { value: 'mov', label: 'MOV' },
              ]}
              onChange={(value) => handleOptionsChange({
                  outputFormat: (value || 'mp4') as 'mp4' | 'webm' | 'mov'
                })}
            />

            <Select
              label="视频质量"
                value={options.videoQuality}
              data={[
                { value: 'low', label: '低质量' },
                { value: 'medium', label: '中等质量' },
                { value: 'high', label: '高质量' },
              ]}
              onChange={(value) => handleOptionsChange({
                  videoQuality: (value || 'medium') as 'low' | 'medium' | 'high'
                })}
            />

            <Select
              label="音频质量"
                value={options.audioQuality}
              data={[
                { value: 'low', label: '低质量' },
                { value: 'medium', label: '中等质量' },
                { value: 'high', label: '高质量' },
              ]}
              onChange={(value) => handleOptionsChange({
                  audioQuality: (value || 'medium') as 'low' | 'medium' | 'high'
                })}
            />
          </SimpleGrid>
        </WorkflowPanel>
      )}

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
          <Badge color={videoFileSource ? 'green' : 'gray'} variant="light" size="lg">原始视频: {videoFileName}</Badge>
          <Badge color={scriptItems.length > 0 ? 'green' : 'gray'} variant="light" size="lg">脚本片段: {scriptItems.length} 个片段</Badge>
          <Badge color={Object.keys(ttsAudioStates).length > 0 ? 'green' : 'gray'} variant="light" size="lg">
            TTS 音频: {Object.values(ttsAudioStates).filter(state => state.success).length} 个已生成
          </Badge>
        </SimpleGrid>

        {estimatedTime && (
          <Text size="sm" c="var(--app-muted)">预估处理时间: {Math.ceil(estimatedTime / 60)} 分钟</Text>
        )}

        {hasIssues && (
          <Alert color="yellow" variant="light" title="输入验证问题" icon={<ExclamationTriangleIcon width={18} height={18} />}>
            <ul>
              {validationIssues.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          </Alert>
        )}

        {error && (
          <Alert color="red" variant="light" title="错误" icon={<ExclamationTriangleIcon width={18} height={18} />}>
            {error}
          </Alert>
        )}

        <Group justify="flex-end">
          <Button
            onClick={handleStartComposition}
            disabled={!canStartComposition() || isComposing}
            color="brand"
            leftSection={<PlayIcon width={18} height={18} />}
          >
            开始合成
          </Button>
        </Group>
      </Stack>
    </WorkflowPanel>
  )
}
