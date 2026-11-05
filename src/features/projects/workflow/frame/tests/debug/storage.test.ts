import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearFrameDebugStorage,
  loadFrameDebugStorage,
  saveFrameDebugPreset,
  saveFrameDebugRunHistory,
} from '../../debug/storage'
import type { FrameDebugRun } from '../../types'

describe('workflow/frame/debug/storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('按项目保存和读取命名 preset', () => {
    const preset = saveFrameDebugPreset('project-1', {
      name: '低帧数测试',
      config: { defaultNFrames: 4, maxDecisions: 3 },
      stepInputs: {
        'decide-timeline-view': { maxDecisions: 3 },
      },
    })

    const state = loadFrameDebugStorage('project-1')

    expect(state.presets).toHaveLength(1)
    expect(state.presets[0]).toMatchObject({
      id: preset.id,
      name: '低帧数测试',
      config: { defaultNFrames: 4, maxDecisions: 3 },
      stepInputs: {
        'decide-timeline-view': { maxDecisions: 3 },
      },
    })
    expect(loadFrameDebugStorage('project-2').presets).toHaveLength(0)
  })

  it('run history 会裁剪到上限', () => {
    Array.from({ length: 3 }).forEach((_, index) => {
      saveFrameDebugRunHistory('project-1', {
        id: `run-${index}`,
        projectId: 'project-1',
        mode: 'dry-run',
        status: 'success',
        createdAt: `2026-05-04T00:00:0${index}.000Z`,
        updatedAt: `2026-05-04T00:00:0${index}.000Z`,
        records: {},
      }, 2)
    })

    const state = loadFrameDebugStorage('project-1')

    expect(state.runs.map((run) => run.id)).toEqual(['run-2', 'run-1'])
  })

  it('持久化前会清理 File、Blob 和 blob object URL', () => {
    const run: FrameDebugRun = {
      id: 'run-with-files',
      projectId: 'project-1',
      mode: 'dry-run',
      status: 'success',
      createdAt: '2026-05-04T00:00:00.000Z',
      updatedAt: '2026-05-04T00:00:00.000Z',
      records: {
        'merge-videos': {
          id: 'merge-videos',
          status: 'success',
          input: {
            file: new File(['video'], 'clip.mp4', { type: 'video/mp4', lastModified: 1 }),
            blob: new Blob(['image'], { type: 'image/png' }),
            url: 'blob:preview',
          },
        },
      },
    }

    saveFrameDebugRunHistory('project-1', run)
    const raw = localStorage.getItem('frame-debug:project-1:v1') ?? ''
    const stored = loadFrameDebugStorage('project-1')

    expect(raw).not.toContain('blob:preview')
    expect(stored.runs[0].records['merge-videos']?.input).toMatchObject({
      file: {
        __kind: 'File',
        name: 'clip.mp4',
        size: 5,
        type: 'video/mp4',
        lastModified: 1,
        reselectRequired: true,
      },
      blob: {
        __kind: 'Blob',
        size: 5,
        type: 'image/png',
        reselectRequired: true,
      },
      url: '[object-url-stripped]',
    })
  })

  it('localStorage 超额时自动降级保存精简 run，避免抛出 QuotaExceededError', () => {
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItemWithSmallQuota(this: Storage, key, value) {
      if (String(value).length > 1200) {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      }
      return originalSetItem.call(this, key, value)
    })

    const hugeText = '很长的转录内容'.repeat(2000)
    const run: FrameDebugRun = {
      id: 'run-large',
      projectId: 'project-1',
      mode: 'dry-run',
      status: 'success',
      createdAt: '2026-05-04T00:00:00.000Z',
      updatedAt: '2026-05-04T00:00:00.000Z',
      records: {
        transcribe: {
          id: 'transcribe',
          status: 'success',
          outputSummary: { segments: 1, tokens: 999 },
          output: {
            transcription: {
              text_content: hugeText,
              packed_transcript: hugeText,
              words: Array.from({ length: 100 }, (_, index) => ({ text: `w${index}`, start: index, end: index + 0.1 })),
            },
          },
          logs: ['执行成功：已生成 转录字幕 的输出摘要。'],
        },
      },
    }

    expect(() => saveFrameDebugRunHistory('project-1', run)).not.toThrow()

    const raw = localStorage.getItem('frame-debug:project-1:v1') ?? ''
    const stored = loadFrameDebugStorage('project-1')

    expect(raw.length).toBeLessThanOrEqual(1200)
    expect(raw).not.toContain('很长的转录内容')
    expect(stored.runs[0].records.transcribe?.outputSummary).toEqual({ segments: 1, tokens: 999 })
    expect(stored.runs[0].records.transcribe?.output).toBeUndefined()
  })

  it('降级保存时保留合并视频上下文的可读结果', () => {
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItemWithSmallQuota(this: Storage, key, value) {
      if (String(value).length > 4200) {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      }
      return originalSetItem.call(this, key, value)
    })

    const hugeRaw = '很大的原始响应'.repeat(1000)
    const run: FrameDebugRun = {
      id: 'run-merge-context',
      projectId: 'project-1',
      mode: 'dry-run',
      status: 'success',
      createdAt: '2026-05-04T00:00:00.000Z',
      updatedAt: '2026-05-04T00:00:00.000Z',
      records: {
        'merge-video-context': {
          id: 'merge-video-context',
          status: 'success',
          outputSummary: { total_segments: 2, visual_segments: 1, total_tokens: 33 },
          output: {
            videoContext: {
              items: {
                '1': { start_time: 0, end_time: 2, subtitle: '你好', visual: '' },
                '2': { start_time: 2, end_time: 4, subtitle: '快跑', visual: '人物奔跑后突然转头。', speaker_id: 'speaker_0' },
              },
              total_segments: 2,
              subtitle_segments: 2,
              visual_segments: 1,
              merged_at: 1777381200000,
            },
            pipelineResult: {
              transcription: { raw_result: hugeRaw },
              tokens: { transcription: 10, decision: 11, analysis: 12, total: 33 },
              analyses: [
                {
                  decisionIndex: 1,
                  decision: { start: 2, end: 4, reason: '候选切点' },
                  image: { name: 'timeline.png', size: 1024 },
                  response: {
                    raw_result: hugeRaw,
                    analysis: { summary: '人物奔跑后突然转头。' },
                    tokens_consumed: 12,
                  },
                },
              ],
            },
          },
          logs: ['执行成功：已生成 合并视频上下文 的输出摘要。'],
        },
      },
    }

    expect(() => saveFrameDebugRunHistory('project-1', run)).not.toThrow()

    const raw = localStorage.getItem('frame-debug:project-1:v1') ?? ''
    const stored = loadFrameDebugStorage('project-1')
    const output = stored.runs[0].records['merge-video-context']?.output as Record<string, unknown>

    expect(raw.length).toBeLessThanOrEqual(4200)
    expect(raw).not.toContain('很大的原始响应')
    expect(output).toMatchObject({
      videoContext: {
        items: {
          '2': { subtitle: '快跑', visual: '人物奔跑后突然转头。', speaker_id: 'speaker_0' },
        },
        visual_segments: 1,
      },
      pipelineResult: {
        tokens: { total: 33 },
      },
    })
  })

  it('降级保存时保留判断视觉片段的分片和失败状态', () => {
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItemWithSmallQuota(this: Storage, key, value) {
      if (String(value).length > 3600) {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      }
      return originalSetItem.call(this, key, value)
    })

    const run: FrameDebugRun = {
      id: 'run-decision',
      projectId: 'project-1',
      mode: 'dry-run',
      status: 'success',
      createdAt: '2026-05-04T00:00:00.000Z',
      updatedAt: '2026-05-04T00:00:00.000Z',
      records: {
        'decide-timeline-view': {
          id: 'decide-timeline-view',
          status: 'success',
          outputSummary: { decisions: 1, chunks: 2, failed_chunks: 1 },
          output: {
            success: true,
            provider: 'frontend-orchestrator',
            model: 'chunked-timeline-decision',
            content: '很长的原始内容'.repeat(800),
            analysis: { summary: '分片完成', decisions: [{ start: 1, end: 3, reason: '模型判断' }] },
            decisions: [
              { start: 1, end: 3, priority: 'high', trigger_type: 'candidate_cut', reason: '模型判断' },
            ],
            strategy: { mode: 'chunked_frontend', chunk_count: 2, failed_count: 1, skipped_count: 0 },
            chunks: [
              { chunk_id: 'chunk-001', status: 'model_success', start: 0, end: 8, candidates: [], decisions: [{ start: 1, end: 3 }] },
              { chunk_id: 'chunk-002', status: 'failed', start: 8, end: 16, candidates: [], decisions: [], error: 'timeout' },
            ],
            failed_chunks: [
              { chunk_id: 'chunk-002', status: 'failed', start: 8, end: 16, error: 'timeout' },
            ],
            chunk_request_ids: ['req-1'],
            tokens_consumed: 33,
          },
          logs: ['执行成功：已生成 判断视觉片段 的输出摘要。'],
        },
      },
    }

    expect(() => saveFrameDebugRunHistory('project-1', run)).not.toThrow()

    const raw = localStorage.getItem('frame-debug:project-1:v1') ?? ''
    const stored = loadFrameDebugStorage('project-1')
    const output = stored.runs[0].records['decide-timeline-view']?.output as Record<string, unknown>

    expect(raw.length).toBeLessThanOrEqual(3600)
    expect(raw).not.toContain('很长的原始内容')
    expect(output).toMatchObject({
      strategy: { mode: 'chunked_frontend', chunk_count: 2, failed_count: 1 },
      chunks: [
        { chunk_id: 'chunk-001', status: 'model_success' },
        { chunk_id: 'chunk-002', status: 'failed', error: 'timeout' },
      ],
      failed_chunks: [
        { chunk_id: 'chunk-002', status: 'failed' },
      ],
      chunk_request_ids: ['req-1'],
    })
  })

  it('可以清空指定项目的调试存储', () => {
    saveFrameDebugPreset('project-1', {
      name: 'preset',
      config: {},
      stepInputs: {},
    })

    clearFrameDebugStorage('project-1')

    expect(loadFrameDebugStorage('project-1')).toEqual({ presets: [], runs: [] })
  })
})
