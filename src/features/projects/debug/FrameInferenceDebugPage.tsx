import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Alert,
  ActionIcon,
  Badge,
  Box,
  Button,
  Code,
  Collapse,
  FileButton,
  Grid,
  Group,
  Loader,
  Paper,
  Progress,
  ScrollArea,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core'
import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlayIcon,
  SparklesIcon,
  TrashIcon,
} from '@/shared/icons/tabler'
import ProjectService from '../services/projectService'
import type { Project } from '../types/project'
import { promptTemplateService, type PromptTemplate } from '@/shared/services/promptTemplateService'
import { loadTTSService } from '@/shared/services/ttsServiceLoader'
import { localAudioStorageService } from '@/shared/services/localAudioStorageService'
import type { BuiltInVoice } from '@/shared/types'
import { useI18n } from '@/shared/i18n/I18nProvider'
import { resolveLocalizedText } from '@/shared/i18n/localizedText'
import {
  NO_BACKGROUND_MUSIC_VALUE,
  findBackgroundMusicByLabel,
  resolveBackgroundMusicSelectValue,
} from '../constants/backgroundMusic.constants'
import { useBackgroundMusicOptions } from '../hooks/useBackgroundMusicOptions'
import {
  buildNarrativeContextWithConfirmedAnswers,
  frameWorkflowSteps,
  narrativeQuestionAnswerPairsFromResponse,
  type FrameDebugStepId,
  type FrameDebugStepRecord,
  type FrameWorkflowContext,
  type FrameWorkflowStep,
  type NarrativeQuestionAnswerPair,
} from '@/features/projects/workflow/frame'
import {
  applyFrameWorkflowRunToProject,
  createEmptyFrameDebugRun,
  deleteFrameWorkflowProjectFields,
  getFrameWorkflowResult,
  runFrameWorkflow,
  type FrameDebugRun,
  type FrameWorkflowProjectFieldKey,
} from '@/features/projects/workflow/frame'
import {
  loadFrameDebugAsset,
  loadFrameDebugStorage,
  loadFrameDebugTimelineImage,
  persistFrameDebugRunAssets,
  sanitizeFrameDebugValue,
  saveFrameDebugPreset,
  saveFrameDebugRunHistory,
  type FrameDebugPreset,
} from '@/features/projects/workflow/frame/debug'
import { diffFrameDebugRuns } from '@/features/projects/workflow/frame/debug'
import {
  FRAME_INFERENCE_DEFAULT_N_FRAMES,
  resolveFrameInferenceMaxDecisions,
} from '../services/material/frameInferencePipelineService'

interface FrameDebugConfig {
  outputLanguage: string
  defaultNFrames: number
  maxDecisions: number
  narrationStyleId: string
  wordCount: string
  voice: string
  backgroundMusic: string
  backgroundMusicId?: number | null
  backgroundMusicUrl?: string | null
}

const defaultConfig: FrameDebugConfig = {
  outputLanguage: 'zh',
  defaultNFrames: FRAME_INFERENCE_DEFAULT_N_FRAMES,
  maxDecisions: resolveFrameInferenceMaxDecisions(),
  narrationStyleId: '电影电视剧',
  wordCount: '1200',
  voice: '',
  backgroundMusic: NO_BACKGROUND_MUSIC_VALUE,
  backgroundMusicId: null,
  backgroundMusicUrl: null,
}

const fileDependentStepIds: FrameDebugStepId[] = [
  'merge-videos',
  'extract-audio',
  'transcribe',
  'validate-subtitles',
  'decide-timeline-view',
  'generate-timeline-images',
  'analyze-timeline-images',
  'understand-narrative',
  'merge-video-context',
  'generate-narration-script',
  'match-narration-visuals',
  'generate-voiceover',
  'compose-final-video',
]

const normalizeSelectedFiles = (value: File[] | FileList | File | null): File[] => {
  if (!value) return []
  if (typeof File !== 'undefined' && value instanceof File) return [value]
  if (Array.isArray(value)) return value.filter((item): item is File => item instanceof File)
  if ('length' in value) {
    return Array.from(value).filter((item): item is File => item instanceof File)
  }
  return []
}

const normalizeDebugBackgroundMusic = (value: unknown) => {
  if (typeof value !== 'string' || !value || value === '选择背景音乐' || value === NO_BACKGROUND_MUSIC_VALUE) {
    return NO_BACKGROUND_MUSIC_VALUE
  }
  return value
}

const normalizeDebugConfig = (value: Record<string, unknown> | null | undefined): FrameDebugConfig => ({
  outputLanguage: typeof value?.outputLanguage === 'string'
    ? value.outputLanguage
    : typeof value?.output_language === 'string'
      ? value.output_language
      : defaultConfig.outputLanguage,
  defaultNFrames: typeof value?.defaultNFrames === 'number'
    ? value.defaultNFrames
    : typeof value?.default_n_frames === 'number'
      ? value.default_n_frames
      : defaultConfig.defaultNFrames,
  maxDecisions: typeof value?.maxDecisions === 'number'
    ? value.maxDecisions
    : typeof value?.max_decisions === 'number'
      ? value.max_decisions
      : defaultConfig.maxDecisions,
  narrationStyleId: typeof value?.narrationStyleId === 'string'
    ? value.narrationStyleId
    : typeof value?.narration_style_id === 'string'
      ? value.narration_style_id
      : defaultConfig.narrationStyleId,
  wordCount: typeof value?.wordCount === 'string' || typeof value?.wordCount === 'number'
    ? String(value.wordCount)
    : typeof value?.word_count === 'string' || typeof value?.word_count === 'number'
      ? String(value.word_count)
      : defaultConfig.wordCount,
  voice: typeof value?.voice === 'string'
    ? value.voice
    : defaultConfig.voice,
  backgroundMusic: typeof value?.backgroundMusic === 'string'
    ? normalizeDebugBackgroundMusic(value.backgroundMusic)
    : typeof value?.background_music === 'string'
      ? normalizeDebugBackgroundMusic(value.background_music)
      : defaultConfig.backgroundMusic,
  backgroundMusicId: typeof value?.backgroundMusicId === 'number'
    ? value.backgroundMusicId
    : typeof value?.background_music_id === 'number'
      ? value.background_music_id
      : null,
  backgroundMusicUrl: typeof value?.backgroundMusicUrl === 'string'
    ? value.backgroundMusicUrl
    : typeof value?.background_music_url === 'string'
      ? value.background_music_url
      : null,
})

const statusColor: Record<string, string> = {
  idle: 'gray',
  running: 'blue',
  success: 'green',
  error: 'red',
  skipped: 'yellow',
  cancelled: 'yellow',
}

const nonNarrationStyleKeywords = ['参考文案', '前情概要', '续写', '改写']

const isNarrationStyleTemplate = (template: PromptTemplate) => {
  const text = `${template.id} ${template.title} ${template.description ?? ''}`.toLowerCase()
  return !nonNarrationStyleKeywords.some(keyword => text.includes(keyword.toLowerCase()))
}

const jsonStringify = (value: unknown) => JSON.stringify(sanitizeFrameDebugValue(value ?? {}), null, 2)

const parseEditorValue = (value: string) => {
  if (!value.trim()) return undefined
  return JSON.parse(value) as unknown
}

const formatFileSize = (size: number) => {
  if (size >= 1024 * 1024 * 1024) return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}

const jsonPanelStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 13,
  lineHeight: 1.55,
  tabSize: 2,
} as const

const jsonCodeBlockStyle = {
  ...jsonPanelStyle,
  maxHeight: 420,
  overflow: 'auto',
  whiteSpace: 'pre',
  border: '1px solid var(--mantine-color-gray-3)',
  borderRadius: 'var(--mantine-radius-md)',
  padding: 'var(--mantine-spacing-md)',
} as const

const hasMeaningfulValue = (value: unknown) => {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0
  return true
}

const inferRecordStatus = (record: FrameDebugStepRecord | undefined) => {
  if (record?.status) return record.status
  if (record?.logs?.some((item) => item.includes('执行成功'))) return 'success'
  if (record?.logs?.some((item) => item.includes('失败'))) return 'error'
  return 'idle'
}

const getObjectKeys = (value: unknown) => (
  value && typeof value === 'object' ? Object.keys(value as Record<string, unknown>) : []
)

const hasObjectKey = (value: unknown, key: string) => (
  value !== null && typeof value === 'object' && key in value
)

const toTimelineRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' ? value as Record<string, unknown> : null
)

const timelineArray = (value: unknown) => (
  Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(toTimelineRecord(item))) : []
)

const timelineNumber = (value: unknown) => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
)

const timelineText = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
)

const timelineTextList = (value: unknown) => (
  Array.isArray(value) ? value.map(timelineText).filter(Boolean) : []
)

const timelineUnknownList = (value: unknown): unknown[] => (
  Array.isArray(value) ? value : []
)

const formatTimelineTime = (value: unknown) => {
  const number = timelineNumber(value)
  return number === null ? '--' : `${number.toFixed(2)}s`
}

const formatTimelineRange = (item: Record<string, unknown>) => (
  `${formatTimelineTime(item.start)} - ${formatTimelineTime(item.end)}`
)

const priorityLabel = (value: unknown) => {
  const key = timelineText(value).toLowerCase()
  if (key === 'high') return '高优先级'
  if (key === 'medium') return '中优先级'
  if (key === 'low') return '低优先级'
  return key || '未标注优先级'
}

const priorityColor = (value: unknown) => {
  const key = timelineText(value).toLowerCase()
  if (key === 'high') return 'red'
  if (key === 'medium') return 'yellow'
  if (key === 'low') return 'gray'
  return 'blue'
}

const triggerLabels: Record<string, string> = {
  ambiguous_pause: '模糊停顿',
  candidate_cut: '候选切点',
  rendered_cut: '渲染切点复核',
  rendered_cuts: '渲染切点复核',
  retake: '重拍对比',
  comparison: '多 take 对比',
  overlay: '字幕/贴片风险',
  subtitle: '字幕风险',
  continuity: '画面连续性',
  user_prompt: '用户点名复核',
}

const triggerLabel = (value: unknown) => {
  const key = timelineText(value)
  return triggerLabels[key] ?? (key || '未标注触发类型')
}

const chunkStatusLabel = (value: unknown) => {
  const key = timelineText(value)
  if (key === 'model_success') return '模型成功'
  if (key === 'failed') return '失败'
  if (key === 'skipped') return '已跳过'
  return key || '未知'
}

const chunkStatusColor = (value: unknown) => (
  timelineText(value) === 'failed'
    ? 'red'
    : timelineText(value) === 'running'
      ? 'blue'
      : timelineText(value) === 'pending'
        ? 'gray'
        : timelineText(value) === 'skipped'
          ? 'gray'
          : 'green'
)

const decideAnalysisFromOutput = (output: unknown) => {
  const record = toTimelineRecord(output)
  const analysis = toTimelineRecord(record?.analysis)
  const content = timelineText(record?.content)

  if (analysis) return analysis
  if (!content) return null

  try {
    return toTimelineRecord(JSON.parse(content))
  } catch {
    return null
  }
}

const isStepOutputCompatible = (
  stepId: FrameDebugStepId | undefined,
  output: unknown
) => {
  if (output === undefined) return false
  if (!stepId) return true

  switch (stepId) {
    case 'merge-videos':
      return hasObjectKey(output, 'file') && hasObjectKey(output, 'video')
    case 'extract-audio':
      return hasObjectKey(output, 'file') && hasObjectKey(output, 'audio')
    case 'transcribe':
      return hasObjectKey(output, 'transcription')
        || hasObjectKey(output, 'subtitleResult')
        || hasObjectKey(output, 'subtitlePayload')
        || hasObjectKey(output, 'initialVideoContext')
    case 'validate-subtitles':
      return hasObjectKey(output, 'validation')
        || hasObjectKey(output, 'subtitleResult')
        || hasObjectKey(output, 'subtitlePayload')
        || hasObjectKey(output, 'initialVideoContext')
    case 'decide-timeline-view':
      return hasObjectKey(output, 'decisions')
    case 'generate-timeline-images':
      return hasObjectKey(output, 'images')
    case 'analyze-timeline-images':
      return hasObjectKey(output, 'analyses')
    case 'understand-narrative':
      return hasObjectKey(output, 'analysis') || hasObjectKey(output, 'content')
    case 'merge-video-context':
      return hasObjectKey(output, 'videoContext') || hasObjectKey(output, 'pipelineResult')
    case 'generate-narration-script':
      return hasObjectKey(output, 'scriptResponse') || hasObjectKey(output, 'pipelineResult')
    case 'match-narration-visuals':
      return hasObjectKey(output, 'scriptResponse') || hasObjectKey(output, 'pipelineResult')
    case 'generate-voiceover':
      return hasObjectKey(output, 'voiceoverResult') || hasObjectKey(output, 'pipelineResult')
    case 'compose-final-video':
      return hasObjectKey(output, 'finalVideo') || hasObjectKey(output, 'pipelineResult')
    case 'persist-project':
      return hasObjectKey(output, 'writtenFields')
    default:
      return true
  }
}

const getDisplayOutput = (
  step: FrameWorkflowStep | undefined,
  record: FrameDebugStepRecord | undefined
) => {
  if (record?.output !== undefined) {
    if (!step || isStepOutputCompatible(step.id, record.output)) return record.output

    return {
      notice: `当前记录的 output 结构不属于“${step.label}”步骤。`,
      expected_step: step.id,
      captured_output_keys: getObjectKeys(record.output),
      likely_reason: '这通常来自旧缓存记录，或当前步骤执行时保存到了上游步骤的输出。',
      next_action: '请点击“仅执行当前步骤”重新运行该步骤；重新运行后这里应展示该步骤自己的完整 output。',
    }
  }

  if (inferRecordStatus(record) === 'success') {
    return {
      notice: '步骤记录显示成功，但没有捕获到 output 或 outputSummary。',
      likely_reason: '这通常来自旧缓存记录、后端返回空 body，或之前版本未完整保存输出。',
      next_action: '请重新执行当前步骤；如果仍为空，请查看浏览器 Network 中该后端接口的响应 body。',
    }
  }

  if (hasMeaningfulValue(record?.outputSummary)) return record?.outputSummary

  return {}
}

function StepOutputBreakdown({
  stepId,
  output,
  onOutputChange,
}: {
  stepId: FrameDebugStepId
  output: unknown
  onOutputChange?: (stepId: FrameDebugStepId, output: unknown) => void
}) {
  if (stepId === 'decide-timeline-view') {
    return <TimelineDecisionBreakdown output={output} />
  }

  if (stepId === 'generate-timeline-images') {
    return <TimelineImagesBreakdown output={output} />
  }

  if (stepId === 'analyze-timeline-images') {
    return <TimelineAnalysisBreakdown output={output} />
  }

  if (stepId === 'understand-narrative') {
    return <NarrativeUnderstandingBreakdown output={output} onOutputChange={onOutputChange} />
  }

  if (stepId === 'merge-video-context') {
    return <MergeVideoContextBreakdown output={output} />
  }

  if (stepId === 'generate-narration-script') {
    return <GeneratedScriptBreakdown output={output} />
  }

  if (stepId === 'match-narration-visuals') {
    return <GeneratedScriptBreakdown output={output} />
  }

  if (stepId === 'generate-voiceover') {
    return <VoiceoverBreakdown output={output} />
  }

  if (stepId === 'compose-final-video') {
    return <FinalVideoBreakdown output={output} />
  }

  if (stepId !== 'transcribe') return null

  if (!isStepOutputCompatible(stepId, output)) {
    return (
      <Alert color="yellow" icon={<ExclamationTriangleIcon size={16} />}>
        当前没有捕获到转录步骤自己的完整输出。转录成功后这里应包含 transcription、subtitleResult、subtitlePayload 和 initialVideoContext。
      </Alert>
    )
  }

  const typed = output as Record<string, unknown>
  const sections = [
    ['后端原始转录响应 transcription', typed.transcription],
    ['字幕识别结果 subtitleResult', typed.subtitleResult],
    ['项目字幕 payload subtitlePayload', typed.subtitlePayload],
    ['初始视频上下文 initialVideoContext', typed.initialVideoContext],
  ] as const

  return (
    <Stack gap="sm">
      {sections.map(([title, value]) => (
        <Paper key={title} withBorder radius="sm" p="sm">
          <Stack gap={6}>
            <Text fw={800} size="sm">{title}</Text>
            <Code block style={{ ...jsonCodeBlockStyle, maxHeight: 320 }}>
              {jsonStringify(value ?? null)}
            </Code>
          </Stack>
        </Paper>
      ))}
    </Stack>
  )
}

const timelineImageFile = (item: Record<string, unknown>) => (
  typeof File !== 'undefined' && item.file instanceof File ? item.file : null
)

const timelineImageSummary = (item: Record<string, unknown>) => (
  toTimelineRecord(item.image) ?? toTimelineRecord(item.file) ?? {}
)

const timelineImageName = (item: Record<string, unknown>) => {
  const file = timelineImageFile(item)
  if (file) return file.name
  const summary = timelineImageSummary(item)
  return timelineText(summary.name) || `timeline-view-${timelineNumber(item.decisionIndex) ?? 1}.png`
}

const timelinePreviewStorageKey = (item: Record<string, unknown>) => timelineText(item.previewStorageKey)

const analysisDisplayText = (value: unknown) => {
  const directText = timelineText(value)
  if (directText) return directText

  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  const record = toTimelineRecord(value)
  if (record) {
    const preferred = [
      record.summary,
      record.description,
      record.content,
      record.event,
      record.action,
      record.reason,
      record.status,
      record.value,
    ].map(timelineText).find(Boolean)
    if (preferred) return preferred
  }

  if (value !== null && value !== undefined) return jsonStringify(value)
  return '未返回'
}

const analysisEventTime = (record: Record<string, unknown> | null) => {
  if (!record) return '--'
  const timeText = timelineText(record.time) || timelineText(record.timestamp)
  if (timeText) return timeText
  if (timelineNumber(record.start) !== null || timelineNumber(record.end) !== null) {
    return formatTimelineRange(record)
  }
  return '--'
}

function TimelineAnalysisBreakdown({ output }: { output: unknown }) {
  if (!isStepOutputCompatible('analyze-timeline-images', output)) {
    return (
      <Alert color="yellow" icon={<ExclamationTriangleIcon size={16} />}>
        当前没有捕获到“分析时间线图”步骤自己的完整输出。成功后这里应包含 analyses 数组，每一项对应一张时间线图的视觉分析结果。
      </Alert>
    )
  }

  const outputRecord = toTimelineRecord(output)
  const analyses = timelineArray(outputRecord?.analyses)
  const totalTokens = analyses.reduce((sum, item) => {
    const response = toTimelineRecord(item.response) ?? {}
    const usage = toTimelineRecord(response.usage) ?? {}
    return sum + (timelineNumber(response.tokens_consumed) ?? timelineNumber(usage.total_tokens) ?? 0)
  }, 0)

  return (
    <Paper withBorder radius="sm" p="sm">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Box>
            <Text fw={800} size="sm">时间线图分析结果</Text>
            <Text size="sm" c="dimmed" maw={720}>
              这里按图片展示视觉模型看到了什么、它担心什么，以及建议后续脚本/剪辑分析关注哪里。
            </Text>
          </Box>
          <Group gap={6}>
            <Badge color="blue" variant="light">共 {analyses.length} 张</Badge>
            {totalTokens > 0 && <Badge color="violet" variant="light">{totalTokens} tokens</Badge>}
          </Group>
        </Group>

        {analyses.length > 0 ? (
          <Stack gap="sm">
            {analyses.map((item, index) => {
              const decision = toTimelineRecord(item.decision) ?? {}
              const image = toTimelineRecord(item.image) ?? {}
              const response = toTimelineRecord(item.response) ?? {}
              const responseRange = toTimelineRecord(response.range)
              const analysis = toTimelineRecord(response.analysis) ?? {}
              const visualEvents = timelineUnknownList(analysis.visual_events)
              const concerns = timelineTextList(analysis.concerns)
              const recommendations = timelineTextList(analysis.recommendations)
              const summary = timelineText(analysis.summary) || timelineText(response.content) || '模型未返回画面总结。'
              const tokens = timelineNumber(response.tokens_consumed) ?? timelineNumber(toTimelineRecord(response.usage)?.total_tokens)
              const nFrames = timelineNumber(response.n_frames) ?? timelineNumber(decision.n_frames)
              const model = timelineText(response.model)
              const provider = timelineText(response.provider)
              const rangeSource = responseRange ?? decision
              const cutSafety = analysis.cut_safety
              const otherAnalysisEntries = Object.entries(analysis).filter(([key]) => (
                !['summary', 'visual_events', 'cut_safety', 'concerns', 'recommendations'].includes(key)
              ))
              const requestMeta = {
                request_id: response.request_id,
                updated_at: response.updated_at,
                timeline_image_url: response.timeline_image_url,
                usage: response.usage,
                raw_result: response.raw_result,
              }
              const hasRequestMeta = hasMeaningfulValue(requestMeta.request_id)
                || hasMeaningfulValue(requestMeta.updated_at)
                || hasMeaningfulValue(requestMeta.timeline_image_url)
                || hasMeaningfulValue(requestMeta.usage)
                || hasMeaningfulValue(requestMeta.raw_result)

              return (
                <Paper key={`${timelineText(image.name) || 'analysis'}-${index}`} withBorder radius="sm" p="sm">
                  <Stack gap="sm">
                    <Group justify="space-between" align="flex-start">
                      <Box>
                        <Text fw={800} size="sm">第 {index + 1} 张图</Text>
                        <Text size="xs" c="dimmed">{formatTimelineRange(rangeSource)}</Text>
                      </Box>
                      <Group gap={6}>
                        {decision.priority !== undefined && (
                          <Badge color={priorityColor(decision.priority)} variant="light">
                            {priorityLabel(decision.priority)}
                          </Badge>
                        )}
                        {decision.trigger_type !== undefined && (
                          <Badge color="blue" variant="light">{triggerLabel(decision.trigger_type)}</Badge>
                        )}
                        {nFrames !== null && <Badge color="gray" variant="light">抽 {nFrames} 帧</Badge>}
                        {tokens !== null && <Badge color="violet" variant="light">{tokens} tokens</Badge>}
                      </Group>
                    </Group>

                    <Paper withBorder radius="sm" p="sm" bg="gray.0">
                      <Stack gap={4}>
                        <Text fw={800} size="sm">画面总结</Text>
                        <Text size="sm">{summary}</Text>
                      </Stack>
                    </Paper>

                    {visualEvents.length > 0 && (
                      <Box>
                        <Group justify="space-between" mb={6}>
                          <Text fw={800} size="sm">逐帧/画面事件</Text>
                          <Badge color="gray" variant="light">{visualEvents.length} 条</Badge>
                        </Group>
                        <Table withTableBorder withColumnBorders>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th w={160}>时间</Table.Th>
                              <Table.Th>看到的内容</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {visualEvents.map((event, eventIndex) => {
                              const eventRecord = toTimelineRecord(event)
                              return (
                                <Table.Tr key={eventIndex}>
                                  <Table.Td><Text size="sm">{analysisEventTime(eventRecord)}</Text></Table.Td>
                                  <Table.Td><Text size="sm">{analysisDisplayText(event)}</Text></Table.Td>
                                </Table.Tr>
                              )
                            })}
                          </Table.Tbody>
                        </Table>
                      </Box>
                    )}

                    {(concerns.length > 0 || recommendations.length > 0) && (
                      <Grid gap="sm">
                        <Grid.Col span={{ base: 12, md: 6 }}>
                          <Paper withBorder radius="sm" p="sm" h="100%">
                            <Text fw={800} size="sm" mb={6}>关注点/风险</Text>
                            {concerns.length > 0 ? (
                              <Stack gap={4}>
                                {concerns.map((item) => <Text key={item} size="sm">• {item}</Text>)}
                              </Stack>
                            ) : (
                              <Text size="sm" c="dimmed">模型未列出明确风险。</Text>
                            )}
                          </Paper>
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, md: 6 }}>
                          <Paper withBorder radius="sm" p="sm" h="100%">
                            <Text fw={800} size="sm" mb={6}>建议</Text>
                            {recommendations.length > 0 ? (
                              <Stack gap={4}>
                                {recommendations.map((item) => <Text key={item} size="sm">• {item}</Text>)}
                              </Stack>
                            ) : (
                              <Text size="sm" c="dimmed">模型未列出额外建议。</Text>
                            )}
                          </Paper>
                        </Grid.Col>
                      </Grid>
                    )}

                    {cutSafety !== undefined && (
                      <Paper withBorder radius="sm" p="sm">
                        <Text fw={800} size="sm" mb={6}>切点安全判断</Text>
                        <Text size="sm">{analysisDisplayText(cutSafety)}</Text>
                      </Paper>
                    )}

                    {otherAnalysisEntries.length > 0 && (
                      <Paper withBorder radius="sm" p="sm">
                        <Text fw={800} size="sm" mb={6}>其他分析字段</Text>
                        <Table withTableBorder withColumnBorders>
                          <Table.Tbody>
                            {otherAnalysisEntries.map(([key, value]) => (
                              <Table.Tr key={key}>
                                <Table.Td w={180}><Code>{key}</Code></Table.Td>
                                <Table.Td><Text size="sm">{analysisDisplayText(value)}</Text></Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </Paper>
                    )}

                    <Grid gap="sm">
                      <Grid.Col span={{ base: 12, md: 6 }}>
                        <Paper withBorder radius="sm" p="sm" h="100%">
                          <Text fw={800} size="sm" mb={6}>图片信息</Text>
                          <Stack gap={4}>
                            <Text size="sm">文件：{timelineText(image.name) || '未返回文件名'}</Text>
                            {timelineNumber(image.size) !== null && (
                              <Text size="sm">大小：{formatFileSize(timelineNumber(image.size) ?? 0)}</Text>
                            )}
                            {timelineText(image.objectKey) && <Text size="sm">临时对象：{timelineText(image.objectKey)}</Text>}
                          </Stack>
                        </Paper>
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, md: 6 }}>
                        <Paper withBorder radius="sm" p="sm" h="100%">
                          <Text fw={800} size="sm" mb={6}>模型信息</Text>
                          <Stack gap={4}>
                            <Text size="sm">服务：{provider || '未返回'}</Text>
                            <Text size="sm">模型：{model || '未返回'}</Text>
                            {timelineText(decision.reason) && (
                              <Text size="sm">分析对象：{timelineText(decision.reason)}</Text>
                            )}
                          </Stack>
                        </Paper>
                      </Grid.Col>
                    </Grid>

                    {hasRequestMeta && (
                      <Paper withBorder radius="sm" p="sm">
                        <Text fw={800} size="sm" mb={6}>接口返回明细</Text>
                        <Code block style={{ ...jsonCodeBlockStyle, maxHeight: 220 }}>
                          {jsonStringify(requestMeta)}
                        </Code>
                      </Paper>
                    )}
                  </Stack>
                </Paper>
              )
            })}
          </Stack>
        ) : (
          <Alert color="gray">
            没有可展示的时间线图分析结果。通常是上一阶段没有生成图片，或当前步骤尚未成功执行。
          </Alert>
        )}
      </Stack>
    </Paper>
  )
}

function TimelineImagesBreakdown({ output }: { output: unknown }) {
  const outputRecord = toTimelineRecord(output)
  const images = useMemo(() => timelineArray(outputRecord?.images), [outputRecord])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loadedStorageKeys, setLoadedStorageKeys] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    const nextUrls: Record<string, string> = {}
    const createdUrls: string[] = []
    let cancelled = false
    setLoadedStorageKeys(new Set())

    images.forEach((item, index) => {
      const file = timelineImageFile(item)
      if (!file || typeof URL.createObjectURL !== 'function') return
      const url = URL.createObjectURL(file)
      nextUrls[String(index)] = url
      createdUrls.push(url)
    })

    setUrls(nextUrls)

    const loadPersistedImages = async () => {
      if (typeof URL.createObjectURL !== 'function') return

      const loadedEntries = await Promise.all(images.map(async (item, index) => {
        if (nextUrls[String(index)]) return null

        const storageKey = timelinePreviewStorageKey(item)
        if (!storageKey) return null

        const blob = await loadFrameDebugTimelineImage(storageKey)
        if (!blob || cancelled) return null

        const url = URL.createObjectURL(blob)
        createdUrls.push(url)
        return {
          index: String(index),
          storageKey,
          url,
        }
      }))

      if (cancelled) {
        loadedEntries.forEach((entry) => {
          if (entry && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(entry.url)
        })
        return
      }

      const validEntries = loadedEntries.filter((entry): entry is { index: string; storageKey: string; url: string } => Boolean(entry))
      if (validEntries.length === 0) return

      setUrls((current) => ({
        ...current,
        ...Object.fromEntries(validEntries.map((entry) => [entry.index, entry.url])),
      }))
      setLoadedStorageKeys((current) => new Set([
        ...current,
        ...validEntries.map((entry) => entry.storageKey),
      ]))
    }

    void loadPersistedImages()

    return () => {
      cancelled = true
      if (typeof URL.revokeObjectURL !== 'function') return
      createdUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [images])

  if (!isStepOutputCompatible('generate-timeline-images', output)) {
    return (
      <Alert color="yellow" icon={<ExclamationTriangleIcon size={16} />}>
        当前没有捕获到“生成时间线图”步骤自己的完整输出。成功后这里应包含 images 数组和每张时间线图的 File。
      </Alert>
    )
  }

  return (
    <Paper withBorder radius="sm" p="sm">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Box>
            <Text fw={800} size="sm">时间线图预览</Text>
            <Text size="sm" c="dimmed" maw={680}>
              这里展示前端按“判断视觉片段”结果实际拼出的图片；下一步视觉模型会逐张分析这些图。
            </Text>
          </Box>
          <Badge color="blue" variant="light">共 {images.length} 张</Badge>
        </Group>

        {images.length > 0 ? (
          <Stack gap="sm">
            {images.map((item, index) => {
              const decision = toTimelineRecord(item.decision) ?? {}
              const summary = timelineImageSummary(item)
              const nFrames = timelineNumber(item.nFrames) ?? timelineNumber(decision.n_frames)
              const reason = timelineText(decision.reason)
              const url = urls[String(index)]
              const fileName = timelineImageName(item)
              const fileSize = timelineNumber(summary.size)
              const storageKey = timelinePreviewStorageKey(item)
              const loadedFromBrowser = storageKey && loadedStorageKeys.has(storageKey)

              return (
                <Paper key={`${fileName}-${index}`} withBorder radius="sm" p="sm">
                  <Stack gap="xs">
                    <Group justify="space-between" align="flex-start">
                      <Box>
                        <Text fw={800} size="sm">时间线图 {index + 1}</Text>
                        <Text size="xs" c="dimmed">{formatTimelineRange(decision)}</Text>
                      </Box>
                      <Group gap={6}>
                        {decision.priority !== undefined && (
                          <Badge color={priorityColor(decision.priority)} variant="light">
                            {priorityLabel(decision.priority)}
                          </Badge>
                        )}
                        {decision.trigger_type !== undefined && (
                          <Badge color="blue" variant="light">{triggerLabel(decision.trigger_type)}</Badge>
                        )}
                        {nFrames !== null && <Badge color="gray" variant="light">抽 {nFrames} 帧</Badge>}
                      </Group>
                    </Group>

                    {url ? (
                      <Stack gap={6}>
                        {loadedFromBrowser && (
                          <Badge color="green" variant="light" w="fit-content">已从浏览器存储恢复</Badge>
                        )}
                        <Box
                          component="img"
                          src={url}
                          alt={`时间线图 ${index + 1}`}
                          style={{
                            width: '100%',
                            maxHeight: 420,
                            objectFit: 'contain',
                            border: '1px solid var(--mantine-color-gray-3)',
                            borderRadius: 'var(--mantine-radius-md)',
                            background: 'var(--mantine-color-dark-9)',
                          }}
                        />
                      </Stack>
                    ) : (
                      <Alert color="gray">
                        当前记录里没有可预览的时间线图片。重新执行“生成时间线图”会把图片写入浏览器存储，之后刷新页面也能恢复预览。
                      </Alert>
                    )}

                    <Group gap="xs">
                      <Badge color="gray" variant="light">{fileName}</Badge>
                      {fileSize !== null && <Badge color="gray" variant="light">{formatFileSize(fileSize)}</Badge>}
                    </Group>
                    {reason && <Text size="sm">分析对象：{reason}</Text>}
                  </Stack>
                </Paper>
              )
            })}
          </Stack>
        ) : (
          <Alert color="gray">
            没有生成时间线图。通常是上一步没有返回关键视觉片段，或当前步骤尚未成功执行。
          </Alert>
        )}
      </Stack>
    </Paper>
  )
}

function TimelineDecisionBreakdown({ output }: { output: unknown }) {
  const [expandedChunkId, setExpandedChunkId] = useState<string | null>(null)
  if (!isStepOutputCompatible('decide-timeline-view', output)) {
    return (
      <Alert color="yellow" icon={<ExclamationTriangleIcon size={16} />}>
        当前没有捕获到“判断视觉片段”步骤自己的完整输出。成功后这里应包含 analysis、decisions、tokens_consumed 等字段。
      </Alert>
    )
  }

  const outputRecord = toTimelineRecord(output)
  const analysis = decideAnalysisFromOutput(output) ?? {}
  const decisions = timelineArray(outputRecord?.decisions).length > 0
    ? timelineArray(outputRecord?.decisions)
    : timelineArray(analysis.decisions)
  const skipped = timelineArray(analysis.skipped)
  const notes = Array.isArray(analysis.global_notes)
    ? analysis.global_notes.map(timelineText).filter(Boolean)
    : []
  const needsTimeline = typeof analysis.needs_timeline_view === 'boolean'
    ? analysis.needs_timeline_view
    : decisions.length > 0
  const summary = timelineText(analysis.summary) || (
    needsTimeline ? '模型判断存在需要视觉辅助复核的关键片段。' : '模型判断当前没有必须生成视觉辅助图的关键片段。'
  )
  const confidence = timelineText(analysis.confidence)
  const tokens = timelineNumber(outputRecord?.tokens_consumed)
  const strategy = toTimelineRecord(outputRecord?.strategy)
  const chunks = timelineArray(outputRecord?.chunks)
  const failedChunks = timelineArray(outputRecord?.failed_chunks)
  const chunkRequestIds = Array.isArray(outputRecord?.chunk_request_ids)
    ? outputRecord.chunk_request_ids.map(timelineText).filter(Boolean)
    : []
  const strategyMode = timelineText(strategy?.mode)

  return (
    <Paper withBorder radius="sm" p="sm">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Box>
            <Text fw={800} size="sm">视觉决策解读</Text>
            <Text size="sm" c="dimmed" maw={680}>{summary}</Text>
          </Box>
          <Group gap={6}>
            <Badge color={needsTimeline ? 'green' : 'gray'} variant="light">
              {needsTimeline ? '需要视觉图' : '无需视觉图'}
            </Badge>
            <Badge color="blue" variant="light">关键片段 {decisions.length}</Badge>
            {strategyMode && (
              <Badge color={strategyMode === 'chunked_frontend' ? 'indigo' : 'gray'} variant="light">
                {strategyMode === 'chunked_frontend' ? '分片决策' : '单次决策'}
              </Badge>
            )}
            {chunks.length > 0 && <Badge color="gray" variant="light">分片 {chunks.length}</Badge>}
            {failedChunks.length > 0 && <Badge color="red" variant="light">失败分片 {failedChunks.length}</Badge>}
            {confidence && <Badge color="gray" variant="light">置信度 {confidence}</Badge>}
            {tokens !== null && <Badge color="violet" variant="light">{tokens} tokens</Badge>}
          </Group>
        </Group>

        {failedChunks.length > 0 && (
          <Alert color="red" icon={<ExclamationTriangleIcon size={16} />}>
            有 {failedChunks.length} 个分片模型请求失败；这些分片只保留诊断信息，不会生成本地兜底关键片段。
          </Alert>
        )}

        {decisions.length > 0 ? (
          <Stack gap="xs">
            {decisions.map((decision, index) => {
              const reason = timelineText(decision.reason) || '模型未返回具体原因'
              const expectedQuestion = timelineText(decision.expected_question)
              const nFrames = timelineNumber(decision.n_frames)
              const chunkId = timelineText(decision.chunk_id)

              return (
                <Paper key={`${formatTimelineRange(decision)}-${index}`} withBorder radius="sm" p="sm">
                  <Stack gap={6}>
                    <Group justify="space-between" align="flex-start">
                      <Box>
                        <Text fw={800} size="sm">关键片段 {index + 1}</Text>
                        <Text size="xs" c="dimmed">{formatTimelineRange(decision)}</Text>
                      </Box>
                      <Group gap={6}>
                        {chunkId && <Badge color="gray" variant="light">{chunkId}</Badge>}
                        <Badge color={priorityColor(decision.priority)} variant="light">
                          {priorityLabel(decision.priority)}
                        </Badge>
                        <Badge color="blue" variant="light">{triggerLabel(decision.trigger_type)}</Badge>
                        {nFrames !== null && <Badge color="gray" variant="light">抽 {nFrames} 帧</Badge>}
                      </Group>
                    </Group>
                    <Text size="sm">含义：{reason}</Text>
                    {expectedQuestion && (
                      <Text size="sm" c="dimmed">生成图后要回答：{expectedQuestion}</Text>
                    )}
                  </Stack>
                </Paper>
              )
            })}
          </Stack>
        ) : (
          <Alert color="gray">
            这次没有关键视觉片段。后续“生成时间线图”和“分析时间线图”通常不会产生新内容。
          </Alert>
        )}

        {chunks.length > 0 && (
          <Box>
            <Group justify="space-between" mb={6}>
              <Text fw={800} size="sm">分片执行状态</Text>
              <Group gap={6}>
                <Badge color="gray" variant="light">请求 {chunkRequestIds.length}</Badge>
                {failedChunks.length > 0 && <Badge color="red" variant="light">失败 {failedChunks.length}</Badge>}
              </Group>
            </Group>
            <Table withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>分片</Table.Th>
                  <Table.Th>时间段</Table.Th>
                  <Table.Th>状态</Table.Th>
                  <Table.Th>候选/决策</Table.Th>
                  <Table.Th>备注</Table.Th>
                  <Table.Th>请求</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {chunks.map((chunk, index) => {
                  const status = timelineText(chunk.status)
                  const candidates = timelineArray(chunk.candidates)
                  const chunkDecisions = timelineArray(chunk.decisions)
                  const attempts = timelineNumber(chunk.attempt_count)
                  const chunkTokens = timelineNumber(chunk.tokens_consumed)
                  const error = timelineText(chunk.error)
                  const chunkId = timelineText(chunk.chunk_id) || `chunk-${index}`
                  const isExpanded = expandedChunkId === chunkId
                  const chunkRequest = toTimelineRecord(chunk.request)
                  const videoContextText = timelineText(chunkRequest?.videoContext)
                  return (
                    <React.Fragment key={chunkId}>
                      <Table.Tr>
                        <Table.Td>
                          <Stack gap={2}>
                            <Text size="sm" fw={700}>{timelineText(chunk.chunk_id) || `chunk-${index + 1}`}</Text>
                            <Text size="xs" c="dimmed">第 {index + 1} 片</Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td><Text size="sm">{formatTimelineRange(chunk)}</Text></Table.Td>
                        <Table.Td>
                          <Stack gap={4}>
                            <Badge color={chunkStatusColor(status)} variant={status === 'failed' ? 'filled' : 'light'}>
                              {chunkStatusLabel(status)}
                            </Badge>
                            {attempts !== null && <Text size="xs" c="dimmed">尝试 {attempts} 次</Text>}
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Stack gap={2}>
                            <Text size="sm">候选 {candidates.length} / 决策 {chunkDecisions.length}</Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Stack gap={2}>
                            {chunkTokens !== null && <Text size="xs" c="dimmed">{chunkTokens} tokens</Text>}
                            <Text size="xs" c={error ? 'orange.7' : 'dimmed'}>
                              {error || timelineText(chunk.request_id) || '已完成'}
                            </Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Button
                            size="xs"
                            variant="light"
                            onClick={() => setExpandedChunkId(isExpanded ? null : chunkId)}
                          >
                            {isExpanded ? '收起' : '查看请求'}
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                      <Table.Tr>
                        <Table.Td colSpan={6} p={0}>
                          <Collapse expanded={isExpanded} keepMounted>
                            <Box p="md" style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
                              <Stack gap="sm">
                                {videoContextText && (
                                  <Box>
                                    <Text fw={800} size="sm" mb={4}>videoContext（发送给模型的 Prompt 文本）</Text>
                                    <Code block style={{ ...jsonCodeBlockStyle, maxHeight: 360 }}>
                                      {videoContextText}
                                    </Code>
                                  </Box>
                                )}
                                <Box>
                                  <Text fw={800} size="sm" mb={4}>完整请求 Payload（对应 buildDecideTimelineViewBody 输出）</Text>
                                  <Code block style={jsonCodeBlockStyle}>
                                    {jsonStringify(chunk.request ?? null)}
                                  </Code>
                                </Box>
                              </Stack>
                            </Box>
                          </Collapse>
                        </Table.Td>
                      </Table.Tr>
                    </React.Fragment>
                  )
                })}
              </Table.Tbody>
            </Table>
          </Box>
        )}

        {skipped.length > 0 && (
          <Box>
            <Group justify="space-between" mb={6}>
              <Text fw={800} size="sm">跳过片段原因</Text>
              <Badge color="gray" variant="light">展示前 {Math.min(6, skipped.length)} / {skipped.length}</Badge>
            </Group>
            <Table withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>时间段</Table.Th>
                  <Table.Th>为什么跳过</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {skipped.slice(0, 6).map((item, index) => (
                  <Table.Tr key={`${formatTimelineRange(item)}-${index}`}>
                    <Table.Td><Text size="sm">{formatTimelineRange(item)}</Text></Table.Td>
                    <Table.Td><Text size="sm">{timelineText(item.reason) || '未返回原因'}</Text></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Box>
        )}

        {notes.length > 0 && (
          <Box>
            <Text fw={800} size="sm" mb={4}>全局备注</Text>
            <Stack gap={4}>
              {notes.map((note) => (
                <Text key={note} size="sm" c="dimmed">• {note}</Text>
              ))}
            </Stack>
          </Box>
        )}
      </Stack>
    </Paper>
  )
}

function StepProgressPanel({ record }: { record: FrameDebugStepRecord | undefined }) {
  const progress = toTimelineRecord(record?.progress)
  if (!progress) return null

  const percentage = Math.max(0, Math.min(100, timelineNumber(progress.percentage) ?? 0))
  const message = timelineText(progress.message) || '正在执行当前步骤。'
  const stage = timelineText(progress.stage)
  const currentChunk = timelineText(progress.current_chunk)
  const completed = timelineNumber(progress.completed_chunks)
  const total = timelineNumber(progress.total_chunks)
  const chunks = timelineArray(progress.chunks)

  return (
    <Paper withBorder radius="sm" p="sm">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Box>
            <Text fw={800} size="sm">实时执行进度</Text>
            <Text size="sm" c="dimmed">{message}</Text>
          </Box>
          <Group gap={6}>
            {stage && <Badge color="blue" variant="light">{stage}</Badge>}
            {currentChunk && <Badge color="indigo" variant="light">{currentChunk}</Badge>}
            {total !== null && <Badge color="gray" variant="light">{completed ?? 0} / {total}</Badge>}
          </Group>
        </Group>
        <Progress value={percentage} radius="xl" size="md" striped animated={record?.status === 'running'} />
        {chunks.length > 0 && (
          <Table withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>分片</Table.Th>
                <Table.Th>时间段</Table.Th>
                <Table.Th>状态</Table.Th>
                <Table.Th>候选/决策</Table.Th>
                <Table.Th>备注</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {chunks.map((chunk, index) => {
                const status = timelineText(chunk.status)
                const candidates = timelineNumber(chunk.candidates) ?? 0
                const decisions = timelineNumber(chunk.decisions) ?? 0
                const attemptCount = timelineNumber(chunk.attempt_count)
                const error = timelineText(chunk.error)
                return (
                  <Table.Tr key={timelineText(chunk.chunk_id) || `progress-chunk-${index}`}>
                    <Table.Td>
                      <Stack gap={2}>
                        <Text size="sm" fw={700}>{timelineText(chunk.chunk_id) || `chunk-${index + 1}`}</Text>
                        <Text size="xs" c="dimmed">第 {index + 1} 片</Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td><Text size="sm">{formatTimelineRange(chunk)}</Text></Table.Td>
                    <Table.Td>
                      <Badge color={chunkStatusColor(status)} variant={status === 'failed' ? 'filled' : 'light'}>
                        {status === 'pending' ? '等待中' : status === 'running' ? '执行中' : chunkStatusLabel(status)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">候选 {candidates} / 决策 {decisions}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={2}>
                        {attemptCount !== null && <Text size="xs" c="dimmed">尝试 {attemptCount} 次</Text>}
                        {error && <Text size="xs" c="orange.7">{error}</Text>}
                      </Stack>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Paper>
  )
}

function StepLogStreamPanel({ record }: { record: FrameDebugStepRecord | undefined }) {
  const logs = record?.logs?.length ? record.logs : ['尚未运行该步骤。']
  const progress = toTimelineRecord(record?.progress)
  const streamOutput = timelineText(progress?.stream_output_preview) || latestLogPayload(logs, '模型输出：')
  const streamThinking = timelineText(progress?.stream_thinking_preview) || latestLogPayload(logs, '模型思考流：')
  const streamOutputChars = timelineNumber(progress?.stream_output_chars)
  const streamThinkingChars = timelineNumber(progress?.stream_thinking_chars)
  const hasStreamContent = Boolean(streamOutput || streamThinking || record?.status === 'running')
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const lastLog = logs[logs.length - 1]

  useEffect(() => {
    const node = viewportRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [lastLog, logs.length, record?.status])

  return (
    <Paper withBorder radius="sm" p="sm">
      <Stack gap={6}>
        <Group justify="space-between">
          <Text fw={800} size="sm">简要运行日志</Text>
          {record?.status === 'running' && <Badge color="blue" variant="light">流式更新中</Badge>}
        </Group>
        {hasStreamContent && (
          <Paper withBorder radius="sm" p="xs" bg="blue.0">
            <Stack gap={6}>
              <Group justify="space-between" gap="xs">
                <Text fw={800} size="xs" c="blue.8">模型流式输出</Text>
                <Group gap={6}>
                  {streamOutputChars !== null && <Badge size="xs" color="blue" variant="white">输出 {streamOutputChars} 字符</Badge>}
                  {streamThinkingChars !== null && <Badge size="xs" color="indigo" variant="white">思考 {streamThinkingChars} 字符</Badge>}
                </Group>
              </Group>
              {streamThinking && (
                <Box>
                  <Text size="xs" fw={700} c="indigo.7">思考流</Text>
                  <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {streamThinking}
                  </Text>
                </Box>
              )}
              <Box>
                <Text size="xs" fw={700} c="blue.7">输出流</Text>
                <Text size="sm" c={streamOutput ? 'dark.7' : 'dimmed'} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {streamOutput || '等待模型输出...'}
                </Text>
              </Box>
            </Stack>
          </Paper>
        )}
        <Box
          ref={viewportRef}
          style={{
            maxHeight: 240,
            overflowY: 'auto',
            paddingRight: 4,
          }}
        >
          <Stack gap={4}>
            {logs.map((item, index) => (
              <Text key={`${index}-${item}`} size="sm" c={record?.status === 'running' && index === logs.length - 1 ? 'blue.7' : 'dimmed'}>
                • {item}
              </Text>
            ))}
          </Stack>
        </Box>
      </Stack>
    </Paper>
  )
}

const latestLogPayload = (logs: string[], prefix: string) => {
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const item = logs[index]
    if (item.startsWith(prefix)) return item.slice(prefix.length).trim()
  }
  return ''
}

const videoContextItems = (videoContext: Record<string, unknown>) => {
  const items = toTimelineRecord(videoContext.items) ?? {}
  return Object.entries(items)
    .map(([id, value]) => {
      const item = toTimelineRecord(value)
      if (!item) return null
      return {
        id,
        item,
        start: timelineNumber(item.start_time),
        end: timelineNumber(item.end_time),
        subtitle: timelineText(item.subtitle),
        visual: timelineText(item.visual),
        speakerId: item.speaker_id,
      }
    })
    .filter((item): item is {
      id: string
      item: Record<string, unknown>
      start: number | null
      end: number | null
      subtitle: string
      visual: string
      speakerId: unknown
    } => Boolean(item))
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
}

const analysisSummaryFromItem = (item: Record<string, unknown>) => {
  const response = toTimelineRecord(item.response) ?? {}
  const analysis = toTimelineRecord(response.analysis) ?? {}
  return timelineText(analysis.summary) || timelineText(response.content) || '未返回视觉摘要'
}

const narrativeAnalysisFromOutput = (output: unknown) => {
  const record = toTimelineRecord(output) ?? {}
  const analysis = toTimelineRecord(record.analysis)
  if (analysis) return analysis

  const content = timelineText(record.content)
  if (!content) return {}
  try {
    return toTimelineRecord(JSON.parse(content)) ?? {}
  } catch {
    return {}
  }
}

const buildNarrativeOutputWithQuestionAnswers = (
  output: unknown,
  questionAnswers: NarrativeQuestionAnswerPair[]
) => {
  const record = toTimelineRecord(output)
  if (!record) return output
  const analysis = narrativeAnalysisFromOutput(output)
  const confirmedAnswers = questionAnswers.filter((item) => item.answer.trim())
  return {
    ...record,
    analysis: {
      ...analysis,
      open_questions: questionAnswers,
      confirmed_question_answers: confirmedAnswers,
    },
    confirmed_question_answers: confirmedAnswers,
  }
}

const narrativeListScore = (items: unknown[]): number => (
  items.reduce<number>((score, item) => {
    const record = toTimelineRecord(item)
    if (!record) return score + (hasMeaningfulValue(item) ? 1 : 0)
    return score + Object.values(record).filter(hasMeaningfulValue).length
  }, items.length)
)

const bestNarrativeList = (...values: unknown[]): unknown[] => (
  values
    .map(timelineUnknownList)
    .filter((items) => items.length > 0)
    .sort((a, b) => narrativeListScore(b) - narrativeListScore(a))[0] ?? []
)

function NarrativeUnderstandingBreakdown({
  output,
  onOutputChange,
}: {
  output: unknown
  onOutputChange?: (stepId: FrameDebugStepId, output: unknown) => void
}) {
  if (!isStepOutputCompatible('understand-narrative', output)) {
    return (
      <Alert color="yellow" icon={<ExclamationTriangleIcon size={16} />}>
        当前没有捕获到“剧情理解”步骤自己的完整输出。成功后这里应包含 analysis，并拆出人物、关系、情绪曲线和事件。
      </Alert>
    )
  }

  const outputRecord = toTimelineRecord(output) ?? {}
  const analysis = narrativeAnalysisFromOutput(output)
  const plot = toTimelineRecord(analysis.plot) ?? {}
  const characters = bestNarrativeList(outputRecord.characters, analysis.characters)
  const relationships = bestNarrativeList(outputRecord.relationships, analysis.relationships)
  const emotionCurve = bestNarrativeList(outputRecord.emotion_curve, analysis.emotion_curve)
  const events = bestNarrativeList(outputRecord.events, analysis.events)
  const conflicts = timelineUnknownList(analysis.conflicts)
  const themes = timelineUnknownList(analysis.themes)
  const questionAnswers = narrativeQuestionAnswerPairsFromResponse(outputRecord)
  const summary = timelineText(analysis.summary) || timelineText(outputRecord.content) || '模型未返回剧情摘要。'
  const tokens = timelineNumber(outputRecord.tokens_consumed)
  const updateQuestionAnswer = (index: number, answer: string) => {
    const nextQuestionAnswers = questionAnswers.map((item, itemIndex) => (
      itemIndex === index ? { ...item, answer } : item
    ))
    onOutputChange?.(
      'understand-narrative',
      buildNarrativeOutputWithQuestionAnswers(output, nextQuestionAnswers)
    )
  }

  return (
    <Paper withBorder radius="sm" p="sm">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Box>
            <Text fw={800} size="sm">剧情理解结果</Text>
            <Text size="sm" c="dimmed" maw={740}>{summary}</Text>
          </Box>
          <Group gap={6}>
            <Badge color="blue" variant="light">人物 {characters.length}</Badge>
            <Badge color="grape" variant="light">关系 {relationships.length}</Badge>
            <Badge color="orange" variant="light">事件 {events.length}</Badge>
            {tokens !== null && <Badge color="violet" variant="light">{tokens} tokens</Badge>}
          </Group>
        </Group>

        {hasMeaningfulValue(plot) && (
          <Grid gap="sm">
            {[
              ['故事前提', plot.premise],
              ['当前阶段', plot.current_stage],
              ['风险/目标', plot.stakes],
            ].map(([label, value]) => (
              <Grid.Col key={String(label)} span={{ base: 12, md: 4 }}>
                <Paper withBorder radius="sm" p="sm" h="100%">
                  <Text size="xs" c="dimmed">{String(label)}</Text>
                  <Text size="sm">{analysisDisplayText(value)}</Text>
                </Paper>
              </Grid.Col>
            ))}
          </Grid>
        )}

        {characters.length > 0 && (
          <Box>
            <Group justify="space-between" mb={6}>
              <Text fw={800} size="sm">人物理解</Text>
              <Badge color="blue" variant="light">{characters.length} 个</Badge>
            </Group>
            <Stack gap="xs">
              {characters.map((item, index) => {
                const record = toTimelineRecord(item) ?? {}
                const id = timelineText(record.id) || timelineText(record.name) || `人物 ${index + 1}`
                return (
                  <Paper key={`${id}-${index}`} withBorder radius="sm" p="sm">
                    <Group justify="space-between" align="flex-start">
                      <Box>
                        <Text fw={800} size="sm">{id}</Text>
                        <Text size="sm">{timelineText(record.role) || '未标注人物功能'}</Text>
                      </Box>
                      {timelineText(record.emotional_state) && (
                        <Badge color="orange" variant="light">{timelineText(record.emotional_state)}</Badge>
                      )}
                    </Group>
                    <Text size="sm" c="dimmed" mt={6}>{analysisDisplayText(record.goals ?? record.traits ?? record.evidence)}</Text>
                  </Paper>
                )
              })}
            </Stack>
          </Box>
        )}

        {relationships.length > 0 && (
          <Box>
            <Text fw={800} size="sm" mb={6}>人物关系</Text>
            <Table withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>关系</Table.Th>
                  <Table.Th>动态</Table.Th>
                  <Table.Th>证据</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {relationships.map((item, index) => {
                  const record = toTimelineRecord(item) ?? {}
                  return (
                    <Table.Tr key={index}>
                      <Table.Td><Text size="sm">{analysisDisplayText(record.source)} → {analysisDisplayText(record.target)}：{analysisDisplayText(record.relationship)}</Text></Table.Td>
                      <Table.Td><Text size="sm">{analysisDisplayText(record.dynamics)}</Text></Table.Td>
                      <Table.Td><Text size="sm">{analysisDisplayText(record.evidence)}</Text></Table.Td>
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </Box>
        )}

        {emotionCurve.length > 0 && (
          <Box>
            <Text fw={800} size="sm" mb={6}>情绪曲线</Text>
            <Table withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={150}>时间</Table.Th>
                  <Table.Th>人物</Table.Th>
                  <Table.Th>情绪</Table.Th>
                  <Table.Th>原因</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {emotionCurve.map((item, index) => {
                  const record = toTimelineRecord(item) ?? {}
                  return (
                    <Table.Tr key={index}>
                      <Table.Td><Text size="sm">{formatTimelineRange(record)}</Text></Table.Td>
                      <Table.Td><Text size="sm">{analysisDisplayText(record.character)}</Text></Table.Td>
                      <Table.Td><Text size="sm">{analysisDisplayText(record.emotion)} · 强度 {analysisDisplayText(record.intensity)}</Text></Table.Td>
                      <Table.Td><Text size="sm">{analysisDisplayText(record.reason)}</Text></Table.Td>
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </Box>
        )}

        {events.length > 0 && (
          <Box>
            <Text fw={800} size="sm" mb={6}>关键事件</Text>
            <Stack gap="xs">
              {events.map((item, index) => {
                const record = toTimelineRecord(item) ?? {}
                return (
                  <Paper key={index} withBorder radius="sm" p="sm">
                    <Group justify="space-between" align="flex-start">
                      <Box>
                        <Text fw={800} size="sm">事件 {index + 1}</Text>
                        <Text size="xs" c="dimmed">{formatTimelineRange(record)}</Text>
                      </Box>
                      <Group gap={6}>
                        {record.type !== undefined && <Badge color="blue" variant="light">{analysisDisplayText(record.type)}</Badge>}
                        {record.importance !== undefined && <Badge color="red" variant="light">{analysisDisplayText(record.importance)}</Badge>}
                      </Group>
                    </Group>
                    <Text size="sm" mt={6}>{analysisDisplayText(record.description)}</Text>
                    <Text size="sm" c="dimmed">参与者：{analysisDisplayText(record.participants)}</Text>
                  </Paper>
                )
              })}
            </Stack>
          </Box>
        )}

        {(conflicts.length > 0 || themes.length > 0 || questionAnswers.length > 0) && (
          <Grid gap="sm">
            {[
              ['主要冲突', conflicts],
              ['主题/看点', themes],
            ].map(([label, value]) => (
              <Grid.Col key={String(label)} span={{ base: 12, md: 4 }}>
                <Paper withBorder radius="sm" p="sm" h="100%">
                  <Text fw={800} size="sm" mb={6}>{String(label)}</Text>
                  <Text size="sm">{analysisDisplayText(value)}</Text>
                </Paper>
              </Grid.Col>
            ))}
            {questionAnswers.length > 0 && (
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Paper withBorder radius="sm" p="sm" h="100%">
                  <Text fw={800} size="sm" mb={6}>待确认问题（QA）</Text>
                  <Stack gap="xs">
                    {questionAnswers.map((item, index) => (
                      <Paper key={`${item.question}-${index}`} withBorder radius="sm" p="xs">
                        <Text size="xs" c="dimmed" fw={700}>Q{index + 1}</Text>
                        <Text size="sm" mb={6}>{item.question}</Text>
                        <Textarea
                          aria-label={`已确认答案 ${index + 1}`}
                          placeholder="填写已经确认的答案"
                          rows={2}
                          value={item.answer}
                          onChange={(event) => updateQuestionAnswer(index, event.currentTarget.value)}
                        />
                      </Paper>
                    ))}
                  </Stack>
                </Paper>
              </Grid.Col>
            )}
          </Grid>
        )}
      </Stack>
    </Paper>
  )
}

function MergeVideoContextBreakdown({ output }: { output: unknown }) {
  if (!isStepOutputCompatible('merge-video-context', output)) {
    return (
      <Alert color="yellow" icon={<ExclamationTriangleIcon size={16} />}>
        当前没有捕获到“合并视频上下文”步骤自己的完整输出。成功后这里应包含 videoContext 和 pipelineResult，才能展示哪些字幕段被写入了视觉信息。
      </Alert>
    )
  }

  const outputRecord = toTimelineRecord(output) ?? {}
  const videoContext = toTimelineRecord(outputRecord.videoContext) ?? toTimelineRecord(toTimelineRecord(outputRecord.pipelineResult)?.videoContext) ?? {}
  const pipelineResult = toTimelineRecord(outputRecord.pipelineResult) ?? {}
  const tokens = toTimelineRecord(pipelineResult.tokens) ?? {}
  const analyses = timelineArray(pipelineResult.analyses)
  const items = videoContextItems(videoContext)
  const visualItems = items.filter((item) => item.visual)
  const totalSegments = timelineNumber(videoContext.total_segments) ?? items.length
  const subtitleSegments = timelineNumber(videoContext.subtitle_segments) ?? items.filter((item) => item.subtitle).length
  const visualSegments = timelineNumber(videoContext.visual_segments) ?? visualItems.length
  const totalTokens = timelineNumber(tokens.total)
  const coverage = totalSegments > 0 ? Math.round((visualSegments / totalSegments) * 100) : 0
  const narrativeContext = toTimelineRecord(videoContext.narrative_context)
  const narrativeQuestionAnswers = narrativeQuestionAnswerPairsFromResponse({
    analysis: buildNarrativeContextWithConfirmedAnswers({ analysis: narrativeContext ?? {} }) ?? {},
  })

  return (
    <Paper withBorder radius="sm" p="sm">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Box>
            <Text fw={800} size="sm">合并结果解读</Text>
            <Text size="sm" c="dimmed" maw={740}>
              这个步骤会把视觉分析按时间重叠写入字幕段的 visual 字段，最终的 video_context 会被后续脚本生成读取。
            </Text>
          </Box>
          <Group gap={6}>
            <Badge color={visualSegments > 0 ? 'green' : 'gray'} variant="light">
              {visualSegments > 0 ? '已合并视觉信息' : '未合并视觉信息'}
            </Badge>
            <Badge color="blue" variant="light">{visualSegments}/{totalSegments} 段</Badge>
            {totalTokens !== null && <Badge color="violet" variant="light">{totalTokens} tokens</Badge>}
          </Group>
        </Group>

        <Grid gap="sm">
          <Grid.Col span={{ base: 12, md: 3 }}>
            <Paper withBorder radius="sm" p="sm" h="100%">
              <Text size="xs" c="dimmed">总字幕段</Text>
              <Text fw={900} size="xl">{totalSegments}</Text>
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 3 }}>
            <Paper withBorder radius="sm" p="sm" h="100%">
              <Text size="xs" c="dimmed">有字幕文本</Text>
              <Text fw={900} size="xl">{subtitleSegments}</Text>
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 3 }}>
            <Paper withBorder radius="sm" p="sm" h="100%">
              <Text size="xs" c="dimmed">有视觉信息</Text>
              <Text fw={900} size="xl">{visualSegments}</Text>
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 3 }}>
            <Paper withBorder radius="sm" p="sm" h="100%">
              <Text size="xs" c="dimmed">覆盖率</Text>
              <Text fw={900} size="xl">{coverage}%</Text>
            </Paper>
          </Grid.Col>
        </Grid>

        {visualItems.length > 0 ? (
          <Box>
            <Group justify="space-between" mb={6}>
              <Text fw={800} size="sm">已写入视觉信息的字幕段</Text>
              <Badge color="green" variant="light">共 {visualItems.length} 段</Badge>
            </Group>
            <Stack gap="xs">
              {visualItems.map((segment) => (
                <Paper key={segment.id} withBorder radius="sm" p="sm">
                  <Stack gap={6}>
                    <Group justify="space-between" align="flex-start">
                      <Box>
                        <Text fw={800} size="sm">片段 {segment.id}</Text>
                        <Text size="xs" c="dimmed">
                          {formatTimelineTime(segment.start)} - {formatTimelineTime(segment.end)}
                        </Text>
                      </Box>
                      <Group gap={6}>
                        {segment.speakerId !== undefined && (
                          <Badge color="blue" variant="light">说话人 {String(segment.speakerId)}</Badge>
                        )}
                        <Badge color="green" variant="light">已合并</Badge>
                      </Group>
                    </Group>
                    {segment.subtitle && (
                      <Paper withBorder radius="sm" p="xs" bg="gray.0">
                        <Text size="xs" c="dimmed">字幕</Text>
                        <Text size="sm">{segment.subtitle}</Text>
                      </Paper>
                    )}
                    <Paper withBorder radius="sm" p="xs">
                      <Text size="xs" c="dimmed">合并后的 visual</Text>
                      <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{segment.visual}</Text>
                    </Paper>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Box>
        ) : (
          <Alert color="gray">
            这次 video_context 里没有任何字幕段写入 visual。通常说明“分析时间线图”没有结果，或视觉分析时间段没有和字幕时间段发生重叠。
          </Alert>
        )}

        {analyses.length > 0 && (
          <Box>
            <Group justify="space-between" mb={6}>
              <Text fw={800} size="sm">参与合并的视觉分析</Text>
              <Badge color="gray" variant="light">{analyses.length} 条</Badge>
            </Group>
            <Table withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={150}>分析时间段</Table.Th>
                  <Table.Th>视觉摘要</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {analyses.map((analysis, index) => {
                  const decision = toTimelineRecord(analysis.decision) ?? {}
                  return (
                    <Table.Tr key={index}>
                      <Table.Td><Text size="sm">{formatTimelineRange(decision)}</Text></Table.Td>
                      <Table.Td><Text size="sm">{analysisSummaryFromItem(analysis)}</Text></Table.Td>
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </Box>
        )}

        {narrativeContext && (
          <Paper withBorder radius="sm" p="sm">
            <Group justify="space-between" align="flex-start" mb={6}>
              <Box>
                <Text fw={800} size="sm">已合入的全局剧情理解</Text>
                <Text size="sm" c="dimmed" maw={720}>
                  {timelineText(narrativeContext.summary) || '已写入 video_context.narrative_context，后续脚本生成可以读取。'}
                </Text>
              </Box>
              <Group gap={6}>
                <Badge color="blue" variant="light">人物 {timelineUnknownList(narrativeContext.characters).length}</Badge>
                <Badge color="orange" variant="light">事件 {timelineUnknownList(narrativeContext.events).length}</Badge>
                {narrativeQuestionAnswers.length > 0 && (
                  <Badge color="teal" variant="light">QA {narrativeQuestionAnswers.length}</Badge>
                )}
              </Group>
            </Group>
            {narrativeQuestionAnswers.length > 0 && (
              <Stack gap={6} mb="sm">
                {narrativeQuestionAnswers.map((item, index) => (
                  <Paper key={`${item.question}-${index}`} withBorder radius="sm" p="xs">
                    <Text size="xs" c="dimmed" fw={700}>Q{index + 1}</Text>
                    <Text size="sm">{item.question}</Text>
                    {item.answer.trim() && (
                      <Text size="sm" c="dimmed" mt={4}>A：{item.answer}</Text>
                    )}
                  </Paper>
                ))}
              </Stack>
            )}
            <Code block style={{ ...jsonCodeBlockStyle, maxHeight: 220 }}>
              {jsonStringify(narrativeContext)}
            </Code>
          </Paper>
        )}

        <Paper withBorder radius="sm" p="sm">
          <Text fw={800} size="sm" mb={6}>写入项目时会使用的数据</Text>
          <Code block style={{ ...jsonCodeBlockStyle, maxHeight: 260 }}>
            {jsonStringify(videoContext)}
          </Code>
        </Paper>
      </Stack>
    </Paper>
  )
}

function GeneratedScriptBreakdown({ output }: { output: unknown }) {
  if (!isStepOutputCompatible('generate-narration-script', output)) {
    return (
      <Alert color="yellow" icon={<ExclamationTriangleIcon size={16} />}>
        当前没有捕获到“生成解说文案”步骤自己的完整输出。成功后这里应包含 scriptResponse.items。
      </Alert>
    )
  }

  const outputRecord = toTimelineRecord(output) ?? {}
  const scriptResponse = toTimelineRecord(outputRecord.scriptResponse)
    ?? toTimelineRecord(toTimelineRecord(outputRecord.pipelineResult)?.scriptResponse)
    ?? {}
  const items = timelineUnknownList(scriptResponse.items)
  const usage = toTimelineRecord(scriptResponse.usage) ?? {}
  const totalTokens = timelineNumber(usage.total_tokens)
  const model = timelineText(scriptResponse.model)

  return (
    <Paper withBorder radius="sm" p="sm">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Box>
            <Text fw={800} size="sm">解说文案与画面匹配结果</Text>
            <Text size="sm" c="dimmed">
              后端已按解说风格模板读取合并后的 video_context，返回的 items 可直接写入 ai_analysis_script.items。
            </Text>
          </Box>
          <Group gap={6}>
            <Badge color="blue" variant="light">脚本 {items.length} 条</Badge>
            {totalTokens !== null && <Badge color="violet" variant="light">{totalTokens} tokens</Badge>}
            {model && <Badge color="gray" variant="light">{model}</Badge>}
          </Group>
        </Group>

        {items.length > 0 ? (
          <Table withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={70}>序号</Table.Th>
                <Table.Th w={150}>时间</Table.Th>
                <Table.Th>解说文案</Table.Th>
                <Table.Th>原片字幕/保留声</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((item, index) => {
                const record = toTimelineRecord(item) ?? {}
                return (
                  <Table.Tr key={index}>
                    <Table.Td><Text size="sm">{analysisDisplayText(record._id ?? index + 1)}</Text></Table.Td>
                    <Table.Td><Text size="sm">{formatTimelineRange(record)}</Text></Table.Td>
                    <Table.Td><Text size="sm">{analysisDisplayText(record.text) || '原片声片段'}</Text></Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{analysisDisplayText(record.org)}</Text></Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        ) : (
          <Alert color="yellow" icon={<ExclamationTriangleIcon size={16} />}>
            模型没有返回可写入的脚本片段，请检查后端流式接口的 completed 事件。
          </Alert>
        )}

        <Paper withBorder radius="sm" p="sm">
          <Text fw={800} size="sm" mb={6}>后端实际返回</Text>
          <Code block style={{ ...jsonCodeBlockStyle, maxHeight: 260 }}>
            {jsonStringify(scriptResponse)}
          </Code>
        </Paper>
      </Stack>
    </Paper>
  )
}

function LocalAudioPreview({
  audioUrl,
  localAudioKey,
}: {
  audioUrl: string
  localAudioKey: string
}) {
  const [url, setUrl] = useState(audioUrl || '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let objectUrl = ''

    const load = async () => {
      if (!localAudioKey) {
        setUrl(audioUrl)
        return
      }

      try {
        const blob = await localAudioStorageService.getAudioBlob(localAudioKey)
        if (!active) return
        if (blob) {
          objectUrl = URL.createObjectURL(blob)
          setUrl(objectUrl)
          setError(null)
          return
        }
        setUrl(audioUrl)
        setError(audioUrl ? null : '本地音频缓存未找到')
      } catch (err) {
        if (!active) return
        setUrl(audioUrl)
        setError(err instanceof Error ? err.message : '读取本地音频失败')
      }
    }

    void load()

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [audioUrl, localAudioKey])

  if (!url) {
    return <Text size="sm" c="dimmed">{error || '暂无音频'}</Text>
  }

  return (
    <Stack gap={4}>
      <Box component="audio" src={url} controls style={{ width: '100%' }} />
      {error && <Text size="xs" c="orange">{error}</Text>}
    </Stack>
  )
}

function VoiceoverBreakdown({ output }: { output: unknown }) {
  if (!isStepOutputCompatible('generate-voiceover', output)) {
    return (
      <Alert color="yellow" icon={<ExclamationTriangleIcon size={16} />}>
        当前没有捕获到“解说配音”步骤自己的完整输出。成功后这里应包含 voiceoverResult。
      </Alert>
    )
  }

  const outputRecord = toTimelineRecord(output) ?? {}
  const voiceoverResult = toTimelineRecord(outputRecord.voiceoverResult)
    ?? toTimelineRecord(toTimelineRecord(outputRecord.pipelineResult)?.voiceoverResult)
    ?? {}
  const items = timelineUnknownList(voiceoverResult.items)
  const generatedCount = timelineNumber(voiceoverResult.generatedCount) ?? items.filter((item) => {
    const record = toTimelineRecord(item) ?? {}
    return Boolean(timelineText(record.local_audio_key) || timelineText(record.audio_url) || timelineText(record.audio))
  }).length
  const voiceUri = timelineText(voiceoverResult.voiceUri)
  const voiceName = timelineText(voiceoverResult.voiceName)
  const voiceType = timelineText(voiceoverResult.voiceType)
  const serviceLevel = timelineText(voiceoverResult.serviceLevel)

  return (
    <Paper withBorder radius="sm" p="sm">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Box>
            <Text fw={800} size="sm">解说配音结果</Text>
            <Text size="sm" c="dimmed">
              配音音频已写入浏览器本地音频缓存，脚本项会带上 local_audio_key，后续配音页可以继续读取。
            </Text>
          </Box>
          <Group gap={6}>
            <Badge color="green" variant="light">已配音 {generatedCount} 条</Badge>
            <Badge color="blue" variant="light">脚本 {items.length} 条</Badge>
            {voiceName && <Badge color="cyan" variant="light">音色 {voiceName}</Badge>}
            {voiceType && (
              <Badge color={voiceType === 'advanced' ? 'violet' : 'green'} variant="light">
                {voiceType === 'advanced' ? '高级音色' : '基础音色'}
              </Badge>
            )}
            {serviceLevel && (
              <Badge color={serviceLevel === 'premium' ? 'violet' : 'gray'} variant="light">
                {serviceLevel === 'premium' ? 'premium 服务' : 'basic 服务'}
              </Badge>
            )}
          </Group>
        </Group>
        {voiceUri && (
          <Text size="xs" c="dimmed" lineClamp={2}>
            实际生成 voice_uri：{voiceUri}
          </Text>
        )}

        <Table withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={70}>序号</Table.Th>
              <Table.Th>解说文案</Table.Th>
              <Table.Th w={150}>时长</Table.Th>
              <Table.Th>本地音频键</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((item, index) => {
              const record = toTimelineRecord(item) ?? {}
              return (
                <Table.Tr key={index}>
                  <Table.Td><Text size="sm">{analysisDisplayText(record._id ?? index + 1)}</Text></Table.Td>
                  <Table.Td><Text size="sm">{analysisDisplayText(record.text) || '原片声片段'}</Text></Table.Td>
                  <Table.Td><Text size="sm">{analysisDisplayText(record.duration)}</Text></Table.Td>
                  <Table.Td>
                    <Stack gap={4}>
                      <LocalAudioPreview
                        audioUrl={timelineText(record.audio_url) || timelineText(record.audio)}
                        localAudioKey={timelineText(record.local_audio_key)}
                      />
                      <Text size="xs" c="dimmed">{analysisDisplayText(record.local_audio_key) || '未生成配音'}</Text>
                    </Stack>
                  </Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      </Stack>
    </Paper>
  )
}

function FinalVideoBreakdown({ output }: { output: unknown }) {
  if (!isStepOutputCompatible('compose-final-video', output)) {
    return (
      <Alert color="yellow" icon={<ExclamationTriangleIcon size={16} />}>
        当前没有捕获到“合成最终视频”步骤自己的完整输出。成功后这里应包含 finalVideo 和 pipelineResult。
      </Alert>
    )
  }

  const outputRecord = toTimelineRecord(output) ?? {}
  const finalVideo = toTimelineRecord(outputRecord.finalVideo)
    ?? toTimelineRecord(toTimelineRecord(outputRecord.pipelineResult)?.finalVideoResult)
    ?? {}
  const backgroundMusic = toTimelineRecord(finalVideo.backgroundMusic)
  const artifact = toTimelineRecord(finalVideo.artifact)
  const storageKey = timelineText(artifact?.key)
  const duration = timelineNumber(finalVideo.duration)
  const size = timelineNumber(finalVideo.size)

  return (
    <Paper withBorder radius="sm" p="sm">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Box>
            <Text fw={800} size="sm">最终成片结果</Text>
            <Text size="sm" c="dimmed">
              这一页展示的是已经剪辑、配音并混入背景音乐后的最终视频，不再只是调试 JSON。
            </Text>
          </Box>
          <Group gap={6}>
            {duration !== null && <Badge color="blue" variant="light">{duration.toFixed(1)}s</Badge>}
            {size !== null && <Badge color="gray" variant="light">{formatFileSize(size)}</Badge>}
          </Group>
        </Group>

        <Table withTableBorder withColumnBorders>
          <Table.Tbody>
            {[
              ['本地对象键', storageKey || '未返回'],
              ['背景音乐', timelineText(backgroundMusic?.label) || '未选择'],
            ].map(([label, value]) => (
              <Table.Tr key={label}>
                <Table.Th w={120}>{label}</Table.Th>
                <Table.Td><Text size="sm" style={{ wordBreak: 'break-all' }}>{value}</Text></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Stack>
    </Paper>
  )
}

const getDisplaySummary = (
  step: FrameWorkflowStep | undefined,
  record: FrameDebugStepRecord | undefined
) => {
  if (hasMeaningfulValue(record?.outputSummary)) return record?.outputSummary
  if (record?.output !== undefined && step) {
    try {
      const derivedSummary = step.summarizeOutput(record.output)
      if (hasMeaningfulValue(derivedSummary)) return derivedSummary
    } catch {
      return null
    }
  }
  return null
}

const projectFieldDefinitions = [
  {
    key: 'video_url',
    storageField: 'video_url',
    label: 'video_url',
    producedBy: '最终视频 URL',
    persistedBy: '应用到项目',
  },
  {
    key: 'subtitle',
    storageField: 'subtitle',
    label: 'subtitle',
    producedBy: '转录字幕',
    persistedBy: '应用到项目',
  },
  {
    key: 'video_context',
    storageField: 'video_context',
    label: 'video_context',
    producedBy: '合并视频上下文',
    persistedBy: '应用到项目',
  },
  {
    key: 'frame_workflow',
    storageField: 'ai_analysis_script.frame_workflow',
    label: 'ai_analysis_script.frame_workflow',
    producedBy: '合成最终视频',
    persistedBy: '应用到项目',
  },
  {
    key: 'timeline_decision',
    storageField: 'ai_analysis_script.timeline_decision',
    label: 'ai_analysis_script.timeline_decision',
    producedBy: '判断视觉片段',
    persistedBy: '应用到项目',
  },
  {
    key: 'timeline_analyses',
    storageField: 'ai_analysis_script.timeline_analyses',
    label: 'ai_analysis_script.timeline_analyses',
    producedBy: '分析时间线图',
    persistedBy: '应用到项目',
  },
  {
    key: 'narrative_understanding',
    storageField: 'ai_analysis_script.narrative_understanding',
    label: 'ai_analysis_script.narrative_understanding',
    producedBy: '剧情理解',
    persistedBy: '应用到项目',
  },
  {
    key: 'project_metadata',
    storageField: 'project_metadata',
    label: 'project_metadata.frame_inference_config',
    producedBy: '应用到项目',
    persistedBy: '应用到项目',
  },
] as const

const getOutputFile = (output: unknown) => {
  if (!output || typeof output !== 'object') return null
  const file = (output as { file?: unknown }).file
  return file instanceof File ? file : null
}

const getOutputPreviewStorageKey = (output: unknown) => {
  const record = toTimelineRecord(output)
  return timelineText(record?.previewStorageKey)
}

const getOutputUploadedVideoUrl = (output: unknown) => {
  const record = toTimelineRecord(output)
  const finalVideo = toTimelineRecord(record?.finalVideo)
    ?? toTimelineRecord(toTimelineRecord(record?.pipelineResult)?.finalVideoResult)
  return timelineText(toTimelineRecord(finalVideo?.artifact)?.key)
}

const getOutputFileSummary = (output: unknown) => {
  const file = getOutputFile(output)
  if (file) {
    return {
      name: file.name,
      size: file.size,
      type: file.type,
    }
  }

  const record = toTimelineRecord(output)
  const summary = toTimelineRecord(record?.file)
  if (!summary) {
    const finalVideo = toTimelineRecord(record?.finalVideo)
      ?? toTimelineRecord(toTimelineRecord(record?.pipelineResult)?.finalVideoResult)
    if (!finalVideo) return null

    return {
      name: timelineText(finalVideo.name) || 'final-video.mp4',
      size: timelineNumber(finalVideo.size) ?? 0,
      type: timelineText(finalVideo.type) || 'video/mp4',
    }
  }

  return {
    name: timelineText(summary.name) || 'media-preview',
    size: timelineNumber(summary.size) ?? 0,
    type: timelineText(summary.type),
  }
}

function StepMediaPreview({
  stepId,
  output,
}: {
  stepId: FrameDebugStepId
  output: unknown
}) {
  const file = getOutputFile(output)
  const fileSummary = getOutputFileSummary(output)
  const previewStorageKey = getOutputPreviewStorageKey(output)
  const uploadedVideoUrl = getOutputUploadedVideoUrl(output)
  const [url, setUrl] = useState<string | null>(null)
  const [loadedFromBrowser, setLoadedFromBrowser] = useState(false)

  useEffect(() => {
    let createdUrl: string | null = null
    let cancelled = false
    setLoadedFromBrowser(false)

    const setPreviewBlob = (blob: Blob, fromBrowserStorage: boolean) => {
      if (typeof URL.createObjectURL !== 'function') return
      createdUrl = URL.createObjectURL(blob)
      if (cancelled) {
        if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(createdUrl)
        return
      }
      setUrl(createdUrl)
      setLoadedFromBrowser(fromBrowserStorage)
    }

    if (file) {
      setPreviewBlob(file, false)
    } else if (uploadedVideoUrl) {
      setUrl(uploadedVideoUrl)
    } else if (previewStorageKey) {
      setUrl(null)
      void loadFrameDebugAsset(previewStorageKey).then((blob) => {
        if (blob) setPreviewBlob(blob, true)
      })
    } else {
      setUrl(null)
    }

    return () => {
      cancelled = true
      if (createdUrl && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(createdUrl)
      }
    }
  }, [file, previewStorageKey, uploadedVideoUrl])

  if (stepId !== 'merge-videos' && stepId !== 'extract-audio' && stepId !== 'compose-final-video') return null

  if (!fileSummary || !url) {
    const stepName = stepId === 'merge-videos'
      ? '合并视频'
      : stepId === 'extract-audio'
        ? '提取音频'
        : '合成最终视频'
    return (
      <Alert color="gray">
        这个步骤的输出是媒体文件。重新执行“{stepName}”会生成可预览结果。
      </Alert>
    )
  }

  const previewTitle = stepId === 'merge-videos'
    ? '合并视频预览'
    : stepId === 'extract-audio'
      ? '提取音频预览'
      : '最终视频预览'

  return (
    <Paper withBorder radius="sm" p="sm">
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={800} size="sm">{previewTitle}</Text>
          <Group gap={6}>
            {loadedFromBrowser && <Badge color="green" variant="light">已从浏览器存储恢复</Badge>}
            {!loadedFromBrowser && uploadedVideoUrl && <Badge color="green" variant="light">已上传</Badge>}
            <Badge variant="light">{fileSummary.type || 'unknown'} · {formatFileSize(fileSummary.size)}</Badge>
          </Group>
        </Group>
        {stepId === 'merge-videos' || stepId === 'compose-final-video' ? (
          <Box
            component="video"
            src={url}
            controls
            style={{
              width: '100%',
              maxHeight: 360,
              borderRadius: 'var(--mantine-radius-md)',
              background: 'var(--mantine-color-dark-9)',
            }}
          />
        ) : (
          <Box
            component="audio"
            src={url}
            controls
            style={{ width: '100%' }}
          />
        )}
      </Stack>
    </Paper>
  )
}

export default function FrameInferenceDebugPage() {
  const { locale, t } = useI18n()
  const { projectId } = useParams()
  const [project, setProject] = useState<Project | null>(null)
  const [isLoadingProject, setIsLoadingProject] = useState(true)
  const [files, setFiles] = useState<File[]>([])
  const [config, setConfig] = useState(defaultConfig)
  const [selectedStepId, setSelectedStepId] = useState<FrameDebugStepId>('merge-videos')
  const [currentRun, setCurrentRun] = useState<FrameDebugRun | null>(null)
  const [runs, setRuns] = useState<FrameDebugRun[]>([])
  const [presets, setPresets] = useState<FrameDebugPreset[]>([])
  const [presetName, setPresetName] = useState('')
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  const [compareAId, setCompareAId] = useState<string | null>(null)
  const [compareBId, setCompareBId] = useState<string | null>(null)
  const [editorValue, setEditorValue] = useState('{}')
  const [editorError, setEditorError] = useState<string | null>(null)
  const [editedInputs, setEditedInputs] = useState<Partial<Record<FrameDebugStepId, unknown>>>({})
  const [isRunning, setIsRunning] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [fieldActionKey, setFieldActionKey] = useState<string | null>(null)
  const [narrationStyles, setNarrationStyles] = useState<PromptTemplate[]>([])
  const [isLoadingNarrationStyles, setIsLoadingNarrationStyles] = useState(false)
  const [narrationStyleError, setNarrationStyleError] = useState<string | null>(null)
  const [voices, setVoices] = useState<BuiltInVoice[]>([])
  const [isLoadingVoices, setIsLoadingVoices] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const {
    options: backgroundMusicOptions,
    selectOptions: backgroundMusicSelectOptions,
    isLoading: isLoadingBackgroundMusicOptions,
    error: backgroundMusicError,
    reload: reloadBackgroundMusicOptions,
  } = useBackgroundMusicOptions()

  useEffect(() => {
    if (!projectId) return
    setIsLoadingProject(true)

    ProjectService.getProject(projectId)
      .then((item) => {
        setProject(item)
        const savedConfig = item.metadata?.frame_inference_config as Record<string, unknown> | undefined
        setConfig(normalizeDebugConfig(savedConfig))
      })
      .finally(() => setIsLoadingProject(false))

    const storage = loadFrameDebugStorage(projectId)
    setPresets(storage.presets)
    setRuns(storage.runs)
    setCurrentRun(storage.runs[0] ?? createEmptyFrameDebugRun(projectId))
  }, [projectId])

  useEffect(() => {
    let active = true
    setIsLoadingNarrationStyles(true)
    setNarrationStyleError(null)

    promptTemplateService.getPromptTemplates({
      type: 'video_analysis',
      templateType: 'fast',
    }).then((items) => {
      if (!active) return
      const styleItems = items.filter(isNarrationStyleTemplate)
      setNarrationStyles(styleItems)
      setConfig((current) => {
        if (current.narrationStyleId && styleItems.some(item => item.id === current.narrationStyleId)) {
          return current
        }
        const preferred = styleItems.find(item => item.id === '短剧漫剧')
          ?? styleItems.find(item => item.id === 'short_story_comic')
          ?? styleItems.find(item => item.id === defaultConfig.narrationStyleId)
          ?? styleItems[0]
        return preferred ? { ...current, narrationStyleId: preferred.id } : current
      })
    }).catch((error) => {
      if (!active) return
      setNarrationStyles([])
      setNarrationStyleError(error instanceof Error ? error.message : '解说风格加载失败')
    }).finally(() => {
      if (active) setIsLoadingNarrationStyles(false)
    })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    setIsLoadingVoices(true)
    setVoiceError(null)

    loadTTSService()
      .then(({ fetchBuiltInVoices }) => fetchBuiltInVoices())
      .then((items) => {
        if (!active) return
        setVoices(items)
        setConfig((current) => {
          if (current.voice && items.some(item => item.uri === current.voice)) {
            return current
          }
          return items[0]?.uri ? { ...current, voice: items[0].uri } : current
        })
      })
      .catch((error) => {
        if (!active) return
        setVoices([])
        setVoiceError(error instanceof Error ? error.message : '配音音色加载失败')
      })
      .finally(() => {
        if (active) setIsLoadingVoices(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    setConfig((current) => {
      const option = findBackgroundMusicByLabel(current.backgroundMusic, backgroundMusicOptions)
      if (!option) return current
      if (current.backgroundMusicId === option.id && current.backgroundMusicUrl === option.url) return current
      return {
        ...current,
        backgroundMusicId: option.id,
        backgroundMusicUrl: option.url,
      }
    })
  }, [backgroundMusicOptions])

  const selectedRecord = currentRun?.records[selectedStepId]
  const selectedStep = frameWorkflowSteps.find((step) => step.id === selectedStepId)
  const selectedStatus = inferRecordStatus(selectedRecord)
  const selectedOutput = getDisplayOutput(selectedStep, selectedRecord)
  const selectedSummary = getDisplaySummary(selectedStep, selectedRecord)
  const shouldShowRawOutput = !['analyze-timeline-images', 'understand-narrative', 'merge-video-context', 'generate-narration-script', 'match-narration-visuals', 'generate-voiceover', 'compose-final-video'].includes(selectedStepId)

  useEffect(() => {
    const nextValue = editedInputs[selectedStepId] ?? selectedRecord?.input ?? {}
    setEditorValue(jsonStringify(nextValue))
    setEditorError(null)
  }, [editedInputs, selectedRecord?.input, selectedStepId])

  const workflowContext = useMemo<FrameWorkflowContext | null>(() => {
    if (!projectId) return null
    return {
      projectId,
      files,
      config,
      projectName: project?.name,
      projectMetadata: project?.metadata,
    }
  }, [config, files, project?.name, project?.metadata, projectId])

  const runOptions = useMemo(() => runs.map((run) => ({
    value: run.id,
    label: `${run.status} · ${new Date(run.updatedAt).toLocaleString()}`,
  })), [runs])

  const narrationStyleOptions = useMemo(() => {
    const options = narrationStyles.map(style => ({
      value: style.id,
      label: t(resolveLocalizedText(style.title, style.title_i18n, locale)),
    }))
    if (config.narrationStyleId && !options.some(option => option.value === config.narrationStyleId)) {
      return [
        { value: config.narrationStyleId, label: t(`${config.narrationStyleId}（当前配置）`) },
        ...options,
      ]
    }
    return options
  }, [config.narrationStyleId, locale, narrationStyles, t])

  const voiceOptions = useMemo(() => {
    const options = voices.map(voice => ({
      value: voice.uri,
      label: `${t(resolveLocalizedText(voice.name, voice.name_i18n, locale))} · ${t(voice.type === 'advanced' ? '高级音色' : '基础音色')}`,
    }))
    if (config.voice && !options.some(option => option.value === config.voice)) {
      return [
        { value: config.voice, label: t(`${config.voice}（当前配置）`) },
        ...options,
      ]
    }
    return options
  }, [config.voice, locale, t, voices])

  const debugBackgroundMusicSelectOptions = useMemo(() => {
    if (
      config.backgroundMusic &&
      config.backgroundMusic !== NO_BACKGROUND_MUSIC_VALUE &&
      !backgroundMusicSelectOptions.some(option => option.value === config.backgroundMusic)
    ) {
      return [
        { value: config.backgroundMusic, label: `${config.backgroundMusic}（当前配置）` },
        ...backgroundMusicSelectOptions,
      ]
    }

    return backgroundMusicSelectOptions
  }, [backgroundMusicSelectOptions, config.backgroundMusic])

  const compareItems = useMemo(() => {
    const first = runs.find((run) => run.id === compareAId)
    const second = runs.find((run) => run.id === compareBId)
    return first && second ? diffFrameDebugRuns(first, second) : []
  }, [compareAId, compareBId, runs])

  const currentResult = getFrameWorkflowResult(currentRun)
  const canRun = Boolean(workflowContext) && files.length > 0 && !isRunning && !editorError
  const projectFieldRows = useMemo(() => {
    const transcribeOutput = currentRun?.records.transcribe?.status === 'success'
      ? toTimelineRecord(currentRun.records.transcribe.output)
      : null
    const mergeVideoContextOutput = currentRun?.records['merge-video-context']?.status === 'success'
      ? toTimelineRecord(currentRun.records['merge-video-context'].output)
      : null
    const decisionOutput = currentRun?.records['decide-timeline-view']?.status === 'success'
      ? currentRun.records['decide-timeline-view'].output
      : null
    const analysisOutput = currentRun?.records['analyze-timeline-images']?.status === 'success'
      ? toTimelineRecord(currentRun.records['analyze-timeline-images'].output)
      : null
    const narrativeOutput = currentRun?.records['understand-narrative']?.status === 'success'
      ? currentRun.records['understand-narrative'].output
      : null

    const sourceVideoStage = project?.workflow.stages.source_video?.data as Record<string, unknown> | undefined
    const scriptStage = project?.workflow.stages.script?.data as { ai_analysis_script?: Record<string, any> } | undefined
    const script = scriptStage?.ai_analysis_script
    const existingValues = {
      video_url: project?.artifacts.final_video?.key,
      subtitle: project?.workflow.stages.subtitles?.data,
      video_context: sourceVideoStage?.video_context ?? sourceVideoStage,
      frame_workflow: script?.frame_workflow,
      timeline_decision: script?.timeline_decision,
      timeline_analyses: script?.timeline_analyses,
      narrative_understanding: script?.narrative_understanding,
      project_metadata: project?.metadata?.frame_inference_config ?? (
        project?.metadata?.inference_mode === 'frame' ? project.metadata : null
      ),
    }
    const pendingValues = {
      video_url: currentResult?.finalVideoResult?.artifact?.key,
      subtitle: currentResult?.subtitlePayload ?? transcribeOutput?.subtitlePayload,
      video_context: currentResult?.videoContext ?? mergeVideoContextOutput?.videoContext,
      frame_workflow: currentResult,
      timeline_decision: currentResult?.decision ?? decisionOutput,
      timeline_analyses: currentResult?.analyses ?? analysisOutput?.analyses,
      narrative_understanding: currentResult?.narrativeUnderstanding ?? narrativeOutput,
      project_metadata: (
        currentResult
        || transcribeOutput?.subtitlePayload
        || mergeVideoContextOutput?.videoContext
        || decisionOutput
        || analysisOutput?.analyses
        || narrativeOutput
      ) ? config : null,
    }

    return projectFieldDefinitions.map((field) => {
      const hasExisting = hasMeaningfulValue(existingValues[field.key])
      const hasPending = hasMeaningfulValue(pendingValues[field.key])
      const persistedFields = currentRun?.persistedFields ?? []
      const deletedFields = currentRun?.deletedFields ?? []
      const appliedInCurrentRun = Boolean(
        hasPending && (
          persistedFields.includes(field.storageField)
          || (currentRun?.applied && persistedFields.length === 0)
        )
      )
      const deletedInCurrentRun = deletedFields.includes(field.storageField)
      const hasStored = hasExisting || appliedInCurrentRun
      const storageLabel = hasExisting
        ? '项目已存储'
        : appliedInCurrentRun
          ? '本次已存储'
          : deletedInCurrentRun
            ? '本次已删除'
          : '项目未存储'
      const storageColor = hasExisting
        ? 'green'
        : appliedInCurrentRun
          ? 'teal'
          : deletedInCurrentRun
            ? 'red'
          : 'gray'
      const storageDetail = hasExisting
        ? '当前项目字段已有可读取值。'
        : appliedInCurrentRun
          ? '当前 run 已通过写入按钮提交，等待项目详情刷新后会成为项目已有值。'
          : deletedInCurrentRun
            ? '当前 run 已删除这个项目字段。'
          : '当前项目字段为空，还没有存储结果。'
      const runLabel = hasPending
        ? (appliedInCurrentRun ? '本次已存储' : '本次可写入')
        : '本次未生成'
      const runColor = hasPending
        ? (appliedInCurrentRun ? 'green' : 'yellow')
        : 'gray'
      const sourceDetail = hasPending
        ? `本次 run 已跑到「${field.producedBy}」，可通过「${field.persistedBy}」写入项目。`
        : `需要先成功执行「${field.producedBy}」步骤。`

      return {
        ...field,
        hasStored,
        hasPending,
        storageLabel,
        storageColor,
        storageDetail,
        runLabel,
        runColor,
        sourceDetail,
        canDelete: hasStored && !deletedInCurrentRun,
      }
    })
  }, [config, currentResult, currentRun, project])
  const storedFieldCount = projectFieldRows.filter((field) => field.hasStored).length
  const pendingFieldCount = projectFieldRows.filter((field) => field.hasPending).length
  const canApply = pendingFieldCount > 0 && !isRunning

  const removeStoredFieldFromProject = (
    currentProject: Project,
    fieldKey: FrameWorkflowProjectFieldKey
  ): Project => {
    if (fieldKey === 'subtitle') {
      return {
        ...currentProject,
        workflow: {
          ...currentProject.workflow,
          stages: { ...currentProject.workflow.stages, subtitles: { data: null } },
        },
      }
    }
    if (fieldKey === 'video_url') {
      return { ...currentProject, artifacts: { ...currentProject.artifacts, final_video: null } }
    }
    if (fieldKey === 'video_context') {
      return {
        ...currentProject,
        workflow: {
          ...currentProject.workflow,
          stages: { ...currentProject.workflow.stages, source_video: { data: null } },
        },
      }
    }
    if (fieldKey === 'project_metadata') {
      const nextMetadata = { ...(currentProject.metadata ?? {}) }
      delete nextMetadata.frame_inference_config
      delete nextMetadata.frame_inference_completed_at
      if (nextMetadata.inference_mode === 'frame') {
        delete nextMetadata.inference_mode
      }
      return { ...currentProject, metadata: nextMetadata }
    }

    const scriptKeyMap: Partial<Record<FrameWorkflowProjectFieldKey, string>> = {
      'ai_analysis_script.frame_workflow': 'frame_workflow',
      'ai_analysis_script.timeline_decision': 'timeline_decision',
      'ai_analysis_script.timeline_analyses': 'timeline_analyses',
      'ai_analysis_script.narrative_understanding': 'narrative_understanding',
    }
    const scriptKey = scriptKeyMap[fieldKey]
    if (!scriptKey) return currentProject
    const currentScriptStage = currentProject.workflow.stages.script?.data as { ai_analysis_script?: Record<string, any> } | undefined
    const nextScript = { ...(currentScriptStage?.ai_analysis_script ?? {}) }
    delete nextScript[scriptKey]
    return {
      ...currentProject,
      workflow: {
        ...currentProject.workflow,
        stages: {
          ...currentProject.workflow.stages,
          script: { data: { ai_analysis_script: nextScript } },
        },
      },
    }
  }


  const persistRun = async (run: FrameDebugRun) => {
    if (!projectId) return
    const runWithAssets = await persistFrameDebugRunAssets(projectId, run)
    const nextRuns = saveFrameDebugRunHistory(projectId, runWithAssets)
    setRuns(nextRuns)
    setCurrentRun(runWithAssets)
  }

  const handleStepOutputChange = (stepId: FrameDebugStepId, output: unknown) => {
    if (!currentRun) return
    const step = frameWorkflowSteps.find((item) => item.id === stepId)
    const record = currentRun.records[stepId]
    if (!record) return

    const nextRun: FrameDebugRun = {
      ...currentRun,
      updatedAt: new Date().toISOString(),
      records: {
        ...currentRun.records,
        [stepId]: {
          ...record,
          output,
          outputSummary: step?.summarizeOutput(output) ?? record.outputSummary,
        },
      },
    }

    setCurrentRun(nextRun)
    if (projectId) {
      setRuns(saveFrameDebugRunHistory(projectId, nextRun))
    }
  }

  const handleFilesChange = (selectedFiles: File[] | FileList | File | null) => {
    const nextFiles = normalizeSelectedFiles(selectedFiles)
    setFiles(nextFiles)
    setEditedInputs((current) => {
      const next = { ...current }
      fileDependentStepIds.forEach((stepId) => {
        delete next[stepId]
      })
      return next
    })
    if (nextFiles.length > 0) {
      setApplyError(null)
    }
  }

  const updateEditor = (value: string) => {
    setEditorValue(value)
    try {
      const parsed = parseEditorValue(value)
      setEditorError(null)
      setEditedInputs((current) => ({
        ...current,
        [selectedStepId]: parsed,
      }))
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'JSON 格式无效')
    }
  }

  const handleRun = async (startStepId?: FrameDebugStepId) => {
    if (!workflowContext || !canRun) return
    setIsRunning(true)
    setApplyError(null)
    try {
      const run = await runFrameWorkflow({
        context: workflowContext,
        existingRun: currentRun,
        startStepId,
        editedInputs,
        onRunUpdate: setCurrentRun,
      })
      await persistRun(run)
    } finally {
      setIsRunning(false)
    }
  }

  const handleRunCurrentStepOnly = async () => {
    if (!workflowContext || !canRun || !selectedStep) return
    setIsRunning(true)
    setApplyError(null)
    try {
      const run = await runFrameWorkflow({
        context: workflowContext,
        existingRun: currentRun,
        startStepId: selectedStepId,
        editedInputs,
        steps: [selectedStep],
        onRunUpdate: setCurrentRun,
      })
      await persistRun(run)
    } finally {
      setIsRunning(false)
    }
  }

  const handleApply = async () => {
    if (!workflowContext || !currentRun || !canApply) return
    setIsRunning(true)
    setApplyError(null)
    try {
      const applied = await applyFrameWorkflowRunToProject(workflowContext, currentRun)
      await persistRun(applied)
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : '应用到项目失败')
    } finally {
      setIsRunning(false)
    }
  }

  const handleDeleteProjectField = async (fieldKey: FrameWorkflowProjectFieldKey) => {
    if (!workflowContext || !currentRun || !project) return
    setFieldActionKey(`delete:${fieldKey}`)
    setApplyError(null)
    try {
      const result = await deleteFrameWorkflowProjectFields(workflowContext, [fieldKey], {
        projectName: project.name,
        aiAnalysisScript: (project.workflow.stages.script?.data as { ai_analysis_script?: Record<string, any> } | undefined)?.ai_analysis_script,
        projectMetadata: project.metadata,
      })
      const nextRun: FrameDebugRun = {
        ...currentRun,
        updatedAt: new Date().toISOString(),
        deletedFields: [...new Set([...(currentRun.deletedFields ?? []), ...result.deletedFields])],
        persistedFields: (currentRun.persistedFields ?? []).filter((field) => !result.deletedFields.includes(field)),
      }
      setProject((current) => current ? removeStoredFieldFromProject(current, fieldKey) : current)
      await persistRun(nextRun)
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : '删除项目字段失败')
    } finally {
      setFieldActionKey(null)
    }
  }

  const handleSavePreset = () => {
    if (!projectId || !presetName.trim()) return
    const preset = saveFrameDebugPreset(projectId, {
      name: presetName.trim(),
      config: { ...config },
      stepInputs: editedInputs,
    })
    setPresets((current) => [preset, ...current.filter((item) => item.id !== preset.id)])
    setPresetName('')
    setSelectedPresetId(preset.id)
  }

  const handleLoadPreset = (presetId: string | null) => {
    setSelectedPresetId(presetId)
    const preset = presets.find((item) => item.id === presetId)
    if (!preset) return
    setConfig(normalizeDebugConfig(preset.config))
    setEditedInputs(preset.stepInputs)
  }

  if (isLoadingProject) {
    return (
      <Box p="xl">
        <Group gap="sm">
          <Loader size="sm" />
          <Text c="dimmed">正在加载通用模式调试台...</Text>
        </Group>
      </Box>
    )
  }

  return (
    <Box p={{ base: 'md', md: 'xl' }}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <Box>
            <Title order={2}>通用模式调试台</Title>
            <Text c="dimmed" size="sm">{project?.name ?? projectId}</Text>
          </Box>
          <Badge color={currentRun?.status === 'success' ? 'green' : 'gray'} variant="light">
            {currentRun?.status ?? 'idle'}
          </Badge>
        </Group>

        <Grid align="flex-start">
          <Grid.Col span={{ base: 12, lg: 3 }}>
            <Stack gap="md">
              <Paper withBorder radius="md" p="md">
                <Stack gap="sm">
                  <Text fw={800}>素材与参数</Text>
                  <FileButton
                    multiple
                    accept="video/mp4,video/x-matroska,video/mpeg,video/mpg,video/3gpp"
                    onChange={(selectedFiles) => handleFilesChange(selectedFiles as File[] | FileList | File | null)}
                  >
                    {(props) => (
                      <Button {...props} leftSection={<ArrowUpTrayIcon size={16} />} variant="light">
                        选择视频
                      </Button>
                    )}
                  </FileButton>
                  <Text size="xs" c="dimmed">
                    {files.length > 0
                      ? `${files.length} 个文件 · ${formatFileSize(files.reduce((sum, file) => sum + file.size, 0))}`
                      : '尚未选择视频，运行真实媒体步骤前需要重新选择。'}
                  </Text>
                  <TextInput
                    label="输出语言"
                    value={config.outputLanguage}
                    onChange={(event) => {
                      const outputLanguage = event.currentTarget.value
                      setConfig((current) => ({ ...current, outputLanguage }))
                    }}
                  />
                  <Select
                    label="解说风格"
                    placeholder={isLoadingNarrationStyles ? '正在加载解说风格' : '请选择解说风格'}
                    data={narrationStyleOptions}
                    value={config.narrationStyleId || null}
                    onChange={(value) => {
                      if (!value) return
                      setConfig((current) => ({ ...current, narrationStyleId: value }))
                    }}
                    disabled={isLoadingNarrationStyles || narrationStyleOptions.length === 0}
                    error={narrationStyleError || (!isLoadingNarrationStyles && narrationStyleOptions.length === 0 ? '暂无可用解说风格，请稍后重试' : null)}
                    allowDeselect={false}
                    searchable={narrationStyleOptions.length > 8}
                    rightSection={isLoadingNarrationStyles ? <Loader size={16} /> : undefined}
                  />
                  <Select
                    label="配音音色"
                    placeholder={isLoadingVoices ? '正在加载配音音色' : '请选择配音音色'}
                    data={voiceOptions}
                    value={config.voice || null}
                    onChange={(value) => {
                      if (!value) return
                      setConfig((current) => ({ ...current, voice: value }))
                    }}
                    disabled={isLoadingVoices || voiceOptions.length === 0}
                    error={voiceError || (!isLoadingVoices && voiceOptions.length === 0 ? '暂无可用配音音色，请稍后重试' : null)}
                    allowDeselect={false}
                    searchable={voiceOptions.length > 8}
                    rightSection={isLoadingVoices ? <Loader size={16} /> : undefined}
                  />
                  <Select
                    label="背景音乐"
                    data={debugBackgroundMusicSelectOptions}
                    value={config.backgroundMusic}
                    onChange={(value) => {
                      const resolvedValue = resolveBackgroundMusicSelectValue(value, backgroundMusicOptions)
                      const option = findBackgroundMusicByLabel(resolvedValue, backgroundMusicOptions)
                      setConfig((current) => ({
                        ...current,
                        backgroundMusic: resolvedValue,
                        backgroundMusicId: option?.id ?? null,
                        backgroundMusicUrl: option?.url ?? null,
                      }))
                    }}
                    disabled={isLoadingBackgroundMusicOptions}
                    allowDeselect={false}
                    searchable={debugBackgroundMusicSelectOptions.length > 8}
                    rightSection={isLoadingBackgroundMusicOptions ? <Loader size={16} /> : undefined}
                  />
                  {backgroundMusicError ? (
                    <Alert color="red" title={t('背景音乐加载失败，请重试。')}>
                      <Group justify="space-between" align="center">
                        <Text size="sm">{backgroundMusicError}</Text>
                        <Button
                          size="xs"
                          variant="light"
                          onClick={reloadBackgroundMusicOptions}
                          aria-label={t('重试背景音乐')}
                        >
                          {t('重试')}
                        </Button>
                      </Group>
                    </Alert>
                  ) : null}
                  <TextInput
                    label="文案字数"
                    value={config.wordCount}
                    onChange={(event) => {
                      const wordCount = event.currentTarget.value
                      setConfig((current) => ({ ...current, wordCount }))
                    }}
                  />
                </Stack>
              </Paper>

              <Paper withBorder radius="md" p="md">
                <Stack gap="xs">
                  <Text fw={800}>步骤</Text>
                  {frameWorkflowSteps.map((step) => {
                    const record = currentRun?.records[step.id]
                    const recordStatus = inferRecordStatus(record)
                    const active = selectedStepId === step.id
                    return (
                      <Button
                        key={step.id}
                        variant={active ? 'filled' : 'subtle'}
                        justify="space-between"
                        onClick={() => setSelectedStepId(step.id)}
                        rightSection={<Badge size="xs" color={statusColor[recordStatus]}>{recordStatus}</Badge>}
                      >
                        {step.label}
                      </Button>
                    )
                  })}
                </Stack>
              </Paper>
            </Stack>
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 6 }}>
            <Paper withBorder radius="md" p="md">
              <Tabs defaultValue="input">
                <Tabs.List>
                  <Tabs.Tab value="input">输入与处理逻辑</Tabs.Tab>
                  <Tabs.Tab value="output">输出与运行日志</Tabs.Tab>
                  <Tabs.Tab value="compare">对比</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="input" pt="md">
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Box>
                        <Text fw={800}>{selectedStep?.label}</Text>
                        <Text size="sm" c="dimmed" maw={640}>
                          {selectedStep?.description}
                        </Text>
                        <Text size="xs" c="dimmed">
                          effects: {selectedStep?.effects.length ? selectedStep.effects.join(', ') : 'none'}
                        </Text>
                      </Box>
                      <Badge color={statusColor[selectedStatus]}>{selectedStatus}</Badge>
                    </Group>
                    {editorError && (
                      <Alert color="red" icon={<ExclamationTriangleIcon size={16} />}>
                        JSON 格式无效：{editorError}
                      </Alert>
                    )}
                    <Paper withBorder radius="sm" p="sm">
                      <Stack gap={6}>
                        <Text fw={800} size="sm">前端如何处理输入</Text>
                        {selectedStep?.frontendWork.map((item) => (
                          <Text key={item} size="sm" c="dimmed">• {item}</Text>
                        ))}
                      </Stack>
                    </Paper>
                    <Paper withBorder radius="sm" p="sm">
                      <Stack gap="xs">
                        <Text fw={800} size="sm">后端接口</Text>
                        {selectedStep?.backendRoutes?.length ? (
                          <Table>
                            <Table.Thead>
                              <Table.Tr>
                                <Table.Th>方法</Table.Th>
                                <Table.Th>路由</Table.Th>
                                <Table.Th>作用</Table.Th>
                              </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                              {selectedStep.backendRoutes.map((route) => (
                                <Table.Tr key={`${route.method}-${route.path}`}>
                                  <Table.Td><Badge variant="light">{route.method}</Badge></Table.Td>
                                  <Table.Td><Code>{route.path}</Code></Table.Td>
                                  <Table.Td>
                                    <Text size="sm">{route.purpose}</Text>
                                    <Text size="xs" c="dimmed">{route.handler}</Text>
                                  </Table.Td>
                                </Table.Tr>
                              ))}
                            </Table.Tbody>
                          </Table>
                        ) : null}
                      </Stack>
                    </Paper>
                    <Text fw={800} size="sm">当前步骤输入 JSON</Text>
                    <Textarea
                      aria-label="步骤输入 JSON"
                      rows={18}
                      value={editorValue}
                      onChange={(event) => updateEditor(event.currentTarget.value)}
                      styles={{
                        input: {
                          ...jsonPanelStyle,
                          minHeight: 420,
                          overflow: 'auto',
                          resize: 'vertical',
                          whiteSpace: 'pre',
                        },
                      }}
                    />
                  </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="output" pt="md">
                  <Stack gap="sm">
                    {selectedRecord?.error && (
                      <Alert color="red" icon={<ExclamationTriangleIcon size={16} />}>{selectedRecord.error}</Alert>
                    )}
                    <Group justify="space-between">
                      <Text fw={800}>{shouldShowRawOutput ? '完整输出 JSON' : '输出结果'}</Text>
                      <Badge color={statusColor[selectedStatus]}>
                        {selectedStatus} · {selectedRecord?.durationMs ?? 0}ms
                      </Badge>
                    </Group>
                    {selectedStatus === 'success' && !hasMeaningfulValue(selectedRecord?.output) && !hasMeaningfulValue(selectedRecord?.outputSummary) && (
                      <Alert color="yellow" icon={<ExclamationTriangleIcon size={16} />}>
                        当前记录只有成功日志，没有可展示的原始输出。请重新执行当前步骤；如果仍为空，说明后端响应 body 可能为空或响应结构不符合前端预期。
                      </Alert>
                    )}
                    <StepProgressPanel record={selectedRecord} />
                    {selectedSummary && (
                      <Paper withBorder radius="sm" p="sm">
                        <Stack gap={6}>
                          <Text fw={800} size="sm">输出摘要</Text>
                          <Code block style={{ ...jsonCodeBlockStyle, maxHeight: 180 }}>
                            {jsonStringify(selectedSummary)}
                          </Code>
                        </Stack>
                      </Paper>
                    )}
                    <StepOutputBreakdown
                      stepId={selectedStepId}
                      output={selectedRecord?.output}
                      onOutputChange={handleStepOutputChange}
                    />
                    <StepMediaPreview stepId={selectedStepId} output={selectedRecord?.output} />
                    {shouldShowRawOutput && (
                      <Code block style={jsonCodeBlockStyle}>
                        {jsonStringify(selectedOutput)}
                      </Code>
                    )}
                    <StepLogStreamPanel record={selectedRecord} />
                  </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="compare" pt="md">
                  <Stack gap="sm">
                    <Group grow>
                      <Select label="Run A" data={runOptions} value={compareAId} onChange={setCompareAId} />
                      <Select label="Run B" data={runOptions} value={compareBId} onChange={setCompareBId} />
                    </Group>
                    <ScrollArea h={360}>
                      <Table striped highlightOnHover>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>步骤</Table.Th>
                            <Table.Th>路径</Table.Th>
                            <Table.Th>变化</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {compareItems.map((item, index) => (
                            <Table.Tr key={`${item.stepId}-${item.path}-${index}`}>
                              <Table.Td>{item.stepId}</Table.Td>
                              <Table.Td>{item.path}</Table.Td>
                              <Table.Td>
                                <Code style={jsonCodeBlockStyle}>{jsonStringify(item.before)}</Code>
                                <Text size="xs" c="dimmed">→</Text>
                                <Code style={jsonCodeBlockStyle}>{jsonStringify(item.after)}</Code>
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea>
                  </Stack>
                </Tabs.Panel>
              </Tabs>
            </Paper>
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 3 }}>
            <Stack gap="md">
              <Paper withBorder radius="md" p="md">
                <Stack gap="sm">
                  <Text fw={800}>运行控制</Text>
                  <Text size="sm" c="dimmed">
                    默认是 dry-run：可以调用转录、决策、图片分析等能力接口，但不会写项目字段。
                  </Text>
                  <Button
                    leftSection={<PlayIcon size={16} />}
                    onClick={() => handleRun()}
                    disabled={!canRun}
                    loading={isRunning}
                  >
                    运行全部步骤（不写项目）
                  </Button>
                  <Text size="xs" c="dimmed">
                    从“合并视频”开始完整执行到“合并视频上下文”，自动跳过“应用到项目”。
                  </Text>
                  <Button
                    leftSection={<ArrowPathIcon size={16} />}
                    variant="light"
                    onClick={handleRunCurrentStepOnly}
                    disabled={!canRun}
                    loading={isRunning}
                  >
                    仅执行当前步骤
                  </Button>
                  <Text size="xs" c="dimmed">
                    只清空并重新执行当前选中的步骤，保留它之前和之后已有的输出。
                  </Text>
                  <Button
                    leftSection={<ArrowPathIcon size={16} />}
                    variant="light"
                    onClick={() => handleRun(selectedStepId)}
                    disabled={!canRun}
                    loading={isRunning}
                  >
                    从当前步骤重跑
                  </Button>
                  <Text size="xs" c="dimmed">
                    保留当前步骤之前的成功输出，清空当前步骤及后续输出后重新执行。
                  </Text>
                  <Alert color="yellow" icon={<SparklesIcon size={16} />}>
                    调试运行结束后只是生成“待写入结果”，项目字段仍保持原样。
                  </Alert>
                </Stack>
              </Paper>

              <Paper withBorder radius="md" p="md">
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-start" gap="xs">
                    <Box>
                      <Text fw={800}>项目字段状态</Text>
                      <Text size="sm" c="dimmed">
                        按字段查看来源步骤、项目存储状态和本次 run 可写状态。
                      </Text>
                    </Box>
                    <Group gap={6}>
                      <Badge color={storedFieldCount > 0 ? 'green' : 'gray'} variant="light">
                        项目存储 {storedFieldCount}/{projectFieldRows.length}
                      </Badge>
                      <Badge color={pendingFieldCount > 0 ? 'yellow' : 'gray'} variant="light">
                        本次可写 {pendingFieldCount}/{projectFieldRows.length}
                      </Badge>
                    </Group>
                  </Group>
                  <Stack gap={0}>
                    {projectFieldRows.map((field, index) => (
                      <Box
                        key={field.key}
                        py="sm"
                        style={{
                          borderTop: index === 0 ? '1px solid var(--mantine-color-gray-3)' : undefined,
                          borderBottom: '1px solid var(--mantine-color-gray-3)',
                        }}
                      >
                        <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
                          <Box style={{ minWidth: 0 }}>
                            <Text size="sm" fw={700} style={{ wordBreak: 'break-word' }}>{field.label}</Text>
                            <Group gap={6} mt={4}>
                              <Badge color="blue" variant="light">生成：{field.producedBy}</Badge>
                              <Badge color="gray" variant="light">写入：{field.persistedBy}</Badge>
                            </Group>
                          </Box>
                          <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
                            <Badge
                              color={field.storageColor}
                              variant={field.hasStored ? 'filled' : 'light'}
                            >
                              {field.storageLabel}
                            </Badge>
                            <Tooltip label={field.canDelete ? `删除 ${field.label}` : '当前没有可删除的已存储数据'}>
                              <ActionIcon
                                aria-label={`删除 ${field.label}`}
                                color="red"
                                variant="subtle"
                                size="sm"
                                disabled={!field.canDelete || isRunning}
                                loading={fieldActionKey === `delete:${field.storageField}`}
                                onClick={() => handleDeleteProjectField(field.storageField)}
                              >
                                <TrashIcon size={14} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Group>
                        <Text size="xs" c="dimmed" mt={6}>{field.sourceDetail}</Text>
                        <Text size="xs" c="dimmed" mt={2}>{field.storageDetail}</Text>
                        <Group gap={6} mt={6}>
                          <Badge color={field.runColor} variant="light">{field.runLabel}</Badge>
                        </Group>
                      </Box>
                    ))}
                  </Stack>
                  {applyError && (
                    <Alert color="red" icon={<ExclamationTriangleIcon size={16} />}>{applyError}</Alert>
                  )}
                  <Tooltip label={canApply ? '保存当前 run 已生成的项目字段' : '需要先成功运行出至少一个可存储字段'}>
                    <Button
                      color="red"
                      variant="light"
                      leftSection={<CheckCircleIcon size={16} />}
                      onClick={handleApply}
                      disabled={!canApply || isRunning}
                      loading={isRunning}
                    >
                      存储已生成字段
                    </Button>
                  </Tooltip>
                </Stack>
              </Paper>

              <Paper withBorder radius="md" p="md">
                <Stack gap="sm">
                  <Text fw={800}>Preset</Text>
                  <TextInput
                    label="Preset 名称"
                    value={presetName}
                    onChange={(event) => setPresetName(event.currentTarget.value)}
                  />
                  <Button onClick={handleSavePreset} disabled={!presetName.trim()}>保存 preset</Button>
                  <Select
                    label="加载 preset"
                    data={presets.map((preset) => ({ value: preset.id, label: preset.name }))}
                    value={selectedPresetId}
                    onChange={handleLoadPreset}
                    clearable
                  />
                </Stack>
              </Paper>
            </Stack>
          </Grid.Col>
        </Grid>
      </Stack>
    </Box>
  )
}
