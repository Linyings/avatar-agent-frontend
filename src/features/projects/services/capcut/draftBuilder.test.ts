import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDraft } from './draftBuilder'
import { downloadAudiosInBatch, getVideoInfo } from './mediaProcessor'

vi.mock('./mediaProcessor', () => ({
  getVideoInfo: vi.fn(async (file: File, path: string) => ({
    width: 1920,
    height: 1080,
    duration: 10_000_000,
    path,
    file
  })),
  downloadAudiosInBatch: vi.fn(async (items: Array<{ path: string }>) => items.map(item => ({
    duration: 1_000_000,
    path: item.path,
    blob: new Blob(['voice'], { type: 'audio/mpeg' })
  }))),
  getAudioDuration: vi.fn(async () => 20_000_000)
}))

describe('buildDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValue('22222222-2222-4222-8222-222222222222')
  })

  it('会把额外音频素材写入草稿音频素材、背景音乐轨和导出文件集合', async () => {
    const videoFile = new File(['video'], 'source.mp4', { type: 'video/mp4' })
    const backgroundMusic = new Blob(['bgm'], { type: 'audio/mpeg' })

    const result = await buildDraft(
      videoFile,
      [{ _id: 1, text: '', start: 0, end: 4, org: '原片字幕' }],
      '/Users/test/Movies/JianyingPro/User Data/Projects/com.lveditor.draft',
      undefined,
      [{ fileName: 'background_music.mp3', blob: backgroundMusic, volume: 0.18 }]
    )

    expect(result.audioFiles.size).toBe(1)
    expect(Array.from(result.audioFiles.keys())[0]).toContain('/assets/audio/background_music.mp3')
    expect(result.draft.materials.audios[0]).toMatchObject({
      name: 'background_music.mp3',
      path: expect.stringContaining('/assets/audio/background_music.mp3')
    })
    const backgroundTrack = result.draft.tracks.find(track => track.name === '背景音乐')
    expect(backgroundTrack).toBeTruthy()
    expect(backgroundTrack?.segments[0]).toMatchObject({
      volume: 0.18,
      target_timerange: {
        start: 0,
        duration: 4_000_000
      }
    })
  })

  it('使用绝对素材路径，避免剪映导入后提示媒体丢失', async () => {
    const videoFile = new File(['video'], 'source.mp4', { type: 'video/mp4' })

    const result = await buildDraft(
      videoFile,
      [{ _id: 1, text: '', start: 0, end: 4, org: '原片字幕' }],
      '/Users/test/Movies/JianyingPro/User Data/Projects/com.lveditor.draft'
    )

    expect(result.draft.materials.videos[0]).toMatchObject({
      path: expect.stringContaining('/assets/video/source.mp4')
    })
    expect(result.meta).toMatchObject({
      draft_fold_path: expect.stringContaining('/com.lveditor.draft/'),
      draft_materials_path: expect.stringContaining('/assets'),
      draft_root_path: '/Users/test/Movies/JianyingPro/User Data/Projects/com.lveditor.draft'
    })
  })

  it('导出的剪映字幕会移除标点符号', async () => {
    const videoFile = new File(['video'], 'source.mp4', { type: 'video/mp4' })

    const result = await buildDraft(
      videoFile,
      [{
        _id: 1,
        text: '没？人，给我妈做主了！“',
        start: 0,
        end: 4,
        audio_url: 'blob:voice'
      }],
      '/Users/test/Movies/JianyingPro/User Data/Projects/com.lveditor.draft'
    )

    const textContent = JSON.parse(result.draft.materials.texts[0].content)
    expect(textContent.text).toBe('没人给我妈做主了')
  })

  it('uses supplied native metadata without probing the placeholder file', async () => {
    const placeholder = new File([], 'source.mp4', { type: 'video/mp4' })

    const result = await buildDraft(
      placeholder,
      [{ _id: 1, text: '', start: 0, end: 4, org: 'source subtitle' }],
      'C:\\JianyingDrafts',
      undefined,
      [],
      { width: 1280, height: 720, duration: 46 * 60 * 1_000_000 }
    )

    expect(getVideoInfo).not.toHaveBeenCalled()
    expect(result.draft.materials.videos[0]).toMatchObject({
      width: 1280,
      height: 720,
      duration: 46 * 60 * 1_000_000
    })
  })

  it('probes the video file when native metadata is not supplied', async () => {
    const videoFile = new File(['video'], 'source.mp4', { type: 'video/mp4' })

    await buildDraft(
      videoFile,
      [{ _id: 1, text: '', start: 0, end: 4, org: 'source subtitle' }],
      'C:\\JianyingDrafts'
    )

    expect(getVideoInfo).toHaveBeenCalledWith(
      videoFile,
      expect.stringContaining('\\assets\\video\\source.mp4')
    )
  })

  it('uses a restored narration blob without fetching its blob URL again', async () => {
    const placeholder = new File([], 'source.mp4', { type: 'video/mp4' })
    const narrationBlob = new Blob(['voice-direct'], { type: 'audio/mpeg' })

    const result = await buildDraft(
      placeholder,
      [{
        _id: 1,
        text: 'direct narration',
        start: 0,
        end: 1.2,
        audio_url: 'blob:renderer-only-url',
      }],
      'C:\\JianyingDrafts',
      undefined,
      [],
      { width: 1920, height: 1080, duration: 10_000_000 },
      [{ itemId: 1, blob: narrationBlob, duration: 1.2 }]
    )

    expect(downloadAudiosInBatch).not.toHaveBeenCalled()
    expect(result.audioFiles.size).toBe(1)
    expect(Array.from(result.audioFiles.values())[0]).toBe(narrationBlob)
    expect(result.draft.materials.audios[0]).toMatchObject({
      duration: 1_200_000,
      path: expect.stringContaining('\\assets\\audio\\audio_1.mp3')
    })
  })
})
