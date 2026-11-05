import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  scriptGenerationServiceV2,
  type GenerateNarrationDraftStreamEvent,
  type GenerateScriptStreamEvent,
  type MatchNarrationVisualsStreamEvent
} from './scriptGenerationServiceV2'

const encoder = new TextEncoder()

const workflowIdentity = {
  workflowRunId: '11111111-1111-4111-8111-111111111111',
  workflowStepId: 'narration-draft',
  workflowInputHash: 'a'.repeat(64),
  clientInstanceId: 'web.test-client',
}

const workflowIdentityPayload = {
  workflow_run_id: workflowIdentity.workflowRunId,
  workflow_step_id: workflowIdentity.workflowStepId,
  workflow_input_hash: workflowIdentity.workflowInputHash,
  client_instance_id: workflowIdentity.clientInstanceId,
}

describe('generateScriptStream', () => {
  beforeEach(() => {
    localStorage.setItem('auth_access_token', 'test-token')
    localStorage.setItem('auth_refresh_token', 'refresh-token')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('可以解析 SSE 并返回最终脚本', async () => {
    const events: GenerateScriptStreamEvent[] = []

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: stage\ndata: {"stage":"script_generate","message":"正在一次性生成解说文案与匹配画面..."}\n\n'))
        controller.enqueue(encoder.encode('event: thinking_delta\ndata: {"delta":"先梳理剧情"}\n\n'))
        controller.enqueue(encoder.encode('event: answer_delta\ndata: {"delta":"{\\"items\\":["}\n\n'))
        controller.enqueue(encoder.encode('event: usage\ndata: {"prompt_tokens":18,"completion_tokens":10,"total_tokens":28}\n\n'))
        controller.enqueue(encoder.encode('event: completed\ndata: {"items":[{"id":"1","text":"片段一","start":0,"end":1.2,"org":""}],"usage":{"prompt_tokens":18,"completion_tokens":10,"total_tokens":28},"model":"生成脚本 1","request_id":"req-script-1"}\n\n'))
        controller.close()
      }
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: stream
      } as Response)
    )

    const result = await scriptGenerationServiceV2.generateScriptStream(
      {
        video_config: {
          target_language: 'zh-CN',
          audio_speed: 4.5,
          word_count: '1000-3500',
          person_view: 'third_person'
        },
        video_context: {}
      },
      {
        onEvent: (event) => events.push(event)
      }
    )

    expect(events.map(event => event.type)).toEqual([
      'stage',
      'thinking_delta',
      'answer_delta',
      'usage',
      'completed'
    ])
    expect(result.items).toHaveLength(1)
    expect(result.items[0].text).toBe('片段一')
    expect(result.usage.total_tokens).toBe(28)
  })

  it('可以解析 CRLF 分隔的 SSE 事件', async () => {
    const events: GenerateScriptStreamEvent[] = []

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: stage\r\ndata: {"stage":"script_generate","message":"正在生成完整脚本"}\r\n\r\n'))
        controller.enqueue(encoder.encode('event: answer_delta\r\ndata: {"delta":"{\\"items\\":["}\r\n\r\n'))
        controller.enqueue(encoder.encode('event: completed\r\ndata: {"items":[{"id":"1","text":"片段一","start":0,"end":1.2,"org":""}],"usage":{"prompt_tokens":18,"completion_tokens":10,"total_tokens":28},"model":"生成脚本 1","request_id":"req-script-1"}\r\n\r\n'))
        controller.close()
      }
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: stream
      } as Response)
    )

    const result = await scriptGenerationServiceV2.generateScriptStream(
      {
        video_config: {
          target_language: 'zh-CN',
          audio_speed: 4.5,
          word_count: '1000-3500',
          person_view: 'third_person'
        },
        video_context: {}
      },
      {
        onEvent: (event) => events.push(event)
      }
    )

    expect(events.map(event => event.type)).toEqual(['stage', 'answer_delta', 'completed'])
    expect(result.items[0].text).toBe('片段一')
  })

  it('大量 SSE 事件解析时会让出浏览器渲染线程', async () => {
    const requestAnimationFrameMock = vi.fn((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock)

    const chunks = Array.from({ length: 12 }, (_, index) =>
      `event: thinking_delta\ndata: {"delta":"${index}"}\n\n`
    )
    chunks.push('event: completed\ndata: {"items":[{"id":"1","text":"片段一","start":0,"end":1.2,"org":""}],"usage":{"prompt_tokens":18,"completion_tokens":10,"total_tokens":28},"model":"生成脚本 1","request_id":"req-script-1"}\n\n')

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(chunks.join('')))
        controller.close()
      }
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: stream
      } as Response)
    )

    const result = await scriptGenerationServiceV2.generateScriptStream(
      {
        video_config: {
          target_language: 'zh-CN',
          audio_speed: 4.5,
          word_count: '1000-3500',
          person_view: 'third_person'
        },
        video_context: {}
      }
    )

    expect(result.items[0].text).toBe('片段一')
    expect(requestAnimationFrameMock).toHaveBeenCalled()
  })

  it('访问令牌过期时会刷新并重试脚本流式请求', async () => {
    localStorage.setItem('auth_access_token', 'expired-token')
    localStorage.setItem('auth_refresh_token', 'refresh-token')

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: completed\ndata: {"items":[{"id":"1","text":"刷新后成功","start":0,"end":1.2,"org":""}],"usage":{"prompt_tokens":18,"completion_tokens":10,"total_tokens":28},"model":"生成脚本 1","request_id":"req-script-1"}\n\n'))
        controller.close()
      }
    })

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ error: 'Unauthorized', message: '无效的访问令牌', success: false }),
        {
          status: 401,
          statusText: 'Unauthorized',
          headers: { 'Content-Type': 'application/json' }
        }
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ access_token: 'fresh-token', refresh_token: 'refresh-token' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      ))
      .mockResolvedValueOnce(new Response(stream, { status: 200 }))

    vi.stubGlobal('fetch', fetchMock)

    const result = await scriptGenerationServiceV2.generateScriptStream({
      video_config: {
        target_language: 'zh-CN',
        audio_speed: 4.5,
        word_count: '1000-3500',
        person_view: 'third_person'
      },
      video_context: {}
    })

    expect(result.items[0].text).toBe('刷新后成功')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer expired-token'
    })
    expect(fetchMock.mock.calls[2][1]?.headers).toMatchObject({
      Authorization: 'Bearer fresh-token'
    })
  })

  it('可以调用文案草稿流式接口并只返回 _id/text 草稿项', async () => {
    const events: GenerateNarrationDraftStreamEvent[] = []
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: completed\ndata: {"items":[{"_id":"3","text":"第一段草稿"},{"_id":"4","text":"   "}],"usage":{"prompt_tokens":5,"completion_tokens":7,"total_tokens":12},"model":"draft-model","request_id":"req-draft-1"}\n\n'))
        controller.close()
      }
    })
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await scriptGenerationServiceV2.generateNarrationDraftStream(
      {
        video_config: {
          target_language: 'zh-CN',
          audio_speed: 4.5,
          word_count: '1000',
          person_view: 'third_person'
        },
        video_context: {}
      },
      { onEvent: event => events.push(event) }
    )

    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/tools/generate-narration-draft-stream')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).not.toHaveProperty('workflow_run_id')
    expect(events[0]).toMatchObject({ type: 'completed', model: 'draft-model' })
    expect(result.items).toEqual([{ _id: 3, text: '第一段草稿' }])
    expect(result.usage.total_tokens).toBe(12)
  })

  it('可以调用画面匹配流式接口并返回标准时间线脚本', async () => {
    const events: MatchNarrationVisualsStreamEvent[] = []
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: completed\ndata: {"items":[{"_id":"1","text":"第一段草稿","start":1,"end":2.5,"org":""}],"usage":{"prompt_tokens":8,"completion_tokens":13,"total_tokens":21},"model":"match-model","request_id":"req-match-1"}\n\n'))
        controller.close()
      }
    })
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await scriptGenerationServiceV2.matchNarrationVisualsStream(
      {
        video_config: {
          target_language: 'zh-CN',
          audio_speed: 4.5,
          word_count: '1000',
          person_view: 'third_person'
        },
        video_context: {},
        script_items: [{
          _id: 1,
          text: '第一段草稿',
          chapter_id: 'chapter-01',
          event_ids: ['event-001'],
          evidence_refs: ['subtitle-001'],
          source_start: 1,
          source_end: 2.5,
          priority: 'high',
        }]
      },
      { onEvent: event => events.push(event) }
    )

    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/tools/match-narration-visuals-stream')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).not.toHaveProperty('workflow_run_id')
    expect(events[0]).toMatchObject({ type: 'completed', model: 'match-model' })
    expect(result.items).toEqual([{ _id: 1, text: '第一段草稿', start: 1, end: 2.5, org: '' }])
    expect(result.usage.total_tokens).toBe(21)
  })

  it('会在解说草稿和画面匹配流式请求中发送工作流身份', async () => {
    const completedDraft = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: completed\ndata: {"items":[],"usage":{},"model":"draft","request_id":"draft-1"}\n\n'))
        controller.close()
      },
    })
    const completedMatch = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: completed\ndata: {"items":[],"usage":{},"model":"match","request_id":"match-1"}\n\n'))
        controller.close()
      },
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(completedDraft, { status: 200 }))
      .mockResolvedValueOnce(new Response(completedMatch, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await scriptGenerationServiceV2.generateNarrationDraftStream(
      {
        video_config: { target_language: 'zh-CN', audio_speed: 4.5, word_count: '1000', person_view: 'third_person' },
        video_context: {},
      },
      { workflowIdentity },
    )
    await scriptGenerationServiceV2.matchNarrationVisualsStream(
      {
        video_config: { target_language: 'zh-CN', audio_speed: 4.5, word_count: '1000', person_view: 'third_person' },
        video_context: {},
        script_items: [],
      },
      { workflowIdentity: { ...workflowIdentity, workflowStepId: 'narration-visuals' } },
    )

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject(workflowIdentityPayload)
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      ...workflowIdentityPayload,
      workflow_step_id: 'narration-visuals',
    })
  })

  it('会在普通脚本流式请求中发送工作流身份', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: completed\ndata: {"items":[],"usage":{},"model":"script","request_id":"script-1"}\n\n'))
        controller.close()
      },
    })
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await scriptGenerationServiceV2.generateScriptStream(
      {
        video_config: { target_language: 'zh-CN', audio_speed: 4.5, word_count: '1000', person_view: 'third_person' },
        video_context: {},
      },
      { workflowIdentity },
    )

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject(workflowIdentityPayload)
  })
})
