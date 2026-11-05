import React, { useState, useEffect, useCallback } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  FileButton,
  Group,
  Loader,
  Radio,
  Select,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core'
import { CheckIcon, MicrophoneIcon, XMarkIcon } from '@/shared/icons/tabler'
import type { BuiltInVoice, TTSVoiceConfig } from '@/shared/types'
import { loadTTSService } from '@/shared/services/ttsServiceLoader'
import { VoicePreviewPlayer } from './VoicePreviewPlayer'
import { WorkflowPanel } from '@/shared/components/ui/WorkflowPrimitives'

const getVoiceTypeValue = (voice: BuiltInVoice): 'basic' | 'advanced' => (
  voice.type === 'basic' ? 'basic' : 'advanced'
)

interface VoiceSelectorProps {
  value: TTSVoiceConfig
  onChange: (config: TTSVoiceConfig) => void
  onError?: (error: string) => void
}

export const VoiceSelector: React.FC<VoiceSelectorProps> = ({
  value,
  onChange,
  onError
}) => {
  const [builtInVoices, setBuiltInVoices] = useState<BuiltInVoice[]>([])
  const [isLoadingVoices, setIsLoadingVoices] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [languageFilter, setLanguageFilter] = useState<string>('all')
  const [genderFilter, setGenderFilter] = useState<string>('all')

  const languageOptions = React.useMemo(() => {
    const labels: Record<string, string> = {
      zh: '中文',
      en: '英文',
      ja: '日语',
      ko: '韩语',
    }
    const languages = Array.from(
      new Set(builtInVoices.map(voice => voice.language?.trim()).filter((language): language is string => Boolean(language)))
    ).sort((a, b) => a.localeCompare(b))

    return [
      { value: 'all', label: '全部语言' },
      ...languages.map(language => ({ value: language, label: labels[language] ?? language })),
    ]
  }, [builtInVoices])

  const genderOptions = React.useMemo(() => {
    const labels: Record<string, string> = {
      male: '男声',
      female: '女声',
    }
    const genders = Array.from(
      new Set(builtInVoices.map(voice => voice.gender?.trim()).filter((gender): gender is string => Boolean(gender)))
    ).sort((a, b) => a.localeCompare(b))

    return [
      { value: 'all', label: '全部性别' },
      ...genders.map(gender => ({ value: gender, label: labels[gender] ?? gender })),
    ]
  }, [builtInVoices])

  useEffect(() => {
    if (!languageOptions.some(option => option.value === languageFilter)) {
      setLanguageFilter('all')
    }
    if (!genderOptions.some(option => option.value === genderFilter)) {
      setGenderFilter('all')
    }
  }, [genderFilter, genderOptions, languageFilter, languageOptions])

  const filteredVoices = React.useMemo(() => {
    return builtInVoices.filter((voice) => {
      const matchesType = typeFilter === 'all' || getVoiceTypeValue(voice) === typeFilter
      const matchesLanguage = languageFilter === 'all' || voice.language === languageFilter
      const matchesGender = genderFilter === 'all' || voice.gender === genderFilter
      return matchesType && matchesLanguage && matchesGender
    })
  }, [builtInVoices, genderFilter, languageFilter, typeFilter])

  const visibleVoices = filteredVoices

  // 加载内置音色列表
  useEffect(() => {
    const loadVoices = async () => {
      setIsLoadingVoices(true)
      setLoadError(null)

      try {
        const { fetchBuiltInVoices } = await loadTTSService()
        const voices = await fetchBuiltInVoices()
        setBuiltInVoices(voices)

        // 如果成功获取到音色列表且当前没有选择，默认选择第一个音色
        if (voices.length > 0 && !value.selectedVoiceUri && value.mode === 'builtin') {
          const availableVoices = voices

          if (availableVoices.length > 0) {
            onChange({
              mode: 'builtin',
              selectedVoiceUri: availableVoices[0].uri,
              selectedVoiceName: availableVoices[0].name,
              selectedVoiceType: availableVoices[0].type
            })
          }
        }
      } catch (error) {
        const errorMessage = '获取音色列表失败'
        setLoadError(errorMessage)
        onError?.(errorMessage)
        console.error('加载内置音色失败:', error)
      } finally {
        setIsLoadingVoices(false)
      }
    }

    loadVoices()
  }, []) // 只在组件挂载时加载一次

  // 当内置音色列表变化时，检查当前选中的音色是否还可用
  useEffect(() => {
    if (value.mode === 'builtin' && value.selectedVoiceUri && filteredVoices.length > 0) {
      // 检查当前选中的音色是否在过滤后的列表中
      const currentVoiceStillAvailable = filteredVoices.some(
        voice => voice.uri === value.selectedVoiceUri
      )

      // 如果当前音色不可用，自动切换到第一个可用音色
      if (!currentVoiceStillAvailable) {
        onChange({
          mode: 'builtin',
          selectedVoiceUri: filteredVoices[0].uri,
          selectedVoiceName: filteredVoices[0].name,
          selectedVoiceType: filteredVoices[0].type
        })
      }
    }
  }, [filteredVoices, value, onChange])

  // 处理内置音色选择
  const handleBuiltInVoiceSelect = useCallback((voice: BuiltInVoice) => {
    onChange({
      mode: 'builtin',
      selectedVoiceUri: voice.uri,
      selectedVoiceName: voice.name,
      selectedVoiceType: voice.type,
      customAudioFile: undefined
    })
  }, [onChange])

  // 处理模式切换
  const handleModeChange = useCallback((mode: 'builtin' | 'custom') => {
    if (mode === 'builtin') {
      // 切换到内置音色，清空自定义文件，选择第一个可用音色
      const firstVoice = filteredVoices[0]
      onChange({
        mode: 'builtin',
        selectedVoiceUri: firstVoice?.uri,
        selectedVoiceName: firstVoice?.name,
        selectedVoiceType: firstVoice?.type,
        customAudioFile: undefined
      })
    } else {
      // 切换到自定义音色，清空内置音色选择
      onChange({
        mode: 'custom',
        selectedVoiceUri: undefined,
        selectedVoiceName: undefined,
        selectedVoiceType: undefined,
        customAudioFile: undefined
      })
    }
  }, [onChange, filteredVoices])

  // 获取音频时长的辅助函数
  const getAudioDuration = useCallback((file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const audio = document.createElement('audio')
      audio.preload = 'metadata'

      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(audio.src)
        resolve(audio.duration)
      }

      audio.onerror = () => {
        URL.revokeObjectURL(audio.src)
        reject(new Error('无法加载音频文件'))
      }

      audio.src = URL.createObjectURL(file)
    })
  }, [])

  // 处理自定义音色文件上传
  const handleCustomFileUpload = useCallback(async (file: File | null) => {
    if (file) {
      // 验证文件类型
      if (!file.type.startsWith('audio/')) {
        onError?.('请上传音频文件（如 .mp3, .wav 等）')
        return
      }

      // 验证文件大小（限制 10MB）
      if (file.size > 10 * 1024 * 1024) {
        onError?.('参考音频文件不能超过 10MB')
        return
      }

      try {
        // 验证音频时长（限制 30 秒）
        const duration = await getAudioDuration(file)
        if (duration > 30) {
          onError?.('音频时长超过限制，请上传时长不超过 30 秒的音频文件')
          return
        }

        onChange({
          mode: 'custom',
          customAudioFile: file,
          selectedVoiceUri: undefined,
          selectedVoiceName: undefined,
          selectedVoiceType: undefined
        })
      } catch (error) {
        console.error('读取音频时长失败:', error)
        onError?.('无法读取音频文件信息，请确保文件格式正确')
      }
    }
  }, [onChange, onError, getAudioDuration])

  // 清除自定义音色文件
  const handleClearCustomFile = useCallback(() => {
    onChange({
      mode: 'custom',
      customAudioFile: undefined,
      selectedVoiceUri: undefined,
      selectedVoiceName: undefined,
      selectedVoiceType: undefined
    })
  }, [onChange])

  return (
    <WorkflowPanel>
      <Stack gap="lg">
        <Group align="flex-start" justify="space-between" gap="lg">
          <ThemeIcon variant="light" color="brand" size="lg">
            <MicrophoneIcon width={20} height={20} />
          </ThemeIcon>
          <Stack gap={4} style={{ flex: 1 }}>
            <Text fw={700}>音色选择</Text>
            <Text c="var(--app-muted)" size="sm">选择内置音色或上传自定义音色文件</Text>
          </Stack>
        </Group>

        <Radio.Group value={value.mode} onChange={(mode) => handleModeChange(mode as 'builtin' | 'custom')}>
          <Group gap="lg">
            <Radio value="builtin" label="内置音色" />
            <Radio value="custom" label="克隆音色" />
          </Group>
        </Radio.Group>

        {value.mode === 'builtin' && (
          <Stack gap="md">
            <Group gap="sm" justify="flex-end" align="flex-end" wrap="wrap">
              <Group gap="sm" wrap="wrap">
                <Select
                  key="voice-type-filter"
                  label="类型"
                  value={typeFilter}
                  onChange={(nextValue) => setTypeFilter(nextValue ?? 'all')}
                  data={[
                    { value: 'all', label: '全部类型' },
                    { value: 'basic', label: '基础模型' },
                    { value: 'advanced', label: '高级模型' },
                  ]}
                  size="xs"
                  w={140}
                  allowDeselect={false}
                />
                <Select
                  key="voice-language-filter"
                  label="语言"
                  value={languageFilter}
                  onChange={(nextValue) => setLanguageFilter(nextValue ?? 'all')}
                  data={languageOptions}
                  size="xs"
                  w={140}
                  allowDeselect={false}
                />
                <Select
                  key="voice-gender-filter"
                  label="性别"
                  value={genderFilter}
                  onChange={(nextValue) => setGenderFilter(nextValue ?? 'all')}
                  data={genderOptions}
                  size="xs"
                  w={140}
                  allowDeselect={false}
                />
              </Group>
            </Group>
            {isLoadingVoices ? (
              <Group gap="sm">
                <Loader size="sm" color="brand" />
                <Text c="var(--app-muted)" size="sm">加载音色列表中...</Text>
              </Group>
            ) : loadError ? (
              <Alert color="red" variant="light" title={loadError}>
                请尝试使用自定义音色
              </Alert>
            ) : visibleVoices.length === 0 ? (
              <Alert color="yellow" variant="light" title="暂无可用的内置音色">
                请调整语言或性别筛选，或使用自定义音色
              </Alert>
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4, xl: 6 }} spacing={10} verticalSpacing={10}>
                {visibleVoices.map((voice) => {
                  const selected = value.selectedVoiceUri === voice.uri
                  const typeValue = getVoiceTypeValue(voice)
                  const typeLabel = typeValue === 'basic' ? '基础模型' : '高级模型'
                  const languageLabel = voice.language
                    ? languageOptions.find(option => option.value === voice.language)?.label ?? voice.language
                    : null
                  const genderLabel = voice.gender
                    ? genderOptions.find(option => option.value === voice.gender)?.label ?? voice.gender
                    : null

                  return (
                    <Box
                      key={voice.uri}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleBuiltInVoiceSelect(voice)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          handleBuiltInVoiceSelect(voice)
                        }
                      }}
                      p={10}
                      aria-pressed={selected}
                      style={{
                        position: 'relative',
                        minHeight: 92,
                        overflow: 'hidden',
                        border: `1px solid ${selected ? 'var(--app-brand-soft-border-strong)' : 'rgba(255, 255, 255, 0.12)'}`,
                        borderRadius: 'var(--mantine-radius-md)',
                        background: selected
                          ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.20), rgba(20, 184, 166, 0.08)), var(--app-brand-soft-bg)'
                          : 'linear-gradient(135deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.025)), var(--app-surface-alt)',
                        boxShadow: selected
                          ? '0 12px 30px rgba(37, 99, 235, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
                          : 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
                        cursor: 'pointer',
                      }}
                    >
                      <Stack gap={8}>
                        <Group justify="space-between" align="flex-start" gap={8} wrap="nowrap">
                          <Stack gap={6} style={{ minWidth: 0, flex: 1 }}>
                            <Text fw={700} lh={1.2} truncate title={voice.name}>
                              {voice.name}
                            </Text>
                            <Group gap={5} wrap="wrap">
                              <Badge color={typeValue === 'basic' ? 'brand' : 'yellow'} variant="light">
                                {typeLabel}
                              </Badge>
                              {languageLabel && (
                                <Badge color="gray" variant="filled">
                                  {languageLabel}
                                </Badge>
                              )}
                              {genderLabel && (
                                <Badge color={voice.gender === 'female' ? 'pink' : 'blue'} variant="light">
                                  {genderLabel}
                                </Badge>
                              )}
                            </Group>
                          </Stack>
                          <Stack gap={6} align="flex-end">
                            {selected && (
                              <Badge
                                color="brand"
                                variant="filled"
                                leftSection={<CheckIcon width={12} height={12} />}
                                styles={{ section: { marginRight: 4 } }}
                              >
                                已选
                              </Badge>
                            )}
                            <VoicePreviewPlayer audioUrl={voice.sample_url} />
                          </Stack>
                        </Group>
                      </Stack>
                    </Box>
                  )
                })}
              </SimpleGrid>
            )}
          </Stack>
        )}

        {value.mode === 'custom' && (
          <Stack gap="md">
            {value.customAudioFile ? (
              <Group
                justify="space-between"
                p="md"
                style={{
                  border: '1px solid var(--app-border)',
                  borderRadius: 'var(--mantine-radius-md)',
                  background: 'var(--app-surface-alt)',
                }}
              >
                <Group gap="sm">
                  <ThemeIcon variant="light" color="brand">
                    <MicrophoneIcon width={18} height={18} />
                  </ThemeIcon>
                  <Text fw={600}>{value.customAudioFile.name}</Text>
                </Group>
                <ActionIcon variant="subtle" color="red" onClick={handleClearCustomFile} title="清除文件">
                  <XMarkIcon width={18} height={18} />
                </ActionIcon>
              </Group>
            ) : (
              <Box
                p="xl"
                ta="center"
                style={{
                  border: '1px dashed var(--app-border-strong)',
                  borderRadius: 'var(--mantine-radius-md)',
                  background: 'var(--app-surface-alt)',
                }}
              >
                <Stack align="center" gap="sm">
                  <ThemeIcon variant="light" color="brand" size={56} radius="xl">
                    <MicrophoneIcon width={28} height={28} />
                  </ThemeIcon>
                  <Text fw={700}>上传音频文件</Text>
                  <Text c="var(--app-muted)" size="sm">支持 MP3, WAV 等格式，最大 10MB</Text>
                  <Text c="yellow" size="xs">建议时长 10-30 秒，人声清晰</Text>
                  <FileButton onChange={handleCustomFileUpload} accept="audio/*">
                    {(props) => (
                      <Button {...props} variant="light" color="brand">
                        选择音频
                      </Button>
                    )}
                  </FileButton>
                </Stack>
              </Box>
            )}

            <Alert color="yellow" variant="light">
              <Text size="sm">
                <Text span fw={700}>要求：</Text>音频时长不超过 30 秒；
                <Text span fw={700}>建议：</Text>时长 10-30 秒，人声清晰无背景音，以获得最佳克隆效果。
              </Text>
            </Alert>
          </Stack>
        )}
      </Stack>
    </WorkflowPanel>
  )
}
