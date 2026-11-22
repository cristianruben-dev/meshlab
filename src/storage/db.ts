import type { Folder, Project, Tag } from './types'

export const WORKSPACE_DB_NAME = 'meshlab-workspace'
export const WORKSPACE_DB_VERSION = 1

export type StoreMap = {
  projects: Project
  folders: Folder
  tags: Tag
}

export type StoreName = keyof StoreMap

export interface StorageBackend {
  readonly mode: 'indexeddb' | 'memory'
  readonly fallbackReason?: string
  getAll<K extends StoreName>(store: K): Promise<StoreMap[K][]>
  get<K extends StoreName>(store: K, id: string): Promise<StoreMap[K] | undefined>
  put<K extends StoreName>(store: K, value: StoreMap[K]): Promise<void>
  putMany<K extends StoreName>(store: K, values: StoreMap[K][]): Promise<void>
  delete(store: StoreName, id: string): Promise<void>
  clearAll(): Promise<void>
  close(): void
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

export function createMemoryBackend(fallbackReason?: string): StorageBackend {
  const stores: { [K in StoreName]: Map<string, StoreMap[K]> } = {
    projects: new Map(),
    folders: new Map(),
    tags: new Map(),
  }

  return {
    mode: 'memory',
    fallbackReason,
    async getAll(store) {
      return Array.from(stores[store].values(), item => clone(item))
    },
    async get(store, id) {
      const item = stores[store].get(id)
      return item ? clone(item) : undefined
    },
    async put(store, value) {
      stores[store].set(value.id, clone(value))
    },
    async putMany(store, values) {
      for (const value of values) stores[store].set(value.id, clone(value))
    },
    async delete(store, id) {
      stores[store].delete(id)
    },
    async clearAll() {
      stores.projects.clear()
      stores.folders.clear()
      stores.tags.clear()
    },
    close() { /* In-memory backend has no open handles. */ },
  }
}

function requestPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed.'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted.'))
  })
}

function createIndexedDbBackend(db: IDBDatabase): StorageBackend {
  return {
    mode: 'indexeddb',
    async getAll(store) {
      const tx = db.transaction(store, 'readonly')
      const result = await requestPromise(tx.objectStore(store).getAll())
      return result as StoreMap[typeof store][]
    },
    async get(store, id) {
      const tx = db.transaction(store, 'readonly')
      const result = await requestPromise(tx.objectStore(store).get(id))
      return result as StoreMap[typeof store] | undefined
    },
    async put(store, value) {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).put(clone(value))
      await transactionDone(tx)
    },
    async putMany(store, values) {
      if (!values.length) return
      const tx = db.transaction(store, 'readwrite')
      const objectStore = tx.objectStore(store)
      for (const value of values) objectStore.put(clone(value))
      await transactionDone(tx)
    },
    async delete(store, id) {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).delete(id)
      await transactionDone(tx)
    },
    async clearAll() {
      const tx = db.transaction(['projects', 'folders', 'tags'], 'readwrite')
      tx.objectStore('projects').clear()
      tx.objectStore('folders').clear()
      tx.objectStore('tags').clear()
      await transactionDone(tx)
    },
    close() {
      db.close()
    },
  }
}

function openRawDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      request = factory.open(name, WORKSPACE_DB_VERSION)
    } catch (error) {
      reject(error)
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('projects')) {
        const projects = db.createObjectStore('projects', { keyPath: 'id' })
        projects.createIndex('updatedAt', 'updatedAt', { unique: false })
        projects.createIndex('folderId', 'folderId', { unique: false })
      }
      if (!db.objectStoreNames.contains('folders')) {
        const folders = db.createObjectStore('folders', { keyPath: 'id' })
        folders.createIndex('order', 'order', { unique: false })
      }
      if (!db.objectStoreNames.contains('tags')) {
        const tags = db.createObjectStore('tags', { keyPath: 'id' })
        tags.createIndex('name', 'name', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB.'))
    request.onblocked = () => reject(new Error('IndexedDB open request was blocked.'))
  })
}

export async function openWorkspaceBackend(
  dbName = WORKSPACE_DB_NAME,
  factory: IDBFactory | undefined = typeof indexedDB !== 'undefined' ? indexedDB : undefined,
): Promise<StorageBackend> {
  if (!factory) {
    return createMemoryBackend('IndexedDB is not available in this browser.')
  }
  try {
    const db = await openRawDatabase(factory, dbName)
    return createIndexedDbBackend(db)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'IndexedDB is unavailable.'
    return createMemoryBackend(reason)
  }
}
