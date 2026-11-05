const DB_NAME = 'narrato-local-audio'
const DB_VERSION = 3
const AUDIO_STORE_NAME = 'audio-blobs'
const PREVIEW_STORE_NAME = 'preview-images'
const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_AUDIO_CACHE_MAX_BYTES = 250 * 1024 * 1024
const DEFAULT_AUDIO_CACHE_TTL_DAYS = 14
const DEFAULT_PREVIEW_CACHE_TTL_DAYS = 30

type CacheStoreName = typeof AUDIO_STORE_NAME | typeof PREVIEW_STORE_NAME

interface StoredCacheRecord {
  key: string
  projectId: string
  blob: Blob
  createdAt: string
  updatedAt: string
}

interface StoredLocalAudio {
  key: string
  projectId: string
  itemId: number
  blob: Blob
  duration?: number
  contentHash?: string
  createdAt: string
  updatedAt: string
}

interface SaveLocalAudioInput {
  projectId: string
  itemId: number
  blob: Blob
  duration?: number
  contentHash?: string
}

interface StoredProjectPreviewImage {
  key: string
  projectId: string
  blob: Blob
  contentHash?: string
  createdAt: string
  updatedAt: string
}

interface SaveProjectPreviewImageInput {
  projectId: string
  blob: Blob
  contentHash?: string
}

interface CleanupAudioCacheOptions {
  maxBytes?: number
  olderThanDays?: number
}

interface CleanupExpiredDataOptions {
  audioOlderThanDays?: number
  previewOlderThanDays?: number
}

const isIndexedDBAvailable = () => typeof indexedDB !== 'undefined'

const ensureIndex = (store: IDBObjectStore, indexName: string, keyPath: string) => {
  if (!store.indexNames.contains(indexName)) {
    store.createIndex(indexName, keyPath, { unique: false })
  }
}

const openDatabase = (): Promise<IDBDatabase> => {
  if (!isIndexedDBAvailable()) {
    return Promise.reject(new Error('当前浏览器不支持本地音频缓存'))
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      const transaction = request.transaction
      const audioStore = db.objectStoreNames.contains(AUDIO_STORE_NAME)
        ? transaction?.objectStore(AUDIO_STORE_NAME)
        : db.createObjectStore(AUDIO_STORE_NAME, { keyPath: 'key' })
      const previewStore = db.objectStoreNames.contains(PREVIEW_STORE_NAME)
        ? transaction?.objectStore(PREVIEW_STORE_NAME)
        : db.createObjectStore(PREVIEW_STORE_NAME, { keyPath: 'key' })

      if (audioStore) {
        ensureIndex(audioStore, 'projectId', 'projectId')
        ensureIndex(audioStore, 'updatedAt', 'updatedAt')
      }
      if (previewStore) {
        ensureIndex(previewStore, 'projectId', 'projectId')
        ensureIndex(previewStore, 'updatedAt', 'updatedAt')
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('打开本地音频缓存失败'))
  })
}

const runStoreOperation = async <T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> => {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const store = transaction.objectStore(storeName)
    const request = operation(store)
    let result: T | undefined

    if (request) {
      request.onsuccess = () => {
        result = request.result
      }
      request.onerror = () => {
        reject(request.error ?? new Error('本地音频缓存操作失败'))
      }
    }

    transaction.oncomplete = () => {
      db.close()
      resolve(result)
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error ?? new Error('本地音频缓存事务失败'))
    }
    transaction.onabort = () => {
      db.close()
      reject(transaction.error ?? new Error('本地音频缓存事务已中止'))
    }
  })
}

const createAudioKey = (projectId: string, itemId: number) => (
  `project:${projectId}:narration:${itemId}`
)

const createProjectPreviewKey = (projectId: string) => (
  `project:${projectId}:preview-image`
)

const runCursorCleanup = async (
  storeName: CacheStoreName,
  shouldDelete: (record: StoredCacheRecord) => boolean
): Promise<void> => {
  await runStoreOperation<IDBCursorWithValue | null>(storeName, 'readwrite', store => {
    const request = store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return

      const record = cursor.value as StoredCacheRecord
      if (shouldDelete(record)) {
        cursor.delete()
      }
      cursor.continue()
    }
    return request
  })
}

const cleanupStoreByAge = async (storeName: CacheStoreName, olderThanDays: number): Promise<void> => {
  if (!Number.isFinite(olderThanDays) || olderThanDays <= 0) return

  const cutoff = Date.now() - olderThanDays * DAY_MS
  await runCursorCleanup(storeName, record => {
    const timestamp = Date.parse(record.updatedAt || record.createdAt)
    return Number.isFinite(timestamp) && timestamp < cutoff
  })
}

const enforceAudioCacheLimit = async (maxBytes: number): Promise<void> => {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) return

  await runStoreOperation<IDBCursorWithValue | null>(AUDIO_STORE_NAME, 'readwrite', store => {
    const records: Array<{ key: string; size: number; updatedAt: number }> = []
    const request = store.openCursor()

    request.onsuccess = () => {
      const cursor = request.result
      if (cursor) {
        const record = cursor.value as StoredLocalAudio
        records.push({
          key: record.key,
          size: record.blob?.size ?? 0,
          updatedAt: Date.parse(record.updatedAt || record.createdAt) || 0,
        })
        cursor.continue()
        return
      }

      let totalBytes = records.reduce((sum, record) => sum + record.size, 0)
      if (totalBytes <= maxBytes) return

      records
        .sort((a, b) => a.updatedAt - b.updatedAt)
        .some(record => {
          if (totalBytes <= maxBytes) return true
          store.delete(record.key)
          totalBytes -= record.size
          return false
        })
    }

    return request
  })
}

const cleanupAudioCache = async ({
  maxBytes = DEFAULT_AUDIO_CACHE_MAX_BYTES,
  olderThanDays = DEFAULT_AUDIO_CACHE_TTL_DAYS,
}: CleanupAudioCacheOptions = {}): Promise<void> => {
  await cleanupStoreByAge(AUDIO_STORE_NAME, olderThanDays)
  await enforceAudioCacheLimit(maxBytes)
}

const cleanupPreviewCache = async (olderThanDays = DEFAULT_PREVIEW_CACHE_TTL_DAYS): Promise<void> => {
  await cleanupStoreByAge(PREVIEW_STORE_NAME, olderThanDays)
}

let scheduledAudioCleanup: Promise<void> | null = null
let scheduledPreviewCleanup: Promise<void> | null = null

const scheduleCleanup = (
  currentTask: Promise<void> | null,
  run: () => Promise<void>,
  assign: (task: Promise<void> | null) => void
) => {
  if (currentTask) return

  const task = run()
    .catch(error => {
      console.warn('本地缓存清理失败（非致命错误）:', error)
    })
    .finally(() => assign(null))

  assign(task)
}

const scheduleAudioCacheCleanup = () => scheduleCleanup(
  scheduledAudioCleanup,
  cleanupAudioCache,
  task => { scheduledAudioCleanup = task }
)

const schedulePreviewCacheCleanup = () => scheduleCleanup(
  scheduledPreviewCleanup,
  cleanupPreviewCache,
  task => { scheduledPreviewCleanup = task }
)

export const localAudioStorageService = {
  createAudioKey,
  createProjectPreviewKey,

  async saveNarrationAudio(input: SaveLocalAudioInput): Promise<string> {
    const key = createAudioKey(input.projectId, input.itemId)
    const now = new Date().toISOString()
    const record: StoredLocalAudio = {
      key,
      projectId: input.projectId,
      itemId: input.itemId,
      blob: input.blob,
      duration: input.duration,
      contentHash: input.contentHash,
      createdAt: now,
      updatedAt: now,
    }

    await runStoreOperation(AUDIO_STORE_NAME, 'readwrite', store => store.put(record))
    scheduleAudioCacheCleanup()
    return key
  },

  async getAudioBlob(key: string): Promise<Blob | null> {
    const record = await runStoreOperation<StoredLocalAudio | undefined>(
      AUDIO_STORE_NAME,
      'readonly',
      store => store.get(key)
    )

    return record?.blob ?? null
  },

  async deleteAudio(key: string): Promise<void> {
    await runStoreOperation(AUDIO_STORE_NAME, 'readwrite', store => store.delete(key))
  },

  async deleteNarrationAudio(projectId: string, itemId: number): Promise<void> {
    await this.deleteAudio(createAudioKey(projectId, itemId))
  },

  async deleteProjectAudio(projectId: string): Promise<void> {
    await runCursorCleanup(AUDIO_STORE_NAME, record => record.projectId === projectId)
  },

  async saveProjectPreviewImage(input: SaveProjectPreviewImageInput): Promise<string> {
    const key = createProjectPreviewKey(input.projectId)
    const now = new Date().toISOString()
    const record: StoredProjectPreviewImage = {
      key,
      projectId: input.projectId,
      blob: input.blob,
      contentHash: input.contentHash,
      createdAt: now,
      updatedAt: now,
    }

    await runStoreOperation(PREVIEW_STORE_NAME, 'readwrite', store => store.put(record))
    schedulePreviewCacheCleanup()
    return key
  },

  async getProjectPreviewBlob(key: string): Promise<Blob | null> {
    const record = await runStoreOperation<StoredProjectPreviewImage | undefined>(
      PREVIEW_STORE_NAME,
      'readonly',
      store => store.get(key)
    )

    return record?.blob ?? null
  },

  async deleteProjectPreviewImage(projectId: string): Promise<void> {
    await runStoreOperation(
      PREVIEW_STORE_NAME,
      'readwrite',
      store => store.delete(createProjectPreviewKey(projectId))
    )
  },

  async deleteProjectCachedData(projectId: string): Promise<void> {
    await Promise.all([
      this.deleteProjectAudio(projectId),
      this.deleteProjectPreviewImage(projectId),
    ])
  },

  async cleanupAudioCache(options?: CleanupAudioCacheOptions): Promise<void> {
    await cleanupAudioCache(options)
  },

  async cleanupExpiredData(options: CleanupExpiredDataOptions = {}): Promise<void> {
    await Promise.all([
      cleanupAudioCache({
        olderThanDays: options.audioOlderThanDays ?? DEFAULT_AUDIO_CACHE_TTL_DAYS,
      }),
      cleanupPreviewCache(options.previewOlderThanDays ?? DEFAULT_PREVIEW_CACHE_TTL_DAYS),
    ])
  },
}
