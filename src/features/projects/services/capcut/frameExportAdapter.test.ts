import { describe, expect, it, vi, beforeEach } from 'vitest'
import { buildFrameCapcutExportPayload } from './frameExportAdapter'
import { localAssetStorageService } from '@/shared/services/localAssetStorageService'
import { localAudioStorageService } from '@/shared/services/localAudioStorageService'
import type { FrameInferencePipelineResult } from '@/features/projects/services/material/frameInferencePipelineService'
import type { FrameDebugRun } from '@/features/projects/workflow/frame'
import type { ProjectArtifact } from '@/features/projects/types/project'

vi.mock('@/shared/services/localAssetStorageService', () => ({
  localAssetStorageService: {
    getProjectAsset: vi.fn()
  }
}))

vi.mock('@/shared/services/localAudioStorageService', () => ({
  localAudioStorageService: {
    getAudioBlob: vi.fn()
  }
}))

const makeResult = (overrides: Partial<FrameInferencePipelineResult> = {}): FrameInferencePipelineResult => ({
  mergedVideo: { name: 'source.mp4', size: 10, type: 'video/mp4', duration: 4 },
  extractedAudio: { name: 'source.mp3', size: 4, type: 'audio/mpeg' },
  transcription: {} as FrameInferencePipelineResult['transcription'],
  subtitleResult: {} as FrameInferencePipelineResult['subtitleResult'],
  subtitlePayload: {} as FrameInferencePipelineResult['subtitlePayload'],
  videoContext: {} as FrameInferencePipelineResult['videoContext'],
  decision: {} as FrameInferencePipelineResult['decision'],
  analyses: [],
  narrativeUnderstanding: {} as FrameInferencePipelineResult['narrativeUnderstanding'],
  voiceoverResult: {
    items: [
      { _id: 1, text: '第一句解说', start: 0, end: 1, org: '', local_audio_key: 'project:1:narration:1', duration: 1.2 },
      { _id: 2, text: '', start: 1, end: 2, org: '原片字幕' }
    ],
    audioStates: {},
    voiceUri: 'voice-1',
    serviceLevel: 'basic',
    generatedCount: 1
  },
  tokens: {
    transcription: 0,
    decision: 0,
    analysis: 0,
    narrative: 0,
    total: 0
  },
  ...overrides
})

describe('buildFrameCapcutExportPayload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:voice-1')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn())
  })

  it('从 OPFS 源视频和本地音频缓存构建剪映导出输入', async () => {
    const sourceFile = new File(['video'], 'source.mp4', { type: 'video/mp4' })
    const audioBlob = new Blob(['voice'], { type: 'audio/mpeg' })
    vi.mocked(localAssetStorageService.getProjectAsset).mockResolvedValue(sourceFile)
    vi.mocked(localAudioStorageService.getAudioBlob).mockResolvedValue(audioBlob)

    const payload = await buildFrameCapcutExportPayload({
      result: makeResult(),
      sourceVideoArtifact: {
        storage: 'opfs',
        key: 'projects/project-1/source_video/source.mp4',
        name: 'source.mp4',
        type: 'video/mp4',
        size: 5,
        duration: 2,
        missing: false,
        updated_at: '2026-01-01T00:00:00Z'
      }
    })

    expect(payload.videoFile).toBe(sourceFile)
    expect(payload.scriptItems[0]).toMatchObject({
      _id: 1,
      audio_url: 'blob:voice-1',
      audio: 'blob:voice-1',
      duration: 1.2
    })
    expect(payload.scriptItems[1]).toMatchObject({ _id: 2, OST: 1 })
    expect(payload.narrationAudioAssets).toEqual([{
      itemId: 1,
      blob: audioBlob,
      duration: 1.2
    }])
    payload.release()
    payload.release()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:voice-1')
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  it('会把通用模式背景音乐下载为额外音频素材', async () => {
    const sourceFile = new File(['video'], 'source.mp4', { type: 'video/mp4' })
    const audioBlob = new Blob(['voice'], { type: 'audio/mpeg' })
    vi.mocked(localAssetStorageService.getProjectAsset).mockResolvedValue(sourceFile)
    vi.mocked(localAudioStorageService.getAudioBlob).mockResolvedValue(audioBlob)
    vi.mocked(fetch).mockResolvedValue(new Response(new Blob(['bgm'], { type: 'audio/mpeg' }), { status: 200 }))

    const payload = await buildFrameCapcutExportPayload({
      result: makeResult({
        finalVideoResult: {
          name: 'final.mp4',
          size: 10,
          type: 'video/mp4',
          artifact: {} as ProjectArtifact,
          backgroundMusic: {
            label: '背景音乐',
            id: 1,
            url: 'https://example.com/bgm.mp3'
          }
        }
      }),
      workflowRun: {
        records: {
          'merge-videos': {
            id: 'merge-videos',
            status: 'success',
            output: { file: sourceFile, video: { name: 'source.mp4', size: 5, type: 'video/mp4', duration: 2 } }
          }
        }
      } as FrameDebugRun
    })

    expect(payload.extraAudioAssets).toHaveLength(1)
    expect(payload.extraAudioAssets[0]).toMatchObject({
      fileName: 'background_music.mp3',
      volume: 0.18
    })
  })

  it('后续背景音乐恢复失败时释放已创建的解说音频 URL', async () => {
    const sourceFile = new File([], 'source.mp4', { type: 'video/mp4' })
    vi.mocked(localAudioStorageService.getAudioBlob).mockResolvedValue(
      new Blob(['voice'], { type: 'audio/mpeg' })
    )
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      blob: vi.fn().mockRejectedValue(new Error('background decode failed'))
    } as unknown as Response)

    await expect(buildFrameCapcutExportPayload({
      result: makeResult({
        finalVideoResult: {
          name: 'final.mp4',
          size: 10,
          type: 'video/mp4',
          artifact: {} as ProjectArtifact,
          backgroundMusic: {
            label: '背景音乐',
            id: 1,
            url: 'https://example.com/empty-bgm.mp3'
          }
        }
      }),
      sourceVideoFile: sourceFile
    })).rejects.toThrow('background decode failed')

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:voice-1')
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  it('并行恢复失败后会立即释放晚到的解说音频 URL', async () => {
    let resolveDelayedAudio: ((blob: Blob) => void) | undefined
    const delayedAudio = new Promise<Blob>((resolve) => {
      resolveDelayedAudio = resolve
    })
    vi.mocked(localAudioStorageService.getAudioBlob).mockImplementation((key) => {
      if (key === 'project:1:narration:fast-failure') {
        return Promise.reject(new Error('fast restoration failure'))
      }
      return delayedAudio
    })

    const result = makeResult()
    result.voiceoverResult!.items = [
      { _id: 1, text: '失败解说', start: 0, end: 1, org: '', local_audio_key: 'project:1:narration:fast-failure' },
      { _id: 2, text: '延迟解说', start: 1, end: 2, org: '', local_audio_key: 'project:1:narration:delayed' }
    ]

    await expect(buildFrameCapcutExportPayload({
      result,
      sourceVideoFile: new File([], 'source.mp4', { type: 'video/mp4' })
    })).rejects.toThrow('fast restoration failure')

    expect(URL.createObjectURL).not.toHaveBeenCalled()
    resolveDelayedAudio?.(new Blob(['late voice'], { type: 'audio/mpeg' }))
    await delayedAudio
    await Promise.resolve()

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:voice-1')
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  it('源视频缺失时阻止导出', async () => {
    vi.mocked(localAssetStorageService.getProjectAsset).mockResolvedValue(null)

    await expect(buildFrameCapcutExportPayload({
      result: makeResult(),
      sourceVideoArtifact: {
        storage: 'opfs',
        key: 'projects/project-1/source_video/missing.mp4',
        name: 'missing.mp4',
        type: 'video/mp4',
        size: 5,
        duration: 2,
        missing: true,
        updated_at: '2026-01-01T00:00:00Z'
      }
    })).rejects.toThrow('本地源视频缺失')
  })

  it('prefers an explicit desktop source without consulting browser storage', async () => {
    const sourceVideoFile = new File([], 'source.mp4', { type: 'video/mp4' })
    vi.mocked(localAudioStorageService.getAudioBlob).mockResolvedValue(
      new Blob(['voice'], { type: 'audio/mpeg' })
    )

    const payload = await buildFrameCapcutExportPayload({
      result: makeResult(),
      sourceVideoFile
    })

    expect(payload.videoFile).toBe(sourceVideoFile)
    expect(localAssetStorageService.getProjectAsset).not.toHaveBeenCalled()
  })
})
