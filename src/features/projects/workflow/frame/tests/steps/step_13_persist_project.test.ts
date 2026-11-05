import { beforeEach, describe, expect, it, vi } from 'vitest'
import { step13PersistProject } from '../../steps/step_13_persist_project'
import {
  makeArtifact,
  makeComposeFinalVideoOutput,
  makeMergedOutput,
  makeProject,
  makeRuntimeContext,
  successRecord,
} from './fixtures'

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  updateProject: vi.fn(),
  saveProjectAsset: vi.fn(),
  saveFrameWorkflowProjectPreview: vi.fn(),
}))

vi.mock('@/features/projects/services/projectService', () => ({
  default: {
    getProject: mocks.getProject,
    updateProject: mocks.updateProject,
  },
}))

vi.mock('@/shared/services/localAssetStorageService', () => ({
  localAssetStorageService: {
    saveProjectAsset: mocks.saveProjectAsset,
  },
}))

vi.mock('../../persistence/projectPreview', () => ({
  saveFrameWorkflowProjectPreview: mocks.saveFrameWorkflowProjectPreview,
}))

describe('workflow/frame/steps/step_13_persist_project', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getProject.mockResolvedValue(makeProject())
    mocks.updateProject.mockImplementation(async (_projectId, patch) => makeProject(patch))
    mocks.saveProjectAsset.mockResolvedValue(makeArtifact({ key: 'projects/project-1/source_video/saved.mp4' }))
    mocks.saveFrameWorkflowProjectPreview.mockResolvedValue(true)
  })

  const makeContext = (sourceVideoArtifact: ReturnType<typeof makeArtifact> | null = makeArtifact()) => {
    const merged = makeMergedOutput({ sourceVideoArtifact })
    const composed = makeComposeFinalVideoOutput()
    const context = makeRuntimeContext({
      projectName: '完成后的项目名',
      projectMetadata: { existing: true },
      config: {
        selectionRatio: 0.3,
        outputDurationMs: 120_000,
        narrationRatio: 0.5,
        originalRatio: 50,
      },
      records: {
        'merge-videos': successRecord('merge-videos', merged),
        'compose-final-video': successRecord('compose-final-video', composed),
      },
      updateStepProgress: vi.fn(),
    })

    return { context, merged, composed }
  }

  it('buildInput 会组装项目名称、pipelineResult、最终视频和逐帧 metadata', () => {
    const { context, merged, composed } = makeContext()

    const input = step13PersistProject.buildInput(context) as {
      projectName?: string
      merged: unknown
      pipelineResult: unknown
      finalVideo: unknown
      projectMetadata: Record<string, unknown>
    }

    expect(input.projectName).toBe('完成后的项目名')
    expect(input.merged).toBe(merged)
    expect(input.pipelineResult).toBe(composed.pipelineResult)
    expect(input.finalVideo).toBe(composed.finalVideo)
    expect(input.projectMetadata).toMatchObject({
      existing: true,
      inference_mode: 'frame',
      frame_inference_config: expect.objectContaining({
        output_language: 'zh-CN',
        selection_ratio: 0.3,
        output_duration_ms: 120_000,
        narration_ratio: 0.5,
        original_ratio: 50,
        default_n_frames: 15,
        max_decisions: 2,
      }),
      frame_inference_completed_at: expect.any(String),
    })
  })

  it('缺少最终视频输出时会阻止继续执行', () => {
    expect(() => step13PersistProject.buildInput(makeRuntimeContext())).toThrow('缺少依赖步骤 merge-videos')
  })

  it('run 会复用 step1 已保存的 sourceVideoArtifact 并写入项目 workflow、artifacts 和 metadata', async () => {
    const sourceVideoArtifact = makeArtifact({ key: 'projects/project-1/source_video/source.mp4' })
    const { context, merged } = makeContext(sourceVideoArtifact)
    const input = step13PersistProject.buildInput(context)

    const output = await step13PersistProject.run(input, context)

    expect(mocks.saveProjectAsset).not.toHaveBeenCalled()
    expect(mocks.updateProject).toHaveBeenCalledWith('project-1', expect.objectContaining({
      name: '完成后的项目名',
      status: 'completed',
      artifacts: expect.objectContaining({
        source_video: sourceVideoArtifact,
        final_video: expect.objectContaining({
          key: 'projects/project-1/final_video/final.mp4',
        }),
      }),
      metadata: expect.objectContaining({
        inference_mode: 'frame',
      }),
      workflow: expect.objectContaining({
        status: 'completed',
        current_step: 'step_14_completed',
        current_step_id: null,
        current_step_index: 14,
        revision: 2,
        stages: expect.objectContaining({
          source_video: expect.objectContaining({
            data: expect.objectContaining({
              video_context: expect.any(Object),
              merged_video: merged.video,
            }),
          }),
          script: expect.objectContaining({
            data: expect.objectContaining({
              ai_analysis_script: expect.objectContaining({
                frame_workflow: expect.any(Object),
                items: expect.any(Array),
                audioStates: expect.any(Object),
              }),
            }),
          }),
        }),
      }),
    }))
    expect(mocks.saveFrameWorkflowProjectPreview).toHaveBeenCalledWith('project-1', merged)
    expect(output).toMatchObject({
      previewSaved: true,
      writtenFields: [
        'workflow.stages.subtitles',
        'workflow.stages.source_video',
        'workflow.stages.script.data.ai_analysis_script',
        'artifacts.source_video',
        'artifacts.final_video',
        'metadata',
      ],
    })
    expect(context.updateStepProgress).toHaveBeenLastCalledWith('persist-project', {
      percentage: 100,
      message: '项目写入已完成',
    })
  })

  it('sourceVideoArtifact 丢失时会把合并视频保存到 OPFS 后再写入项目', async () => {
    const { context, merged } = makeContext(null)

    await step13PersistProject.run(step13PersistProject.buildInput(context), context)

    expect(mocks.saveProjectAsset).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      kind: 'source_video',
      file: merged.file,
      name: merged.file.name,
      type: 'video/mp4',
      duration: merged.video.duration,
    }))
    expect(mocks.updateProject).toHaveBeenCalledWith('project-1', expect.objectContaining({
      artifacts: expect.objectContaining({
        source_video: expect.objectContaining({
          key: 'projects/project-1/source_video/saved.mp4',
        }),
      }),
    }))
  })

  it('summarizeOutput 会返回写入字段列表', () => {
    expect(step13PersistProject.summarizeOutput({
      workflowResult: {},
      projectResult: {},
      previewSaved: true,
      writtenFields: ['metadata'],
    })).toEqual({
      writtenFields: ['metadata'],
    })
  })
})
