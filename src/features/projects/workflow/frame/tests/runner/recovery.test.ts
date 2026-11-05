import { describe, expect, it } from 'vitest'
import type { Project, ProjectWorkflowStepState } from '@/features/projects/types/project'
import {
  buildRecoverableFrameWorkflowRun,
  getFrameWorkflowResumeSummary,
  hydrateRecoveredFrameWorkflowRunWithFiles,
} from '../../runner/recovery'
import type { FrameDebugStepId } from '../../types'
import { frameStepKeyById } from '../../constants'

const now = '2026-05-14T08:00:00.000Z'

const success = (summary?: Record<string, unknown>): ProjectWorkflowStepState => ({
  status: 'success',
  updated_at: now,
  completed_at: now,
  ...(summary ? { summary } : {}),
})

const running = (): ProjectWorkflowStepState => ({
  status: 'running',
  updated_at: now,
  progress: { percentage: 42, message: '正在执行中断步骤' },
})

const makeSteps = (states: Partial<Record<FrameDebugStepId, ProjectWorkflowStepState>>) => Object.fromEntries(
  Object.entries(states).map(([stepId, state]) => [frameStepKeyById[stepId as FrameDebugStepId], state])
) as Project['workflow']['steps']

const makeProject = (overrides: Partial<Project> = {}): Project => ({
  id: 'project-1',
  owner_id: 'owner-1',
  name: '逐帧恢复项目',
  status: 'processing',
  created_at: now,
  updated_at: now,
  workflow: {
    mode: 'frame',
    status: 'processing',
    current_step: 'step_3_transcribe',
    current_step_id: 'transcribe',
    current_step_index: 3,
    revision: 3,
    steps: {},
    stages: {},
  },
  artifacts: {},
  metadata: { inference_mode: 'frame' },
  ...overrides,
})

const mergedVideo = {
  name: 'source.mp4',
  size: 1000,
  type: 'video/mp4',
  duration: 60,
}

const sourceArtifact = {
  storage: 'opfs' as const,
  key: 'projects/project-1/source_video/source.mp4',
  name: 'source.mp4',
  type: 'video/mp4',
  size: 1000,
  duration: 60,
  updated_at: now,
}

const frameWorkflow = {
  mergedVideo,
  extractedAudio: { name: 'source.mp3', size: 100, type: 'audio/mpeg' },
  transcription: {
    success: true,
    provider: 'test',
    model: 'scribe',
    raw_result: {},
    packed_transcript: 'hello',
    phrases: [],
    words: [],
    audio_events: [],
    text_content: 'hello',
    language_code: 'zh',
    duration: 60,
    tokens_consumed: 10,
    updated_at: now,
  },
  subtitleResult: {
    segments: [],
    language: 'zh',
    totalDuration: 60,
    processingTime: 0,
    confidence: 1,
  },
  subtitlePayload: [],
  videoContext: {
    items: {},
    total_segments: 0,
    subtitle_segments: 0,
    visual_segments: 0,
    merged_at: 0,
  },
  decision: {
    success: true,
    provider: 'test',
    model: 'decision',
    analysis: '',
    decisions: [],
    tokens_consumed: 5,
    updated_at: now,
  },
  analyses: [],
  narrativeUnderstanding: {
    success: true,
    provider: 'test',
    model: 'narrative',
    content: '',
    analysis: {},
    characters: [],
    relationships: [],
    emotion_curve: [],
    events: [],
    request_id: 'req-1',
    tokens_consumed: 4,
    updated_at: now,
  },
  tokens: {
    transcription: 10,
    decision: 5,
    analysis: 0,
    narrative: 4,
    total: 19,
  },
}

describe('workflow/frame/runner/recovery', () => {
  it('把刷新后遗留的 running 步骤展示为 interrupted，并从缺失依赖处恢复', () => {
    const project = makeProject({
      workflow: {
        ...makeProject().workflow,
        steps: makeSteps({
          'merge-videos': success(),
          'extract-audio': success(),
          transcribe: running(),
        }),
        stages: {
          source_video: {
            data: {
              merged_video: mergedVideo,
              source_video_artifact: sourceArtifact,
            },
          },
        },
      },
    })

    const summary = getFrameWorkflowResumeSummary(project)
    const recovery = buildRecoverableFrameWorkflowRun(project)

    expect(summary.available).toBe(true)
    expect(summary.completedCount).toBe(2)
    expect(summary.nextStepLabel).toBe('转录字幕')
    expect(recovery?.run.records.transcribe?.status).toBe('interrupted')
    expect(recovery?.summary.resumeStepId).toBe('extract-audio')
  })

  it('已能重建 merge-video-context 时直接从中断步骤继续，不回退到旧的成功步骤', () => {
    const project = makeProject({
      workflow: {
        ...makeProject().workflow,
        current_step: 'step_10_generate_narration_script',
        current_step_id: 'generate-narration-script',
        current_step_index: 10,
        steps: makeSteps({
          'merge-videos': success(),
          'extract-audio': success(),
          transcribe: success(),
          'validate-subtitles': success(),
          'decide-timeline-view': success(),
          'generate-timeline-images': success(),
          'analyze-timeline-images': success(),
          'understand-narrative': success(),
          'merge-video-context': success(),
          'generate-narration-script': running(),
        }),
        stages: {
          source_video: {
            data: {
              merged_video: mergedVideo,
              source_video_artifact: sourceArtifact,
              video_context: frameWorkflow.videoContext,
            },
          },
          script: {
            data: {
              ai_analysis_script: {
                frame_workflow: frameWorkflow,
              },
            },
          },
        },
      },
    })

    const recovery = buildRecoverableFrameWorkflowRun(project)

    expect(recovery?.summary.nextStepId).toBe('generate-narration-script')
    expect(recovery?.summary.resumeStepId).toBe('generate-narration-script')
    expect(recovery?.run.records['merge-video-context']?.output).toBeTruthy()
    expect(recovery?.run.records['generate-narration-script']?.status).toBe('interrupted')
  })

  it('第 9 步已完成但尚未写入 frame_workflow 时，会从 stages 快照重建上下文并从第 10 步继续', () => {
    const project = makeProject({
      workflow: {
        ...makeProject().workflow,
        current_step: 'step_10_generate_narration_script',
        current_step_id: 'generate-narration-script',
        current_step_index: 10,
        steps: makeSteps({
          'merge-videos': success(),
          'extract-audio': success(frameWorkflow.extractedAudio),
          transcribe: success(),
          'validate-subtitles': success(),
          'decide-timeline-view': success(),
          'generate-timeline-images': success(),
          'analyze-timeline-images': success(),
          'understand-narrative': success(),
          'merge-video-context': success(),
          'generate-narration-script': running(),
        }),
        stages: {
          source_video: {
            data: {
              merged_video: mergedVideo,
              source_video_artifact: sourceArtifact,
              video_context: frameWorkflow.videoContext,
            },
          },
          subtitles: {
            data: frameWorkflow.subtitlePayload,
            subtitle_result: frameWorkflow.subtitleResult,
            transcription: frameWorkflow.transcription,
            validation: {},
          },
          script: {
            data: {
              timeline_decision: frameWorkflow.decision,
              timeline_analyses: frameWorkflow.analyses,
              narrative_understanding: frameWorkflow.narrativeUnderstanding,
            },
          },
        },
      },
    })

    const recovery = buildRecoverableFrameWorkflowRun(project)

    expect(recovery?.summary.nextStepId).toBe('generate-narration-script')
    expect(recovery?.summary.resumeStepId).toBe('generate-narration-script')
    expect(recovery?.run.records['merge-video-context']?.output).toBeTruthy()
    expect(recovery?.run.records['extract-audio']?.output).toEqual({ audio: frameWorkflow.extractedAudio })
  })

  it('用户重新选择原视频后，会把 File 注入已恢复的 merge-videos 输出', () => {
    const project = makeProject({
      workflow: {
        ...makeProject().workflow,
        steps: makeSteps({
          'merge-videos': success(),
          'extract-audio': running(),
        }),
        stages: {
          source_video: {
            data: {
              merged_video: mergedVideo,
            },
          },
        },
      },
    })
    const recovery = buildRecoverableFrameWorkflowRun(project)
    const file = new File(['video'], 'source.mp4', { type: 'video/mp4' })
    Object.defineProperty(file, 'size', { value: 1000 })

    const hydrated = hydrateRecoveredFrameWorkflowRunWithFiles(recovery!.run, [file])

    expect((hydrated.records['merge-videos']?.output as { file?: File }).file).toBe(file)
  })

  it('旧文案检查点缺少声画锚点时从生成文案重跑，纯原片流程不误回退', () => {
    const makeLegacyNarrationProject = (narrationRatio: number) => {
      const legacyFrameWorkflow = {
        ...frameWorkflow,
        narrationDraftItems: [{ _id: 1, text: '旧文案没有锚点' }],
        scriptResponse: { items: [{ _id: 1, text: '旧文案没有锚点' }] },
        voiceoverResult: { items: [], audioStates: {} },
      }
      return makeProject({
        metadata: {
          inference_mode: 'frame',
          frame_inference_config: { narration_ratio: narrationRatio },
        },
        workflow: {
          ...makeProject().workflow,
          current_step: 'step_12_compose_final_video',
          current_step_id: 'compose-final-video',
          current_step_index: 12,
          steps: makeSteps({
            'merge-videos': success(),
            'extract-audio': success(),
            transcribe: success(),
            'validate-subtitles': success(),
            'decide-timeline-view': success(),
            'generate-timeline-images': success(),
            'analyze-timeline-images': success(),
            'understand-narrative': success(),
            'merge-video-context': success(),
            'generate-narration-script': success(),
            'match-narration-visuals': success(),
            'generate-voiceover': success(),
            'compose-final-video': running(),
          }),
          stages: {
            source_video: {
              data: {
                merged_video: mergedVideo,
                source_video_artifact: sourceArtifact,
                video_context: frameWorkflow.videoContext,
                timeline_images: [],
              },
            },
            subtitles: {
              data: frameWorkflow.subtitlePayload,
              subtitle_result: frameWorkflow.subtitleResult,
              transcription: frameWorkflow.transcription,
              validation: {},
            },
            script: {
              data: {
                timeline_decision: frameWorkflow.decision,
                timeline_analyses: frameWorkflow.analyses,
                narrative_understanding: frameWorkflow.narrativeUnderstanding,
                ai_analysis_script: { frame_workflow: legacyFrameWorkflow },
              },
            },
          },
        },
      })
    }

    expect(buildRecoverableFrameWorkflowRun(makeLegacyNarrationProject(0.5))?.summary.resumeStepId)
      .toBe('generate-narration-script')
    expect(buildRecoverableFrameWorkflowRun(makeLegacyNarrationProject(0))?.summary.resumeStepId)
      .toBe('compose-final-video')
  })
})
