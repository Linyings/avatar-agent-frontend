import { MantineProvider } from '@mantine/core'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/shared/i18n/I18nProvider'
import { promptTemplateService } from '@/shared/services/promptTemplateService'
import { loadTTSService } from '@/shared/services/ttsServiceLoader'
import { fetchBackgroundMusicOptions } from '@/features/projects/services/backgroundMusicService'
import FrameWorkflowOptionFields, {
  type FrameWorkflowOptionValue,
} from './FrameWorkflowOptionFields'

vi.mock('@/shared/services/promptTemplateService', () => ({
  promptTemplateService: {
    getPromptTemplates: vi.fn(),
  },
}))

vi.mock('@/shared/services/ttsServiceLoader', () => ({
  loadTTSService: vi.fn(),
}))

vi.mock('@/features/projects/services/backgroundMusicService', () => ({
  fetchBackgroundMusicOptions: vi.fn(),
}))

const initialValue: FrameWorkflowOptionValue = {
  narrationStyleId: null,
  narrationStyleTitle: null,
  voice: null,
  voiceName: null,
  backgroundMusic: 'none',
  backgroundMusicId: null,
  backgroundMusicUrl: null,
}

const fetchBuiltInVoices = vi.fn()

class AudioMock {
  static instances: AudioMock[] = []

  src: string
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
  private listeners = new Map<string, Set<EventListener>>()

  constructor(src = '') {
    this.src = src
    AudioMock.instances.push(this)
  }

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener)
  }

  emit(type: string) {
    this.listeners.get(type)?.forEach(listener => listener(new Event(type)))
  }
}

function renderFields(
  overrides: Partial<FrameWorkflowOptionValue> = {},
  options: { initializeDefaults?: boolean; locale?: 'zh-CN' | 'en' } = {},
) {
  const onChange = vi.fn()
  const onValidityChange = vi.fn()
  const { initializeDefaults, locale = 'zh-CN' } = options

  const result = render(
    <MantineProvider>
      <MemoryRouter>
        <I18nProvider initialLocale={locale}>
          <FrameWorkflowOptionFields
            value={{ ...initialValue, ...overrides }}
            onChange={onChange}
            onValidityChange={onValidityChange}
            initializeDefaults={initializeDefaults}
          />
        </I18nProvider>
      </MemoryRouter>
    </MantineProvider>,
  )

  return { ...result, onChange, onValidityChange }
}

function renderControlledFields() {
  const onChange = vi.fn()
  const onValidityChange = vi.fn()
  let setControlledValue: ((value: FrameWorkflowOptionValue) => void) | null = null

  function ControlledFields() {
    const [value, setValue] = useState(initialValue)
    setControlledValue = setValue
    return (
      <FrameWorkflowOptionFields
        value={value}
        onChange={(nextValue) => {
          onChange(nextValue)
          setValue(nextValue)
        }}
        onValidityChange={onValidityChange}
      />
    )
  }

  render(
    <MantineProvider>
      <MemoryRouter>
        <I18nProvider initialLocale="zh-CN">
          <ControlledFields />
        </I18nProvider>
      </MemoryRouter>
    </MantineProvider>,
  )

  return {
    onChange,
    onValidityChange,
    setValue: (value: FrameWorkflowOptionValue) => act(() => setControlledValue?.(value)),
  }
}

const getBgmPreviewButtons = () => Array.from(
  document.querySelectorAll<HTMLButtonElement>('button[aria-label="试听背景音乐"]'),
)

describe('FrameWorkflowOptionFields', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    fetchBuiltInVoices.mockReset()
    AudioMock.instances = []
    vi.stubGlobal('Audio', AudioMock)
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
    vi.mocked(promptTemplateService.getPromptTemplates).mockResolvedValue([
      {
        id: 'short_story_comic',
        title: '短剧漫剧',
        version: '1',
        type: 'video_analysis',
      },
      {
        id: 'reference_copy',
        title: '参考文案',
        version: '1',
        type: 'video_analysis',
      },
    ])
    fetchBuiltInVoices.mockResolvedValue([
        {
          uri: 'voice-zh',
          name: '中文音色',
          type: 'basic',
          gender: 'male',
          language: 'zh',
          sample_url: 'https://example.test/voice-zh.mp3',
        },
        {
          uri: 'voice-en',
          name: 'English voice',
          type: 'advanced',
          gender: 'female',
          language: 'en',
          sample_url: 'https://example.test/voice-en.mp3',
        },
      ])
    vi.mocked(loadTTSService).mockResolvedValue({
      fetchBuiltInVoices,
    } as unknown as Awaited<ReturnType<typeof loadTTSService>>)
    vi.mocked(fetchBackgroundMusicOptions).mockResolvedValue([
      {
        id: 9,
        label: 'Remote track one',
        fileName: 'remote-track-one.mp3',
        url: 'https://example.test/remote-track-one.mp3',
      },
      {
        id: 10,
        label: 'Remote track two',
        fileName: 'remote-track-two.mp3',
        url: 'https://example.test/remote-track-two.mp3',
      },
    ])
  })

  it('does not initialize narration defaults unless explicitly requested', async () => {
    const { onChange, onValidityChange } = renderFields()

    await waitFor(() => {
      expect(promptTemplateService.getPromptTemplates).toHaveBeenCalledWith({
        type: 'video_analysis',
        templateType: 'fast',
      })
      expect(onValidityChange).toHaveBeenLastCalledWith(false)
    })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('initializes the default narration once when explicitly requested', async () => {
    const { onChange, rerender } = renderFields({}, { initializeDefaults: true })

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
        narrationStyleId: 'short_story_comic',
        narrationStyleTitle: '短剧漫剧',
      }))
    })

    rerender(
      <MantineProvider>
        <MemoryRouter>
          <I18nProvider initialLocale="zh-CN">
            <FrameWorkflowOptionFields
              value={initialValue}
              onChange={onChange}
              initializeDefaults
            />
          </I18nProvider>
        </MemoryRouter>
      </MantineProvider>,
    )

    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('retries only failed narration styles and restores validity from the recovered list', async () => {
    vi.mocked(promptTemplateService.getPromptTemplates)
      .mockRejectedValueOnce(new Error('Styles unavailable'))
      .mockResolvedValueOnce([
        {
          id: 'recovered-style',
          title: 'Recovered style',
          version: '1',
          type: 'video_analysis',
        },
        {
          id: 'reference_copy',
          title: '参考文案',
          version: '1',
          type: 'video_analysis',
        },
      ])
    const user = userEvent.setup()
    const { onValidityChange } = renderFields({
      narrationStyleId: 'recovered-style',
      narrationStyleTitle: 'Recovered style',
      voice: 'voice-zh',
    })

    const retry = await screen.findByRole('button', { name: '重试解说风格' })
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false))
    await user.click(retry)

    await waitFor(() => {
      expect(promptTemplateService.getPromptTemplates).toHaveBeenCalledTimes(2)
      expect(onValidityChange).toHaveBeenLastCalledWith(true)
    })
    expect(loadTTSService).toHaveBeenCalledTimes(1)
    expect(fetchBuiltInVoices).toHaveBeenCalledTimes(1)
    expect(fetchBackgroundMusicOptions).toHaveBeenCalledTimes(1)

    await user.click(screen.getAllByRole('combobox')[0])
    expect(await screen.findByText('Recovered style')).toBeInTheDocument()
    expect(screen.queryByText('参考文案')).not.toBeInTheDocument()
  })

  it('retries only failed voice loading and restores the complete voice list', async () => {
    fetchBuiltInVoices
      .mockRejectedValueOnce(new Error('Voices unavailable'))
      .mockResolvedValueOnce([
        {
          uri: 'voice-recovered-zh',
          name: 'Recovered Chinese voice',
          type: 'basic',
          gender: 'male',
          language: 'zh',
        },
        {
          uri: 'voice-recovered-en',
          name: 'Recovered English voice',
          type: 'advanced',
          gender: 'female',
          language: 'en',
        },
        {
          uri: 'voice-recovered-ja',
          name: 'Recovered Japanese voice',
          type: 'basic',
          gender: 'female',
          language: 'ja',
        },
      ])
    const user = userEvent.setup()
    const { onChange, onValidityChange } = renderFields({
      narrationStyleId: 'short_story_comic',
      narrationStyleTitle: '短剧漫剧',
      voice: 'voice-recovered-ja',
    })

    const retry = await screen.findByRole('button', { name: '重试配音音色' })
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false))
    await user.click(retry)

    await waitFor(() => {
      expect(fetchBuiltInVoices).toHaveBeenCalledTimes(2)
      expect(onValidityChange).toHaveBeenLastCalledWith(true)
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
        voice: 'voice-recovered-ja',
        voiceName: 'Recovered Japanese voice',
      }))
    })
    expect(promptTemplateService.getPromptTemplates).toHaveBeenCalledTimes(1)
    expect(fetchBackgroundMusicOptions).toHaveBeenCalledTimes(1)

    await user.click(screen.getAllByRole('combobox')[1])
    expect(await screen.findByText('Recovered Chinese voice')).toBeInTheDocument()
    expect(screen.getByText('Recovered English voice')).toBeInTheDocument()
    expect(screen.getByText('Recovered Japanese voice')).toBeInTheDocument()
  })

  it('hydrates a remote-only legacy background music label without changing saved narration or voice', async () => {
    vi.mocked(fetchBackgroundMusicOptions).mockResolvedValueOnce([
      {
        id: 901,
        label: 'Remote-only legacy track',
        fileName: 'remote-only-legacy-track.mp3',
        url: 'https://example.test/remote-only-legacy-track.mp3',
      },
    ])
    const { onChange } = renderFields({
      narrationStyleId: 'saved-style',
      narrationStyleTitle: 'Saved style title',
      voice: 'saved-voice',
      backgroundMusic: 'Remote-only legacy track',
      backgroundMusicId: null,
      backgroundMusicUrl: null,
    })

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        narrationStyleId: 'saved-style',
        narrationStyleTitle: 'Saved style title',
        voice: 'saved-voice',
        voiceName: null,
        backgroundMusic: 'Remote-only legacy track',
        backgroundMusicId: 901,
        backgroundMusicUrl: 'https://example.test/remote-only-legacy-track.mp3',
      })
    })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('loads complete remote choices, excludes non-narration templates, and becomes valid after selecting style and voice', async () => {
    const { onChange, onValidityChange, setValue } = renderControlledFields()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(promptTemplateService.getPromptTemplates).toHaveBeenCalledWith({
        type: 'video_analysis',
        templateType: 'fast',
      })
      expect(onValidityChange).toHaveBeenLastCalledWith(false)
    })

    await user.click(screen.getAllByRole('combobox')[0])
    expect(await screen.findByText('短剧漫剧')).toBeInTheDocument()
    expect(screen.queryByText('参考文案')).not.toBeInTheDocument()
    await user.click(screen.getByText('短剧漫剧'))

    await user.click(screen.getAllByRole('combobox')[1])
    expect(await screen.findByText('English voice')).toBeInTheDocument()
    expect(screen.getByText('高级')).toBeInTheDocument()
    expect(screen.getByText('英文')).toBeInTheDocument()
    expect(document.querySelectorAll('button[aria-label="播放预览"]')).toHaveLength(2)

    await user.click(screen.getByText('English voice'))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      narrationStyleId: 'short_story_comic',
      voice: 'voice-en',
      voiceName: 'English voice',
    }))
    await waitFor(() => {
      expect(onValidityChange).toHaveBeenLastCalledWith(true)
    })

    setValue({
      narrationStyleId: 'short_story_comic',
      narrationStyleTitle: '短剧漫剧',
      voice: null,
      voiceName: null,
      backgroundMusic: 'none',
      backgroundMusicId: null,
      backgroundMusicUrl: null,
    })
    await waitFor(() => {
      expect(onValidityChange).toHaveBeenLastCalledWith(false)
    })

    await user.click(screen.getAllByRole('combobox')[2])
    expect(await screen.findByText('Remote track one')).toBeInTheDocument()
    expect(screen.getByText('Remote track two')).toBeInTheDocument()
    expect(screen.getByText('无背景音乐')).toBeInTheDocument()
  })

  it('does not select a voice when its preview is clicked', async () => {
    const { onChange } = renderFields()
    const user = userEvent.setup()

    await user.click(screen.getAllByRole('combobox')[1])
    const previewButton = document.querySelector<HTMLButtonElement>('button[aria-label="播放预览"]')
    expect(previewButton).not.toBeNull()
    await user.click(previewButton!)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('stops the first voice preview when a second preview starts', async () => {
    const user = userEvent.setup()
    renderFields()

    await user.click(screen.getAllByRole('combobox')[1])
    const previewButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button[aria-label="播放预览"]'),
    )
    expect(previewButtons).toHaveLength(2)

    await user.click(previewButtons[0])
    const firstAudio = AudioMock.instances.find(instance => instance.src.endsWith('voice-zh.mp3'))
    await user.click(previewButtons[1])
    const secondAudio = AudioMock.instances.find(instance => instance.src.endsWith('voice-en.mp3'))

    expect(firstAudio?.pause).toHaveBeenCalledTimes(1)
    expect(secondAudio?.play).toHaveBeenCalledTimes(1)
  })

  it('keeps voice preview groups isolated across mounted field instances', async () => {
    const user = userEvent.setup()
    render(
      <MantineProvider>
        <MemoryRouter>
          <I18nProvider initialLocale="zh-CN">
            <FrameWorkflowOptionFields value={initialValue} onChange={vi.fn()} />
            <FrameWorkflowOptionFields value={initialValue} onChange={vi.fn()} />
          </I18nProvider>
        </MemoryRouter>
      </MantineProvider>,
    )
    const voiceSelects = screen.getAllByRole('combobox', { name: '配音音色' })
    await waitFor(() => {
      expect(voiceSelects[0]).toBeEnabled()
      expect(voiceSelects[1]).toBeEnabled()
    })
    const getPreviewButtonsForSelect = (select: HTMLElement) => {
      const options = Array.from(document.querySelectorAll<HTMLElement>('[aria-labelledby]')).find(
        element => element.getAttribute('aria-labelledby') === `${select.id}-label`,
      )
      return Array.from(
        options?.querySelectorAll<HTMLButtonElement>('button[aria-label="播放预览"]') ?? [],
      )
    }

    await user.click(voiceSelects[0])
    const firstInstanceButtons = await waitFor(() => {
      const candidates = getPreviewButtonsForSelect(voiceSelects[0])
      expect(candidates.length).toBeGreaterThan(0)
      return candidates
    })
    await user.click(firstInstanceButtons[0])
    const firstAudio = AudioMock.instances.find(instance => instance.src.endsWith('voice-zh.mp3'))
    expect(firstAudio).toBeDefined()
    const pauseCountBeforeSecondPreview = firstAudio?.pause.mock.calls.length ?? 0
    const playCountBeforeSecondPreview = AudioMock.instances.reduce(
      (total, instance) => total + instance.play.mock.calls.length,
      0,
    )

    fireEvent.keyDown(voiceSelects[1], { key: 'ArrowDown' })
    const secondInstanceButtons = await waitFor(() => {
      const candidates = getPreviewButtonsForSelect(voiceSelects[1])
      expect(candidates.length).toBeGreaterThan(0)
      return candidates
    })
    fireEvent.click(secondInstanceButtons[0])

    await waitFor(() => {
      expect(firstAudio?.pause).toHaveBeenCalledTimes(pauseCountBeforeSecondPreview)
      expect(
        AudioMock.instances.reduce(
          (total, instance) => total + instance.play.mock.calls.length,
          0,
        ),
      ).toBe(playCountBeforeSecondPreview + 1)
    })
  })

  it('plays and pauses the current BGM preview', async () => {
    const user = userEvent.setup()
    renderFields()

    await user.click(screen.getAllByRole('combobox')[2])
    const [previewButton] = getBgmPreviewButtons()
    await user.click(previewButton)

    const audio = AudioMock.instances.find(instance => instance.src.endsWith('remote-track-one.mp3'))
    expect(audio?.play).toHaveBeenCalledTimes(1)
    await user.click(previewButton)
    expect(audio?.pause).toHaveBeenCalledTimes(1)
    expect(AudioMock.instances.filter(instance => instance.src.endsWith('remote-track-one.mp3'))).toHaveLength(1)
  })

  it('replaces a BGM preview by pausing the previous audio', async () => {
    const user = userEvent.setup()
    renderFields()

    await user.click(screen.getAllByRole('combobox')[2])
    const [firstPreviewButton, secondPreviewButton] = getBgmPreviewButtons()
    await user.click(firstPreviewButton)
    const firstAudio = AudioMock.instances.find(instance => instance.src.endsWith('remote-track-one.mp3'))

    await user.click(secondPreviewButton)
    const secondAudio = AudioMock.instances.find(instance => instance.src.endsWith('remote-track-two.mp3'))
    expect(firstAudio?.pause).toHaveBeenCalledTimes(1)
    expect(secondAudio?.play).toHaveBeenCalledTimes(1)
  })

  it('shows BGM playback errors and retries the failed item', async () => {
    const user = userEvent.setup()
    renderFields()

    await user.click(screen.getAllByRole('combobox')[2])
    const [previewButton] = getBgmPreviewButtons()
    await user.click(previewButton)
    const audio = AudioMock.instances.find(instance => instance.src.endsWith('remote-track-one.mp3'))
    act(() => {
      audio?.emit('error')
    })

    expect(await screen.findByText('Remote track one: 背景音乐播放失败')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试背景音乐预览：Remote track one' }))

    const attempts = AudioMock.instances.filter(instance => instance.src.endsWith('remote-track-one.mp3'))
    expect(attempts).toHaveLength(2)
    expect(attempts[1].play).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.queryByText('Remote track one: 背景音乐播放失败')).not.toBeInTheDocument()
    })
  })

  it('uses the localized BGM label in playback errors and retry actions', async () => {
    vi.mocked(fetchBackgroundMusicOptions).mockResolvedValueOnce([
      {
        id: 21,
        label: '悬疑',
        label_i18n: { en: 'Suspense track' },
        fileName: 'suspense.mp3',
        url: 'https://example.test/suspense.mp3',
      },
    ])
    const user = userEvent.setup()
    renderFields({}, { locale: 'en' })

    await user.click(await screen.findByRole('combobox', { name: 'Background music (optional)' }))
    const previewButton = document.querySelector<HTMLButtonElement>(
      'button[aria-label="试听背景音乐"], button[aria-label="Preview background music"]',
    )
    expect(previewButton).not.toBeNull()
    await user.click(previewButton!)
    const audio = AudioMock.instances.find(instance => instance.src.endsWith('suspense.mp3'))
    act(() => audio?.emit('error'))

    expect(await screen.findByText('Suspense track: Background music playback failed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry background music preview：Suspense track' })).toBeInTheDocument()
    expect(screen.queryByText('悬疑: Background music playback failed')).not.toBeInTheDocument()
  })

  it('clears a stale BGM preview error when another preview starts', async () => {
    const user = userEvent.setup()
    renderFields()

    await user.click(screen.getAllByRole('combobox')[2])
    const [firstPreviewButton, secondPreviewButton] = getBgmPreviewButtons()
    await user.click(firstPreviewButton)
    const firstAudio = AudioMock.instances.find(instance => instance.src.endsWith('remote-track-one.mp3'))
    act(() => {
      firstAudio?.emit('error')
    })
    expect(await screen.findByText('Remote track one: 背景音乐播放失败')).toBeInTheDocument()

    await user.click(secondPreviewButton)

    expect(screen.queryByText('Remote track one: 背景音乐播放失败')).not.toBeInTheDocument()
    const secondAudio = AudioMock.instances.find(instance => instance.src.endsWith('remote-track-two.mp3'))
    expect(secondAudio?.play).toHaveBeenCalledTimes(1)
  })

  it('pauses active BGM preview on unmount', async () => {
    const user = userEvent.setup()
    const { unmount } = renderFields()

    await user.click(screen.getAllByRole('combobox')[2])
    await user.click(getBgmPreviewButtons()[0])
    const audio = AudioMock.instances.find(instance => instance.src.endsWith('remote-track-one.mp3'))
    unmount()
    expect(audio?.pause).toHaveBeenCalledTimes(1)
  })

  it('keeps failed BGM loads empty and retries them on request', async () => {
    vi.mocked(fetchBackgroundMusicOptions)
      .mockRejectedValueOnce(new Error('BGM unavailable'))
      .mockResolvedValueOnce([
        {
          id: 11,
          label: 'Recovered track',
          fileName: 'recovered-track.mp3',
          url: 'https://example.test/recovered-track.mp3',
        },
      ])
    const user = userEvent.setup()

    renderFields()

    expect(await screen.findByText('背景音乐加载失败，请重试。')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试背景音乐' }))

    await waitFor(() => {
      expect(fetchBackgroundMusicOptions).toHaveBeenCalledTimes(2)
    })
    await user.click(screen.getAllByRole('combobox')[2])
    expect(await screen.findByText('Recovered track')).toBeInTheDocument()
  })
})
