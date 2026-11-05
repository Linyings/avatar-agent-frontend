import { describe, expect, it } from 'vitest'
import {
  getFrameWorkflowCompletedCount,
  getFrameWorkflowDisplayRun,
  getFrameWorkflowDisplayStepState,
  getFrameWorkflowProgress,
  getFrameWorkflowResumeStepId,
  getFrameWorkflowStepProgress,
  isFrameWorkflowStepComplete,
} from '../../runner/progress'
import type { FrameDebugRun } from '../../types'
import type { FrameDebugStepId, FrameWorkflowStep } from '../../types'

const makeStep = (id: FrameDebugStepId, progressWeight: number): FrameWorkflowStep => ({
  id,
  label: id,
  description: id,
  progressWeight,
  dependsOn: [],
  effects: [],
  frontendWork: [],
  buildInput: () => ({}),
  run: async () => ({}),
  summarizeOutput: () => ({}),
})

const makeRun = (records: FrameDebugRun['records']): FrameDebugRun => ({
  id: 'run-1',
  projectId: 'project-1',
  mode: 'dry-run',
  status: 'running',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z',
  records,
})

describe('workflow/frame/runner/progress', () => {
  const steps = [
    makeStep('merge-videos', 10),
    makeStep('transcribe', 30),
    makeStep('generate-narration-script', 60),
  ]
  const mainWorkflowWeightedSteps = [
    makeStep('merge-videos', 4),
    makeStep('extract-audio', 8),
    makeStep('transcribe', 10),
    makeStep('validate-subtitles', 6),
    makeStep('decide-timeline-view', 9),
    makeStep('generate-timeline-images', 8),
    makeStep('analyze-timeline-images', 11),
    makeStep('understand-narrative', 8),
    makeStep('merge-video-context', 3),
    makeStep('generate-narration-script', 6),
    makeStep('match-narration-visuals', 6),
    makeStep('generate-voiceover', 8),
    makeStep('compose-final-video', 12),
    makeStep('persist-project', 1),
  ]

  it('does not advance a running step without explicit percentage', () => {
    const run = makeRun({
      'merge-videos': {
        id: 'merge-videos',
        status: 'running',
      },
    })

    expect(getFrameWorkflowStepProgress(run.records['merge-videos'])).toEqual({
      value: 0,
      determinate: false,
    })
    expect(getFrameWorkflowProgress(run, steps)).toBe(0)
  })

  it('uses step weights when calculating overall progress', () => {
    const run = makeRun({
      'merge-videos': {
        id: 'merge-videos',
        status: 'success',
      },
      transcribe: {
        id: 'transcribe',
        status: 'running',
        progress: { percentage: 50 },
      },
    })

    expect(getFrameWorkflowProgress(run, steps)).toBe(25)
  })

  it('counts failed steps as fully progressed since they will not re-run', () => {
    const run = makeRun({
      'merge-videos': {
        id: 'merge-videos',
        status: 'success',
      },
      transcribe: {
        id: 'transcribe',
        status: 'error',
        error: 'failed',
      },
    })

    expect(isFrameWorkflowStepComplete(run.records.transcribe)).toBe(false)
    expect(getFrameWorkflowStepProgress(run.records.transcribe)).toEqual({
      value: 100,
      determinate: true,
    })
    expect(getFrameWorkflowProgress(run, steps)).toBe(40)
  })

  it('keeps cancelled steps incomplete while preserving their visible progress', () => {
    const run = makeRun({
      'merge-videos': {
        id: 'merge-videos',
        status: 'success',
      },
      transcribe: {
        id: 'transcribe',
        status: 'cancelled',
        progress: { percentage: 45, message: '音频转录已取消' },
      },
    })

    expect(isFrameWorkflowStepComplete(run.records.transcribe)).toBe(false)
    expect(getFrameWorkflowStepProgress(run.records.transcribe)).toEqual({
      value: 45,
      determinate: true,
    })
    expect(getFrameWorkflowDisplayStepState(run, steps[1], null)).toMatchObject({
      status: 'cancelled',
      isComplete: false,
      progress: { value: 45, determinate: true },
    })
    expect(getFrameWorkflowProgress(run, steps)).toBe(24)
  })

  it('ignores stale percentages on idle records but treats error steps as fully progressed', () => {
    const run = makeRun({
      'merge-videos': {
        id: 'merge-videos',
        status: 'success',
      },
      transcribe: {
        id: 'transcribe',
        status: 'idle',
        progress: { percentage: 75 },
      },
      'generate-narration-script': {
        id: 'generate-narration-script',
        status: 'error',
        error: 'failed',
        progress: { percentage: 80 },
      },
    })

    expect(getFrameWorkflowStepProgress(run.records.transcribe)).toEqual({
      value: 0,
      determinate: true,
    })
    expect(getFrameWorkflowStepProgress(run.records['generate-narration-script'])).toEqual({
      value: 100,
      determinate: true,
    })
    expect(getFrameWorkflowProgress(run, steps)).toBe(70)
  })

  it('hides stale downstream records from progress display', () => {
    const run = makeRun({
      'merge-videos': {
        id: 'merge-videos',
        status: 'running',
        progress: { percentage: 92, message: '正在读取合并视频时长' },
      },
      transcribe: {
        id: 'transcribe',
        status: 'success',
      },
      'generate-narration-script': {
        id: 'generate-narration-script',
        status: 'running',
        progress: { percentage: 80, message: '旧的脚本进度' },
      },
    })

    const displayRun = getFrameWorkflowDisplayRun(run, steps, 'merge-videos')

    expect(displayRun?.records['merge-videos']?.status).toBe('running')
    expect(displayRun?.records.transcribe).toBeUndefined()
    expect(displayRun?.records['generate-narration-script']).toBeUndefined()
    expect(getFrameWorkflowCompletedCount(displayRun, steps)).toBe(0)
    expect(getFrameWorkflowProgress(displayRun, steps)).toBe(9)
  })

  it('keeps waiting rows visually idle when a stale running record is not the active step', () => {
    const run = makeRun({
      'merge-videos': {
        id: 'merge-videos',
        status: 'running',
        progress: { percentage: 50 },
      },
      transcribe: {
        id: 'transcribe',
        status: 'running',
        progress: { percentage: 80 },
      },
    })
    const displayRun = getFrameWorkflowDisplayRun(run, steps, 'merge-videos')

    expect(getFrameWorkflowDisplayStepState(displayRun, steps[0], 'merge-videos')).toMatchObject({
      status: 'running',
      isActive: true,
      progress: { value: 50, determinate: true },
    })
    expect(getFrameWorkflowDisplayStepState(displayRun, steps[1], 'merge-videos')).toMatchObject({
      record: undefined,
      status: 'idle',
      isActive: false,
      progress: { value: 0, determinate: true },
    })
  })

  it('uses the explicit active step for display scope without overwriting earlier step statuses', () => {
    const run = makeRun({
      'merge-videos': {
        id: 'merge-videos',
        status: 'running',
        progress: { percentage: 92, message: '旧的合并进度' },
      },
      transcribe: {
        id: 'transcribe',
        status: 'running',
        progress: { percentage: 80, message: '正在提取音频' },
      },
      'generate-narration-script': {
        id: 'generate-narration-script',
        status: 'running',
        progress: { percentage: 60, message: '旧的下游进度' },
      },
    })

    const displayRun = getFrameWorkflowDisplayRun(run, steps, 'transcribe')

    expect(displayRun?.records['merge-videos']?.status).toBe('running')
    expect(displayRun?.records.transcribe?.status).toBe('running')
    expect(displayRun?.records['generate-narration-script']).toBeUndefined()
    expect(getFrameWorkflowCompletedCount(displayRun, steps)).toBe(0)
    expect(getFrameWorkflowProgress(displayRun, steps)).toBe(33)
  })

  it('falls back to the latest running record when no explicit active step is available', () => {
    const run = makeRun({
      'merge-videos': {
        id: 'merge-videos',
        status: 'success',
      },
      transcribe: {
        id: 'transcribe',
        status: 'running',
        progress: { percentage: 80 },
      },
      'generate-narration-script': {
        id: 'generate-narration-script',
        status: 'idle',
        progress: { percentage: 90 },
      },
    })

    const displayRun = getFrameWorkflowDisplayRun(run, steps)

    expect(displayRun?.records.transcribe?.status).toBe('running')
    expect(displayRun?.records['generate-narration-script']).toBeUndefined()
    expect(getFrameWorkflowProgress(displayRun, steps)).toBe(34)
  })

  it('keeps active step local progress separate from overall workflow progress', () => {
    const run = makeRun({
      'merge-videos': {
        id: 'merge-videos',
        status: 'success',
      },
      'extract-audio': {
        id: 'extract-audio',
        status: 'running',
        progress: { percentage: 92, message: '正在提取合并视频中的音频 92%' },
      },
    })

    const displayRun = getFrameWorkflowDisplayRun(run, mainWorkflowWeightedSteps, 'extract-audio')

    expect(getFrameWorkflowDisplayStepState(displayRun, mainWorkflowWeightedSteps[1], 'extract-audio').progress).toEqual({
      value: 92,
      determinate: true,
    })
    expect(getFrameWorkflowCompletedCount(displayRun, mainWorkflowWeightedSteps)).toBe(1)
    expect(getFrameWorkflowProgress(displayRun, mainWorkflowWeightedSteps)).toBe(11)
  })

  it('resumes from the first incomplete step when the saved start step is already complete', () => {
    const run = {
      ...makeRun({
        'merge-videos': { id: 'merge-videos', status: 'success' },
        'extract-audio': { id: 'extract-audio', status: 'success' },
        transcribe: { id: 'transcribe', status: 'success' },
        'validate-subtitles': { id: 'validate-subtitles', status: 'success' },
        'decide-timeline-view': { id: 'decide-timeline-view', status: 'success' },
        'generate-timeline-images': { id: 'generate-timeline-images', status: 'success' },
        'analyze-timeline-images': { id: 'analyze-timeline-images', status: 'success' },
        'understand-narrative': { id: 'understand-narrative', status: 'success' },
        'merge-video-context': { id: 'merge-video-context', status: 'success' },
        'generate-narration-script': { id: 'generate-narration-script', status: 'success' },
      }),
      startStepId: 'generate-narration-script' as const,
    }

    expect(getFrameWorkflowResumeStepId(run, mainWorkflowWeightedSteps)).toBe('match-narration-visuals')
  })

  it('retries a failed narration step without repeating completed upstream steps', () => {
    const run = {
      ...makeRun({
        'merge-videos': { id: 'merge-videos', status: 'success' },
        'extract-audio': { id: 'extract-audio', status: 'success' },
        transcribe: { id: 'transcribe', status: 'success' },
        'validate-subtitles': { id: 'validate-subtitles', status: 'success' },
        'decide-timeline-view': { id: 'decide-timeline-view', status: 'success' },
        'generate-timeline-images': { id: 'generate-timeline-images', status: 'success' },
        'analyze-timeline-images': { id: 'analyze-timeline-images', status: 'success' },
        'understand-narrative': { id: 'understand-narrative', status: 'success' },
        'merge-video-context': { id: 'merge-video-context', status: 'success' },
        'generate-narration-script': {
          id: 'generate-narration-script',
          status: 'error',
          error: 'seg-02 narration character count is outside the accepted range',
        },
      }),
      startStepId: 'generate-narration-script' as const,
    }

    expect(getFrameWorkflowResumeStepId(run, mainWorkflowWeightedSteps)).toBe('generate-narration-script')
  })

  it('honors a saved start step when that step is still incomplete', () => {
    const run = {
      ...makeRun({
        'merge-videos': { id: 'merge-videos', status: 'success' },
        'extract-audio': { id: 'extract-audio', status: 'success' },
        transcribe: { id: 'transcribe', status: 'success' },
        'validate-subtitles': { id: 'validate-subtitles', status: 'success' },
        'decide-timeline-view': { id: 'decide-timeline-view', status: 'success' },
        'generate-timeline-images': { id: 'generate-timeline-images', status: 'success' },
        'analyze-timeline-images': { id: 'analyze-timeline-images', status: 'success' },
        'understand-narrative': { id: 'understand-narrative', status: 'success' },
        'merge-video-context': { id: 'merge-video-context', status: 'success' },
        'generate-narration-script': { id: 'generate-narration-script', status: 'success' },
        'match-narration-visuals': { id: 'match-narration-visuals', status: 'error', error: '匹配失败' },
      }),
      startStepId: 'match-narration-visuals' as const,
    }

    expect(getFrameWorkflowResumeStepId(run, mainWorkflowWeightedSteps)).toBe('match-narration-visuals')
  })
})
