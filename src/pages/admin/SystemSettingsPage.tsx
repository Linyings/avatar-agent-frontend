import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  NativeSelect,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core'
import { ArrowPathIcon, PencilIcon, PlusIcon, TrashIcon } from '@/shared/icons/tabler'
import AppPageShell from '@/shared/components/ui/AppPageShell'
import PageHeader from '@/shared/components/ui/PageHeader'
import StatusChip from '@/shared/components/ui/StatusChip'
import SurfaceCard from '@/shared/components/ui/SurfaceCard'
import { VoicePreviewPlayer } from '@/shared/components/tts/VoicePreviewPlayer'
import { useAdminSystemSettings } from '@/shared/hooks/useSystemSettings'
import type { SystemSettingCreateRequest, SystemSettingResponse } from '@/shared/types/system'
import ConfirmDialog from '@/shared/components/ui/ConfirmDialog'
import { useToast } from '@/shared/contexts/ToastContext'

type TtsVoiceType = 'basic' | 'advanced'
type TtsVoiceGroupBy = 'type' | 'gender' | 'language'

interface TtsVoice {
  name: string
  uri: string
  sample_url?: string
  type: TtsVoiceType
  gender?: string
  language?: string
  [key: string]: unknown
}

interface BackgroundMusicConfigItem {
  id?: number
  label: string
  fileName?: string
  url: string
  [key: string]: unknown
}

interface FormState {
  description: string
  isPublic: boolean
  valueText: string
}

const defaultFormState: FormState = {
  description: '',
  isPublic: false,
  valueText: '{}',
}

const voiceTypeLabels: Record<TtsVoiceType, string> = {
  advanced: '高级音色',
  basic: '基础音色',
}

const voiceGenderLabels: Record<string, string> = {
  female: '女声',
  male: '男声',
  neutral: '中性',
}

const voiceLanguageLabels: Record<string, string> = {
  en: '英文',
  ja: '日文',
  zh: '中文',
}

const unknownVoiceMeta = '未标注'

const getVoiceGenderLabel = (gender?: string) => {
  if (!gender) return unknownVoiceMeta
  return voiceGenderLabels[gender] ?? gender
}

const getVoiceLanguageLabel = (language?: string) => {
  if (!language) return unknownVoiceMeta
  return voiceLanguageLabels[language] ?? language
}

const CreateSettingModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  onCreate: (data: SystemSettingCreateRequest) => Promise<void>
  isSaving: boolean
  showError: (title: string, message?: string) => void
}> = ({ isOpen, onClose, onCreate, isSaving, showError }) => {
  const [keyName, setKeyName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [valueText, setValueText] = useState('{}')

  useEffect(() => {
    if (isOpen) {
      setKeyName('')
      setDescription('')
      setIsPublic(false)
      setValueText('{}')
    }
  }, [isOpen])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    let parsedValue: object
    try {
      parsedValue = JSON.parse(valueText === '' ? '{}' : valueText)
    } catch {
      showError('格式错误', 'JSON 格式不正确')
      return
    }

    try {
      await onCreate({
        key: keyName.trim(),
        value: parsedValue,
        description: description.trim() ? description.trim() : undefined,
        is_public: isPublic,
      })
      onClose()
    } catch {
      // 上层已经提示错误，这里无需额外处理
    }
  }

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title="新增配置"
      centered
      closeOnClickOutside={!isSaving}
      size="lg"
    >
      <Stack component="form" gap="md" onSubmit={handleSubmit}>
        <TextInput
          label="配置键名"
          value={keyName}
          onChange={(event) => setKeyName(event.target.value)}
          placeholder="例如：tts_voices 或 bgms"
          required
        />
        <Textarea
          label="配置值 (JSON)"
          value={valueText}
          onChange={(event) => setValueText(event.target.value)}
          rows={8}
          placeholder='例如：{"voices": []} 或 {"bgms": []}'
          required
          styles={{ input: { fontFamily: 'monospace' } }}
        />
        <TextInput
          label="配置描述"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="用于说明配置用途，便于管理"
        />
        <Checkbox
          checked={isPublic}
          onChange={(event) => setIsPublic(event.currentTarget.checked)}
          label="公开配置（无需认证即可访问）"
        />
        <Group justify="flex-end" gap="sm">
          <Button type="button" variant="default" onClick={onClose}>取消</Button>
          <Button type="submit" loading={isSaving}>创建配置</Button>
        </Group>
      </Stack>
    </Modal>
  )
}

const TtsVoiceModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  onSave: (voice: TtsVoice) => Promise<void>
  isSaving: boolean
  initialVoice?: TtsVoice | null
}> = ({ isOpen, onClose, onSave, isSaving, initialVoice }) => {
  const [formData, setFormData] = useState<TtsVoice>({
    gender: '',
    language: '',
    name: '',
    uri: '',
    sample_url: '',
    type: 'basic',
  })

  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: initialVoice?.name ?? '',
        uri: initialVoice?.uri ?? '',
        sample_url: initialVoice?.sample_url ?? '',
        type: initialVoice?.type ?? 'basic',
        gender: initialVoice?.gender ?? '',
        language: initialVoice?.language ?? '',
      })
    }
  }, [isOpen, initialVoice])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    await onSave({
      ...formData,
      name: formData.name.trim(),
      uri: formData.uri.trim(),
      sample_url: formData.sample_url?.trim() ?? '',
      type: formData.type,
      gender: formData.gender?.trim() ?? '',
      language: formData.language?.trim() ?? '',
    })
    onClose()
  }

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={initialVoice ? '编辑音色' : '新增音色'}
      centered
      closeOnClickOutside={!isSaving}
      size="lg"
    >
      <Stack component="form" gap="md" onSubmit={handleSubmit}>
        <TextInput
          label="音色名称"
          value={formData.name}
          onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
          placeholder="例如：默认女声"
          required
        />
        <TextInput
          label="参考音频 URI"
          value={formData.uri}
          onChange={(event) => setFormData((prev) => ({ ...prev, uri: event.target.value }))}
          placeholder="上传参考音频后返回的 URI"
          required
        />
        <TextInput
          label="示例音频 URL"
          type="url"
          value={formData.sample_url ?? ''}
          onChange={(event) => setFormData((prev) => ({ ...prev, sample_url: event.target.value }))}
          placeholder="https://example.com/sample.mp3"
          description="可选：用于前端播放示例音频。"
        />
        <NativeSelect
          label="音色类型"
          value={formData.type}
          onChange={(event) => setFormData((prev) => ({ ...prev, type: event.currentTarget.value as TtsVoiceType }))}
          data={[
            { label: '基础音色', value: 'basic' },
            { label: '高级音色', value: 'advanced' },
          ]}
        />
        <NativeSelect
          label="性别"
          value={formData.gender ?? ''}
          onChange={(event) => setFormData((prev) => ({ ...prev, gender: event.currentTarget.value }))}
          data={[
            { label: '未标注', value: '' },
            { label: '男声', value: 'male' },
            { label: '女声', value: 'female' },
            { label: '中性', value: 'neutral' },
          ]}
        />
        <NativeSelect
          label="语言"
          value={formData.language ?? ''}
          onChange={(event) => setFormData((prev) => ({ ...prev, language: event.currentTarget.value }))}
          data={[
            { label: '未标注', value: '' },
            { label: '中文', value: 'zh' },
            { label: '英文', value: 'en' },
            { label: '日文', value: 'ja' },
          ]}
        />
        <Group justify="flex-end" gap="sm">
          <Button type="button" variant="default" onClick={onClose}>取消</Button>
          <Button type="submit" loading={isSaving}>保存</Button>
        </Group>
      </Stack>
    </Modal>
  )
}

const BackgroundMusicModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  onSave: (item: BackgroundMusicConfigItem) => Promise<void>
  isSaving: boolean
  initialItem?: BackgroundMusicConfigItem | null
}> = ({ isOpen, onClose, onSave, isSaving, initialItem }) => {
  const [formData, setFormData] = useState({
    id: '',
    label: '',
    fileName: '',
    url: '',
  })

  useEffect(() => {
    if (isOpen) {
      setFormData({
        id: initialItem?.id ? String(initialItem.id) : '',
        label: initialItem?.label ?? '',
        fileName: initialItem?.fileName ?? '',
        url: initialItem?.url ?? '',
      })
    }
  }, [isOpen, initialItem])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsedId = Number.parseInt(formData.id, 10)
    await onSave({
      ...(initialItem ?? {}),
      ...(Number.isFinite(parsedId) && parsedId > 0 ? { id: parsedId } : {}),
      label: formData.label.trim(),
      fileName: formData.fileName.trim(),
      url: formData.url.trim(),
    })
    onClose()
  }

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={initialItem ? '编辑背景音乐' : '新增背景音乐'}
      centered
      closeOnClickOutside={!isSaving}
      size="lg"
    >
      <Stack component="form" gap="md" onSubmit={handleSubmit}>
        <TextInput
          label="音乐名称"
          value={formData.label}
          onChange={(event) => setFormData((prev) => ({ ...prev, label: event.target.value }))}
          placeholder="例如：悲怆"
          required
        />
        <TextInput
          label="音乐 URL"
          type="url"
          value={formData.url}
          onChange={(event) => setFormData((prev) => ({ ...prev, url: event.target.value }))}
          placeholder="https://store.narratoai.cn/bgms/example.mp3"
          required
        />
        <TextInput
          label="文件名"
          value={formData.fileName}
          onChange={(event) => setFormData((prev) => ({ ...prev, fileName: event.target.value }))}
          placeholder="例如：01-悲怆.mp3"
          description="可选：用于记录存储文件名，前端播放和合成以 URL 为准。"
        />
        <TextInput
          label="排序 ID"
          type="number"
          value={formData.id}
          onChange={(event) => setFormData((prev) => ({ ...prev, id: event.target.value }))}
          placeholder="留空时自动追加"
        />
        <Group justify="flex-end" gap="sm">
          <Button type="button" variant="default" onClick={onClose}>取消</Button>
          <Button type="submit" loading={isSaving}>保存</Button>
        </Group>
      </Stack>
    </Modal>
  )
}

const parseTtsVoices = (
  setting?: SystemSettingResponse | null
): { voices: TtsVoice[]; hasInvalidStructure: boolean } => {
  if (!setting || setting.key !== 'tts_voices') {
    return { voices: [], hasInvalidStructure: false }
  }

  const rawValue = (setting.value ?? {}) as { voices?: unknown }

  if (rawValue.voices === undefined) {
    return { voices: [], hasInvalidStructure: false }
  }

  if (!Array.isArray(rawValue.voices)) {
    return { voices: [], hasInvalidStructure: true }
  }

  const voices = rawValue.voices
    .map((voice): TtsVoice | null => {
      if (voice && typeof voice === 'object') {
        const record = voice as Record<string, unknown>
        const type = record.type === 'advanced' ? 'advanced' : 'basic'

        return {
          ...record,
          name: typeof record.name === 'string' ? record.name : '',
          uri: typeof record.uri === 'string' ? record.uri : '',
          sample_url: typeof record.sample_url === 'string' ? record.sample_url : '',
          type,
          gender: typeof record.gender === 'string' ? record.gender : '',
          language: typeof record.language === 'string' ? record.language : '',
        }
      }
      return null
    })
    .filter((voice): voice is TtsVoice => Boolean(voice))

  return { voices, hasInvalidStructure: false }
}

const formatVoicesForSaving = (voices: TtsVoice[]) => {
  return voices.map((voice) => {
    const { name, uri, sample_url, type, gender, language, ...rest } = voice
    return {
      ...rest,
      name: name.trim(),
      uri: uri.trim(),
      sample_url: sample_url?.trim() ?? '',
      type: type === 'advanced' ? 'advanced' : 'basic',
      ...(gender?.trim() ? { gender: gender.trim() } : {}),
      ...(language?.trim() ? { language: language.trim() } : {}),
    }
  })
}

const parseBackgroundMusicItems = (
  setting?: SystemSettingResponse | null
): { bgms: BackgroundMusicConfigItem[]; hasInvalidStructure: boolean } => {
  if (!setting || setting.key !== 'bgms') {
    return { bgms: [], hasInvalidStructure: false }
  }

  const rawValue = setting.value ?? {}
  const rawBgms = Array.isArray(rawValue) ? rawValue : (rawValue as { bgms?: unknown }).bgms

  if (rawBgms === undefined) {
    return { bgms: [], hasInvalidStructure: false }
  }

  if (!Array.isArray(rawBgms)) {
    return { bgms: [], hasInvalidStructure: true }
  }

  const bgms = rawBgms
    .map((item, index): BackgroundMusicConfigItem | null => {
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>
        const id = typeof record.id === 'number' && Number.isFinite(record.id) ? record.id : index + 1
        const fileName = typeof record.fileName === 'string'
          ? record.fileName
          : typeof record.file_name === 'string'
            ? record.file_name
            : ''

        return {
          ...record,
          id,
          label: typeof record.label === 'string'
            ? record.label
            : typeof record.name === 'string'
              ? record.name
              : '',
          fileName,
          url: typeof record.url === 'string' ? record.url : '',
        }
      }
      return null
    })
    .filter((item): item is BackgroundMusicConfigItem => Boolean(item))

  return { bgms, hasInvalidStructure: false }
}

const formatBackgroundMusicForSaving = (items: BackgroundMusicConfigItem[]) => {
  return items.map((item, index) => {
    const { id, label, fileName, url, ...rest } = item
    return {
      ...rest,
      id: typeof id === 'number' && Number.isFinite(id) ? id : index + 1,
      label: label.trim(),
      fileName: fileName?.trim() ?? '',
      url: url.trim(),
    }
  })
}

export const SystemSettingsPage: React.FC = () => {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [formState, setFormState] = useState<FormState>(defaultFormState)
  const [initialState, setInitialState] = useState<FormState>(defaultFormState)

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [voiceModalOpen, setVoiceModalOpen] = useState(false)
  const [voiceEditingIndex, setVoiceEditingIndex] = useState<number | null>(null)
  const [voiceDeleteIndex, setVoiceDeleteIndex] = useState<number | null>(null)
  const [backgroundMusicModalOpen, setBackgroundMusicModalOpen] = useState(false)
  const [backgroundMusicEditingIndex, setBackgroundMusicEditingIndex] = useState<number | null>(null)
  const [backgroundMusicDeleteIndex, setBackgroundMusicDeleteIndex] = useState<number | null>(null)
  const [voiceGroupBy, setVoiceGroupBy] = useState<TtsVoiceGroupBy>('type')
  const [voiceTypeFilter, setVoiceTypeFilter] = useState<TtsVoiceType | 'all'>('all')
  const [voiceGenderFilter, setVoiceGenderFilter] = useState('all')
  const [voiceLanguageFilter, setVoiceLanguageFilter] = useState('all')
  const [deleteSettingKey, setDeleteSettingKey] = useState<string | null>(null)

  const { showError, showSuccess } = useToast()

  const {
    settings,
    loadSettings,
    isLoading,
    isSaving,
    error,
    createSetting,
    updateSetting,
    deleteSetting,
    refreshSettings,
    clearError,
  } = useAdminSystemSettings()

  const sortedSettings = useMemo(
    () => [...settings].sort((a, b) => a.key.localeCompare(b.key)),
    [settings]
  )

  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!hasLoadedRef.current) {
      loadSettings()
      hasLoadedRef.current = true
    }
  }, [loadSettings])

  useEffect(() => {
    if (sortedSettings.length === 0) {
      setSelectedKey(null)
      return
    }
    setSelectedKey((prev) => {
      if (prev && sortedSettings.some((setting) => setting.key === prev)) {
        return prev
      }
      return sortedSettings[0].key
    })
  }, [sortedSettings])

  const activeSetting = useMemo(
    () => sortedSettings.find((setting) => setting.key === selectedKey),
    [sortedSettings, selectedKey]
  )

  useEffect(() => {
    if (activeSetting) {
      const description = activeSetting.description ?? ''
      const isPublic = Boolean(activeSetting.is_public)
      let valueText = '{}'
      try {
        valueText = JSON.stringify(activeSetting.value ?? {}, null, 2)
      } catch {
        valueText = String(activeSetting.value ?? '{}')
      }

      setFormState({
        description,
        isPublic,
        valueText,
      })
      setInitialState({
        description,
        isPublic,
        valueText,
      })
    } else {
      setFormState(defaultFormState)
      setInitialState(defaultFormState)
    }
  }, [activeSetting])

  const isDirty =
    activeSetting !== undefined &&
    (formState.description !== initialState.description ||
      formState.isPublic !== initialState.isPublic ||
      formState.valueText !== initialState.valueText)

  const { voices: ttsVoices, hasInvalidStructure } = useMemo(
    () => parseTtsVoices(activeSetting),
    [activeSetting]
  )

  const { bgms: backgroundMusicItems, hasInvalidStructure: hasInvalidBackgroundMusicStructure } = useMemo(
    () => parseBackgroundMusicItems(activeSetting),
    [activeSetting]
  )

  const voiceGenderOptions = useMemo(
    () => Array.from(new Set(ttsVoices.map((voice) => voice.gender || '').filter(Boolean))).sort(),
    [ttsVoices]
  )

  const voiceLanguageOptions = useMemo(
    () => Array.from(new Set(ttsVoices.map((voice) => voice.language || '').filter(Boolean))).sort(),
    [ttsVoices]
  )

  const groupedTtsVoiceSections = useMemo(() => {
    const indexedVoices = ttsVoices.map((voice, index) => ({ voice, index }))
    const filteredVoices = indexedVoices.filter(({ voice }) => {
      const matchesType = voiceTypeFilter === 'all' || voice.type === voiceTypeFilter
      const matchesGender = voiceGenderFilter === 'all' || (voice.gender || '') === voiceGenderFilter
      const matchesLanguage = voiceLanguageFilter === 'all' || (voice.language || '') === voiceLanguageFilter

      return matchesType && matchesGender && matchesLanguage
    })

    if (voiceGroupBy === 'gender') {
      const genderKeys = Array.from(new Set(filteredVoices.map(({ voice }) => voice.gender || ''))).sort()

      return genderKeys.map((gender) => ({
        title: getVoiceGenderLabel(gender),
        emptyText: `暂无${getVoiceGenderLabel(gender)}音色`,
        voices: filteredVoices.filter(({ voice }) => (voice.gender || '') === gender),
      }))
    }

    if (voiceGroupBy === 'language') {
      const languageKeys = Array.from(new Set(filteredVoices.map(({ voice }) => voice.language || ''))).sort()

      return languageKeys.map((language) => ({
        title: getVoiceLanguageLabel(language),
        emptyText: `暂无${getVoiceLanguageLabel(language)}音色`,
        voices: filteredVoices.filter(({ voice }) => (voice.language || '') === language),
      }))
    }

    return [
      {
        title: voiceTypeLabels.basic,
        emptyText: '暂无基础音色',
        voices: filteredVoices.filter(({ voice }) => voice.type === 'basic'),
      },
      {
        title: voiceTypeLabels.advanced,
        emptyText: '暂无高级音色',
        voices: filteredVoices.filter(({ voice }) => voice.type === 'advanced'),
      },
    ]
  }, [ttsVoices, voiceGenderFilter, voiceGroupBy, voiceLanguageFilter, voiceTypeFilter])

  const filteredTtsVoiceCount = useMemo(
    () => groupedTtsVoiceSections.reduce((sum, section) => sum + section.voices.length, 0),
    [groupedTtsVoiceSections]
  )

  const handleSaveSetting = async () => {
    if (!activeSetting) return

    let parsedValue: object
    try {
      parsedValue = JSON.parse(formState.valueText)
    } catch {
      showError('格式错误', 'JSON 格式不正确')
      return
    }

    try {
      await updateSetting(activeSetting.key, {
        value: parsedValue,
        description: formState.description.trim() ? formState.description.trim() : undefined,
        is_public: formState.isPublic,
      })
      showSuccess('配置已保存')
    } catch (err) {
      showError('保存失败', err instanceof Error ? err.message : undefined)
    }
  }

  const handleResetSetting = () => {
    setFormState(initialState)
  }

  const handleCreateSetting = async (data: SystemSettingCreateRequest) => {
    try {
      const created = await createSetting(data)
      showSuccess('配置已创建')
      setSelectedKey(created.key)
    } catch (err) {
      showError('创建失败', err instanceof Error ? err.message : undefined)
      throw err
    }
  }

  const handleDeleteSetting = async () => {
    if (!deleteSettingKey) return
    try {
      await deleteSetting(deleteSettingKey)
      showSuccess('配置已删除')
      setDeleteSettingKey(null)
    } catch (err) {
      showError('删除失败', err instanceof Error ? err.message : undefined)
      setDeleteSettingKey(null)
    }
  }

  const persistTtsVoices = async (voices: TtsVoice[]) => {
    if (!activeSetting || activeSetting.key !== 'tts_voices') return

    const payload = { voices: formatVoicesForSaving(voices) }

    try {
      await updateSetting(activeSetting.key, {
        value: payload,
        description: formState.description.trim() ? formState.description.trim() : undefined,
        is_public: formState.isPublic,
      })
      showSuccess('音色列表已更新')
    } catch (err) {
      showError('操作失败', err instanceof Error ? err.message : undefined)
    }
  }

  const handleSaveVoice = async (voice: TtsVoice) => {
    if (!activeSetting || activeSetting.key !== 'tts_voices') return

    if (voiceEditingIndex !== null && voiceEditingIndex >= 0) {
      const updated = [...ttsVoices]
      updated[voiceEditingIndex] = {
        ...updated[voiceEditingIndex],
        ...voice,
      }
      await persistTtsVoices(updated)
    } else {
      await persistTtsVoices([...ttsVoices, voice])
    }

    setVoiceEditingIndex(null)
    setVoiceModalOpen(false)
  }

  const executeVoiceDelete = async () => {
    if (voiceDeleteIndex === null) return
    const updated = ttsVoices.filter((_, idx) => idx !== voiceDeleteIndex)
    await persistTtsVoices(updated)
    setVoiceDeleteIndex(null)
  }

  const resetTtsVoices = async () => {
    await persistTtsVoices([])
  }

  const persistBackgroundMusicItems = async (items: BackgroundMusicConfigItem[]) => {
    if (!activeSetting || activeSetting.key !== 'bgms') return

    const payload = { bgms: formatBackgroundMusicForSaving(items) }

    try {
      await updateSetting(activeSetting.key, {
        value: payload,
        description: formState.description.trim() ? formState.description.trim() : undefined,
        is_public: formState.isPublic,
      })
      showSuccess('背景音乐列表已更新')
    } catch (err) {
      showError('操作失败', err instanceof Error ? err.message : undefined)
    }
  }

  const handleSaveBackgroundMusic = async (item: BackgroundMusicConfigItem) => {
    if (!activeSetting || activeSetting.key !== 'bgms') return

    const nextItem = {
      ...item,
      id: item.id ?? Math.max(0, ...backgroundMusicItems.map(candidate => candidate.id ?? 0)) + 1,
    }

    if (backgroundMusicEditingIndex !== null && backgroundMusicEditingIndex >= 0) {
      const updated = [...backgroundMusicItems]
      updated[backgroundMusicEditingIndex] = {
        ...updated[backgroundMusicEditingIndex],
        ...nextItem,
      }
      await persistBackgroundMusicItems(updated)
    } else {
      await persistBackgroundMusicItems([...backgroundMusicItems, nextItem])
    }

    setBackgroundMusicEditingIndex(null)
    setBackgroundMusicModalOpen(false)
  }

  const executeBackgroundMusicDelete = async () => {
    if (backgroundMusicDeleteIndex === null) return
    const updated = backgroundMusicItems.filter((_, idx) => idx !== backgroundMusicDeleteIndex)
    await persistBackgroundMusicItems(updated)
    setBackgroundMusicDeleteIndex(null)
  }

  const resetBackgroundMusicItems = async () => {
    await persistBackgroundMusicItems([])
  }

  return (
    <>
      <AppPageShell size="xl">
        <PageHeader
          title="系统配置管理"
          subtitle="上方切换配置键，下方编辑 JSON 值或管理内置音色、背景音乐"
          actions={
            <Group gap="sm" justify="flex-end">
              <Button
                variant="default"
                onClick={() => refreshSettings()}
                disabled={isLoading}
                leftSection={<ArrowPathIcon style={{ width: 16, height: 16 }} />}
              >
                {isLoading ? '刷新中...' : '刷新配置'}
              </Button>
              <Button
                onClick={() => setIsCreateModalOpen(true)}
                leftSection={<PlusIcon style={{ width: 16, height: 16 }} />}
              >
                新增配置
              </Button>
            </Group>
          }
        />

        {error ? (
          <Alert color="red" variant="light" withCloseButton onClose={clearError}>
            {error}
          </Alert>
        ) : null}

        <Stack gap="lg">
          <Paper p="sm" radius="lg" withBorder>
            {isLoading && sortedSettings.length === 0 ? (
              <Text px="sm" py="xs" c="dimmed" size="sm">正在加载配置...</Text>
            ) : sortedSettings.length === 0 ? (
              <Text px="sm" py="xs" c="dimmed" size="sm">暂无系统配置，请先创建。</Text>
            ) : (
              <Tabs value={selectedKey} onChange={setSelectedKey} keepMounted={false}>
                <ScrollArea type="auto" offsetScrollbars="x" scrollbarSize={6}>
                  <Tabs.List style={{ flexWrap: 'nowrap' }}>
                    {sortedSettings.map((setting) => (
                      <Tabs.Tab key={setting.id} value={setting.key}>
                        <Group gap={6} wrap="nowrap">
                          <Text span fw={600} size="sm">{setting.key}</Text>
                          {setting.key === 'tts_voices' ? <StatusChip tone="brand" size="xs">TTS</StatusChip> : null}
                          {setting.key === 'bgms' ? <StatusChip tone="success" size="xs">BGM</StatusChip> : null}
                        </Group>
                      </Tabs.Tab>
                    ))}
                  </Tabs.List>
                </ScrollArea>
              </Tabs>
            )}
          </Paper>

          <section>
            {selectedKey === null || !activeSetting ? (
              <Paper p="xl" radius="lg" withBorder>
                <Text size="sm" c="dimmed" ta="center">从上方选择一个配置键开始管理。</Text>
              </Paper>
            ) : (
              <SurfaceCard p="lg">
                <Stack gap="lg">
                  <Group justify="space-between" align="flex-start" gap="md">
                    <div>
                      <Title order={2}>{activeSetting.key}</Title>
                      <Stack gap={4} mt="sm">
                        <Text size="xs" c="dimmed">ID：{activeSetting.id}</Text>
                        <Text size="xs" c="dimmed">创建时间：{new Date(activeSetting.created_at).toLocaleString('zh-CN')}</Text>
                        <Text size="xs" c="dimmed">更新时间：{new Date(activeSetting.updated_at).toLocaleString('zh-CN')}</Text>
                        {activeSetting.updated_by ? (
                          <Text size="xs" c="dimmed">更新者：{activeSetting.updated_by}</Text>
                        ) : null}
                      </Stack>
                    </div>

                    <Button
                      variant="light"
                      color="red"
                      onClick={() => setDeleteSettingKey(activeSetting.key)}
                    >
                      删除配置
                    </Button>
                  </Group>

                  <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                    <TextInput
                      label="配置描述"
                      value={formState.description}
                      onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
                      placeholder="用于描述配置用途"
                    />

                    <Checkbox
                      checked={formState.isPublic}
                      onChange={(event) => setFormState((prev) => ({ ...prev, isPublic: event.currentTarget.checked }))}
                      label="公开配置"
                      description="公开后可通过 /api/v1/system/settings/public 访问"
                      mt={{ base: 0, md: 28 }}
                    />
                  </SimpleGrid>

                  <Textarea
                    label="配置值 (JSON)"
                    value={formState.valueText}
                    onChange={(event) => setFormState((prev) => ({ ...prev, valueText: event.target.value }))}
                    rows={activeSetting.key === 'tts_voices' || activeSetting.key === 'bgms' ? 10 : 14}
                    styles={{ input: { fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, monospace' } }}
                  />

                  <Group gap="sm">
                    <Button onClick={handleSaveSetting} disabled={!isDirty || isSaving}>
                      {isSaving ? '保存中...' : '保存修改'}
                    </Button>
                    <Button variant="default" onClick={handleResetSetting} disabled={!isDirty || isSaving}>
                      撤销修改
                    </Button>
                  </Group>

	                  {activeSetting.key === 'tts_voices' ? (
	                    <>
                      <Divider color="rgba(255, 255, 255, 0.08)" />

                      <Stack gap="md">
                        <Group justify="space-between" align="center" gap="md">
                          <div>
                            <Title order={4}>内置音色列表</Title>
                            <Text size="xs" c="dimmed" mt={4}>
                              编辑 JSON 后亦可手动批量修改，建议使用下方表单进行增删改。
                            </Text>
                          </div>
                          <Group gap="sm">
                            {hasInvalidStructure ? (
                              <Button variant="light" color="yellow" onClick={resetTtsVoices} disabled={isSaving}>
                                {isSaving ? '重置中...' : '重置结构'}
                              </Button>
                            ) : null}
                            <Button
                              onClick={() => {
                                setVoiceEditingIndex(null)
                                setVoiceModalOpen(true)
                              }}
                              disabled={isSaving || hasInvalidStructure}
                              leftSection={<PlusIcon style={{ width: 16, height: 16 }} />}
                            >
                              新增音色
                            </Button>
                          </Group>
                        </Group>

                        {!hasInvalidStructure && ttsVoices.length > 0 ? (
                          <Paper p="md" radius="lg" withBorder>
                            <Stack gap="md">
                              <Group justify="space-between" gap="md" align="flex-end">
                                <NativeSelect
                                  label="分组方式"
                                  value={voiceGroupBy}
                                  onChange={(event) => setVoiceGroupBy(event.currentTarget.value as TtsVoiceGroupBy)}
                                  data={[
                                    { label: '按类型分组', value: 'type' },
                                    { label: '按性别分组', value: 'gender' },
                                    { label: '按语言分组', value: 'language' },
                                  ]}
                                />
                                <Text size="xs" c="dimmed">
                                  当前显示 {filteredTtsVoiceCount} / {ttsVoices.length} 个
                                </Text>
                              </Group>

                              <Stack gap="xs">
                                <Group gap="xs">
                                  <Text size="xs" c="dimmed">类型</Text>
                                  {[
                                    { label: '全部', value: 'all' },
                                    { label: voiceTypeLabels.basic, value: 'basic' },
                                    { label: voiceTypeLabels.advanced, value: 'advanced' },
                                  ].map((option) => (
                                    <Button
                                      key={option.value}
                                      size="xs"
                                      variant={voiceTypeFilter === option.value ? 'filled' : 'light'}
                                      onClick={() => setVoiceTypeFilter(option.value as TtsVoiceType | 'all')}
                                    >
                                      {option.label}
                                    </Button>
                                  ))}
                                </Group>

                                <Group gap="xs">
                                  <Text size="xs" c="dimmed">性别</Text>
                                  <Button
                                    size="xs"
                                    variant={voiceGenderFilter === 'all' ? 'filled' : 'light'}
                                    onClick={() => setVoiceGenderFilter('all')}
                                  >
                                    全部
                                  </Button>
                                  {voiceGenderOptions.map((gender) => (
                                    <Button
                                      key={gender}
                                      size="xs"
                                      variant={voiceGenderFilter === gender ? 'filled' : 'light'}
                                      onClick={() => setVoiceGenderFilter(gender)}
                                    >
                                      {getVoiceGenderLabel(gender)}
                                    </Button>
                                  ))}
                                </Group>

                                <Group gap="xs">
                                  <Text size="xs" c="dimmed">语言</Text>
                                  <Button
                                    size="xs"
                                    variant={voiceLanguageFilter === 'all' ? 'filled' : 'light'}
                                    onClick={() => setVoiceLanguageFilter('all')}
                                  >
                                    全部
                                  </Button>
                                  {voiceLanguageOptions.map((language) => (
                                    <Button
                                      key={language}
                                      size="xs"
                                      variant={voiceLanguageFilter === language ? 'filled' : 'light'}
                                      onClick={() => setVoiceLanguageFilter(language)}
                                    >
                                      {getVoiceLanguageLabel(language)}
                                    </Button>
                                  ))}
                                </Group>
                              </Stack>
                            </Stack>
                          </Paper>
                        ) : null}

                        {hasInvalidStructure ? (
                          <Alert color="yellow" variant="light">
                            当前配置的结构异常，无法解析为音色数组。请点击“重置结构”或直接在上方 JSON 中修正为
                            <code style={{ marginInline: 6, padding: '2px 6px', borderRadius: 6, background: 'var(--app-surface-alt)' }}>{'{ "voices": [] }'}</code>
                            的格式。
                          </Alert>
                        ) : ttsVoices.length === 0 ? (
                          <Paper
                            radius="lg"
                            withBorder
                            style={{
                              borderStyle: 'dashed',
                              paddingBlock: 40,
                              textAlign: 'center',
                            }}
                          >
                            <Text size="sm" c="dimmed">暂无音色，点击右上角“新增音色”开始添加。</Text>
                          </Paper>
                        ) : (
                          <Stack gap="xl">
                            {groupedTtsVoiceSections.length === 0 ? (
                              <Paper
                                radius="lg"
                                withBorder
                                style={{
                                  borderStyle: 'dashed',
                                  paddingBlock: 40,
                                  textAlign: 'center',
                                }}
                              >
                                <Text size="sm" c="dimmed">没有匹配当前筛选条件的音色。</Text>
                              </Paper>
                            ) : groupedTtsVoiceSections.map((section) => (
                              <Stack key={section.title} gap="md">
                                <Group justify="space-between" align="center">
                                  <Title order={5}>{section.title}</Title>
                                  <Text size="xs" c="dimmed">共 {section.voices.length} 个</Text>
                                </Group>

                                {section.voices.length === 0 ? (
                                  <Paper
                                    radius="lg"
                                    withBorder
                                    style={{
                                      borderStyle: 'dashed',
                                      paddingBlock: 24,
                                      textAlign: 'center',
                                    }}
                                  >
                                    <Text size="sm" c="dimmed">{section.emptyText}</Text>
                                  </Paper>
                                ) : (
                                  <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                                    {section.voices.map(({ voice, index }) => (
                                      <SurfaceCard key={`${voice.name}-${index}`} tone="subtle" p="md">
                                        <Stack gap="sm">
                                          <Group justify="space-between" align="flex-start" gap="sm">
                                            <div>
                                              <Title order={5}>{voice.name || `音色 ${index + 1}`}</Title>
                                              <StatusChip
                                                tone={voice.type === 'advanced' ? 'brand' : 'success'}
                                                size="xs"
                                                mt={6}
                                              >
                                                {voiceTypeLabels[voice.type]}
                                              </StatusChip>
                                              <Group gap={6} mt={6}>
                                                <StatusChip tone="neutral" size="xs">
                                                  {getVoiceGenderLabel(voice.gender)}
                                                </StatusChip>
                                                <StatusChip tone="neutral" size="xs">
                                                  {getVoiceLanguageLabel(voice.language)}
                                                </StatusChip>
                                              </Group>
                                            </div>
                                            <Group gap={4}>
                                              {voice.sample_url ? (
                                                <VoicePreviewPlayer audioUrl={voice.sample_url} />
                                              ) : null}
                                              <ActionIcon
                                                variant="subtle"
                                                color="gray"
                                                onClick={() => {
                                                  setVoiceEditingIndex(index)
                                                  setVoiceModalOpen(true)
                                                }}
                                                title="编辑音色"
                                              >
                                                <PencilIcon style={{ width: 16, height: 16 }} />
                                              </ActionIcon>
                                              <ActionIcon
                                                variant="subtle"
                                                color="red"
                                                onClick={() => setVoiceDeleteIndex(index)}
                                                title="删除音色"
                                              >
                                                <TrashIcon style={{ width: 16, height: 16 }} />
                                              </ActionIcon>
                                            </Group>
                                          </Group>

                                          <div>
                                            <Text size="xs" c="dimmed">参考音频 URI：</Text>
                                            <Paper mt={4} p="xs" radius="md" bg="var(--app-surface-alt)">
                                              <Text size="xs" ff="monospace" style={{ wordBreak: 'break-all' }}>
                                                {voice.uri || '-'}
                                              </Text>
                                            </Paper>
                                          </div>

                                        </Stack>
                                      </SurfaceCard>
                                    ))}
                                  </SimpleGrid>
                                )}
                              </Stack>
                            ))}
                          </Stack>
                        )}

                        {!hasInvalidStructure ? (
                          <Text size="xs" c="dimmed">总计音色：{ttsVoices.length}</Text>
                        ) : null}
                      </Stack>
	                    </>
	                  ) : null}

	                  {activeSetting.key === 'bgms' ? (
	                    <>
	                      <Divider color="rgba(255, 255, 255, 0.08)" />

	                      <Stack gap="md">
	                        <Group justify="space-between" align="center" gap="md">
	                          <div>
	                            <Title order={4}>背景音乐列表</Title>
	                            <Text size="xs" c="dimmed" mt={4}>
	                              前端会优先读取公开的 bgms 配置；没有配置或结构为空时使用本地默认列表。
	                            </Text>
	                          </div>
	                          <Group gap="sm">
	                            {hasInvalidBackgroundMusicStructure ? (
	                              <Button variant="light" color="yellow" onClick={resetBackgroundMusicItems} disabled={isSaving}>
	                                {isSaving ? '重置中...' : '重置结构'}
	                              </Button>
	                            ) : null}
	                            <Button
	                              onClick={() => {
	                                setBackgroundMusicEditingIndex(null)
	                                setBackgroundMusicModalOpen(true)
	                              }}
	                              disabled={isSaving || hasInvalidBackgroundMusicStructure}
	                              leftSection={<PlusIcon style={{ width: 16, height: 16 }} />}
	                            >
	                              新增背景音乐
	                            </Button>
	                          </Group>
	                        </Group>

	                        {hasInvalidBackgroundMusicStructure ? (
	                          <Alert color="yellow" variant="light">
	                            当前配置的结构异常，无法解析为背景音乐数组。请点击“重置结构”或直接在上方 JSON 中修正为
	                            <code style={{ marginInline: 6, padding: '2px 6px', borderRadius: 6, background: 'var(--app-surface-alt)' }}>{'{ "bgms": [] }'}</code>
	                            的格式。
	                          </Alert>
	                        ) : backgroundMusicItems.length === 0 ? (
	                          <Paper
	                            radius="lg"
	                            withBorder
	                            style={{
	                              borderStyle: 'dashed',
	                              paddingBlock: 40,
	                              textAlign: 'center',
	                            }}
	                          >
	                            <Text size="sm" c="dimmed">暂无背景音乐，点击右上角“新增背景音乐”开始添加。</Text>
	                          </Paper>
	                        ) : (
	                          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
	                            {backgroundMusicItems.map((item, index) => (
	                              <SurfaceCard key={`${item.label}-${index}`} tone="subtle" p="md">
	                                <Stack gap="sm">
	                                  <Group justify="space-between" align="flex-start" gap="sm">
	                                    <div>
	                                      <Title order={5}>{item.label || `背景音乐 ${index + 1}`}</Title>
	                                      <StatusChip tone="success" size="xs" mt={6}>
	                                        ID {item.id ?? index + 1}
	                                      </StatusChip>
	                                    </div>
	                                    <Group gap={4}>
	                                      {item.url ? (
	                                        <VoicePreviewPlayer audioUrl={item.url} />
	                                      ) : null}
	                                      <ActionIcon
	                                        variant="subtle"
	                                        color="gray"
	                                        onClick={() => {
	                                          setBackgroundMusicEditingIndex(index)
	                                          setBackgroundMusicModalOpen(true)
	                                        }}
	                                        title="编辑背景音乐"
	                                      >
	                                        <PencilIcon style={{ width: 16, height: 16 }} />
	                                      </ActionIcon>
	                                      <ActionIcon
	                                        variant="subtle"
	                                        color="red"
	                                        onClick={() => setBackgroundMusicDeleteIndex(index)}
	                                        title="删除背景音乐"
	                                      >
	                                        <TrashIcon style={{ width: 16, height: 16 }} />
	                                      </ActionIcon>
	                                    </Group>
	                                  </Group>

	                                  <div>
	                                    <Text size="xs" c="dimmed">音乐 URL：</Text>
	                                    <Paper mt={4} p="xs" radius="md" bg="var(--app-surface-alt)">
	                                      <Text size="xs" ff="monospace" style={{ wordBreak: 'break-all' }}>
	                                        {item.url || '-'}
	                                      </Text>
	                                    </Paper>
	                                  </div>

	                                  {item.fileName ? (
	                                    <Text size="xs" c="dimmed">文件名：{item.fileName}</Text>
	                                  ) : null}
	                                </Stack>
	                              </SurfaceCard>
	                            ))}
	                          </SimpleGrid>
	                        )}

	                        {!hasInvalidBackgroundMusicStructure ? (
	                          <Text size="xs" c="dimmed">总计背景音乐：{backgroundMusicItems.length}</Text>
	                        ) : null}
	                      </Stack>
	                    </>
	                  ) : null}
	                </Stack>
              </SurfaceCard>
            )}
          </section>
        </Stack>
      </AppPageShell>

      {isCreateModalOpen ? (
        <CreateSettingModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreate={handleCreateSetting}
          isSaving={isSaving}
          showError={showError}
        />
      ) : null}

      {voiceModalOpen ? (
        <TtsVoiceModal
          isOpen={voiceModalOpen}
          onClose={() => {
            setVoiceModalOpen(false)
            setVoiceEditingIndex(null)
          }}
          onSave={handleSaveVoice}
          isSaving={isSaving}
          initialVoice={
            voiceEditingIndex !== null && voiceEditingIndex >= 0
              ? ttsVoices[voiceEditingIndex]
              : null
          }
        />
      ) : null}

      {backgroundMusicModalOpen ? (
        <BackgroundMusicModal
          isOpen={backgroundMusicModalOpen}
          onClose={() => {
            setBackgroundMusicModalOpen(false)
            setBackgroundMusicEditingIndex(null)
          }}
          onSave={handleSaveBackgroundMusic}
          isSaving={isSaving}
          initialItem={
            backgroundMusicEditingIndex !== null && backgroundMusicEditingIndex >= 0
              ? backgroundMusicItems[backgroundMusicEditingIndex]
              : null
          }
        />
      ) : null}

      <ConfirmDialog
        isOpen={voiceDeleteIndex !== null}
        onClose={() => setVoiceDeleteIndex(null)}
        onConfirm={executeVoiceDelete}
        title="删除音色"
        message="确定要删除这个音色吗？此操作不可撤销。"
        type="danger"
        confirmText="确定删除"
        cancelText="取消"
      />

      <ConfirmDialog
        isOpen={backgroundMusicDeleteIndex !== null}
        onClose={() => setBackgroundMusicDeleteIndex(null)}
        onConfirm={executeBackgroundMusicDelete}
        title="删除背景音乐"
        message="确定要删除这个背景音乐吗？此操作不可撤销。"
        type="danger"
        confirmText="确定删除"
        cancelText="取消"
      />

      <ConfirmDialog
        isOpen={deleteSettingKey !== null}
        onClose={() => setDeleteSettingKey(null)}
        onConfirm={handleDeleteSetting}
        title="删除配置"
        message="确定要删除这个配置吗？此操作不可撤销。"
        type="danger"
        confirmText="确定删除"
        cancelText="取消"
      />
    </>
  )
}

export default SystemSettingsPage
