import { describe, expect, it } from 'vitest'
import { validateFrameWorkflowContext } from '../../steps/step_0_init'
import { makeRuntimeContext } from './fixtures'

describe('workflow/frame/steps/step_0_init', () => {
  it('会保留有效的通用模式工作流上下文', () => {
    const context = makeRuntimeContext()

    expect(validateFrameWorkflowContext(context)).toBe(context)
  })

  it('缺少项目 ID 时会阻止启动工作流', () => {
    expect(() => validateFrameWorkflowContext(makeRuntimeContext({ projectId: '   ' }))).toThrow(
      '缺少项目 ID，无法启动通用模式工作流'
    )
  })
})
