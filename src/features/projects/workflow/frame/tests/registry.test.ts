import { describe, expect, it, vi } from 'vitest'
import { frameWorkflowStepIds, frameWorkflowSteps } from '../registry'

const mocks = vi.hoisted(() => ({
  uploadImageFile: vi.fn(),
  analyzeTimelineViewImage: vi.fn(),
  analyzeNarrativeContext: vi.fn(),
  analyzeNarrativeContextStream: vi.fn(),
  generateScriptStream: vi.fn(),
  generateNarrationDraftStream: vi.fn(),
  generateNarrationStructuredStream: vi.fn(),
  generateNarrationRepairStream: vi.fn(),
  matchNarrationVisualsStream: vi.fn(),
  generateTimelineViewImage: vi.fn(),
  fetchBuiltInVoices: vi.fn(),
  generateTTSWithVoiceUri: vi.fn(),
  saveNarrationAudio: vi.fn(),
  getAudioBlob: vi.fn(),
  loadFrameDebugAsset: vi.fn(),
  saveWorkflowFields: vi.fn(),
  updateProject: vi.fn(),
  uploadProjectPreview: vi.fn(),
  captureVideoThumbnail: vi.fn(),
  saveProjectAsset: vi.fn(),
}))

vi.mock('@/shared/services/dashscopeTempFileService', () => ({
  dashscopeTempFileService: {
    uploadImageFile: mocks.uploadImageFile,
  },
}))

vi.mock('@/shared/services/aiToolsService', () => ({
  aiToolsService: {
    analyzeTimelineViewImage: mocks.analyzeTimelineViewImage,
    analyzeNarrativeContext: mocks.analyzeNarrativeContext,
    analyzeNarrativeContextStream: mocks.analyzeNarrativeContextStream,
  },
}))

vi.mock('@/features/projects/services/scriptGenerationServiceV2', () => ({
  scriptGenerationServiceV2: {
    generateScriptStream: mocks.generateScriptStream,
    generateNarrationDraftStream: mocks.generateNarrationDraftStream,
    generateNarrationStructuredStream: mocks.generateNarrationStructuredStream,
    generateNarrationRepairStream: mocks.generateNarrationRepairStream,
    matchNarrationVisualsStream: mocks.matchNarrationVisualsStream,
  },
}))

vi.mock('@/features/projects/services/timelineViewImageService', () => ({
  generateTimelineViewImage: mocks.generateTimelineViewImage,
  isTimelineViewImageDecodeError: (error: unknown) => (
    error instanceof Error && /decod/i.test(error.message)
  ),
  TIMELINE_IMAGE_BROWSER_DECODE_ERROR: '当前浏览器无法解码该视频。请切换到最新版 Google Chrome 或 Microsoft Edge 后重试。',
}))

vi.mock('@/shared/services/ttsServiceLoader', () => ({
  loadTTSService: vi.fn().mockResolvedValue({
    fetchBuiltInVoices: mocks.fetchBuiltInVoices,
    generateTTSWithVoiceUri: mocks.generateTTSWithVoiceUri,
  }),
}))

vi.mock('@/shared/services/localAudioStorageService', () => ({
  localAudioStorageService: {
    saveNarrationAudio: mocks.saveNarrationAudio,
    getAudioBlob: mocks.getAudioBlob,
  },
}))

vi.mock('../debug/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../debug/storage')>()
  return {
    ...actual,
    loadFrameDebugAsset: mocks.loadFrameDebugAsset,
  }
})

vi.mock('@/features/projects/services/projectService', () => ({
  default: {
    getProject: vi.fn().mockResolvedValue({
      id: 'project-1',
      status: 'draft',
      artifacts: {},
      workflow: {
        mode: 'frame',
        status: 'draft',
        current_step: 'step_0_created',
        current_step_id: null,
        current_step_index: 0,
        revision: 1,
        steps: {},
        stages: {},
      },
    }),
    saveWorkflowFields: mocks.saveWorkflowFields,
    updateProject: mocks.updateProject,
    uploadProjectPreview: mocks.uploadProjectPreview,
  },
}))

vi.mock('@/features/projects/services/material/videoProcessingService', () => ({
  default: {
    captureVideoThumbnail: mocks.captureVideoThumbnail,
  },
}))

vi.mock('@/shared/services/localAssetStorageService', () => ({
  localAssetStorageService: {
    saveProjectAsset: mocks.saveProjectAsset,
  },
}))

describe('frameWorkflowSteps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.saveWorkflowFields.mockResolvedValue({ workflow: true })
    mocks.updateProject.mockResolvedValue({ id: 'project-1' })
    mocks.uploadProjectPreview.mockResolvedValue(undefined)
    mocks.captureVideoThumbnail.mockResolvedValue(new Blob(['preview'], { type: 'image/jpeg' }))
    mocks.saveProjectAsset.mockResolvedValue({
      storage: 'local',
      key: 'assets/project-1/source.mp4',
      name: 'source.mp4',
      type: 'video/mp4',
      size: 5,
      updated_at: '2026-05-04T00:00:00.000Z',
    })
  })

  it('按稳定依赖顺序注册逐帧调试步骤', () => {
    expect(frameWorkflowStepIds).toEqual([
      'merge-videos',
      'extract-audio',
      'transcribe',
      'validate-subtitles',
      'decide-timeline-view',
      'generate-timeline-images',
      'analyze-timeline-images',
      'understand-narrative',
      'merge-video-context',
      'generate-narration-script',
      'match-narration-visuals',
      'generate-voiceover',
      'compose-final-video',
      'persist-project',
    ])
  })

  it('每个步骤都有调试执行需要的元数据和适配器', () => {
    frameWorkflowSteps.forEach((step) => {
      expect(step.label).toBeTruthy()
      expect(step.progressWeight).toEqual(expect.any(Number))
      expect(step.progressWeight).toBeGreaterThan(0)
      expect(Array.isArray(step.dependsOn)).toBe(true)
      expect(Array.isArray(step.effects)).toBe(true)
      expect(step.buildInput).toBeTypeOf('function')
      expect(step.run).toBeTypeOf('function')
      expect(step.summarizeOutput).toBeTypeOf('function')
    })
  })

  it('步骤进度权重总和保持为 100，便于主流程直接展示百分比', () => {
    const totalWeight = frameWorkflowSteps.reduce((sum, step) => sum + (step.progressWeight ?? 0), 0)

    expect(totalWeight).toBe(100)
  })

  it('依赖图没有向后引用或环', () => {
    const position = new Map(frameWorkflowStepIds.map((id, index) => [id, index]))

    frameWorkflowSteps.forEach((step) => {
      step.dependsOn.forEach((dependency) => {
        expect(position.get(dependency) ?? -1).toBeLessThan(position.get(step.id) ?? -1)
      })
    })
  })

  it('缺少依赖输出时 input builder 会阻止继续执行', () => {
    const extractStep = frameWorkflowSteps.find((step) => step.id === 'extract-audio')

    expect(() => extractStep?.buildInput({
      projectId: 'project-1',
      files: [],
      config: {
        outputLanguage: 'zh',
        defaultNFrames: 10,
        maxDecisions: 8,
      },
      records: {},
    })).toThrow('缺少依赖步骤 merge-videos')
  })

  it('persist-project 真实步骤必须声明 mutates-project 副作用', () => {
    const persistStep = frameWorkflowSteps.find((step) => step.id === 'persist-project')

    expect(persistStep?.effects).toContain('mutates-project')
  })

  it('persist-project 会把合并视频截图保存为浏览器本地项目预览图', async () => {
    const persistStep = frameWorkflowSteps.find((step) => step.id === 'persist-project')
    const mergedFile = new File(['video'], 'source.mp4', { type: 'video/mp4' })
    const pipelineResult = {
      finalVideoResult: { finalVideoUrl: 'https://cdn.example/final.mp4' },
      subtitlePayload: { '1': { start_time: 0, end_time: 1, subtitle: '字幕' } },
      videoContext: { items: {}, total_segments: 1 },
      decision: { needs_timeline_view: false },
      analyses: [],
      narrativeUnderstanding: { analysis: { summary: '剧情' } },
      voiceoverResult: { items: [], audioStates: {} },
    }
    const input = persistStep?.buildInput({
      projectId: 'project-1',
      files: [],
      projectName: '逐帧项目',
      config: {
        outputLanguage: 'zh',
        defaultNFrames: 10,
        maxDecisions: 8,
      },
      records: {
        'merge-videos': {
          id: 'merge-videos',
          status: 'success',
          output: {
            file: mergedFile,
            video: {
              name: 'source.mp4',
              size: mergedFile.size,
              type: 'video/mp4',
              duration: 12,
            },
          },
        },
        'compose-final-video': {
          id: 'compose-final-video',
          status: 'success',
          output: {
            pipelineResult,
            finalVideo: pipelineResult.finalVideoResult,
          },
        },
      },
    })

    const output = await persistStep?.run(input, {
      projectId: 'project-1',
      files: [],
      config: {
        outputLanguage: 'zh',
        defaultNFrames: 10,
        maxDecisions: 8,
      },
      records: {},
    }) as { previewSaved?: boolean }

    expect(mocks.captureVideoThumbnail).toHaveBeenCalledWith(mergedFile, undefined, 500)
    expect(mocks.uploadProjectPreview).toHaveBeenCalledWith('project-1', expect.any(Blob))
    expect(output.previewSaved).toBe(true)
  })

  it('判断视觉片段步骤会把原始转录和字幕一起交给分片编排器', () => {
    const decideStep = frameWorkflowSteps.find((step) => step.id === 'decide-timeline-view')
    const transcription = {
      packed_transcript: '[10.00-12.50] 别过来。',
      text_content: '别过来。',
      phrases: [{ start: 10, end: 12.5, text: '别过来。' }],
      words: [{ start: 10, end: 10.2, text: '别' }],
    }
    const subtitleResult = {
      segments: [
        { id: '1', startTime: 10, endTime: 12.5, text: '别过来。', speakerId: 'speaker_0' },
      ],
      language: 'zh',
      totalDuration: 12.5,
      processingTime: 0,
      confidence: 1,
    }

    const input = decideStep?.buildInput({
      projectId: 'project-1',
      files: [],
      config: {
        outputLanguage: 'zh',
        defaultNFrames: 10,
        maxDecisions: 8,
        decisionPrompt: '复核冲突点',
      },
      records: {
        'merge-videos': {
          id: 'merge-videos',
          status: 'success',
          output: {
            video: {
              name: 'source.mp4',
              size: 1024,
              type: 'video/mp4',
              duration: 125,
            },
          },
        },
        'validate-subtitles': {
          id: 'validate-subtitles',
          status: 'success',
          output: {
            transcription,
            subtitleResult,
            subtitlePayload: { content: '别过来。' },
            initialVideoContext: {},
            validation: {
              status: 'completed',
              model: 'flash-test',
              request_id: 'subtitle-validation-request-1',
              tokens_consumed: 3,
              corrections_count: 0,
              updated_at: '2026-05-12T00:00:00.000Z',
            },
          },
        },
      },
    }) as Record<string, unknown>

    expect(input.transcription).toBe(transcription)
    expect(input.subtitleResult).toBe(subtitleResult)
    expect(input.segments).toEqual([
      { start: 10, end: 12.5, text: '别过来。' },
    ])
    expect(input.maxDecisions).toBe(3)
    expect(input.defaultNFrames).toBe(15)
    expect(input.prompt).toBe('复核冲突点')
  })

  it('生成时间线图会从浏览器存储恢复刷新后丢失的合并视频 File', async () => {
    const generateStep = frameWorkflowSteps.find((step) => step.id === 'generate-timeline-images')
    const restoredBlob = new Blob(['restored-video'], { type: 'video/mp4' })
    mocks.loadFrameDebugAsset.mockResolvedValue(restoredBlob)
    mocks.generateTimelineViewImage.mockImplementation(async ({ video }: { video: File }) => {
      expect(video).toBeInstanceOf(File)
      expect(video.name).toBe('source.mp4')
      expect(video.type).toBe('video/mp4')
      return {
        file: new File(['png'], 'timeline-view.png', { type: 'image/png' }),
      }
    })

    const output = await generateStep?.run({
      merged: {
        previewStorageKey: 'project-1:run-1:merge-videos:media',
        file: {
          __kind: 'File',
          name: 'source.mp4',
          size: 1024,
          type: 'video/mp4',
          reselectRequired: true,
        },
        video: {
          name: 'source.mp4',
          size: 1024,
          type: 'video/mp4',
          duration: 12,
        },
      },
      transcript: { words: [] },
      decisions: [
        { start: 1, end: 3, priority: 'high', trigger_type: 'candidate_cut', reason: '需要复核', n_frames: 4 },
      ],
      defaultNFrames: 10,
    }, {
      projectId: 'project-1',
      files: [],
      config: {
        outputLanguage: 'zh',
        defaultNFrames: 10,
        maxDecisions: 8,
      },
      records: {},
    })

    expect(mocks.loadFrameDebugAsset).toHaveBeenCalledWith('project-1:run-1:merge-videos:media')
    expect(mocks.generateTimelineViewImage).toHaveBeenCalledTimes(1)
    expect(output).toMatchObject({
      images: [
        {
          image: {
            name: 'timeline-view.png',
            type: 'image/png',
          },
        },
      ],
    })
  })

  it('分析时间线图会从浏览器存储恢复刷新后丢失的图片 File', async () => {
    const analyzeStep = frameWorkflowSteps.find((step) => step.id === 'analyze-timeline-images')
    const restoredBlob = new Blob(['restored-png'], { type: 'image/png' })
    mocks.loadFrameDebugAsset.mockResolvedValue(restoredBlob)
    mocks.uploadImageFile.mockImplementation(async (file: File) => {
      expect(file).toBeInstanceOf(File)
      expect(file.name).toBe('timeline-view-1.png')
      expect(file.type).toBe('image/png')
      return { objectKey: 'tmp/timeline-view-1.png', ossUrl: 'oss://tmp/timeline-view-1.png' }
    })
    mocks.analyzeTimelineViewImage.mockResolvedValue({
      success: true,
      provider: 'dashscope',
      model: 'qwen',
      timeline_image_url: 'oss://tmp/timeline-view-1.png',
      timeline_image_size: 0,
      range: { start: 10, end: 12.5, duration: 2.5 },
      n_frames: 8,
      content: '{"summary":"ok"}',
      analysis: { summary: 'ok' },
      raw_result: {},
      usage: {},
      request_id: 'req-1',
      tokens_consumed: 5,
      updated_at: '2026-05-04T00:00:00.000Z',
    })

    const output = await analyzeStep?.run({
      prompt: undefined,
      images: [
        {
          decisionIndex: 1,
          previewStorageKey: 'project-1:run-1:timeline-image:0',
          decision: {
            start: 10,
            end: 12.5,
            priority: 'high',
            trigger_type: 'candidate_cut',
            reason: '需要复核',
          },
          nFrames: 8,
          file: {
            __kind: 'File',
            name: 'timeline-view-1.png',
            size: 123,
            type: 'image/png',
          },
          image: {
            name: 'timeline-view-1.png',
            size: 123,
            type: 'image/png',
          },
        },
      ],
    }, {
      projectId: 'project-1',
      files: [],
      config: {
        outputLanguage: 'zh',
        defaultNFrames: 10,
        maxDecisions: 8,
      },
      records: {},
    })

    expect(mocks.loadFrameDebugAsset).toHaveBeenCalledWith('project-1:run-1:timeline-image:0')
    expect(mocks.uploadImageFile).toHaveBeenCalledTimes(1)
    expect(output).toMatchObject({
      analyses: [
        {
          image: {
            objectKey: 'tmp/timeline-view-1.png',
            ossUrl: 'oss://tmp/timeline-view-1.png',
          },
        },
      ],
    })
  })

  it('剧情理解步骤会保留说话人、字幕和视觉分析输入', async () => {
    const narrativeStep = frameWorkflowSteps.find((step) => step.id === 'understand-narrative')
    mocks.analyzeNarrativeContextStream.mockImplementation(async (_input, options) => {
      options?.onEvent?.({ type: 'stage', stage: 'frame_narrative_understanding', message: '正在流式理解剧情' })
      options?.onEvent?.({ type: 'answer_delta', delta: '{"summary":"两人冲突升级"}' })
      const response = {
        success: true,
        provider: 'openai',
        model: 'text-model',
        content: '{}',
        analysis: { summary: '两人冲突升级' },
        characters: [{ id: 'speaker_0' }],
        relationships: [],
        emotion_curve: [],
        events: [{ start: 10, end: 12.5, description: '追逃' }],
        usage: { total_tokens: 42 },
        request_id: 'req-narrative',
        tokens_consumed: 42,
        updated_at: '2026-05-04T00:00:00.000Z',
      }
      options?.onEvent?.({ type: 'completed', response })
      return response
    })

    const appendStepLog = vi.fn()
    const updateStepLog = vi.fn()

    const input = narrativeStep?.buildInput({
      projectId: 'project-1',
      files: [],
      config: {
        outputLanguage: 'zh',
        defaultNFrames: 10,
        maxDecisions: 8,
      },
      records: {
        'validate-subtitles': {
          id: 'validate-subtitles',
          status: 'success',
          output: {
            transcription: {
              packed_transcript: '[10.00-12.50] 别过来。',
              text_content: '别过来。',
            },
            subtitleResult: {
              segments: [
                { id: '1', startTime: 10, endTime: 12.5, text: '别过来。', speakerId: 'speaker_0' },
              ],
              language: 'zh',
              totalDuration: 12.5,
              processingTime: 0,
              confidence: 1,
            },
            validation: {
              status: 'completed',
              model: 'flash-test',
              request_id: 'subtitle-validation-request-1',
              tokens_consumed: 3,
              corrections_count: 0,
              updated_at: '2026-05-12T00:00:00.000Z',
            },
          },
        },
        'decide-timeline-view': {
          id: 'decide-timeline-view',
          status: 'success',
          output: {
            decisions: [
              { start: 10, end: 12.5, priority: 'high', trigger_type: 'candidate_cut', reason: '冲突升级' },
            ],
          },
        },
        'analyze-timeline-images': {
          id: 'analyze-timeline-images',
          status: 'success',
          output: {
            analyses: [
              {
                decisionIndex: 1,
                decision: { start: 10, end: 12.5, priority: 'high', trigger_type: 'candidate_cut', reason: '冲突升级' },
                image: { name: 'timeline.png', size: 100, objectKey: 'tmp', ossUrl: 'oss://tmp' },
                response: {
                  analysis: { summary: '人物奔跑后转头。', concerns: ['表情紧张'] },
                  content: '人物奔跑后转头。',
                  tokens_consumed: 5,
                },
              },
            ],
          },
        },
      },
    }) as Record<string, unknown>

    expect(input.segments).toEqual([
      { start: 10, end: 12.5, text: '别过来。', speaker_id: 'speaker_0' },
    ])
    expect(input.visualAnalyses).toEqual([
      expect.objectContaining({ summary: '人物奔跑后转头。', concerns: ['表情紧张'] }),
    ])

    const output = await narrativeStep?.run(input, {
      projectId: 'project-1',
      files: [],
      config: {
        outputLanguage: 'zh',
        defaultNFrames: 10,
        maxDecisions: 8,
      },
      records: {},
      appendStepLog,
      updateStepLog,
    })

    expect(mocks.analyzeNarrativeContextStream).toHaveBeenCalledWith(expect.objectContaining({
      ...input,
      projectId: 'project-1',
    }), expect.objectContaining({
      onEvent: expect.any(Function),
    }))
    expect(appendStepLog).toHaveBeenCalledWith('understand-narrative', '已开始监听剧情理解流式输出')
    expect(updateStepLog).toHaveBeenCalledWith(
      'understand-narrative',
      '模型输出：',
      expect.stringContaining('两人冲突升级')
    )
    expect(output).toMatchObject({ tokens_consumed: 42 })
  })

  it('合并视频上下文会写入剧情待确认问题的 QA 答案', async () => {
    const mergeStep = frameWorkflowSteps.find((step) => step.id === 'merge-video-context')
    const output = await mergeStep?.run({
      merged: {
        video: { url: 'blob:merged', duration: 12.5 },
      },
      extracted: {
        audio: { url: 'blob:audio', duration: 12.5 },
      },
      transcribed: {
        transcription: {
          text_content: '别过来。',
          packed_transcript: '[10.00-12.50] 别过来。',
          tokens_consumed: 1,
        },
        subtitleResult: {
          segments: [
            { id: '1', startTime: 10, endTime: 12.5, text: '别过来。', speakerId: 'speaker_0' },
          ],
        },
        subtitlePayload: { content: '别过来。' },
        validation: {
          status: 'completed',
          model: 'flash-test',
          request_id: 'subtitle-validation-request-1',
          tokens_consumed: 3,
          corrections_count: 0,
          updated_at: '2026-05-12T00:00:00.000Z',
        },
        initialVideoContext: {
          items: {
            '1': {
              start_time: 10,
              end_time: 12.5,
              subtitle: '别过来。',
              visual: '',
              speaker_id: 'speaker_0',
            },
          },
          total_segments: 1,
          subtitle_segments: 1,
          visual_segments: 0,
        },
      },
      decision: { decisions: [], tokens_consumed: 2 },
      analyses: [],
      narrativeUnderstanding: {
        success: true,
        provider: 'openai',
        model: 'text-model',
        content: '{}',
        analysis: {
          summary: '两人冲突升级',
          open_questions: ['追赶者身份仍不明确'],
        },
        confirmed_question_answers: [
          { question: '追赶者身份仍不明确', answer: '追赶者是赌场老板的手下。' },
        ],
        characters: [],
        relationships: [],
        emotion_curve: [],
        events: [],
        usage: { total_tokens: 4 },
        request_id: 'req-narrative',
        tokens_consumed: 4,
        updated_at: '2026-05-04T00:00:00.000Z',
      },
    } as never, {
      projectId: 'project-1',
      files: [],
      config: {
        outputLanguage: 'zh',
        defaultNFrames: 10,
        maxDecisions: 8,
      },
      records: {},
    })

    expect(output).toMatchObject({
      videoContext: {
        narrative_context: {
          summary: '两人冲突升级',
          open_questions: [
            { question: '追赶者身份仍不明确', answer: '追赶者是赌场老板的手下。' },
          ],
          confirmed_question_answers: [
            { question: '追赶者身份仍不明确', answer: '追赶者是赌场老板的手下。' },
          ],
        },
      },
      pipelineResult: {
        tokens: { total: 10 },
      },
    })
  })

  it('生成解说文案步骤复用后端脚本接口并传入合并上下文', async () => {
    const scriptStep = frameWorkflowSteps.find((step) => step.id === 'generate-narration-script')
    const narrationText = '追逃到了这一步，回头已经不是犹豫，而是双方矛盾被彻底逼到台面上的信号。眼前的脚步越近，人物越清楚自己没有退路，只能在这一瞬间作出选择，让原本暗涌的冲突真正爆发。'
    mocks.generateNarrationDraftStream.mockResolvedValue({
      items: [
        { _id: 1, text: narrationText, org: '' },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      model: 'flash-test',
      request_id: 'req-script',
    })
    mocks.generateNarrationStructuredStream.mockResolvedValue({
      result: { passed: true, issues: [], coverage: [], evidence_gaps: [], patches: [] },
      usage: { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 },
      model: 'pro-test',
      request_id: 'req-review',
    })

    const narrativeEvent = {
      event_id: 'event-001',
      start: 10,
      end: 12.5,
      description: '人物在追逃中回头，双方冲突升级。',
      importance: 'high',
      evidence: ['别过来。'],
    }
    const videoContext = {
      items: {
        '1': {
          start_time: 10,
          end_time: 12.5,
          subtitle: '别过来。',
          visual: '人物奔跑后转头。',
          speaker_id: 'speaker_0',
        },
      },
      total_segments: 1,
      subtitle_segments: 1,
      visual_segments: 1,
      merged_at: 1,
      narrative_context: {
        summary: '两人因追逃发生冲突。',
        events: [narrativeEvent],
      },
    }
    const pipelineResult = {
      videoContext,
      transcription: {
        text_content: '别过来。',
        packed_transcript: '[10.00-12.50] 别过来。',
        language_code: 'zh',
      },
      subtitleResult: {
        segments: [
          { id: '1', startTime: 10, endTime: 12.5, text: '别过来。', speakerId: 'speaker_0' },
        ],
        language: 'zh',
      },
      decision: {
        decisions: [
          { start: 10, end: 12.5, priority: 'high', trigger_type: 'candidate_cut', reason: '冲突升级' },
        ],
      },
      analyses: [
        {
          decisionIndex: 1,
          decision: { start: 10, end: 12.5, priority: 'high', trigger_type: 'candidate_cut', reason: '冲突升级' },
          image: { name: 'timeline.png', size: 100, objectKey: 'tmp', ossUrl: 'oss://tmp' },
          response: {
            analysis: { summary: '人物奔跑后转头。' },
            content: '人物奔跑后转头。',
          },
        },
      ],
      narrativeUnderstanding: {
        analysis: { events: [narrativeEvent] },
        events: [narrativeEvent],
      },
      tokens: { transcription: 1, decision: 2, analysis: 3, narrative: 4, total: 10 },
    }

    const input = scriptStep?.buildInput({
      projectId: 'project-1',
      files: [],
      config: {
        outputLanguage: 'zh-CN',
        defaultNFrames: 10,
        maxDecisions: 8,
        narrationStyleId: '电影电视剧',
        selectionRatio: 0.3,
        outputDurationMs: 60_000,
        narrationRatio: 0.5,
        originalRatio: 0.5,
      },
      records: {
        'merge-video-context': {
          id: 'merge-video-context',
          status: 'success',
          output: {
            videoContext,
            pipelineResult,
          },
        },
      },
    }) as Record<string, unknown>

    expect(input.video_context).toMatchObject({
      context_schema: 'frame_narration_dynamic_context_v1',
      narrative_context: videoContext.narrative_context,
    })
    expect(input.cache_context).toMatchObject({
      cache_schema: 'frame_narration_layered_context_v1',
      context_strategy: expect.objectContaining({
        target_output_duration_ms: 60_000,
      }),
    })
    expect(input.video_config).toMatchObject({
      model_level: 'frame',
      style_mode: '电影电视剧',
      output_duration_ms: 60_000,
      narration_ratio: 0.5,
    })

    const output = await scriptStep?.run(input, {
      projectId: 'project-1',
      files: [],
      config: {
        outputLanguage: 'zh-CN',
        defaultNFrames: 10,
        maxDecisions: 8,
      },
      records: {
        'merge-video-context': {
          id: 'merge-video-context',
          status: 'success',
          output: {
            videoContext,
            pipelineResult,
          },
        },
      },
    })

    expect(mocks.generateNarrationDraftStream).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'project-1',
      model_profile: 'flash',
      model_operation: 'narration_segment',
    }), expect.objectContaining({
      onEvent: expect.any(Function),
    }))
    expect(mocks.generateNarrationStructuredStream).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'project-1',
      model_profile: 'pro',
      model_operation: 'narration_global_review',
    }), expect.objectContaining({
      onEvent: expect.any(Function),
    }))
    expect(output).toMatchObject({
      approvedDraftItems: [{
        text: narrationText,
        event_ids: ['event-001'],
        source_start: 10,
        source_end: 12.5,
      }],
      pipelineResult: {
        selectionPlan: {
          keepCount: 1,
          narrationCount: 1,
          originalCount: 0,
          targetCharacters: 80,
        },
        tokens: { script: 40, total: 50 },
      },
    })
  })

  it('解说配音步骤复用 TTS 生成并写入本地音频键', async () => {
    const voiceStep = frameWorkflowSteps.find((step) => step.id === 'generate-voiceover')
    mocks.fetchBuiltInVoices.mockResolvedValue([
      { uri: 'voice://test', name: '测试音色', type: 'basic', sample_url: 'https://example.com/sample.mp3' },
    ])
    mocks.generateTTSWithVoiceUri.mockResolvedValue({
      success: true,
      audioBlob: new Blob(['mp3'], { type: 'audio/mpeg' }),
      duration: 2.4,
    })
    mocks.saveNarrationAudio.mockResolvedValue('project:project-1:narration:1')

    const scriptResponse = {
      items: [
        { _id: 1, text: '她转身的一刻，危机彻底爆发。', start: 10, end: 12.5, org: '' },
        { _id: 2, text: '', start: 12.5, end: 14, org: '别过来。' },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      model: 'text-model',
      request_id: 'req-script',
    }
    const pipelineResult = {
      scriptResponse,
      tokens: { transcription: 1, decision: 2, analysis: 3, narrative: 4, script: 30, total: 40 },
    }

    const input = voiceStep?.buildInput({
      projectId: 'project-1',
      files: [],
      config: {
        outputLanguage: 'zh-CN',
        defaultNFrames: 10,
        maxDecisions: 8,
        voice: '测试音色',
      },
      records: {
        'match-narration-visuals': {
          id: 'match-narration-visuals',
          status: 'success',
          output: {
            scriptResponse,
            pipelineResult,
          },
        },
      },
    }) as Record<string, unknown>

    expect(input).toEqual({
      scriptItems: scriptResponse.items,
      voice: '测试音色',
    })

    const output = await voiceStep?.run(input, {
      projectId: 'project-1',
      files: [],
      config: {
        outputLanguage: 'zh-CN',
        defaultNFrames: 10,
        maxDecisions: 8,
      },
      records: {
        'match-narration-visuals': {
          id: 'match-narration-visuals',
          status: 'success',
          output: {
            scriptResponse,
            pipelineResult,
          },
        },
      },
    })

    expect(mocks.generateTTSWithVoiceUri).toHaveBeenCalledWith(
      '她转身的一刻，危机彻底爆发。',
      'voice://test',
      expect.objectContaining({ speed: 1, volume: 1, service_level: 'basic', projectId: 'project-1' }),
    )
    expect(mocks.saveNarrationAudio).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      itemId: 1,
      duration: 2.4,
    }))
    expect(output).toMatchObject({
      voiceoverResult: {
        generatedCount: 1,
        voiceUri: 'voice://test',
        items: expect.arrayContaining([
          expect.objectContaining({
            _id: 1,
            local_audio_key: 'project:project-1:narration:1',
            audio_storage: 'local',
            duration: 2.4,
          }),
        ]),
      },
    })
  })

  it('解说配音步骤会按高级音色使用 premium 服务等级', async () => {
    const voiceStep = frameWorkflowSteps.find((step) => step.id === 'generate-voiceover')
    mocks.fetchBuiltInVoices.mockResolvedValue([
      { uri: 'voice://advanced', name: '高级音色', type: 'advanced', sample_url: 'https://example.com/advanced.mp3' },
    ])
    mocks.generateTTSWithVoiceUri.mockResolvedValue({
      success: true,
      audioBlob: new Blob(['mp3'], { type: 'audio/mpeg' }),
      duration: 1.8,
    })
    mocks.saveNarrationAudio.mockResolvedValue('project:project-1:narration:1')

    const scriptResponse = {
      items: [
        { _id: 1, text: '高级音色应该生效。', start: 0, end: 2, org: '' },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      model: 'text-model',
      request_id: 'req-script',
    }
    const pipelineResult = {
      scriptResponse,
      tokens: { transcription: 0, decision: 0, analysis: 0, narrative: 0, script: 3, total: 3 },
    }

    const output = await voiceStep?.run({
      scriptItems: scriptResponse.items,
      voice: 'voice://advanced',
    }, {
      projectId: 'project-1',
      files: [],
      config: {
        outputLanguage: 'zh-CN',
        defaultNFrames: 10,
        maxDecisions: 8,
        voice: 'voice://advanced',
      },
      records: {
        'match-narration-visuals': {
          id: 'match-narration-visuals',
          status: 'success',
          output: {
            scriptResponse,
            pipelineResult,
          },
        },
      },
    })

    expect(mocks.generateTTSWithVoiceUri).toHaveBeenCalledWith(
      '高级音色应该生效。',
      'voice://advanced',
      expect.objectContaining({ speed: 1, volume: 1, service_level: 'premium', projectId: 'project-1' }),
    )
    expect(output).toMatchObject({
      voiceoverResult: {
        voiceUri: 'voice://advanced',
        voiceName: '高级音色',
        voiceType: 'advanced',
        serviceLevel: 'premium',
      },
    })
  })

  it('合成最终视频前会阻止复用不同音色生成的旧配音', async () => {
    const composeStep = frameWorkflowSteps.find((step) => step.id === 'compose-final-video')
    mocks.fetchBuiltInVoices.mockResolvedValue([
      { uri: 'voice://new', name: '新音色', type: 'basic', sample_url: 'https://example.com/new.mp3' },
      { uri: 'voice://old', name: '旧音色', type: 'basic', sample_url: 'https://example.com/old.mp3' },
    ])

    await expect(composeStep?.run({}, {
      projectId: 'project-1',
      files: [],
      config: {
        outputLanguage: 'zh-CN',
        defaultNFrames: 10,
        maxDecisions: 8,
        voice: 'voice://new',
      },
      records: {
        'merge-videos': {
          id: 'merge-videos',
          status: 'success',
          output: {
            video: {
              name: 'source.mp4',
              size: 1024,
              type: 'video/mp4',
              duration: 12,
              previewStorageKey: 'debug-asset-key',
            },
          },
        },
        'generate-voiceover': {
          id: 'generate-voiceover',
          status: 'success',
          output: {
            voiceoverResult: {
              items: [],
              audioStates: {},
              voiceUri: 'voice://old',
              voiceName: '旧音色',
              serviceLevel: 'basic',
              generatedCount: 0,
            },
            pipelineResult: {},
          },
        },
      },
    })).rejects.toThrow('当前选择的配音音色（新音色）和已生成配音（旧音色）不一致')
  })
})
