import type { WorkflowStepStatus } from './types'
import { validateWorkflowClientInstanceId } from './identity'

export const WORKFLOW_CHECKPOINT_STORAGE_PREFIX = 'narrato.workflow.checkpoints'
export const WORKFLOW_CHECKPOINT_TTL_MS = 24 * 60 * 60 * 1000

const DATABASE_NAME = 'narrato-workflow-checkpoints'
const DATABASE_VERSION = 1
const OBJECT_STORE_NAME = 'workflow-records'
const CHECKPOINT_KEY_PREFIX = 'checkpoint:'
const FINALIZATION_KEY_PREFIX = 'finalization:'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INPUT_HASH_PATTERN = /^[a-f0-9]{64}$/i
const STEP_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
const WORKFLOW_STEP_STATUSES: ReadonlySet<WorkflowStepStatus> = new Set([
  'running',
  'succeeded',
  'interrupted',
  'failed',
  'blocked',
])

export interface WorkflowCheckpointError {
  code?: string
  message?: string
}

export interface WorkflowCheckpointStep {
  executionId?: string
  stepId: string
  status: WorkflowStepStatus
  startedAt?: string
  completedAt?: string
  updatedAt?: string
  summary?: string
  progress?: number
  error?: WorkflowCheckpointError
}

export interface WorkflowCheckpointInput {
  projectId: string
  workflowRunId: string
  workflowInputHash: string
  clientInstanceId: string
  steps: WorkflowCheckpointStep[]
  updatedAt?: string
  interrupted?: boolean
  interruptedAt?: string
}

export interface WorkflowCheckpoint extends Required<Omit<WorkflowCheckpointInput, 'interruptedAt'>> {
  interruptedAt?: string
}

export interface WorkflowFinalizationOutboxInput {
  projectId: string
  workflowRunId: string
  workflowInputHash: string
  clientInstanceId: string
  finalResultAt: string
  updatedAt?: string
}

export type WorkflowFinalizationOutboxEntry = Required<WorkflowFinalizationOutboxInput>

export interface WorkflowCheckpointStore {
  saveCheckpoint(input: WorkflowCheckpointInput): Promise<WorkflowCheckpoint>
  getCheckpoint(projectId: string): Promise<WorkflowCheckpoint | null>
  removeCheckpoint(projectId: string): Promise<void>
  markInterrupted(projectId: string): Promise<WorkflowCheckpoint | null>
  saveFinalizationOutbox(input: WorkflowFinalizationOutboxInput): Promise<WorkflowFinalizationOutboxEntry>
  listFinalizationOutbox(): Promise<WorkflowFinalizationOutboxEntry[]>
  removeFinalizationOutbox(projectId: string): Promise<void>
}

export interface WorkflowCheckpointStoreOptions {
  indexedDb?: IDBFactory | null
  storage?: Storage | null
  now?: () => Date
}

export interface WorkflowStepResultScope {
  projectId: string
  workflowRunId: string
  workflowInputHash: string
  stepId: string
}

interface StoredRecord {
  key: string
  value: unknown
}

interface PersistenceBackend {
  get(key: string): Promise<unknown | null>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
  list(prefix: string): Promise<unknown[]>
}

const memoryRecords = new Map<string, unknown>()

class MemoryBackend implements PersistenceBackend {
  async get(key: string): Promise<unknown | null> {
    return memoryRecords.get(key) ?? null
  }

  async set(key: string, value: unknown): Promise<void> {
    memoryRecords.set(key, value)
  }

  async remove(key: string): Promise<void> {
    memoryRecords.delete(key)
  }

  async list(prefix: string): Promise<unknown[]> {
    return Array.from(memoryRecords.entries())
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value)
  }
}

class WebStorageBackend implements PersistenceBackend {
  private readonly storage: Storage

  constructor(storage: Storage) {
    this.storage = storage
  }

  async get(key: string): Promise<unknown | null> {
    const value = this.storage.getItem(storageKey(key))
    if (value === null) return null
    try {
      return JSON.parse(value) as unknown
    } catch {
      this.storage.removeItem(storageKey(key))
      return null
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    this.storage.setItem(storageKey(key), JSON.stringify(value))
  }

  async remove(key: string): Promise<void> {
    this.storage.removeItem(storageKey(key))
  }

  async list(prefix: string): Promise<unknown[]> {
    const prefixKey = storageKey(prefix)
    const values: unknown[] = []
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index)
      if (!key?.startsWith(prefixKey)) continue
      const value = await this.get(key.slice(`${WORKFLOW_CHECKPOINT_STORAGE_PREFIX}:`.length))
      if (value !== null) values.push(value)
    }
    return values
  }
}

class IndexedDbBackend implements PersistenceBackend {
  private readonly database: IDBDatabase

  private constructor(database: IDBDatabase) {
    this.database = database
  }

  static open(indexedDb: IDBFactory): Promise<IndexedDbBackend> {
    return new Promise((resolve, reject) => {
      let request: IDBOpenDBRequest
      try {
        request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION)
      } catch (error) {
        reject(error)
        return
      }
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(OBJECT_STORE_NAME)) {
          database.createObjectStore(OBJECT_STORE_NAME, { keyPath: 'key' })
        }
      }
      request.onsuccess = () => resolve(new IndexedDbBackend(request.result))
      request.onerror = () => reject(request.error ?? new Error('Unable to open workflow checkpoint database'))
      request.onblocked = () => reject(new Error('Workflow checkpoint database is blocked'))
    })
  }

  async get(key: string): Promise<unknown | null> {
    const transaction = this.database.transaction(OBJECT_STORE_NAME, 'readonly')
    const result = await requestResult(transaction.objectStore(OBJECT_STORE_NAME).get(key)) as StoredRecord | undefined
    return result?.value ?? null
  }

  async set(key: string, value: unknown): Promise<void> {
    const transaction = this.database.transaction(OBJECT_STORE_NAME, 'readwrite')
    await requestResult(transaction.objectStore(OBJECT_STORE_NAME).put({ key, value } satisfies StoredRecord))
    await transactionResult(transaction)
  }

  async remove(key: string): Promise<void> {
    const transaction = this.database.transaction(OBJECT_STORE_NAME, 'readwrite')
    await requestResult(transaction.objectStore(OBJECT_STORE_NAME).delete(key))
    await transactionResult(transaction)
  }

  async list(prefix: string): Promise<unknown[]> {
    const transaction = this.database.transaction(OBJECT_STORE_NAME, 'readonly')
    const records = await requestResult(transaction.objectStore(OBJECT_STORE_NAME).getAll()) as StoredRecord[]
    return records
      .filter(({ key }) => key.startsWith(prefix))
      .map(({ value }) => value)
  }
}

class WorkflowCheckpointStoreImpl implements WorkflowCheckpointStore {
  private backendPromise: Promise<PersistenceBackend> | undefined
  private readonly clock: () => Date
  private readonly indexedDb: IDBFactory | null
  private readonly storage: Storage | null

  constructor(options: WorkflowCheckpointStoreOptions) {
    this.clock = options.now ?? (() => new Date())
    this.indexedDb = resolveIndexedDb(options)
    this.storage = resolveStorage(options)
  }

  async saveCheckpoint(input: WorkflowCheckpointInput): Promise<WorkflowCheckpoint> {
    const checkpoint = sanitizeCheckpoint(input, this.clock())
    await this.persist(checkpointKey(checkpoint.projectId), checkpoint)
    return checkpoint
  }

  async getCheckpoint(projectId: string): Promise<WorkflowCheckpoint | null> {
    assertUuid(projectId, 'project ID')
    const key = checkpointKey(projectId)
    const stored = await this.read(key)
    if (stored === null) return null

    let checkpoint: WorkflowCheckpoint
    try {
      checkpoint = sanitizeCheckpoint(stored as WorkflowCheckpointInput, this.clock())
    } catch {
      await this.remove(key)
      return null
    }
    if (isExpired(checkpoint.updatedAt, this.clock())) {
      await this.remove(key)
      return null
    }
    return checkpoint
  }

  async removeCheckpoint(projectId: string): Promise<void> {
    assertUuid(projectId, 'project ID')
    await this.remove(checkpointKey(projectId))
  }

  async markInterrupted(projectId: string): Promise<WorkflowCheckpoint | null> {
    const checkpoint = await this.getCheckpoint(projectId)
    if (!checkpoint) return null
    const interruptedAt = timestamp(this.clock(), 'current time')
    return this.saveCheckpoint({
      ...checkpoint,
      interrupted: true,
      interruptedAt,
      updatedAt: interruptedAt,
    })
  }

  async saveFinalizationOutbox(input: WorkflowFinalizationOutboxInput): Promise<WorkflowFinalizationOutboxEntry> {
    const entry = sanitizeFinalizationOutbox(input, this.clock())
    await this.persist(finalizationKey(entry.projectId), entry)
    return entry
  }

  async listFinalizationOutbox(): Promise<WorkflowFinalizationOutboxEntry[]> {
    const values = await this.list(FINALIZATION_KEY_PREFIX)
    const entries: WorkflowFinalizationOutboxEntry[] = []
    for (const value of values) {
      try {
        entries.push(sanitizeFinalizationOutbox(value as WorkflowFinalizationOutboxInput, this.clock()))
      } catch {
        // Invalid values are ignored. They cannot be replayed safely.
      }
    }
    return entries.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
  }

  async removeFinalizationOutbox(projectId: string): Promise<void> {
    assertUuid(projectId, 'project ID')
    await this.remove(finalizationKey(projectId))
  }

  async saveStepResult(scope: WorkflowStepResultScope, value: unknown): Promise<void> {
    const key = stepResultKey(scope)
    // Results are separate from the small workflow/status checkpoint. Clean up
    // expired results as new ones arrive so abandoned runs do not accumulate.
    for (const entry of await this.list('result:')) {
      if (isRecord(entry) && typeof entry.key === 'string' && entry.key.startsWith('result:')
        && typeof entry.updatedAt === 'string' && isExpired(entry.updatedAt, this.clock())) {
        await this.remove(entry.key)
      }
    }
    await this.persist(key, { key, value, updatedAt: this.clock().toISOString() })
  }

  async getStepResult(scope: WorkflowStepResultScope): Promise<unknown | null> {
    const key = stepResultKey(scope)
    const stored = await this.read(key)
    if (!isRecord(stored)) return null
    if (typeof stored.updatedAt !== 'string' || !Number.isFinite(Date.parse(stored.updatedAt))
      || isExpired(stored.updatedAt, this.clock())) {
      await this.remove(key)
      return null
    }
    return stored.value ?? null
  }

  private backend(): Promise<PersistenceBackend> {
    this.backendPromise ??= this.createBackend()
    return this.backendPromise
  }

  private async createBackend(): Promise<PersistenceBackend> {
    if (this.indexedDb) {
      try {
        return await IndexedDbBackend.open(this.indexedDb)
      } catch {
        // IndexedDB can be disabled by privacy settings or unavailable in a webview.
      }
    }
    return this.fallbackBackend()
  }

  private fallbackBackend(): PersistenceBackend {
    return this.storage ? new WebStorageBackend(this.storage) : new MemoryBackend()
  }

  private async usingBackend<T>(operation: (backend: PersistenceBackend) => Promise<T>): Promise<T> {
    const backend = await this.backend()
    try {
      return await operation(backend)
    } catch (error) {
      if (!(backend instanceof IndexedDbBackend)) throw error
      const fallback = this.fallbackBackend()
      this.backendPromise = Promise.resolve(fallback)
      return operation(fallback).catch(() => { throw error })
    }
  }

  private read(key: string): Promise<unknown | null> {
    return this.usingBackend((backend) => backend.get(key))
  }

  private persist(key: string, value: unknown): Promise<void> {
    return this.usingBackend((backend) => backend.set(key, value))
  }

  private remove(key: string): Promise<void> {
    return this.usingBackend((backend) => backend.remove(key))
  }

  private list(prefix: string): Promise<unknown[]> {
    return this.usingBackend((backend) => backend.list(prefix))
  }
}

export function createWorkflowCheckpointStore(options: WorkflowCheckpointStoreOptions = {}): WorkflowCheckpointStore {
  return new WorkflowCheckpointStoreImpl(options)
}

export function createWorkflowStepResultStore(options: WorkflowCheckpointStoreOptions = {}) {
  const store = new WorkflowCheckpointStoreImpl(options)
  return {
    saveStepResult: store.saveStepResult.bind(store),
    getStepResult: store.getStepResult.bind(store),
  }
}

function stepResultKey(scope: WorkflowStepResultScope): string {
  assertUuid(scope.projectId, 'project ID')
  assertUuid(scope.workflowRunId, 'workflow run ID')
  const hash = readInputHash(scope.workflowInputHash)
  if (!STEP_ID_PATTERN.test(scope.stepId) || scope.stepId.length > 128) throw new Error('Invalid result step ID')
  return `result:${scope.projectId}:${scope.workflowRunId}:${hash}:${scope.stepId}`
}

function checkpointKey(projectId: string): string {
  return `${CHECKPOINT_KEY_PREFIX}${projectId}`
}

function finalizationKey(projectId: string): string {
  return `${FINALIZATION_KEY_PREFIX}${projectId}`
}

function storageKey(key: string): string {
  return `${WORKFLOW_CHECKPOINT_STORAGE_PREFIX}:${key}`
}

function resolveIndexedDb(options: WorkflowCheckpointStoreOptions): IDBFactory | null {
  if ('indexedDb' in options) return options.indexedDb ?? null
  try {
    return globalThis.indexedDB ?? null
  } catch {
    return null
  }
}

function resolveStorage(options: WorkflowCheckpointStoreOptions): Storage | null {
  if ('storage' in options) return options.storage ?? null
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Workflow checkpoint database request failed'))
  })
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Workflow checkpoint database transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Workflow checkpoint database transaction aborted'))
  })
}

function sanitizeCheckpoint(input: WorkflowCheckpointInput, currentTime: Date): WorkflowCheckpoint {
  if (!isRecord(input)) throw new Error('Invalid workflow checkpoint identity')
  const projectId = readUuid(input, 'projectId')
  const workflowRunId = readUuid(input, 'workflowRunId')
  const workflowInputHash = readInputHash(input.workflowInputHash)
  const clientInstanceId = readClientInstanceId(input.clientInstanceId)
  if (!Array.isArray(input.steps)) throw new Error('Invalid workflow checkpoint steps')

  const interrupted = input.interrupted === true
  const updatedAt = input.updatedAt === undefined ? timestamp(currentTime, 'current time') : timestamp(input.updatedAt, 'updatedAt')
  const checkpoint: WorkflowCheckpoint = {
    projectId,
    workflowRunId,
    workflowInputHash,
    clientInstanceId,
    steps: input.steps.map(sanitizeStep),
    updatedAt,
    interrupted,
  }
  if (interrupted) {
    checkpoint.interruptedAt = input.interruptedAt === undefined
      ? updatedAt
      : timestamp(input.interruptedAt, 'interruptedAt')
  }
  return checkpoint
}

function sanitizeFinalizationOutbox(input: WorkflowFinalizationOutboxInput, currentTime: Date): WorkflowFinalizationOutboxEntry {
  if (!isRecord(input)) throw new Error('Invalid workflow finalization outbox identity')
  return {
    projectId: readUuid(input, 'projectId'),
    workflowRunId: readUuid(input, 'workflowRunId'),
    workflowInputHash: readInputHash(input.workflowInputHash),
    clientInstanceId: readClientInstanceId(input.clientInstanceId),
    finalResultAt: timestamp(input.finalResultAt, 'finalResultAt'),
    updatedAt: input.updatedAt === undefined ? timestamp(currentTime, 'current time') : timestamp(input.updatedAt, 'updatedAt'),
  }
}

function sanitizeStep(input: WorkflowCheckpointStep): WorkflowCheckpointStep {
  if (!isRecord(input) || typeof input.stepId !== 'string' || !STEP_ID_PATTERN.test(input.stepId) || input.stepId.length > 128) {
    throw new Error('Invalid workflow checkpoint step')
  }
  if (typeof input.status !== 'string' || !WORKFLOW_STEP_STATUSES.has(input.status as WorkflowStepStatus)) {
    throw new Error('Invalid workflow checkpoint step status')
  }
  const step: WorkflowCheckpointStep = {
    stepId: input.stepId,
    status: input.status as WorkflowStepStatus,
  }
  if (input.executionId !== undefined) step.executionId = readUuid({ executionId: input.executionId }, 'executionId')
  if (input.startedAt !== undefined) step.startedAt = timestamp(input.startedAt, 'startedAt')
  if (input.completedAt !== undefined) step.completedAt = timestamp(input.completedAt, 'completedAt')
  if (input.updatedAt !== undefined) step.updatedAt = timestamp(input.updatedAt, 'updatedAt')
  if (typeof input.summary === 'string') step.summary = boundedText(input.summary, 512)
  if (typeof input.progress === 'number' && Number.isFinite(input.progress) && input.progress >= 0 && input.progress <= 100) {
    step.progress = input.progress
  }
  const error = sanitizeError(input.error)
  if (error) step.error = error
  return step
}

function sanitizeError(input: unknown): WorkflowCheckpointError | undefined {
  if (!isRecord(input)) return undefined
  const error: WorkflowCheckpointError = {}
  if (typeof input.code === 'string') error.code = boundedText(input.code, 128)
  if (typeof input.message === 'string') error.message = boundedText(input.message, 512)
  return Object.keys(error).length > 0 ? error : undefined
}

function readUuid(value: Record<string, unknown>, key: string): string {
  const candidate = value[key]
  if (typeof candidate !== 'string' || !UUID_PATTERN.test(candidate)) {
    throw new Error('Invalid workflow checkpoint identity')
  }
  return candidate.toLowerCase()
}

function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) throw new Error(`Invalid workflow checkpoint ${label}`)
}

function readInputHash(value: unknown): string {
  if (typeof value !== 'string' || !INPUT_HASH_PATTERN.test(value)) {
    throw new Error('Invalid workflow checkpoint identity')
  }
  return value.toLowerCase()
}

function readClientInstanceId(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid workflow checkpoint identity')
  try {
    return validateWorkflowClientInstanceId(value)
  } catch {
    throw new Error('Invalid workflow checkpoint identity')
  }
}

function timestamp(value: Date | string, label: string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid workflow checkpoint ${label}`)
  return date.toISOString()
}

function boundedText(value: string, maximumLength: number): string {
  return value.slice(0, maximumLength)
}

function isExpired(updatedAt: string, currentTime: Date): boolean {
  return currentTime.getTime() - new Date(updatedAt).getTime() >= WORKFLOW_CHECKPOINT_TTL_MS
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
