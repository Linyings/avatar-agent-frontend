import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  authenticatedFetch: vi.fn(),
  uploadAudioFile: vi.fn(),
}))

vi.mock('@/features/auth/services/authService', () => ({
  authenticatedFetch: mocks.authenticatedFetch,
}))

vi.mock('@/shared/services/dashscopeTempFileService', () => ({
  dashscopeTempFileService: {
    uploadAudioFile: mocks.uploadAudioFile,
  },
}))

import { aiToolsService } from './aiToolsService'

const streamFromSSE = (frames: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      frames.forEach((frame) => controller.enqueue(encoder.encode(frame)))
      controller.close()
    },
  })
}

const workflowIdentity = {
  workflowRunId: '11111111-1111-4111-8111-111111111111',
  workflowStepId: 'transcribe-subtitles',
  workflowInputHash: 'a'.repeat(64),
  clientInstanceId: 'web.test-client',
}

const workflowIdentityPayload = {
  workflow_run_id: workflowIdentity.workflowRunId,
  workflow_step_id: workflowIdentity.workflowStepId,
  workflow_input_hash: workflowIdentity.workflowInputHash,
  client_instance_id: workflowIdentity.clientInstanceId,
}

describe('AiToolsService auth headers', () => {
  beforeEach(() => {
    mocks.getAccessToken.mockReset()
    mocks.authenticatedFetch.mockReset()
    mocks.uploadAudioFile.mockReset()
    mocks.authenticatedFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = String(mocks.getAccessToken() ?? '').replace(/^Bearer\s+/i, '').trim()
      if (!token) throw new Error('缺少访问令牌，请先登录')
      const headers = {
        ...(init?.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${token}`,
      }
      return fetch(input, { ...init, headers })
    })
    vi.stubGlobal('fetch', vi.fn())
  })

  it('analyzeNarrativeContext 缺少 access token 时不会请求后端', async () => {
    mocks.getAccessToken.mockReturnValue(null)

    await expect(
      aiToolsService.analyzeNarrativeContext({ transcript: '测试剧情' })
    ).rejects.toThrow('缺少访问令牌，请先登录')

    expect(fetch).not.toHaveBeenCalled()
  })

  it('analyzeNarrativeContext 会通过流式接口发送规范化后的 Bearer token', async () => {
    mocks.getAccessToken.mockReturnValue('Bearer access-token')
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: streamFromSSE([
        'event: answer_delta\ndata: {"delta":"{}"}\n\n',
        'event: completed\ndata: {"success":true,"provider":"openai","model":"model-a","content":"{}","analysis":{},"characters":[],"relationships":[],"emotion_curve":[],"events":[],"usage":{},"request_id":"request-1","tokens_consumed":0,"updated_at":"2026-05-07T00:00:00Z"}\n\n',
      ]),
    } as Response)

    await expect(aiToolsService.analyzeNarrativeContext({ transcript: '测试剧情' })).resolves.toMatchObject({
      request_id: 'request-1',
    })

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/tools/frame-workflow/narrative-analyze'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'text/event-stream',
          Authorization: 'Bearer access-token',
        }),
      })
    )
  })

  it('validateSubtitlesStream 会解析字幕校对流式 completed payload', async () => {
    mocks.getAccessToken.mockReturnValue('Bearer access-token')
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: streamFromSSE([
        'event: answer_delta\ndata: {"delta":"{\\"segments\\":["}\n\n',
        'event: completed\ndata: {"success":true,"provider":"openai","model":"flash-test","content":"{}","analysis":{"corrections_count":1},"segments":[{"id":"1","start":0,"end":1,"text":"修正字幕","speaker_id":"speaker_0"}],"usage":{"total_tokens":12},"request_id":"request-2","tokens_consumed":12,"updated_at":"2026-05-12T00:00:00Z"}\n\n',
      ]),
    } as Response)

    const onEvent = vi.fn()
    await expect(aiToolsService.validateSubtitlesStream({
      segments: [{ id: '1', start: 0, end: 1, text: '错字幕', speaker_id: 'speaker_1' }],
      projectId: 'project-1',
    }, { onEvent })).resolves.toMatchObject({
      model: 'flash-test',
      validation: {
        status: 'completed',
        corrections_count: 1,
        tokens_consumed: 12,
      },
      segments: [{ id: '1', text: '修正字幕', speaker_id: 'speaker_0' }],
    })

    expect(onEvent).toHaveBeenCalledWith({ type: 'answer_delta', delta: '{"segments":[' })
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/tools/frame-workflow/subtitles/validate'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'text/event-stream',
          Authorization: 'Bearer access-token',
        }),
      })
    )
  })

  it('validateSubtitlesStream 会将只读邻接上下文单独发送', async () => {
    mocks.getAccessToken.mockReturnValue('access-token')
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: streamFromSSE([
        'event: completed\ndata: {"success":true,"provider":"openai","model":"flash-test","content":"{}","segments":[{"id":"2","start":1,"end":2,"text":"目标"}],"usage":{"total_tokens":1},"request_id":"request-context","tokens_consumed":1}\n\n',
      ]),
    } as Response)

    await aiToolsService.validateSubtitlesStream({
      segments: [{ id: '2', start: 1, end: 2, text: '目标' }],
      contextSegments: [{ id: '1', start: 0, end: 1, text: '前文' }],
    })

    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(init.body))).toMatchObject({
      segments: [{ id: '2', text: '目标' }],
      context_segments: [{ id: '1', text: '前文' }],
    })
  })

  it('transcribeWithElevenLabs 会提交异步任务并轮询结果', async () => {
    const onPolling = vi.fn()
    mocks.authenticatedFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        status: 'processing',
        transcription_id: 'transcript-1',
        poll_interval_seconds: 3,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        status: 'processing',
        transcription_id: 'transcript-1',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        provider: 'elevenlabs',
        model: 'scribe_v2',
        status: 'completed',
        transcription_id: 'transcript-1',
        raw_result: {},
        packed_transcript: '[0.00-1.00] Hello',
        phrases: [{ text: 'Hello', start: 0, end: 1 }],
        words: [{ text: 'Hello', start: 0, end: 1, type: 'word' }],
        audio_events: [],
        text_content: 'Hello',
        language_code: 'en',
        duration: 1,
        tokens_consumed: 15,
        updated_at: '2026-05-12T00:00:00Z',
      }), { status: 200 }))

    const result = await aiToolsService.transcribeWithElevenLabs(
      new File(['audio'], 'take.mp3', { type: 'audio/mpeg' }),
      'en',
      { projectId: 'project-1', pollIntervalMs: 1, onPolling }
    )

    expect(result.packed_transcript).toBe('[0.00-1.00] Hello')
    expect(onPolling).toHaveBeenCalledTimes(2)
    expect(mocks.authenticatedFetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/api/v1/tools/elevenlabs/scribe/transcribe/transcript-1?project_id=project-1'),
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('transcribeWithFunASR 会上传临时音频、提交任务并适配为通用转录结果', async () => {
    const onPolling = vi.fn()
    mocks.uploadAudioFile.mockResolvedValue({
      objectKey: 'dashscope/tmp/audio.mp3',
      ossUrl: 'oss://dashscope/tmp/audio.mp3',
    })
    mocks.authenticatedFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        status: 'PENDING',
        task_id: 'task-1',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        status: 'RUNNING',
        task_id: 'task-1',
        progress: 50,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        status: 'SUCCEEDED',
        task_id: 'task-1',
        content: {
          '1': { start_time: 0, end_time: 1.2, subtitle: '你好世界。', speaker_id: 'speaker_0', confidence: 0.98 },
          '2': { start_time: 1.5, end_time: 2.5, subtitle: '第二句。', speaker_id: 'speaker_1' },
        },
        text_content: '你好世界。第二句。',
        language: 'zh',
        duration: 2.5,
        tokens_consumed: 38,
        raw_result: { transcripts: [] },
        updated_at: '2026-05-12T00:00:00Z',
      }), { status: 200 }))

    const file = new File(['audio'], 'take.mp3', { type: 'audio/mpeg' })
    const result = await aiToolsService.transcribeWithFunASR(file, 'zh-CN', {
      projectId: 'project-1',
      pollIntervalMs: 1,
      onPolling,
    })

    expect(mocks.uploadAudioFile).toHaveBeenCalledWith(file, 'funasr', undefined, undefined, undefined)
    expect(mocks.authenticatedFetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/api/v1/tools/funasr/asr/submit'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          file_url: 'oss://dashscope/tmp/audio.mp3',
          channel_id: [0],
          diarization_enabled: true,
          project_id: 'project-1',
        }),
      })
    )
    expect(mocks.authenticatedFetch).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('/api/v1/tools/funasr/asr/query/task-1?project_id=project-1'),
      expect.objectContaining({ method: 'GET' })
    )
    expect(onPolling).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      provider: 'funasr',
      model: 'fun-asr',
      transcription_id: 'task-1',
      text_content: '你好世界。第二句。',
      language_code: 'zh',
      duration: 2.5,
      tokens_consumed: 38,
    })
    expect(result.phrases).toEqual([
      { text: '你好世界。', start: 0, end: 1.2, confidence: 0.98, speaker_id: 'speaker_0' },
      { text: '第二句。', start: 1.5, end: 2.5, confidence: 0.95, speaker_id: 'speaker_1' },
    ])
    expect(result.words).toEqual([
      { text: '你好世界。', start: 0, end: 1.2, type: 'word', confidence: 0.98, speaker_id: 'speaker_0' },
      { text: '第二句。', start: 1.5, end: 2.5, type: 'word', confidence: 0.95, speaker_id: 'speaker_1' },
    ])
    expect(result.packed_transcript).toContain('[000.00-001.20] S0 你好世界。')
  })

  it('transcribeWithFunASR 会在上传凭证、提交和每次查询中保留同一工作流身份与任务 ID', async () => {
    mocks.uploadAudioFile.mockResolvedValue({
      objectKey: 'dashscope/tmp/audio.mp3',
      ossUrl: 'oss://dashscope/tmp/audio.mp3',
    })
    mocks.authenticatedFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        status: 'PENDING',
        task_id: 'task-stable-1',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        status: 'RUNNING',
        task_id: 'task-stable-1',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        status: 'SUCCEEDED',
        task_id: 'task-stable-1',
        content: {},
      }), { status: 200 }))

    await aiToolsService.transcribeWithFunASR(
      new File(['audio'], 'take.mp3', { type: 'audio/mpeg' }),
      'zh-CN',
      { projectId: 'project-1', pollIntervalMs: 1, workflowIdentity },
    )

    expect(mocks.uploadAudioFile).toHaveBeenCalledWith(
      expect.any(File),
      'funasr',
      undefined,
      undefined,
      undefined,
      workflowIdentity,
    )
    expect(JSON.parse(String(mocks.authenticatedFetch.mock.calls[0][1]?.body))).toMatchObject({
      ...workflowIdentityPayload,
      file_url: 'oss://dashscope/tmp/audio.mp3',
    })
    for (const call of mocks.authenticatedFetch.mock.calls.slice(1)) {
      const queryUrl = new URL(String(call[0]), 'http://localhost')
      expect(queryUrl.pathname).toContain('/funasr/asr/query/task-stable-1')
      expect(Object.fromEntries(queryUrl.searchParams.entries())).toMatchObject({
        project_id: 'project-1',
        ...workflowIdentityPayload,
      })
    }
  })

  it('adds workflow identity to subtitle validation stream JSON when supplied', async () => {
    mocks.authenticatedFetch.mockResolvedValue(new Response(streamFromSSE([
      'event: completed\ndata: {"success":true,"analysis":{},"segments":[],"usage":{}}\n\n',
    ]), { status: 200 }))

    await aiToolsService.validateSubtitlesStream(
      { segments: [{ id: '1', start: 0, end: 1, text: 'subtitle' }] },
      { workflowIdentity },
    )

    expect(JSON.parse(String(mocks.authenticatedFetch.mock.calls[0][1]?.body))).toMatchObject(workflowIdentityPayload)
  })

  it('adds workflow identity to timeline decide and analyze stream JSON when supplied', async () => {
    mocks.authenticatedFetch
      .mockResolvedValueOnce(new Response(streamFromSSE([
        'event: completed\ndata: {"success":true,"analysis":{},"decisions":[],"usage":{}}\n\n',
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(streamFromSSE([
        'event: completed\ndata: {"success":true,"timeline_image_url":"oss://timeline.png","range":{"start":0,"end":1,"duration":1},"n_frames":1,"analysis":{},"usage":{}}\n\n',
      ]), { status: 200 }))

    await aiToolsService.decideTimelineViewStream({}, { workflowIdentity })
    await aiToolsService.analyzeTimelineViewImage({ imageOssUrl: 'oss://timeline.png' }, { workflowIdentity })

    expect(JSON.parse(String(mocks.authenticatedFetch.mock.calls[0][1]?.body))).toMatchObject(workflowIdentityPayload)
    expect(JSON.parse(String(mocks.authenticatedFetch.mock.calls[1][1]?.body))).toMatchObject(workflowIdentityPayload)
  })

  it('returns on completed even when the SSE connection stays open', async () => {
    const encoder = new TextEncoder()
    mocks.authenticatedFetch.mockResolvedValue(new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(
          'event: completed\ndata: {"success":true,"analysis":{},"characters":[],"relationships":[],"emotion_curve":[],"events":[],"usage":{},"request_id":"request-open"}\n\n'
        ))
      },
    }), { status: 200 }))

    const result = await Promise.race([
      aiToolsService.analyzeNarrativeContext({ transcript: 'story' }, { workflowIdentity }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('stream did not finish')), 100)),
    ])

    expect(result).toMatchObject({ request_id: 'request-open' })
  })

  it('adds workflow identity to narrative analysis JSON when supplied', async () => {
    mocks.authenticatedFetch.mockResolvedValue(new Response(streamFromSSE([
      'event: completed\ndata: {"success":true,"analysis":{},"characters":[],"relationships":[],"emotion_curve":[],"events":[],"usage":{}}\n\n',
    ]), { status: 200 }))

    await aiToolsService.analyzeNarrativeContext({ transcript: 'story' }, { workflowIdentity })

    expect(JSON.parse(String(mocks.authenticatedFetch.mock.calls[0][1]?.body))).toMatchObject(workflowIdentityPayload)
  })
})
