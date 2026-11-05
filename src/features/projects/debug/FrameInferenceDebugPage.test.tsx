import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectService from '../services/projectService'
import FrameInferenceDebugPage from './FrameInferenceDebugPage'
import { fetchBackgroundMusicOptions } from '@/features/projects/services/backgroundMusicService'
import { applyFrameWorkflowRunToProject, deleteFrameWorkflowProjectFields, runFrameWorkflow } from '@/features/projects/workflow/frame'
import { I18nProvider } from '@/shared/i18n/I18nProvider'

const { readyRun } = vi.hoisted(() => ({
  readyRun: {
  id: 'run-ready',
  projectId: 'project-1',
  mode: 'dry-run' as const,
  status: 'success' as const,
  createdAt: '2026-05-04T00:00:00.000Z',
  updatedAt: '2026-05-04T00:00:00.000Z',
  records: {
    'generate-voiceover': {
      id: 'generate-voiceover' as const,
      status: 'success' as const,
      output: {
        voiceoverResult: {
          items: [{ _id: 1, text: '测试解说', start: 0, end: 1, org: '', local_audio_key: 'project:1:narration:1', audio_storage: 'local' }],
          audioStates: { 1: { success: true, audioUrl: 'blob:test' } },
          voiceUri: 'voice://test',
          generatedCount: 1,
        },
        pipelineResult: {
          subtitlePayload: {},
          videoContext: { items: {}, total_segments: 0, subtitle_segments: 0, visual_segments: 0, merged_at: 1 },
          voiceoverResult: {
            items: [{ _id: 1, text: '测试解说', start: 0, end: 1, org: '', local_audio_key: 'project:1:narration:1', audio_storage: 'local' }],
            audioStates: { 1: { success: true, audioUrl: 'blob:test' } },
            voiceUri: 'voice://test',
            generatedCount: 1,
          },
        },
      },
      outputSummary: {
        generated: 1,
      },
    },
  },
  },
}))

const { staleSuccessRun } = vi.hoisted(() => ({
  staleSuccessRun: {
    id: 'run-stale',
    projectId: 'project-1',
    mode: 'dry-run' as const,
    status: 'success' as const,
    createdAt: '2026-05-04T00:00:00.000Z',
    updatedAt: '2026-05-04T00:00:00.000Z',
    records: {
      transcribe: {
        id: 'transcribe' as const,
        logs: ['执行成功：已生成 转录字幕 的输出摘要。'],
      },
    },
  },
}))

vi.mock('../services/projectService', () => ({
  default: {
    getProject: vi.fn().mockResolvedValue({
      id: 'project-1',
      owner_id: 'owner-1',
      name: '调试项目',
      is_public: false,
      tags: [],
      status: 'draft',
      created_at: '2026-05-04T00:00:00.000Z',
      updated_at: '2026-05-04T00:00:00.000Z',
      metadata: {},
      artifacts: {},
      workflow: { mode: 'frame', status: 'draft', current_step: 'step_0_created', current_step_id: null, current_step_index: 0, revision: 1, steps: {}, stages: {} },
    }),
  },
}))

vi.mock('@/shared/services/promptTemplateService', () => ({
  promptTemplateService: {
    getPromptTemplates: vi.fn().mockResolvedValue([
      {
        id: '电影电视剧',
        title: '电影电视剧',
        version: '1.0.0',
        type: 'fast',
        description: '电影电视剧风格',
      },
      {
        id: '短剧漫剧',
        title: '短剧漫剧',
        version: '1.0.0',
        type: 'fast',
        description: '短剧漫剧风格',
      },
    ]),
  },
}))

vi.mock('@/shared/services/ttsServiceLoader', () => ({
  loadTTSService: vi.fn().mockResolvedValue({
    fetchBuiltInVoices: vi.fn().mockResolvedValue([
      {
        uri: 'voice://test',
        name: '测试音色',
        type: 'basic',
        sample_url: 'https://example.com/sample.mp3',
      },
    ]),
  }),
}))

vi.mock('@/features/projects/services/backgroundMusicService', () => ({
  fetchBackgroundMusicOptions: vi.fn(),
}))

vi.mock('@/shared/services/localAudioStorageService', () => ({
  localAudioStorageService: {
    getAudioBlob: vi.fn().mockResolvedValue(new Blob(['mp3'], { type: 'audio/mpeg' })),
  },
}))

vi.mock('@/features/projects/workflow/frame', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/projects/workflow/frame')>()
  return {
    ...actual,
    runFrameWorkflow: vi.fn().mockResolvedValue({
      id: 'run-new',
      projectId: 'project-1',
      mode: 'dry-run',
      status: 'success',
      createdAt: '2026-05-04T00:00:00.000Z',
      updatedAt: '2026-05-04T00:00:01.000Z',
      records: {},
    }),
    applyFrameWorkflowRunToProject: vi.fn().mockResolvedValue({
      ...readyRun,
      applied: true,
      persistedFields: ['video_context', 'ai_analysis_script.frame_workflow', 'metadata'],
    }),
    deleteFrameWorkflowProjectFields: vi.fn().mockResolvedValue({
      deletedFields: ['metadata'],
      workflowResult: null,
      projectResult: { id: 'project-1' },
    }),
  }
})

vi.mock('@/features/projects/workflow/frame/debug', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/projects/workflow/frame/debug')>()
  return {
    ...actual,
    loadFrameDebugStorage: vi.fn((projectId: string) => {
      const raw = localStorage.getItem(`frame-debug:${projectId}:v1`)
      if (raw) return JSON.parse(raw)
      return {
        presets: [],
        runs: [readyRun],
      }
    }),
    loadFrameDebugAsset: vi.fn().mockResolvedValue(new Blob(['media-preview'], { type: 'video/mp4' })),
    loadFrameDebugTimelineImage: vi.fn().mockResolvedValue(new Blob(['timeline-image'], { type: 'image/png' })),
    persistFrameDebugRunAssets: vi.fn(async (_projectId: string, run: unknown) => run),
    saveFrameDebugRunHistory: vi.fn((_projectId: string, run: unknown) => [run]),
    saveFrameDebugPreset: vi.fn((_projectId: string, preset: { name: string }) => ({
      id: 'preset-1',
      name: preset.name,
      config: {},
      stepInputs: {},
      createdAt: '2026-05-04T00:00:00.000Z',
      updatedAt: '2026-05-04T00:00:00.000Z',
    })),
  }
})

const renderPage = () => render(
  <MantineProvider>
    <MemoryRouter initialEntries={['/projects/project-1/debug/frame-inference']}>
      <I18nProvider>
        <Routes>
          <Route path="/projects/:projectId/debug/frame-inference" element={<FrameInferenceDebugPage />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>
  </MantineProvider>
)

const renderPageWithRun = (run: unknown) => {
  localStorage.setItem('frame-debug:project-1:v1', JSON.stringify({
    presets: [],
    runs: [run],
  }))

  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={['/projects/project-1/debug/frame-inference']}>
        <I18nProvider>
          <Routes>
            <Route path="/projects/:projectId/debug/frame-inference" element={<FrameInferenceDebugPage />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    </MantineProvider>
  )
}

const renderPageWithStaleSuccess = () => renderPageWithRun(staleSuccessRun)

const renderRoutePriority = () => render(
  <MantineProvider>
    <MemoryRouter initialEntries={['/projects/project-1/debug/frame-inference']}>
      <I18nProvider>
        <Routes>
          <Route path="/projects/:projectId/debug/frame-inference" element={<FrameInferenceDebugPage />} />
          <Route path="/projects/:projectId/:stage/:step?" element={<div>ProjectDetailPage fallback</div>} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>
  </MantineProvider>
)

describe('FrameInferenceDebugPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchBackgroundMusicOptions).mockReset()
    vi.mocked(fetchBackgroundMusicOptions).mockResolvedValue([])
    localStorage.clear()
    localStorage.setItem('narratoai-locale', 'zh-CN')
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
  })

  it('渲染项目级通用模式工作台和有序步骤列表', async () => {
    renderPage()

    expect(await screen.findByText('通用模式调试台')).toBeInTheDocument()
    expect(screen.getByText('调试项目')).toBeInTheDocument()
    expect(screen.getAllByText('合并视频').length).toBeGreaterThan(0)
    expect(screen.getByText('提取音频')).toBeInTheDocument()
    expect(screen.getByText('前端如何处理输入')).toBeInTheDocument()
    expect(screen.getByText('项目字段状态')).toBeInTheDocument()
    expect(ProjectService.getProject).toHaveBeenCalledWith('project-1')
  })

  it('背景音乐加载失败时展示错误并可独立重试', async () => {
    vi.mocked(fetchBackgroundMusicOptions)
      .mockRejectedValueOnce(new Error('BGM unavailable'))
      .mockResolvedValueOnce([
        {
          id: 31,
          label: 'Recovered debug track',
          fileName: 'recovered-debug.mp3',
          url: 'https://example.test/recovered-debug.mp3',
        },
      ])
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByText('背景音乐加载失败，请重试。')).toBeInTheDocument()
    expect(screen.getByText('BGM unavailable')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试背景音乐' }))

    await waitFor(() => expect(fetchBackgroundMusicOptions).toHaveBeenCalledTimes(2))
    await user.click(screen.getByRole('combobox', { name: '背景音乐' }))
    expect(await screen.findByText('Recovered debug track')).toBeInTheDocument()
  })

  it('编辑基础文本参数时不会在状态更新期间读取失效事件对象', async () => {
    const user = userEvent.setup()
    renderPage()

    const outputLanguageInput = await screen.findByLabelText('输出语言')
    const wordCountInput = screen.getByLabelText('文案字数')

    await user.clear(outputLanguageInput)
    await user.type(outputLanguageInput, 'zh-CN')
    await user.clear(wordCountInput)
    await user.type(wordCountInput, '900')

    expect(outputLanguageInput).toHaveValue('zh-CN')
    expect(wordCountInput).toHaveValue('900')
  })

  it('逐行展示项目字段是否已经存储', async () => {
    vi.mocked(ProjectService.getProject).mockResolvedValueOnce({
      id: 'project-1',
      owner_id: 'owner-1',
      name: '调试项目',
      is_public: false,
      tags: [],
      status: 'draft',
      created_at: '2026-05-04T00:00:00.000Z',
      updated_at: '2026-05-04T00:00:00.000Z',
      metadata: {
        inference_mode: 'frame',
        frame_inference_config: { outputLanguage: 'zh' },
      },
      workflow: { mode: 'frame', status: 'draft', current_step: 'step_0_created', current_step_id: null, current_step_index: 0, revision: 1, steps: {}, stages: {} },
      artifacts: {},
    })

    renderPage()

    expect(await screen.findByText('项目字段状态')).toBeInTheDocument()
	    expect(screen.getByText('项目存储 1/8')).toBeInTheDocument()
	    expect(screen.getAllByText('项目已存储')).toHaveLength(1)
	    expect(screen.getAllByText('项目未存储')).toHaveLength(7)
	    expect(screen.getByText('video_url')).toBeInTheDocument()
	    expect(screen.getByText('生成：最终视频 URL')).toBeInTheDocument()
	    expect(screen.getByText('生成：转录字幕')).toBeInTheDocument()
    expect(screen.getByText('生成：合并视频上下文')).toBeInTheDocument()
    expect(screen.getByText('生成：合成最终视频')).toBeInTheDocument()
    expect(screen.getByText('生成：判断视觉片段')).toBeInTheDocument()
    expect(screen.getByText('生成：分析时间线图')).toBeInTheDocument()
    expect(screen.getByText('生成：剧情理解')).toBeInTheDocument()
    expect(screen.getByText('生成：应用到项目')).toBeInTheDocument()
	    expect(screen.getAllByText('写入：应用到项目')).toHaveLength(8)
  })

  it('选择后端步骤时显示能力接口路由和处理说明', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /转录字幕/i }))

    expect(screen.getByText('/api/v1/tools/funasr/asr/submit')).toBeInTheDocument()
    expect(screen.getByText('把前端提取出的 MP3 音频提交给后端转录能力，并在前端转换为项目字幕结构。')).toBeInTheDocument()
  })

  it('媒体步骤输出页会提示可预览的媒体输出', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('tab', { name: /输出与运行日志/i }))

    expect(screen.getByText(/这个步骤的输出是媒体文件/)).toBeInTheDocument()
  })

  it('刷新后合并视频步骤可从浏览器存储恢复媒体预览', async () => {
    const user = userEvent.setup()
    const mediaRun = {
      ...staleSuccessRun,
      records: {
        'merge-videos': {
          id: 'merge-videos' as const,
          status: 'success' as const,
          outputSummary: { name: 'clip.mp4', size: 2048, type: 'video/mp4' },
          output: {
            previewStorageKey: 'project-1:run-stale:merge-videos:media',
            file: {
              __kind: 'File',
              name: 'clip.mp4',
              size: 2048,
              type: 'video/mp4',
              reselectRequired: true,
            },
            video: {
              name: 'clip.mp4',
              size: 2048,
              type: 'video/mp4',
              duration: 12,
            },
          },
          logs: ['执行成功：已生成 合并视频 的输出摘要。'],
        },
      },
    }
    renderPageWithRun(mediaRun)

    await user.click(await screen.findByRole('tab', { name: /输出与运行日志/i }))

    expect(await screen.findByText('已从浏览器存储恢复')).toBeInTheDocument()
    expect(screen.getByText('合并视频预览')).toBeInTheDocument()
  })

  it('成功日志但缺少输出时不会继续显示空 JSON', async () => {
    const user = userEvent.setup()
    renderPageWithStaleSuccess()

    await user.click(await screen.findByRole('button', { name: /转录字幕/i }))
    await user.click(await screen.findByRole('tab', { name: /输出与运行日志/i }))

    expect(screen.getByText(/当前记录只有成功日志/)).toBeInTheDocument()
    expect(screen.getByText(/没有捕获到 output 或 outputSummary/)).toBeInTheDocument()
  })

  it('输出页默认展示完整输出而不是摘要', async () => {
    const user = userEvent.setup()
    const fullOutputRun = {
      ...staleSuccessRun,
      records: {
        transcribe: {
          id: 'transcribe' as const,
          status: 'success' as const,
          outputSummary: { segments: 1 },
          output: {
            transcription: {
              text_content: '完整转录文本',
              packed_transcript: 'packed',
            },
            subtitleResult: {
              segments: [{ text: '完整字幕段' }],
            },
            subtitlePayload: {
              '1': { subtitle: '完整字幕段' },
            },
            initialVideoContext: {
              items: {
                '1': { subtitle: '完整字幕段' },
              },
            },
          },
          logs: ['执行成功：已生成 转录字幕 的输出摘要。'],
        },
      },
    }
    renderPageWithRun(fullOutputRun)

    await user.click(await screen.findByRole('button', { name: /转录字幕/i }))
    await user.click(await screen.findByRole('tab', { name: /输出与运行日志/i }))

    expect(screen.getByText('完整输出 JSON')).toBeInTheDocument()
    expect(screen.getByText('后端原始转录响应 transcription')).toBeInTheDocument()
    expect(screen.getByText('字幕识别结果 subtitleResult')).toBeInTheDocument()
    expect(screen.getByText('项目字幕 payload subtitlePayload')).toBeInTheDocument()
    expect(screen.getByText('初始视频上下文 initialVideoContext')).toBeInTheDocument()
    expect(screen.getAllByText(/完整转录文本/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/完整字幕段/).length).toBeGreaterThan(0)
  })

  it('转录步骤不会把上游媒体输出误展示为完整转录输出', async () => {
    const user = userEvent.setup()
    const wrongOutputRun = {
      ...staleSuccessRun,
      records: {
        transcribe: {
          id: 'transcribe' as const,
          status: 'success' as const,
          outputSummary: { language: 'zho', segments: 73, tokens: 6289 },
          output: {
            file: { __kind: 'File', name: '短剧测试视频.mp4' },
            video: { name: '短剧测试视频.mp4', duration: 423 },
          },
          logs: ['执行成功：已生成 转录字幕 的输出摘要。'],
        },
      },
    }
    renderPageWithRun(wrongOutputRun)

    await user.click(await screen.findByRole('button', { name: /转录字幕/i }))
    await user.click(await screen.findByRole('tab', { name: /输出与运行日志/i }))

    expect(screen.getByText(/当前没有捕获到转录步骤自己的完整输出/)).toBeInTheDocument()
    expect(screen.getByText(/当前记录的 output 结构不属于“转录字幕”步骤/)).toBeInTheDocument()
    expect(screen.getByText(/captured_output_keys/)).toBeInTheDocument()
  })

  it('判断视觉片段输出页展示可读的决策含义', async () => {
    const user = userEvent.setup()
    const decisionRun = {
      ...staleSuccessRun,
      records: {
        'decide-timeline-view': {
          id: 'decide-timeline-view' as const,
          status: 'success' as const,
          outputSummary: { decisions: 1, tokens: 321 },
          output: {
            success: true,
            tokens_consumed: 321,
            strategy: {
              mode: 'chunked_frontend',
              chunk_count: 2,
              failed_count: 1,
              skipped_count: 0,
            },
            analysis: {
              summary: '发现一个候选切点需要复核。',
              needs_timeline_view: true,
              confidence: 'high',
              decisions: [
                {
                  start: 10,
                  end: 12.5,
                  priority: 'high',
                  trigger_type: 'candidate_cut',
                  reason: '这里是候选切点，需要检查画面是否跳切。',
                  expected_question: '画面衔接是否自然？',
                  n_frames: 8,
                },
              ],
              skipped: [
                { start: 1.2, end: 1.54, reason: '短停顿但不是明确候选切点。' },
              ],
              global_notes: ['优先复核候选切点。'],
            },
            decisions: [
              {
                start: 10,
                end: 12.5,
                priority: 'high',
                trigger_type: 'candidate_cut',
                reason: '这里是候选切点，需要检查画面是否跳切。',
                expected_question: '画面衔接是否自然？',
                n_frames: 8,
              },
            ],
            chunks: [
              {
                chunk_id: 'chunk-001',
                start: 0,
                end: 15,
                status: 'model_success',
                attempt_count: 1,
                candidates: [{ start: 10, end: 12.5 }],
                decisions: [{ start: 10, end: 12.5 }],
                tokens_consumed: 120,
                request_id: 'req-1',
              },
              {
                chunk_id: 'chunk-002',
                start: 15,
                end: 30,
                status: 'failed',
                attempt_count: 1,
                candidates: [{ start: 20, end: 23 }],
                decisions: [],
                error: '模型连接失败',
              },
            ],
            failed_chunks: [
              {
                chunk_id: 'chunk-002',
                start: 15,
                end: 30,
                status: 'failed',
                attempt_count: 1,
                candidates: [{ start: 20, end: 23 }],
                decisions: [],
                error: '模型连接失败',
              },
            ],
            chunk_request_ids: ['req-1'],
          },
          logs: ['执行成功：已生成 判断视觉片段 的输出摘要。'],
        },
      },
    }
    renderPageWithRun(decisionRun)

    await user.click(await screen.findByRole('button', { name: /判断视觉片段/i }))
    await user.click(await screen.findByRole('tab', { name: /输出与运行日志/i }))

    expect(screen.getByText('视觉决策解读')).toBeInTheDocument()
    expect(screen.getAllByText('关键片段 1').length).toBeGreaterThan(0)
    expect(screen.getByText('分片决策')).toBeInTheDocument()
    expect(screen.getByText('失败分片 1')).toBeInTheDocument()
    expect(screen.getByText('分片执行状态')).toBeInTheDocument()
    expect(screen.getByText('失败')).toBeInTheDocument()
    expect(screen.getByText(/不会生成本地兜底关键片段/)).toBeInTheDocument()
    expect(screen.getByText('高优先级')).toBeInTheDocument()
    expect(screen.getByText('候选切点')).toBeInTheDocument()
    expect(screen.getByText(/含义：这里是候选切点/)).toBeInTheDocument()
    expect(screen.getByText(/生成图后要回答：画面衔接是否自然/)).toBeInTheDocument()
    expect(screen.getByText('跳过片段原因')).toBeInTheDocument()
    expect(screen.getAllByText(/短停顿但不是明确候选切点/).length).toBeGreaterThan(0)
  })

  it('生成时间线图输出页展示图片预览信息和分析对象', async () => {
    const user = userEvent.setup()
    const timelineRun = {
      ...staleSuccessRun,
      records: {
        'generate-timeline-images': {
          id: 'generate-timeline-images' as const,
          status: 'success' as const,
          outputSummary: { images: [{ name: 'timeline-view-1.png', size: 2048, type: 'image/png' }] },
          output: {
            images: [
              {
                decisionIndex: 1,
                previewStorageKey: 'project-1:run-stale:timeline-image:0',
                decision: {
                  start: 10,
                  end: 12.5,
                  priority: 'high',
                  trigger_type: 'candidate_cut',
                  reason: '这里是候选切点，需要检查画面是否跳切。',
                  n_frames: 8,
                },
                nFrames: 8,
                file: {
                  __kind: 'File',
                  name: 'timeline-view-1.png',
                  size: 2048,
                  type: 'image/png',
                  reselectRequired: true,
                },
                image: {
                  name: 'timeline-view-1.png',
                  size: 2048,
                  type: 'image/png',
                },
              },
            ],
          },
          logs: ['执行成功：已生成 生成时间线图 的输出摘要。'],
        },
      },
    }
    renderPageWithRun(timelineRun)

    await user.click(await screen.findByRole('button', { name: /生成时间线图/i }))
    await user.click(await screen.findByRole('tab', { name: /输出与运行日志/i }))

    expect(screen.getByText('时间线图预览')).toBeInTheDocument()
    expect(screen.getByText('时间线图 1')).toBeInTheDocument()
    expect(screen.getByText('10.00s - 12.50s')).toBeInTheDocument()
    expect(screen.getByText('抽 8 帧')).toBeInTheDocument()
    expect(screen.getByText('timeline-view-1.png')).toBeInTheDocument()
    expect(await screen.findByAltText('时间线图 1')).toBeInTheDocument()
    expect(screen.getByText('已从浏览器存储恢复')).toBeInTheDocument()
    expect(screen.getByText(/分析对象：这里是候选切点/)).toBeInTheDocument()
  })

  it('分析时间线图输出页按图片展示视觉分析结果', async () => {
    const user = userEvent.setup()
    const analysisRun = {
      ...staleSuccessRun,
      records: {
        'analyze-timeline-images': {
          id: 'analyze-timeline-images' as const,
          status: 'success' as const,
          outputSummary: { analyses: 1, tokens: 17 },
          output: {
            analyses: [
              {
                decisionIndex: 1,
                decision: {
                  start: 10,
                  end: 12.5,
                  priority: 'high',
                  trigger_type: 'candidate_cut',
                  reason: '这里是候选切点，需要检查画面是否跳切。',
                  n_frames: 8,
                },
                image: {
                  name: 'timeline-view-1.png',
                  size: 2048,
                  objectKey: 'tmp/timeline-view-1.png',
                  ossUrl: 'oss://tmp/timeline-view-1.png',
                },
                response: {
                  success: true,
                  provider: 'dashscope',
                  model: 'qwen-vl',
                  timeline_image_url: 'oss://tmp/timeline-view-1.png',
                  timeline_image_size: 2048,
                  range: { start: 10, end: 12.5, duration: 2.5 },
                  n_frames: 8,
                  content: '第一张图显示人物从奔跑切到转头。',
                  analysis: {
                    summary: '第一张图显示人物奔跑后突然转头，动作连续性需要复核。',
                    visual_events: [
                      { timestamp: 10.4, description: '人物从画面左侧奔跑进入。' },
                      { timestamp: 12.1, description: '人物突然转头看向镜头。' },
                    ],
                    cut_safety: { status: 'needs_review', reason: '转头动作和音效节拍需要对齐。' },
                    concerns: ['表情变化较快，可能影响剪辑连续性。'],
                    recommendations: ['检查音画同步和转头动作是否卡点。'],
                  },
                  raw_result: { ok: true },
                  usage: { total_tokens: 17 },
                  request_id: 'req-1',
                  tokens_consumed: 17,
                  updated_at: '2026-05-04T12:00:00.000Z',
                },
              },
            ],
          },
          logs: ['执行成功：已生成 分析时间线图 的输出摘要。'],
        },
      },
    }
    renderPageWithRun(analysisRun)

    await user.click(await screen.findByRole('button', { name: /分析时间线图/i }))
    await user.click(await screen.findByRole('tab', { name: /输出与运行日志/i }))

    expect(screen.getByText('输出结果')).toBeInTheDocument()
    expect(screen.queryByText('完整输出 JSON')).not.toBeInTheDocument()
    expect(screen.getByText('时间线图分析结果')).toBeInTheDocument()
    expect(screen.getByText('第 1 张图')).toBeInTheDocument()
    expect(screen.getByText('画面总结')).toBeInTheDocument()
    expect(screen.getAllByText(/第一张图显示人物奔跑后突然转头/).length).toBeGreaterThan(0)
    expect(screen.getByText('逐帧/画面事件')).toBeInTheDocument()
    expect(screen.getByText(/人物从画面左侧奔跑进入/)).toBeInTheDocument()
    expect(screen.getByText(/人物突然转头看向镜头/)).toBeInTheDocument()
    expect(screen.getByText(/表情变化较快/)).toBeInTheDocument()
    expect(screen.getByText(/检查音画同步和转头动作是否卡点/)).toBeInTheDocument()
    expect(screen.getByText('切点安全判断')).toBeInTheDocument()
    expect(screen.getByText(/分析对象：这里是候选切点/)).toBeInTheDocument()
    expect(screen.getByText('接口返回明细')).toBeInTheDocument()
  })

  it('剧情理解输出页展示人物关系情绪曲线和事件抽取', async () => {
    const user = userEvent.setup()
    const narrativeRun = {
      ...staleSuccessRun,
      records: {
        'understand-narrative': {
          id: 'understand-narrative' as const,
          status: 'success' as const,
          outputSummary: { characters: 1, relationships: 1, events: 1, emotions: 1, tokens: 88 },
          output: {
            success: true,
            provider: 'openai',
            model: 'text-model',
            content: '{}',
            analysis: {
              summary: '两人因追逃发生冲突。',
              plot: {
                premise: '角色正在逃避追赶。',
                current_stage: '冲突升级。',
                stakes: '是否被追上。',
              },
              characters: [
                { id: 'speaker_0', role: '逃跑者', emotional_state: '紧张', goals: ['摆脱追赶'] },
              ],
              relationships: [
                { source: 'speaker_0', target: 'speaker_1', relationship: '对立', dynamics: '追逃压力升高', evidence: ['别过来'] },
              ],
              emotion_curve: [
                { start: 10, end: 12.5, character: 'speaker_0', emotion: '紧张', intensity: 4, reason: '被逼近' },
              ],
              events: [
                { start: 10, end: 12.5, type: 'conflict', description: '角色奔跑并回头。', participants: ['speaker_0'], importance: 'high' },
              ],
              conflicts: ['追逃'],
              themes: ['紧张反转'],
              open_questions: ['追赶者身份仍不明确'],
            },
            characters: [{ id: 'speaker_0' }],
            relationships: [{ source: 'speaker_0', target: 'speaker_1', relationship: '对立', dynamics: '追逃压力升高' }],
            emotion_curve: [{ start: 10, end: 12.5 }],
            events: [{ start: 10, end: 12.5 }],
            usage: { total_tokens: 88 },
            request_id: 'req-narrative',
            tokens_consumed: 88,
            updated_at: '2026-05-04T12:00:00.000Z',
          },
          logs: ['执行成功：已生成 剧情理解 的输出摘要。'],
        },
      },
    }
    renderPageWithRun(narrativeRun)

    await user.click(await screen.findByRole('button', { name: /剧情理解/i }))
    await user.click(await screen.findByRole('tab', { name: /输出与运行日志/i }))

    expect(screen.getByText('输出结果')).toBeInTheDocument()
    expect(screen.queryByText('完整输出 JSON')).not.toBeInTheDocument()
    expect(screen.getByText('剧情理解结果')).toBeInTheDocument()
    expect(screen.getByText(/两人因追逃发生冲突/)).toBeInTheDocument()
    expect(screen.getByText('人物理解')).toBeInTheDocument()
    expect(screen.getAllByText('speaker_0').length).toBeGreaterThan(0)
    expect(screen.getByText('人物关系')).toBeInTheDocument()
    expect(screen.getByText(/追逃压力升高/)).toBeInTheDocument()
    expect(screen.getByText('情绪曲线')).toBeInTheDocument()
    expect(screen.getByText(/紧张 · 强度 4/)).toBeInTheDocument()
    expect(screen.getByText('关键事件')).toBeInTheDocument()
    expect(screen.getByText(/角色奔跑并回头/)).toBeInTheDocument()
    expect(screen.getByText('待确认问题（QA）')).toBeInTheDocument()
    expect(screen.getByText('Q1')).toBeInTheDocument()
    expect(screen.getByText('追赶者身份仍不明确')).toBeInTheDocument()
    const answerInput = screen.getByLabelText('已确认答案 1')
    await user.type(answerInput, '追赶者是赌场老板的手下。')
    expect(answerInput).toHaveValue('追赶者是赌场老板的手下。')
  })

  it('合并视频上下文输出页展示合并覆盖和写入的 visual 内容', async () => {
    const user = userEvent.setup()
    const mergeRun = {
      ...staleSuccessRun,
      records: {
        'merge-video-context': {
          id: 'merge-video-context' as const,
          status: 'success' as const,
          outputSummary: { total_segments: 3, visual_segments: 2, total_tokens: 456 },
          output: {
            videoContext: {
              items: {
                '1': {
                  start_time: 0,
                  end_time: 4,
                  subtitle: '人物准备起跑。',
                  visual: '',
                },
                '2': {
                  start_time: 10,
                  end_time: 12.5,
                  subtitle: '别过来。',
                  visual: '第一张图显示人物奔跑后突然转头，动作连续性需要复核。',
                  speaker_id: 'speaker_0',
                },
                '3': {
                  start_time: 12.5,
                  end_time: 16,
                  subtitle: '我没事。',
                  visual: '人物转头后表情紧张，需要确认和音乐节拍是否同步。',
                  speaker_id: 'speaker_1',
                },
              },
              total_segments: 3,
              subtitle_segments: 3,
              visual_segments: 2,
              merged_at: 1777381200000,
              narrative_context: {
                summary: '两人因追逃发生冲突。',
                characters: [{ id: 'speaker_0', role: '逃跑者' }],
                events: [{ start: 10, end: 12.5, description: '角色奔跑并回头。' }],
                open_questions: [
                  { question: '追赶者身份仍不明确', answer: '追赶者是赌场老板的手下。' },
                ],
                confirmed_question_answers: [
                  { question: '追赶者身份仍不明确', answer: '追赶者是赌场老板的手下。' },
                ],
              },
            },
            pipelineResult: {
              tokens: {
                transcription: 100,
                decision: 200,
                analysis: 156,
                narrative: 50,
                total: 506,
              },
              narrativeUnderstanding: {
                analysis: {
                  summary: '两人因追逃发生冲突。',
                },
              },
              analyses: [
                {
                  decisionIndex: 1,
                  decision: {
                    start: 10,
                    end: 12.5,
                    priority: 'high',
                    trigger_type: 'candidate_cut',
                    reason: '这里是候选切点，需要检查画面是否跳切。',
                  },
                  response: {
                    content: '备用视觉摘要',
                    analysis: {
                      summary: '第一张图显示人物奔跑后突然转头，动作连续性需要复核。',
                    },
                  },
                },
              ],
            },
          },
          logs: ['执行成功：已生成 合并视频上下文 的输出摘要。'],
        },
      },
    }
    renderPageWithRun(mergeRun)

    await user.click(await screen.findByRole('button', { name: /合并视频上下文/i }))
    await user.click(await screen.findByRole('tab', { name: /输出与运行日志/i }))

    expect(screen.getByText('输出结果')).toBeInTheDocument()
    expect(screen.queryByText('完整输出 JSON')).not.toBeInTheDocument()
    expect(screen.getByText('合并结果解读')).toBeInTheDocument()
    expect(screen.getByText('已合并视觉信息')).toBeInTheDocument()
    expect(screen.getByText('2/3 段')).toBeInTheDocument()
    expect(screen.getByText('覆盖率')).toBeInTheDocument()
    expect(screen.getByText('67%')).toBeInTheDocument()
    expect(screen.getByText('已写入视觉信息的字幕段')).toBeInTheDocument()
    expect(screen.getByText('片段 2')).toBeInTheDocument()
    expect(screen.getByText('片段 3')).toBeInTheDocument()
    expect(screen.getByText('说话人 speaker_0')).toBeInTheDocument()
    expect(screen.getByText('说话人 speaker_1')).toBeInTheDocument()
    expect(screen.getByText('别过来。')).toBeInTheDocument()
    expect(screen.getAllByText(/第一张图显示人物奔跑后突然转头/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/人物转头后表情紧张/).length).toBeGreaterThan(0)
    expect(screen.getByText('参与合并的视觉分析')).toBeInTheDocument()
    expect(screen.getByText('已合入的全局剧情理解')).toBeInTheDocument()
    expect(screen.getAllByText(/两人因追逃发生冲突/).length).toBeGreaterThan(0)
    expect(screen.getByText('QA 1')).toBeInTheDocument()
    expect(screen.getByText('追赶者身份仍不明确')).toBeInTheDocument()
    expect(screen.getAllByText(/追赶者是赌场老板的手下/).length).toBeGreaterThan(0)
    expect(screen.getByText('写入项目时会使用的数据')).toBeInTheDocument()
  })

  it('debug 路由不会被项目动态 stage 路由吞掉', async () => {
    renderRoutePriority()

    expect(await screen.findByText('通用模式调试台')).toBeInTheDocument()
    expect(screen.queryByText('ProjectDetailPage fallback')).not.toBeInTheDocument()
  })

  it('输入无效 JSON 时展示错误并禁用 rerun', async () => {
    renderPage()

    const editor = await screen.findByLabelText('步骤输入 JSON')
    fireEvent.change(editor, { target: { value: '{bad json' } })

    expect(screen.getByText(/JSON 格式无效/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /仅执行当前步骤/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /从当前步骤重跑/i })).toBeDisabled()
  })

  it('仅执行当前步骤时只把当前步骤传给 runner', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('通用模式调试台')
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, new File(['video'], 'clip.mp4', { type: 'video/mp4' }))
    await user.click(await screen.findByRole('button', { name: /仅执行当前步骤/i }))

    await waitFor(() => {
      expect(runFrameWorkflow).toHaveBeenCalledWith(expect.objectContaining({
        startStepId: 'merge-videos',
        steps: [expect.objectContaining({ id: 'merge-videos' })],
      }))
    })
  })

  it('Apply to project 与 dry-run 控制分离', async () => {
    const user = userEvent.setup()
    renderPage()

    const applyButton = await screen.findByRole('button', { name: /存储已生成字段/i })
    await user.click(applyButton)

    await waitFor(() => {
      expect(applyFrameWorkflowRunToProject).toHaveBeenCalledTimes(1)
    })
    expect(runFrameWorkflow).not.toHaveBeenCalled()
  })

  it('可以从字段状态里删除单个已存储字段', async () => {
    const user = userEvent.setup()
    vi.mocked(ProjectService.getProject).mockResolvedValueOnce({
      id: 'project-1',
      owner_id: 'owner-1',
      name: '调试项目',
      is_public: false,
      tags: [],
      status: 'draft',
      created_at: '2026-05-04T00:00:00.000Z',
      updated_at: '2026-05-04T00:00:00.000Z',
      metadata: {
        inference_mode: 'frame',
        frame_inference_config: { outputLanguage: 'zh' },
      },
      workflow: { mode: 'frame', status: 'draft', current_step: 'step_0_created', current_step_id: null, current_step_index: 0, revision: 1, steps: {}, stages: {} },
      artifacts: {},
    })
    renderPage()

    await screen.findByText('项目字段状态')
    await user.click(screen.getByRole('button', { name: /删除 project_metadata.frame_inference_config/i }))

    await waitFor(() => {
      expect(deleteFrameWorkflowProjectFields).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'project-1' }),
        ['project_metadata'],
        expect.objectContaining({
          projectName: '调试项目',
          projectMetadata: expect.objectContaining({
            frame_inference_config: { outputLanguage: 'zh' },
          }),
        })
      )
    })
  })
})
