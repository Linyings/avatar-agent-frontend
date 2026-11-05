import type { FrameWorkflowContext } from '../types'

export const validateFrameWorkflowContext = (context: FrameWorkflowContext) => {
  if (!context.projectId.trim()) {
    throw new Error('缺少项目 ID，无法启动通用模式工作流')
  }
  return context
}
