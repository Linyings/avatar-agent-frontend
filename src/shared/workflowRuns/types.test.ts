import { describe, expectTypeOf, it } from 'vitest'
import type {
  CreatePCWorkflowRunInput,
  PCProjectNameSyncResult,
  PCWorkflowProjectNameMapping,
  WorkflowRun,
  WorkflowRunCancelInput,
  WorkflowRunResumeInput,
  WorkflowStepExecution,
} from './types'

describe('workflow run public types', () => {
  it('exposes the backend run and step metadata needed for recovery', () => {
    expectTypeOf<WorkflowRun['user_id']>().toEqualTypeOf<string>()
    expectTypeOf<WorkflowRun['created_at']>().toEqualTypeOf<string>()
    expectTypeOf<WorkflowRun['last_error_code']>().toEqualTypeOf<string | null>()
    expectTypeOf<WorkflowStepExecution['attempt_count']>().toEqualTypeOf<number>()
    expectTypeOf<WorkflowStepExecution['lease_owner']>().toEqualTypeOf<string | null>()
    expectTypeOf<WorkflowStepExecution['created_at']>().toEqualTypeOf<string>()
  })

  it('publishes resume and cancel input models', () => {
    expectTypeOf<WorkflowRunResumeInput>().toEqualTypeOf<Readonly<Record<string, never>>>()
    expectTypeOf<WorkflowRunCancelInput>().toEqualTypeOf<Readonly<Record<string, never>>>()
  })

  it('publishes PC project-name create and sync contracts', () => {
    expectTypeOf<CreatePCWorkflowRunInput['clientProjectName']>().toEqualTypeOf<string>()
    expectTypeOf<WorkflowRun['client_project_name']>().toEqualTypeOf<string>()
    expectTypeOf<PCWorkflowProjectNameMapping>().toEqualTypeOf<{
      clientTaskId: string
      projectName: string
    }>()
    expectTypeOf<PCProjectNameSyncResult>().toEqualTypeOf<{
      matched: number
      workflow_runs_updated: number
      ledger_records_updated: number
    }>()
  })
})
