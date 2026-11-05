import React, { useState, useRef, useEffect } from 'react'
import { ActionIcon, Box, Group, Paper, Slider, Stack, Text } from '@mantine/core'
import {
  PlayIcon,
  PauseIcon,
  ArrowDownTrayIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon
} from '@/shared/icons/tabler'

interface AudioPlayerProps {
  audioUrl: string
  isPlaying?: boolean
  onPlay?: () => void
  onPause?: () => void
  onDownload?: () => void
  className?: string
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioUrl,
  isPlaying = false,
  onPlay,
  onPause,
  onDownload,
  className = ''
}) => {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // 处理音频加载
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleLoadedData = () => {
      setDuration(audio.duration)
      setIsLoading(false)
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    const handleEnded = () => {
      setCurrentTime(0)
      onPause?.()
    }

    const handleError = () => {
      setIsLoading(false)
      console.error('音频加载失败')
    }

    audio.addEventListener('loadeddata', handleLoadedData)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)

    return () => {
      audio.removeEventListener('loadeddata', handleLoadedData)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
    }
  }, [audioUrl, onPause])

  // 控制播放/暂停
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.play().catch(console.error)
    } else {
      audio.pause()
    }
  }, [isPlaying])

  // 控制音量
  useEffect(() => {
    const audio = audioRef.current
    if (audio) {
      audio.volume = isMuted ? 0 : volume
    }
  }, [volume, isMuted])

  // 格式化时间
  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00'
    
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  // 处理进度条拖拽
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (audio) {
      const newTime = parseFloat(e.target.value)
      audio.currentTime = newTime
      setCurrentTime(newTime)
    }
  }

  // 处理音量调节
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value)
    setVolume(newVolume)
    setIsMuted(false)
  }

  // 切换静音
  const toggleMute = () => {
    setIsMuted(!isMuted)
  }

  const disabledActionStyle = isLoading ? { opacity: 0.5, cursor: 'not-allowed' } : undefined

  return (
    <Paper
      className={className}
      p="md"
      radius="lg"
      withBorder
      style={{ background: '#111111', borderColor: 'rgba(255, 255, 255, 0.08)' }}
    >
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <ActionIcon
              onClick={isPlaying ? onPause : onPlay}
              disabled={isLoading}
              radius="xl"
              size="lg"
              variant="filled"
              color="dark"
              style={disabledActionStyle}
            >
              {isLoading ? (
                <Box
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: '2px solid #111827',
                    borderTopColor: 'transparent',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
              ) : isPlaying ? (
                <PauseIcon style={{ width: 20, height: 20 }} />
              ) : (
                <PlayIcon style={{ width: 20, height: 20 }} />
              )}
            </ActionIcon>
            <Group gap={6}>
              <Text size="sm" c="gray.3">{formatTime(currentTime)}</Text>
              <Text size="sm" c="dimmed">/</Text>
              <Text size="sm" c="gray.3">{formatTime(duration)}</Text>
            </Group>
          </Group>

          <Group gap="sm">
            <Group gap={6} wrap="nowrap">
              <ActionIcon variant="subtle" color="gray" onClick={toggleMute}>
                {isMuted || volume === 0 ? (
                  <SpeakerXMarkIcon style={{ width: 16, height: 16 }} />
                ) : (
                  <SpeakerWaveIcon style={{ width: 16, height: 16 }} />
                )}
              </ActionIcon>
              <Box style={{ width: 84 }}>
                <Slider
                  min={0}
                  max={1}
                  step={0.1}
                  value={isMuted ? 0 : volume}
                  onChange={(value) =>
                    handleVolumeChange({ target: { value: String(value) } } as React.ChangeEvent<HTMLInputElement>)
                  }
                  color="brand"
                  size="xs"
                />
              </Box>
            </Group>

            <ActionIcon variant="subtle" color="gray" onClick={onDownload} title="下载音频">
              <ArrowDownTrayIcon style={{ width: 16, height: 16 }} />
            </ActionIcon>
          </Group>
        </Group>

        <Slider
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={(value) =>
            handleSeek({ target: { value: String(value) } } as React.ChangeEvent<HTMLInputElement>)
          }
          disabled={isLoading}
          color="brand"
          styles={{
            track: { background: '#223454' },
            thumb: { borderWidth: 2 },
          }}
        />

        <Group justify="space-between">
          <Text size="xs" c="dimmed">0:00</Text>
          <Text size="xs" c="dimmed">{formatTime(duration)}</Text>
        </Group>
      </Stack>
    </Paper>
  )
}
