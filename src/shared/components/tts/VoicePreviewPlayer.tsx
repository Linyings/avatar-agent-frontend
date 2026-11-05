import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActionIcon, Group, Loader, Text, Tooltip } from '@mantine/core'
import { PlayIcon, PauseIcon } from '@/shared/icons/tabler'
import { useI18n } from '@/shared/i18n/I18nProvider'

interface VoicePreviewParticipant {
  stop(): void
  clearError(): void
}

export interface VoicePreviewGroup {
  register(participant: VoicePreviewParticipant): () => void
  start(participant: VoicePreviewParticipant): void
  release(participant: VoicePreviewParticipant): void
  isActive(participant: VoicePreviewParticipant): boolean
}

export const createVoicePreviewGroup = (): VoicePreviewGroup => {
  const participants = new Set<VoicePreviewParticipant>()
  let activeParticipant: VoicePreviewParticipant | null = null

  return {
    register(participant) {
      participants.add(participant)
      return () => {
        participants.delete(participant)
        if (activeParticipant === participant) activeParticipant = null
      }
    },
    start(participant) {
      participants.add(participant)
      participants.forEach((candidate) => {
        if (candidate === participant) return
        candidate.stop()
        candidate.clearError()
      })
      activeParticipant = participant
    },
    release(participant) {
      if (activeParticipant === participant) activeParticipant = null
    },
    isActive(participant) {
      return activeParticipant === participant
    },
  }
}

interface VoicePreviewPlayerProps {
  audioUrl: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number
  previewGroup?: VoicePreviewGroup
}

interface ActiveVoicePlaybackAttempt {
  generation: number
  audio: HTMLAudioElement
  cleanup(): void
}

export const VoicePreviewPlayer: React.FC<VoicePreviewPlayerProps> = ({
  audioUrl,
  size = 'md',
  previewGroup,
}) => {
  const { t } = useI18n()
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playbackAttemptRef = useRef(0)
  const activePlaybackAttemptRef = useRef<ActiveVoicePlaybackAttempt | null>(null)

  const stopPlayback = useCallback(() => {
    playbackAttemptRef.current += 1
    const activeAttempt = activePlaybackAttemptRef.current
    activePlaybackAttemptRef.current = null
    activeAttempt?.cleanup()
    const audio = activeAttempt?.audio ?? audioRef.current
    audio?.pause()
    if (audioRef.current === audio) audioRef.current = null
    setIsPlaying(false)
    setIsLoading(false)
  }, [])

  const clearError = useCallback(() => setError(null), [])
  const participant = useMemo<VoicePreviewParticipant>(
    () => ({ stop: stopPlayback, clearError }),
    [clearError, stopPlayback],
  )

  useEffect(() => {
    audioRef.current = new Audio()

    return () => {
      playbackAttemptRef.current += 1
      const activeAttempt = activePlaybackAttemptRef.current
      activePlaybackAttemptRef.current = null
      activeAttempt?.cleanup()
      previewGroup?.release(participant)
      const audio = activeAttempt?.audio ?? audioRef.current
      audio?.pause()
      if (audio) audio.src = ''
      audioRef.current = null
    }
  }, [participant, previewGroup])

  useEffect(() => previewGroup?.register(participant), [participant, previewGroup])

  const handlePlayPause = async (event: React.MouseEvent) => {
    event.stopPropagation()

    if (isPlaying) {
      stopPlayback()
      previewGroup?.release(participant)
      return
    }

    const audio = audioRef.current ?? new Audio()
    audioRef.current = audio
    const generation = playbackAttemptRef.current + 1
    playbackAttemptRef.current = generation
    const activeAttempt: ActiveVoicePlaybackAttempt = {
      generation,
      audio,
      cleanup: () => undefined,
    }
    const isActiveAttempt = () => {
      const currentAttempt = activePlaybackAttemptRef.current
      return playbackAttemptRef.current === generation
        && currentAttempt?.generation === generation
        && currentAttempt.audio === audio
    }
    const finishAttempt = () => {
      if (!isActiveAttempt()) return false
      activePlaybackAttemptRef.current = null
      activeAttempt.cleanup()
      if (audioRef.current === audio) audioRef.current = null
      return true
    }
    const handleLoadStart = () => {
      if (isActiveAttempt()) setIsLoading(true)
    }
    const handleCanPlay = () => {
      if (isActiveAttempt()) setIsLoading(false)
    }
    const handleError = () => {
      if (!finishAttempt()) return
      previewGroup?.release(participant)
      setIsLoading(false)
      setError('音频加载失败')
      setIsPlaying(false)
    }
    const handleEnded = () => {
      if (!finishAttempt()) return
      previewGroup?.release(participant)
      setIsLoading(false)
      setIsPlaying(false)
    }

    activeAttempt.cleanup = () => {
      audio.removeEventListener('loadstart', handleLoadStart)
      audio.removeEventListener('canplay', handleCanPlay)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('ended', handleEnded)
    }
    audio.addEventListener('loadstart', handleLoadStart)
    audio.addEventListener('canplay', handleCanPlay)
    audio.addEventListener('error', handleError)
    audio.addEventListener('ended', handleEnded)
    activePlaybackAttemptRef.current = activeAttempt

    previewGroup?.start(participant)
    setIsLoading(true)
    audio.src = audioUrl

    try {
      await audio.play()
      if (!isActiveAttempt()) return
      if (previewGroup && !previewGroup.isActive(participant)) return
      setIsLoading(false)
      setError(null)
      setIsPlaying(true)
    } catch (playbackError) {
      if (!finishAttempt()) return
      console.error('Voice preview playback failed:', playbackError)
      previewGroup?.release(participant)
      setIsLoading(false)
      setError('音频播放失败')
      setIsPlaying(false)
    }
  }

  const iconSize = size === 'xs' ? 12 : size === 'sm' ? 14 : 16
  const actionLabel = error
    ? t('重试播放预览')
    : t(isPlaying ? '暂停预览' : '播放预览')

  return (
    <Group gap={6} wrap="wrap" data-i18n-skip>
      <Tooltip label={actionLabel}>
        <ActionIcon
          type="button"
          onClick={handlePlayPause}
          disabled={isLoading}
          variant={error ? 'light' : 'filled'}
          color={error ? 'red' : 'brand'}
          radius="xl"
          size={size}
          aria-label={actionLabel}
        >
          {isLoading ? (
            <Loader size={iconSize} color="white" />
          ) : isPlaying ? (
            <PauseIcon width={iconSize} height={iconSize} />
          ) : (
            <PlayIcon width={iconSize} height={iconSize} />
          )}
        </ActionIcon>
      </Tooltip>
      {error ? (
        <Text role="alert" size="xs" c="red" maw={120} style={{ overflowWrap: 'anywhere' }}>
          {t(error)}
        </Text>
      ) : null}
    </Group>
  )
}
