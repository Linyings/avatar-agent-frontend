import { beforeEach, describe, expect, it, vi } from 'vitest'
import { step2ExtractAudio } from '../../steps/step_2_extract_audio'
import type { ExtractAudioOutput, FrameWorkflowRuntimeContext, MergeVideosOutput } from '../../types'

const mocks = vi.hoisted(() => ({
  extractAudioForTranscription: vi.fn(),
  getProjectAsset: vi.fn(),
}))

vi.mock('@/features/projects/services/material/frameInferencePipelineService', () => ({
  extractAudioForTranscription: mocks.extractAudioForTranscription,
}))

vi.mock('@/shared/services/localAssetStorageService', () => ({
  localAssetStorageService: {
    getProjectAsset: mocks.getProjectAsset,
  },
}))

const makeContext = (merged?: MergeVideosOutput): FrameWorkflowRuntimeContext => ({
  projectId: 'project-1',
  files: [],
  config: {
    outputLanguage: 'zh-CN',
    defaultNFrames: 10,
    maxDecisions: 8,
  },
  records: merged
    ? {
      'merge-videos': {
        id: 'merge-videos',
        status: 'success',
        output: merged,
      },
    }
    : {},
  updateStepProgress: vi.fn(),
})

const makeMergedOutput = (file?: File): MergeVideosOutput => ({
  ...(file ? { file } : {}),
  video: {
    name: file?.name ?? 'source.mp4',
    size: file?.size ?? 123,
    type: file?.type ?? 'video/mp4',
    duration: 12,
  },
} as MergeVideosOutput)

describe('workflow/frame/steps/step_2_extract_audio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.extractAudioForTranscription.mockResolvedValue(
      new File(['audio'], 'source-123.mp3', { type: 'audio/mpeg' })
    )
    mocks.getProjectAsset.mockResolvedValue(null)
  })

  it('buildInput 会读取 merge-videos 的输出作为输入', () => {
    const sourceFile = new File(['video'], 'source.mp4', { type: 'video/mp4' })
    const merged = makeMergedOutput(sourceFile)

    expect(step2ExtractAudio.buildInput(makeContext(merged))).toEqual({ merged })
  })

  it('缺少 merge-videos 输出时会阻止继续执行', () => {
    expect(() => step2ExtractAudio.buildInput(makeContext())).toThrow('缺少依赖步骤 merge-videos')
  })

  it('使用 merge-videos 输出中的 File 提取 MP3 音频', async () => {
    const sourceFile = new File(['video'], 'source.mp4', { type: 'video/mp4' })
    const audioFile = new File(['audio'], 'source-123.mp3', { type: 'audio/mpeg' })
    mocks.extractAudioForTranscription.mockResolvedValue(audioFile)
    const context = makeContext(makeMergedOutput(sourceFile))

    const output = await step2ExtractAudio.run({ merged: makeMergedOutput(sourceFile) }, context) as ExtractAudioOutput

    expect(mocks.getProjectAsset).not.toHaveBeenCalled()
    expect(mocks.extractAudioForTranscription).toHaveBeenCalledWith(
      sourceFile,
      expect.any(Function),
      undefined
    )
    expect(output).toEqual({
      file: audioFile,
      audio: {
        name: 'source-123.mp3',
        size: audioFile.size,
        type: 'audio/mpeg',
      },
    })
  })

  it('当临时 File 丢失时会优先从 OPFS sourceVideoArtifact 恢复视频再提取音频', async () => {
    const restoredFile = new File(['restored-video'], 'restored.mp4', { type: 'video/mp4' })
    const audioFile = new File(['audio'], 'restored-123.mp3', { type: 'audio/mpeg' })
    mocks.getProjectAsset.mockResolvedValue(restoredFile)
    mocks.extractAudioForTranscription.mockResolvedValue(audioFile)
    const merged = {
      video: {
        name: 'source.mp4',
        size: 123,
        type: 'video/mp4',
        duration: 12,
      },
      sourceVideoArtifact: {
        storage: 'opfs',
        key: 'projects/project-1/source_video/source.mp4',
        name: 'source.mp4',
        type: 'video/mp4',
        size: 123,
        duration: 12,
        missing: false,
        updated_at: '2026-05-12T00:00:00.000Z',
      },
    } as MergeVideosOutput

    const output = await step2ExtractAudio.run({ merged }, makeContext(merged)) as ExtractAudioOutput

    expect(mocks.getProjectAsset).toHaveBeenCalledWith('projects/project-1/source_video/source.mp4')
    expect(mocks.extractAudioForTranscription).toHaveBeenCalledWith(
      restoredFile,
      expect.any(Function),
      undefined
    )
    expect(output.audio).toEqual({
      name: 'restored-123.mp3',
      size: audioFile.size,
      type: 'audio/mpeg',
    })
  })

  it('没有可恢复视频文件时会提示重新执行合并视频', async () => {
    const merged = {
      video: {
        name: 'source.mp4',
        size: 123,
        type: 'video/mp4',
        duration: 12,
      },
    } as MergeVideosOutput

    await expect(step2ExtractAudio.run({ merged }, makeContext(merged))).rejects.toThrow(
      '合并视频 File 已丢失，请先重新执行“合并视频”'
    )
    expect(mocks.extractAudioForTranscription).not.toHaveBeenCalled()
  })
})
