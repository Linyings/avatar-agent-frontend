import { useEffect, useMemo, useRef, useState } from 'react'
import { estimateGeneralDuration, GENERAL_DURATION_HINT } from '@/features/projects/services/material/generalDurationEstimate'
import TimelineReviewModal from '@/features/projects/components/timelineReview/TimelineReviewModal'
import { needsTimelineReview } from '@/features/projects/components/timelineReview/reviewWorkflow'
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Code,
  FileButton,
  Grid,
  Group,
  Loader,
  Modal,
  Paper,
  Progress,
  ScrollArea,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Switch,
  Text,
  Textarea,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import {
  ArrowLeftIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  Cog6ToothIcon,
  FilmIcon,
  PauseIcon,
  PlayIcon,
  ScissorsIcon,
  XMarkIcon,
} from '@/shared/icons/tabler'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useProject } from '../../../../contexts/ProjectContext'
import { LANGUAGE_OPTIONS } from '../../../../constants/videoConfig.constants'
import { NO_BACKGROUND_MUSIC_VALUE } from '../../../../constants/backgroundMusic.constants'
import type { ScriptItem } from '@/shared/types'
import CapcutExportModal from '@/shared/components/ui/CapcutExportModal'
import FrameWorkflowOptionFields, {
  type FrameWorkflowOptionValue,
} from '@/features/projects/components/workflow/FrameWorkflowOptionFields'
import {
  WorkflowProgressModal,
  type WorkflowProgressStatus,
} from '@/features/projects/components/workflow/WorkflowProgressModal'
import { getDesktopFallbackRecommendation } from '@/features/projects/components/workflow/desktopFallback'
import { desktopAuthBridge } from '@/features/auth/services/desktopAuthBridge'
import { buildFrameWorkflowProgressItems } from './frameWorkflowProgressItems'
import { useI18n } from '@/shared/i18n/I18nProvider'
import { useToast } from '@/shared/contexts/ToastContext'
import { downloadBlob } from '@/shared/utils/browserDownload'
import { isAbortError } from '@/shared/utils/abort'
import { getWorkflowClientInstanceId } from '@/shared/workflowRuns/identity'
import { WorkflowBlockedError, WorkflowRunClient } from '@/shared/workflowRuns/workflowRunClient'
import {
  createWorkflowCheckpointStore,
  type WorkflowCheckpointStep,
} from '@/shared/workflowRuns/workflowCheckpointStore'
import {
  FRAME_INFERENCE_DEFAULT_N_FRAMES,
  resolveFrameInferenceMaxDecisions,
  type FrameInferenceConfig,
  type FrameInferencePipelineResult,
} from '../../../../services/material/frameInferencePipelineService'
import { localAssetStorageService } from '@/shared/services/localAssetStorageService'
import {
  buildFrameCapcutExportPayload,
  exportToCapcut,
  type ExportProgress,
  type ExtraAudioAsset,
} from '@/features/projects/services/capcut'
import {
  buildRecoverableFrameWorkflowRun,
  getFrameWorkflowResult,
  hydrateRecoveredFrameWorkflowRunWithFiles,
  inspectFrameWorkflowRecoveryAssets,
  resetFrameWorkflowRunFromStep,
  runFrameWorkflow,
  type FrameDebugRun,
  type FrameWorkflowRecoveryAssetState,
  type FrameWorkflowRecoveryBuild,
  type GenerateNarrationScriptOutput,
} from '@/features/projects/workflow/frame'
import type {
  AnchoredNarrationDraftItem,
} from '@/features/projects/services/scriptGenerationServiceV2'
import {
  applyNarrationTextEdits,
  hasAnchoredNarrationDraftItems,
} from '@/features/projects/workflow/frame/services/frameNarrationReview'
import {
  getFrameWorkflowDisplayRun,
  getFrameWorkflowDisplayStepState,
  getFrameWorkflowProgress,
  getFrameWorkflowResumeStepId,
  isFrameWorkflowStepComplete,
} from '@/features/projects/workflow/frame'
import {
  createFrameWorkflowInputHash,
  frameWorkflowServerStepId,
  FrameWorkflowRunLifecycle,
  resolveFrameWorkflowInputHash,
  shouldResumeRemoteWorkflowRun,
  shouldRegisterWorkflowStep,
} from '@/features/projects/workflow/frame/runner/workflowRunLifecycle'
import {
  frameWorkflowSteps,
  type FrameDebugStepId,
  type FrameDebugStepRecord,
  type FrameWorkflowContext,
} from '@/features/projects/workflow/frame'
import {
  buildAutoProjectNameUpdate,
  deriveProjectNameFromFileName,
  getEditableProjectVideoName,
  isAutoNamedProject,
} from '../../../../utils/projectNaming'
import ProjectService from '@/features/projects/services/projectService'

const MB = 1024 * 1024
const GB = 1024 * MB
const MAX_VIDEO_COUNT = 10
const MAX_TOTAL_SIZE = 2 * GB
const MAX_TOTAL_SIZE_LABEL = '2 GB'
const DEFAULT_SELECTION_RATIO = 0.3
const DEFAULT_NARRATION_RATIO = 0.5
const NARRATION_CHARACTERS_PER_MINUTE = 400
const WORKSPACE_PANEL_HEIGHT = 'clamp(620px, calc(100dvh - 210px), 860px)'

const compactFieldStyles = {
  input: {
    background: 'var(--app-input-bg)',
    borderColor: 'var(--app-input-border)',
    color: 'var(--app-text)',
    minHeight: 44,
  },
  label: { color: 'var(--app-text)', fontWeight: 700, marginBottom: 8 },
}

const reviewScriptSwitchStyles = {
  root: {
    padding: '12px 14px',
    border: '1px solid var(--app-input-border)',
    borderRadius: 10,
    background: 'linear-gradient(180deg, var(--app-surface-elevated), var(--app-input-bg))',
  },
  body: {
    alignItems: 'center',
    gap: 14,
  },
  track: {
    width: 42,
    minWidth: 42,
    height: 24,
    borderColor: 'var(--app-brand-soft-border-strong)',
    cursor: 'pointer',
  },
  thumb: {
    width: 18,
    height: 18,
  },
  label: {
    color: 'var(--app-text)',
    fontSize: 15,
    fontWeight: 800,
    lineHeight: 1.25,
    cursor: 'pointer',
  },
  description: {
    marginTop: 3,
    color: 'var(--app-muted)',
    fontSize: 13,
    lineHeight: 1.45,
  },
}

const clampRatio = (value: number, min = 0) => Math.min(1, Math.max(min, value))

const savedRatio = (value: unknown, fallback: number, min = 0) => (
  typeof value === 'number' && Number.isFinite(value)
    ? clampRatio(value, min)
    : fallback
)

const deriveEstimatedNarrationCharacters = (outputDurationMs: number, narrationRatio: number) => (
  Math.max(0, Math.ceil((Math.max(0, outputDurationMs) / 60_000) * clampRatio(narrationRatio) * NARRATION_CHARACTERS_PER_MINUTE))
)

const getSavedFrameInferenceConfig = (metadata: Record<string, unknown> | undefined) => {
  const config = metadata?.frame_inference_config
  return config && typeof config === 'object' ? config as Record<string, unknown> : null
}

const resolveSavedSelectionRatio = (config: Record<string, unknown> | null) => savedRatio(
  config?.selection_ratio ?? config?.selectionRatio,
  DEFAULT_SELECTION_RATIO,
  0.05,
)

const resolveSavedNarrationRatio = (config: Record<string, unknown> | null) => {
  const directValue = config?.narration_ratio ?? config?.narrationRatio
  if (typeof directValue === 'number' && Number.isFinite(directValue)) {
    return clampRatio(directValue)
  }

  const originalValue = config?.original_ratio ?? config?.originalRatio
  if (typeof originalValue === 'number' && Number.isFinite(originalValue)) {
    const normalizedOriginalRatio = originalValue > 1 ? originalValue / 100 : originalValue
    return clampRatio(1 - normalizedOriginalRatio)
  }

  return DEFAULT_NARRATION_RATIO
}

const optionalString = (value: unknown) => typeof value === 'string' ? value : null

const optionalNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null

const normalizeSavedBackgroundMusic = (value: unknown) => {
  const backgroundMusic = optionalString(value)
  if (
    backgroundMusic === NO_BACKGROUND_MUSIC_VALUE
    || backgroundMusic === '选择背景音乐'
    || backgroundMusic === '閫夋嫨鑳屾櫙闊充箰'
  ) {
    return NO_BACKGROUND_MUSIC_VALUE
  }
  return backgroundMusic ?? NO_BACKGROUND_MUSIC_VALUE
}

const deriveFrameWorkflowOptionValue = (
  savedConfig: Record<string, unknown> | null,
): FrameWorkflowOptionValue => {
  const backgroundMusic = normalizeSavedBackgroundMusic(savedConfig?.background_music)
  const hasBackgroundMusic = backgroundMusic !== NO_BACKGROUND_MUSIC_VALUE

  return {
    narrationStyleId: optionalString(savedConfig?.narration_style_id),
    narrationStyleTitle: optionalString(savedConfig?.narration_style_title),
    voice: optionalString(savedConfig?.voice),
    voiceName: optionalString(savedConfig?.voice_name),
    backgroundMusic,
    backgroundMusicId: hasBackgroundMusic ? optionalNumber(savedConfig?.background_music_id) : null,
    backgroundMusicUrl: hasBackgroundMusic ? optionalString(savedConfig?.background_music_url) : null,
  }
}

const getFileKey = (file: File) => `${file.name}-${file.size}-${file.lastModified}`

const dedupeFiles = (files: File[]) => {
  const seen = new Set<string>()
  return files.filter((file) => {
    const key = getFileKey(file)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const formatFileSize = (size: number) => {
  if (size >= 1024 * 1024 * 1024) return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

const formatTotalSize = (files: File[]) => {
  const total = files.reduce((sum, file) => sum + file.size, 0)
  if (total === 0) return '0 MB'
  return formatFileSize(total)
}

const formatVideoDuration = (duration?: number) => {
  if (!duration || !Number.isFinite(duration)) return null
  const totalSeconds = Math.max(0, Math.round(duration))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const paddedSeconds = String(seconds).padStart(2, '0')

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`
  }

  return `${minutes}:${paddedSeconds}`
}

const getPreviewLabel = (result: FrameInferencePipelineResult | null) => {
  if (!result) return '暂无结果'
  return [
    `字幕 ${result.subtitleResult.segments.length} 段`,
    `决策 ${result.decision.decisions.length} 项`,
    `视觉分析 ${result.analyses.length} 项`,
  ].join(' · ')
}

const checkpointStatusForFrameStep = (status: FrameDebugStepRecord['status']) => {
  if (status === 'success' || status === 'skipped') return 'succeeded' as const
  if (status === 'running') return 'running' as const
  if (status === 'cancelled' || status === 'interrupted') return 'interrupted' as const
  if (status === 'error') return 'failed' as const
  return null
}

const checkpointStepsFromRun = (run: FrameDebugRun): WorkflowCheckpointStep[] => (
  Object.values(run.records)
    .flatMap((record): WorkflowCheckpointStep[] => {
      if (!record) return []
      const status = checkpointStatusForFrameStep(record.status)
      if (!status) return []
      const percentage = record.progress?.percentage
      return [{
        stepId: record.id,
        status,
        ...(record.startedAt ? { startedAt: record.startedAt } : {}),
        ...(record.completedAt ? { completedAt: record.completedAt } : {}),
        ...(typeof percentage === 'number' && Number.isFinite(percentage)
          ? { progress: Math.max(0, Math.min(100, percentage)) }
          : {}),
      }]
    })
)

const workflowStepStatusColor: Record<string, string> = {
  idle: 'gray',
  running: 'blue',
  success: 'green',
  error: 'red',
  skipped: 'yellow',
  cancelled: 'yellow',
  interrupted: 'yellow',
  'waiting-review': 'yellow',
}

const workflowStepStatusLabel: Record<string, string> = {
  idle: '等待',
  running: '执行中',
  success: '完成',
  error: '失败',
  skipped: '跳过',
  cancelled: '已停止',
  interrupted: '上次中断，将重新执行',
  'waiting-review': '待审核',
}

const mainWorkflowSteps = frameWorkflowSteps

const hasIncompleteWorkflowSteps = (run: FrameDebugRun | null) => (
  mainWorkflowSteps.some(step => !isFrameWorkflowStepComplete(run?.records[step.id]))
)

const getNarrationDraftOutput = (run: FrameDebugRun | null): GenerateNarrationScriptOutput | null => {
  const output = run?.records['generate-narration-script']?.output
  return output && typeof output === 'object' ? output as GenerateNarrationScriptOutput : null
}

const getNarrationDraftItemsFromRun = (run: FrameDebugRun | null): AnchoredNarrationDraftItem[] => {
  const output = getNarrationDraftOutput(run)
  const items = output?.approvedDraftItems?.length
    ? output.approvedDraftItems
    : output?.draftItems ?? []
  return hasAnchoredNarrationDraftItems(items) ? items.map(item => ({ ...item })) : []
}

const isNarrationReviewPending = (run: FrameDebugRun | null) => {
  const output = getNarrationDraftOutput(run)
  if (!output?.reviewRequired || !hasAnchoredNarrationDraftItems(output.draftItems)) return false
  if (output.approvedDraftItems?.length) return false
  return !isFrameWorkflowStepComplete(run?.records['match-narration-visuals'])
}

const approveNarrationDraftInRun = (
  run: FrameDebugRun,
  items: AnchoredNarrationDraftItem[]
): FrameDebugRun => {
  const record = run.records['generate-narration-script']
  const output = record?.output as GenerateNarrationScriptOutput | undefined
  if (!record || !output) return run
  if (!hasAnchoredNarrationDraftItems(output.draftItems)) {
    throw new Error('旧文案缺少声画锚点，需要重新生成解说文案')
  }
  const approvedItems = applyNarrationTextEdits(output.draftItems, items)
  return {
    ...run,
    updatedAt: new Date().toISOString(),
    records: {
      ...run.records,
      'generate-narration-script': {
        ...record,
        output: {
          ...output,
          approvedDraftItems: approvedItems,
          pipelineResult: {
            ...output.pipelineResult,
            approvedNarrationDraftItems: approvedItems,
          },
        },
        outputSummary: {
          ...(record.outputSummary ?? {}),
          approved_draft_items: approvedItems.length,
        },
      },
    },
  }
}

const latestLog = (record?: FrameDebugStepRecord) => record?.logs?.[record.logs.length - 1] ?? ''

const sanitizeWorkflowLog = (message: string) => {
  const normalized = message.trim()
  if (!normalized) return ''
  if (normalized === '纯前端处理步骤，不调用后端接口。') return ''
  if (normalized === '无上游依赖，直接使用当前页面参数和文件。') return ''
  if (normalized.startsWith('读取上游输出：')) return ''
  if (normalized.startsWith('将调用后端接口：')) return ''
  if (normalized.startsWith('运行中：') && normalized.includes('等待当前异步任务返回')) {
    return normalized
      .replace(/^运行中：/, '正在处理：')
      .replace(/ 已执行 /, '，已用时 ')
      .replace('，等待当前异步任务返回。', '。')
  }
  return normalized
}

const progressMessage = (record?: FrameDebugStepRecord) => {
  const message = record?.progress?.message
  return typeof message === 'string' ? sanitizeWorkflowLog(message) : ''
}

const getWorkflowMessage = (
  run: FrameDebugRun | null,
  status: WorkflowProgressStatus,
  fallbackError: string | null
) => {
  if (fallbackError) return fallbackError
  if (status === 'stopping') return '收到停止请求，正在取消当前步骤。'
  if (status === 'interrupted') return '网络或页面会话已中断。已保存断点，可在 24 小时内继续。'
  if (status === 'blocked') return '余额不足，当前任务已暂停。充值后可继续，无需重新执行已完成步骤。'
  if (status === 'finalizing') return '最终视频已保存，正在确认本次积分扣除。'
  if (status === 'waiting-review') return '解说文案已生成，请审核确认后继续画面匹配。'
  if (status === 'stopped') {
    const interruptedStep = mainWorkflowSteps.find(step => run?.records[step.id]?.status === 'interrupted')
    const resumeStep = run?.startStepId ? mainWorkflowSteps.find(step => step.id === run.startStepId) : null
    if (interruptedStep || resumeStep) {
      return `任务已中断，可从“${resumeStep?.label ?? interruptedStep?.label ?? '第一个未完成步骤'}”继续。`
    }
    return '任务已停止。点击继续可从第一个未完成步骤恢复执行。'
  }

  const runningStep = mainWorkflowSteps.find(step => run?.records[step.id]?.status === 'running')
  if (runningStep) {
    const record = run?.records[runningStep.id]
    const log = progressMessage(record) || sanitizeWorkflowLog(latestLog(record))
    return log || `正在处理：${runningStep.label}`
  }

  const erroredStep = mainWorkflowSteps.find(step => run?.records[step.id]?.status === 'error')
  if (erroredStep) {
    return run?.records[erroredStep.id]?.error || `${erroredStep.label} 执行失败`
  }

  const lastCompletedStep = [...mainWorkflowSteps].reverse().find(step => isFrameWorkflowStepComplete(run?.records[step.id]))
  if (lastCompletedStep) {
    return sanitizeWorkflowLog(latestLog(run?.records[lastCompletedStep.id])) || `已完成：${lastCompletedStep.label}`
  }

  return '正在启动通用模式流程'
}

const resolveLanguageCode = (language: string | null): string | null => {
  if (!language) return null
  if (/^[a-z]{2}(-[A-Z]{2})?$/.test(language)) return language
  if (language.includes('中文')) return 'zh'
  if (language.includes('英语')) return 'en'
  if (language.includes('日语')) return 'ja'
  if (language.includes('韩语')) return 'ko'
  if (language.includes('俄语')) return 'ru'
  return null
}

const resolveLanguageDisplayValue = (language: unknown): string | null => {
  if (typeof language !== 'string' || !language.trim()) return null
  if ((LANGUAGE_OPTIONS as readonly string[]).includes(language)) return language
  if (language === 'zh' || language === 'zh-CN') return '中文'
  if (language === 'en') return '英语'
  if (language === 'ja') return '日语'
  if (language === 'ko') return '韩语'
  if (language === 'ru') return '俄语'
  return null
}

type CopySectionProps = {
  title: string
  value: unknown
}

const CopyableJsonSection = ({ title, value }: CopySectionProps) => {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const content = useMemo(() => JSON.stringify(value, null, 2), [value])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch (error) {
      console.error('复制失败:', error)
    }
  }

  return (
    <Box>
      <Group justify="space-between" align="center" mb={6}>
        <Text size="sm" fw={800}>{t(title)}</Text>
        <Button
          size="xs"
          variant={copied ? 'filled' : 'light'}
          color={copied ? 'green' : 'gray'}
          onClick={handleCopy}
        >
          {copied ? t('已复制') : t('复制')}
        </Button>
      </Group>
      <Code block style={{ whiteSpace: 'pre-wrap' }}>
        {content}
      </Code>
    </Box>
  )
}

export default function FrameInferenceSetupStep() {
  const { t } = useI18n()
  const { showSuccess, showError } = useToast()
  const { currentProject, refreshProject, updateStageStatus } = useProject()
  const savedFrameInferenceConfig = getSavedFrameInferenceConfig(currentProject?.metadata)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsString = searchParams.toString()
  const [files, setFiles] = useState<File[]>([])
  const [videoName, setVideoName] = useState(currentProject?.name ?? '')
  const [outputLanguage, setOutputLanguage] = useState<string | null>('中文')
  const [workflowOptions, setWorkflowOptions] = useState<FrameWorkflowOptionValue>(() => (
    deriveFrameWorkflowOptionValue(savedFrameInferenceConfig)
  ))
  const [workflowOptionsValid, setWorkflowOptionsValid] = useState(false)
  const [selectionRatio, setSelectionRatio] = useState(() => resolveSavedSelectionRatio(savedFrameInferenceConfig))
  const [narrationRatio, setNarrationRatio] = useState(() => resolveSavedNarrationRatio(savedFrameInferenceConfig))
  const [reviewNarrationScript, setReviewNarrationScript] = useState(false)
  const [timelineReviewRun, setTimelineReviewRun] = useState<FrameDebugRun | null>(null)
  const [narrationReviewItems, setNarrationReviewItems] = useState<AnchoredNarrationDraftItem[]>([])
  const [progressModalOpen, setProgressModalOpen] = useState(false)
  const [completionNoticeOpen, setCompletionNoticeOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<FrameInferencePipelineResult | null>(null)
  const [workflowRun, setWorkflowRun] = useState<FrameDebugRun | null>(null)
  const [transcriptionFailureCounts, setTranscriptionFailureCounts] = useState<Record<string, number>>({})
  const [workflowRecovery, setWorkflowRecovery] = useState<FrameWorkflowRecoveryBuild | null>(null)
  const [recoveryAssetState, setRecoveryAssetState] = useState<FrameWorkflowRecoveryAssetState | null>(null)
  const [dismissedRecoveryKey, setDismissedRecoveryKey] = useState<string | null>(null)
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowProgressStatus>('idle')
  const [currentWorkflowStepId, setCurrentWorkflowStepId] = useState<FrameDebugStepId | null>(null)
  const [videoPreviews, setVideoPreviews] = useState<Record<string, string>>({})
  const [videoDurations, setVideoDurations] = useState<Record<string, number>>({})
  const [isDownloadingFinalVideo, setIsDownloadingFinalVideo] = useState(false)
  const [finalVideoPreviewUrl, setFinalVideoPreviewUrl] = useState<string | null>(null)
  const [showCapcutModal, setShowCapcutModal] = useState(false)
  const [capcutVideoFile, setCapcutVideoFile] = useState<File | null>(null)
  const [capcutScriptItems, setCapcutScriptItems] = useState<ScriptItem[]>([])
  const [capcutExtraAudioAssets, setCapcutExtraAudioAssets] = useState<ExtraAudioAsset[]>([])
  const capcutExportReleaseRef = useRef<(() => void) | null>(null)
  const lastCompletionNoticeKeyRef = useRef<string | null>(null)
  const stopRequestedRef = useRef(false)
  const workflowAbortControllerRef = useRef<AbortController | null>(null)
  const workflowExecutionIdRef = useRef(0)
  const currentWorkflowStepIdRef = useRef<FrameDebugStepId | null>(null)
  const workflowRunRef = useRef<FrameDebugRun | null>(null)
  const observedTranscriptionFailuresRef = useRef(new Set<string>())
  const workflowClientInstanceIdRef = useRef(getWorkflowClientInstanceId())
  const workflowCheckpointStoreRef = useRef(createWorkflowCheckpointStore())
  const workflowLifecycleRef = useRef<FrameWorkflowRunLifecycle | null>(null)
  useEffect(() => {
    workflowRunRef.current = workflowRun
  }, [workflowRun])

  useEffect(() => {
    const savedConfig = currentProject?.metadata?.frame_inference_config as Record<string, unknown> | undefined

    const savedOutputLanguage = resolveLanguageDisplayValue(savedConfig?.output_language)
    if (savedOutputLanguage) {
      setOutputLanguage(savedOutputLanguage)
    }
    if (savedConfig) {
      setWorkflowOptions(deriveFrameWorkflowOptionValue(savedConfig))
    }
    setSelectionRatio(resolveSavedSelectionRatio(savedConfig ?? null))
    setNarrationRatio(resolveSavedNarrationRatio(savedConfig ?? null))
    setReviewNarrationScript(Boolean(savedConfig?.review_narration_script ?? savedConfig?.reviewNarrationScript ?? false))
    const savedVideoName = typeof savedConfig?.videoName === 'string'
      ? savedConfig.videoName.trim()
      : typeof savedConfig?.video_name === 'string'
        ? savedConfig.video_name.trim()
        : ''
    setVideoName(savedVideoName || getEditableProjectVideoName(currentProject))

    const scriptStage = currentProject?.workflow.stages.script?.data as { ai_analysis_script?: Record<string, unknown> } | undefined
    const restored = scriptStage?.ai_analysis_script?.frame_workflow
    if (restored && typeof restored === 'object') {
      const restoredResult = restored as FrameInferencePipelineResult
      setResult(restoredResult)
      setSaved(Boolean(restoredResult.finalVideoResult || currentProject?.artifacts.final_video || currentProject?.status === 'completed'))
    } else {
      setResult(null)
      setSaved(false)
    }
  }, [currentProject?.artifacts.final_video, currentProject?.status, currentProject?.workflow.stages.script, currentProject?.name, currentProject?.metadata])

  useEffect(() => {
    if (!currentProject || isSaving) return

    const recoveryKey = `${currentProject.id}:${currentProject.workflow.revision}`
    const recovery = dismissedRecoveryKey === recoveryKey
      ? null
      : buildRecoverableFrameWorkflowRun(currentProject)

    setWorkflowRecovery(recovery)
    setRecoveryAssetState(null)

    if (recovery && isNarrationReviewPending(recovery.run)) {
      setWorkflowRun(recovery.run)
      setWorkflowStatus('waiting-review')
      setCurrentWorkflowStepId('match-narration-visuals')
      setNarrationReviewItems(getNarrationDraftItemsFromRun(recovery.run))
      setProgressModalOpen(true)
    } else if (recovery && workflowStatus === 'idle' && !workflowRun) {
      setWorkflowRun(recovery.run)
      setWorkflowStatus('stopped')
      setCurrentWorkflowStepId(null)
    }

    if (!recovery && workflowRun?.id.startsWith('frame-recovered-')) {
      setWorkflowRun(null)
      setWorkflowStatus('idle')
      setCurrentWorkflowStepId(null)
    }

    if (!recovery) return

    let isActive = true
    void inspectFrameWorkflowRecoveryAssets(currentProject)
      .then((assetState) => {
        if (isActive) setRecoveryAssetState(assetState)
      })
      .catch(() => {
        if (isActive) {
          setRecoveryAssetState({
            sourceArtifact: null,
            sourceAssetAvailable: false,
            requiresSourceSelection: true,
          })
        }
      })

    void workflowCheckpointStoreRef.current.getCheckpoint(currentProject.id)
      .then((checkpoint) => {
        if (!isActive || !checkpoint) return
        setWorkflowRun((existingRun) => {
          const baseRun = existingRun ?? recovery.run
          if (baseRun.workflowRunId && baseRun.workflowRunId !== checkpoint.workflowRunId) return baseRun
          if (
            baseRun.workflowRunId === checkpoint.workflowRunId
            && baseRun.workflowInputHash === checkpoint.workflowInputHash
            && baseRun.billingStatus === 'pending'
          ) {
            return baseRun
          }
          return {
            ...baseRun,
            workflowRunId: checkpoint.workflowRunId,
            workflowInputHash: checkpoint.workflowInputHash,
            billingStatus: 'pending',
          }
        })
        setWorkflowStatus((currentStatus) => (
          currentStatus === 'idle' || currentStatus === 'stopped' ? 'interrupted' : currentStatus
        ))
      })
      .catch(() => undefined)

    return () => {
      isActive = false
    }
  }, [currentProject, dismissedRecoveryKey, isSaving, workflowRun, workflowStatus])

  useEffect(() => () => {
    workflowAbortControllerRef.current?.abort()
    const run = workflowRunRef.current
    if (run?.workflowRunId && !run.finalResultReadyAt && run.billingStatus !== 'confirmed') {
      void workflowCheckpointStoreRef.current.markInterrupted(run.projectId)
      const lifecycle = workflowLifecycleRef.current
      const interrupt = lifecycle?.workflowRun?.id === run.workflowRunId
        ? lifecycle.interrupt({ errorCode: 'page_unload', errorMessage: 'page session ended' })
        : new WorkflowRunClient().interrupt(run.workflowRunId, { errorCode: 'page_unload', errorMessage: 'page session ended' })
      void interrupt.catch(() => undefined)
    }
    workflowLifecycleRef.current?.dispose()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    let isActive = true
    const replayFinalizationOutbox = async () => {
      const entries = await workflowCheckpointStoreRef.current.listFinalizationOutbox()
      for (const entry of entries) {
        try {
          const completedRun = await new WorkflowRunClient().complete(entry.workflowRunId, {
            finalResultAt: entry.finalResultAt,
          })
          await workflowCheckpointStoreRef.current.removeFinalizationOutbox(entry.projectId)
          if (!isActive || entry.projectId !== currentProject?.id) continue
          setWorkflowRun((currentRun) => currentRun ? {
            ...currentRun,
            workflowRunId: entry.workflowRunId,
            workflowInputHash: entry.workflowInputHash,
            finalResultReadyAt: entry.finalResultAt,
            billingStatus: completedRun.billing_status,
          } : currentRun)
          setWorkflowStatus((currentStatus) => currentStatus === 'finalizing' ? 'interrupted' : currentStatus)
        } catch {
          // The outbox remains intact and will be retried after the next online event or page load.
        }
      }
    }
    const handleOnline = () => {
      void replayFinalizationOutbox()
    }
    void replayFinalizationOutbox()
    window.addEventListener('online', handleOnline)
    return () => {
      isActive = false
      window.removeEventListener('online', handleOnline)
    }
  }, [currentProject?.id])

  useEffect(() => {
    const nextPreviews = files.reduce<Record<string, string>>((acc, file) => {
      acc[getFileKey(file)] = URL.createObjectURL(file)
      return acc
    }, {})

    setVideoPreviews(nextPreviews)

    return () => {
      Object.values(nextPreviews).forEach((url) => URL.revokeObjectURL(url))
    }
  }, [files])

  useEffect(() => {
    setVideoDurations((current) => {
      const next: Record<string, number> = {}
      files.forEach((file) => {
        const key = getFileKey(file)
        if (current[key]) next[key] = current[key]
      })
      return next
    })
  }, [files])

  const hasRecovery = Boolean(workflowRecovery)
  const recoveryNeedsSourceSelection = Boolean(workflowRecovery && recoveryAssetState?.requiresSourceSelection && files.length === 0)
  const recoveryCanUseSelectedSource = Boolean(workflowRecovery && recoveryAssetState?.requiresSourceSelection && files.length === 1)
  const recoverySourceReady = Boolean(workflowRecovery && recoveryAssetState && (!recoveryAssetState.requiresSourceSelection || recoveryCanUseSelectedSource))
  const hasSelectedFiles = files.length > 0 || Boolean(result) || hasRecovery
  const totalSourceDurationMs = files.reduce((total, file) => {
    const duration = videoDurations[getFileKey(file)]
    return total + (Number.isFinite(duration) ? duration * 1000 : 0)
  }, 0)
  const effectiveSelectionRatio = clampRatio(selectionRatio, 0.05)
  const durationEstimate = estimateGeneralDuration(totalSourceDurationMs, effectiveSelectionRatio)
  const effectiveNarrationRatio = clampRatio(narrationRatio)
  const savedOutputDurationMs = optionalNumber(
    savedFrameInferenceConfig?.output_duration_ms ?? savedFrameInferenceConfig?.outputDurationMs,
  )
  const referenceOutputDurationMs = totalSourceDurationMs > 0
    ? Math.max(60_000, Math.round(totalSourceDurationMs * effectiveSelectionRatio))
    : Math.max(60_000, savedOutputDurationMs ?? 60_000)
  const estimatedNarrationCharacters = deriveEstimatedNarrationCharacters(
    referenceOutputDurationMs,
    effectiveNarrationRatio,
  )
  const displayWorkflowRun = useMemo(
    () => getFrameWorkflowDisplayRun(workflowRun, mainWorkflowSteps, currentWorkflowStepId),
    [currentWorkflowStepId, workflowRun]
  )
  const transcriptionRecord = displayWorkflowRun?.records.transcribe
  const workflowFailureKey = displayWorkflowRun?.workflowRunId ?? currentProject?.id ?? 'unknown-project'
  const failureIdentity = transcriptionRecord?.status === 'error'
    ? `${workflowFailureKey}:${transcriptionRecord.completedAt ?? transcriptionRecord.error ?? 'unknown'}`
    : null

  useEffect(() => {
    if (!failureIdentity || observedTranscriptionFailuresRef.current.has(failureIdentity)) return
    observedTranscriptionFailuresRef.current.add(failureIdentity)
    setTranscriptionFailureCounts(current => ({
      ...current,
      [workflowFailureKey]: (current[workflowFailureKey] ?? 0) + 1,
    }))
  }, [failureIdentity, workflowFailureKey])

  const desktopFallback = getDesktopFallbackRecommendation({
    stepId: transcriptionRecord?.status === 'error' ? 'transcribe' : null,
    errorCode: null,
    errorMessage: transcriptionRecord?.error ?? error,
    attemptCount: transcriptionFailureCounts[workflowFailureKey] ?? 0,
    isProduction: import.meta.env.PROD,
    isDesktop: desktopAuthBridge.isDesktop(),
  })
  const workflowProgressBarValue = workflowStatus === 'success' || (saved && result)
    ? 100
    : getFrameWorkflowProgress(displayWorkflowRun, mainWorkflowSteps)
  const workflowMessage = getWorkflowMessage(displayWorkflowRun, workflowStatus, error)
  const translatedWorkflowMessage = t(workflowMessage)
  const workflowHasIncompleteSteps = hasIncompleteWorkflowSteps(displayWorkflowRun)
  const selectionLimitDescription = `最多 ${MAX_VIDEO_COUNT} 个视频，合计最大 ${MAX_TOTAL_SIZE_LABEL}`
  const activeWorkflowStep = (
    currentWorkflowStepId
      ? mainWorkflowSteps.find(step => step.id === currentWorkflowStepId)
      : [...mainWorkflowSteps].reverse().find(step => displayWorkflowRun?.records[step.id]?.status === 'running')
  ) ?? null
  const activeWorkflowStepId = activeWorkflowStep?.id ?? null
  const progressItems = buildFrameWorkflowProgressItems(
    displayWorkflowRun,
    activeWorkflowStepId,
    mainWorkflowSteps,
    record => progressMessage(record) || sanitizeWorkflowLog(latestLog(record)) || record?.error || undefined,
  )
  const languageOptions = useMemo(() => LANGUAGE_OPTIONS.map((language) => ({
    value: language,
    label: language,
  })), [])
  const primaryFileName = files[0]?.name
  const recoveredSourceFileName = recoveryAssetState?.sourceArtifact?.name
  const projectVideoName = videoName.trim()
    || (primaryFileName ? deriveProjectNameFromFileName(primaryFileName) : '')
    || (workflowRecovery && recoveredSourceFileName ? deriveProjectNameFromFileName(recoveredSourceFileName) : '')
  const shouldAutoNameProject = isAutoNamedProject(currentProject)
  const autoNameUpdate = useMemo(
    () => primaryFileName && shouldAutoNameProject
      ? buildAutoProjectNameUpdate(currentProject, primaryFileName)
      : null,
    [currentProject, primaryFileName, shouldAutoNameProject]
  )
  const frameWorkflowConfig = useMemo<FrameInferenceConfig>(() => ({
    videoName: projectVideoName,
    outputLanguage: resolveLanguageCode(outputLanguage),
    selectionRatio: effectiveSelectionRatio,
    outputDurationMs: referenceOutputDurationMs,
    narrationRatio: effectiveNarrationRatio,
    originalRatio: Math.round((1 - effectiveNarrationRatio) * 100),
    defaultNFrames: FRAME_INFERENCE_DEFAULT_N_FRAMES,
    maxDecisions: resolveFrameInferenceMaxDecisions(referenceOutputDurationMs),
    narrationStyleId: workflowOptions.narrationStyleId,
    narrationStyleTitle: workflowOptions.narrationStyleTitle,
    wordCount: estimatedNarrationCharacters,
    reviewNarrationScript,
    voice: workflowOptions.voice,
    voiceName: workflowOptions.voiceName,
    backgroundMusic: workflowOptions.backgroundMusic,
    backgroundMusicId: workflowOptions.backgroundMusicId,
    backgroundMusicUrl: workflowOptions.backgroundMusicUrl,
  }), [
    effectiveNarrationRatio,
    effectiveSelectionRatio,
    estimatedNarrationCharacters,
    outputLanguage,
    projectVideoName,
    referenceOutputDurationMs,
    reviewNarrationScript,
    workflowOptions,
  ])
  const workflowContext = useMemo<FrameWorkflowContext | null>(() => {
    if (!currentProject?.id) return null
    return {
      projectId: currentProject.id,
      files,
      config: frameWorkflowConfig,
      projectName: shouldAutoNameProject ? projectVideoName : undefined,
      projectMetadata: {
        ...(autoNameUpdate?.metadata ?? currentProject.metadata ?? {}),
      },
    }
  }, [autoNameUpdate, currentProject?.id, currentProject?.metadata, files, frameWorkflowConfig, projectVideoName, shouldAutoNameProject])
  const getWorkflowLifecycle = () => {
    workflowLifecycleRef.current ??= new FrameWorkflowRunLifecycle(new WorkflowRunClient())
    return workflowLifecycleRef.current
  }
  const persistWorkflowCheckpoint = async (run: FrameDebugRun, interrupted = false) => {
    if (!run.workflowRunId || !run.workflowInputHash) return
    const store = workflowCheckpointStoreRef.current
    await store.saveCheckpoint({
      projectId: run.projectId,
      workflowRunId: run.workflowRunId,
      workflowInputHash: run.workflowInputHash,
      clientInstanceId: workflowClientInstanceIdRef.current,
      steps: checkpointStepsFromRun(run),
      updatedAt: run.updatedAt,
      interrupted,
    })
  }
  const releaseWorkflowReservations = async (
    reason: 'workflow_failed' | 'workflow_cancelled',
    run: FrameDebugRun | null | undefined = workflowRun
  ) => {
    if (run?.workflowRunId) return
    const projectId = workflowContext?.projectId ?? currentProject?.id
    if (!projectId) return
    try {
      await ProjectService.releaseBillingReservations(projectId, reason)
    } catch (releaseError) {
      console.warn('[FrameInferenceSetupStep] 释放 Credits 预留失败:', releaseError)
    }
  }
  const cancelUnfinalizedWorkflowRun = (run: FrameDebugRun | null | undefined = workflowRun) => {
    if (!run?.workflowRunId || run.finalResultReadyAt || run.billingStatus === 'confirmed') return
    const workflowRunId = run.workflowRunId
    void (async () => {
      try {
        const lifecycle = getWorkflowLifecycle()
        if (lifecycle.workflowRun?.id === workflowRunId) {
          await lifecycle.cancel()
        } else {
          await new WorkflowRunClient().cancel(workflowRunId)
        }
        await workflowCheckpointStoreRef.current.removeCheckpoint(run.projectId)
      } catch (cancelError) {
        console.warn('[FrameInferenceSetupStep] 取消旧工作流运行失败:', cancelError)
      }
    })()
  }
  const initializeWorkflowOptionDefaults = Boolean(
    currentProject
      && currentProject.workflow.current_step === 'step_0_created'
      && Object.keys(currentProject.workflow.steps).length === 0
      && !savedFrameInferenceConfig
      && !workflowOptions.narrationStyleId
      && !workflowOptions.voice
  )
  const canStartFresh = projectVideoName.length > 0 && files.length > 0 && !isSaving && workflowOptionsValid
  const canContinueRecoveredWorkflow = Boolean(
    workflowRecovery
      && workflowRun
      && workflowHasIncompleteSteps
      && recoverySourceReady
      && projectVideoName.length > 0
      && !isSaving
      && workflowOptionsValid
  )
  const canContinueInPageWorkflow = Boolean(
    workflowStatus === 'interrupted'
      && workflowRun
      && workflowHasIncompleteSteps
      && files.length > 0
      && projectVideoName.length > 0
      && !isSaving
      && !stopRequestedRef.current
      && workflowOptionsValid
  )
  const canContinueWorkflow = canContinueRecoveredWorkflow || canContinueInPageWorkflow
  const isResumableWorkflow = Boolean(workflowRecovery || canContinueInPageWorkflow)
  const canStart = canStartFresh || canContinueWorkflow
  const canResumeWorkflow = Boolean(workflowRun && workflowHasIncompleteSteps && canContinueWorkflow)
  const recoveryContinueBlocker = (() => {
    if (!workflowRecovery) return null
    if (!workflowRun || !workflowHasIncompleteSteps) return '未找到可续跑的未完成步骤'
    if (!recoveryAssetState) return '正在检查浏览器本地素材'
    if (!recoverySourceReady) return recoveryAssetState.requiresSourceSelection ? '需要重新选择原视频' : '源视频素材尚未准备完成'
    if (!projectVideoName.length) return '需要填写视频名称'
    if (isSaving) return '任务正在执行中'
    if (!workflowOptionsValid) return '请选择可用解说风格和配音音色'
    return null
  })()
  const finalVideoArtifact = result?.finalVideoResult?.artifact ?? currentProject?.artifacts.final_video ?? null
  const finalVideoName = result?.finalVideoResult?.name || `${projectVideoName || 'frame-inference-result'}.mp4`
  const showCompletionNotice = Boolean(saved && result && !isSaving && !error)
  const completionNoticeKey = finalVideoArtifact?.key ?? finalVideoName
  const showFinalVideoPreview = Boolean(saved && finalVideoArtifact && !isSaving && !error)
  const canDismissProgressModal = !isSaving || workflowStatus === 'stopping' || workflowStatus === 'stopped' || workflowStatus === 'waiting-review'
  // The shared modal intentionally excludes Web-only review, final-video, export, and debug-result controls.
  const usesWebSpecificProgressModal = Boolean(
    showFinalVideoPreview || workflowStatus === 'waiting-review' || result
  )

  useEffect(() => () => {
    capcutExportReleaseRef.current?.()
    capcutExportReleaseRef.current = null
  }, [])

  useEffect(() => {
    let objectUrl: string | null = null
    let isActive = true

    setFinalVideoPreviewUrl(null)
    if (!finalVideoArtifact?.key) return undefined

    void localAssetStorageService.getProjectAsset(finalVideoArtifact.key)
      .then(file => {
        if (!isActive || !file) return
        objectUrl = URL.createObjectURL(file)
        setFinalVideoPreviewUrl(objectUrl)
      })
      .catch(error => {
        console.warn('恢复最终视频预览失败:', error)
      })

    return () => {
      isActive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [finalVideoArtifact?.key])

  useEffect(() => {
    if (!showCompletionNotice) {
      setCompletionNoticeOpen(false)
      lastCompletionNoticeKeyRef.current = null
      return
    }

    if (progressModalOpen) {
      setCompletionNoticeOpen(false)
      lastCompletionNoticeKeyRef.current = completionNoticeKey
      return
    }

    if (lastCompletionNoticeKeyRef.current === completionNoticeKey) return

    lastCompletionNoticeKeyRef.current = completionNoticeKey
    setCompletionNoticeOpen(true)
  }, [completionNoticeKey, progressModalOpen, showCompletionNotice])

  const handleViewCompletionResult = () => {
    setCompletionNoticeOpen(false)
    setProgressModalOpen(true)
  }

  useEffect(() => {
    if (!showFinalVideoPreview) return

    const nextParams = new URLSearchParams(searchParamsString)
    if (nextParams.get('preview') !== 'final') return

    setProgressModalOpen(true)
    nextParams.delete('preview')
    setSearchParams(nextParams, { replace: true })
  }, [searchParamsString, setSearchParams, showFinalVideoPreview])

  const handleDownloadFinalVideo = async () => {
    if (!finalVideoArtifact?.key || isDownloadingFinalVideo) return

    setIsDownloadingFinalVideo(true)
    try {
      const file = await localAssetStorageService.getProjectAsset(finalVideoArtifact.key)
      if (!file) throw new Error('本地最终视频文件缺失，请重新执行合成步骤')
      downloadBlob(file, finalVideoName, 'frame-inference-result.mp4')
      showSuccess(t('下载已开始'), t('视频文件已开始保存到本地。'))
    } catch (error) {
      console.error('下载最终视频失败:', error)
      showError(t('下载失败'), error instanceof Error ? error.message : t('请稍后重试'))
    } finally {
      setIsDownloadingFinalVideo(false)
    }
  }

  const resetCapcutExportPayload = () => {
    capcutExportReleaseRef.current?.()
    capcutExportReleaseRef.current = null
    setCapcutVideoFile(null)
    setCapcutScriptItems([])
    setCapcutExtraAudioAssets([])
  }

  const handleOpenCapcutExport = async () => {
    if (!result) {
      showError(t('导出失败'), t('请先完成通用模式'))
      return
    }

    try {
      resetCapcutExportPayload()
      const payload = await buildFrameCapcutExportPayload({
        result,
        workflowRun,
        sourceVideoArtifact: currentProject?.artifacts.source_video ?? null
      })
      capcutExportReleaseRef.current = payload.release
      setCapcutVideoFile(payload.videoFile)
      setCapcutScriptItems(payload.scriptItems)
      setCapcutExtraAudioAssets(payload.extraAudioAssets)
      setShowCapcutModal(true)
    } catch (error) {
      console.error('准备剪映草稿导出失败:', error)
      showError(t('导出失败'), error instanceof Error ? error.message : t('请稍后重试'))
    }
  }

  const handleCloseCapcutExport = () => {
    setShowCapcutModal(false)
    resetCapcutExportPayload()
  }

  const handleExportFrameToCapcut = async (
    videoFile: File,
    draftPath: string,
    dirHandle?: FileSystemDirectoryHandle,
    onProgress?: (progress: ExportProgress) => void
  ) => {
    const exportResult = await exportToCapcut(videoFile, capcutScriptItems, {
      draftPath,
      dirHandle,
      extraAudioAssets: capcutExtraAudioAssets,
      onProgress
    })
    showSuccess(t('导出成功'), exportResult.message)
  }

  const resetWorkflowState = () => {
    cancelUnfinalizedWorkflowRun()
    workflowExecutionIdRef.current += 1
    workflowAbortControllerRef.current?.abort()
    workflowAbortControllerRef.current = null
    stopRequestedRef.current = false
    setWorkflowRun(null)
    setWorkflowStatus('idle')
    setCurrentWorkflowStepId(null)
    currentWorkflowStepIdRef.current = null
    setNarrationReviewItems([])
    setError(null)
    setIsSaving(false)
  }

  const handleRestartWorkflow = () => {
    if (currentProject) {
      setDismissedRecoveryKey(`${currentProject.id}:${currentProject.workflow.revision}`)
    }
    resetWorkflowState()
    setWorkflowRecovery(null)
    setRecoveryAssetState(null)
    setSaved(false)
    setResult(null)
    setProgressModalOpen(false)
  }

  const handleSelectFiles = (selectedFiles: File[]) => {
    const shouldHydrateRecovery = Boolean(workflowRecovery && recoveryAssetState?.requiresSourceSelection)
    resetWorkflowState()
    const uniqueFiles = dedupeFiles(selectedFiles)
    const validVideoFiles = uniqueFiles.filter(file => file.type.startsWith('video/') || /\.(mp4|mkv|mpeg|mpg|3gp|3gpp)$/i.test(file.name))
    const warnings: string[] = []
    const invalidCount = uniqueFiles.length - validVideoFiles.length

    if (invalidCount > 0) {
      warnings.push(t(`已忽略 ${invalidCount} 个非视频文件`))
    }

    const merged = dedupeFiles([...files, ...validVideoFiles])
    const limited = merged.slice(0, MAX_VIDEO_COUNT)
    const sizeLimited: File[] = []
    let totalSize = 0

    if (merged.length > MAX_VIDEO_COUNT) {
      warnings.push(t(`最多只能选择 ${MAX_VIDEO_COUNT} 个视频`))
    }

    for (const file of limited) {
      if (totalSize + file.size > MAX_TOTAL_SIZE) {
        warnings.push(t(`已跳过超出总大小上限 ${MAX_TOTAL_SIZE_LABEL} 的视频`))
        continue
      }
      sizeLimited.push(file)
      totalSize += file.size
    }

    if (sizeLimited[0]) {
      setVideoName(deriveProjectNameFromFileName(sizeLimited[0].name))
    }

    setFiles(sizeLimited)
    if (shouldHydrateRecovery && workflowRecovery) {
      const hydratedRun = hydrateRecoveredFrameWorkflowRunWithFiles(workflowRecovery.run, sizeLimited)
      const hydratedRecovery = {
        ...workflowRecovery,
        run: hydratedRun,
      }
      setWorkflowRecovery(hydratedRecovery)
      setWorkflowRun(hydratedRun)
      setWorkflowStatus('stopped')
      setCurrentWorkflowStepId(null)
    }
    setError(warnings.length > 0 ? Array.from(new Set(warnings)).join('；') : null)
    setSaved(false)
  }

  const handleRemoveFile = (fileIndex: number) => {
    if (isSaving) return
    resetWorkflowState()
    setFiles((current) => current.filter((_, index) => index !== fileIndex))
    setError(null)
    setSaved(false)
  }

  const handleOutputLanguageChange = (value: string | null) => {
    resetWorkflowState()
    setSaved(false)
    setOutputLanguage(value)
    setWorkflowOptions(current => ({ ...current, voice: null, voiceName: null }))
    setWorkflowOptionsValid(false)
  }

  const handleSelectionRatioChange = (percentage: number) => {
    resetWorkflowState()
    setSaved(false)
    setSelectionRatio(clampRatio(percentage / 100, 0.05))
  }

  const handleNarrationRatioChange = (percentage: number) => {
    resetWorkflowState()
    setSaved(false)
    setNarrationRatio(clampRatio(percentage / 100))
  }

  const handleWorkflowOptionsChange = (value: FrameWorkflowOptionValue) => {
    const selectionChanged = value.narrationStyleId !== workflowOptions.narrationStyleId
      || value.voice !== workflowOptions.voice
      || value.backgroundMusic !== workflowOptions.backgroundMusic
    if (selectionChanged) {
      resetWorkflowState()
      setSaved(false)
    }
    setWorkflowOptions(value)
  }

  const handleReviewNarrationScriptChange = (checked: boolean) => {
    resetWorkflowState()
    setSaved(false)
    setReviewNarrationScript(checked)
  }

  const executeWorkflow = async (initialRun?: FrameDebugRun) => {
    if (!workflowContext || !canStart) return

    const executionId = workflowExecutionIdRef.current + 1
    workflowExecutionIdRef.current = executionId
    const isCurrentExecution = () => workflowExecutionIdRef.current === executionId
    workflowAbortControllerRef.current?.abort()
    const abortController = new AbortController()
    workflowAbortControllerRef.current = abortController

    setIsSaving(true)
    setSaved(false)
    setError(null)
    setWorkflowStatus('running')
    stopRequestedRef.current = false
    setProgressModalOpen(true)

    let workingRun = initialRun
      ?? (workflowRun && workflowHasIncompleteSteps
      ? hydrateRecoveredFrameWorkflowRunWithFiles(workflowRun, files)
      : {
        id: `frame-main-${Date.now()}`,
        projectId: workflowContext.projectId,
        mode: 'dry-run' as const,
        status: 'idle' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        records: {},
    })
    setWorkflowRun(workingRun)

    try {
      const calculatedInputHash = await createFrameWorkflowInputHash({
        projectId: workflowContext.projectId,
        files: workflowContext.files,
        config: workflowContext.config,
      })
      const workflowInputHash = resolveFrameWorkflowInputHash({
        workflowRunId: workingRun.workflowRunId,
        persistedHash: workingRun.workflowInputHash,
        selectedFileCount: workflowContext.files.length,
        calculatedHash: calculatedInputHash,
      })
      if (workingRun.workflowRunId && workingRun.workflowInputHash !== workflowInputHash) {
        try {
          await new WorkflowRunClient().cancel(workingRun.workflowRunId)
          await workflowCheckpointStoreRef.current.removeCheckpoint(workingRun.projectId)
        } catch (cancelError) {
          console.warn('[FrameInferenceSetupStep] 输入变化后取消旧工作流运行失败:', cancelError)
        }
        workingRun = {
          ...workingRun,
          workflowRunId: undefined,
          workflowInputHash: undefined,
          finalResultReadyAt: undefined,
          billingStatus: undefined,
        }
      }
      const isResumingExistingWorkflowRun = Boolean(
        workingRun.workflowRunId && workingRun.workflowInputHash === workflowInputHash
      )
      const lifecycle = getWorkflowLifecycle()
      if (shouldResumeRemoteWorkflowRun(workingRun)) {
        const remoteRun = await lifecycle.ensure({
          projectId: workflowContext.projectId,
          inputHash: workflowInputHash,
          workflowRunId: workingRun.workflowRunId,
        })
        workingRun = {
          ...workingRun,
          workflowRunId: remoteRun.id,
          workflowInputHash,
          billingStatus: remoteRun.billing_status,
        }
        lifecycle.startHeartbeat(() => currentWorkflowStepIdRef.current)
      } else {
        lifecycle.stopHeartbeat()
      }
      await persistWorkflowCheckpoint(workingRun)
      setWorkflowRun(workingRun)
      const startStepId = getFrameWorkflowResumeStepId(workingRun, mainWorkflowSteps)
      const startIndex = mainWorkflowSteps.findIndex(step => step.id === startStepId)
      workingRun = resetFrameWorkflowRunFromStep(workingRun, startStepId, mainWorkflowSteps)
      setCurrentWorkflowStepId(startStepId)
      setWorkflowRun(workingRun)
      const executionSteps = mainWorkflowSteps.slice(Math.max(0, startIndex))

      for (const step of executionSteps) {
        if (stopRequestedRef.current || abortController.signal.aborted) {
          await lifecycle.cancel()
          await workflowCheckpointStoreRef.current.removeCheckpoint(workingRun.projectId)
          await releaseWorkflowReservations('workflow_cancelled', workingRun)
          setWorkflowStatus('stopped')
          setCurrentWorkflowStepId(null)
          currentWorkflowStepIdRef.current = null
          return
        }

        setCurrentWorkflowStepId(step.id)
        currentWorkflowStepIdRef.current = step.id
        if (step.id === 'compose-final-video' && needsTimelineReview(workingRun, workflowContext.config.reviewNarrationScript === true)) {
          await persistWorkflowCheckpoint(workingRun)
          setTimelineReviewRun(workingRun)
          setWorkflowStatus('waiting-review')
          setCurrentWorkflowStepId('compose-final-video')
          setProgressModalOpen(false)
          return
        }
        const shouldTrackServerStep = shouldRegisterWorkflowStep({
          isResuming: isResumingExistingWorkflowRun,
          stepId: step.id,
        })
        if (shouldTrackServerStep) {
          await lifecycle.beginStep(step.id)
        }
        const runContext: FrameWorkflowContext = {
          ...workflowContext,
          workflowRequestIdentity: step.id === 'persist-project' || !workingRun.workflowRunId
            ? undefined
            : {
              workflowRunId: workingRun.workflowRunId,
              workflowStepId: frameWorkflowServerStepId(step.id),
              workflowInputHash,
              clientInstanceId: workflowClientInstanceIdRef.current,
            },
        }
        const run = await runFrameWorkflow({
          context: runContext,
          existingRun: workingRun,
          startStepId: step.id,
          steps: [step],
          mode: 'apply',
          signal: abortController.signal,
          onRunUpdate: (nextRun) => {
            if (!isCurrentExecution()) return
            workingRun = nextRun
            setWorkflowRun(nextRun)
            void persistWorkflowCheckpoint(nextRun).catch((checkpointError) => {
              console.warn('[FrameInferenceSetupStep] 保存工作流断点失败:', checkpointError)
            })
          },
        })

        if (!isCurrentExecution()) return

        workingRun = run
        setWorkflowRun(run)

        if (
          step.id === 'generate-narration-script'
          && workflowContext.config.reviewNarrationScript
          && isNarrationReviewPending(run)
        ) {
          setNarrationReviewItems(getNarrationDraftItemsFromRun(run))
          setWorkflowStatus('waiting-review')
          setCurrentWorkflowStepId('match-narration-visuals')
          setProgressModalOpen(true)
          return
        }

        if (run.status === 'cancelled') {
          if (stopRequestedRef.current) {
            await lifecycle.cancel()
            await workflowCheckpointStoreRef.current.removeCheckpoint(workingRun.projectId)
            await releaseWorkflowReservations('workflow_cancelled', workingRun)
            setWorkflowStatus('stopped')
          } else {
            await lifecycle.interrupt({ errorCode: 'workflow_interrupted', errorMessage: 'operation interrupted' })
            await persistWorkflowCheckpoint(workingRun, true)
            setWorkflowStatus('interrupted')
          }
          setCurrentWorkflowStepId(null)
          currentWorkflowStepIdRef.current = null
          return
        }

        if (run.status === 'error') {
          throw new Error(run.error || `${step.label} 执行失败`)
        }

        if (shouldTrackServerStep) {
          await lifecycle.completeStep(step.id)
        }

        if (step.id === 'compose-final-video' && !workingRun.finalResultReadyAt) {
          const workflowRunId = workingRun.workflowRunId
          if (!workflowRunId) throw new Error('缺少用于确认积分的工作流运行标识')
          const finalResultAt = run.records['compose-final-video']?.completedAt ?? new Date().toISOString()
          workingRun = {
            ...workingRun,
            finalResultReadyAt: finalResultAt,
            billingStatus: 'pending',
          }
          setWorkflowRun(workingRun)
          await persistWorkflowCheckpoint(workingRun)
          await workflowCheckpointStoreRef.current.saveFinalizationOutbox({
            projectId: workingRun.projectId,
            workflowRunId,
            workflowInputHash,
            clientInstanceId: workflowClientInstanceIdRef.current,
            finalResultAt,
          })
          try {
            const completedRun = await lifecycle.complete(finalResultAt)
            workingRun = {
              ...workingRun,
              billingStatus: completedRun.billing_status,
            }
            setWorkflowRun(workingRun)
            await workflowCheckpointStoreRef.current.removeFinalizationOutbox(workingRun.projectId)
            await persistWorkflowCheckpoint(workingRun)
          } catch (finalizationError) {
            const pipelineResult = getFrameWorkflowResult(workingRun)
            if (pipelineResult) {
              setResult(pipelineResult)
              setSaved(true)
            }
            setWorkflowStatus('finalizing')
            setCurrentWorkflowStepId(null)
            currentWorkflowStepIdRef.current = null
            return
          }
        }

        if (stopRequestedRef.current || abortController.signal.aborted) {
          if (shouldResumeRemoteWorkflowRun(workingRun)) {
            await lifecycle.cancel()
          }
          await workflowCheckpointStoreRef.current.removeCheckpoint(workingRun.projectId)
          await releaseWorkflowReservations('workflow_cancelled', workingRun)
          setWorkflowStatus('stopped')
          setCurrentWorkflowStepId(null)
          currentWorkflowStepIdRef.current = null
          return
        }
      }

      if (stopRequestedRef.current || abortController.signal.aborted) {
        if (shouldResumeRemoteWorkflowRun(workingRun)) {
          await lifecycle.cancel()
        }
        await workflowCheckpointStoreRef.current.removeCheckpoint(workingRun.projectId)
        await releaseWorkflowReservations('workflow_cancelled', workingRun)
        return
      }

      const pipelineResult = getFrameWorkflowResult(workingRun)
      if (!pipelineResult) {
        throw new Error('通用模式流程已结束，但没有生成可保存的 frame_workflow 结果')
      }

      await refreshProject()

      updateStageStatus('material', {
        hasConfiguration: true,
        hasGenerationResult: true,
        completed: true,
      })
      updateStageStatus('analysis', {
        hasAiScript: true,
        completed: true,
      })

      setResult(pipelineResult)
      setSaved(true)
      setWorkflowStatus('success')
      setWorkflowRecovery(null)
      setRecoveryAssetState(null)
      setCurrentWorkflowStepId(null)
      currentWorkflowStepIdRef.current = null
    } catch (err) {
      if (!isCurrentExecution()) return
      const lifecycle = workflowLifecycleRef.current
      if (workingRun.finalResultReadyAt && workingRun.billingStatus === 'confirmed') {
        const pipelineResult = getFrameWorkflowResult(workingRun)
        if (pipelineResult) {
          setResult(pipelineResult)
          setSaved(true)
        }
        await persistWorkflowCheckpoint(workingRun, true)
        setError('最终视频已生成，项目保存待重试。')
        setWorkflowStatus('interrupted')
        setCurrentWorkflowStepId(null)
        currentWorkflowStepIdRef.current = null
        return
      }
      if (err instanceof WorkflowBlockedError) {
        workingRun = { ...workingRun, billingStatus: 'pending' }
        setWorkflowRun(workingRun)
        await persistWorkflowCheckpoint(workingRun, true)
        setError(null)
        setWorkflowStatus('blocked')
        return
      }
      if (isAbortError(err) || stopRequestedRef.current || abortController.signal.aborted) {
        if (stopRequestedRef.current) {
          await lifecycle?.cancel()
          await workflowCheckpointStoreRef.current.removeCheckpoint(workingRun.projectId)
          await releaseWorkflowReservations('workflow_cancelled', workingRun)
          setWorkflowStatus('stopped')
        } else {
          await lifecycle?.interrupt({ errorCode: 'workflow_interrupted', errorMessage: 'operation interrupted' })
          await persistWorkflowCheckpoint(workingRun, true)
          setWorkflowStatus('interrupted')
        }
        setError(null)
        setCurrentWorkflowStepId(null)
        currentWorkflowStepIdRef.current = null
        return
      }
      const message = err instanceof Error ? err.message : '通用模式执行失败'
      const failedStepId = currentWorkflowStepIdRef.current
      if (failedStepId) {
        try {
          await lifecycle?.failStep(failedStepId)
        } catch (stepFailureError) {
          console.warn('工作流失败步骤同步失败，将保留本地恢复检查点：', stepFailureError)
        }
      }
      // Remote status tracking must not hide a recoverable local workflow error.
      // The detailed error remains local; the backend only receives its
      // accepted diagnostic code and message.
      try {
        await lifecycle?.interrupt({ errorCode: 'workflow_interrupted', errorMessage: 'operation failed' })
      } catch (interruptError) {
        console.warn('工作流中断状态同步失败，将保留本地恢复检查点：', interruptError)
      }
      await persistWorkflowCheckpoint(workingRun, true)
      await releaseWorkflowReservations('workflow_failed', workingRun)
      setError(message)
      setWorkflowStatus(workingRun.workflowRunId ? 'interrupted' : 'error')
    } finally {
      if (isCurrentExecution()) {
        workflowLifecycleRef.current?.stopHeartbeat()
        setIsSaving(false)
        if (workflowAbortControllerRef.current === abortController) {
          workflowAbortControllerRef.current = null
        }
      }
    }
  }

  const handleStart = () => {
    void executeWorkflow()
  }

  const handleNarrationDraftTextChange = (index: number, text: string) => {
    setNarrationReviewItems(current => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, text } : item
    )))
  }

  const handleConfirmNarrationReview = () => {
    if (!workflowRun) return
    if (narrationReviewItems.some(item => !item.text.trim())) {
      setError('每段解说文案都不能为空')
      return
    }
    try {
      const approvedRun = resetFrameWorkflowRunFromStep(
        approveNarrationDraftInRun(workflowRun, narrationReviewItems),
        'match-narration-visuals',
        mainWorkflowSteps
      )
      const approvedItems = getNarrationDraftItemsFromRun(approvedRun)
      setError(null)
      setNarrationReviewItems(approvedItems)
      setWorkflowRun(approvedRun)
      setWorkflowStatus('stopped')
      void executeWorkflow(approvedRun)
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : '文案审核失败')
    }
  }

  const handleStopWorkflow = () => {
    if (!isSaving) return
    stopRequestedRef.current = true
    setWorkflowStatus('stopping')
    workflowAbortControllerRef.current?.abort()
  }

  return (
    <Box
      px={{ base: 'md', md: 28 }}
      py={{ base: 'md', md: 24 }}
      style={{
        minHeight: '100%',
        boxSizing: 'border-box',
        background: 'transparent',
        color: 'var(--app-text)',
      }}
    >
      {timelineReviewRun && <TimelineReviewModal run={timelineReviewRun}
        onSave={async next => { await persistWorkflowCheckpoint(next); setWorkflowRun(next) }}
        onClose={() => { setTimelineReviewRun(null); setWorkflowStatus('stopped'); setProgressModalOpen(true) }}
        onConfirm={async approved => {
          await persistWorkflowCheckpoint(approved)
          setWorkflowRun(approved)
          setTimelineReviewRun(null)
          setWorkflowStatus('stopped')
          void executeWorkflow(approved)
        }} />}
      <Tooltip label={t('返回项目页面')} position="right" withArrow>
        <ActionIcon
          aria-label={t('返回项目页面')}
          variant="default"
          radius="xl"
          size={44}
          onClick={() => navigate('/projects')}
          style={{
            position: 'fixed',
            top: 88,
            left: 24,
            zIndex: 40,
            boxShadow: 'var(--mantine-shadow-md)',
            background: 'var(--app-surface-elevated)',
          }}
        >
          <ArrowLeftIcon width={22} height={22} />
        </ActionIcon>
      </Tooltip>

      <WorkflowProgressModal
        opened={progressModalOpen && !usesWebSpecificProgressModal}
        status={workflowStatus}
        progress={workflowProgressBarValue}
        items={progressItems}
        message={translatedWorkflowMessage}
        error={error ?? undefined}
        desktopFallback={desktopFallback ?? undefined}
        canClose={canDismissProgressModal}
        canPause={false}
        canResume={!isSaving && canResumeWorkflow}
        canCancel={isSaving}
        onClose={() => setProgressModalOpen(false)}
        onPause={() => undefined}
        onResume={handleStart}
        onCancel={handleStopWorkflow}
      />

      <Modal
        opened={progressModalOpen && usesWebSpecificProgressModal}
        onClose={() => {
          setProgressModalOpen(false)
        }}
        closeOnClickOutside={canDismissProgressModal}
        closeOnEscape={canDismissProgressModal}
        withCloseButton={canDismissProgressModal}
        centered
        size="xl"
        radius="md"
        title={(
          <Group gap="sm">
            <ThemeIcon radius="xl" variant="light" color={saved && result ? 'green' : workflowStatus === 'blocked' || workflowStatus === 'interrupted' || workflowStatus === 'finalizing' || workflowStatus === 'stopped' ? 'yellow' : error ? 'red' : 'blue'}>
              {saved && result ? <CheckCircleIcon width={18} height={18} /> : <FilmIcon width={18} height={18} />}
            </ThemeIcon>
            <Text fw={800}>
              {t(saved && result
                ? '通用模式已完成'
                : workflowStatus === 'blocked'
                  ? '等待充值后继续'
                  : workflowStatus === 'finalizing'
                    ? '正在确认积分扣除'
                    : workflowStatus === 'interrupted'
                      ? '任务已中断，可继续'
                    : error
                      ? '通用模式失败'
                  : workflowStatus === 'stopped'
                    ? workflowRecovery ? '通用模式可继续' : '通用模式已停止'
                    : workflowStatus === 'waiting-review'
                      ? '请审核解说文案'
                    : workflowStatus === 'stopping'
                      ? '正在停止通用模式'
                      : '正在执行通用模式')}
            </Text>
          </Group>
        )}
      >
        <Stack gap="md">
      {showFinalVideoPreview ? (
            <>
              <Box
                style={{
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: 'var(--app-media-bg)',
                  border: '1px solid var(--app-border-subtle)',
                }}
              >
                <video
                  src={finalVideoPreviewUrl || undefined}
                  controls
                  playsInline
                  preload="metadata"
                  style={{
                    display: 'block',
                    width: '100%',
                    maxHeight: '58vh',
                    background: '#000',
                  }}
                />
              </Box>

              <Group justify="space-between" align="center" gap="sm">
                <Stack gap={2}>
                  <Text size="sm" fw={800}>{t('通用模式完成')}</Text>
                  <Text size="xs" c="dimmed">{t('最终视频已保存到项目，可直接预览或下载。')}</Text>
                </Stack>
                <Group gap="xs">
                  <Button
                    variant="light"
                    color="gray"
                    onClick={handleOpenCapcutExport}
                    disabled={!result?.voiceoverResult?.items?.length}
                    leftSection={<ScissorsIcon width={18} height={18} />}
                  >
                    {t('导出剪映')}
                  </Button>
                  <Button
                    onClick={handleDownloadFinalVideo}
                    loading={isDownloadingFinalVideo}
                    disabled={!finalVideoArtifact?.key}
                    leftSection={<ArrowDownTrayIcon width={18} height={18} />}
                    color="brand"
                  >
                    {t('下载视频')}
                  </Button>
                  <Button variant="light" color="gray" onClick={() => setProgressModalOpen(false)}>
                    {t('关闭')}
                  </Button>
                </Group>
              </Group>
            </>
          ) : (
            <>
              {error && <Alert color="red" variant="light">{error}</Alert>}

              {workflowStatus === 'stopped' && !error && (
                <Alert color="yellow" variant="light">
                  {workflowRecovery
                    ? t(`任务已中断，可从“${workflowRecovery.summary.resumeStepLabel}”继续。已完成步骤会复用；中断中的步骤会重新执行。`)
                    : t('任务已停止。点击继续会复用已完成步骤，从第一个未完成步骤继续执行。')}
                </Alert>
              )}

              {workflowStatus === 'interrupted' && (
                <Alert color="yellow" variant="light">
                  {t(error
                    ? '任务已暂停。点击继续会重试未完成的部分，已保存的时间线图片分析结果会复用。'
                    : '网络或页面会话已中断。任务断点会保留 24 小时，继续后只执行未完成步骤。')}
                </Alert>
              )}

              {workflowStatus === 'blocked' && (
                <Alert color="yellow" variant="light">
                  {t('余额不足，任务已暂停。请在网页端充值后继续，已完成步骤不会重复扣费。')}
                </Alert>
              )}

              {workflowStatus === 'finalizing' && (
                <Alert color="blue" variant="light">
                  {t('最终视频已保存到本地，正在重试确认积分扣除。网络恢复后会自动继续。')}
                </Alert>
              )}

              {workflowStatus === 'waiting-review' && (
                <Alert color="yellow" variant="light">
                  {t('解说文案已生成。确认后会继续执行“画面匹配”和后续步骤。')}
                </Alert>
              )}

              <Paper
                withBorder
                radius="md"
                p="md"
                style={{
                  borderColor: 'var(--app-border-subtle)',
                  background: 'var(--app-surface-alt)',
                }}
              >
                <Stack gap="sm">
                  <Text size="sm" fw={800} lineClamp={2}>{translatedWorkflowMessage}</Text>
                  <Progress
                    aria-label={t('通用模式进度')}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={workflowProgressBarValue}
                    value={workflowProgressBarValue}
                    size="lg"
                    radius="xl"
                    color={error ? 'red' : workflowStatus === 'stopped' || workflowStatus === 'stopping' ? 'yellow' : 'brand'}
                  />
                </Stack>
              </Paper>

              {workflowStatus === 'waiting-review' && (
                <Paper
                  withBorder
                  radius="md"
                  p="md"
                  style={{
                    borderColor: 'var(--app-border-subtle)',
                    background: 'var(--app-surface-elevated)',
                  }}
                >
                  <Stack gap="sm">
                    <Group justify="space-between" gap="sm" align="center">
                      <Stack gap={2}>
                        <Text size="sm" fw={800}>{t('解说文案')}</Text>
                        <Text size="xs" c="dimmed">{t(`共 ${narrationReviewItems.length} 段`)}</Text>
                      </Stack>
                    </Group>
                    <ScrollArea h={260} type="auto" offsetScrollbars>
                      <Stack gap="xs" pr="sm">
                        {narrationReviewItems.map((item, index) => (
                          <Group key={`${item._id}-${index}`} align="flex-start" gap="xs" wrap="nowrap">
                            <Badge variant="light" color="gray" mt={8}>{index + 1}</Badge>
                            <Textarea
                              value={item.text}
                              autosize
                              minRows={2}
                              maxRows={6}
                              style={{ flex: 1 }}
                              styles={compactFieldStyles}
                              onChange={(event) => handleNarrationDraftTextChange(index, event.currentTarget.value)}
                            />
                          </Group>
                        ))}
                      </Stack>
                    </ScrollArea>
                    <Group justify="flex-end">
                      <Button
                        color="brand"
                        leftSection={<PlayIcon width={16} height={16} />}
                        onClick={handleConfirmNarrationReview}
                        disabled={isSaving || narrationReviewItems.length === 0 || narrationReviewItems.some(item => !item.text.trim())}
                      >
                        {t('确认并继续')}
                      </Button>
                    </Group>
                  </Stack>
                </Paper>
              )}

              <ScrollArea h={300} type="auto">
                <Stack gap={0}>
                  {mainWorkflowSteps.map((step, index) => {
                    const {
                      record,
                      status,
                      isActive,
                      isComplete,
                      progress: stepProgress,
                    } = getFrameWorkflowDisplayStepState(displayWorkflowRun, step, activeWorkflowStepId)
                    const statusColor = isActive ? 'blue' : workflowStepStatusColor[status] ?? 'gray'
                    const statusLabel = t(isActive ? '执行中' : workflowStepStatusLabel[status] ?? status)
                    const statusVariant = isActive ? 'filled' : 'light'
                    const log = record ? t(progressMessage(record) || sanitizeWorkflowLog(latestLog(record))) : ''

                    return (
                      <Box
                        key={`${step.id}-${status}-${isActive ? 'active' : 'idle'}`}
                        py="sm"
                        px="xs"
                        data-frameflow-step={step.id}
                        data-frameflow-status={status}
                        data-frameflow-active={isActive ? 'true' : 'false'}
                        style={{
                          borderBottom: index < mainWorkflowSteps.length - 1 ? '1px solid var(--app-border-subtle)' : undefined,
                          backgroundColor: isActive ? 'var(--app-brand-soft-bg)' : 'transparent',
                        }}
                      >
                        <Stack gap={6}>
                          <Group justify="space-between" gap="sm" wrap="nowrap">
                            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                              <ThemeIcon
                                size={30}
                                radius="xl"
                                color={statusColor}
                                variant={isActive || isComplete ? 'light' : 'subtle'}
                              >
                                <Text size="xs" fw={900}>{index + 1}</Text>
                              </ThemeIcon>
                              <Stack gap={1} style={{ minWidth: 0 }}>
                                <Text size="sm" fw={800} truncate>{t(step.label)}</Text>
                                {log && <Text size="xs" c="dimmed" lineClamp={1}>{log}</Text>}
                              </Stack>
                            </Group>
                            <Badge
                              key={`${step.id}-badge-${statusLabel}`}
                              size="sm"
                              color={statusColor}
                              variant={statusVariant}
                              data-frameflow-status-badge={step.id}
                            >
                              {statusLabel}
                            </Badge>
                          </Group>
                          {isActive && status === 'running' && (
                            stepProgress.determinate ? (
                              <Progress
                                value={stepProgress.value}
                                size="sm"
                                radius="xl"
                                color="brand"
                                animated
                              />
                            ) : (
                              <Group gap="xs" c="dimmed">
                                <Loader size="xs" color="brand" />
                                <Text size="xs">{t('正在等待异步结果')}</Text>
                              </Group>
                            )
                          )}
                          {!isActive && (status === 'cancelled' || status === 'interrupted') && stepProgress.value > 0 && (
                            <Progress
                              value={stepProgress.value}
                              size="sm"
                              radius="xl"
                              color="yellow"
                            />
                          )}
                        </Stack>
                      </Box>
                    )
                  })}
                </Stack>
              </ScrollArea>

              {result && (
                <Stack gap="sm">
                  <Group gap="xs" wrap="wrap">
                    <Badge variant="light" color="green">{t(getPreviewLabel(result))}</Badge>
                    <Badge variant="outline" color="gray">{t('总 tokens · ')}{result.tokens.total}</Badge>
                    <Badge variant="outline" color="gray">{t('转录 · ')}{result.tokens.transcription}</Badge>
                    <Badge variant="outline" color="gray">{t('决策 · ')}{result.tokens.decision}</Badge>
                    <Badge variant="outline" color="gray">{t('视觉分析 · ')}{result.tokens.analysis}</Badge>
                  </Group>

                  <ScrollArea h={420} type="auto">
                    <Stack gap="md">
                      <CopyableJsonSection title="转录结果" value={result.transcription} />
                      <CopyableJsonSection title="字幕载荷" value={result.subtitlePayload} />
                      <CopyableJsonSection title="视觉辅助决策" value={result.decision} />
                      <CopyableJsonSection title="合并后的 video_context" value={result.videoContext} />
                      <CopyableJsonSection title="逐段视觉分析" value={result.analyses} />
                    </Stack>
                  </ScrollArea>
                </Stack>
              )}

              <Group justify="space-between">
                <Group gap="xs">
                  {isSaving && (
                    <Button
                      variant="light"
                      color="yellow"
                      leftSection={<XMarkIcon width={16} height={16} />}
                      onClick={handleStopWorkflow}
                      disabled={workflowStatus === 'stopping'}
                    >
                      {t(workflowStatus === 'stopping' ? '正在停止' : '停止任务')}
                    </Button>
                  )}
                  {!isSaving && canResumeWorkflow && (
                    <Stack gap={4}>
                      <Button
                        color="brand"
                        leftSection={<PlayIcon width={16} height={16} />}
                        onClick={handleStart}
                      >
                        {t('继续执行')}
                      </Button>
                      <Text size="xs" c="dimmed">
                        {t('不会重复执行已完成步骤；当前中断步骤会重新执行。')}
                      </Text>
                    </Stack>
                  )}
                </Group>
                {!isSaving && (
                  <Button variant="light" color="gray" onClick={() => setProgressModalOpen(false)}>
                    {t('关闭')}
                  </Button>
                )}
              </Group>
            </>
          )}
        </Stack>
      </Modal>

      <Modal
        opened={completionNoticeOpen && !progressModalOpen}
        onClose={() => setCompletionNoticeOpen(false)}
        centered
        size="md"
        radius="md"
        title={null}
        aria-label={t('最终视频完成提示')}
      >
        <Stack gap="lg" align="center" ta="center" py="md">
          <ThemeIcon
            size={72}
            radius="xl"
            color="green"
            variant="light"
          >
            <CheckCircleIcon width={42} height={42} />
          </ThemeIcon>

          <Stack gap={6} align="center">
            <Title order={3}>{t('最终视频已生成并保存。')}</Title>
            <Text size="sm" c="dimmed" maw={420}>
              {t('最终视频已保存到项目，可直接预览、下载，或继续导出剪映草稿。')}
            </Text>
          </Stack>

          <Group justify="center" gap="sm" wrap="wrap">
            <Button
              color="brand"
              size="md"
              onClick={handleViewCompletionResult}
              leftSection={<FilmIcon width={18} height={18} />}
            >
              {t('查看结果')}
            </Button>
            <Button
              variant="light"
              color="green"
              size="md"
              onClick={handleDownloadFinalVideo}
              loading={isDownloadingFinalVideo}
              disabled={!finalVideoArtifact?.key}
              leftSection={<ArrowDownTrayIcon width={18} height={18} />}
            >
              {t('下载视频')}
            </Button>
            <Button
              variant="subtle"
              color="gray"
              size="md"
              onClick={() => setCompletionNoticeOpen(false)}
            >
              {t('稍后查看')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Box maw={1480} mx="auto">
        {workflowRecovery && (
          <Paper
            withBorder
            radius="md"
            p="lg"
            mb="md"
            style={{
              borderColor: recoveryNeedsSourceSelection ? 'rgba(245, 158, 11, 0.45)' : 'var(--app-brand-soft-border)',
              background: recoveryNeedsSourceSelection ? 'rgba(245, 158, 11, 0.08)' : 'var(--app-brand-soft-bg)',
              boxShadow: 'var(--app-shadow)',
            }}
          >
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start" gap="md">
                <Stack gap={6} style={{ minWidth: 0 }}>
                  <Group gap="xs" wrap="wrap">
                    <ThemeIcon radius="xl" color="yellow" variant="light" size={30}>
                      <PauseIcon width={16} height={16} />
                    </ThemeIcon>
                    <Text fw={900} size="md">{t('检测到未完成的通用模式任务')}</Text>
                    <Badge color="yellow" variant="light">
                      {t(`已完成 ${workflowRecovery.summary.completedCount}/${workflowRecovery.summary.totalCount}`)}
                    </Badge>
                  </Group>
                  <Text size="sm" c="var(--app-text)">
                    {t(`已完成 ${workflowRecovery.summary.completedCount}/${workflowRecovery.summary.totalCount}，下一步：${workflowRecovery.summary.nextStepLabel}`)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {t(
                      workflowRecovery.summary.resumeStepId === workflowRecovery.summary.nextStepId
                        ? '已完成步骤会复用；中断中的步骤会重新执行。'
                        : `已完成步骤会尽量复用；由于本地依赖需要重建，将从“${workflowRecovery.summary.resumeStepLabel}”恢复。`
                    )}
                  </Text>
                  {workflowRecovery.summary.interruptedStepLabel && (
                    <Text size="xs" c="dimmed">
                      {t(`上次中断于：${workflowRecovery.summary.interruptedStepLabel}`)}
                    </Text>
                  )}
                </Stack>

                <Group gap="xs" justify="flex-end">
                  {recoveryNeedsSourceSelection ? (
                    <FileButton
                      multiple
                      accept="video/mp4,video/x-matroska,video/mpeg,video/mpg,video/3gpp"
                      onChange={(selectedFiles) => handleSelectFiles(Array.isArray(selectedFiles) ? selectedFiles : selectedFiles ? [selectedFiles] : [])}
                    >
                      {(props) => (
                        <Button {...props} color="yellow" leftSection={<ArrowUpTrayIcon width={16} height={16} />}>
                          {t('选择原视频后继续')}
                        </Button>
                      )}
                    </FileButton>
                  ) : (
                    <Button
                      color="brand"
                      leftSection={<PlayIcon width={16} height={16} />}
                      onClick={handleStart}
                      disabled={!canResumeWorkflow}
                    >
                      {t('继续执行')}
                    </Button>
                  )}
                  <Button variant="light" color="gray" onClick={() => setProgressModalOpen(true)}>
                    {t('查看已生成数据')}
                  </Button>
                  <Button variant="subtle" color="red" onClick={handleRestartWorkflow}>
                    {t('重新开始')}
                  </Button>
                </Group>
              </Group>

              {recoveryContinueBlocker && !recoveryNeedsSourceSelection && (
                <Alert color="yellow" variant="light">
                  {t(`暂时无法继续执行：${recoveryContinueBlocker}。`)}
                </Alert>
              )}

              {recoveryNeedsSourceSelection && (
                <Alert color="yellow" variant="light">
                  {t('本地源视频缺失，需要重新选择原视频后才能继续执行。')}
                </Alert>
              )}
            </Stack>
          </Paper>
        )}

        <Grid gap={{ base: 'md', lg: 28 }} align="flex-start">
          <Grid.Col span={{ base: 12, lg: 7 }} order={{ base: 2, lg: 2 }}>
            <Stack
              gap="md"
              h={{ base: 'auto', lg: WORKSPACE_PANEL_HEIGHT }}
              style={{ minHeight: 0 }}
            >
              <FileButton
                multiple
                accept="video/mp4,video/x-matroska,video/mpeg,video/mpg,video/3gpp"
                onChange={(selectedFiles) => handleSelectFiles(Array.isArray(selectedFiles) ? selectedFiles : [])}
              >
                {(props) => (
                  <Paper
                    {...props}
                    component="button"
                    type="button"
                    radius="md"
                    withBorder
                    p={{ base: 'xl', md: 40 }}
                    h={{ base: 430, lg: 'auto' }}
                    onDrop={(event) => {
                      event.preventDefault()
                      handleSelectFiles(Array.from(event.dataTransfer.files))
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    style={{
                      flex: '1 1 0',
                      minHeight: 0,
                      width: '100%',
                      cursor: 'pointer',
                      borderStyle: 'dashed',
                      borderColor: 'var(--app-border-subtle)',
                      background: 'var(--app-surface-elevated)',
                      color: 'var(--app-text)',
                      boxShadow: hasSelectedFiles ? 'none' : 'var(--app-shadow)',
                    }}
                  >
                    <Stack align="center" justify="center" gap="md" h="100%" ta="center">
                      <ThemeIcon size={72} radius="xl" variant="transparent" color="gray">
                        {files.length > 0 ? (
                          <CheckCircleIcon width={56} height={56} stroke={1.6} />
                        ) : workflowRecovery ? (
                          <PauseIcon width={56} height={56} stroke={1.6} />
                        ) : result ? (
                          <FilmIcon width={56} height={56} stroke={1.6} />
                        ) : (
                          <ArrowUpTrayIcon width={56} height={56} stroke={1.6} />
                        )}
                      </ThemeIcon>

                      <Stack gap={6} align="center">
                        <Title order={2} size="h3">
                          {t(files.length > 0
                            ? `已选择 ${files.length} 个视频`
                            : workflowRecovery
                              ? '检测到可继续的通用模式'
                            : result
                              ? '已恢复上次通用模式结果'
                              : '点击或拖拽上传视频（可多选）')}
                        </Title>
                        <Text c="dimmed" size="sm">
                          {t(files.length > 0
                            ? `合计 ${formatTotalSize(files)}，可继续追加，最多 ${MAX_VIDEO_COUNT} 个`
                            : workflowRecovery
                              ? `已完成 ${workflowRecovery.summary.completedCount}/${workflowRecovery.summary.totalCount}，下一步：${workflowRecovery.summary.nextStepLabel}`
                            : result
                              ? '字幕、视觉决策和逐段分析已从项目中恢复，可查看结果或重新上传生成。'
                              : `支持上传${selectionLimitDescription}，格式支持 MP4, MKV, MPEG, MPG, 3GPP`)}
                        </Text>
                      </Stack>
                    </Stack>
                  </Paper>
                )}
              </FileButton>

              {hasSelectedFiles && (
                <Box
                  style={{
                    flex: '0 0 auto',
                    maxHeight: 156,
                    overflow: 'hidden',
                  }}
                >
                  <ScrollArea h={150} type="auto" offsetScrollbars>
                    <SimpleGrid cols={{ base: 2, sm: 3, md: 4, xl: 5 }} spacing="xs">
                      {files.length > 0 ? files.map((currentFile, index) => {
                        const fileKey = getFileKey(currentFile)
                        const previewUrl = videoPreviews[fileKey]
                        const durationLabel = formatVideoDuration(videoDurations[fileKey])

                        return (
                          <Stack key={fileKey} gap={6} style={{ minWidth: 0 }}>
                            <Box
                              pos="relative"
                              style={{
                                aspectRatio: '16 / 9',
                                overflow: 'hidden',
                                borderRadius: 10,
                                background: 'var(--app-media-bg)',
                                border: '1px solid var(--app-border-subtle)',
                              }}
                            >
                              {previewUrl ? (
                                <video
                                  src={previewUrl}
                                  muted
                                  playsInline
                                  preload="metadata"
                                  onLoadedMetadata={(event) => {
                                    const duration = event.currentTarget.duration
                                    if (!Number.isFinite(duration)) return
                                    setVideoDurations(current => current[fileKey] === duration
                                      ? current
                                      : { ...current, [fileKey]: duration })
                                  }}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                />
                              ) : (
                                <Stack h="100%" align="center" justify="center" gap={4}>
                                  <FilmIcon width={22} height={22} style={{ color: 'var(--app-muted)' }} />
                                </Stack>
                              )}

                              <Text
                                size="sm"
                                fw={700}
                                c="white"
                                style={{
                                  position: 'absolute',
                                  left: 12,
                                  top: 10,
                                  lineHeight: 1,
                                  textShadow: '0 1px 6px rgba(0, 0, 0, 0.72)',
                                }}
                              >
                                #{index + 1}
                              </Text>

                              {durationLabel && (
                                <Text
                                  size="sm"
                                  fw={700}
                                  c="white"
                                  style={{
                                    position: 'absolute',
                                    left: 12,
                                    bottom: 10,
                                    lineHeight: 1,
                                    textShadow: '0 1px 6px rgba(0, 0, 0, 0.72)',
                                  }}
                                >
                                  {durationLabel}
                                </Text>
                              )}

                              {!isSaving && (
                                <Tooltip label={t('移除视频')}>
                                  <ActionIcon
                                    size="sm"
                                    radius="xl"
                                    variant="filled"
                                    color="dark"
                                    aria-label={t(`移除 ${currentFile.name}`)}
                                    onClick={() => handleRemoveFile(index)}
                                    style={{ position: 'absolute', right: 8, top: 8, opacity: 0.72 }}
                                  >
                                    <XMarkIcon width={14} height={14} />
                                  </ActionIcon>
                                </Tooltip>
                              )}
                            </Box>

                            <Text size="sm" c="var(--app-text)" truncate>{currentFile.name}</Text>
                          </Stack>
                        )
                      }) : result ? (
                        <Stack gap={6} style={{ minWidth: 0 }}>
                          <Box
                            pos="relative"
                            style={{
                              aspectRatio: '16 / 9',
                              overflow: 'hidden',
                              borderRadius: 10,
                              background: 'var(--app-media-bg)',
                              border: '1px solid var(--app-border-subtle)',
                            }}
                          >
                            <Stack h="100%" align="center" justify="center" gap={4}>
                              <FilmIcon width={22} height={22} style={{ color: 'var(--app-muted)' }} />
                            </Stack>
                            <Text
                              size="sm"
                              fw={700}
                              c="white"
                              style={{
                                position: 'absolute',
                                left: 12,
                                top: 10,
                                lineHeight: 1,
                                textShadow: '0 1px 6px rgba(0, 0, 0, 0.72)',
                              }}
                            >
                              #1
                            </Text>
                          </Box>
                          <Text size="sm" c="var(--app-text)" truncate>{result.mergedVideo.name}</Text>
                        </Stack>
                      ) : workflowRecovery ? (
                        <Stack gap={6} style={{ minWidth: 0 }}>
                          <Box
                            pos="relative"
                            style={{
                              aspectRatio: '16 / 9',
                              overflow: 'hidden',
                              borderRadius: 10,
                              background: 'var(--app-media-bg)',
                              border: '1px solid var(--app-border-subtle)',
                            }}
                          >
                            <Stack h="100%" align="center" justify="center" gap={4}>
                              <PauseIcon width={22} height={22} style={{ color: 'var(--app-muted)' }} />
                            </Stack>
                            <Text
                              size="sm"
                              fw={700}
                              c="white"
                              style={{
                                position: 'absolute',
                                left: 12,
                                top: 10,
                                lineHeight: 1,
                                textShadow: '0 1px 6px rgba(0, 0, 0, 0.72)',
                              }}
                            >
                              #1
                            </Text>
                          </Box>
                          <Text size="sm" c="var(--app-text)" truncate>
                            {recoveryAssetState?.sourceArtifact?.name || workflowRecovery.summary.nextStepLabel}
                          </Text>
                        </Stack>
                      ) : null}
                    </SimpleGrid>
                  </ScrollArea>
                </Box>
              )}
            </Stack>
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 5 }} order={{ base: 1, lg: 1 }}>
            <Paper
              radius="md"
              withBorder
              p={{ base: 'lg', md: 24 }}
              w="100%"
              maw={520}
              h={{ base: 520, lg: WORKSPACE_PANEL_HEIGHT }}
              mx={{ base: 0, lg: 'unset' }}
              ml={{ base: 0, lg: 'auto' }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                borderColor: 'var(--app-border)',
                background: 'var(--app-surface-elevated)',
                boxShadow: 'var(--app-shadow)',
              }}
            >
              <Stack gap="md" h="100%" style={{ minHeight: 0 }}>
                <Group gap="sm">
                  <Cog6ToothIcon width={26} height={26} />
                  <Title order={1} size="h3">{t('剪辑配置')}</Title>
                </Group>

                <ScrollArea type="auto" offsetScrollbars style={{ flex: 1, minHeight: 0 }}>
                  <Stack gap="sm" pr="sm">
                  <Select
                    key={`frame-output-language-${outputLanguage ?? 'none'}`}
                    label={t('输出语言')}
                    data={languageOptions}
                    value={outputLanguage}
                    onChange={handleOutputLanguageChange}
                    allowDeselect={false}
                    styles={compactFieldStyles}
                  />

                  <FrameWorkflowOptionFields
                    key={`${currentProject?.id ?? 'pending-project'}:${savedFrameInferenceConfig ? 'saved' : 'new'}`}
                    value={workflowOptions}
                    onChange={handleWorkflowOptionsChange}
                    onValidityChange={setWorkflowOptionsValid}
                    initializeDefaults={initializeWorkflowOptionDefaults}
                  />

                  <Stack gap={6}>
                    <Group justify="space-between" gap="sm">
                      <Text size="sm" fw={700}>{t('成片素材选取比例')}</Text>
                      <Badge variant="light" color="brand">
                        {Math.round(effectiveSelectionRatio * 100) + '%'}
                      </Badge>
                    </Group>
                    <Slider
                      aria-label={t('成片素材选取比例')}
                      min={5}
                      max={100}
                      step={5}
                      label={(value) => value + '%'}
                      value={Math.round(effectiveSelectionRatio * 100)}
                      onChange={handleSelectionRatioChange}
                    />
                    <Text size="xs" c="var(--app-muted)">
                      {totalSourceDurationMs > 0
                        ? t('参考成片时长约 ') + formatVideoDuration(durationEstimate.minMs / 1000) + '–' + formatVideoDuration(durationEstimate.maxMs / 1000)
                        : t('素材时长读取完成后显示参考成片时长')}
                    </Text>
                    <Text size="xs" c="var(--app-muted)">{t(GENERAL_DURATION_HINT)}</Text>
                  </Stack>

                  <Stack gap={6}>
                    <Group justify="space-between" gap="sm">
                      <Text size="sm" fw={700}>{t('解说率')}</Text>
                      <Badge variant="light" color="gray">
                        {Math.round(effectiveNarrationRatio * 100) + '%'}
                      </Badge>
                    </Group>
                    <Slider
                      aria-label={t('解说率')}
                      min={0}
                      max={100}
                      step={5}
                      label={(value) => value + '%'}
                      value={Math.round(effectiveNarrationRatio * 100)}
                      onChange={handleNarrationRatioChange}
                    />
                    <Text size="xs" c="var(--app-muted)">
                      {t(
                        '原片约 '
                        + Math.round((1 - effectiveNarrationRatio) * 100)
                        + '%；预估解说约 '
                        + estimatedNarrationCharacters
                        + ' 字，仅用于展示和消耗预估'
                      )}
                    </Text>
                  </Stack>

                  <Switch
                    size="md"
                    radius="xl"
                    label={t('校验文案')}
                    description={t('生成解说文案后暂停，审核确认后再进行画面匹配')}
                    checked={reviewNarrationScript}
                    onChange={(event) => handleReviewNarrationScriptChange(event.currentTarget.checked)}
                    color="brand"
                    thumbIcon={null}
                    styles={reviewScriptSwitchStyles}
                  />

                  {error && <Alert color="red" variant="light">{error}</Alert>}

                  </Stack>
                </ScrollArea>

                <Button
                  size="md"
                  radius="md"
                  color="brand"
                  loading={isSaving}
                  disabled={!canStart}
                  onClick={handleStart}
                  leftSection={!isSaving && canResumeWorkflow ? <PlayIcon width={18} height={18} /> : undefined}
                  style={{
                    minHeight: 54,
                    fontSize: 17,
                    fontWeight: 800,
                  }}
                >
                  {t(isSaving ? '执行中' : isResumableWorkflow ? '继续处理' : '开始剪辑')}
                </Button>
              </Stack>
            </Paper>
          </Grid.Col>
        </Grid>
      </Box>
      <CapcutExportModal
        isOpen={showCapcutModal}
        onClose={handleCloseCapcutExport}
        onExport={handleExportFrameToCapcut}
        existingVideoFile={capcutVideoFile ?? undefined}
      />
    </Box>
  )
}
