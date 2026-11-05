import React, { useRef, useEffect, useState } from 'react'
import { ActionIcon, Alert, Box, Button, Group, Slider, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core'
import {
  PlayIcon,
  PauseIcon,
  ArrowDownTrayIcon,
  ShareIcon,
  ArrowPathIcon,
  ClockIcon,
  DocumentIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@/shared/icons/tabler'
import type { CompositionResult } from '../../types'
import { formatTime, formatFileSize } from '@/shared/hooks/useVideoComposer'
import { useToast } from '../../contexts/ToastContext'
import { MetricCard, MetricGrid, WorkflowPanel } from '@/shared/components/ui/WorkflowPrimitives'

const getValidDuration = (duration: unknown): number => {
  return typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : 0
}

interface CompositionResultProps {
  result: CompositionResult
  onDownload?: (filename?: string) => void
  onRecompose?: () => void
  onClear?: () => void
}

export const CompositionResultComponent: React.FC<CompositionResultProps> = ({
  result,
  onDownload,
  onRecompose,
  onClear
}) => {
  const { showSuccess, showError } = useToast()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(() => getValidDuration(result.duration))
  const [volume, setVolume] = useState(1)
  const displayDuration = duration || getValidDuration(result.duration)

  // 处理视频元数据加载
  useEffect(() => {
    const video = videoRef.current
    const fallbackDuration = getValidDuration(result.duration)
    setDuration(fallbackDuration)
    setCurrentTime(0)
    setIsPlaying(false)

    if (!video || !result.videoUrl) return

    const syncDuration = () => {
      const mediaDuration = getValidDuration(video.duration)
      setDuration(mediaDuration || fallbackDuration)
    }

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime)
    }

    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    syncDuration()
    video.addEventListener('loadedmetadata', syncDuration)
    video.addEventListener('durationchange', syncDuration)
    video.addEventListener('loadeddata', syncDuration)
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('ended', handleEnded)

    return () => {
      video.removeEventListener('loadedmetadata', syncDuration)
      video.removeEventListener('durationchange', syncDuration)
      video.removeEventListener('loadeddata', syncDuration)
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('ended', handleEnded)
    }
  }, [result.duration, result.videoUrl])

  // 播放/暂停控制
  const togglePlay = async () => {
    const video = videoRef.current
    if (!video) return

    try {
      if (isPlaying) {
        video.pause()
        setIsPlaying(false)
      } else {
        await video.play()
        setIsPlaying(true)
      }
    } catch (error) {
      console.error('视频播放失败:', error)
    }
  }

  // 进度条拖拽
  const handleSeek = (newTime: number) => {
    const video = videoRef.current
    if (video) {
      video.currentTime = newTime
      setCurrentTime(newTime)
    }
  }

  // 音量调节
  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume)
    if (videoRef.current) {
      videoRef.current.volume = newVolume
    }
  }

  // 分享功能
  const handleShare = () => {
    if (navigator.share && result.videoUrl) {
      navigator.share({
        title: '合成视频',
        text: '查看我使用 Mediabunny 合成的视频',
        url: result.videoUrl
      }).catch(console.error)
    } else {
      // 降级方案：复制链接
      if (result.videoUrl) {
        navigator.clipboard.writeText(result.videoUrl)
          .then(() => showSuccess('复制成功', '视频链接已复制到剪贴板'))
          .catch(() => showError('复制失败', '无法复制视频链接'))
      }
    }
  }

  if (!result.success) {
    return (
      <Alert color="red" variant="light" title="合成失败" icon={<ExclamationTriangleIcon width={20} height={20} />}>
        <Stack gap="md">
          <Text size="sm">
          {result.error || '视频合成过程中发生了未知错误'}
          </Text>

          <Text size="sm" c="var(--app-muted)">
          提示：请尝试删除提示失败的音频片段并重新生成音频，再次发起合成以排查音频文件异常。
          </Text>

          <Group gap="sm">
          {onRecompose && (
            <Button
              onClick={onRecompose}
              color="brand"
              leftSection={<ArrowPathIcon width={16} height={16} />}
            >
              重新合成
            </Button>
          )}

          {onClear && (
            <Button
              onClick={onClear}
              variant="light"
              color="gray"
            >
              清除结果
            </Button>
          )}
          </Group>
        </Stack>
      </Alert>
    )
  }

  return (
    <WorkflowPanel>
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <ThemeIcon variant="light" color="green" size="lg">
              <CheckCircleIcon width={20} height={20} />
            </ThemeIcon>
            <Text fw={700} size="lg">合成完成</Text>
          </Group>

        <Group gap="xs">
          <Tooltip label="分享">
            <ActionIcon
            onClick={handleShare}
            variant="subtle"
            color="gray"
          >
              <ShareIcon width={16} height={16} />
            </ActionIcon>
          </Tooltip>

          {onClear && (
            <Tooltip label="清除结果">
              <ActionIcon
              onClick={onClear}
              variant="subtle"
              color="red"
            >
              ×
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
        </Group>

        <Box
          pos="relative"
          style={{
            overflow: 'hidden',
            borderRadius: 'var(--mantine-radius-lg)',
            border: '1px solid var(--app-border)',
            background: 'var(--app-media-bg)',
          }}
        >
        <video
          ref={videoRef}
          src={result.videoUrl}
          playsInline
          preload="metadata"
            style={{ display: 'block', width: '100%', maxHeight: 420, objectFit: 'contain' }}
        />

        {!isPlaying && (
            <Box
              pos="absolute"
              inset={0}
              display="flex"
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--app-overlay-mask)',
              }}
            >
            <ActionIcon
              onClick={togglePlay}
                color="brand"
                radius="xl"
                size={64}
                variant="filled"
            >
                <PlayIcon width={32} height={32} />
            </ActionIcon>
            </Box>
        )}
        </Box>

        <Stack gap="sm">
          <Slider
            min={0}
            max={displayDuration}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            color="brand"
            label={(value) => formatTime(value)}
          />
          <Group justify="space-between">
            <Text size="sm" c="var(--app-muted)">{formatTime(currentTime)}</Text>
            <Text size="sm" c="var(--app-muted)">{formatTime(displayDuration)}</Text>
          </Group>
        </Stack>

        <Group justify="space-between" gap="md">
          <Group gap="sm">
            <ActionIcon onClick={togglePlay} color="brand" radius="xl" size="lg">
              {isPlaying ? (
                <PauseIcon width={18} height={18} />
              ) : (
                <PlayIcon width={18} height={18} />
              )}
            </ActionIcon>

            <Group gap="sm" miw={180}>
              <Text size="sm" c="var(--app-muted)">音量</Text>
              <Slider
                min={0}
                max={1}
                step={0.1}
                value={volume}
                onChange={handleVolumeChange}
                color="brand"
                style={{ flex: 1 }}
              />
            </Group>
          </Group>

          {onDownload && (
            <Button
              onClick={() => onDownload()}
              variant="light"
              color="brand"
              leftSection={<ArrowDownTrayIcon width={16} height={16} />}
            >
              下载
            </Button>
          )}
        </Group>

        <MetricGrid>
          <MetricCard
            icon={<ClockIcon width={16} height={16} />}
            label="时长"
            value={<Text span ff="monospace">{formatTime(displayDuration)}</Text>}
          />
          <MetricCard
            icon={<DocumentIcon width={16} height={16} />}
            label="大小"
            value={<Text span ff="monospace">{result.fileSize ? formatFileSize(result.fileSize) : '-'}</Text>}
          />
          <MetricCard label="格式" value="MP4" />
          <MetricCard label="质量" value="高质量" />
        </MetricGrid>

        {(onRecompose || onDownload) && (
          <Group justify="flex-end" gap="sm">
            {onRecompose && (
              <Button
                onClick={onRecompose}
                variant="light"
                color="gray"
                leftSection={<ArrowPathIcon width={16} height={16} />}
              >
                重新合成
              </Button>
            )}

            {onDownload && (
              <Button
                onClick={() => onDownload()}
                color="brand"
                leftSection={<ArrowDownTrayIcon width={16} height={16} />}
              >
                下载视频
              </Button>
            )}
          </Group>
        )}
      </Stack>
    </WorkflowPanel>
  )
}
