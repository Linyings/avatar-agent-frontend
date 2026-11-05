import { describe, expect, it, beforeEach, vi } from 'vitest'
import { step1MergeVideos } from '../../steps/step_1_merge_videos'
import type { FrameWorkflowRuntimeContext, MergeVideosOutput } from '../../types'

const mocks = vi.hoisted(() => ({
  concatenateVideoFiles: vi.fn(),
  getVideoDuration: vi.fn(),
  saveProjectAsset: vi.fn(),
}))

vi.mock('@/features/projects/services/material/videoConcatenationService', () => ({
  concatenateVideoFiles: mocks.concatenateVideoFiles,
}))

vi.mock('@/features/projects/services/material/frameInferencePipelineService', () => ({
  getVideoDuration: mocks.getVideoDuration,
}))

vi.mock('@/shared/services/localAssetStorageService', () => ({
  localAssetStorageService: {
    saveProjectAsset: mocks.saveProjectAsset,
  },
}))

const makeContext = (files: File[] = []): FrameWorkflowRuntimeContext => ({
  projectId: 'project-1',
  files,
  config: {
    outputLanguage: 'zh-CN',
    defaultNFrames: 10,
    maxDecisions: 8,
  },
  records: {},
  updateStepProgress: vi.fn(),
  updateStepLog: vi.fn(),
})

describe('workflow/frame/steps/step_1_merge_videos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getVideoDuration.mockResolvedValue(12)
    mocks.saveProjectAsset.mockImplementation(async ({
      projectId,
      kind,
      file,
      name,
      type,
      duration,
    }: {
      projectId: string
      kind: string
      file: File
      name?: string
      type?: string
      duration?: number | null
    }) => ({
      storage: 'opfs',
      key: `projects/${projectId}/${kind}/${name ?? file.name}`,
      name: name ?? file.name,
      type: type ?? file.type,
      size: file.size,
      duration: duration ?? null,
      missing: false,
      updated_at: '2026-05-12T00:00:00.000Z',
    }))
  })

  it('单个视频不会重编码合并，并会把原始视频保存到 OPFS', async () => {
    const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' })
    const context = makeContext([file])

    expect(step1MergeVideos.buildInput(context)).toEqual({ files: [file] })

    const output = await step1MergeVideos.run({ files: [file] }, context) as MergeVideosOutput

    expect(mocks.concatenateVideoFiles).not.toHaveBeenCalled()
    expect(mocks.getVideoDuration).toHaveBeenCalledWith(file)
    expect(mocks.saveProjectAsset).toHaveBeenCalledTimes(1)
    expect(mocks.saveProjectAsset).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      kind: 'source_video',
      file,
      name: 'clip.mp4',
      type: 'video/mp4',
      duration: 12,
    }))
    expect(output).toMatchObject({
      file,
      video: {
        name: 'clip.mp4',
        size: file.size,
        type: 'video/mp4',
        duration: 12,
      },
      sourceVideoArtifact: expect.objectContaining({
        storage: 'opfs',
        key: 'projects/project-1/source_video/clip.mp4',
      }),
    })
  })

  it('多个视频只保存合并后的 source 视频到 OPFS', async () => {
    const first = new File(['first'], 'first.mp4', { type: 'video/mp4' })
    const second = new File(['second'], 'second.mp4', { type: 'video/mp4' })
    const merged = new File(['merged'], 'merged.mp4', { type: 'video/mp4' })
    mocks.concatenateVideoFiles.mockImplementation(async (_files, onProgress) => {
      onProgress?.({ current: 1, total: 2, percentage: 50, message: '正在合并第 1/2 个视频' })
      return merged
    })
    mocks.getVideoDuration.mockResolvedValue(24)

    const output = await step1MergeVideos.run({ files: [first, second] }, makeContext([first, second])) as MergeVideosOutput

    expect(mocks.concatenateVideoFiles).toHaveBeenCalledWith(
      [first, second],
      expect.any(Function),
      undefined
    )
    expect(mocks.saveProjectAsset).toHaveBeenCalledTimes(1)
    expect(mocks.saveProjectAsset).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      kind: 'source_video',
      file: merged,
      name: 'merged.mp4',
      duration: 24,
    }))
    expect(output.file).toBe(merged)
    expect(output.sourceVideoArtifact).toEqual(expect.objectContaining({
      key: 'projects/project-1/source_video/merged.mp4',
      duration: 24,
    }))
  })

  it('没有视频文件时会阻止继续执行且不会写入 OPFS', async () => {
    await expect(step1MergeVideos.run({ files: [] }, makeContext())).rejects.toThrow('请先选择至少一个视频')

    expect(mocks.saveProjectAsset).not.toHaveBeenCalled()
    expect(mocks.concatenateVideoFiles).not.toHaveBeenCalled()
  })
})
