import { useEffect, useMemo, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Code,
  CopyButton,
  Divider,
  FileInput,
  Group,
  NumberInput,
  Paper,
  PasswordInput,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core'
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  CloudArrowUpIcon,
  MicrophoneIcon,
  PlayIcon,
  SparklesIcon,
  TrashIcon,
} from '@/shared/icons/tabler'
import AppPageShell from '@/shared/components/ui/AppPageShell'
import QwenTtsVoiceManagement from './QwenTtsVoiceManagement'
import ConfirmDialog from '@/shared/components/ui/ConfirmDialog'
import PageHeader from '@/shared/components/ui/PageHeader'
import SurfaceCard from '@/shared/components/ui/SurfaceCard'
import { useToast } from '@/shared/contexts/ToastContext'
import {
  siliconflowTtsAdminService,
  type CreateSpeechInput,
  type SiliconFlowVoice,
  type TranscriptionInput,
} from '@/shared/services/siliconflowTtsAdminService'
import {
  fishAudioAdminService,
  type FishAudioFormat,
  type FishAudioLatency,
  type FishAudioModel,
  type FishAudioTtsModel,
  type FishAudioVisibility,
} from '@/shared/services/fishAudioAdminService'

const API_KEY_STORAGE_KEY = 'narratoai.admin.siliconflow.apiKey'
const FISH_AUDIO_API_KEY_STORAGE_KEY = 'narratoai.admin.fishAudio.apiKey'
const DEFAULT_TTS_MODEL = 'FunAudioLLM/CosyVoice2-0.5B'
const DEFAULT_TTS_VOICE = `${DEFAULT_TTS_MODEL}:alex`
const ENGLISH_REFERENCE_TEXT = 'Pay close attention! This guy just found a mysterious briefcase, completely unaware he just crossed the city\'s deadliest mob boss. The next 90 minutes are pure adrenaline, and the final twist will leave your jaw on the floor. Let\'s dive in!'
const CHINESE_REFERENCE_TEXT = '这可能是豆瓣评分最被低估的一部电影。上映当年票房惨败，却在十年后被无数人奉为神作。看懂的人都沉默了，没看懂的已经哭成了泪人。如果有一天，你醒来发现全世界的人都消失了，你会怎么做？'

const speechFormatOptions = [
  { label: 'MP3', value: 'mp3' },
  { label: 'WAV', value: 'wav' },
  { label: 'OPUS', value: 'opus' },
  { label: 'PCM', value: 'pcm' },
]

const transcriptionModelOptions: Array<{ label: string; value: TranscriptionInput['model'] }> = [
  { label: 'FunAudioLLM/SenseVoiceSmall', value: 'FunAudioLLM/SenseVoiceSmall' },
  { label: 'TeleAI/TeleSpeechASR', value: 'TeleAI/TeleSpeechASR' },
]

const fishVisibilityOptions: Array<{ label: string; value: FishAudioVisibility }> = [
  { label: '私有', value: 'private' },
  { label: '不公开但可链接访问', value: 'unlist' },
  { label: '公开', value: 'public' },
]

const fishTtsModelOptions: Array<{ label: string; value: FishAudioTtsModel }> = [
  { label: 'S2 Pro', value: 's2-pro' },
  { label: 'S1', value: 's1' },
]

const fishLatencyOptions: Array<{ label: string; value: FishAudioLatency }> = [
  { label: '普通质量', value: 'normal' },
  { label: '平衡延迟', value: 'balanced' },
  { label: '低延迟', value: 'low' },
]

const getStoredApiKey = () => {
  try {
    return window.localStorage.getItem(API_KEY_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

const setStoredApiKey = (apiKey: string) => {
  try {
    if (apiKey.trim()) {
      window.localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim())
    } else {
      window.localStorage.removeItem(API_KEY_STORAGE_KEY)
    }
  } catch {
    // 浏览器禁用 localStorage 时仅保留当前页面状态。
  }
}

const getStoredFishAudioApiKey = () => {
  try {
    return window.localStorage.getItem(FISH_AUDIO_API_KEY_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

const setStoredFishAudioApiKey = (apiKey: string) => {
  try {
    if (apiKey.trim()) {
      window.localStorage.setItem(FISH_AUDIO_API_KEY_STORAGE_KEY, apiKey.trim())
    } else {
      window.localStorage.removeItem(FISH_AUDIO_API_KEY_STORAGE_KEY)
    }
  } catch {
    // 浏览器禁用 localStorage 时仅保留当前页面状态。
  }
}

const getAudioMimeType = (format: CreateSpeechInput['responseFormat']) => {
  if (format === 'wav') return 'audio/wav'
  if (format === 'opus') return 'audio/opus'
  if (format === 'pcm') return 'application/octet-stream'
  return 'audio/mpeg'
}

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

const getFileBaseName = (fileName: string) => fileName.replace(/\.[^/.]+$/, '')

const getReferenceTextByFileName = (fileName: string) => {
  const normalized = fileName.toLowerCase()

  if (/(^|[-_.\s])(en|eng|english)([-_.\s]|$)/.test(normalized)) {
    return ENGLISH_REFERENCE_TEXT
  }

  if (/(^|[-_.\s])(cn|zh|chs|chi|chinese|中文)([-_.\s]|$)/.test(normalized)) {
    return CHINESE_REFERENCE_TEXT
  }

  return CHINESE_REFERENCE_TEXT
}

const splitTags = (value: string) => value
  .split(',')
  .map((tag) => tag.trim())
  .filter(Boolean)

export default function TtsVoiceManagementPage() {
  const { showError, showSuccess, showWarning } = useToast()
  const [apiKey, setApiKey] = useState(getStoredApiKey)
  const [voices, setVoices] = useState<SiliconFlowVoice[]>([])
  const [isLoadingVoices, setIsLoadingVoices] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SiliconFlowVoice | null>(null)
  const [selectedVoiceUris, setSelectedVoiceUris] = useState<string[]>([])
  const [isBatchDeleteOpen, setIsBatchDeleteOpen] = useState(false)
  const [isBatchDeleting, setIsBatchDeleting] = useState(false)

  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadModel, setUploadModel] = useState(DEFAULT_TTS_MODEL)
  const [customName, setCustomName] = useState('')
  const [referenceText, setReferenceText] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadedUri, setUploadedUri] = useState('')

  const [speechModel, setSpeechModel] = useState(DEFAULT_TTS_MODEL)
  const [speechInput, setSpeechInput] = useState('你站在桥上看风景，看风景的人在楼上看你。')
  const [speechVoice, setSpeechVoice] = useState(DEFAULT_TTS_VOICE)
  const [speechFormat, setSpeechFormat] = useState<CreateSpeechInput['responseFormat']>('mp3')
  const [sampleRate, setSampleRate] = useState<number | string>(44100)
  const [speed, setSpeed] = useState<number | string>(1)
  const [gain, setGain] = useState<number | string>(0)
  const [streamSpeech, setStreamSpeech] = useState(false)
  const [isCreatingSpeech, setIsCreatingSpeech] = useState(false)
  const [speechBlob, setSpeechBlob] = useState<Blob | null>(null)
  const [speechTraceId, setSpeechTraceId] = useState<string | null>(null)

  const [transcriptionFile, setTranscriptionFile] = useState<File | null>(null)
  const [transcriptionModel, setTranscriptionModel] = useState<TranscriptionInput['model']>('FunAudioLLM/SenseVoiceSmall')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcriptionText, setTranscriptionText] = useState('')

  const [fishApiKey, setFishApiKey] = useState(getStoredFishAudioApiKey)
  const [fishModels, setFishModels] = useState<FishAudioModel[]>([])
  const [fishTotal, setFishTotal] = useState(0)
  const [fishSearchTitle, setFishSearchTitle] = useState('')
  const [fishSearchId, setFishSearchId] = useState('')
  const [isLoadingFishModels, setIsLoadingFishModels] = useState(false)
  const [isLoadingFishModelById, setIsLoadingFishModelById] = useState(false)
  const [fishDeleteTarget, setFishDeleteTarget] = useState<FishAudioModel | null>(null)
  const [fishSelectedModelIds, setFishSelectedModelIds] = useState<string[]>([])
  const [isFishBatchDeleteOpen, setIsFishBatchDeleteOpen] = useState(false)
  const [isFishBatchDeleting, setIsFishBatchDeleting] = useState(false)
  const [fishSelectedModel, setFishSelectedModel] = useState<FishAudioModel | null>(null)
  const [fishVoiceFiles, setFishVoiceFiles] = useState<File[]>([])
  const [fishCreateTitle, setFishCreateTitle] = useState('')
  const [fishCreateText, setFishCreateText] = useState('')
  const [fishCreateDescription, setFishCreateDescription] = useState('')
  const [fishCreateTags, setFishCreateTags] = useState('tts,admin')
  const [fishCreateVisibility, setFishCreateVisibility] = useState<FishAudioVisibility>('private')
  const [fishEnhanceAudioQuality, setFishEnhanceAudioQuality] = useState(true)
  const [fishGenerateSample, setFishGenerateSample] = useState(false)
  const [isCreatingFishModel, setIsCreatingFishModel] = useState(false)
  const [fishEditTitle, setFishEditTitle] = useState('')
  const [fishEditDescription, setFishEditDescription] = useState('')
  const [fishEditTags, setFishEditTags] = useState('')
  const [fishEditVisibility, setFishEditVisibility] = useState<FishAudioVisibility>('private')
  const [isUpdatingFishModel, setIsUpdatingFishModel] = useState(false)
  const [fishSpeechModel, setFishSpeechModel] = useState<FishAudioTtsModel>('s2-pro')
  const [fishSpeechReferenceId, setFishSpeechReferenceId] = useState('')
  const [fishSpeechText, setFishSpeechText] = useState(CHINESE_REFERENCE_TEXT)
  const [fishSpeechFormat, setFishSpeechFormat] = useState<FishAudioFormat>('mp3')
  const [fishSpeechSampleRate, setFishSpeechSampleRate] = useState<number | string>(44100)
  const [fishSpeechLatency, setFishSpeechLatency] = useState<FishAudioLatency>('normal')
  const [fishSpeechTemperature, setFishSpeechTemperature] = useState<number | string>(0.7)
  const [fishSpeechTopP, setFishSpeechTopP] = useState<number | string>(0.7)
  const [fishSpeechSpeed, setFishSpeechSpeed] = useState<number | string>(1)
  const [fishSpeechVolume, setFishSpeechVolume] = useState<number | string>(0)
  const [fishSpeechBlob, setFishSpeechBlob] = useState<Blob | null>(null)
  const [isCreatingFishSpeech, setIsCreatingFishSpeech] = useState(false)

  const trimmedApiKey = apiKey.trim()
  const hasApiKey = trimmedApiKey.length > 0
  const trimmedFishApiKey = fishApiKey.trim()
  const hasFishApiKey = trimmedFishApiKey.length > 0
  const fishSelectedModelSet = useMemo(() => new Set(fishSelectedModelIds), [fishSelectedModelIds])
  const fishSelectedModelCount = fishSelectedModelIds.length
  const isAllVisibleFishSelected = fishModels.length > 0 && fishModels.every((model) => fishSelectedModelSet.has(model._id))
  const isSomeVisibleFishSelected = fishModels.some((model) => fishSelectedModelSet.has(model._id))
  const selectedVoiceSet = useMemo(() => new Set(selectedVoiceUris), [selectedVoiceUris])
  const selectedVoiceCount = selectedVoiceUris.length
  const isAllVisibleSelected = voices.length > 0 && voices.every((voice) => selectedVoiceSet.has(voice.uri))
  const isSomeVisibleSelected = voices.some((voice) => selectedVoiceSet.has(voice.uri))

  const speechObjectUrl = useMemo(() => {
    if (!speechBlob) return ''
    return URL.createObjectURL(new Blob([speechBlob], { type: getAudioMimeType(speechFormat) }))
  }, [speechBlob, speechFormat])

  const fishSpeechObjectUrl = useMemo(() => {
    if (!fishSpeechBlob) return ''
    return URL.createObjectURL(new Blob([fishSpeechBlob], { type: getAudioMimeType(fishSpeechFormat) }))
  }, [fishSpeechBlob, fishSpeechFormat])

  useEffect(() => {
    return () => {
      if (speechObjectUrl) {
        URL.revokeObjectURL(speechObjectUrl)
      }
    }
  }, [speechObjectUrl])

  useEffect(() => {
    return () => {
      if (fishSpeechObjectUrl) {
        URL.revokeObjectURL(fishSpeechObjectUrl)
      }
    }
  }, [fishSpeechObjectUrl])

  const handleApiKeyChange = (value: string) => {
    setApiKey(value)
    setStoredApiKey(value)
  }

  const handleClearApiKey = () => {
    setApiKey('')
    setStoredApiKey('')
    showSuccess('API Key 已清空')
  }

  const handleUploadFileChange = (file: File | null) => {
    setUploadFile(file)

    if (!file) {
      return
    }

    setCustomName(getFileBaseName(file.name))
    setReferenceText(getReferenceTextByFileName(file.name))
  }

  const handleFishApiKeyChange = (value: string) => {
    setFishApiKey(value)
    setStoredFishAudioApiKey(value)
  }

  const handleClearFishApiKey = () => {
    setFishApiKey('')
    setStoredFishAudioApiKey('')
    showSuccess('Fish.audio API Key 已清空')
  }

  const guardFishApiKey = () => {
    if (hasFishApiKey) {
      return true
    }

    showWarning('请先填写 Fish.audio API Key')
    return false
  }

  const handleFishVoiceFilesChange = (files: File[] | null) => {
    const nextFiles = files ?? []
    setFishVoiceFiles(nextFiles)

    if (nextFiles.length === 0) {
      return
    }

    const firstFile = nextFiles[0]
    setFishCreateTitle(getFileBaseName(firstFile.name))
    setFishCreateText(getReferenceTextByFileName(firstFile.name))
  }

  const applyFishModelToEditForm = (model: FishAudioModel) => {
    setFishSelectedModel(model)
    setFishEditTitle(model.title ?? '')
    setFishEditDescription(model.description ?? '')
    setFishEditTags(Array.isArray(model.tags) ? model.tags.join(',') : '')
    setFishEditVisibility(model.visibility ?? 'private')
    setFishSpeechReferenceId(model._id)
  }

  const guardApiKey = () => {
    if (hasApiKey) {
      return true
    }

    showWarning('请先填写 API Key')
    return false
  }

  const loadVoices = async () => {
    if (!guardApiKey()) return

    setIsLoadingVoices(true)
    try {
      const result = await siliconflowTtsAdminService.listVoices(trimmedApiKey)
      setVoices(result)
      setSelectedVoiceUris([])
      showSuccess('音色列表已刷新', `共 ${result.length} 个自定义音色`)
    } catch (error) {
      showError('加载音色失败', error instanceof Error ? error.message : undefined)
    } finally {
      setIsLoadingVoices(false)
    }
  }

  const handleUploadVoice = async () => {
    if (!guardApiKey()) return
    if (!uploadFile) {
      showWarning('请选择参考音频文件')
      return
    }
    if (!uploadModel.trim() || !customName.trim() || !referenceText.trim()) {
      showWarning('请补全模型、音色名称和参考文本')
      return
    }

    setIsUploading(true)
    try {
      const result = await siliconflowTtsAdminService.uploadVoice({
        apiKey: trimmedApiKey,
        file: uploadFile,
        model: uploadModel,
        customName,
        text: referenceText,
      })
      setUploadedUri(result.uri)
      setSpeechVoice(result.uri)
      showSuccess('参考音频已上传', result.uri)
      await loadVoices()
    } catch (error) {
      showError('上传失败', error instanceof Error ? error.message : undefined)
    } finally {
      setIsUploading(false)
    }
  }

  const handleDeleteVoice = async () => {
    if (!deleteTarget || !guardApiKey()) return

    try {
      await siliconflowTtsAdminService.deleteVoice(trimmedApiKey, deleteTarget.uri)
      setVoices((current) => current.filter((voice) => voice.uri !== deleteTarget.uri))
      setSelectedVoiceUris((current) => current.filter((uri) => uri !== deleteTarget.uri))
      showSuccess('音色已删除')
    } catch (error) {
      showError('删除失败', error instanceof Error ? error.message : undefined)
    } finally {
      setDeleteTarget(null)
    }
  }

  const toggleVoiceSelection = (uri: string, checked: boolean) => {
    setSelectedVoiceUris((current) => {
      if (checked) {
        return current.includes(uri) ? current : [...current, uri]
      }

      return current.filter((item) => item !== uri)
    })
  }

  const toggleAllVisibleVoices = (checked: boolean) => {
    if (checked) {
      setSelectedVoiceUris(voices.map((voice) => voice.uri))
      return
    }

    setSelectedVoiceUris([])
  }

  const handleBatchDeleteVoices = async () => {
    if (!guardApiKey() || selectedVoiceUris.length === 0) return

    setIsBatchDeleting(true)
    const deletedUris: string[] = []
    const failedNames: string[] = []

    for (const uri of selectedVoiceUris) {
      const voice = voices.find((item) => item.uri === uri)
      try {
        await siliconflowTtsAdminService.deleteVoice(trimmedApiKey, uri)
        deletedUris.push(uri)
      } catch {
        failedNames.push(voice?.customName ?? uri)
      }
    }

    setVoices((current) => current.filter((voice) => !deletedUris.includes(voice.uri)))
    setSelectedVoiceUris((current) => current.filter((uri) => !deletedUris.includes(uri)))
    setIsBatchDeleting(false)
    setIsBatchDeleteOpen(false)

    if (deletedUris.length > 0) {
      showSuccess('批量删除完成', `已删除 ${deletedUris.length} 个音色`)
    }

    if (failedNames.length > 0) {
      showWarning('部分音色删除失败', `失败 ${failedNames.length} 个：${failedNames.slice(0, 3).join('、')}`)
    }
  }

  const handleCreateSpeech = async () => {
    if (!guardApiKey()) return
    if (!speechModel.trim() || !speechInput.trim() || !speechVoice.trim()) {
      showWarning('请补全模型、文本和音色')
      return
    }

    setIsCreatingSpeech(true)
    try {
      const result = await siliconflowTtsAdminService.createSpeech({
        apiKey: trimmedApiKey,
        model: speechModel,
        input: speechInput,
        voice: speechVoice,
        responseFormat: speechFormat,
        sampleRate: typeof sampleRate === 'number' ? sampleRate : undefined,
        stream: streamSpeech,
        speed: typeof speed === 'number' ? speed : undefined,
        gain: typeof gain === 'number' ? gain : undefined,
      })
      setSpeechBlob(result.blob)
      setSpeechTraceId(result.traceId)
      showSuccess('语音已生成')
    } catch (error) {
      showError('生成语音失败', error instanceof Error ? error.message : undefined)
    } finally {
      setIsCreatingSpeech(false)
    }
  }

  const handleTranscribe = async () => {
    if (!guardApiKey()) return
    if (!transcriptionFile) {
      showWarning('请选择要转写的音频文件')
      return
    }

    setIsTranscribing(true)
    try {
      const result = await siliconflowTtsAdminService.transcribe({
        apiKey: trimmedApiKey,
        file: transcriptionFile,
        model: transcriptionModel,
      })
      setTranscriptionText(result.text)
      showSuccess('转写完成')
    } catch (error) {
      showError('转写失败', error instanceof Error ? error.message : undefined)
    } finally {
      setIsTranscribing(false)
    }
  }

  const loadFishModels = async () => {
    if (!guardFishApiKey()) return

    setIsLoadingFishModels(true)
    try {
      const result = await fishAudioAdminService.listModels({
        apiKey: trimmedFishApiKey,
        pageSize: 100,
        pageNumber: 1,
        title: fishSearchTitle,
        self: true,
      })
      setFishModels(result.items)
      setFishTotal(result.total)
      setFishSelectedModelIds([])
      showSuccess('Fish.audio 模型列表已刷新', `共 ${result.total} 个模型`)
    } catch (error) {
      showError('加载 Fish.audio 模型失败', error instanceof Error ? error.message : undefined)
    } finally {
      setIsLoadingFishModels(false)
    }
  }

  const handleCreateFishModel = async () => {
    if (!guardFishApiKey()) return
    if (!fishCreateTitle.trim() || fishVoiceFiles.length === 0) {
      showWarning('请填写模型名称并选择至少一个音频文件')
      return
    }

    setIsCreatingFishModel(true)
    try {
      const texts = fishVoiceFiles.map(() => fishCreateText.trim()).filter(Boolean)
      const model = await fishAudioAdminService.createModel({
        apiKey: trimmedFishApiKey,
        title: fishCreateTitle,
        voices: fishVoiceFiles,
        texts,
        visibility: fishCreateVisibility,
        description: fishCreateDescription,
        tags: splitTags(fishCreateTags),
        enhanceAudioQuality: fishEnhanceAudioQuality,
        generateSample: fishGenerateSample,
      })

      setFishModels((current) => [model, ...current])
      setFishTotal((current) => current + 1)
      applyFishModelToEditForm(model)
      showSuccess('Fish.audio 模型已创建', model._id)
    } catch (error) {
      showError('创建 Fish.audio 模型失败', error instanceof Error ? error.message : undefined)
    } finally {
      setIsCreatingFishModel(false)
    }
  }

  const handleSelectFishModel = async (model: FishAudioModel) => {
    if (!guardFishApiKey()) return

    try {
      const detail = await fishAudioAdminService.getModel(trimmedFishApiKey, model._id)
      applyFishModelToEditForm(detail)
      setFishModels((current) => current.map((item) => (item._id === detail._id ? detail : item)))
      showSuccess('Fish.audio 模型详情已加载')
    } catch (error) {
      showError('获取模型详情失败', error instanceof Error ? error.message : undefined)
    }
  }

  const toggleFishModelSelection = (id: string, checked: boolean) => {
    setFishSelectedModelIds((current) => {
      if (checked) {
        return current.includes(id) ? current : [...current, id]
      }

      return current.filter((item) => item !== id)
    })
  }

  const toggleAllVisibleFishModels = (checked: boolean) => {
    if (checked) {
      setFishSelectedModelIds(fishModels.map((model) => model._id))
      return
    }

    setFishSelectedModelIds([])
  }

  const handleGetFishModelById = async () => {
    if (!guardFishApiKey()) return

    const modelId = fishSearchId.trim()
    if (!modelId) {
      showWarning('请输入 Fish.audio 模型 ID')
      return
    }

    setIsLoadingFishModelById(true)
    try {
      const detail = await fishAudioAdminService.getModel(trimmedFishApiKey, modelId)
      applyFishModelToEditForm(detail)
      setFishModels((current) => {
        const exists = current.some((item) => item._id === detail._id)
        if (exists) {
          return current.map((item) => (item._id === detail._id ? detail : item))
        }
        return [detail, ...current]
      })
      setFishTotal((current) => Math.max(current, fishModels.length + 1))
      showSuccess('Fish.audio 模型已按 ID 加载')
    } catch (error) {
      showError('按 ID 查询模型失败', error instanceof Error ? error.message : undefined)
    } finally {
      setIsLoadingFishModelById(false)
    }
  }

  const handleUpdateFishModel = async () => {
    if (!fishSelectedModel || !guardFishApiKey()) return

    setIsUpdatingFishModel(true)
    try {
      await fishAudioAdminService.updateModel({
        apiKey: trimmedFishApiKey,
        id: fishSelectedModel._id,
        title: fishEditTitle,
        description: fishEditDescription,
        visibility: fishEditVisibility,
        tags: splitTags(fishEditTags),
      })

      const updated = await fishAudioAdminService.getModel(trimmedFishApiKey, fishSelectedModel._id)
      applyFishModelToEditForm(updated)
      setFishModels((current) => current.map((item) => (item._id === updated._id ? updated : item)))
      showSuccess('Fish.audio 模型已更新')
    } catch (error) {
      showError('更新 Fish.audio 模型失败', error instanceof Error ? error.message : undefined)
    } finally {
      setIsUpdatingFishModel(false)
    }
  }

  const handleDeleteFishModel = async () => {
    if (!fishDeleteTarget || !guardFishApiKey()) return

    try {
      await fishAudioAdminService.deleteModel(trimmedFishApiKey, fishDeleteTarget._id)
      setFishModels((current) => current.filter((model) => model._id !== fishDeleteTarget._id))
      setFishSelectedModelIds((current) => current.filter((id) => id !== fishDeleteTarget._id))
      setFishTotal((current) => Math.max(0, current - 1))
      if (fishSelectedModel?._id === fishDeleteTarget._id) {
        setFishSelectedModel(null)
        setFishSpeechReferenceId('')
      }
      showSuccess('Fish.audio 模型已删除')
    } catch (error) {
      showError('删除 Fish.audio 模型失败', error instanceof Error ? error.message : undefined)
    } finally {
      setFishDeleteTarget(null)
    }
  }

  const handleBatchDeleteFishModels = async () => {
    if (!guardFishApiKey() || fishSelectedModelIds.length === 0) return

    setIsFishBatchDeleting(true)
    const deletedIds: string[] = []
    const failedNames: string[] = []

    for (const id of fishSelectedModelIds) {
      const model = fishModels.find((item) => item._id === id)
      try {
        await fishAudioAdminService.deleteModel(trimmedFishApiKey, id)
        deletedIds.push(id)
      } catch {
        failedNames.push(model?.title ?? id)
      }
    }

    setFishModels((current) => current.filter((model) => !deletedIds.includes(model._id)))
    setFishSelectedModelIds((current) => current.filter((id) => !deletedIds.includes(id)))
    setFishTotal((current) => Math.max(0, current - deletedIds.length))
    if (fishSelectedModel && deletedIds.includes(fishSelectedModel._id)) {
      setFishSelectedModel(null)
      setFishSpeechReferenceId('')
    }
    setIsFishBatchDeleting(false)
    setIsFishBatchDeleteOpen(false)

    if (deletedIds.length > 0) {
      showSuccess('Fish.audio 批量删除完成', `已删除 ${deletedIds.length} 个模型`)
    }

    if (failedNames.length > 0) {
      showWarning('部分 Fish.audio 模型删除失败', `失败 ${failedNames.length} 个：${failedNames.slice(0, 3).join('、')}`)
    }
  }

  const handleCreateFishSpeech = async () => {
    if (!guardFishApiKey()) return
    if (!fishSpeechReferenceId.trim() || !fishSpeechText.trim()) {
      showWarning('请填写 Fish.audio 模型 ID 和合成文本')
      return
    }

    setIsCreatingFishSpeech(true)
    try {
      const result = await fishAudioAdminService.createSpeech({
        apiKey: trimmedFishApiKey,
        ttsModel: fishSpeechModel,
        text: fishSpeechText,
        referenceId: fishSpeechReferenceId,
        format: fishSpeechFormat,
        sampleRate: typeof fishSpeechSampleRate === 'number' ? fishSpeechSampleRate : undefined,
        mp3Bitrate: 128,
        latency: fishSpeechLatency,
        temperature: typeof fishSpeechTemperature === 'number' ? fishSpeechTemperature : undefined,
        topP: typeof fishSpeechTopP === 'number' ? fishSpeechTopP : undefined,
        speed: typeof fishSpeechSpeed === 'number' ? fishSpeechSpeed : undefined,
        volume: typeof fishSpeechVolume === 'number' ? fishSpeechVolume : undefined,
      })

      setFishSpeechBlob(result.blob)
      showSuccess('Fish.audio 语音已生成')
    } catch (error) {
      showError('生成 Fish.audio 语音失败', error instanceof Error ? error.message : undefined)
    } finally {
      setIsCreatingFishSpeech(false)
    }
  }

  return (
    <>
      <AppPageShell size="xl">
        <PageHeader
          title="TTS 音色管理"
          subtitle="管理员自用的多供应商 TTS 音色、合成和转写工具"
        />

        <Stack gap="lg">
          <Tabs defaultValue="siliconflow" keepMounted={false}>
            <Tabs.List>
              <Tabs.Tab value="siliconflow" leftSection={<SparklesIcon width={16} height={16} />}>
                SiliconFlow
              </Tabs.Tab>
              <Tabs.Tab value="fish-audio" leftSection={<MicrophoneIcon width={16} height={16} />}>
                Fish.audio
              </Tabs.Tab>
              <Tabs.Tab value="qwen" leftSection={<MicrophoneIcon width={16} height={16} />}>阿里云千问</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="qwen" pt="lg"><QwenTtsVoiceManagement /></Tabs.Panel>
            <Tabs.Panel value="siliconflow" pt="lg">
              <Stack gap="lg">
                <Alert color="blue" variant="light">
                  当前模块直接调用 SiliconFlow 官方接口，API Key 仅保存在当前浏览器。若部署环境被浏览器跨域策略拦截，需要再补一个后端代理。
                </Alert>

                <SurfaceCard p="lg">
                  <Group justify="space-between" align="flex-start" gap="md" mb="lg">
                    <div>
                      <Title order={2}>SiliconFlow 音色管理</Title>
                      <Text size="sm" c="dimmed" mt={4}>
                        管理 SiliconFlow 参考音频、音色合成与语音转文本。
                      </Text>
                    </div>
                    <Button
                      variant="default"
                      onClick={loadVoices}
                      loading={isLoadingVoices}
                      leftSection={<ArrowPathIcon width={16} height={16} />}
                    >
                      刷新音色
                    </Button>
                  </Group>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              <Stack gap="xs">
                <PasswordInput
                  label="SiliconFlow API Key"
                  value={apiKey}
                  onChange={(event) => handleApiKeyChange(event.currentTarget.value)}
                  placeholder="sk-... / Bearer sk-..."
                  description="支持直接粘贴 sk、Bearer sk，或 Authorization: Bearer sk。"
                />
                <Group justify="flex-end">
                  <Button variant="subtle" color="gray" size="xs" onClick={handleClearApiKey} disabled={!apiKey}>
                    清空本地 API Key
                  </Button>
                </Group>
              </Stack>
              <Paper p="md" radius="md" withBorder>
                <Stack gap={6}>
                  <Text fw={600}>接口范围</Text>
                  <Group gap="xs">
                    <Badge variant="light">音色列表</Badge>
                    <Badge variant="light">上传音色</Badge>
                    <Badge variant="light">删除音色</Badge>
                    <Badge variant="light">文本转语音</Badge>
                    <Badge variant="light">语音转文本</Badge>
                  </Group>
                </Stack>
              </Paper>
            </SimpleGrid>
          </SurfaceCard>

          <Tabs defaultValue="voices" keepMounted={false}>
            <Tabs.List>
              <Tabs.Tab value="voices" leftSection={<MicrophoneIcon width={16} height={16} />}>
                音色列表
              </Tabs.Tab>
              <Tabs.Tab value="upload" leftSection={<CloudArrowUpIcon width={16} height={16} />}>
                上传参考音频
              </Tabs.Tab>
              <Tabs.Tab value="speech" leftSection={<PlayIcon width={16} height={16} />}>
                文本转语音
              </Tabs.Tab>
              <Tabs.Tab value="transcription" leftSection={<SparklesIcon width={16} height={16} />}>
                语音转文本
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="voices" pt="lg">
              <SurfaceCard p="lg">
                <Stack gap="md">
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Title order={3}>SiliconFlow 自定义音色</Title>
                      <Text size="sm" c="dimmed" mt={4}>
                        来自 /audio/voice/list，可复制 URI 到文本转语音表单。
                      </Text>
                    </div>
                    <Group gap="sm" justify="flex-end">
                      {selectedVoiceCount > 0 ? (
                        <Button
                          color="red"
                          variant="light"
                          loading={isBatchDeleting}
                          onClick={() => setIsBatchDeleteOpen(true)}
                          leftSection={<TrashIcon width={16} height={16} />}
                        >
                          删除已选 {selectedVoiceCount}
                        </Button>
                      ) : null}
                      <Badge variant="light" color="brand">共 {voices.length} 个</Badge>
                    </Group>
                  </Group>

                  {voices.length === 0 ? (
                    <Paper radius="lg" withBorder p="xl" style={{ borderStyle: 'dashed', textAlign: 'center' }}>
                      <Text c="dimmed">暂无列表数据，填写 API Key 后点击“刷新音色”。</Text>
                    </Paper>
                  ) : (
                    <ScrollArea>
                      <Table verticalSpacing="sm" striped highlightOnHover>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th w={52}>
                              <Checkbox
                                aria-label="选择全部音色"
                                checked={isAllVisibleSelected}
                                indeterminate={!isAllVisibleSelected && isSomeVisibleSelected}
                                onChange={(event) => toggleAllVisibleVoices(event.currentTarget.checked)}
                              />
                            </Table.Th>
                            <Table.Th>名称</Table.Th>
                            <Table.Th>模型</Table.Th>
                            <Table.Th>URI</Table.Th>
                            <Table.Th>参考文本</Table.Th>
                            <Table.Th>操作</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {voices.map((voice) => (
                            <Table.Tr key={voice.uri}>
                              <Table.Td>
                                <Checkbox
                                  aria-label={`选择音色 ${voice.customName}`}
                                  checked={selectedVoiceSet.has(voice.uri)}
                                  onChange={(event) => toggleVoiceSelection(voice.uri, event.currentTarget.checked)}
                                />
                              </Table.Td>
                              <Table.Td>
                                <Text fw={600}>{voice.customName}</Text>
                              </Table.Td>
                              <Table.Td>
                                <Code>{voice.model}</Code>
                              </Table.Td>
                              <Table.Td maw={320}>
                                <Text size="xs" ff="monospace" style={{ wordBreak: 'break-all' }}>
                                  {voice.uri}
                                </Text>
                              </Table.Td>
                              <Table.Td maw={280}>
                                <Text size="sm" lineClamp={2}>{voice.text}</Text>
                              </Table.Td>
                              <Table.Td>
                                <Group gap={4} wrap="nowrap">
                                  <CopyButton value={voice.uri}>
                                    {({ copied, copy }) => (
                                      <Tooltip label={copied ? '已复制' : '复制 URI'} withArrow>
                                        <ActionIcon variant="subtle" color={copied ? 'green' : 'gray'} onClick={copy}>
                                          {copied ? <CheckIcon width={16} height={16} /> : <ClipboardDocumentIcon width={16} height={16} />}
                                        </ActionIcon>
                                      </Tooltip>
                                    )}
                                  </CopyButton>
                                  <Tooltip label="用于生成语音" withArrow>
                                    <ActionIcon variant="subtle" color="brand" onClick={() => setSpeechVoice(voice.uri)}>
                                      <PlayIcon width={16} height={16} />
                                    </ActionIcon>
                                  </Tooltip>
                                  <Tooltip label="删除音色" withArrow>
                                    <ActionIcon variant="subtle" color="red" onClick={() => setDeleteTarget(voice)}>
                                      <TrashIcon width={16} height={16} />
                                    </ActionIcon>
                                  </Tooltip>
                                </Group>
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea>
                  )}
                </Stack>
              </SurfaceCard>
            </Tabs.Panel>

            <Tabs.Panel value="upload" pt="lg">
              <SurfaceCard p="lg">
                <Stack gap="md">
                  <Title order={3}>上传参考音频</Title>
                  <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                    <FileInput
                      label="参考音频文件"
                      value={uploadFile}
                      onChange={handleUploadFileChange}
                      accept="audio/*"
                      placeholder="选择 mp3/wav 等音频"
                      required
                    />
                    <TextInput
                      label="音色模型"
                      value={uploadModel}
                      onChange={(event) => setUploadModel(event.currentTarget.value)}
                      placeholder={DEFAULT_TTS_MODEL}
                      required
                    />
                    <TextInput
                      label="自定义音色名称"
                      value={customName}
                      onChange={(event) => setCustomName(event.currentTarget.value)}
                      placeholder="your-voice-name"
                      required
                    />
                  </SimpleGrid>
                  <Textarea
                    label="参考音频对应文本"
                    value={referenceText}
                    onChange={(event) => setReferenceText(event.currentTarget.value)}
                    minRows={4}
                    placeholder="请输入音频中真实朗读的文本"
                    required
                  />
                  <Group justify="space-between" align="center">
                    {uploadedUri ? (
                      <Text size="sm" c="dimmed">
                        最近上传 URI：<Code>{uploadedUri}</Code>
                      </Text>
                    ) : <Text size="sm" c="dimmed">上传成功后会返回 speech:... URI。</Text>}
                    <Button
                      onClick={handleUploadVoice}
                      loading={isUploading}
                      leftSection={<CloudArrowUpIcon width={16} height={16} />}
                    >
                      上传参考音频
                    </Button>
                  </Group>
                </Stack>
              </SurfaceCard>
            </Tabs.Panel>

            <Tabs.Panel value="speech" pt="lg">
              <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
                <SurfaceCard p="lg">
                  <Stack gap="md">
                    <Title order={3}>创建文本转语音</Title>
                    <TextInput
                      label="TTS 模型"
                      value={speechModel}
                      onChange={(event) => setSpeechModel(event.currentTarget.value)}
                      required
                    />
                    <TextInput
                      label="音色 Voice"
                      value={speechVoice}
                      onChange={(event) => setSpeechVoice(event.currentTarget.value)}
                      placeholder={`${DEFAULT_TTS_VOICE} 或 speech:...`}
                      required
                    />
                    <Textarea
                      label="输入文本"
                      value={speechInput}
                      onChange={(event) => setSpeechInput(event.currentTarget.value)}
                      minRows={7}
                      required
                    />
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                      <Select
                        label="输出格式"
                        value={speechFormat}
                        onChange={(value) => setSpeechFormat((value ?? 'mp3') as CreateSpeechInput['responseFormat'])}
                        data={speechFormatOptions}
                      />
                      <NumberInput
                        label="采样率"
                        value={sampleRate}
                        onChange={setSampleRate}
                        min={8000}
                        max={48000}
                        step={1000}
                      />
                      <NumberInput
                        label="语速"
                        value={speed}
                        onChange={setSpeed}
                        min={0.25}
                        max={4}
                        step={0.05}
                      />
                      <NumberInput
                        label="增益"
                        value={gain}
                        onChange={setGain}
                        min={-10}
                        max={10}
                        step={0.5}
                      />
                    </SimpleGrid>
                    <Switch
                      label="开启流式响应参数"
                      checked={streamSpeech}
                      onChange={(event) => setStreamSpeech(event.currentTarget.checked)}
                    />
                    <Button
                      onClick={handleCreateSpeech}
                      loading={isCreatingSpeech}
                      leftSection={<PlayIcon width={16} height={16} />}
                    >
                      生成语音
                    </Button>
                  </Stack>
                </SurfaceCard>

                <SurfaceCard p="lg">
                  <Stack gap="md">
                    <Title order={3}>生成结果</Title>
                    {speechObjectUrl ? (
                      <>
                        <Paper p="md" radius="md" withBorder>
                          <audio src={speechObjectUrl} controls style={{ width: '100%' }} />
                        </Paper>
                        <Group gap="sm">
                          <Button
                            variant="default"
                            onClick={() => {
                              if (speechBlob) {
                                downloadBlob(speechBlob, `siliconflow-speech.${speechFormat}`)
                              }
                            }}
                            leftSection={<ArrowDownTrayIcon width={16} height={16} />}
                          >
                            下载音频
                          </Button>
                          {speechTraceId ? <Badge variant="light">Trace: {speechTraceId}</Badge> : null}
                        </Group>
                      </>
                    ) : (
                      <Paper radius="lg" withBorder p="xl" style={{ borderStyle: 'dashed', textAlign: 'center' }}>
                        <Text c="dimmed">生成后可在这里试听和下载音频。</Text>
                      </Paper>
                    )}
                  </Stack>
                </SurfaceCard>
              </SimpleGrid>
            </Tabs.Panel>

            <Tabs.Panel value="transcription" pt="lg">
              <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
                <SurfaceCard p="lg">
                  <Stack gap="md">
                    <Title order={3}>创建语音转文本</Title>
                    <FileInput
                      label="音频文件"
                      value={transcriptionFile}
                      onChange={setTranscriptionFile}
                      accept="audio/*"
                      placeholder="选择要转写的音频"
                      description="官方限制：音频不超过 1 小时，文件不超过 50MB。"
                      required
                    />
                    <Select
                      label="ASR 模型"
                      value={transcriptionModel}
                      onChange={(value) => setTranscriptionModel((value ?? 'FunAudioLLM/SenseVoiceSmall') as TranscriptionInput['model'])}
                      data={transcriptionModelOptions}
                    />
                    <Button
                      onClick={handleTranscribe}
                      loading={isTranscribing}
                      leftSection={<SparklesIcon width={16} height={16} />}
                    >
                      开始转写
                    </Button>
                  </Stack>
                </SurfaceCard>

                <SurfaceCard p="lg">
                  <Stack gap="md">
                    <Group justify="space-between" align="center">
                      <Title order={3}>转写结果</Title>
                      <CopyButton value={transcriptionText}>
                        {({ copied, copy }) => (
                          <Button
                            variant="default"
                            onClick={copy}
                            disabled={!transcriptionText}
                            leftSection={copied ? <CheckIcon width={16} height={16} /> : <ClipboardDocumentIcon width={16} height={16} />}
                          >
                            {copied ? '已复制' : '复制文本'}
                          </Button>
                        )}
                      </CopyButton>
                    </Group>
                    <Textarea
                      value={transcriptionText}
                      onChange={(event) => setTranscriptionText(event.currentTarget.value)}
                      minRows={12}
                      placeholder="转写完成后会显示在这里"
                    />
                  </Stack>
                </SurfaceCard>
              </SimpleGrid>
            </Tabs.Panel>
          </Tabs>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="fish-audio" pt="lg">
              <SurfaceCard p="lg">
            <Stack gap="lg">
              <Group justify="space-between" align="flex-start" gap="md">
                <div>
                  <Title order={2}>Fish.audio 音色管理</Title>
                  <Text size="sm" c="dimmed" mt={4}>
                    管理 Fish.audio TTS 模型，并使用模型 ID 发起 v1/tts 语音合成。
                  </Text>
                </div>
                <Button
                  variant="default"
                  onClick={loadFishModels}
                  loading={isLoadingFishModels}
                  leftSection={<ArrowPathIcon width={16} height={16} />}
                >
                  刷新 Fish 模型
                </Button>
              </Group>

              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                <Stack gap="xs">
                  <PasswordInput
                    label="Fish.audio API Key"
                    value={fishApiKey}
                    onChange={(event) => handleFishApiKeyChange(event.currentTarget.value)}
                    placeholder="sk-... / Bearer sk-..."
                    description="用于 api.fish.audio Authorization: Bearer。"
                  />
                  <Group justify="flex-end">
                    <Button variant="subtle" color="gray" size="xs" onClick={handleClearFishApiKey} disabled={!fishApiKey}>
                      清空 Fish.audio API Key
                    </Button>
                  </Group>
                </Stack>
                <Paper p="md" radius="md" withBorder>
                  <Stack gap={6}>
                    <Text fw={600}>接口范围</Text>
                    <Group gap="xs">
                      <Badge variant="light">模型列表</Badge>
                      <Badge variant="light">创建模型</Badge>
                      <Badge variant="light">模型详情</Badge>
                      <Badge variant="light">更新模型</Badge>
                      <Badge variant="light">删除模型</Badge>
                      <Badge variant="light">文本转语音</Badge>
                    </Group>
                  </Stack>
                </Paper>
              </SimpleGrid>

              <Tabs defaultValue="fish-models" keepMounted={false}>
                <Tabs.List>
                  <Tabs.Tab value="fish-models" leftSection={<MicrophoneIcon width={16} height={16} />}>
                    Fish 模型列表
                  </Tabs.Tab>
                  <Tabs.Tab value="fish-create" leftSection={<CloudArrowUpIcon width={16} height={16} />}>
                    创建模型
                  </Tabs.Tab>
                  <Tabs.Tab value="fish-edit" leftSection={<ClipboardDocumentIcon width={16} height={16} />}>
                    详情与更新
                  </Tabs.Tab>
                  <Tabs.Tab value="fish-speech" leftSection={<PlayIcon width={16} height={16} />}>
                    Fish 文本转语音
                  </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="fish-models" pt="lg">
                  <Stack gap="md">
                    <Group justify="space-between" align="flex-end">
                      <TextInput
                        label="按标题搜索"
                        value={fishSearchTitle}
                        onChange={(event) => setFishSearchTitle(event.currentTarget.value)}
                        placeholder="可选"
                      />
                      <TextInput
                        label="按 ID 查询"
                        value={fishSearchId}
                        onChange={(event) => setFishSearchId(event.currentTarget.value)}
                        placeholder="Fish.audio 模型 ID"
                        style={{ minWidth: 280 }}
                      />
                      <Button
                        variant="default"
                        onClick={handleGetFishModelById}
                        loading={isLoadingFishModelById}
                        leftSection={<MicrophoneIcon width={16} height={16} />}
                      >
                        查询 ID
                      </Button>
                      {fishSelectedModelCount > 0 ? (
                        <Button
                          color="red"
                          variant="light"
                          loading={isFishBatchDeleting}
                          onClick={() => setIsFishBatchDeleteOpen(true)}
                          leftSection={<TrashIcon width={16} height={16} />}
                        >
                          删除已选 {fishSelectedModelCount}
                        </Button>
                      ) : null}
                      <Badge variant="light" color="brand">总计 {fishTotal} 个</Badge>
                    </Group>

                    {fishModels.length === 0 ? (
                      <Paper radius="lg" withBorder p="xl" style={{ borderStyle: 'dashed', textAlign: 'center' }}>
                        <Text c="dimmed">暂无 Fish.audio 模型数据，填写 API Key 后点击刷新。</Text>
                      </Paper>
                    ) : (
                      <ScrollArea>
                        <Table verticalSpacing="sm" striped highlightOnHover>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th w={52}>
                                <Checkbox
                                  aria-label="选择全部 Fish.audio 模型"
                                  checked={isAllVisibleFishSelected}
                                  indeterminate={!isAllVisibleFishSelected && isSomeVisibleFishSelected}
                                  onChange={(event) => toggleAllVisibleFishModels(event.currentTarget.checked)}
                                />
                              </Table.Th>
                              <Table.Th>名称</Table.Th>
                              <Table.Th>ID</Table.Th>
                              <Table.Th>状态</Table.Th>
                              <Table.Th>可见性</Table.Th>
                              <Table.Th>标签</Table.Th>
                              <Table.Th>操作</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {fishModels.map((model) => (
                              <Table.Tr key={model._id}>
                                <Table.Td>
                                  <Checkbox
                                    aria-label={`选择 Fish.audio 模型 ${model.title}`}
                                    checked={fishSelectedModelSet.has(model._id)}
                                    onChange={(event) => toggleFishModelSelection(model._id, event.currentTarget.checked)}
                                  />
                                </Table.Td>
                                <Table.Td>
                                  <Text fw={600}>{model.title}</Text>
                                  <Text size="xs" c="dimmed">{model.type}</Text>
                                </Table.Td>
                                <Table.Td maw={260}>
                                  <Text size="xs" ff="monospace" style={{ wordBreak: 'break-all' }}>{model._id}</Text>
                                </Table.Td>
                                <Table.Td>
                                  <Badge variant="light" color={model.state === 'trained' ? 'green' : model.state === 'failed' ? 'red' : 'yellow'}>
                                    {model.state}
                                  </Badge>
                                </Table.Td>
                                <Table.Td>{model.visibility}</Table.Td>
                                <Table.Td maw={240}>
                                  <Text size="sm" lineClamp={2}>{model.tags?.join(', ') || '-'}</Text>
                                </Table.Td>
                                <Table.Td>
                                  <Group gap={4} wrap="nowrap">
                                    <CopyButton value={model._id}>
                                      {({ copied, copy }) => (
                                        <Tooltip label={copied ? '已复制' : '复制模型 ID'} withArrow>
                                          <ActionIcon variant="subtle" color={copied ? 'green' : 'gray'} onClick={copy}>
                                            {copied ? <CheckIcon width={16} height={16} /> : <ClipboardDocumentIcon width={16} height={16} />}
                                          </ActionIcon>
                                        </Tooltip>
                                      )}
                                    </CopyButton>
                                    <Tooltip label="加载详情" withArrow>
                                      <ActionIcon variant="subtle" color="brand" onClick={() => handleSelectFishModel(model)}>
                                        <MicrophoneIcon width={16} height={16} />
                                      </ActionIcon>
                                    </Tooltip>
                                    <Tooltip label="用于生成语音" withArrow>
                                      <ActionIcon variant="subtle" color="brand" onClick={() => setFishSpeechReferenceId(model._id)}>
                                        <PlayIcon width={16} height={16} />
                                      </ActionIcon>
                                    </Tooltip>
                                    <Tooltip label="删除模型" withArrow>
                                      <ActionIcon variant="subtle" color="red" onClick={() => setFishDeleteTarget(model)}>
                                        <TrashIcon width={16} height={16} />
                                      </ActionIcon>
                                    </Tooltip>
                                  </Group>
                                </Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </ScrollArea>
                    )}
                  </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="fish-create" pt="lg">
                  <Stack gap="md">
                    <Title order={3}>创建 Fish.audio TTS 模型</Title>
                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                      <FileInput
                        label="训练音频文件"
                        value={fishVoiceFiles}
                        onChange={handleFishVoiceFilesChange}
                        accept="audio/*"
                        placeholder="选择一个或多个音频"
                        multiple
                        required
                      />
                      <TextInput
                        label="模型名称"
                        value={fishCreateTitle}
                        onChange={(event) => setFishCreateTitle(event.currentTarget.value)}
                        placeholder="默认取第一个音频文件名"
                        required
                      />
                      <Select
                        label="可见性"
                        value={fishCreateVisibility}
                        onChange={(value) => setFishCreateVisibility((value ?? 'private') as FishAudioVisibility)}
                        data={fishVisibilityOptions}
                      />
                      <TextInput
                        label="标签"
                        value={fishCreateTags}
                        onChange={(event) => setFishCreateTags(event.currentTarget.value)}
                        placeholder="movie,en,admin"
                        description="多个标签用英文逗号分隔。"
                      />
                    </SimpleGrid>
                    <Textarea
                      label="音频对应文本"
                      value={fishCreateText}
                      onChange={(event) => setFishCreateText(event.currentTarget.value)}
                      minRows={4}
                      placeholder="选择文件后会按文件名自动填充中文/英文参考文本"
                    />
                    <Textarea
                      label="模型描述"
                      value={fishCreateDescription}
                      onChange={(event) => setFishCreateDescription(event.currentTarget.value)}
                      minRows={3}
                      placeholder="可选"
                    />
                    <Group gap="lg">
                      <Switch
                        label="增强音频质量"
                        checked={fishEnhanceAudioQuality}
                        onChange={(event) => setFishEnhanceAudioQuality(event.currentTarget.checked)}
                      />
                      <Switch
                        label="生成默认示例"
                        checked={fishGenerateSample}
                        onChange={(event) => setFishGenerateSample(event.currentTarget.checked)}
                      />
                    </Group>
                    <Group justify="flex-end">
                      <Button
                        onClick={handleCreateFishModel}
                        loading={isCreatingFishModel}
                        leftSection={<CloudArrowUpIcon width={16} height={16} />}
                      >
                        创建 Fish 模型
                      </Button>
                    </Group>
                  </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="fish-edit" pt="lg">
                  <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
                    <Stack gap="md">
                      <Title order={3}>模型详情</Title>
                      {fishSelectedModel ? (
                        <Paper p="md" radius="md" withBorder>
                          <Stack gap="xs">
                            <Text fw={700}>{fishSelectedModel.title}</Text>
                            <Text size="xs" ff="monospace" style={{ wordBreak: 'break-all' }}>{fishSelectedModel._id}</Text>
                            <Group gap="xs">
                              <Badge variant="light">{fishSelectedModel.state}</Badge>
                              <Badge variant="light">{fishSelectedModel.visibility}</Badge>
                              <Badge variant="light">{fishSelectedModel.train_mode ?? '-'}</Badge>
                            </Group>
                            <Text size="sm" c="dimmed">{fishSelectedModel.description || '暂无描述'}</Text>
                          </Stack>
                        </Paper>
                      ) : (
                        <Paper radius="lg" withBorder p="xl" style={{ borderStyle: 'dashed', textAlign: 'center' }}>
                          <Text c="dimmed">请先在模型列表中点击“加载详情”。</Text>
                        </Paper>
                      )}
                    </Stack>

                    <Stack gap="md">
                      <Title order={3}>更新模型元信息</Title>
                      <TextInput
                        label="模型名称"
                        value={fishEditTitle}
                        onChange={(event) => setFishEditTitle(event.currentTarget.value)}
                        disabled={!fishSelectedModel}
                      />
                      <Select
                        label="可见性"
                        value={fishEditVisibility}
                        onChange={(value) => setFishEditVisibility((value ?? 'private') as FishAudioVisibility)}
                        data={fishVisibilityOptions}
                        disabled={!fishSelectedModel}
                      />
                      <TextInput
                        label="标签"
                        value={fishEditTags}
                        onChange={(event) => setFishEditTags(event.currentTarget.value)}
                        disabled={!fishSelectedModel}
                      />
                      <Textarea
                        label="描述"
                        value={fishEditDescription}
                        onChange={(event) => setFishEditDescription(event.currentTarget.value)}
                        minRows={4}
                        disabled={!fishSelectedModel}
                      />
                      <Button onClick={handleUpdateFishModel} loading={isUpdatingFishModel} disabled={!fishSelectedModel}>
                        保存更新
                      </Button>
                    </Stack>
                  </SimpleGrid>
                </Tabs.Panel>

                <Tabs.Panel value="fish-speech" pt="lg">
                  <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
                    <Stack gap="md">
                      <Title order={3}>Fish.audio 文本转语音</Title>
                      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                        <Select
                          label="TTS 模型"
                          value={fishSpeechModel}
                          onChange={(value) => setFishSpeechModel((value ?? 's2-pro') as FishAudioTtsModel)}
                          data={fishTtsModelOptions}
                        />
                        <Select
                          label="延迟策略"
                          value={fishSpeechLatency}
                          onChange={(value) => setFishSpeechLatency((value ?? 'normal') as FishAudioLatency)}
                          data={fishLatencyOptions}
                        />
                      </SimpleGrid>
                      <TextInput
                        label="Reference ID"
                        value={fishSpeechReferenceId}
                        onChange={(event) => setFishSpeechReferenceId(event.currentTarget.value)}
                        placeholder="Fish.audio 模型 ID"
                        required
                      />
                      <Textarea
                        label="合成文本"
                        value={fishSpeechText}
                        onChange={(event) => setFishSpeechText(event.currentTarget.value)}
                        minRows={7}
                        required
                      />
                      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                        <Select
                          label="输出格式"
                          value={fishSpeechFormat}
                          onChange={(value) => setFishSpeechFormat((value ?? 'mp3') as FishAudioFormat)}
                          data={speechFormatOptions}
                        />
                        <NumberInput
                          label="采样率"
                          value={fishSpeechSampleRate}
                          onChange={setFishSpeechSampleRate}
                          min={8000}
                          max={48000}
                          step={1000}
                        />
                        <NumberInput
                          label="Temperature"
                          value={fishSpeechTemperature}
                          onChange={setFishSpeechTemperature}
                          min={0}
                          max={1}
                          step={0.05}
                        />
                        <NumberInput
                          label="Top P"
                          value={fishSpeechTopP}
                          onChange={setFishSpeechTopP}
                          min={0}
                          max={1}
                          step={0.05}
                        />
                        <NumberInput
                          label="语速"
                          value={fishSpeechSpeed}
                          onChange={setFishSpeechSpeed}
                          min={0.5}
                          max={2}
                          step={0.05}
                        />
                        <NumberInput
                          label="音量"
                          value={fishSpeechVolume}
                          onChange={setFishSpeechVolume}
                          min={-10}
                          max={10}
                          step={0.5}
                        />
                      </SimpleGrid>
                      <Button
                        onClick={handleCreateFishSpeech}
                        loading={isCreatingFishSpeech}
                        leftSection={<PlayIcon width={16} height={16} />}
                      >
                        生成 Fish.audio 语音
                      </Button>
                    </Stack>

                    <Stack gap="md">
                      <Title order={3}>生成结果</Title>
                      {fishSpeechObjectUrl ? (
                        <>
                          <Paper p="md" radius="md" withBorder>
                            <audio src={fishSpeechObjectUrl} controls style={{ width: '100%' }} />
                          </Paper>
                          <Button
                            variant="default"
                            onClick={() => {
                              if (fishSpeechBlob) {
                                downloadBlob(fishSpeechBlob, `fish-audio-speech.${fishSpeechFormat}`)
                              }
                            }}
                            leftSection={<ArrowDownTrayIcon width={16} height={16} />}
                          >
                            下载音频
                          </Button>
                        </>
                      ) : (
                        <Paper radius="lg" withBorder p="xl" style={{ borderStyle: 'dashed', textAlign: 'center' }}>
                          <Text c="dimmed">生成后可在这里试听和下载 Fish.audio 音频。</Text>
                        </Paper>
                      )}
                    </Stack>
                  </SimpleGrid>
                </Tabs.Panel>
              </Tabs>
            </Stack>
              </SurfaceCard>
            </Tabs.Panel>
          </Tabs>

          <Divider />
          <Text size="xs" c="dimmed">
            官方接口依据 SiliconFlow 与 Fish.audio 文档：音色/模型管理、文本转语音与语音转文本。
          </Text>
        </Stack>
      </AppPageShell>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteVoice}
        title="删除 SiliconFlow 音色"
        message={`确定删除 ${deleteTarget?.customName ?? '该音色'} 吗？此操作会调用 SiliconFlow 删除接口。`}
        type="danger"
        confirmText="删除"
        cancelText="取消"
      />

      <ConfirmDialog
        isOpen={isBatchDeleteOpen}
        onClose={() => setIsBatchDeleteOpen(false)}
        onConfirm={handleBatchDeleteVoices}
        title="批量删除 SiliconFlow 音色"
        message={`确定删除已选的 ${selectedVoiceCount} 个音色吗？此操作会逐个调用 SiliconFlow 删除接口。`}
        type="danger"
        confirmText="批量删除"
        cancelText="取消"
      />

      <ConfirmDialog
        isOpen={fishDeleteTarget !== null}
        onClose={() => setFishDeleteTarget(null)}
        onConfirm={handleDeleteFishModel}
        title="删除 Fish.audio 模型"
        message={`确定删除 ${fishDeleteTarget?.title ?? '该模型'} 吗？此操作会调用 Fish.audio 删除接口。`}
        type="danger"
        confirmText="删除"
        cancelText="取消"
      />

      <ConfirmDialog
        isOpen={isFishBatchDeleteOpen}
        onClose={() => setIsFishBatchDeleteOpen(false)}
        onConfirm={handleBatchDeleteFishModels}
        title="批量删除 Fish.audio 模型"
        message={`确定删除已选的 ${fishSelectedModelCount} 个模型吗？此操作会逐个调用 Fish.audio 删除接口。`}
        type="danger"
        confirmText="批量删除"
        cancelText="取消"
      />
    </>
  )
}
