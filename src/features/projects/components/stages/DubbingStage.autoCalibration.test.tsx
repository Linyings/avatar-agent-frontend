import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppMantineProvider } from '@/shared/mantine/AppMantineProvider'
import DubbingStage from './DubbingStage'

const {
  mockGetProjectAiScript,
  mockSaveProjectScript,
  mockGenerateTTSWithVoiceUri,
  mockCheckTimestampCalibration,
  mockSaveNarrationAudio,
  mockGetAudioBlob,
} = vi.hoisted(() => ({
  mockGetProjectAiScript: vi.fn(),
  mockSaveProjectScript: vi.fn(),
  mockGenerateTTSWithVoiceUri: vi.fn(),
  mockCheckTimestampCalibration: vi.fn(),
  mockSaveNarrationAudio: vi.fn(),
  mockGetAudioBlob: vi.fn(),
}))

const mockCurrentProject = vi.hoisted(() => ({ id: 'project-1' }))

vi.mock('react-router-dom', async () => {
  const React = await import('react')

  return {
    Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) =>
      React.createElement('a', { href: to, ...props }, children),
    useNavigate: () => vi.fn(),
  }
})

vi.mock('../../contexts/ProjectContext', () => ({
  useProject: () => ({
    currentProject: mockCurrentProject,
    materialData: null,
  }),
}))

vi.mock('../../services/projectService', () => ({
  default: {
    getProjectAiScript: mockGetProjectAiScript,
    saveProjectScript: mockSaveProjectScript,
  },
}))

vi.mock('@/shared/contexts/ToastContext', () => ({
  useToast: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

vi.mock('@/shared/services/ttsServiceLoader', () => ({
  loadTTSService: () => Promise.resolve({
    generateTTSWithVoiceUri: mockGenerateTTSWithVoiceUri,
  }),
}))

vi.mock('@/shared/services/localAudioStorageService', () => ({
  localAudioStorageService: {
    saveNarrationAudio: mockSaveNarrationAudio,
    getAudioBlob: mockGetAudioBlob,
    deleteAudio: vi.fn(),
    createAudioKey: (_projectId: string, itemId: number) => `local-audio-${itemId}`,
  },
}))

vi.mock('@/shared/utils/calibrationUtils', () => ({
  DEFAULT_CALIBRATION_OPTIONS: {
    toleranceSeconds: 0.5,
    autoAdjustSubsequent: true,
  },
  checkTimestampCalibration: mockCheckTimestampCalibration,
  performTimestampCalibration: vi.fn((items) => items),
}))

vi.mock('@/shared/components/tts/VoiceSelector', async () => {
  const React = await import('react')

  return {
    VoiceSelector: ({ onChange }: { onChange: (config: { mode: 'builtin'; selectedVoiceUri: string }) => void }) => {
      React.useEffect(() => {
        onChange({ mode: 'builtin', selectedVoiceUri: 'voice-1' })
      }, [onChange])

      return React.createElement('div', null, 'mock voice selector')
    },
  }
})

vi.mock('./DubbingScriptTable', async () => {
  const React = await import('react')

  return {
    default: ({ globalOperations }: { globalOperations?: { onGenerateAll?: () => Promise<void> } }) =>
      React.createElement(
        'button',
        { type: 'button', onClick: () => globalOperations?.onGenerateAll?.() },
        'mock-generate-all'
      ),
  }
})

vi.mock('@/shared/components/ui/TimestampCalibrationDialog', async () => {
  const React = await import('react')

  return {
    default: ({ isOpen }: { isOpen: boolean }) =>
      isOpen ? React.createElement('div', { role: 'dialog' }, 'mock calibration dialog') : null,
  }
})

vi.mock('@/shared/components/video/VideoComposer', async () => {
  const React = await import('react')

  return {
    VideoComposer: () => React.createElement('div', null),
  }
})

vi.mock('@/shared/components/ui/ConfirmDialog', async () => {
  const React = await import('react')

  return {
    default: () => React.createElement('div', null),
  }
})

vi.mock('@/shared/components/ui/CapcutExportModal', async () => {
  const React = await import('react')

  return {
    default: () => React.createElement('div', null),
  }
})

describe('DubbingStage 自动校准', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    let objectUrlIndex = 0
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => `blob:local-audio-${objectUrlIndex++}`),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
    mockGetProjectAiScript.mockResolvedValue({
      items: [
        { _id: 1, text: '第一句解说', start: 0, end: 1, org: '', OST: 0 },
        { _id: 2, text: '第二句解说', start: 1, end: 2, org: '', OST: 0 },
      ],
    })
    mockGenerateTTSWithVoiceUri.mockResolvedValue({
      success: true,
      audioBlob: new Blob(['audio'], { type: 'audio/mpeg' }),
      duration: 1.8,
    })
    mockSaveNarrationAudio.mockImplementation(async ({ itemId }: { itemId: number }) => `local-audio-${itemId}`)
    mockGetAudioBlob.mockResolvedValue(null)
    mockSaveProjectScript.mockResolvedValue(undefined)
    mockCheckTimestampCalibration.mockResolvedValue({
      hasItemsToCalibrate: true,
      items: [
        {
          _id: 1,
          timestamp: '00:00:00,000-00:00:01,000',
          originalDuration: 1,
          audioDuration: 1.8,
          difference: 0.8,
          needsCalibration: true,
        },
      ],
      totalDifference: 0.8,
    })
  })

  it('批量生成完成后只消费一次自动校准触发，避免重复分析导致页面卡死', async () => {
    const user = userEvent.setup()

    render(
      <AppMantineProvider>
        <DubbingStage />
      </AppMantineProvider>
    )

    await screen.findByRole('button', { name: 'mock-generate-all' })
    await user.click(screen.getByRole('button', { name: 'mock-generate-all' }))

    await waitFor(() => {
      expect(mockCheckTimestampCalibration).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toHaveTextContent('mock calibration dialog')
    })

    await new Promise(resolve => setTimeout(resolve, 50))

    expect(mockCheckTimestampCalibration).toHaveBeenCalledTimes(1)
    expect(mockSaveNarrationAudio).toHaveBeenCalledTimes(2)
    const savedPayload = mockSaveProjectScript.mock.calls.at(-1)?.[1]
    expect(savedPayload?.items[0]).toMatchObject({
      local_audio_key: 'local-audio-1',
      audio_storage: 'local',
      duration: 1.8,
    })
    expect(savedPayload?.items[0]?.audio).toBeUndefined()
    expect(savedPayload?.items[0]?.audio_url).toBeUndefined()
  })
})
