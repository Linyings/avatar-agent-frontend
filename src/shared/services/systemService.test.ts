import { beforeEach, describe, expect, it, vi } from 'vitest'
import systemService from './systemService'

describe('systemService public settings', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('normalizes the Go backend flat public settings response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        tts_voices: {
          voices: [
            {
              uri: 'speech:voice',
              name: '测试音色',
              sample_url: 'https://store.narratoai.cn/tts/test.mp3',
            },
          ],
        },
      }),
    }))

    await expect(systemService.getPublicSystemSettingByKey('tts_voices')).resolves.toEqual({
      key: 'tts_voices',
      value: {
        voices: [
          {
            uri: 'speech:voice',
            name: '测试音色',
            sample_url: 'https://store.narratoai.cn/tts/test.mp3',
          },
        ],
      },
    })
  })

  it('keeps compatibility with wrapped public settings responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        settings: {
          case_video: {
            items: [{ name: '案例', url: 'https://example.com/case.mp4' }],
          },
        },
      }),
    }))

    await expect(systemService.getPublicSettingsValue()).resolves.toEqual({
      case_video: {
        items: [{ name: '案例', url: 'https://example.com/case.mp4' }],
      },
    })
  })
})
