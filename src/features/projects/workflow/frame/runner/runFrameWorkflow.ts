import { createAbortError, isAbortError, throwIfAborted } from '@/shared/utils/abort'
import { frameWorkflowStepIds, frameWorkflowSteps } from '../registry'
import { persistFrameWorkflowStepState } from '../persistence/projectStepState'
import { buildFrameWorkflowStagePatch } from '../persistence/stagePatch'
import type { FrameDebugRun, FrameDebugStepId, FrameDebugStepRecord, FrameDebugStepRecords, FrameWorkflowRuntimeContext, FrameWorkflowStep, RunFrameWorkflowOptions } from '../types'
import { releaseTranscriptionAudioFileReferences } from '../utils/media'
import { clearExecutionRecords, cloneRecords, createFrameDebugRunId, getExecutionSteps, makeTimestamp } from '../utils/records'

const DEFAULT_RUN_UPDATE_THROTTLE_MS = 250
const MAX_STEP_LOGS = 120
const KEY_STEP_LOG_PREFIXES = ['执行成功：', '执行失败：', '已停止：', '已跳过：', '输入构建失败：']

const buildStepLogs = (step: FrameWorkflowStep, event: 'start' | 'success' | 'error' | 'skipped' | 'cancelled', detail?: string) => {
  const base = {
    start: [`开始执行：${step.label}`],
    success: [`执行成功：已生成 ${step.label} 的输出摘要。`],
    error: [`执行失败：${detail ?? '未知错误'}`],
    skipped: [`已跳过：${detail ?? '当前运行模式不允许执行该步骤。'}`],
    cancelled: [`已停止：${detail ?? '用户停止了任务。'}`],
  }

  return base[event]
}

const buildRunningLog = (step: FrameWorkflowStep, elapsedMs: number) => (
  `正在处理：${step.label}，已用时 ${Math.max(0, Math.round(elapsedMs / 1000))}s。`
)

const isKeyStepLog = (log: string) => KEY_STEP_LOG_PREFIXES.some(prefix => log.startsWith(prefix))

const trimStepLogs = (logs: string[]) => {
  if (logs.length <= MAX_STEP_LOGS) return logs

  const keyLogs = logs.filter(isKeyStepLog)
  if (keyLogs.length >= MAX_STEP_LOGS) {
    return keyLogs.slice(-MAX_STEP_LOGS)
  }

  const recentLogs = logs.slice(-(MAX_STEP_LOGS - keyLogs.length))
  const mergedLogs = [
    ...keyLogs,
    ...recentLogs.filter(log => !keyLogs.includes(log)),
  ]

  return mergedLogs.length > MAX_STEP_LOGS
    ? mergedLogs.slice(-MAX_STEP_LOGS)
    : mergedLogs
}

const markSkipped = (
  records: FrameDebugStepRecords,
  step: FrameWorkflowStep,
  reason: string,
  now: () => Date
) => {
  const completedAt = makeTimestamp(now)
  records[step.id] = {
    id: step.id,
    status: 'skipped',
    error: reason,
    completedAt,
    durationMs: 0,
    logs: buildStepLogs(step, 'skipped', reason),
  }
}

export async function runFrameWorkflow({
  context,
  existingRun,
  startStepId,
  editedInputs,
  mode = 'dry-run',
  steps = frameWorkflowSteps,
  now = () => new Date(),
  signal,
  onRunUpdate,
  runUpdateThrottleMs = DEFAULT_RUN_UPDATE_THROTTLE_MS,
}: RunFrameWorkflowOptions): Promise<FrameDebugRun> {
  const startedAt = makeTimestamp(now)
  const records = cloneRecords(existingRun?.records)
  const run: FrameDebugRun = {
    id: createFrameDebugRunId(),
    projectId: context.projectId,
    mode,
    status: 'running',
    createdAt: startedAt,
    updatedAt: startedAt,
    startedAt,
    records,
    startStepId,
    applied: existingRun?.applied ?? false,
    persistedFields: existingRun?.persistedFields,
    deletedFields: existingRun?.deletedFields,
    workflowRunId: context.workflowRequestIdentity?.workflowRunId ?? existingRun?.workflowRunId,
    workflowInputHash: context.workflowRequestIdentity?.workflowInputHash ?? existingRun?.workflowInputHash,
    finalResultReadyAt: existingRun?.finalResultReadyAt,
    billingStatus: existingRun?.billingStatus,
  }
  const normalizedRunUpdateThrottleMs = Math.max(0, runUpdateThrottleMs)
  let pendingRunUpdateTimer: ReturnType<typeof setTimeout> | null = null
  let hasEmittedRunUpdate = false
  const clearPendingRunUpdate = () => {
    if (pendingRunUpdateTimer) {
      clearTimeout(pendingRunUpdateTimer)
      pendingRunUpdateTimer = null
    }
  }
  const emitRunUpdate = () => {
    hasEmittedRunUpdate = true
    onRunUpdate?.({
      ...run,
      updatedAt: makeTimestamp(now),
      records: cloneRecords(records),
    })
  }
  const notifyRunUpdate = (options?: { immediate?: boolean }) => {
    if (!onRunUpdate) return

    if (options?.immediate || normalizedRunUpdateThrottleMs === 0 || !hasEmittedRunUpdate) {
      clearPendingRunUpdate()
      emitRunUpdate()
      return
    }

    if (pendingRunUpdateTimer) return

    pendingRunUpdateTimer = setTimeout(() => {
      pendingRunUpdateTimer = null
      emitRunUpdate()
    }, normalizedRunUpdateThrottleMs)
  }
  const appendStepLog = (stepId: FrameDebugStepId, log: string) => {
    const record = records[stepId]
    if (!record) return
    record.logs = trimStepLogs([...(record.logs ?? []), log])
    notifyRunUpdate()
  }
  const updateStepLog = (stepId: FrameDebugStepId, logPrefix: string, log: string) => {
    const record = records[stepId]
    if (!record) return
    const logs = [...(record.logs ?? [])]
    const existingIndex = logs.findIndex((item) => item.startsWith(logPrefix))
    if (existingIndex >= 0) {
      logs[existingIndex] = log
    } else {
      logs.push(log)
    }
    record.logs = trimStepLogs(logs)
    notifyRunUpdate()
  }
  const updateStepProgress = (
    stepId: FrameDebugStepId,
    progress: Record<string, unknown>,
    outputSummary?: Record<string, unknown>
  ) => {
    const record = records[stepId]
    if (!record) return
    record.progress = {
      ...(record.progress ?? {}),
      ...progress,
    }
    if (outputSummary) {
      record.outputSummary = {
        ...(record.outputSummary ?? {}),
        ...outputSummary,
      }
    }
    notifyRunUpdate()
  }

  try {
    throwIfAborted(signal, '通用模式任务已停止')
    const executionSteps = getExecutionSteps(steps, startStepId)
    clearExecutionRecords(records, executionSteps)

    for (const step of executionSteps) {
      throwIfAborted(signal, '通用模式任务已停止')
      if (mode === 'dry-run' && step.effects.includes('mutates-project')) {
        markSkipped(records, step, 'dry-run 已阻止项目写入步骤', now)
        notifyRunUpdate({ immediate: true })
        continue
      }

      const runtimeContext: FrameWorkflowRuntimeContext = {
        ...context,
        records,
        signal,
        appendStepLog,
        updateStepLog,
        updateStepProgress,
      }
      const stepStartedAt = makeTimestamp(now)
      const startTime = performance.now()
      let input: unknown

      try {
        throwIfAborted(signal, '通用模式任务已停止')
        input = Object.prototype.hasOwnProperty.call(editedInputs ?? {}, step.id)
          ? editedInputs?.[step.id]
          : step.buildInput(runtimeContext)
      } catch (error) {
        const message = error instanceof Error ? error.message : '步骤输入构建失败'
        records[step.id] = {
          id: step.id,
          status: 'error',
          error: message,
          startedAt: stepStartedAt,
          completedAt: makeTimestamp(now),
          durationMs: Math.max(0, Math.round(performance.now() - startTime)),
          logs: [
            ...buildStepLogs(step, 'start'),
            `输入构建失败：${message}`,
          ],
        }
        notifyRunUpdate({ immediate: true })
        throw new Error(`${step.label}: ${message}`)
      }

      records[step.id] = {
        id: step.id,
        status: 'running',
        input,
        startedAt: stepStartedAt,
        logs: buildStepLogs(step, 'start'),
      }
      notifyRunUpdate({ immediate: true })
      if (mode === 'apply') {
        await persistFrameWorkflowStepState(context.projectId, step, 'running', {
          started_at: stepStartedAt,
        })
      }

      const heartbeat = setInterval(() => {
        updateStepLog(step.id, '正在处理：', buildRunningLog(step, performance.now() - startTime))
      }, 2000)

      try {
        const output = await step.run(input, runtimeContext)
        throwIfAborted(signal, '通用模式任务已停止')
        clearInterval(heartbeat)
        const completedAt = makeTimestamp(now)
        const logs = [
          ...(records[step.id]?.logs ?? buildStepLogs(step, 'start')),
          ...buildStepLogs(step, 'success'),
        ]
        records[step.id] = {
          id: step.id,
          status: 'success',
          input,
          output,
          outputSummary: step.summarizeOutput(output),
          progress: records[step.id]?.progress,
          startedAt: stepStartedAt,
          completedAt,
          durationMs: Math.max(0, Math.round(performance.now() - startTime)),
          logs: trimStepLogs(logs),
        } satisfies FrameDebugStepRecord
        if (step.id === 'transcribe') {
          releaseTranscriptionAudioFileReferences(records)
        }
        notifyRunUpdate({ immediate: true })
        if (mode === 'apply') {
          await persistFrameWorkflowStepState(
            context.projectId,
            step,
            'success',
            {
              started_at: stepStartedAt,
              completed_at: completedAt,
              duration_ms: Math.max(0, Math.round(performance.now() - startTime)),
              summary: step.summarizeOutput(output),
            },
            buildFrameWorkflowStagePatch(step, output, runtimeContext)
          )
        }
      } catch (error) {
        clearInterval(heartbeat)
        const message = error instanceof Error ? error.message : '步骤执行失败'
        if (isAbortError(error) || signal?.aborted) {
          const abortError = isAbortError(error) ? error : createAbortError('通用模式任务已停止')
          const abortMessage = abortError instanceof Error ? abortError.message : '通用模式任务已停止'
          const logs = [
            ...(records[step.id]?.logs ?? buildStepLogs(step, 'start')),
            ...buildStepLogs(step, 'cancelled', abortMessage),
          ]
          records[step.id] = {
            id: step.id,
            status: 'cancelled',
            input,
            error: abortMessage,
            progress: records[step.id]?.progress,
            startedAt: stepStartedAt,
            completedAt: makeTimestamp(now),
            durationMs: Math.max(0, Math.round(performance.now() - startTime)),
            logs: trimStepLogs(logs),
          } satisfies FrameDebugStepRecord
          notifyRunUpdate({ immediate: true })
          if (mode === 'apply') {
            await persistFrameWorkflowStepState(context.projectId, step, 'cancelled', {
              started_at: stepStartedAt,
              completed_at: makeTimestamp(now),
              error: abortMessage,
            })
          }
          throw abortError
        }

        const logs = [
          ...(records[step.id]?.logs ?? buildStepLogs(step, 'start')),
          ...buildStepLogs(step, 'error', message),
        ]
        records[step.id] = {
          id: step.id,
          status: 'error',
          input,
          error: message,
          startedAt: stepStartedAt,
          completedAt: makeTimestamp(now),
          durationMs: Math.max(0, Math.round(performance.now() - startTime)),
          logs: trimStepLogs(logs),
        }
        notifyRunUpdate({ immediate: true })
        if (mode === 'apply') {
          await persistFrameWorkflowStepState(context.projectId, step, 'error', {
            started_at: stepStartedAt,
            completed_at: makeTimestamp(now),
            error: message,
          })
        }
        throw new Error(`${step.label}: ${message}`)
      }
    }

    const completedAt = makeTimestamp(now)
    clearPendingRunUpdate()
    return {
      ...run,
      status: 'success',
      updatedAt: completedAt,
      completedAt,
      records,
      applied: mode === 'apply' ? true : run.applied,
    }
  } catch (error) {
    const completedAt = makeTimestamp(now)
    clearPendingRunUpdate()
    if (isAbortError(error) || signal?.aborted) {
      return {
        ...run,
        status: 'cancelled',
        updatedAt: completedAt,
        completedAt,
        records,
        error: error instanceof Error ? error.message : '通用模式任务已停止',
      }
    }

    return {
      ...run,
      status: 'error',
      updatedAt: completedAt,
      completedAt,
      records,
      error: error instanceof Error ? error.message : '通用模式调试流程执行失败',
    }
  }
}

export const runFrameWorkflowFromStep = (
  options: Omit<RunFrameWorkflowOptions, 'mode'> & { startStepId: FrameDebugStepId }
) => runFrameWorkflow({
  ...options,
  mode: 'dry-run',
})

export const createEmptyFrameDebugRun = (projectId: string): FrameDebugRun => ({
  id: createFrameDebugRunId(),
  projectId,
  mode: 'dry-run',
  status: 'idle',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  records: Object.fromEntries(frameWorkflowStepIds.map((id) => [id, { id, status: 'idle' }])) as FrameDebugRun['records'],
})
