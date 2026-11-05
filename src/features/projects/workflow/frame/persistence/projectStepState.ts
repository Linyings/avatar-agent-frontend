import ProjectService from '@/features/projects/services/projectService'
import { frameStepKeyById } from '../constants'
import type { FrameWorkflowStep } from '../types'
import type { ProjectWorkflow } from '@/features/projects/types/project'

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const mergeWorkflowStagePatch = (
  stages: ProjectWorkflow['stages'],
  patch: Partial<ProjectWorkflow['stages']> | undefined,
  now: string
): ProjectWorkflow['stages'] => {
  if (!patch || Object.keys(patch).length === 0) {
    return stages
  }

  return Object.entries(patch).reduce<ProjectWorkflow['stages']>((nextStages, [stageKey, patchStage]) => {
    if (!patchStage) return nextStages
    const currentStage = nextStages[stageKey] ?? {}
    const currentData = currentStage.data
    const patchData = patchStage.data
    const data = isPlainObject(currentData) && isPlainObject(patchData)
      ? { ...currentData, ...patchData }
      : patchData ?? currentData

    nextStages[stageKey] = {
      ...currentStage,
      ...patchStage,
      data,
      updated_at: patchStage.updated_at ?? now,
    }
    return nextStages
  }, { ...stages })
}

export const persistFrameWorkflowStepState = async (
  projectId: string,
  step: FrameWorkflowStep,
  status: 'running' | 'success' | 'error' | 'cancelled',
  payload: Record<string, unknown>,
  stagePatch?: Partial<ProjectWorkflow['stages']>
) => {
  const stepKey = frameStepKeyById[step.id]
  if (!stepKey) return
  try {
    const project = await ProjectService.getProject(projectId)
    const now = new Date().toISOString()
    const workflow = project.workflow
    const stages = mergeWorkflowStagePatch(workflow.stages, stagePatch, now)
    await ProjectService.updateProject(projectId, {
      status: status === 'success' && step.id === 'persist-project' ? 'completed' : 'processing',
      workflow: {
        ...workflow,
        status: status === 'success' && step.id === 'persist-project' ? 'completed' : 'processing',
        current_step: stepKey,
        current_step_id: step.id,
        current_step_index: Object.values(frameStepKeyById).indexOf(stepKey) + 1,
        revision: workflow.revision + 1,
        steps: {
          ...workflow.steps,
          [stepKey]: {
            ...(workflow.steps as Record<string, unknown>)[stepKey] as Record<string, unknown> | undefined,
            status,
            updated_at: now,
            ...payload,
          },
        },
        stages,
      },
    })
  } catch (error) {
    console.warn('[FrameWorkflowStepState] 保存 workflow 步骤状态失败:', {
      projectId,
      step: step.id,
      status,
      error,
    })
  }
}
