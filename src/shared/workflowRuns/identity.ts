export interface WorkflowRequestIdentity {
  workflowRunId: string
  workflowStepId: string
  workflowInputHash: string
  clientInstanceId: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MACHINE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
const INPUT_HASH_PATTERN = /^[a-f0-9]{64}$/i
const CLIENT_INSTANCE_ID_KEY = 'narrato.workflow.client_instance_id'
let memoryClientInstanceId: string | undefined

export function validateWorkflowClientInstanceId(clientInstanceId: string): string {
  if (!MACHINE_ID_PATTERN.test(clientInstanceId) || clientInstanceId.length > 128) {
    throw new Error('Invalid workflow identity')
  }
  return clientInstanceId
}

export function validateWorkflowRequestIdentity(identity: WorkflowRequestIdentity): WorkflowRequestIdentity {
  if (
    !UUID_PATTERN.test(identity.workflowRunId)
    || !MACHINE_ID_PATTERN.test(identity.workflowStepId)
    || identity.workflowStepId.length > 128
    || !INPUT_HASH_PATTERN.test(identity.workflowInputHash)
    || !MACHINE_ID_PATTERN.test(identity.clientInstanceId)
    || identity.clientInstanceId.length > 128
  ) {
    throw new Error('Invalid workflow identity')
  }
  return { ...identity, workflowInputHash: identity.workflowInputHash.toLowerCase() }
}

function identityFields(identity: WorkflowRequestIdentity): Record<string, string> {
  const valid = validateWorkflowRequestIdentity(identity)
  return {
    workflow_run_id: valid.workflowRunId,
    workflow_step_id: valid.workflowStepId,
    workflow_input_hash: valid.workflowInputHash,
    client_instance_id: valid.clientInstanceId,
  }
}

export function withWorkflowIdentityInJson<T extends Record<string, unknown>>(
  value: T,
  identity: WorkflowRequestIdentity,
): T & Record<string, string> {
  return { ...value, ...identityFields(identity) }
}

export function withWorkflowIdentityInFormData(value: FormData, identity: WorkflowRequestIdentity): FormData {
  const copy = new FormData()
  value.forEach((entry, key) => copy.append(key, entry))
  Object.entries(identityFields(identity)).forEach(([key, entry]) => copy.set(key, entry))
  return copy
}

export function withWorkflowIdentityInQuery(value: URLSearchParams, identity: WorkflowRequestIdentity): URLSearchParams {
  const copy = new URLSearchParams(value)
  Object.entries(identityFields(identity)).forEach(([key, entry]) => copy.set(key, entry))
  return copy
}

function generateClientInstanceId(): string {
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`
  return `web.${randomId.replace(/[^A-Za-z0-9._:-]/g, '')}`
}

export function getWorkflowClientInstanceId(): string {
  try {
    const stored = sessionStorage.getItem(CLIENT_INSTANCE_ID_KEY)
    if (stored && MACHINE_ID_PATTERN.test(stored) && stored.length <= 128) {
      memoryClientInstanceId = stored
      return stored
    }
    const generated = generateClientInstanceId()
    sessionStorage.setItem(CLIENT_INSTANCE_ID_KEY, generated)
    memoryClientInstanceId = generated
    return generated
  } catch {
    memoryClientInstanceId ??= generateClientInstanceId()
    return memoryClientInstanceId
  }
}
