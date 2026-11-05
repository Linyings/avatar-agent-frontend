import type { FrameDebugStepId } from '../types'
import type { FrameDebugRun } from '../types'

export interface FrameDebugPreset {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  config: Record<string, unknown>
  stepInputs: Partial<Record<FrameDebugStepId, unknown>>
}

export interface FrameDebugStorageState {
  presets: FrameDebugPreset[]
  runs: FrameDebugRun[]
}

const VERSION = 'v1'
const DEFAULT_HISTORY_LIMIT = 10
const ASSET_DB_NAME = 'narrato-frame-debug-assets'
const ASSET_DB_VERSION = 1
const ASSET_STORE_NAME = 'timeline-images'

export const getFrameDebugStorageKey = (projectId: string) => `frame-debug:${projectId}:${VERSION}`

interface StoredFrameDebugAsset {
  key: string
  projectId: string
  runId: string
  stepId: FrameDebugStepId
  index: number
  blob: Blob
  name: string
  type: string
  size: number
  updatedAt: string
}

const hasIndexedDB = () => typeof indexedDB !== 'undefined'

const openAssetDB = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (!hasIndexedDB()) {
    reject(new Error('IndexedDB unavailable'))
    return
  }

  const request = indexedDB.open(ASSET_DB_NAME, ASSET_DB_VERSION)
  request.onupgradeneeded = () => {
    const db = request.result
    if (!db.objectStoreNames.contains(ASSET_STORE_NAME)) {
      db.createObjectStore(ASSET_STORE_NAME, { keyPath: 'key' })
    }
  }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
})

const withAssetStore = async <T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T> | void
) => {
  const db = await openAssetDB()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const transaction = db.transaction(ASSET_STORE_NAME, mode)
      const store = transaction.objectStore(ASSET_STORE_NAME)
      const request = callback(store)

      if (request) {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
      } else {
        transaction.oncomplete = () => resolve(undefined)
      }
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
    })
  } finally {
    db.close()
  }
}

export const getFrameDebugTimelineImageKey = (
  projectId: string,
  runId: string,
  index: number
) => `${projectId}:${runId}:timeline-image:${index}`

export const getFrameDebugMediaAssetKey = (
  projectId: string,
  runId: string,
  stepId: FrameDebugStepId
) => `${projectId}:${runId}:${stepId}:media`

const isFileLike = (value: unknown): value is File => (
  typeof File !== 'undefined' && value instanceof File
)

const isBlobLike = (value: unknown): value is Blob => (
  typeof Blob !== 'undefined' && value instanceof Blob
)

const fileMetadata = (file: File) => ({
  __kind: 'File',
  name: file.name,
  size: file.size,
  type: file.type,
  lastModified: file.lastModified,
  reselectRequired: true,
})

const blobMetadata = (blob: Blob) => ({
  __kind: 'Blob',
  size: blob.size,
  type: blob.type,
  reselectRequired: true,
})

export const sanitizeFrameDebugValue = (value: unknown): unknown => {
  if (isFileLike(value)) return fileMetadata(value)
  if (isBlobLike(value)) return blobMetadata(value)
  if (typeof value === 'string') return value.startsWith('blob:') ? '[object-url-stripped]' : value
  if (Array.isArray(value)) return value.map(sanitizeFrameDebugValue)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeFrameDebugValue(item)])
  )
}

const recordValue = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' ? value as Record<string, unknown> : null
)

const compactLongText = (value: unknown, maxLength = 4000) => {
  if (typeof value !== 'string') return value
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}\n...[truncated ${value.length - maxLength} chars]`
}

const compactTimelineDecisionRequest = (value: unknown) => {
  const request = recordValue(value)
  if (!request) return undefined
  const sanitized = sanitizeFrameDebugValue(request) as Record<string, unknown>

  return {
    ...sanitized,
    videoContext: compactLongText(request.videoContext),
    transcript: compactLongText(request.transcript),
  }
}

const compactTimelineDecisionChunk = (value: unknown) => {
  const chunk = recordValue(value)
  if (!chunk) return sanitizeFrameDebugValue(value)
  const sanitized = sanitizeFrameDebugValue(chunk) as Record<string, unknown>

  return {
    ...sanitized,
    request: compactTimelineDecisionRequest(chunk.request),
  }
}

const timelineImagesFromRun = (run: FrameDebugRun) => {
  const output = recordValue(run.records['generate-timeline-images']?.output)
  const images = output?.images
  return Array.isArray(images) ? images : []
}

const persistAsset = async (asset: StoredFrameDebugAsset) => {
  await withAssetStore('readwrite', (store) => { store.put(asset) })
}

export const persistTimelineImageAsset = async (
  projectId: string, runId: string, index: number, file: File,
): Promise<string | undefined> => {
  if (!hasIndexedDB()) return undefined
  const key = getFrameDebugTimelineImageKey(projectId, runId, index)
  await persistAsset({ key, projectId, runId, stepId: 'generate-timeline-images', index,
    blob: file, name: file.name, type: file.type, size: file.size, updatedAt: new Date().toISOString() })
  return key
}

const persistStepMediaAsset = async (
  projectId: string,
  run: FrameDebugRun,
  stepId: FrameDebugStepId
) => {
  const output = recordValue(run.records[stepId]?.output)
  const file = output?.file
  if (!output || !isBlobLike(file)) return

  const key = getFrameDebugMediaAssetKey(projectId, run.id, stepId)
  output.previewStorageKey = key

  await persistAsset({
    key,
    projectId,
    runId: run.id,
    stepId,
    index: 0,
    blob: file,
    name: isFileLike(file) ? file.name : `${stepId}-preview`,
    type: file.type || 'application/octet-stream',
    size: file.size,
    updatedAt: new Date().toISOString(),
  })
}

export const persistFrameDebugRunAssets = async (
  projectId: string,
  run: FrameDebugRun
): Promise<FrameDebugRun> => {
  if (!hasIndexedDB()) return run

  await Promise.all([
    persistStepMediaAsset(projectId, run, 'merge-videos'),
    persistStepMediaAsset(projectId, run, 'extract-audio'),
  ])

  const images = timelineImagesFromRun(run)
  if (images.length === 0) return run

  await Promise.all(images.map(async (item, index) => {
    const record = recordValue(item)
    const file = record?.file
    if (!record || !isBlobLike(file)) return

    const key = getFrameDebugTimelineImageKey(projectId, run.id, index)
    record.previewStorageKey = key

    const asset: StoredFrameDebugAsset = {
      key,
      projectId,
      runId: run.id,
      stepId: 'generate-timeline-images',
      index,
      blob: file,
      name: isFileLike(file) ? file.name : `timeline-view-${index + 1}.png`,
      type: file.type || 'image/png',
      size: file.size,
      updatedAt: new Date().toISOString(),
    }

    await persistAsset(asset)
  }))

  return run
}

export const loadFrameDebugAsset = async (key: string): Promise<Blob | null> => {
  if (!hasIndexedDB() || !key.trim()) return null

  try {
    const asset = await withAssetStore<StoredFrameDebugAsset>('readonly', (store) => store.get(key))
    return asset?.blob ?? null
  } catch {
    return null
  }
}

export const loadFrameDebugTimelineImage = loadFrameDebugAsset

const parseState = (raw: string | null): FrameDebugStorageState => {
  if (!raw) return { presets: [], runs: [] }
  try {
    const parsed = JSON.parse(raw) as Partial<FrameDebugStorageState>
    return {
      presets: Array.isArray(parsed.presets) ? parsed.presets : [],
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
    }
  } catch {
    return { presets: [], runs: [] }
  }
}

const writeState = (projectId: string, state: FrameDebugStorageState) => {
  localStorage.setItem(getFrameDebugStorageKey(projectId), JSON.stringify(sanitizeFrameDebugValue(state)))
}

const tryWriteState = (projectId: string, state: FrameDebugStorageState) => {
  try {
    writeState(projectId, state)
    return true
  } catch (error) {
    const name = error instanceof DOMException ? error.name : ''
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return false
    throw error
  }
}

const compactRecordOutput = (stepId: FrameDebugStepId, output: unknown) => {
  const record = recordValue(output)
  if (!record) return undefined

  if (stepId === 'merge-videos') {
    return {
      previewStorageKey: record.previewStorageKey,
      file: sanitizeFrameDebugValue(record.file),
      video: sanitizeFrameDebugValue(record.video),
    }
  }

  if (stepId === 'extract-audio') {
    return {
      previewStorageKey: record.previewStorageKey,
      file: sanitizeFrameDebugValue(record.file),
      audio: sanitizeFrameDebugValue(record.audio),
    }
  }

  if (stepId === 'generate-timeline-images') {
    const images = Array.isArray(record.images) ? record.images : []
    return {
      images: images.map((item) => {
        const image = recordValue(item)
        return {
          decisionIndex: image?.decisionIndex,
          previewStorageKey: image?.previewStorageKey,
          decision: sanitizeFrameDebugValue(image?.decision),
          nFrames: image?.nFrames,
          file: sanitizeFrameDebugValue(image?.file),
          image: sanitizeFrameDebugValue(image?.image),
        }
      }),
    }
  }

  if (stepId === 'decide-timeline-view') {
    const chunks = Array.isArray(record.chunks) ? record.chunks : []
    const failedChunks = Array.isArray(record.failed_chunks) ? record.failed_chunks : []
    return {
      success: record.success,
      provider: record.provider,
      model: record.model,
      analysis: sanitizeFrameDebugValue(record.analysis),
      decisions: sanitizeFrameDebugValue(record.decisions),
      strategy: sanitizeFrameDebugValue(record.strategy),
      chunks: chunks.map(compactTimelineDecisionChunk),
      failed_chunks: failedChunks.map(compactTimelineDecisionChunk),
      chunk_request_ids: sanitizeFrameDebugValue(record.chunk_request_ids),
      request_id: record.request_id,
      tokens_consumed: record.tokens_consumed,
      updated_at: record.updated_at,
    }
  }

  if (stepId === 'validate-subtitles') {
    return {
      transcription: sanitizeFrameDebugValue(record.transcription),
      subtitleResult: sanitizeFrameDebugValue(record.subtitleResult),
      subtitlePayload: sanitizeFrameDebugValue(record.subtitlePayload),
      initialVideoContext: sanitizeFrameDebugValue(record.initialVideoContext),
      validation: sanitizeFrameDebugValue(record.validation),
    }
  }

  if (stepId === 'analyze-timeline-images') {
    const analyses = Array.isArray(record.analyses) ? record.analyses : []
    return {
      analyses: analyses.map((item) => {
        const analysis = recordValue(item)
        const response = recordValue(analysis?.response)
        return {
          decisionIndex: analysis?.decisionIndex,
          decision: sanitizeFrameDebugValue(analysis?.decision),
          image: sanitizeFrameDebugValue(analysis?.image),
          response: response
            ? {
                success: response.success,
                provider: response.provider,
                model: response.model,
                range: sanitizeFrameDebugValue(response.range),
                n_frames: response.n_frames,
                analysis: sanitizeFrameDebugValue(response.analysis),
                request_id: response.request_id,
                tokens_consumed: response.tokens_consumed,
                updated_at: response.updated_at,
              }
            : undefined,
        }
      }),
    }
  }

  if (stepId === 'understand-narrative') {
    return {
      success: record.success,
      provider: record.provider,
      model: record.model,
      content: record.content,
      analysis: sanitizeFrameDebugValue(record.analysis),
      characters: sanitizeFrameDebugValue(record.characters),
      relationships: sanitizeFrameDebugValue(record.relationships),
      emotion_curve: sanitizeFrameDebugValue(record.emotion_curve),
      events: sanitizeFrameDebugValue(record.events),
      usage: sanitizeFrameDebugValue(record.usage),
      request_id: record.request_id,
      tokens_consumed: record.tokens_consumed,
      updated_at: record.updated_at,
    }
  }

  if (stepId === 'merge-video-context') {
    const pipelineResult = recordValue(record.pipelineResult)
    const tokens = recordValue(pipelineResult?.tokens)
    const analyses = Array.isArray(pipelineResult?.analyses) ? pipelineResult.analyses : []
    return {
      videoContext: sanitizeFrameDebugValue(record.videoContext),
      pipelineResult: {
        tokens: sanitizeFrameDebugValue(tokens),
        narrativeUnderstanding: sanitizeFrameDebugValue(pipelineResult?.narrativeUnderstanding),
        scriptResponse: sanitizeFrameDebugValue(pipelineResult?.scriptResponse),
        analyses: analyses.map((item) => {
          const analysis = recordValue(item)
          const response = recordValue(analysis?.response)
          return {
            decisionIndex: analysis?.decisionIndex,
            decision: sanitizeFrameDebugValue(analysis?.decision),
            image: sanitizeFrameDebugValue(analysis?.image),
            response: response
              ? {
                  provider: response.provider,
                  model: response.model,
                  range: sanitizeFrameDebugValue(response.range),
                  n_frames: response.n_frames,
                  analysis: sanitizeFrameDebugValue(response.analysis),
                  tokens_consumed: response.tokens_consumed,
                }
              : undefined,
          }
        }),
      },
    }
  }

  if (stepId === 'generate-narration-script') {
    const scriptResponse = recordValue(record.scriptResponse)
    const pipelineResult = recordValue(record.pipelineResult)
    return {
      scriptResponse: sanitizeFrameDebugValue(scriptResponse),
      draftItems: sanitizeFrameDebugValue(record.draftItems),
      approvedDraftItems: sanitizeFrameDebugValue(record.approvedDraftItems),
      pipelineResult: {
        tokens: sanitizeFrameDebugValue(recordValue(pipelineResult?.tokens)),
        scriptResponse: sanitizeFrameDebugValue(scriptResponse ?? pipelineResult?.scriptResponse),
        narrationDraftItems: sanitizeFrameDebugValue(pipelineResult?.narrationDraftItems),
        approvedNarrationDraftItems: sanitizeFrameDebugValue(pipelineResult?.approvedNarrationDraftItems),
      },
    }
  }

  if (stepId === 'match-narration-visuals') {
    const scriptResponse = recordValue(record.scriptResponse)
    const pipelineResult = recordValue(record.pipelineResult)
    return {
      scriptResponse: sanitizeFrameDebugValue(scriptResponse),
      passthrough: record.passthrough,
      pipelineResult: {
        tokens: sanitizeFrameDebugValue(recordValue(pipelineResult?.tokens)),
        scriptResponse: sanitizeFrameDebugValue(scriptResponse ?? pipelineResult?.scriptResponse),
        approvedNarrationDraftItems: sanitizeFrameDebugValue(pipelineResult?.approvedNarrationDraftItems),
      },
    }
  }

  if (stepId === 'generate-voiceover') {
    const voiceoverResult = recordValue(record.voiceoverResult)
    const pipelineResult = recordValue(record.pipelineResult)
    return {
      timelineReviewApproved: record.timelineReviewApproved === true,
      voiceoverResult: sanitizeFrameDebugValue(voiceoverResult),
      pipelineResult: {
        tokens: sanitizeFrameDebugValue(recordValue(pipelineResult?.tokens)),
        voiceoverResult: sanitizeFrameDebugValue(voiceoverResult ?? pipelineResult?.voiceoverResult),
        scriptResponse: sanitizeFrameDebugValue(pipelineResult?.scriptResponse),
      },
    }
  }

  if (stepId === 'compose-final-video') {
    const pipelineResult = recordValue(record.pipelineResult)
    return {
      file: sanitizeFrameDebugValue(record.file),
      finalVideo: sanitizeFrameDebugValue(record.finalVideo),
      pipelineResult: {
        tokens: sanitizeFrameDebugValue(recordValue(pipelineResult?.tokens)),
        finalVideoResult: sanitizeFrameDebugValue(pipelineResult?.finalVideoResult ?? record.finalVideo),
        voiceoverResult: sanitizeFrameDebugValue(pipelineResult?.voiceoverResult),
        scriptResponse: sanitizeFrameDebugValue(pipelineResult?.scriptResponse),
      },
    }
  }

  return undefined
}

const compactRunForStorage = (run: FrameDebugRun): FrameDebugRun => {
  const records = Object.fromEntries(
    Object.entries(run.records).map(([stepId, record]) => {
      const typedStepId = stepId as FrameDebugStepId
      return [stepId, {
        id: record.id,
        status: record.status,
        outputSummary: sanitizeFrameDebugValue(record.outputSummary),
        progress: sanitizeFrameDebugValue(record.progress),
        output: compactRecordOutput(typedStepId, record.output),
        error: record.error,
        startedAt: record.startedAt,
        completedAt: record.completedAt,
        durationMs: record.durationMs,
        logs: record.logs?.slice(-12),
      }]
    })
  ) as FrameDebugRun['records']

  return {
    ...run,
    records,
    error: run.error,
  }
}

export const loadFrameDebugStorage = (projectId: string): FrameDebugStorageState => (
  parseState(localStorage.getItem(getFrameDebugStorageKey(projectId)))
)

export const saveFrameDebugPreset = (
  projectId: string,
  preset: Omit<FrameDebugPreset, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
) => {
  const state = loadFrameDebugStorage(projectId)
  const now = new Date().toISOString()
  const id = preset.id || `preset-${Date.now()}`
  const existing = state.presets.find((item) => item.id === id)
  const nextPreset: FrameDebugPreset = {
    id,
    name: preset.name,
    config: sanitizeFrameDebugValue(preset.config) as Record<string, unknown>,
    stepInputs: sanitizeFrameDebugValue(preset.stepInputs) as Partial<Record<FrameDebugStepId, unknown>>,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  const presets = [nextPreset, ...state.presets.filter((item) => item.id !== id)]

  writeState(projectId, { ...state, presets })
  return nextPreset
}

export const saveFrameDebugRunHistory = (
  projectId: string,
  run: FrameDebugRun,
  historyLimit = DEFAULT_HISTORY_LIMIT
) => {
  const state = loadFrameDebugStorage(projectId)
  const sanitizedRun = sanitizeFrameDebugValue(run) as FrameDebugRun
  const candidateRuns = [
    sanitizedRun,
    ...state.runs.filter((item) => item.id !== run.id),
  ]
  const runs = candidateRuns.slice(0, historyLimit)

  if (tryWriteState(projectId, { ...state, runs })) return runs

  const latestOnly = candidateRuns.slice(0, 1)
  if (tryWriteState(projectId, { ...state, runs: latestOnly })) return latestOnly

  const compactedLatest = [
    sanitizeFrameDebugValue(compactRunForStorage(run)) as FrameDebugRun,
  ]
  if (tryWriteState(projectId, { ...state, runs: compactedLatest })) return compactedLatest

  const minimalLatest: FrameDebugRun[] = [{
    id: run.id,
    projectId: run.projectId,
    mode: run.mode,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    startStepId: run.startStepId,
    error: run.error,
    applied: run.applied,
    records: Object.fromEntries(Object.entries(run.records).map(([stepId, record]) => [stepId, {
      id: record.id,
      status: record.status,
      outputSummary: sanitizeFrameDebugValue(record.outputSummary),
      progress: sanitizeFrameDebugValue(record.progress),
      error: record.error,
      completedAt: record.completedAt,
      durationMs: record.durationMs,
      logs: record.logs?.slice(-4),
    }])) as FrameDebugRun['records'],
  }]

  if (tryWriteState(projectId, { ...state, runs: minimalLatest })) return minimalLatest

  console.warn('[FrameDebugStorage] localStorage quota exceeded; run history could not be persisted.')
  return minimalLatest
}

export const clearFrameDebugStorage = (projectId: string) => {
  localStorage.removeItem(getFrameDebugStorageKey(projectId))
}
