import { boardSizes, defaultBoardSettings, type BoardSettings, type BoardSize } from '../breadboard/settings'
import { validateCircuit, type Circuit } from '../circuit/model'
import type { WorkspaceRepository } from './repository'
import {
  DEFAULT_FOLDER_COLOR,
  DEFAULT_TAG_COLOR,
  type Folder,
  type PreferredView,
  type Project,
  type ProjectFile,
  type Tag,
  type WorkspaceBundle,
  type WorkspaceSnapshot,
} from './types'

export const MAX_IMPORT_BYTES = 10_000_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function asPreferredView(value: unknown): PreferredView {
  return value === 'board' ? 'board' : 'schematic'
}

function asBoardSettings(value: unknown): BoardSettings | undefined {
  if (!isRecord(value)) return undefined
  const size = boardSizes.includes(value.size as BoardSize) ? value.size as BoardSize : defaultBoardSettings.size
  const rails = size === 'mini' ? false : typeof value.rails === 'boolean' ? value.rails : defaultBoardSettings.rails
  const splitRails = size === 'full' && rails && typeof value.splitRails === 'boolean' ? value.splitRails : false
  const labels = typeof value.labels === 'boolean' ? value.labels : defaultBoardSettings.labels
  return { size, rails, splitRails, labels }
}

function asColor(value: unknown, fallback: string): string {
  if (typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value.trim())) return value.trim()
  return fallback
}

function slugify(name: string, fallback: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return slug || fallback
}

function nameFromFile(fileName?: string, fallback = 'Imported Circuit'): string {
  if (!fileName) return fallback
  const stripped = fileName
    .replace(/\.meshlab-bundle\.json$/i, '')
    .replace(/\.meshlab\.json$/i, '')
    .replace(/\.json$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
  return stripped ? stripped.slice(0, 120) : fallback
}

function triggerDownload(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}

export function serializeProjectFile(
  project: Project,
  folders: Folder[],
  tags: Tag[],
): ProjectFile {
  const folder = project.folderId ? folders.find(f => f.id === project.folderId) : undefined
  const tagMap = new Map(tags.map(tag => [tag.id, tag]))
  const resolvedTags = project.tagIds
    .map(id => tagMap.get(id))
    .filter((tag): tag is Tag => Boolean(tag))
    .map(({ name, color }) => ({ name, color }))

  const { folderId: _folderId, tagIds: _tagIds, ...rest } = structuredClone(project)
  return {
    kind: 'meshlab-project',
    version: 1,
    exportedAt: Date.now(),
    project: {
      ...rest,
      ...(folder ? { folderName: folder.name } : {}),
      tags: resolvedTags,
    },
  }
}

export function serializeWorkspaceBundle(
  snapshot: WorkspaceSnapshot,
  options?: { folderId?: string | null },
): WorkspaceBundle {
  const targetFolderId = options?.folderId
  if (targetFolderId !== undefined && targetFolderId !== null) {
    const folders = snapshot.folders.filter(folder => folder.id === targetFolderId).map(f => structuredClone(f))
    const projects = snapshot.projects.filter(project => project.folderId === targetFolderId).map(p => structuredClone(p))
    const referencedTags = new Set(projects.flatMap(project => project.tagIds))
    const tags = snapshot.tags.filter(tag => referencedTags.has(tag.id)).map(t => structuredClone(t))
    return {
      kind: 'meshlab-bundle',
      version: 1,
      exportedAt: Date.now(),
      folders,
      tags,
      projects,
    }
  }
  return {
    kind: 'meshlab-bundle',
    version: 1,
    exportedAt: Date.now(),
    folders: snapshot.folders.map(f => structuredClone(f)),
    tags: snapshot.tags.map(t => structuredClone(t)),
    projects: snapshot.projects.map(p => structuredClone(p)),
  }
}

export function downloadProjectFile(project: Project, folders: Folder[], tags: Tag[]): string {
  const payload = serializeProjectFile(project, folders, tags)
  const filename = `${slugify(project.name, 'project')}.meshlab.json`
  triggerDownload(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), filename)
  return filename
}

export function downloadWorkspaceBundle(
  snapshot: WorkspaceSnapshot,
  options?: { folderId?: string | null; folderName?: string },
): string {
  const payload = serializeWorkspaceBundle(snapshot, options)
  const date = new Date().toISOString().slice(0, 10)
  const filename = options?.folderName
    ? `${slugify(options.folderName, 'folder')}.meshlab-bundle.json`
    : `meshlab-backup-${date}.meshlab-bundle.json`
  triggerDownload(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), filename)
  return filename
}

export type ParsedImport =
  | { kind: 'meshlab-project'; file: ProjectFile }
  | { kind: 'meshlab-bundle'; bundle: WorkspaceBundle }
  | { kind: 'legacy-circuit'; circuit: Circuit; suggestedName: string }

function validateProjectFile(input: Record<string, unknown>): ProjectFile {
  if (input.version !== 1) throw new Error('Unsupported project file version.')
  if (!isRecord(input.project)) throw new Error('Invalid project file: missing project object.')
  const raw = input.project
  const now = Date.now()
  const circuit = validateCircuit(raw.circuit)
  const name = asString(raw.name).trim()
  if (!name) throw new Error('Invalid project file: project name is required.')
  const rawTags = Array.isArray(raw.tags) ? raw.tags : []
  const tags = rawTags
    .filter(isRecord)
    .map(entry => ({
      name: asString(entry.name).trim().slice(0, 40),
      color: asColor(entry.color, DEFAULT_TAG_COLOR),
    }))
    .filter(tag => Boolean(tag.name))
  const folderName = typeof raw.folderName === 'string' && raw.folderName.trim() ? raw.folderName.trim().slice(0, 80) : undefined
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : crypto.randomUUID()
  const createdAt = asTimestamp(raw.createdAt, now)
  const updatedAt = asTimestamp(raw.updatedAt, createdAt)

  const preferredView = asPreferredView(raw.preferredView)
  const boardSettings = asBoardSettings(raw.boardSettings) ?? (preferredView === 'board' ? structuredClone(defaultBoardSettings) : undefined)

  return {
    kind: 'meshlab-project',
    version: 1,
    exportedAt: asTimestamp(input.exportedAt, now),
    project: {
      id,
      name: name.slice(0, 120),
      description: asString(raw.description).trim().slice(0, 500),
      pinned: Boolean(raw.pinned),
      preferredView,
      ...(boardSettings ? { boardSettings } : {}),
      circuit,
      createdAt,
      updatedAt,
      ...(folderName ? { folderName } : {}),
      tags,
    },
  }
}

function validateWorkspaceBundle(input: Record<string, unknown>): WorkspaceBundle {
  if (input.version !== 1) throw new Error('Unsupported backup bundle version.')
  if (!Array.isArray(input.projects) || !Array.isArray(input.folders) || !Array.isArray(input.tags)) {
    throw new Error('Invalid backup bundle: folders, tags, and projects must be arrays.')
  }
  const now = Date.now()
  const folders: Folder[] = input.folders.map((entry, index) => {
    if (!isRecord(entry)) throw new Error('Invalid folder entry in backup bundle.')
    const name = asString(entry.name).trim()
    if (!name) throw new Error('Invalid folder entry: folder name is required.')
    const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : crypto.randomUUID()
    return {
      id,
      name: name.slice(0, 80),
      color: asColor(entry.color, DEFAULT_FOLDER_COLOR),
      order: typeof entry.order === 'number' && Number.isFinite(entry.order) ? entry.order : index,
      createdAt: asTimestamp(entry.createdAt, now),
    }
  })

  const tags: Tag[] = input.tags.map(entry => {
    if (!isRecord(entry)) throw new Error('Invalid tag entry in backup bundle.')
    const name = asString(entry.name).trim()
    if (!name) throw new Error('Invalid tag entry: tag name is required.')
    const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : crypto.randomUUID()
    return {
      id,
      name: name.slice(0, 40),
      color: asColor(entry.color, DEFAULT_TAG_COLOR),
      createdAt: asTimestamp(entry.createdAt, now),
    }
  })

  const folderIds = new Set(folders.map(f => f.id))
  const tagIds = new Set(tags.map(t => t.id))

  const projects: Project[] = input.projects.map(entry => {
    if (!isRecord(entry)) throw new Error('Invalid project entry in backup bundle.')
    const name = asString(entry.name).trim()
    if (!name) throw new Error('Invalid project entry: project name is required.')
    const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : crypto.randomUUID()
    const circuit = validateCircuit(entry.circuit)
    const folderId = typeof entry.folderId === 'string' && folderIds.has(entry.folderId) ? entry.folderId : null
    const rawTagIds = Array.isArray(entry.tagIds) ? entry.tagIds : []
    const validTagIds = [...new Set(rawTagIds.filter((tagId): tagId is string => typeof tagId === 'string' && tagIds.has(tagId)))]
    const createdAt = asTimestamp(entry.createdAt, now)
    const preferredView = asPreferredView(entry.preferredView)
    const boardSettings = asBoardSettings(entry.boardSettings) ?? (preferredView === 'board' ? structuredClone(defaultBoardSettings) : undefined)
    return {
      id,
      name: name.slice(0, 120),
      description: asString(entry.description).trim().slice(0, 500),
      folderId,
      tagIds: validTagIds,
      pinned: Boolean(entry.pinned),
      preferredView,
      ...(boardSettings ? { boardSettings } : {}),
      circuit,
      createdAt,
      updatedAt: asTimestamp(entry.updatedAt, createdAt),
    }
  })

  return {
    kind: 'meshlab-bundle',
    version: 1,
    exportedAt: asTimestamp(input.exportedAt, now),
    folders,
    tags,
    projects,
  }
}

export function parseImportJson(
  rawText: string,
  options?: { fileName?: string; byteLength?: number; defaultName?: string },
): ParsedImport {
  const bytes = options?.byteLength ?? new TextEncoder().encode(rawText).byteLength
  if (bytes > MAX_IMPORT_BYTES) throw new Error('This file exceeds 10 MB.')
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new Error('Invalid JSON file.')
  }
  if (!isRecord(parsed)) throw new Error('Unrecognized Meshlab file format.')

  if (parsed.kind === 'meshlab-project') {
    return { kind: 'meshlab-project', file: validateProjectFile(parsed) }
  }
  if (parsed.kind === 'meshlab-bundle') {
    return { kind: 'meshlab-bundle', bundle: validateWorkspaceBundle(parsed) }
  }
  if ('components' in parsed && 'wires' in parsed && 'junctions' in parsed) {
    const circuit = validateCircuit(parsed)
    return {
      kind: 'legacy-circuit',
      circuit,
      suggestedName: nameFromFile(options?.fileName, options?.defaultName ?? 'Imported Circuit'),
    }
  }
  if ('version' in parsed && parsed.version !== 1) {
    throw new Error('Unsupported circuit version.')
  }
  throw new Error('Unrecognized Meshlab file format.')
}

export type ImportResult = {
  kind: ParsedImport['kind']
  importedProjects: Project[]
  createdFolders: Folder[]
  createdTags: Tag[]
}

export async function importAnyJson(
  repo: WorkspaceRepository,
  source: File | string,
  options?: { fileName?: string; defaultName?: string },
): Promise<ImportResult> {
  let rawText: string
  let fileName = options?.fileName
  let byteLength: number | undefined

  if (typeof source === 'string') {
    rawText = source
  } else {
    if (source.size > MAX_IMPORT_BYTES) throw new Error('This file exceeds 10 MB.')
    fileName = fileName ?? source.name
    byteLength = source.size
    rawText = await source.text()
  }

  const parsed = parseImportJson(rawText, { fileName, byteLength, defaultName: options?.defaultName })
  const existing = await repo.loadAll()

  const existingProjectIds = new Set(existing.projects.map(p => p.id))
  const existingFolderIds = new Set(existing.folders.map(f => f.id))
  const existingTagIds = new Set(existing.tags.map(t => t.id))
  const folderByLowerName = new Map(existing.folders.map(f => [f.name.trim().toLowerCase(), f]))
  const tagByLowerName = new Map(existing.tags.map(t => [t.name.trim().toLowerCase(), t]))

  const createdFolders: Folder[] = []
  const createdTags: Tag[] = []
  const importedProjects: Project[] = []
  let nextFolderOrder = existing.folders.reduce((max, folder) => Math.max(max, folder.order), -1) + 1

  const ensureFolder = (name: string, color: string = DEFAULT_FOLDER_COLOR, preferredId?: string, createdAt = Date.now()): string => {
    const key = name.trim().toLowerCase()
    const matched = folderByLowerName.get(key)
    if (matched) return matched.id
    const id = preferredId && !existingFolderIds.has(preferredId) ? preferredId : crypto.randomUUID()
    existingFolderIds.add(id)
    const folder: Folder = {
      id,
      name: name.trim().slice(0, 80),
      color,
      order: nextFolderOrder++,
      createdAt,
    }
    folderByLowerName.set(key, folder)
    createdFolders.push(folder)
    return id
  }

  const ensureTag = (name: string, color: string = DEFAULT_TAG_COLOR, preferredId?: string, createdAt = Date.now()): string => {
    const key = name.trim().toLowerCase()
    const matched = tagByLowerName.get(key)
    if (matched) return matched.id
    const id = preferredId && !existingTagIds.has(preferredId) ? preferredId : crypto.randomUUID()
    existingTagIds.add(id)
    const tag: Tag = {
      id,
      name: name.trim().slice(0, 40),
      color,
      createdAt,
    }
    tagByLowerName.set(key, tag)
    createdTags.push(tag)
    return id
  }

  if (parsed.kind === 'legacy-circuit') {
    const now = Date.now()
    const hasBreadboardOnly = Boolean(parsed.circuit.breadboard && parsed.circuit.wires.length === 0 && (parsed.circuit.breadboard.placements.length > 0 || parsed.circuit.breadboard.jumpers.length > 0))
    const project: Project = {
      id: crypto.randomUUID(),
      name: parsed.suggestedName,
      description: '',
      folderId: null,
      tagIds: [],
      pinned: false,
      preferredView: hasBreadboardOnly ? 'board' : 'schematic',
      ...(hasBreadboardOnly ? { boardSettings: structuredClone(defaultBoardSettings) } : {}),
      circuit: structuredClone(parsed.circuit),
      createdAt: now,
      updatedAt: now,
    }
    importedProjects.push(project)
  } else if (parsed.kind === 'meshlab-project') {
    const raw = parsed.file.project
    const folderId = raw.folderName ? ensureFolder(raw.folderName) : null
    const tagIds = [...new Set(raw.tags.map(tag => ensureTag(tag.name, tag.color)))]
    const id = existingProjectIds.has(raw.id) ? crypto.randomUUID() : raw.id
    existingProjectIds.add(id)
    const project: Project = {
      id,
      name: raw.name,
      description: raw.description,
      folderId,
      tagIds,
      pinned: raw.pinned,
      preferredView: raw.preferredView,
      ...(raw.boardSettings ? { boardSettings: structuredClone(raw.boardSettings) } : {}),
      circuit: structuredClone(raw.circuit),
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    }
    importedProjects.push(project)
  } else {
    const { bundle } = parsed
    const folderIdMap = new Map<string, string>()
    for (const folder of bundle.folders) {
      const mapped = ensureFolder(folder.name, folder.color, folder.id, folder.createdAt)
      folderIdMap.set(folder.id, mapped)
    }
    const tagIdMap = new Map<string, string>()
    for (const tag of bundle.tags) {
      const mapped = ensureTag(tag.name, tag.color, tag.id, tag.createdAt)
      tagIdMap.set(tag.id, mapped)
    }
    for (const raw of bundle.projects) {
      const id = existingProjectIds.has(raw.id) ? crypto.randomUUID() : raw.id
      existingProjectIds.add(id)
      const folderId = raw.folderId ? (folderIdMap.get(raw.folderId) ?? null) : null
      const tagIds = [...new Set(raw.tagIds.map(tagId => tagIdMap.get(tagId)).filter((x): x is string => Boolean(x)))]
      importedProjects.push({
        id,
        name: raw.name,
        description: raw.description,
        folderId,
        tagIds,
        pinned: raw.pinned,
        preferredView: raw.preferredView,
        ...(raw.boardSettings ? { boardSettings: structuredClone(raw.boardSettings) } : {}),
        circuit: structuredClone(raw.circuit),
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      })
    }
  }

  await repo.putImported({ folders: createdFolders, tags: createdTags, projects: importedProjects })
  return {
    kind: parsed.kind,
    importedProjects,
    createdFolders,
    createdTags,
  }
}
