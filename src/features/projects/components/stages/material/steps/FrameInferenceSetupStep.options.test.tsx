import { MantineProvider } from '@mantine/core'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '@/features/projects/types/project'
import type {
  FrameWorkflowRecoveryAssetState,
  FrameWorkflowRecoveryBuild,
} from '@/features/projects/workflow/frame'
import { I18nProvider } from '@/shared/i18n/I18nProvider'
import type {
  FrameWorkflowOptionFieldsProps,
  FrameWorkflowOptionValue,
} from '@/features/projects/components/workflow/FrameWorkflowOptionFields'
import FrameInferenceSetupStep from './FrameInferenceSetupStep'

const testState = vi.hoisted(() => ({
  currentProject: null as Project | null,
  cancelWorkflowRun: vi.fn(),
  optionPropsHistory: [] as FrameWorkflowOptionFieldsProps[],
  recovery: null as FrameWorkflowRecoveryBuild | null,
  recoveryAssetState: null as FrameWorkflowRecoveryAssetState | null,
  runFrameWorkflow: vi.fn(),
}))

const lateDefaultOptions: FrameWorkflowOptionValue = {
  narrationStyleId: 'late-default-style',
  narrationStyleTitle: 'Late default style',
  voice: null,
  voiceName: null,
  backgroundMusic: 'none',
  backgroundMusicId: null,
  backgroundMusicUrl: null,
}

const completeOptions: FrameWorkflowOptionValue = {
  narrationStyleId: 'shared-style',
  narrationStyleTitle: 'Shared style title',
  voice: 'shared-voice',
  voiceName: 'Shared voice name',
  backgroundMusic: 'Shared track',
  backgroundMusicId: 73,
  backgroundMusicUrl: 'https://example.test/shared-track.mp3',
}

vi.mock('@/features/projects/components/workflow/FrameWorkflowOptionFields', async () => {
  const { useEffect } = await import('react')

  return {
    default: function MockFrameWorkflowOptionFields(props: FrameWorkflowOptionFieldsProps) {
      testState.optionPropsHistory.push(props)

      useEffect(() => {
        if (!props.initializeDefaults) return undefined
        const timeout = window.setTimeout(() => props.onChange(lateDefaultOptions), 50)
        return () => window.clearTimeout(timeout)
      }, [])

      return (
        <div data-testid="frame-workflow-option-fields">
          <button type="button" onClick={() => props.onValidityChange?.(false)}>mark options invalid</button>
          <button type="button" onClick={() => props.onValidityChange?.(true)}>mark options valid</button>
          <button type="button" onClick={() => props.onChange(completeOptions)}>set complete options</button>
          <button
            type="button"
            onClick={() => props.onChange({
              ...props.value,
              backgroundMusicId: 902,
              backgroundMusicUrl: 'https://example.test/enriched-saved-track.mp3',
            })}
          >
            enrich background metadata
          </button>
        </div>
      )
    },
  }
})

vi.mock('../../../../contexts/ProjectContext', () => ({
  useProject: () => ({
    currentProject: testState.currentProject,
    refreshProject: vi.fn().mockResolvedValue(undefined),
    updateStageStatus: vi.fn(),
  }),
}))

vi.mock('@/shared/contexts/ToastContext', () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/shared/workflowRuns/identity', () => ({
  getWorkflowClientInstanceId: () => 'test-client',
}))

vi.mock('@/shared/workflowRuns/workflowCheckpointStore', () => ({
  createWorkflowCheckpointStore: () => ({
    getCheckpoint: vi.fn().mockResolvedValue(null),
    listFinalizationOutbox: vi.fn().mockResolvedValue([]),
    markInterrupted: vi.fn().mockResolvedValue(undefined),
    removeCheckpoint: vi.fn().mockResolvedValue(undefined),
    removeFinalizationOutbox: vi.fn().mockResolvedValue(undefined),
    saveCheckpoint: vi.fn().mockResolvedValue(undefined),
    saveFinalizationOutbox: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('@/shared/workflowRuns/workflowRunClient', () => ({
  WorkflowBlockedError: class WorkflowBlockedError extends Error {},
  WorkflowRunClient: class WorkflowRunClient {
    cancel = testState.cancelWorkflowRun
    interrupt = vi.fn().mockResolvedValue(undefined)
  },
}))

vi.mock('@/features/projects/workflow/frame/runner/workflowRunLifecycle', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/projects/workflow/frame/runner/workflowRunLifecycle')>()

  return {
    ...actual,
    createFrameWorkflowInputHash: vi.fn().mockResolvedValue('input-hash'),
    resolveFrameWorkflowInputHash: () => 'input-hash',
    shouldRegisterWorkflowStep: () => false,
    FrameWorkflowRunLifecycle: class FrameWorkflowRunLifecycle {
      workflowRun: { id: string; billing_status: string } | null = null
      ensure = vi.fn().mockImplementation(async () => {
        this.workflowRun = { id: 'workflow-run-id', billing_status: 'pending' }
        return this.workflowRun
      })
      startHeartbeat = vi.fn()
      stopHeartbeat = vi.fn()
      failStep = vi.fn().mockResolvedValue(undefined)
      interrupt = vi.fn().mockResolvedValue(undefined)
      cancel = vi.fn().mockResolvedValue(undefined)
      dispose = vi.fn()
    },
  }
})

vi.mock('@/features/projects/workflow/frame', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/projects/workflow/frame')>()
  return {
    ...actual,
    buildRecoverableFrameWorkflowRun: () => testState.recovery,
    inspectFrameWorkflowRecoveryAssets: vi.fn(() => Promise.resolve(testState.recoveryAssetState)),
    runFrameWorkflow: testState.runFrameWorkflow,
  }
})

vi.mock('@/features/projects/components/workflow/WorkflowProgressModal', () => ({
  WorkflowProgressModal: (props: { opened: boolean; canResume: boolean; onResume: () => void }) => (
    props.opened && props.canResume
      ? <button type="button" onClick={props.onResume}>继续执行</button>
      : null
  ),
}))

vi.mock('@/shared/components/ui/CapcutExportModal', () => ({
  default: () => null,
}))

const createProject = (frameConfig?: Record<string, unknown>): Project => ({
  id: 'project-1',
  owner_id: 'owner-1',
  name: 'Existing project',
  status: 'draft',
  created_at: '2026-07-21T00:00:00.000Z',
  updated_at: '2026-07-21T00:00:00.000Z',
  workflow: {
    mode: 'frame',
    status: 'idle',
    current_step: 'step_0_created',
    current_step_index: 0,
    revision: 1,
    steps: {},
    stages: {},
  },
  artifacts: {},
  metadata: frameConfig ? { frame_inference_config: frameConfig } : {},
})

const savedOptions: FrameWorkflowOptionValue = {
  narrationStyleId: 'saved-style',
  narrationStyleTitle: 'Saved style title',
  voice: 'saved-voice',
  voiceName: 'Saved voice name',
  backgroundMusic: 'Saved track',
  backgroundMusicId: 51,
  backgroundMusicUrl: 'https://example.test/saved-track.mp3',
}

const createRecovery = (): FrameWorkflowRecoveryBuild => ({
  run: {
    id: 'frame-recovered-project-1-1',
    projectId: 'project-1',
    mode: 'apply',
    status: 'cancelled',
    createdAt: '2026-07-21T00:00:00.000Z',
    updatedAt: '2026-07-21T00:00:00.000Z',
    records: {},
    startStepId: 'extract-audio',
  },
  summary: {
    available: true,
    completedCount: 1,
    totalCount: 13,
    nextStepId: 'extract-audio',
    nextStepLabel: '提取音频',
    interruptedStepId: null,
    interruptedStepLabel: null,
    resumeStepId: 'extract-audio',
    resumeStepLabel: '提取音频',
  },
})

const stepElement = () => (
  <MantineProvider>
    <MemoryRouter>
      <I18nProvider initialLocale="zh-CN">
        <FrameInferenceSetupStep />
      </I18nProvider>
    </MemoryRouter>
  </MantineProvider>
)

const renderStep = () => render(stepElement())

const latestOptionProps = () => testState.optionPropsHistory.at(-1)

const uploadVideo = async (user: ReturnType<typeof userEvent.setup>) => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  expect(input).not.toBeNull()
  await user.upload(input!, new File(['video'], 'source.mp4', { type: 'video/mp4' }))
}

describe('FrameInferenceSetupStep workflow options', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    testState.optionPropsHistory = []
    testState.currentProject = createProject()
    testState.recovery = null
    testState.recoveryAssetState = null
    testState.cancelWorkflowRun.mockResolvedValue(undefined)
    testState.runFrameWorkflow.mockRejectedValue(new Error('stop after config capture'))
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:video-preview'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('passes saved workflow option metadata on the first shared-field render', () => {
    testState.currentProject = createProject({
      narration_style_id: savedOptions.narrationStyleId,
      narration_style_title: savedOptions.narrationStyleTitle,
      voice: savedOptions.voice,
      voice_name: savedOptions.voiceName,
      background_music: savedOptions.backgroundMusic,
      background_music_id: savedOptions.backgroundMusicId,
      background_music_url: savedOptions.backgroundMusicUrl,
    })

    renderStep()

    expect(testState.optionPropsHistory[0]).toMatchObject({
      value: savedOptions,
      initializeDefaults: false,
    })
  })

  it('canonicalizes stale legacy no-background-music metadata through workflow config capture', async () => {
    const user = userEvent.setup()
    testState.currentProject = createProject({
      narration_style_id: savedOptions.narrationStyleId,
      narration_style_title: savedOptions.narrationStyleTitle,
      voice: savedOptions.voice,
      background_music: '閫夋嫨鑳屾櫙闊充箰',
      background_music_id: 999,
      background_music_url: 'https://example.test/stale-background.mp3',
    })

    renderStep()

    expect(testState.optionPropsHistory[0]).toMatchObject({
      value: expect.objectContaining({
        backgroundMusic: 'none',
        backgroundMusicId: null,
        backgroundMusicUrl: null,
      }),
      initializeDefaults: false,
    })

    await uploadVideo(user)
    await user.click(screen.getByRole('button', { name: 'mark options valid' }))
    await user.click(screen.getByRole('button', { name: '开始剪辑' }))

    await waitFor(() => expect(testState.runFrameWorkflow).toHaveBeenCalled())
    expect(testState.runFrameWorkflow.mock.calls[0][0].context.config).toMatchObject({
      backgroundMusic: 'none',
      backgroundMusicId: null,
      backgroundMusicUrl: null,
    })
  })

  it('does not allow late shared defaults to replace saved values', async () => {
    const { rerender } = renderStep()
    const firstProps = latestOptionProps()
    expect(firstProps?.initializeDefaults).toBe(true)

    testState.currentProject = createProject({
      narration_style_id: savedOptions.narrationStyleId,
      voice: savedOptions.voice,
      background_music: savedOptions.backgroundMusic,
    })
    rerender(stepElement())

    await waitFor(() => {
      expect(latestOptionProps()).toMatchObject({
        value: expect.objectContaining({
          narrationStyleId: savedOptions.narrationStyleId,
          voice: savedOptions.voice,
          backgroundMusic: savedOptions.backgroundMusic,
        }),
        initializeDefaults: false,
      })
    })
    await new Promise(resolve => window.setTimeout(resolve, 70))
    expect(latestOptionProps()?.value.narrationStyleId).not.toBe(lateDefaultOptions.narrationStyleId)
  })

  it('blocks a fresh start while the shared options are invalid', async () => {
    const user = userEvent.setup()
    renderStep()
    await uploadVideo(user)
    await user.click(screen.getByRole('button', { name: 'mark options invalid' }))

    expect(screen.getByRole('button', { name: '开始剪辑' })).toBeDisabled()
    expect(testState.runFrameWorkflow).not.toHaveBeenCalled()
  })

  it('gates recovered continuation when shared validity changes', async () => {
    const user = userEvent.setup()
    testState.currentProject = createProject({
      narration_style_id: savedOptions.narrationStyleId,
      narration_style_title: savedOptions.narrationStyleTitle,
      voice: savedOptions.voice,
      background_music: savedOptions.backgroundMusic,
      background_music_id: savedOptions.backgroundMusicId,
      background_music_url: savedOptions.backgroundMusicUrl,
    })
    testState.recovery = createRecovery()
    testState.recoveryAssetState = {
      sourceArtifact: null,
      sourceAssetAvailable: true,
      requiresSourceSelection: false,
    }

    renderStep()

    const continueButton = await screen.findByRole('button', { name: '继续处理' })
    await waitFor(() => expect(continueButton).toBeDisabled())
    await user.click(screen.getByRole('button', { name: 'mark options valid' }))
    await waitFor(() => expect(continueButton).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'mark options invalid' }))
    await waitFor(() => expect(continueButton).toBeDisabled())
    expect(testState.runFrameWorkflow).not.toHaveBeenCalled()
  })

  it('immediately offers an in-page retry after narration character validation fails', async () => {
    const user = userEvent.setup()
    const completedStepIds = [
      'merge-videos',
      'extract-audio',
      'transcribe',
      'validate-subtitles',
      'decide-timeline-view',
      'generate-timeline-images',
      'analyze-timeline-images',
      'understand-narrative',
      'merge-video-context',
    ]
    testState.runFrameWorkflow
      .mockImplementationOnce(async (options: { existingRun: Record<string, unknown>; onRunUpdate?: (run: Record<string, unknown>) => void }) => {
        const records: Record<string, { id: string; status: string; error?: string }> = Object.fromEntries(
          completedStepIds.map(id => [id, { id, status: 'success' }])
        )
        records['generate-narration-script'] = {
          id: 'generate-narration-script',
          status: 'error',
          error: 'seg-02 解说字数 53 未达到允许范围 56-104',
        }
        options.onRunUpdate?.({
          ...options.existingRun,
          status: 'error',
          records,
        })
        throw new Error('seg-02 解说字数 53 未达到允许范围 56-104')
      })
      .mockRejectedValueOnce(new Error('second narration attempt stopped'))

    renderStep()
    await uploadVideo(user)
    await user.click(screen.getByRole('button', { name: 'mark options valid' }))
    await user.click(screen.getByRole('button', { name: '开始剪辑' }))

    const continueButton = await screen.findByRole('button', { name: '继续执行' })

    await user.click(continueButton)
    await waitFor(() => expect(testState.runFrameWorkflow).toHaveBeenCalledTimes(2))
    expect(testState.runFrameWorkflow.mock.calls[1][0].startStepId).toBe('generate-narration-script')
  })

  it('keeps a recovered run intact when shared fields enrich saved background metadata', async () => {
    const user = userEvent.setup()
    testState.currentProject = createProject({
      narration_style_id: savedOptions.narrationStyleId,
      narration_style_title: savedOptions.narrationStyleTitle,
      voice: savedOptions.voice,
      background_music: savedOptions.backgroundMusic,
    })
    testState.recovery = createRecovery()
    testState.recovery.run.workflowRunId = 'remote-recovered-run'
    testState.recovery.run.workflowInputHash = 'saved-input-hash'
    testState.recoveryAssetState = {
      sourceArtifact: null,
      sourceAssetAvailable: true,
      requiresSourceSelection: false,
    }

    renderStep()

    await screen.findByRole('button', { name: '继续处理' })
    await user.click(screen.getByRole('button', { name: 'enrich background metadata' }))
    await waitFor(() => {
      expect(latestOptionProps()?.value).toMatchObject({
        narrationStyleId: savedOptions.narrationStyleId,
        narrationStyleTitle: savedOptions.narrationStyleTitle,
        voice: savedOptions.voice,
        backgroundMusic: savedOptions.backgroundMusic,
        backgroundMusicId: 902,
        backgroundMusicUrl: 'https://example.test/enriched-saved-track.mp3',
      })
    })
    expect(testState.cancelWorkflowRun).not.toHaveBeenCalled()
  })

  it('maps complete shared values into the workflow FrameInferenceConfig', async () => {
    const user = userEvent.setup()
    renderStep()
    await uploadVideo(user)
    await user.click(screen.getByRole('button', { name: 'set complete options' }))
    await user.click(screen.getByRole('button', { name: 'mark options valid' }))
    await user.click(screen.getByRole('button', { name: '开始剪辑' }))

    await waitFor(() => expect(testState.runFrameWorkflow).toHaveBeenCalled())
    expect(testState.runFrameWorkflow.mock.calls[0][0].context.config).toMatchObject({
      narrationStyleId: completeOptions.narrationStyleId,
      narrationStyleTitle: completeOptions.narrationStyleTitle,
      voice: completeOptions.voice,
      voiceName: completeOptions.voiceName,
      backgroundMusic: completeOptions.backgroundMusic,
      backgroundMusicId: completeOptions.backgroundMusicId,
      backgroundMusicUrl: completeOptions.backgroundMusicUrl,
    })
  })
})
