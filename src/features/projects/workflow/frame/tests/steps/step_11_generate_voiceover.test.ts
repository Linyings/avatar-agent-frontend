import { beforeEach, describe, expect, it, vi } from 'vitest'
import { step11GenerateVoiceover } from '../../steps/step_11_generate_voiceover'
import {
  makeMatchNarrationVisualsOutput,
  makeRuntimeContext,
  makeVoiceoverResult,
  successRecord,
} from './fixtures'

const mocks = vi.hoisted(() => ({
  resolveFrameVoiceSelection: vi.fn(),
  generateFrameNarrationVoiceover: vi.fn(),
}))

vi.mock('@/features/projects/services/material/frameInferencePipelineService', () => ({
  resolveFrameVoiceSelection: mocks.resolveFrameVoiceSelection,
  generateFrameNarrationVoiceover: mocks.generateFrameNarrationVoiceover,
}))

describe('workflow/frame/steps/step_11_generate_voiceover', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveFrameVoiceSelection.mockResolvedValue({
      uri: 'voice://basic',
      name: '基础音色',
      type: 'basic',
      serviceLevel: 'basic',
    })
    mocks.generateFrameNarrationVoiceover.mockResolvedValue(makeVoiceoverResult())
  })

  it('buildInput 会读取脚本 items 和当前音色配置', () => {
    const matched = makeMatchNarrationVisualsOutput()
    const context = makeRuntimeContext({
      config: { voice: 'voice://basic' },
      records: {
        'match-narration-visuals': successRecord('match-narration-visuals', matched),
      },
    })

    expect(step11GenerateVoiceover.buildInput(context)).toEqual({
      scriptItems: matched.scriptResponse.items,
      voice: 'voice://basic',
    })
  })

  it('缺少脚本输出时会阻止继续执行', () => {
    expect(() => step11GenerateVoiceover.buildInput(makeRuntimeContext())).toThrow(
      '缺少依赖步骤 match-narration-visuals'
    )
  })

  it('run 会解析音色、转换脚本格式并调用逐帧配音生成', async () => {
    const matched = makeMatchNarrationVisualsOutput()
    const voiceoverResult = makeVoiceoverResult({ generatedCount: 1 })
    const controller = new AbortController()
    const context = makeRuntimeContext({
      signal: controller.signal,
      config: { voice: 'voice://basic' },
      records: {
        'match-narration-visuals': successRecord('match-narration-visuals', matched),
      },
      updateStepProgress: vi.fn(),
    })
    mocks.generateFrameNarrationVoiceover.mockImplementation(async (input) => {
      input.onProgress?.({ step: 'generate_voice', percentage: 98, message: '正在生成解说配音 1/1' })
      return voiceoverResult
    })

    const output = await step11GenerateVoiceover.run(step11GenerateVoiceover.buildInput(context), context)

    expect(mocks.resolveFrameVoiceSelection).toHaveBeenCalledWith('voice://basic')
    expect(mocks.generateFrameNarrationVoiceover).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      voiceUri: 'voice://basic',
      voiceName: '基础音色',
      voiceType: 'basic',
      serviceLevel: 'basic',
      signal: controller.signal,
      onProgress: expect.any(Function),
      scriptItems: [
        expect.objectContaining({ _id: 1, narration: '解说第一句', OST: 0 }),
        expect.objectContaining({ _id: 2, picture: '原片对白', OST: 1 }),
      ],
    }))
    expect(output).toEqual({
      voiceoverResult,
      pipelineResult: {
        ...matched.pipelineResult,
        voiceoverResult,
      },
    })
    expect(context.updateStepProgress).toHaveBeenLastCalledWith('generate-voiceover', {
      percentage: 100,
      message: '解说配音已完成',
    })
  })

  it('已取消时不会解析音色或生成配音', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(step11GenerateVoiceover.run({}, makeRuntimeContext({ signal: controller.signal }))).rejects.toThrow(
      '解说配音已取消'
    )
    expect(mocks.resolveFrameVoiceSelection).not.toHaveBeenCalled()
    expect(mocks.generateFrameNarrationVoiceover).not.toHaveBeenCalled()
  })

  it('summarizeOutput 会汇总配音数量、音色和脚本数量', () => {
    expect(step11GenerateVoiceover.summarizeOutput({
      voiceoverResult: makeVoiceoverResult(),
      pipelineResult: makeMatchNarrationVisualsOutput().pipelineResult,
    })).toEqual({
      generated: 1,
      voice: 'voice://basic',
      voice_name: '基础音色',
      service_level: 'basic',
      script_items: 2,
    })
  })
})
