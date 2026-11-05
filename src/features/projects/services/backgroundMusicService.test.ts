import { beforeEach, describe, expect, it, vi } from 'vitest'
import systemService from '@/shared/services/systemService'
import { fetchBackgroundMusicOptions } from './backgroundMusicService'

vi.mock('@/shared/services/systemService', () => ({
  default: {
    getPublicSystemSettingByKey: vi.fn(),
  },
}))

describe('backgroundMusicService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('系统配置请求失败时将错误交给调用方，而不是伪装成本地曲目', async () => {
    vi.mocked(systemService.getPublicSystemSettingByKey).mockRejectedValue(new Error('not configured'))

    await expect(fetchBackgroundMusicOptions()).rejects.toThrow('not configured')
  })

  it('优先使用公开系统配置中的 bgms', async () => {
    vi.mocked(systemService.getPublicSystemSettingByKey).mockResolvedValue({
      key: 'bgms',
      value: {
        bgms: [
          {
            id: 101,
            label: '史诗战斗',
            label_i18n: {
              'zh-CN': '史诗战斗',
              en: 'Epic Battle',
            },
            fileName: 'epic-battle.mp3',
            url: 'https://store.narratoai.cn/bgms/epic-battle.mp3',
          },
        ],
      },
    })

    await expect(fetchBackgroundMusicOptions()).resolves.toEqual([
      {
        id: 101,
        label: '史诗战斗',
        label_i18n: {
          'zh-CN': '史诗战斗',
          en: 'Epic Battle',
        },
        fileName: 'epic-battle.mp3',
        url: 'https://store.narratoai.cn/bgms/epic-battle.mp3',
      },
    ])
  })

  it('兼容直接数组形式并用文件名生成默认 R2 地址', async () => {
    vi.mocked(systemService.getPublicSystemSettingByKey).mockResolvedValue({
      key: 'bgms',
      value: [
        {
          label: '温柔铺底',
          fileName: 'gentle.mp3',
        },
      ],
    })

    await expect(fetchBackgroundMusicOptions()).resolves.toEqual([
      {
        id: 1,
        label: '温柔铺底',
        fileName: 'gentle.mp3',
        url: 'https://store.narratoai.cn/bgms/gentle.mp3',
      },
    ])
  })
})
