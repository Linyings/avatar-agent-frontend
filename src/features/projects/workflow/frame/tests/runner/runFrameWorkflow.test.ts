import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectService from '@/features/projects/services/projectService'
import {
  applyFrameWorkflowRunToProject,
  deleteFrameWorkflowProjectFields,
  getFrameWorkflowResult,
  resetFrameWorkflowRunFromStep,
  runFrameWorkflow,
  type FrameDebugRun,
} from '../..'
import type { FrameWorkflowContext, FrameWorkflowStep } from '../../types'
import { getFrameWorkflowStep } from '../../registry'

const runnerMocks = vi.hoisted(() => ({
  captureVideoThumbnail: vi.fn(),
}))

vi.mock('@/features/projects/services/projectService', () => ({
  default: {
    getProject: vi.fn(),
    saveWorkflowFields: vi.fn().mockResolvedValue({ workflow: true }),
    updateProject: vi.fn().mockResolvedValue({ id: 'project-1' }),
    uploadProjectPreview: vi.fn(),
  },
}))

vi.mock('@/features/projects/services/material/videoProcessingService', () => ({
  default: {
    captureVideoThumbnail: runnerMocks.captureVideoThumbnail,
  },
}))

const context: FrameWorkflowContext = {
  projectId: 'project-1',
  files: [new File(['video'], 'clip.mp4', { type: 'video/mp4' })],
  config: {
    outputLanguage: 'zh',
    defaultNFrames: 10,
    maxDecisions: 8,
  },
}

const makeStep = (
  id: string,
  dependsOn: string[],
  runValue: unknown,
  effects: FrameWorkflowStep['effects'] = []
): FrameWorkflowStep => ({
  id: id as FrameWorkflowStep['id'],
  label: id,
  description: `${id} description`,
  dependsOn: dependsOn as FrameWorkflowStep['dependsOn'],
  effects,
  frontendWork: [`${id} frontend work`],
  buildInput: ({ records }) => ({
    previous: dependsOn.map((dependency) => records[dependency as FrameWorkflowStep['id']]?.output),
  }),
  run: vi.fn().mockResolvedValue(runValue),
  summarizeOutput: vi.fn((output) => ({ output })),
})

describe('workflow/frame/runner/runFrameWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runnerMocks.captureVideoThumbnail.mockResolvedValue(new Blob(['preview'], { type: 'image/jpeg' }))
  })

  it('dry-run 会跳过 mutates-project 步骤并记录每步状态', async () => {
    const steps = [
      makeStep('merge-videos', [], { merged: true }),
      makeStep('persist-project', ['merge-videos'], { persisted: true }, ['mutates-project']),
    ]

    const run = await runFrameWorkflow({ context, steps })

    expect(run.status).toBe('success')
    expect(run.records['merge-videos']?.status).toBe('success')
    expect(run.records['merge-videos']?.durationMs).toEqual(expect.any(Number))
    expect(run.records['persist-project']?.status).toBe('skipped')
    expect(ProjectService.updateProject).not.toHaveBeenCalled()
    expect(ProjectService.uploadProjectPreview).not.toHaveBeenCalled()
    expect(ProjectService.saveWorkflowFields).not.toHaveBeenCalled()
  })

  it('运行中的步骤可以实时推送日志快照', async () => {
    const onRunUpdate = vi.fn()
    const step = makeStep('generate-narration-script', [], { ok: true })
    step.run = vi.fn(async (_input, runtimeContext) => {
      runtimeContext.appendStepLog?.('generate-narration-script', '流式阶段：正在生成完整脚本')
      runtimeContext.updateStepLog?.('generate-narration-script', '模型输出：', '模型输出：{"items":[')
      runtimeContext.updateStepLog?.('generate-narration-script', '模型输出：', '模型输出：{"items":[]}')
      return { ok: true }
    })

    const run = await runFrameWorkflow({
      context,
      steps: [step],
      onRunUpdate,
      runUpdateThrottleMs: 0,
    })

    expect(run.status).toBe('success')
    expect(onRunUpdate).toHaveBeenCalled()
    expect(onRunUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'running',
      records: expect.objectContaining({
        'generate-narration-script': expect.objectContaining({
          status: 'running',
          logs: expect.arrayContaining([
            '流式阶段：正在生成完整脚本',
            '模型输出：{"items":[]}',
          ]),
        }),
      }),
    }))
    expect(run.records['generate-narration-script']?.logs).toEqual(expect.arrayContaining([
      '模型输出：{"items":[]}',
      '执行成功：已生成 generate-narration-script 的输出摘要。',
    ]))
  })

  it('运行中的步骤可以实时推送进度快照', async () => {
    const onRunUpdate = vi.fn()
    const step = makeStep('generate-timeline-images', [], { ok: true })
    step.run = vi.fn(async (_input, runtimeContext) => {
      runtimeContext.updateStepProgress?.(
        'generate-timeline-images',
        { percentage: 42, message: '正在生成时间线图 1/3' },
        { current: 1, total: 3 }
      )
      return { ok: true }
    })

    const run = await runFrameWorkflow({
      context,
      steps: [step],
      onRunUpdate,
      runUpdateThrottleMs: 0,
    })

    expect(run.status).toBe('success')
    expect(onRunUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'running',
      records: expect.objectContaining({
        'generate-timeline-images': expect.objectContaining({
          status: 'running',
          progress: expect.objectContaining({
            percentage: 42,
            message: '正在生成时间线图 1/3',
          }),
          outputSummary: expect.objectContaining({
            current: 1,
            total: 3,
          }),
        }),
      }),
    }))
  })

  it('长任务等待期间会流式更新简要运行日志', async () => {
    vi.useFakeTimers()
    const onRunUpdate = vi.fn()
    let resolveStep: (value: unknown) => void = () => {}
    const step = makeStep('transcribe', [], { ok: true })
    step.run = vi.fn(() => new Promise((resolve) => {
      resolveStep = resolve
    }))

    try {
      const runPromise = runFrameWorkflow({
        context,
        steps: [step],
        onRunUpdate,
        runUpdateThrottleMs: 0,
      })

      await Promise.resolve()
      vi.advanceTimersByTime(2100)
      await Promise.resolve()

      expect(onRunUpdate).toHaveBeenCalledWith(expect.objectContaining({
        status: 'running',
        records: expect.objectContaining({
          transcribe: expect.objectContaining({
            status: 'running',
            logs: expect.arrayContaining([
              expect.stringContaining('正在处理：transcribe，已用时'),
            ]),
          }),
        }),
      }))

      resolveStep({ ok: true })
      const run = await runPromise
      expect(run.status).toBe('success')
    } finally {
      vi.useRealTimers()
    }
  })

  it('默认会合并高频运行态更新，并立即推送终态', async () => {
    vi.useFakeTimers()
    const onRunUpdate = vi.fn()
    let resolveStep: () => void = () => {}
    const step = makeStep('generate-narration-script', [], { ok: true })
    step.run = vi.fn(async (_input, runtimeContext) => {
      for (let index = 0; index < 80; index += 1) {
        runtimeContext.updateStepProgress?.(
          'generate-narration-script',
          { percentage: index, message: `流式输出 ${index}` }
        )
        runtimeContext.updateStepLog?.(
          'generate-narration-script',
          '模型输出：',
          `模型输出：${index}`
        )
      }

      await new Promise<void>((resolve) => {
        resolveStep = resolve
      })

      return { ok: true }
    })

    try {
      const runPromise = runFrameWorkflow({
        context,
        steps: [step],
        onRunUpdate,
      })

      await Promise.resolve()
      expect(onRunUpdate).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(249)
      await Promise.resolve()
      expect(onRunUpdate).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(1)
      await Promise.resolve()
      expect(onRunUpdate).toHaveBeenCalledTimes(2)
      expect(onRunUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
        records: expect.objectContaining({
          'generate-narration-script': expect.objectContaining({
            status: 'running',
            progress: expect.objectContaining({ message: '流式输出 79' }),
            logs: expect.arrayContaining(['模型输出：79']),
          }),
        }),
      }))

      resolveStep()
      const run = await runPromise

      expect(run.status).toBe('success')
      expect(onRunUpdate).toHaveBeenCalledTimes(3)
      expect(onRunUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
        records: expect.objectContaining({
          'generate-narration-script': expect.objectContaining({
            status: 'success',
          }),
        }),
      }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('runUpdateThrottleMs 为 0 时会恢复逐次运行态更新', async () => {
    const onRunUpdate = vi.fn()
    const step = makeStep('generate-timeline-images', [], { ok: true })
    step.run = vi.fn(async (_input, runtimeContext) => {
      for (let index = 0; index < 5; index += 1) {
        runtimeContext.updateStepProgress?.(
          'generate-timeline-images',
          { percentage: index, message: `逐次进度 ${index}` }
        )
      }
      return { ok: true }
    })

    const run = await runFrameWorkflow({
      context,
      steps: [step],
      onRunUpdate,
      runUpdateThrottleMs: 0,
    })

    expect(run.status).toBe('success')
    expect(onRunUpdate.mock.calls.length).toBeGreaterThanOrEqual(7)
    expect(onRunUpdate).toHaveBeenCalledWith(expect.objectContaining({
      records: expect.objectContaining({
        'generate-timeline-images': expect.objectContaining({
          status: 'running',
          progress: expect.objectContaining({ message: '逐次进度 4' }),
        }),
      }),
    }))
  })

  it('会限制单个步骤日志数量并保留最新日志和终态日志', async () => {
    const step = makeStep('generate-narration-script', [], { ok: true })
    step.run = vi.fn(async (_input, runtimeContext) => {
      for (let index = 0; index < 150; index += 1) {
        runtimeContext.appendStepLog?.('generate-narration-script', `流式日志 ${index}`)
      }
      return { ok: true }
    })

    const run = await runFrameWorkflow({
      context,
      steps: [step],
      runUpdateThrottleMs: 0,
    })

    const logs = run.records['generate-narration-script']?.logs ?? []

    expect(logs.length).toBeLessThanOrEqual(120)
    expect(logs).toContain('流式日志 149')
    expect(logs).toContain('执行成功：已生成 generate-narration-script 的输出摘要。')
  })

  it('转录成功后会释放临时音频 File 引用', async () => {
    const audioFile = new File(['mp3'], 'speech.mp3', { type: 'audio/mpeg' })
    const extractAudio = {
      name: audioFile.name,
      size: audioFile.size,
      type: audioFile.type,
    }
    const extractStep = makeStep('extract-audio', [], {
      file: audioFile,
      audio: extractAudio,
    })
    const transcribeStep = makeStep('transcribe', ['extract-audio'], { transcription: true })
    transcribeStep.buildInput = vi.fn(({ records }) => ({
      audioFile: (records['extract-audio']?.output as { file: File }).file,
      outputLanguage: 'zh',
    }))

    const run = await runFrameWorkflow({
      context,
      steps: [extractStep, transcribeStep],
    })

    expect(run.status).toBe('success')
    expect((run.records['extract-audio']?.output as { file?: File }).file).toBeUndefined()
    expect(run.records['extract-audio']?.outputSummary).toEqual(extractAudio)
    expect((run.records.transcribe?.input as { audioFile?: File }).audioFile).toBeUndefined()
    expect(run.records.transcribe?.logs).toEqual(expect.arrayContaining([
      '转录完成：已释放临时音频文件引用。',
    ]))
  })

  it('从中间步骤 rerun 会保留上游输出并重跑下游', async () => {
    const mergeStep = makeStep('merge-videos', [], { merged: 'old' })
    const decideStep = makeStep('decide-timeline-view', ['merge-videos'], { decision: 'new' })
    const analyzeStep = makeStep('analyze-timeline-images', ['decide-timeline-view'], { analysis: 'new' })
    const existingRun: FrameDebugRun = {
      id: 'old-run',
      projectId: 'project-1',
      mode: 'dry-run',
      status: 'success',
      createdAt: '2026-05-04T00:00:00.000Z',
      updatedAt: '2026-05-04T00:00:00.000Z',
      records: {
        'merge-videos': {
          id: 'merge-videos',
          status: 'success',
          output: { merged: 'old' },
        },
      },
    }

    const run = await runFrameWorkflow({
      context,
      existingRun,
      startStepId: 'decide-timeline-view',
      steps: [mergeStep, decideStep, analyzeStep],
    })

    expect(run.id).not.toBe(existingRun.id)
    expect(mergeStep.run).not.toHaveBeenCalled()
    expect(decideStep.run).toHaveBeenCalledTimes(1)
    expect(analyzeStep.run).toHaveBeenCalledTimes(1)
    expect(run.records['merge-videos']?.output).toEqual({ merged: 'old' })
    expect(run.records['analyze-timeline-images']?.status).toBe('success')
  })

  it('主流程从某步恢复前会清理目标步和下游旧记录', () => {
    const steps = [
      makeStep('merge-videos', [], { merged: 'old' }),
      makeStep('transcribe', ['merge-videos'], { transcription: 'old' }),
      makeStep('analyze-timeline-images', ['transcribe'], { analysis: 'stale' }),
    ]
    const existingRun: FrameDebugRun = {
      id: 'old-run',
      projectId: 'project-1',
      mode: 'dry-run',
      status: 'success',
      createdAt: '2026-05-04T00:00:00.000Z',
      updatedAt: '2026-05-04T00:00:00.000Z',
      records: {
        'merge-videos': {
          id: 'merge-videos',
          status: 'success',
          output: { merged: 'old' },
        },
        transcribe: {
          id: 'transcribe',
          status: 'running',
          progress: { percentage: 60, message: '旧的转录进度' },
        },
        'analyze-timeline-images': {
          id: 'analyze-timeline-images',
          status: 'running',
          progress: { percentage: 45, message: '旧的视觉分析进度' },
        },
      },
      error: '旧错误',
    }

    const resetRun = resetFrameWorkflowRunFromStep(existingRun, 'transcribe', steps)

    expect(resetRun.records['merge-videos']?.output).toEqual({ merged: 'old' })
    expect(resetRun.records.transcribe).toBeUndefined()
    expect(resetRun.records['analyze-timeline-images']).toBeUndefined()
    expect(resetRun.error).toBeUndefined()
    expect(existingRun.records.transcribe?.status).toBe('running')
  })

  it('步骤抛错后 downstream 不执行', async () => {
    const failingStep = makeStep('decide-timeline-view', [], { decision: true })
    vi.mocked(failingStep.run).mockRejectedValueOnce(new Error('decision failed'))
    const downstreamStep = makeStep('analyze-timeline-images', ['decide-timeline-view'], { analysis: true })

    const run = await runFrameWorkflow({
      context,
      steps: [failingStep, downstreamStep],
    })

    expect(run.status).toBe('error')
    expect(run.records['decide-timeline-view']?.status).toBe('error')
    expect(run.records['analyze-timeline-images']).toBeUndefined()
    expect(downstreamStep.run).not.toHaveBeenCalled()
  })

  it('收到 abort signal 时会标记当前步骤为 cancelled 并停止下游步骤', async () => {
    const controller = new AbortController()
    const step = makeStep('analyze-timeline-images', [], { shouldDiscard: true })
    step.run = vi.fn(async (_input, runtimeContext) => {
      runtimeContext.updateStepProgress?.('analyze-timeline-images', {
        percentage: 36,
        message: '正在等待视觉模型',
      })
      controller.abort()
      return { shouldDiscard: true }
    })
    const downstreamStep = makeStep('understand-narrative', ['analyze-timeline-images'], { narrative: true })

    const run = await runFrameWorkflow({
      context,
      steps: [step, downstreamStep],
      signal: controller.signal,
    })

    expect(run.status).toBe('cancelled')
    expect(run.records['analyze-timeline-images']).toMatchObject({
      status: 'cancelled',
      progress: {
        percentage: 36,
        message: '正在等待视觉模型',
      },
    })
    expect(run.records['analyze-timeline-images']?.output).toBeUndefined()
    expect(run.records['understand-narrative']).toBeUndefined()
    expect(downstreamStep.run).not.toHaveBeenCalled()
  })

  it('input builder 失败时会在当前步骤记录错误，避免输出面板只显示空对象', async () => {
    const step = makeStep('transcribe', ['extract-audio'], { transcription: true })
    step.buildInput = vi.fn(() => {
      throw new Error('缺少依赖步骤 extract-audio 的成功输出')
    })

    const run = await runFrameWorkflow({
      context,
      steps: [step],
      startStepId: 'transcribe',
    })

    expect(run.status).toBe('error')
    expect(run.records.transcribe).toMatchObject({
      status: 'error',
      error: '缺少依赖步骤 extract-audio 的成功输出',
    })
    expect(run.records.transcribe?.logs).toEqual(expect.arrayContaining([
      '输入构建失败：缺少依赖步骤 extract-audio 的成功输出',
    ]))
  })

  it('从上游 rerun 失败会清空旧 downstream 输出，避免应用过期结果', async () => {
    const failingStep = makeStep('decide-timeline-view', [], { decision: true })
    vi.mocked(failingStep.run).mockRejectedValueOnce(new Error('decision failed'))
    const existingRun: FrameDebugRun = {
      id: 'old-run',
      projectId: 'project-1',
      mode: 'dry-run',
      status: 'success',
      createdAt: '2026-05-04T00:00:00.000Z',
      updatedAt: '2026-05-04T00:00:00.000Z',
      records: {
        'merge-video-context': {
          id: 'merge-video-context',
          status: 'success',
          output: {
            pipelineResult: { stale: true },
          },
        },
      },
    }

    const run = await runFrameWorkflow({
      context,
      existingRun,
      startStepId: 'decide-timeline-view',
      steps: [
        failingStep,
        makeStep('merge-video-context', ['decide-timeline-view'], { pipelineResult: { fresh: true } }),
      ],
    })

    expect(run.status).toBe('error')
    expect(run.records['merge-video-context']).toBeUndefined()
    expect(getFrameWorkflowResult(run)).toBeNull()
    await expect(applyFrameWorkflowRunToProject(context, run)).rejects.toThrow('当前 run 还没有可存储的字段')
    expect(ProjectService.saveWorkflowFields).not.toHaveBeenCalled()
    expect(ProjectService.updateProject).not.toHaveBeenCalled()
  })

  it('editedInputs 会覆盖目标步骤默认输入', async () => {
    const step = makeStep('decide-timeline-view', [], { ok: true })
    const editedInput = { maxDecisions: 3, defaultNFrames: 4 }

    const run = await runFrameWorkflow({
      context,
      steps: [step],
      editedInputs: {
        'decide-timeline-view': editedInput,
      },
    })

    expect(step.run).toHaveBeenCalledWith(editedInput, expect.any(Object))
    expect(run.records['decide-timeline-view']?.input).toEqual(editedInput)
  })

  it('passes the stable workflow request identity to frame steps without persisting raw inputs', async () => {
    const step = makeStep('validate-subtitles', [], { ok: true })
    const identity = {
      workflowRunId: '0185f76a-9e4d-7ed6-9ef7-9f34e7e1b6fd',
      workflowStepId: 'validate-subtitles',
      workflowInputHash: 'a'.repeat(64),
      clientInstanceId: 'web.tab-1',
    }
    const identityContext: FrameWorkflowContext = {
      ...context,
      workflowRequestIdentity: identity,
    }

    await runFrameWorkflow({ context: identityContext, steps: [step] })

    expect(step.run).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      workflowRequestIdentity: identity,
    }))
  })

  it('preserves workflow billing identity when continuing a recoverable run', async () => {
    const step = makeStep('validate-subtitles', [], { ok: true })
    const existingRun: FrameDebugRun = {
      id: 'existing-run',
      projectId: 'project-1',
      mode: 'dry-run',
      status: 'cancelled',
      createdAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-15T00:00:00.000Z',
      records: {},
      workflowRunId: '0185f76a-9e4d-7ed6-9ef7-9f34e7e1b6fd',
      workflowInputHash: 'a'.repeat(64),
      billingStatus: 'pending',
    }

    const run = await runFrameWorkflow({ context, existingRun, steps: [step] })

    expect(run).toMatchObject({
      workflowRunId: existingRun.workflowRunId,
      workflowInputHash: existingRun.workflowInputHash,
      billingStatus: 'pending',
    })
  })

  it('apply 模式会顺序持久化 running 和 success，并把步骤产物写入 stages', async () => {
    const subtitlePayload = { '1': { start_time: 0, end_time: 1, subtitle: '字幕' } }
    const initialVideoContext = { items: {}, total_segments: 0, subtitle_segments: 0, visual_segments: 0, merged_at: 1 }
    const validation = {
      status: 'completed',
      model: 'flash-test',
      request_id: 'subtitle-validation-request-1',
      tokens_consumed: 9,
      corrections_count: 1,
      updated_at: '2026-05-12T00:00:00.000Z',
    }
    const step = makeStep('validate-subtitles', [], {
      transcription: { tokens_consumed: 3 },
      subtitleResult: { language: 'zh', segments: [] },
      subtitlePayload,
      initialVideoContext,
      validation,
    })
    let storedWorkflow: any = {
      mode: 'frame',
      status: 'processing',
      current_step: 'step_0_created',
      current_step_id: null,
      current_step_index: 0,
      revision: 1,
      steps: {},
      stages: {},
    }

    vi.mocked(ProjectService.getProject).mockImplementation(async () => ({
      id: 'project-1',
      name: 'Project',
      status: 'processing',
      workflow: storedWorkflow,
      artifacts: {},
      metadata: {},
    } as any))
    vi.mocked(ProjectService.updateProject).mockImplementation(async (_projectId, data) => {
      storedWorkflow = data.workflow
      return {
        id: 'project-1',
        name: 'Project',
        status: data.status ?? 'processing',
        workflow: storedWorkflow,
        artifacts: data.artifacts ?? {},
        metadata: data.metadata ?? {},
      } as any
    })

    const run = await runFrameWorkflow({
      context,
      steps: [step],
      mode: 'apply',
    })

    const workflowUpdates = vi.mocked(ProjectService.updateProject).mock.calls.map((call) => call[1].workflow)
    const firstWorkflowUpdate = workflowUpdates[0] as any
    const secondWorkflowUpdate = workflowUpdates[1] as any
    expect(run.status).toBe('success')
    expect(workflowUpdates).toHaveLength(2)
    expect(firstWorkflowUpdate.steps.step_4_validate_subtitles.status).toBe('running')
    expect(secondWorkflowUpdate.steps.step_4_validate_subtitles.status).toBe('success')
    expect(secondWorkflowUpdate.stages.subtitles.data).toEqual(subtitlePayload)
    expect(secondWorkflowUpdate.stages.subtitles.validation).toEqual(validation)
    expect(secondWorkflowUpdate.stages.source_video.data.video_context).toEqual(initialVideoContext)
  })

  it('显式 apply 才会调用现有项目保存 API', async () => {
    const pipelineResult = {
      subtitlePayload: { '1': { start_time: 0, end_time: 1, subtitle: '字幕' } },
      videoContext: { items: {}, total_segments: 0, subtitle_segments: 0, visual_segments: 0, merged_at: 1 },
      scriptResponse: {
        items: [{ _id: 1, text: '解说', start: 0, end: 1, org: '' }],
      },
      voiceoverResult: {
        items: [{ _id: 1, text: '解说', start: 0, end: 1, org: '', local_audio_key: 'project:1:narration:1', audio_storage: 'local' }],
        audioStates: { 1: { success: true, audioUrl: 'blob:test' } },
        voiceUri: 'voice://test',
        generatedCount: 1,
      },
      finalVideoResult: {
        name: 'final.mp4',
        size: 123,
        type: 'video/mp4',
        finalVideoUrl: 'https://cdn.example.com/final.mp4',
        finalVideoStorageKey: 'videos/frame/final.mp4',
        artifact: {
          storage: 'local',
          key: 'videos/frame/final.mp4',
          name: 'final.mp4',
          type: 'video/mp4',
          size: 123,
          updated_at: '2026-05-04T00:00:00.000Z',
        },
        backgroundMusic: null,
      },
      decision: {
        needs_timeline_view: true,
        decisions: [{ start: 0, end: 1, reason: '关键切点', n_frames: 4 }],
        tokens_consumed: 12,
      },
      analyses: [
        {
          decisionIndex: 0,
          decision: { start: 0, end: 1, reason: '关键切点', n_frames: 4 },
          image: { name: 'timeline.png', size: 123, objectKey: 'tmp/timeline.png', ossUrl: 'oss://tmp/timeline.png' },
          response: { analysis: { summary: '角色回头' }, tokens_consumed: 8 },
        },
      ],
      narrativeUnderstanding: {
        analysis: { summary: '冲突升级' },
        tokens_consumed: 9,
      },
    }
    const voiceoverResult = pipelineResult.voiceoverResult
    const mergedFile = new File(['video'], 'source.mp4', { type: 'video/mp4' })
    const run: FrameDebugRun = {
      id: 'ready-run',
      projectId: 'project-1',
      mode: 'dry-run',
      status: 'success',
      createdAt: '2026-05-04T00:00:00.000Z',
      updatedAt: '2026-05-04T00:00:00.000Z',
      records: {
        'merge-videos': {
          id: 'merge-videos',
          status: 'success',
          output: {
            file: mergedFile,
            video: {
              name: 'source.mp4',
              size: mergedFile.size,
              type: 'video/mp4',
              duration: 12,
            },
          },
        },
        'compose-final-video': {
          id: 'compose-final-video',
          status: 'success',
          output: {
            pipelineResult,
            finalVideo: pipelineResult.finalVideoResult,
          },
        },
      },
    }

    const appliedRun = await applyFrameWorkflowRunToProject(context, run)

    expect(appliedRun.applied).toBe(true)
    expect(appliedRun.persistedFields).toEqual(expect.arrayContaining([
      'video_url',
      'subtitle',
      'video_context',
      'ai_analysis_script.frame_workflow',
      'ai_analysis_script.timeline_decision',
      'ai_analysis_script.timeline_analyses',
      'ai_analysis_script.narrative_understanding',
      'project_metadata',
    ]))
    expect(ProjectService.saveWorkflowFields).toHaveBeenCalledWith('project-1', expect.objectContaining({
      video_url: pipelineResult.finalVideoResult?.artifact.key,
      subtitle: pipelineResult.subtitlePayload,
      video_context: pipelineResult.videoContext,
      ai_analysis_script: expect.objectContaining({
        frame_workflow: pipelineResult,
        timeline_decision: pipelineResult.decision,
        timeline_analyses: pipelineResult.analyses,
        narrative_understanding: pipelineResult.narrativeUnderstanding,
        items: voiceoverResult.items,
        audioStates: voiceoverResult.audioStates,
      }),
    }))
    expect(ProjectService.updateProject).toHaveBeenCalledWith('project-1', expect.objectContaining({
      metadata: expect.objectContaining({
        inference_mode: 'frame',
      }),
    }))
    expect(runnerMocks.captureVideoThumbnail).toHaveBeenCalledWith(mergedFile, undefined, 500)
    expect(ProjectService.uploadProjectPreview).toHaveBeenCalledWith('project-1', expect.any(Blob))
  })

  it('未合成最终视频时也能存储已经成功产出的中间字段', async () => {
    const run: FrameDebugRun = {
      id: 'partial-run',
      projectId: 'project-1',
      mode: 'dry-run',
      status: 'success',
      createdAt: '2026-05-04T00:00:00.000Z',
      updatedAt: '2026-05-04T00:00:00.000Z',
      records: {
        transcribe: {
          id: 'transcribe',
          status: 'success',
          output: {
            subtitlePayload: { '1': { start_time: 0, end_time: 1, subtitle: '字幕' } },
          },
        },
        'decide-timeline-view': {
          id: 'decide-timeline-view',
          status: 'success',
          output: { needs_timeline_view: true, decisions: [{ start: 0, end: 1, reason: '关键判断' }] },
        },
        'analyze-timeline-images': {
          id: 'analyze-timeline-images',
          status: 'success',
          output: { analyses: [{ decisionIndex: 0, response: { analysis: { summary: '转身' } } }] },
        },
        'understand-narrative': {
          id: 'understand-narrative',
          status: 'success',
          output: { analysis: { summary: '剧情冲突升级' } },
        },
      },
    }

    const appliedRun = await applyFrameWorkflowRunToProject(context, run)

    expect(appliedRun.persistedFields).toEqual(expect.arrayContaining([
      'subtitle',
      'ai_analysis_script.timeline_decision',
      'ai_analysis_script.timeline_analyses',
      'ai_analysis_script.narrative_understanding',
      'project_metadata',
    ]))
    expect(appliedRun.persistedFields).not.toContain('ai_analysis_script.frame_workflow')
    expect(ProjectService.saveWorkflowFields).toHaveBeenCalledWith('project-1', expect.objectContaining({
      subtitle: { '1': { start_time: 0, end_time: 1, subtitle: '字幕' } },
      ai_analysis_script: expect.objectContaining({
        timeline_decision: { needs_timeline_view: true, decisions: [{ start: 0, end: 1, reason: '关键判断' }] },
        timeline_analyses: [{ decisionIndex: 0, response: { analysis: { summary: '转身' } } }],
        narrative_understanding: { analysis: { summary: '剧情冲突升级' } },
      }),
    }))
    expect(ProjectService.updateProject).toHaveBeenCalledWith('project-1', expect.objectContaining({
      metadata: expect.objectContaining({
        inference_mode: 'frame',
        frame_inference_config: expect.objectContaining({
          output_language: 'zh',
        }),
      }),
    }))
  })

  it('可以删除单个已存字段，并保留同一 JSON 块里的其他字段', async () => {
    const result = await deleteFrameWorkflowProjectFields(
      context,
      ['ai_analysis_script.timeline_decision', 'project_metadata'],
      {
        projectName: '调试项目',
        aiAnalysisScript: {
          frame_workflow: { ok: true },
          timeline_decision: { stale: true },
          timeline_analyses: [{ ok: true }],
        },
        projectMetadata: {
          inference_mode: 'frame',
          frame_inference_config: { output_language: 'zh' },
          keep_me: true,
        },
      }
    )

    expect(result.deletedFields).toEqual(['ai_analysis_script.timeline_decision', 'project_metadata'])
    expect(ProjectService.saveWorkflowFields).toHaveBeenCalledWith('project-1', expect.objectContaining({
      ai_analysis_script: {
        frame_workflow: { ok: true },
        timeline_analyses: [{ ok: true }],
      },
    }))
    expect(ProjectService.updateProject).toHaveBeenCalledWith('project-1', {
      name: '调试项目',
      metadata: { keep_me: true },
    })
  })

  it('真实 persist-project 步骤在 dry-run 下不会调用项目写入 API', async () => {
    const run = await runFrameWorkflow({
      context,
      steps: [getFrameWorkflowStep('persist-project')],
    })

    expect(run.status).toBe('success')
    expect(run.records['persist-project']?.status).toBe('skipped')
    expect(ProjectService.saveWorkflowFields).not.toHaveBeenCalled()
    expect(ProjectService.updateProject).not.toHaveBeenCalled()
    expect(ProjectService.uploadProjectPreview).not.toHaveBeenCalled()
  })
})
