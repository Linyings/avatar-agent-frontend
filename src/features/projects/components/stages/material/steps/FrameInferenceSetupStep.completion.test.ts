import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readFrameStep = () => readFileSync(
  resolve(process.cwd(), 'src/features/projects/components/stages/material/steps/FrameInferenceSetupStep.tsx'),
  'utf8'
)

describe('FrameInferenceSetupStep completion preview', () => {
  it('wires production Web transcription failures to the desktop fallback recommendation', () => {
    const content = readFrameStep()
    const viteEnv = readFileSync(resolve(process.cwd(), 'src/vite-env.d.ts'), 'utf8')
    const exampleEnv = readFileSync(resolve(process.cwd(), '.env.local.example'), 'utf8')

    expect(content).toContain("import { desktopAuthBridge } from '@/features/auth/services/desktopAuthBridge'")
    expect(content).toContain('getDesktopFallbackRecommendation')
    expect(content).toContain('const [transcriptionFailureCounts, setTranscriptionFailureCounts] = useState<Record<string, number>>({})')
    expect(content).toContain('observedTranscriptionFailuresRef.current.has(failureIdentity)')
    expect(content).toContain("stepId: transcriptionRecord?.status === 'error' ? 'transcribe' : null")
    expect(content).toContain('attemptCount: transcriptionFailureCounts[workflowFailureKey] ?? 0')
    expect(content).toContain('isProduction: import.meta.env.PROD')
    expect(content).toContain('isDesktop: desktopAuthBridge.isDesktop()')
    expect(content).toContain('desktopFallback={desktopFallback ?? undefined}')
    expect(content).not.toContain('getWindowsDownloadUrl')
    expect(content).not.toContain('VITE_DESKTOP_DOWNLOAD_URL')
    expect(viteEnv).not.toContain('VITE_DESKTOP_DOWNLOAD_URL')
    expect(exampleEnv).not.toContain('VITE_DESKTOP_DOWNLOAD_URL')
  })

  it('has a round top-left back control to the project list', () => {
    const content = readFrameStep()

    expect(content).toContain('import { useNavigate, useSearchParams } from \'react-router-dom\'')
    expect(content).toContain('const navigate = useNavigate()')
    expect(content).toContain("label={t('返回项目页面')}")
    expect(content).toContain("aria-label={t('返回项目页面')}")
    expect(content).toContain("onClick={() => navigate('/projects')}")
    expect(content).not.toContain('component={Link}')
    expect(content).not.toContain('to="/projects"')
    expect(content).toContain('position: \'fixed\'')
    expect(content).toContain('radius="xl"')
  })

  it('shows the generated final video instead of ending on metadata output', () => {
    const content = readFrameStep()

    expect(content).toContain('const finalVideoArtifact = result?.finalVideoResult?.artifact ?? currentProject?.artifacts.final_video ?? null')
    expect(content).toContain('const showFinalVideoPreview = Boolean(saved && finalVideoArtifact && !isSaving && !error)')
    expect(content).toContain('src={finalVideoPreviewUrl || undefined}')
    expect(content).toContain('最终视频已保存到项目，可直接预览或下载。')
    expect(content).toContain('最终视频已生成并保存。')
  })

  it('shows the completion notice as a centered modal instead of an inline bottom alert', () => {
    const content = readFrameStep()

    expect(content).toContain('const [completionNoticeOpen, setCompletionNoticeOpen] = useState(false)')
    expect(content).toContain('const lastCompletionNoticeKeyRef = useRef<string | null>(null)')
    expect(content).toContain('const showCompletionNotice = Boolean(saved && result && !isSaving && !error)')
    expect(content).toContain('setCompletionNoticeOpen(true)')
    expect(content).toContain('const handleViewCompletionResult = () => {')
    expect(content).toContain('opened={completionNoticeOpen && !progressModalOpen}')
    expect(content).toContain('centered')
    expect(content).toContain("aria-label={t('最终视频完成提示')}")
    expect(content).toContain('最终视频已保存到项目，可直接预览、下载，或继续导出剪映草稿。')
    expect(content).toContain("{t('稍后查看')}")
    expect(content).not.toContain('<Alert color="green" variant="light" styles={{ message: { width: \'100%\' } }}>')
    expect(content).not.toContain('onClick={() => setProgressModalOpen(true)}>\n                          {t(\'查看结果\')}')
  })

  it('can auto-open the final preview when redirected away from the legacy analysis route', () => {
    const content = readFrameStep()

    expect(content).toContain("nextParams.get('preview') !== 'final'")
    expect(content).toContain('setProgressModalOpen(true)')
    expect(content).toContain("nextParams.delete('preview')")
  })

  it('downloads the final video as a blob instead of navigating to the media URL', () => {
    const content = readFrameStep()

    expect(content).toContain('const handleDownloadFinalVideo = async () => {')
    expect(content).toContain('localAssetStorageService.getProjectAsset(finalVideoArtifact.key)')
    expect(content).toContain("downloadBlob(file, finalVideoName, 'frame-inference-result.mp4')")
    expect(content).toContain('onClick={handleDownloadFinalVideo}')
    expect(content).toContain('loading={isDownloadingFinalVideo}')
    expect(content).not.toContain('download={finalVideoName}')
    expect(content).not.toContain('target="_blank"')
  })

  it('wires completed general mode output to CapCut draft export', () => {
    const content = readFrameStep()

    expect(content).toContain("import CapcutExportModal from '@/shared/components/ui/CapcutExportModal'")
    expect(content).toContain('buildFrameCapcutExportPayload')
    expect(content).toContain('exportToCapcut')
    expect(content).toContain('const [showCapcutModal, setShowCapcutModal] = useState(false)')
    expect(content).toContain('const [capcutExtraAudioAssets, setCapcutExtraAudioAssets] = useState<ExtraAudioAsset[]>([])')
    expect(content).toContain('const handleOpenCapcutExport = async () => {')
    expect(content).toContain('sourceVideoArtifact: currentProject?.artifacts.source_video ?? null')
    expect(content).toContain('extraAudioAssets: capcutExtraAudioAssets')
    expect(content).toContain("leftSection={<ScissorsIcon width={18} height={18} />}")
    expect(content).toContain("{t('导出剪映')}")
    expect(content).toContain('<CapcutExportModal')
    expect(content).toContain('existingVideoFile={capcutVideoFile ?? undefined}')
  })

  it('keeps the explicit progress modal close button responsive', () => {
    const content = readFrameStep()

    expect(content).toContain("const canDismissProgressModal = !isSaving || workflowStatus === 'stopping' || workflowStatus === 'stopped' || workflowStatus === 'waiting-review'")
    expect(content).toContain('setProgressModalOpen(false)')
    expect(content).toContain('closeOnClickOutside={canDismissProgressModal}')
    expect(content).toContain('closeOnEscape={canDismissProgressModal}')
    expect(content).toContain('withCloseButton={canDismissProgressModal}')
  })

  it('wires the stop button to an abortable workflow execution', () => {
    const content = readFrameStep()

    expect(content).toContain('const workflowAbortControllerRef = useRef<AbortController | null>(null)')
    expect(content).toContain('const abortController = new AbortController()')
    expect(content).toContain('signal: abortController.signal')
    expect(content).toContain('workflowAbortControllerRef.current?.abort()')
    expect(content).toContain("run.status === 'cancelled'")
    expect(content).toContain('isAbortError(err)')
  })

  it('keeps workflow-run reservations intact on interruption and only releases legacy project reservations', () => {
    const content = readFrameStep()

    expect(content).toContain("import ProjectService from '@/features/projects/services/projectService'")
    expect(content).toContain("const releaseWorkflowReservations = async (")
    expect(content).toContain("if (run?.workflowRunId) return")
    expect(content).toContain('await ProjectService.releaseBillingReservations(projectId, reason)')
    expect(content).toContain("await releaseWorkflowReservations('workflow_cancelled', workingRun)")
    expect(content).toContain("await releaseWorkflowReservations('workflow_failed', workingRun)")
    expect(content).toContain('console.warn(\'[FrameInferenceSetupStep] 释放 Credits 预留失败:\', releaseError)')
    expect(content).not.toContain('confirmBillingReservations')
  })

  it('persists the server workflow run, a resumable checkpoint, and finalization outbox in the page flow', () => {
    const content = readFrameStep()

    expect(content).toContain('createFrameWorkflowInputHash')
    expect(content).toContain('new FrameWorkflowRunLifecycle(new WorkflowRunClient())')
    expect(content).toContain('lifecycle.startHeartbeat')
    expect(content).toContain('workflowCheckpointStoreRef.current.saveFinalizationOutbox')
    expect(content).toContain('await lifecycle.complete(finalResultAt)')
    expect(content).toContain('workflowCheckpointStoreRef.current.listFinalizationOutbox')
    expect(content).toContain("workflowStatus === 'blocked'")
    expect(content).toContain("workflowStatus === 'interrupted'")
    expect(content).toContain("workflowStatus === 'finalizing'")
  })

  it('keeps the general mode workspace height responsive across desktop viewports', () => {
    const content = readFrameStep()

    expect(content).toContain("const WORKSPACE_PANEL_HEIGHT = 'clamp(620px, calc(100dvh - 210px), 860px)'")
    expect(content).toContain("h={{ base: 'auto', lg: WORKSPACE_PANEL_HEIGHT }}")
    expect(content).toContain("h={{ base: 430, lg: 'auto' }}")
    expect(content).toContain('h={{ base: 520, lg: WORKSPACE_PANEL_HEIGHT }}')
    expect(content).toContain('<ScrollArea type="auto" offsetScrollbars style={{ flex: 1, minHeight: 0 }}>')
  })

  it('guards progress display against stale workflow updates', () => {
    const content = readFrameStep()

    expect(content).toContain("const { t } = useI18n()")
    expect(content).toContain('const workflowExecutionIdRef = useRef(0)')
    expect(content).toContain('if (!isCurrentExecution()) return')
    expect(content).toContain('const [currentWorkflowStepId, setCurrentWorkflowStepId] = useState<FrameDebugStepId | null>(null)')
    expect(content).toContain('const activeWorkflowStepId = activeWorkflowStep?.id ?? null')
    expect(content).toContain("const workflowProgressBarValue = workflowStatus === 'success' || (saved && result)")
    expect(content).toContain('const translatedWorkflowMessage = t(workflowMessage)')
    expect(content).toContain('value={workflowProgressBarValue}')
    expect(content).not.toContain('visibleProgress')
    expect(content).not.toContain('处理中 {workflowProgressBarValue}%')
    expect(content).not.toContain('处理中 · 点击查看')
    expect(content).not.toContain('completedWorkflowSteps')
    expect(content).not.toContain('activeWorkflowStepIndex')
    expect(content).not.toContain('activeStepProgress')
    expect(content).not.toContain('getFrameWorkflowCompletedCount')
    expect(content).not.toContain('getFrameWorkflowStepProgress')
    expect(content).not.toContain("activeWorkflowRecord?.status === 'running' && activeStepProgress.determinate")
    expect(content).toContain('setCurrentWorkflowStepId(step.id)')
    expect(content).toContain('getFrameWorkflowDisplayStepState(displayWorkflowRun, step, activeWorkflowStepId)')
    expect(content).toContain("const statusLabel = t(isActive ? '执行中' : workflowStepStatusLabel[status] ?? status)")
    expect(content).toContain('<Text size="sm" fw={800} lineClamp={2}>{translatedWorkflowMessage}</Text>')
    expect(content).not.toContain("progressMessage(activeWorkflowRecord) ? ` · ${progressMessage(activeWorkflowRecord)}` : ''")
    expect(content).toContain("data-frameflow-active={isActive ? 'true' : 'false'}")
  })

  it('keeps uploaded videos as simple thumbnail items', () => {
    const content = readFrameStep()

    expect(content).toContain('const [videoDurations, setVideoDurations] = useState<Record<string, number>>({})')
    expect(content).toContain('const durationLabel = formatVideoDuration(videoDurations[fileKey])')
    expect(content).toContain('<ScrollArea h={150} type="auto" offsetScrollbars>')
    expect(content).toContain('<Text size="sm" c="var(--app-text)" truncate>{currentFile.name}</Text>')
    expect(content).not.toContain("<Text fw={800}>{t('已上传视频')}</Text>")
    expect(content).not.toContain('formatFileSize(currentFile.size)} ·')
    expect(content).not.toContain('inferVideoContentType')
  })
})

describe('FrameInferenceSetupStep selection and narration settings', () => {
  it('derives the reference duration and estimated characters from the PC-aligned ratios', () => {
    const content = readFrameStep()

    expect(content).toContain('const DEFAULT_SELECTION_RATIO = 0.3')
    expect(content).toContain('const DEFAULT_NARRATION_RATIO = 0.5')
    expect(content).toContain("aria-label={t('成片素材选取比例')}")
    expect(content).toContain("aria-label={t('解说率')}")
    expect(content).toContain('Math.max(60_000, Math.round(totalSourceDurationMs * effectiveSelectionRatio))')
    expect(content).toContain('selectionRatio: effectiveSelectionRatio')
    expect(content).toContain('outputDurationMs: referenceOutputDurationMs')
    expect(content).toContain('narrationRatio: effectiveNarrationRatio')
    expect(content).toContain('originalRatio: Math.round((1 - effectiveNarrationRatio) * 100)')
    expect(content).toContain('wordCount: estimatedNarrationCharacters')
    expect(content).toContain('仅用于展示和消耗预估')
    expect(content).not.toContain("label={t('文案字数 *')}")
    expect(content).not.toContain('setWordCount')
  })
})

describe('FrameInferenceSetupStep upload limits', () => {
  it('allows ten videos with only a total 2GB size limit', () => {
    const content = readFrameStep()

    expect(content).toContain('const MAX_VIDEO_COUNT = 10')
    expect(content).toContain('const MAX_TOTAL_SIZE = 2 * GB')
    expect(content).toContain("const MAX_TOTAL_SIZE_LABEL = '2 GB'")
    expect(content).toContain('最多 ${MAX_VIDEO_COUNT} 个视频，合计最大 ${MAX_TOTAL_SIZE_LABEL}')
    expect(content).toContain('totalSize + file.size > MAX_TOTAL_SIZE')
    expect(content).not.toContain('maxSingleVideoSize')
    expect(content).not.toContain('单个最大')
    expect(content).not.toContain('已忽略 ${oversizedCount}')
  })
})
