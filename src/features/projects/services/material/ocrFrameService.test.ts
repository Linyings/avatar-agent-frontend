import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('mediabunny', () => ({
  Input: class {},
  ALL_FORMATS: [],
  BlobSource: class {},
  CanvasSink: class {}
}))

vi.mock('@/shared/utils/imageProcessor', () => ({
  cropCanvas: vi.fn(),
  mergeCanvasGrid: vi.fn(),
  canvasToDataURL: vi.fn(),
  canvasToBlob: vi.fn(),
  createBlobURL: vi.fn(),
  clamp: vi.fn((value: number) => value),
  compressImageBlob: vi.fn()
}))

vi.mock('@/features/auth/services/authService', () => ({
  authenticatedFetch: vi.fn((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init))
}))

import { OCR_PARALLEL_MODELS, OcrFrameService } from './ocrFrameService'
import type { MergedFrameGroup } from '../../types/material'

const buildMergedGroup = (index: number): MergedFrameGroup => ({
  id: `group-${index}`,
  startTime: index,
  endTime: index + 0.5,
  frameCount: 1,
  frames: [],
  mergedImageUrl: `data:image/jpeg;base64,ZmFrZS1pbWFnZS0${index}`,
  layout: {
    columns: 1,
    rows: 1,
    padding: 0,
    orientation: 'grid'
  }
})

describe('OcrFrameService.recognizeMergedGroups', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('会并发发起 5 个请求并分别使用 5 个指定模型', async () => {
    const deferredResponses: Array<() => void> = []

    vi.mocked(fetch).mockImplementation((async (_input, init) => {
      const requestBody = JSON.parse(String(init?.body)) as { model: string }
      const callIndex = deferredResponses.length

      return await new Promise<Response>((resolve) => {
        deferredResponses.push(() =>
          resolve({
            ok: true,
            json: async () => ({
              timestamps: [`${(callIndex + 1).toFixed(2)}s`],
              text: [`字幕${callIndex + 1}`],
              usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15
              },
              model: requestBody.model,
              request_id: `req-${callIndex + 1}`
            })
          } as Response)
        )
      })
    }) as typeof fetch)

    const service = new OcrFrameService()
    const groups = OCR_PARALLEL_MODELS.map((_, index) => buildMergedGroup(index))

    const recognitionPromise = service.recognizeMergedGroups(groups)

    await new Promise(resolve => setTimeout(resolve, 0))

    expect(fetch).toHaveBeenCalledTimes(OCR_PARALLEL_MODELS.length)

    const usedModels = vi.mocked(fetch).mock.calls.map(([, init]) => {
      const requestBody = JSON.parse(String(init?.body)) as { model?: string }
      return requestBody.model
    })

    expect(usedModels).toEqual([...OCR_PARALLEL_MODELS])

    deferredResponses.forEach(resolve => resolve())

    const result = await recognitionPromise

    expect(result).toHaveLength(OCR_PARALLEL_MODELS.length)
    expect(result.map(item => item.subtitle)).toEqual([
      '字幕1',
      '字幕2',
      '字幕3',
      '字幕4',
      '字幕5'
    ])
  })

  it('遇到可重试失败时会自动重试后成功', async () => {
    const service = new OcrFrameService()
    const groups = [buildMergedGroup(0)]
    let callCount = 0
    const usedModels: string[] = []

    vi.mocked(fetch).mockImplementation((async (_input, init) => {
      callCount += 1
      const requestBody = JSON.parse(String(init?.body)) as { model?: string }
      usedModels.push(requestBody.model || '')

      if (callCount === 1) {
        return {
          ok: false,
          status: 429,
          text: async () => 'rate limited'
        } as Response
      }

      return {
        ok: true,
        json: async () => ({
          timestamps: ['1.00s'],
          text: ['重试成功字幕'],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15
          },
          model: OCR_PARALLEL_MODELS[0],
          request_id: 'req-retry-success'
        })
      } as Response
    }) as typeof fetch)

    const result = await service.recognizeMergedGroups(groups)

    expect(callCount).toBe(2)
    expect(usedModels).toEqual([
      OCR_PARALLEL_MODELS[0],
      OCR_PARALLEL_MODELS[1]
    ])
    expect(result).toHaveLength(1)
    expect(result[0].subtitle).toBe('重试成功字幕')
  })

  it('请求超时 60 秒后会切换模型重试', async () => {
    vi.useFakeTimers()

    const service = new OcrFrameService()
    const groups = [buildMergedGroup(0)]
    const usedModels: string[] = []

    vi.mocked(fetch).mockImplementation(((_input, init) => {
      const requestBody = JSON.parse(String(init?.body)) as { model?: string }
      usedModels.push(requestBody.model || '')

      if (usedModels.length === 1) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const abortError = new Error('aborted')
            abortError.name = 'AbortError'
            reject(abortError)
          })
        })
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({
          timestamps: ['2.00s'],
          text: ['超时后重试成功'],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15
          },
          model: OCR_PARALLEL_MODELS[1],
          request_id: 'req-timeout-retry-success'
        })
      } as Response)
    }) as typeof fetch)

    const recognitionPromise = service.recognizeMergedGroups(groups)

    await vi.advanceTimersByTimeAsync(60_000)
    await vi.advanceTimersByTimeAsync(800)

    const result = await recognitionPromise

    expect(usedModels).toEqual([
      OCR_PARALLEL_MODELS[0],
      OCR_PARALLEL_MODELS[1]
    ])
    expect(result).toHaveLength(1)
    expect(result[0].subtitle).toBe('超时后重试成功')
  })
})
