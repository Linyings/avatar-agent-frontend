import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import { PauseIcon, PlayIcon, SparklesIcon } from '@/shared/icons/tabler'
import { NO_BACKGROUND_MUSIC_VALUE, type BackgroundMusicOption } from '@/features/projects/constants/backgroundMusic.constants'
import { useBackgroundMusicOptions } from '@/features/projects/hooks/useBackgroundMusicOptions'
import { promptTemplateService, type PromptTemplate } from '@/shared/services/promptTemplateService'
import { loadTTSService } from '@/shared/services/ttsServiceLoader'
import { createVoicePreviewGroup, VoicePreviewPlayer } from '@/shared/components/tts/VoicePreviewPlayer'
import { useI18n } from '@/shared/i18n/I18nProvider'
import { resolveLocalizedText } from '@/shared/i18n/localizedText'
import type { BuiltInVoice } from '@/shared/types'

export interface FrameWorkflowOptionValue {
  narrationStyleId: string | null
  narrationStyleTitle: string | null
  voice: string | null
  voiceName: string | null
  backgroundMusic: string
  backgroundMusicId: number | null
  backgroundMusicUrl: string | null
}

export interface FrameWorkflowOptionFieldsProps {
  value: FrameWorkflowOptionValue
  onChange(value: FrameWorkflowOptionValue): void
  onValidityChange?(valid: boolean): void
  initializeDefaults?: boolean
}

const nonNarrationStyleKeywords = ['参考文案', '前情概要', '续写', '改写']

const isNarrationStyleTemplate = (template: PromptTemplate) => {
  const text = `${template.id} ${template.title} ${template.description ?? ''}`.toLowerCase()
  return !nonNarrationStyleKeywords.some(keyword => text.includes(keyword.toLowerCase()))
}

const voiceGenderLabels: Record<string, string> = {
  female: '女声',
  male: '男声',
}

const voiceLanguageLabels: Record<string, string> = {
  en: '英文',
  ja: '日文',
  ko: '韩文',
  ru: '俄文',
  zh: '中文',
}

const getVoiceGenderLabel = (gender?: string) => gender ? voiceGenderLabels[gender] ?? gender : '未标注'
const getVoiceLanguageLabel = (language?: string) => language ? voiceLanguageLabels[language] ?? language : '未标注'

export default function FrameWorkflowOptionFields({
  value,
  onChange,
  onValidityChange,
  initializeDefaults = false,
}: FrameWorkflowOptionFieldsProps) {
  const { locale, t } = useI18n()
  const [narrationStyles, setNarrationStyles] = useState<PromptTemplate[]>([])
  const [isLoadingNarrationStyles, setIsLoadingNarrationStyles] = useState(true)
  const [narrationStyleError, setNarrationStyleError] = useState<string | null>(null)
  const [narrationStyleLoadAttempt, setNarrationStyleLoadAttempt] = useState(0)
  const [voices, setVoices] = useState<BuiltInVoice[]>([])
  const [isLoadingVoices, setIsLoadingVoices] = useState(true)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [voiceLoadAttempt, setVoiceLoadAttempt] = useState(0)
  const [previewingBackgroundMusic, setPreviewingBackgroundMusic] = useState<string | null>(null)
  const [loadingBackgroundMusic, setLoadingBackgroundMusic] = useState<string | null>(null)
  const [backgroundMusicPreviewError, setBackgroundMusicPreviewError] = useState<BackgroundMusicOption | null>(null)
  const backgroundMusicAudioRef = useRef<HTMLAudioElement | null>(null)
  const didSelectDefaultNarrationStyleRef = useRef(false)
  const isMountedRef = useRef(false)
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const initializeDefaultsRef = useRef(initializeDefaults)
  const voicePreviewGroup = useMemo(() => createVoicePreviewGroup(), [])
  const {
    options: backgroundMusicOptions,
    selectOptions: backgroundMusicSelectOptions,
    isLoading: isLoadingBackgroundMusicOptions,
    error: backgroundMusicError,
    reload: reloadBackgroundMusicOptions,
  } = useBackgroundMusicOptions()

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      backgroundMusicAudioRef.current?.pause()
      backgroundMusicAudioRef.current = null
    }
  }, [])

  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (value.backgroundMusicId !== null && value.backgroundMusicUrl !== null) return
    const selected = backgroundMusicOptions.find(option => option.label === value.backgroundMusic)
    if (!selected) return

    onChangeRef.current({
      ...valueRef.current,
      backgroundMusic: selected.label,
      backgroundMusicId: selected.id,
      backgroundMusicUrl: selected.url,
    })
  }, [backgroundMusicOptions, value.backgroundMusic, value.backgroundMusicId, value.backgroundMusicUrl])

  useEffect(() => {
    let isActive = true

    setIsLoadingNarrationStyles(true)
    setNarrationStyleError(null)

    void promptTemplateService.getPromptTemplates({
      type: 'video_analysis',
      templateType: 'fast',
    }).then((items) => {
      if (!isActive) return
      const styleItems = items.filter(isNarrationStyleTemplate)
      setNarrationStyles(styleItems)
      if (initializeDefaultsRef.current && !valueRef.current.narrationStyleId && !didSelectDefaultNarrationStyleRef.current) {
        didSelectDefaultNarrationStyleRef.current = true
        const defaultStyle = styleItems.find(item => item.id === '短剧漫剧')
          ?? styleItems.find(item => item.id === 'short_story_comic')
          ?? styleItems[0]
        if (defaultStyle) {
          onChangeRef.current({
            ...valueRef.current,
            narrationStyleId: defaultStyle.id,
            narrationStyleTitle: defaultStyle.title,
          })
        }
      }
    }).catch((err: unknown) => {
      if (!isActive) return
      setNarrationStyleError(err instanceof Error ? err.message : '解说风格加载失败')
      setNarrationStyles([])
    }).finally(() => {
      if (isActive) setIsLoadingNarrationStyles(false)
    })

    return () => {
      isActive = false
    }
  }, [narrationStyleLoadAttempt])

  useEffect(() => {
    let isActive = true

    setIsLoadingVoices(true)
    setVoiceError(null)

    void loadTTSService().then(({ fetchBuiltInVoices }) => fetchBuiltInVoices())
      .then((items) => {
        if (isActive) setVoices(items)
      })
      .catch((err: unknown) => {
        if (!isActive) return
        setVoiceError(err instanceof Error ? err.message : '配音音色加载失败')
        setVoices([])
      })
      .finally(() => {
        if (isActive) setIsLoadingVoices(false)
      })

    return () => {
      isActive = false
    }
  }, [voiceLoadAttempt])

  useEffect(() => {
    const hasNarrationStyle = narrationStyles.some(item => item.id === value.narrationStyleId)
    const hasVoice = voices.some(item => item.uri === value.voice)
    onValidityChange?.(hasNarrationStyle && hasVoice)
  }, [narrationStyles, onValidityChange, value.narrationStyleId, value.voice, voices])

  useEffect(() => {
    if (!value.voice || value.voiceName) return
    const selected = voices.find(item => item.uri === value.voice)
    if (!selected) return

    onChangeRef.current({
      ...valueRef.current,
      voiceName: resolveLocalizedText(selected.name, selected.name_i18n, locale),
    })
  }, [locale, value.voice, value.voiceName, voices])

  const narrationStyleOptions = useMemo(() => narrationStyles.map(style => ({
    value: style.id,
    label: t(resolveLocalizedText(style.title, style.title_i18n, locale)),
  })), [locale, narrationStyles, t])

  const voiceOptions = useMemo(() => voices.map(voice => ({
    value: voice.uri,
    label: t(resolveLocalizedText(voice.name, voice.name_i18n, locale)),
  })), [locale, t, voices])

  const backgroundMusicPreviewErrorLabel = backgroundMusicPreviewError
    ? t(resolveLocalizedText(
      backgroundMusicPreviewError.label,
      backgroundMusicPreviewError.label_i18n,
      locale,
    ))
    : null

  const stopBackgroundMusicPreview = () => {
    backgroundMusicAudioRef.current?.pause()
    backgroundMusicAudioRef.current = null
    setPreviewingBackgroundMusic(null)
    setLoadingBackgroundMusic(null)
  }

  const startBackgroundMusicPreview = (option: BackgroundMusicOption) => {
    backgroundMusicAudioRef.current?.pause()
    const audio = new Audio(option.url)
    backgroundMusicAudioRef.current = audio
    setLoadingBackgroundMusic(option.label)
    setPreviewingBackgroundMusic(null)
    if (backgroundMusicPreviewError?.label !== option.label) {
      setBackgroundMusicPreviewError(null)
    }

    const resetAfterPlayback = (failed: boolean) => {
      if (backgroundMusicAudioRef.current !== audio) return
      backgroundMusicAudioRef.current = null
      if (!isMountedRef.current) return
      setPreviewingBackgroundMusic(null)
      setLoadingBackgroundMusic(null)
      if (failed) setBackgroundMusicPreviewError(option)
    }

    audio.addEventListener('ended', () => resetAfterPlayback(false), { once: true })
    audio.addEventListener('error', () => resetAfterPlayback(true), { once: true })
    void audio.play().then(() => {
      if (!isMountedRef.current || backgroundMusicAudioRef.current !== audio) return
      setLoadingBackgroundMusic(null)
      setBackgroundMusicPreviewError(null)
      setPreviewingBackgroundMusic(option.label)
    }).catch(() => resetAfterPlayback(true))
  }

  const handleBackgroundMusicPreview = (event: MouseEvent<HTMLButtonElement>, option: BackgroundMusicOption) => {
    event.preventDefault()
    event.stopPropagation()

    if (previewingBackgroundMusic === option.label) {
      stopBackgroundMusicPreview()
      return
    }

    startBackgroundMusicPreview(option)
  }

  const handleNarrationStyleChange = (narrationStyleId: string | null) => {
    const style = narrationStyles.find(item => item.id === narrationStyleId) ?? null
    onChange({
      ...value,
      narrationStyleId: style?.id ?? null,
      narrationStyleTitle: style?.title ?? null,
    })
  }

  const handleVoiceChange = (voice: string | null) => {
    const selected = voices.find(item => item.uri === voice) ?? null
    onChange({
      ...value,
      voice: selected?.uri ?? null,
      voiceName: selected
        ? resolveLocalizedText(selected.name, selected.name_i18n, locale)
        : null,
    })
  }

  const handleBackgroundMusicChange = (backgroundMusic: string | null) => {
    const selected = backgroundMusicOptions.find(option => option.label === backgroundMusic) ?? null
    onChange({
      ...value,
      backgroundMusic: selected?.label ?? NO_BACKGROUND_MUSIC_VALUE,
      backgroundMusicId: selected?.id ?? null,
      backgroundMusicUrl: selected?.url ?? null,
    })
  }

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Select
          label={t('解说风格')}
          placeholder={t(isLoadingNarrationStyles ? '正在加载解说风格' : '请选择解说风格')}
          data={narrationStyleOptions}
          value={value.narrationStyleId}
          onChange={handleNarrationStyleChange}
          disabled={isLoadingNarrationStyles || narrationStyleOptions.length === 0}
          error={narrationStyleError ? t(narrationStyleError) : null}
          allowDeselect={false}
          searchable={narrationStyleOptions.length > 8}
        />
        {narrationStyleError ? (
          <Button
            size="xs"
            variant="light"
            onClick={() => setNarrationStyleLoadAttempt(attempt => attempt + 1)}
            aria-label={t('重试解说风格')}
            style={{ alignSelf: 'flex-start' }}
          >
            {t('重试解说风格')}
          </Button>
        ) : null}
      </Stack>

      <Stack gap="xs">
        <Select
          label={t('配音音色')}
          placeholder={t(isLoadingVoices ? '正在加载配音音色' : '请选择配音音色')}
          data={voiceOptions}
          value={value.voice}
          onChange={handleVoiceChange}
          disabled={isLoadingVoices || voiceOptions.length === 0}
          error={voiceError ? t(voiceError) : null}
          allowDeselect={false}
          searchable={voiceOptions.length > 8}
          renderOption={({ option }) => {
            const voice = voices.find(item => item.uri === option.value)
            if (!voice) return option.label
            const isAdvanced = voice.type === 'advanced'

            return (
              <Group justify="space-between" wrap="nowrap" w="100%">
                <Stack gap={4} style={{ minWidth: 0 }}>
                  <Group gap="xs" wrap="nowrap">
                    <Text size="sm" fw={700} truncate>{option.label}</Text>
                    <Badge size="xs" variant="light" color={voice.gender === 'female' ? 'pink' : voice.gender === 'male' ? 'blue' : 'gray'}>
                      {t(getVoiceGenderLabel(voice.gender))}
                    </Badge>
                  </Group>
                  <Group gap={6}>
                    <Badge
                      size="xs"
                      variant={isAdvanced ? 'filled' : 'light'}
                      color={isAdvanced ? 'yellow' : 'gray'}
                      leftSection={isAdvanced ? <SparklesIcon width={11} height={11} /> : undefined}
                    >
                      {t(isAdvanced ? '高级' : '基础')}
                    </Badge>
                    <Badge size="xs" variant="outline" color="gray">
                      {t(getVoiceLanguageLabel(voice.language))}
                    </Badge>
                  </Group>
                </Stack>
                {voice.sample_url ? (
                  <Box
                    onMouseDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <VoicePreviewPlayer
                      audioUrl={voice.sample_url}
                      size="sm"
                      previewGroup={voicePreviewGroup}
                    />
                  </Box>
                ) : null}
              </Group>
            )
          }}
        />
        {voiceError ? (
          <Button
            size="xs"
            variant="light"
            onClick={() => setVoiceLoadAttempt(attempt => attempt + 1)}
            aria-label={t('重试配音音色')}
            style={{ alignSelf: 'flex-start' }}
          >
            {t('重试配音音色')}
          </Button>
        ) : null}
      </Stack>

      <Stack gap="xs">
        <Select
          label={t('背景音乐（可选）')}
          data={backgroundMusicSelectOptions}
          value={value.backgroundMusic}
          onChange={handleBackgroundMusicChange}
          disabled={isLoadingBackgroundMusicOptions}
          allowDeselect={false}
          renderOption={({ option }) => {
            const backgroundMusic = backgroundMusicOptions.find(item => item.label === option.value)
            const isPlaying = previewingBackgroundMusic === option.value
            const isLoading = loadingBackgroundMusic === option.value

            return (
              <Group justify="space-between" gap="sm" wrap="nowrap" w="100%">
                <Text size="sm" truncate>{option.label}</Text>
                {backgroundMusic ? (
                  <Tooltip label={t(isPlaying ? '暂停试听' : '试听背景音乐')}>
                    <ActionIcon
                      type="button"
                      size="sm"
                      variant={isPlaying ? 'filled' : 'light'}
                      color="brand"
                      aria-label={t(isPlaying ? '暂停试听' : '试听背景音乐')}
                      loading={isLoading}
                      onMouseDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                      }}
                      onClick={(event) => handleBackgroundMusicPreview(event, backgroundMusic)}
                    >
                      {isPlaying ? <PauseIcon width={14} height={14} /> : <PlayIcon width={14} height={14} />}
                    </ActionIcon>
                  </Tooltip>
                ) : null}
              </Group>
            )
          }}
        />
        {backgroundMusicPreviewError ? (
          <Alert color="red" title={t('背景音乐播放失败')}>
            <Group justify="space-between" align="center">
              <Text size="sm">
                {backgroundMusicPreviewErrorLabel}: {t('背景音乐播放失败')}
              </Text>
              <Button
                size="xs"
                variant="light"
                onClick={() => startBackgroundMusicPreview(backgroundMusicPreviewError)}
                aria-label={`${t('重试背景音乐预览')}：${backgroundMusicPreviewErrorLabel}`}
              >
                {t('重试')}
              </Button>
            </Group>
          </Alert>
        ) : null}
        {backgroundMusicError ? (
          <Alert color="red" title={t('背景音乐加载失败，请重试。')}>
            <Group justify="space-between" align="center">
              <Text size="sm">{backgroundMusicError}</Text>
              <Button size="xs" variant="light" onClick={reloadBackgroundMusicOptions} aria-label={t('重试背景音乐')}>
                {t('重试')}
              </Button>
            </Group>
          </Alert>
        ) : null}
        {isLoadingBackgroundMusicOptions ? <Loader size="sm" aria-label={t('正在加载背景音乐')} /> : null}
      </Stack>
    </Stack>
  )
}
