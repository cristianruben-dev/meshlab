import type { BoardSettings } from '../breadboard/settings'
import type { Circuit } from '../circuit/model'
import { openWorkspaceBackend, type StorageBackend, WORKSPACE_DB_NAME } from './db'
import {
  blankCircuit,
  boardSettingsForSize,
  DEFAULT_FOLDER_COLOR,
  DEFAULT_TAG_COLOR,
  type Folder,
  type PreferredView,
  type Project,
  type Tag,
  type WorkspaceSnapshot,
} from './types'

export type CreateProjectInput = {
  id?: string
  name: string
  description?: string
  folderId?: string | null
  tagIds?: string[]
  pinned?: boolean
  preferredView?: PreferredView
  boardSettings?: BoardSettings
  circuit?: Circuit
  createdAt?: number
  updatedAt?: number
}

export type UpdateProjectInput = Partial<Pick<Project, 'name' | 'description' | 'folderId' | 'tagIds' | 'pinned' | 'preferredView' | 'boardSettings' | 'circuit'>>

export type CreateFolderInput = {
  id?: string
  name: string
  color?: string
  order?: number
  createdAt?: number
}

export type CreateTagInput = {
  id?: string
  name: string
  color?: string
  createdAt?: number
}

const generateId = () => crypto.randomUUID()

function sanitizeName(value: string, fallback: string): string {
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, 120) : fallback
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

export class WorkspaceRepository {
  readonly backend: StorageBackend

  constructor(backend: StorageBackend) {
    this.backend = backend
  }

  get mode() {
    return this.backend.mode
  }

  get fallbackReason() {
    return this.backend.fallbackReason
  }

  close() {
    this.backend.close()
  }

  async loadAll(): Promise<WorkspaceSnapshot> {
    const [projects, folders, tags] = await Promise.all([
      this.backend.getAll('projects'),
      this.backend.getAll('folders'),
      this.backend.getAll('tags'),
    ])
    projects.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)
    folders.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
    tags.sort((a, b) => a.name.localeCompare(b.name))
    return { projects, folders, tags }
  }

  async getProject(id: string): Promise<Project | undefined> {
    return this.backend.get('projects', id)
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const now = Date.now()
    const createdAt = input.createdAt ?? now
    const preferredView = input.preferredView ?? 'schematic'
    const boardSettings = input.boardSettings
      ? structuredClone(input.boardSettings)
      : preferredView === 'board'
        ? boardSettingsForSize('half')
        : undefined
    const project: Project = {
      id: input.id ?? generateId(),
      name: sanitizeName(input.name, 'Untitled Project'),
      description: (input.description ?? '').trim().slice(0, 500),
      folderId: input.folderId ?? null,
      tagIds: uniqueStrings(input.tagIds ?? []),
      pinned: Boolean(input.pinned),
      preferredView,
      ...(boardSettings ? { boardSettings } : {}),
      circuit: structuredClone(input.circuit ?? blankCircuit()),
      createdAt,
      updatedAt: input.updatedAt ?? createdAt,
    }
    await this.backend.put('projects', project)
    return project
  }

  async updateProject(id: string, changes: UpdateProjectInput, options?: { touch?: boolean }): Promise<Project> {
    const existing = await this.backend.get('projects', id)
    if (!existing) throw new Error(`Project not found: ${id}`)
    const touch = options?.touch ?? true
    const updated: Project = {
      ...existing,
      ...(changes.name !== undefined ? { name: sanitizeName(changes.name, existing.name) } : {}),
      ...(changes.description !== undefined ? { description: changes.description.trim().slice(0, 500) } : {}),
      ...(changes.folderId !== undefined ? { folderId: changes.folderId } : {}),
      ...(changes.tagIds !== undefined ? { tagIds: uniqueStrings(changes.tagIds) } : {}),
      ...(changes.pinned !== undefined ? { pinned: changes.pinned } : {}),
      ...(changes.preferredView !== undefined ? { preferredView: changes.preferredView } : {}),
      ...(changes.boardSettings !== undefined ? { boardSettings: structuredClone(changes.boardSettings) } : {}),
      ...(changes.circuit !== undefined ? { circuit: structuredClone(changes.circuit) } : {}),
      updatedAt: touch ? Date.now() : existing.updatedAt,
    }
    await this.backend.put('projects', updated)
    return updated
  }

  async saveProjectCircuit(id: string, circuit: Circuit, preferredView?: PreferredView): Promise<Project> {
    return this.updateProject(id, {
      circuit,
      ...(preferredView !== undefined ? { preferredView } : {}),
    })
  }

  async duplicateProject(id: string, copySuffix = 'Copy'): Promise<Project> {
    const source = await this.backend.get('projects', id)
    if (!source) throw new Error(`Project not found: ${id}`)
    const now = Date.now()
    const copy: Project = {
      ...structuredClone(source),
      id: generateId(),
      name: sanitizeName(`${source.name} (${copySuffix})`, `${source.name} (Copy)`),
      pinned: false,
      createdAt: now,
      updatedAt: now,
    }
    await this.backend.put('projects', copy)
    return copy
  }

  async togglePin(id: string): Promise<Project> {
    const existing = await this.backend.get('projects', id)
    if (!existing) throw new Error(`Project not found: ${id}`)
    return this.updateProject(id, { pinned: !existing.pinned }, { touch: false })
  }

  async moveProjectToFolder(id: string, folderId: string | null): Promise<Project> {
    return this.updateProject(id, { folderId }, { touch: false })
  }

  async setProjectTags(id: string, tagIds: string[]): Promise<Project> {
    return this.updateProject(id, { tagIds }, { touch: false })
  }

  async deleteProject(id: string): Promise<void> {
    await this.backend.delete('projects', id)
  }

  async createFolder(input: CreateFolderInput): Promise<Folder> {
    const existing = await this.backend.getAll('folders')
    const maxOrder = existing.reduce((max, folder) => Math.max(max, folder.order), -1)
    const folder: Folder = {
      id: input.id ?? generateId(),
      name: sanitizeName(input.name, 'New Folder'),
      color: input.color ?? DEFAULT_FOLDER_COLOR,
      order: input.order ?? maxOrder + 1,
      createdAt: input.createdAt ?? Date.now(),
    }
    await this.backend.put('folders', folder)
    return folder
  }

  async updateFolder(id: string, changes: Partial<Pick<Folder, 'name' | 'color' | 'order'>>): Promise<Folder> {
    const existing = await this.backend.get('folders', id)
    if (!existing) throw new Error(`Folder not found: ${id}`)
    const updated: Folder = {
      ...existing,
      ...(changes.name !== undefined ? { name: sanitizeName(changes.name, existing.name) } : {}),
      ...(changes.color !== undefined ? { color: changes.color } : {}),
      ...(changes.order !== undefined ? { order: changes.order } : {}),
    }
    await this.backend.put('folders', updated)
    return updated
  }

  async deleteFolder(id: string): Promise<void> {
    const projects = await this.backend.getAll('projects')
    const affected = projects
      .filter(project => project.folderId === id)
      .map(project => ({ ...project, folderId: null }))
    if (affected.length) {
      await this.backend.putMany('projects', affected)
    }
    await this.backend.delete('folders', id)
  }

  async createTag(input: CreateTagInput): Promise<Tag> {
    const tag: Tag = {
      id: input.id ?? generateId(),
      name: sanitizeName(input.name, 'Tag'),
      color: input.color ?? DEFAULT_TAG_COLOR,
      createdAt: input.createdAt ?? Date.now(),
    }
    await this.backend.put('tags', tag)
    return tag
  }

  async updateTag(id: string, changes: Partial<Pick<Tag, 'name' | 'color'>>): Promise<Tag> {
    const existing = await this.backend.get('tags', id)
    if (!existing) throw new Error(`Tag not found: ${id}`)
    const updated: Tag = {
      ...existing,
      ...(changes.name !== undefined ? { name: sanitizeName(changes.name, existing.name) } : {}),
      ...(changes.color !== undefined ? { color: changes.color } : {}),
    }
    await this.backend.put('tags', updated)
    return updated
  }

  async deleteTag(id: string): Promise<void> {
    const projects = await this.backend.getAll('projects')
    const affected = projects
      .filter(project => project.tagIds.includes(id))
      .map(project => ({ ...project, tagIds: project.tagIds.filter(tagId => tagId !== id) }))
    if (affected.length) {
      await this.backend.putMany('projects', affected)
    }
    await this.backend.delete('tags', id)
  }

  async putImported(payload: { folders: Folder[]; tags: Tag[]; projects: Project[] }): Promise<void> {
    if (payload.folders.length) await this.backend.putMany('folders', payload.folders)
    if (payload.tags.length) await this.backend.putMany('tags', payload.tags)
    if (payload.projects.length) await this.backend.putMany('projects', payload.projects)
  }
}

export async function openWorkspaceRepository(
  dbName = WORKSPACE_DB_NAME,
  factory?: IDBFactory,
): Promise<WorkspaceRepository> {
  const backend = await openWorkspaceBackend(dbName, factory)
  return new WorkspaceRepository(backend)
}
