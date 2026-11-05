import { MantineProvider } from '@mantine/core'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/shared/i18n/I18nProvider'
import { createVoicePreviewGroup, VoicePreviewPlayer } from './VoicePreviewPlayer'

class AudioMock {
  static instances: AudioMock[] = []

  src = ''
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
  private listeners = new Map<string, Set<EventListener>>()
  private listenerHistory = new Map<string, Set<EventListener>>()

  constructor() {
    AudioMock.instances.push(this)
  }

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
    const history = this.listenerHistory.get(type) ?? new Set<EventListener>()
    history.add(listener)
    this.listenerHistory.set(type, history)
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener)
  }

  emitStale(type: string) {
    this.listenerHistory.get(type)?.forEach(listener => listener(new Event(type)))
  }
}

const renderPlayer = (locale: 'zh-CN' | 'en' = 'zh-CN') => render(
  <MantineProvider>
    <MemoryRouter>
      <I18nProvider initialLocale={locale}>
        <VoicePreviewPlayer audioUrl="https://example.test/voice.mp3" />
      </I18nProvider>
    </MemoryRouter>
  </MantineProvider>,
)

describe('VoicePreviewPlayer', () => {
  beforeEach(() => {
    localStorage.clear()
    AudioMock.instances = []
    vi.stubGlobal('Audio', AudioMock)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('localizes preview controls through the active locale', () => {
    renderPlayer('en')

    expect(screen.getByRole('button', { name: 'Play preview' })).toBeInTheDocument()
  })

  it('shows a playback error and retries from the same control', async () => {
    const user = userEvent.setup()
    renderPlayer('en')
    const firstAttempt = AudioMock.instances[0]
    firstAttempt.play.mockRejectedValueOnce(new Error('Playback blocked'))

    await user.click(screen.getByRole('button', { name: 'Play preview' }))

    expect(await screen.findByText('Audio playback failed')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Retry preview playback' }))

    expect(firstAttempt.play).toHaveBeenCalledTimes(1)
    const retryAttempt = AudioMock.instances.at(-1)
    expect(retryAttempt).not.toBe(firstAttempt)
    expect(retryAttempt?.play).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.queryByText('Audio playback failed')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Pause preview' })).toBeInTheDocument()
    })
  })

  it('ignores delayed media errors from a voice superseded by its group', async () => {
    const user = userEvent.setup()
    const previewGroup = createVoicePreviewGroup()
    render(
      <MantineProvider>
        <MemoryRouter>
          <I18nProvider initialLocale="zh-CN">
            <VoicePreviewPlayer audioUrl="https://example.test/voice-a.mp3" previewGroup={previewGroup} />
            <VoicePreviewPlayer audioUrl="https://example.test/voice-b.mp3" previewGroup={previewGroup} />
          </I18nProvider>
        </MemoryRouter>
      </MantineProvider>,
    )
    const [firstButton, secondButton] = screen.getAllByRole('button', { name: '播放预览' })
    const [firstAudio] = AudioMock.instances

    await user.click(firstButton)
    await user.click(secondButton)
    act(() => firstAudio.emitStale('error'))

    expect(screen.queryByText('音频加载失败')).not.toBeInTheDocument()
    expect(secondButton).toHaveAccessibleName('暂停预览')
  })
})
