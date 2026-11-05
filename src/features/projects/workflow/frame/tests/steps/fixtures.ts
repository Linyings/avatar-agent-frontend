import type { NarrativeUnderstandingResponse, TimelineViewAnalysisResponse, TimelineViewDecision } from '@/shared/services/aiToolsService'
import type { GenerateScriptResponse } from '@/features/projects/services/scriptGenerationServiceV2'
import type { FrameFinalVideoResult, FrameInferenceAnalysisItem, FrameInferencePipelineResult, FrameVoiceoverResult } from '@/features/projects/services/material/frameInferencePipelineService'
import type { Project, ProjectArtifact } from '@/features/projects/types/project'
import type {
  ComposeFinalVideoOutput,
  ExtractAudioOutput,
  FrameDebugStepRecord,
  FrameDebugStepRecords,
  FrameWorkflowContext,
  FrameWorkflowRuntimeContext,
  GenerateNarrationScriptOutput,
  GenerateTimelineImagesOutput,
  GenerateVoiceoverOutput,
  MatchNarrationVisualsOutput,
  MergeVideoContextOutput,
  MergeVideosOutput,
  TranscribeOutput,
  ValidateSubtitlesOutput,
} from '../../types'

export const makeArtifact = (overrides: Partial<ProjectArtifact> = {}): ProjectArtifact => ({
  storage: 'opfs',
  key: 'projects/project-1/source_video/source.mp4',
  name: 'source.mp4',
  type: 'video/mp4',
  size: 5,
  duration: 12,
  missing: false,
  updated_at: '2026-05-12T00:00:00.000Z',
  ...overrides,
})

export const makeMergedOutput = (overrides: Partial<MergeVideosOutput> = {}): MergeVideosOutput => {
  const file = overrides.file ?? new File(['video'], 'source.mp4', { type: 'video/mp4' })
  return {
    file,
    video: {
      name: file.name,
      size: file.size,
      type: file.type || 'video/mp4',
      duration: 12,
      ...overrides.video,
    },
    sourceVideoArtifact: makeArtifact(),
    ...overrides,
  }
}

export const makeExtractAudioOutput = (overrides: Partial<ExtractAudioOutput> = {}): ExtractAudioOutput => {
  const file = overrides.file ?? new File(['audio'], 'source.mp3', { type: 'audio/mpeg' })
  return {
    file,
    audio: {
      name: file.name,
      size: file.size,
      type: file.type || 'audio/mpeg',
      ...overrides.audio,
    },
    ...overrides,
  }
}

export const makeTranscribeOutput = (overrides: Partial<TranscribeOutput> = {}): TranscribeOutput => ({
  transcription: {
    success: true,
    provider: 'elevenlabs',
    model: 'scribe_v1',
    raw_result: {},
    packed_transcript: '[0.00-1.20] 开场。[1.50-3.00] 冲突出现。',
    phrases: [],
    words: [
      { text: '开场。', start: 0, end: 1.2, type: 'word', confidence: 0.95, speaker_id: 'speaker_0' },
      { text: '冲突出现。', start: 1.5, end: 3, type: 'word', confidence: 0.95, speaker_id: 'speaker_1' },
    ],
    audio_events: [],
    text_content: '开场。冲突出现。',
    language_code: 'zh-CN',
    duration: 3,
    tokens_consumed: 88,
    updated_at: '2026-05-12T00:00:00.000Z',
    ...overrides.transcription,
  },
  subtitleResult: {
    language: 'zh-CN',
    totalDuration: 3,
    processingTime: 0,
    confidence: 0.95,
    segments: [
      { id: '1', startTime: 0, endTime: 1.2, text: '开场。', confidence: 0.95, speakerId: 'speaker_0' },
      { id: '2', startTime: 1.5, endTime: 3, text: '冲突出现。', confidence: 0.95, speakerId: 'speaker_1' },
    ],
    ...overrides.subtitleResult,
  },
  subtitlePayload: {
    '1': { start_time: 0, end_time: 1.2, subtitle: '开场。', speaker_id: 'speaker_0' },
    '2': { start_time: 1.5, end_time: 3, subtitle: '冲突出现。', speaker_id: 'speaker_1' },
    ...overrides.subtitlePayload,
  },
  initialVideoContext: {
    items: {
      '1': { start_time: 0, end_time: 1.2, subtitle: '开场。', visual: '', speaker_id: 'speaker_0' },
      '2': { start_time: 1.5, end_time: 3, subtitle: '冲突出现。', visual: '', speaker_id: 'speaker_1' },
    },
    total_segments: 2,
    subtitle_segments: 2,
    visual_segments: 0,
    merged_at: 1,
    ...overrides.initialVideoContext,
  },
  ...overrides,
})

export const makeValidateSubtitlesOutput = (
  overrides: Partial<ValidateSubtitlesOutput> = {}
): ValidateSubtitlesOutput => {
  const transcribed = makeTranscribeOutput(overrides)
  return {
    ...transcribed,
    validation: {
      status: 'completed',
      model: 'flash-test',
      request_id: 'subtitle-validation-request-1',
      tokens_consumed: 44,
      corrections_count: 0,
      updated_at: '2026-05-12T00:00:00.000Z',
      ...overrides.validation,
    },
  }
}

export const makeDecision = (overrides: Partial<TimelineViewDecision> = {}): TimelineViewDecision => ({
  start: 1.5,
  end: 3,
  reason: '冲突出现',
  expected_question: '发生了什么冲突？',
  priority: 'high',
  trigger_type: 'plot',
  n_frames: 15,
  ...overrides,
})

export const makeDecisionOutput = (decisions: TimelineViewDecision[] = [makeDecision()]): FrameInferencePipelineResult['decision'] => ({
  success: true,
  provider: 'openai',
  model: 'gpt-test',
  content: '{}',
  analysis: { summary: '需要视觉分析', needs_timeline_view: decisions.length > 0 },
  decisions,
  usage: { total_tokens: 55 },
  request_id: 'decision-request-1',
  tokens_consumed: 55,
  updated_at: '2026-05-12T00:00:00.000Z',
})

export const makeTimelineImagesOutput = (
  images: GenerateTimelineImagesOutput['images'] = [
    {
      decisionIndex: 1,
      decision: makeDecision(),
      nFrames: 15,
      file: new File(['image'], 'timeline-1.png', { type: 'image/png' }),
      image: { name: 'timeline-1.png', size: 5, type: 'image/png' },
    },
  ]
): GenerateTimelineImagesOutput => ({ images })

export const makeTimelineAnalysisResponse = (overrides: Partial<TimelineViewAnalysisResponse> = {}): TimelineViewAnalysisResponse => ({
  success: true,
  provider: 'openai',
  model: 'vision-test',
  timeline_image_url: 'oss://timeline-1.png',
  timeline_image_size: 5,
  range: { start: 1.5, end: 3, duration: 1.5 },
  n_frames: 15,
  content: '视觉摘要',
  analysis: {
    summary: '角色发生冲突',
    visual_events: ['争执'],
    concerns: ['动作较快'],
    recommendations: ['保留冲突镜头'],
  },
  raw_result: {},
  usage: { total_tokens: 66 },
  request_id: 'analysis-request-1',
  tokens_consumed: 66,
  updated_at: '2026-05-12T00:00:00.000Z',
  ...overrides,
})

export const makeAnalysisItem = (overrides: Partial<FrameInferenceAnalysisItem> = {}): FrameInferenceAnalysisItem => ({
  decisionIndex: 1,
  decision: makeDecision(),
  image: {
    name: 'timeline-1.png',
    size: 5,
    objectKey: 'object-key',
    ossUrl: 'oss://timeline-1.png',
  },
  response: makeTimelineAnalysisResponse(),
  ...overrides,
})

export const makeAnalysesOutput = (analyses: FrameInferenceAnalysisItem[] = [makeAnalysisItem()]) => ({ analyses })

export const makeNarrativeUnderstanding = (overrides: Partial<NarrativeUnderstandingResponse> = {}): NarrativeUnderstandingResponse => ({
  success: true,
  provider: 'openai',
  model: 'gpt-test',
  content: '{}',
  analysis: {
    summary: '剧情冲突升级',
    characters: ['A', 'B'],
    relationships: [{ from: 'A', to: 'B', relation: '冲突' }],
    events: [{ text: '争执' }],
    emotion_curve: [{ time: 2, emotion: '紧张' }],
    open_questions: [{ question: '谁先动手？', answer: 'A' }],
  },
  confirmed_question_answers: [{ question: '冲突是否升级？', answer: '是' }],
  characters: ['A', 'B'],
  relationships: [{ from: 'A', to: 'B', relation: '冲突' }],
  emotion_curve: [{ time: 2, emotion: '紧张' }],
  events: [{ text: '争执' }],
  usage: { total_tokens: 77 },
  request_id: 'narrative-request-1',
  tokens_consumed: 77,
  updated_at: '2026-05-12T00:00:00.000Z',
  ...overrides,
})

export const makePipelineResult = (overrides: Partial<FrameInferencePipelineResult> = {}): FrameInferencePipelineResult => {
  const merged = makeMergedOutput()
  const extracted = makeExtractAudioOutput()
  const transcribed = makeValidateSubtitlesOutput()
  const decision = makeDecisionOutput()
  const analyses = makeAnalysesOutput().analyses
  const narrativeUnderstanding = makeNarrativeUnderstanding()

  return {
    mergedVideo: merged.video,
    extractedAudio: extracted.audio,
    transcription: transcribed.transcription,
    subtitleValidation: transcribed.validation,
    subtitleResult: transcribed.subtitleResult,
    subtitlePayload: transcribed.subtitlePayload,
    videoContext: transcribed.initialVideoContext,
    decision,
    analyses,
    narrativeUnderstanding,
    tokens: {
      transcription: transcribed.transcription.tokens_consumed,
      validation: transcribed.validation.tokens_consumed,
      decision: decision.tokens_consumed,
      analysis: analyses.reduce((sum, item) => sum + item.response.tokens_consumed, 0),
      narrative: narrativeUnderstanding.tokens_consumed,
      total: 330,
    } as FrameInferencePipelineResult['tokens'],
    ...overrides,
  }
}

export const makeMergeVideoContextOutput = (overrides: Partial<MergeVideoContextOutput> = {}): MergeVideoContextOutput => {
  const pipelineResult = makePipelineResult()
  return {
    videoContext: pipelineResult.videoContext,
    pipelineResult,
    ...overrides,
  }
}

export const makeScriptResponse = (overrides: Partial<GenerateScriptResponse> = {}): GenerateScriptResponse => ({
  items: [
    { _id: 1, text: '解说第一句', start: 0, end: 1.5, org: '' },
    { _id: 2, text: '', start: 1.5, end: 3, org: '原片对白' },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  model: 'script-model',
  request_id: 'script-request-1',
  ...overrides,
})

export const makeGenerateNarrationScriptOutput = (
  overrides: Partial<GenerateNarrationScriptOutput> = {}
): GenerateNarrationScriptOutput => {
  const scriptResponse = Object.prototype.hasOwnProperty.call(overrides, 'scriptResponse')
    ? overrides.scriptResponse
    : makeScriptResponse()
  return {
    scriptResponse,
    pipelineResult: makePipelineResult({
      ...(scriptResponse ? { scriptResponse } : {}),
      tokens: {
        ...makePipelineResult().tokens,
        script: scriptResponse?.usage.total_tokens ?? 0,
        total: 316,
      } as FrameInferencePipelineResult['tokens'],
    }),
    ...overrides,
  }
}

export const makeMatchNarrationVisualsOutput = (
  overrides: Partial<MatchNarrationVisualsOutput> = {}
): MatchNarrationVisualsOutput => {
  const scriptResponse = overrides.scriptResponse ?? makeScriptResponse()
  return {
    scriptResponse,
    pipelineResult: makePipelineResult({
      scriptResponse,
      tokens: {
        ...makePipelineResult().tokens,
        script: scriptResponse.usage.total_tokens,
        total: 316,
      } as FrameInferencePipelineResult['tokens'],
    }),
    ...overrides,
  }
}

export const makeVoiceoverResult = (overrides: Partial<FrameVoiceoverResult> = {}): FrameVoiceoverResult => ({
  items: makeScriptResponse().items,
  audioStates: {
    1: {
      success: true,
      audioBlob: new Blob(['audio'], { type: 'audio/mpeg' }),
      audioUrl: 'blob:voiceover-1',
      duration: 1.2,
    },
  },
  voiceUri: 'voice://basic',
  voiceName: '基础音色',
  voiceType: 'basic',
  serviceLevel: 'basic',
  generatedCount: 1,
  ...overrides,
})

export const makeGenerateVoiceoverOutput = (overrides: Partial<GenerateVoiceoverOutput> = {}): GenerateVoiceoverOutput => {
  const voiceoverResult = overrides.voiceoverResult ?? makeVoiceoverResult()
  return {
    voiceoverResult,
    pipelineResult: makePipelineResult({ voiceoverResult }),
    ...overrides,
  }
}

export const makeFinalVideoResult = (overrides: Partial<FrameFinalVideoResult> = {}): FrameFinalVideoResult => ({
  name: 'final.mp4',
  size: 10,
  type: 'video/mp4',
  duration: 3,
  artifact: makeArtifact({
    key: 'projects/project-1/final_video/final.mp4',
    name: 'final.mp4',
    type: 'video/mp4',
    size: 10,
    duration: 3,
  }),
  backgroundMusic: null,
  ...overrides,
})

export const makeComposeFinalVideoOutput = (overrides: Partial<ComposeFinalVideoOutput> = {}): ComposeFinalVideoOutput => {
  const finalVideo = overrides.finalVideo ?? makeFinalVideoResult()
  return {
    file: new File(['final'], 'final.mp4', { type: 'video/mp4' }),
    finalVideo,
    pipelineResult: makePipelineResult({ finalVideoResult: finalVideo }),
    ...overrides,
  }
}

export const makeProject = (overrides: Partial<Project> = {}): Project => ({
  id: 'project-1',
  owner_id: 'owner-1',
  name: '逐帧项目',
  is_public: false,
  tags: [],
  status: 'draft',
  created_at: '2026-05-12T00:00:00.000Z',
  updated_at: '2026-05-12T00:00:00.000Z',
  metadata: {},
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
  ...overrides,
})

export const makeRecords = (records: FrameDebugStepRecords = {}) => records

export const successRecord = <Output>(id: FrameDebugStepRecord['id'], output: Output): FrameDebugStepRecord<unknown, Output> => ({
  id,
  status: 'success',
  output,
})

export const makeRuntimeContext = ({
  records = {},
  projectId = 'project-1',
  files = [],
  config = {},
  projectName,
  projectMetadata,
  signal,
  updateStepProgress,
  updateStepLog,
  appendStepLog,
}: Omit<Partial<FrameWorkflowContext>, 'config'> & {
  config?: Partial<FrameWorkflowContext['config']>
  records?: FrameDebugStepRecords
  signal?: AbortSignal
  updateStepProgress?: FrameWorkflowRuntimeContext['updateStepProgress']
  updateStepLog?: FrameWorkflowRuntimeContext['updateStepLog']
  appendStepLog?: FrameWorkflowRuntimeContext['appendStepLog']
} = {}): FrameWorkflowRuntimeContext => ({
  projectId,
  files,
  projectName,
  projectMetadata,
  config: {
    outputLanguage: 'zh-CN',
    defaultNFrames: 10,
    maxDecisions: 8,
    narrationStyleId: 'style-1',
    narrationStyleTitle: '电影解说',
    wordCount: '800',
    voice: 'voice://basic',
    backgroundMusic: null,
    backgroundMusicUrl: null,
    ...config,
  },
  records,
  signal,
  updateStepProgress,
  updateStepLog,
  appendStepLog,
})
