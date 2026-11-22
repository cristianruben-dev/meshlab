// @vitest-environment happy-dom

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { examples } from '../circuit/examples'
import { validateCircuit, type Circuit } from '../circuit/model'
import { openWorkspaceBackend } from './db'
import {
  importAnyJson,
  MAX_IMPORT_BYTES,
  parseImportJson,
  serializeProjectFile,
  serializeWorkspaceBundle,
} from './io'
import { LEGACY_CIRCUIT_KEY, migrateLegacyCircuit, MIGRATION_DONE_KEY } from './migrate'
import { openWorkspaceRepository, WorkspaceRepository } from './repository'
import { blankCircuit } from './types'

type CircuitWithBreadboard = Circuit & {
  breadboard?: {
    version: number
    placements: Array<{ partId: string; holes: string[] }>
  }
}

function makeCircuitWithBreadboard(): CircuitWithBreadboard {
  return {
    ...structuredClone(examples['Voltage Divider']),
    breadboard: {
      version: 1,
      placements: [{ partId: 'R1', holes: ['e5', 'e10'] }],
    },
  }
}

function freshRepo() {
  return openWorkspaceRepository(`meshlab-test-${crypto.randomUUID()}`, new IDBFactory())
}

beforeEach(() => {
  localStorage.clear()
})

describe('IndexedDB storage backend & fallback', () => {
  it('persists projects, folders, and tags in IndexedDB with indexes', async () => {
    const factory = new IDBFactory()
    const dbName = `meshlab-persist-${crypto.randomUUID()}`
    const repo1 = await openWorkspaceRepository(dbName, factory)
    expect(repo1.mode).toBe('indexeddb')

    const folder = await repo1.createFolder({ name: 'Power Supplies', color: '#0b7a6c' })
    const tag = await repo1.createTag({ name: 'Analog', color: '#2f6fd6' })
    const circuit = makeCircuitWithBreadboard()
    const project = await repo1.createProject({
      name: 'Lab Bench',
      description: '12V divider',
      folderId: folder.id,
      tagIds: [tag.id],
      preferredView: 'board',
      circuit,
    })
    repo1.close()

    const repo2 = await openWorkspaceRepository(dbName, factory)
    const snapshot = await repo2.loadAll()
    expect(snapshot.folders).toHaveLength(1)
    expect(snapshot.tags).toHaveLength(1)
    expect(snapshot.projects).toHaveLength(1)
    expect(snapshot.projects[0]).toMatchObject({
      id: project.id,
      name: 'Lab Bench',
      description: '12V divider',
      folderId: folder.id,
      tagIds: [tag.id],
      preferredView: 'board',
    })
    expect((snapshot.projects[0].circuit as CircuitWithBreadboard).breadboard).toEqual(circuit.breadboard)
    repo2.close()
  })

  it('degrades gracefully to an in-memory backend when IndexedDB is unavailable or fails', async () => {
    const backendMissing = await openWorkspaceBackend('no-idb', undefined)
    expect(backendMissing.mode).toBe('memory')
    const repo = new WorkspaceRepository(backendMissing)
    const p = await repo.createProject({ name: 'Session Circuit' })
    expect((await repo.getProject(p.id))?.name).toBe('Session Circuit')

    const brokenFactory = {
      open() {
        throw new Error('SecurityError: IndexedDB denied')
      },
    } as unknown as IDBFactory
    const backendBroken = await openWorkspaceBackend('broken-idb', brokenFactory)
    expect(backendBroken.mode).toBe('memory')
    expect(backendBroken.fallbackReason).toMatch(/SecurityError/)
  })
})

describe('WorkspaceRepository CRUD & invariants', () => {
  it('supports full CRUD, duplication preserving breadboard fields, and safe folder/tag deletion', async () => {
    const repo = await freshRepo()
    const folder = await repo.createFolder({ name: 'Filters', color: '#6366f1' })
    const tagA = await repo.createTag({ name: 'RC', color: '#e08a00' })
    const tagB = await repo.createTag({ name: 'Lab', color: '#15803d' })

    const circuit = makeCircuitWithBreadboard()
    const original = await repo.createProject({
      name: 'RC Lowpass',
      folderId: folder.id,
      tagIds: [tagA.id, tagB.id],
      circuit,
    })

    const pinned = await repo.togglePin(original.id)
    expect(pinned.pinned).toBe(true)

    const renamed = await repo.updateProject(original.id, { name: 'RC Lowpass v2' })
    expect(renamed.name).toBe('RC Lowpass v2')

    const duplicate = await repo.duplicateProject(original.id, 'Copy')
    expect(duplicate.id).not.toBe(original.id)
    expect(duplicate.name).toBe('RC Lowpass v2 (Copy)')
    expect(duplicate.pinned).toBe(false)
    expect(duplicate.folderId).toBe(folder.id)
    expect(duplicate.tagIds).toEqual([tagA.id, tagB.id])
    expect((duplicate.circuit as CircuitWithBreadboard).breadboard).toEqual(circuit.breadboard)

    // Deleting a folder must move projects to Unfiled (folderId: null), never delete them.
    await repo.deleteFolder(folder.id)
    const afterFolderDelete = await repo.loadAll()
    expect(afterFolderDelete.folders).toHaveLength(0)
    expect(afterFolderDelete.projects).toHaveLength(2)
    expect(afterFolderDelete.projects.every(p => p.folderId === null)).toBe(true)

    // Deleting a tag strips it from every project.
    await repo.deleteTag(tagA.id)
    const afterTagDelete = await repo.loadAll()
    expect(afterTagDelete.tags.map(t => t.id)).toEqual([tagB.id])
    expect(afterTagDelete.projects.every(p => p.tagIds.length === 1 && p.tagIds[0] === tagB.id)).toBe(true)

    await repo.deleteProject(duplicate.id)
    expect((await repo.loadAll()).projects.map(p => p.id)).toEqual([original.id])
    repo.close()
  })
})

describe('Legacy localStorage migration', () => {
  it('migrates meshlab:circuit:v1 once and preserves optional breadboard data', async () => {
    const circuit = makeCircuitWithBreadboard()
    localStorage.setItem(LEGACY_CIRCUIT_KEY, JSON.stringify(circuit))

    const repo = await freshRepo()
    const first = await migrateLegacyCircuit(repo, { defaultName: 'Recovered' })
    expect(first).not.toBeNull()
    expect(first?.name).toBe('Recovered')
    expect((first?.circuit as CircuitWithBreadboard).breadboard).toEqual(circuit.breadboard)
    expect(localStorage.getItem(MIGRATION_DONE_KEY)).toBe('1')

    // Calling again must not duplicate the migrated project.
    const second = await migrateLegacyCircuit(repo, { defaultName: 'Recovered' })
    expect(second).toBeNull()
    expect((await repo.loadAll()).projects).toHaveLength(1)
    repo.close()
  })

  it('skips migration if projects already exist or if legacy JSON is corrupt', async () => {
    localStorage.setItem(LEGACY_CIRCUIT_KEY, '{broken json')
    const repo1 = await freshRepo()
    expect(await migrateLegacyCircuit(repo1)).toBeNull()
    expect((await repo1.loadAll()).projects).toHaveLength(0)
    repo1.close()

    localStorage.clear()
    localStorage.setItem(LEGACY_CIRCUIT_KEY, JSON.stringify(examples['Two Sources']))
    const repo2 = await freshRepo()
    await repo2.createProject({ name: 'Existing', circuit: blankCircuit() })
    expect(await migrateLegacyCircuit(repo2)).toBeNull()
    expect((await repo2.loadAll()).projects).toHaveLength(1)
    repo2.close()
  })
})

describe('Import & Export (ProjectFile, WorkspaceBundle, legacy Circuit v1)', () => {
  it('round-trips a single ProjectFile, reuses tags by name, regenerates colliding IDs, and keeps breadboard intact', async () => {
    const repo = await freshRepo()
    const folder = await repo.createFolder({ name: 'Sensors', color: '#0b7a6c' })
    const tag = await repo.createTag({ name: 'DC', color: '#2f6fd6' })
    const circuit = makeCircuitWithBreadboard()
    const project = await repo.createProject({
      name: 'Bridge Sensor',
      description: 'Calibration test',
      folderId: folder.id,
      tagIds: [tag.id],
      preferredView: 'board',
      circuit,
    })

    const filePayload = serializeProjectFile(project, [folder], [tag])
    expect(filePayload.kind).toBe('meshlab-project')
    expect(filePayload.version).toBe(1)
    expect(filePayload.project.folderName).toBe('Sensors')
    expect(filePayload.project.tags).toEqual([{ name: 'DC', color: '#2f6fd6' }])
    expect((filePayload.project.circuit as CircuitWithBreadboard).breadboard).toEqual(circuit.breadboard)

    // Importing into the same repo must not overwrite the existing project or duplicate the folder/tag.
    const result = await importAnyJson(repo, JSON.stringify(filePayload), { fileName: 'bridge.meshlab.json' })
    expect(result.kind).toBe('meshlab-project')
    expect(result.importedProjects).toHaveLength(1)
    expect(result.importedProjects[0].id).not.toBe(project.id)
    expect(result.importedProjects[0].folderId).toBe(folder.id)
    expect(result.importedProjects[0].tagIds).toEqual([tag.id])
    expect((result.importedProjects[0].circuit as CircuitWithBreadboard).breadboard).toEqual(circuit.breadboard)

    const all = await repo.loadAll()
    expect(all.projects).toHaveLength(2)
    expect(all.folders).toHaveLength(1)
    expect(all.tags).toHaveLength(1)
    repo.close()
  })

  it('exports and safely merges WorkspaceBundles (full and folder-scoped) with ID collision safety', async () => {
    const sourceRepo = await freshRepo()
    const f1 = await sourceRepo.createFolder({ name: 'Audio', color: '#8b4fd6' })
    const f2 = await sourceRepo.createFolder({ name: 'Power', color: '#e08a00' })
    const t1 = await sourceRepo.createTag({ name: 'Prototype', color: '#d9468f' })
    const t2 = await sourceRepo.createTag({ name: 'Final', color: '#15803d' })
    const p1 = await sourceRepo.createProject({
      name: 'Preamp',
      folderId: f1.id,
      tagIds: [t1.id],
      circuit: makeCircuitWithBreadboard(),
    })
    const p2 = await sourceRepo.createProject({
      name: 'Regulator',
      folderId: f2.id,
      tagIds: [t2.id],
      circuit: examples['LED + Switch'],
    })

    const snapshot = await sourceRepo.loadAll()
    const folderOnlyBundle = serializeWorkspaceBundle(snapshot, { folderId: f1.id })
    expect(folderOnlyBundle.folders.map(f => f.id)).toEqual([f1.id])
    expect(folderOnlyBundle.projects.map(p => p.id)).toEqual([p1.id])
    expect(folderOnlyBundle.tags.map(t => t.id)).toEqual([t1.id])

    const fullBundle = serializeWorkspaceBundle(snapshot)
    expect(fullBundle.projects).toHaveLength(2)

    // Merge full bundle back into sourceRepo — IDs collide, so new IDs must be generated without overwriting.
    const merged = await importAnyJson(sourceRepo, JSON.stringify(fullBundle))
    expect(merged.kind).toBe('meshlab-bundle')
    expect(merged.importedProjects).toHaveLength(2)
    expect(merged.importedProjects.every(p => p.id !== p1.id && p.id !== p2.id)).toBe(true)

    const after = await sourceRepo.loadAll()
    expect(after.projects).toHaveLength(4)
    expect(after.folders).toHaveLength(2)
    expect(after.tags).toHaveLength(2)
    const importedPreamp = merged.importedProjects.find(p => p.name === 'Preamp')!
    expect(importedPreamp.folderId).toBe(f1.id)
    expect(importedPreamp.tagIds).toEqual([t1.id])
    expect((importedPreamp.circuit as CircuitWithBreadboard).breadboard).toEqual(
      (p1.circuit as CircuitWithBreadboard).breadboard,
    )
    sourceRepo.close()
  })

  it('imports legacy Circuit v1 JSON files and preserves extra fields', async () => {
    const repo = await freshRepo()
    const legacy = makeCircuitWithBreadboard()
    expect((validateCircuit(legacy) as CircuitWithBreadboard).breadboard).toEqual(legacy.breadboard)

    const result = await importAnyJson(repo, JSON.stringify(legacy), { fileName: 'my-divider.json' })
    expect(result.kind).toBe('legacy-circuit')
    expect(result.importedProjects[0].name).toBe('my divider')
    expect(result.importedProjects[0].circuit.components).toHaveLength(4)
    expect((result.importedProjects[0].circuit as CircuitWithBreadboard).breadboard).toEqual(legacy.breadboard)
    repo.close()
  })

  it('rejects malformed, oversized, or unsupported JSON files with clear errors', () => {
    expect(() => parseImportJson('{}', { byteLength: MAX_IMPORT_BYTES + 1 })).toThrow(/10 MB/i)
    expect(() => parseImportJson('{bad json')).toThrow(/Invalid JSON/i)
    expect(() => parseImportJson(JSON.stringify({ hello: 'world' }))).toThrow(/Unrecognized/i)
    expect(() => parseImportJson(JSON.stringify({ version: 99, components: [], wires: [], junctions: [] }))).toThrow(/Unsupported circuit version/i)
    expect(() => parseImportJson(JSON.stringify({ kind: 'meshlab-project', version: 2, project: {} }))).toThrow(/Unsupported project file version/i)
    expect(() => parseImportJson(JSON.stringify({ kind: 'meshlab-bundle', version: 2, folders: [], tags: [], projects: [] }))).toThrow(/Unsupported backup bundle version/i)
  })
})
