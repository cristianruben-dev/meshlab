import type { Circuit } from '../circuit/model'

export type PreferredView = 'schematic' | 'board'

export type Project = {
  id: string
  name: string
  description: string
  folderId: string | null
  tagIds: string[]
  pinned: boolean
  preferredView: PreferredView
  circuit: Circuit
  createdAt: number
  updatedAt: number
}

export type Folder = {
  id: string
  name: string
  color: string
  order: number
  createdAt: number
}

export type Tag = {
  id: string
  name: string
  color: string
  createdAt: number
}

export type WorkspaceSnapshot = {
  projects: Project[]
  folders: Folder[]
  tags: Tag[]
}

export type WorkspaceBundle = {
  kind: 'meshlab-bundle'
  version: 1
  exportedAt: number
  folders: Folder[]
  tags: Tag[]
  projects: Project[]
}

export type ProjectFile = {
  kind: 'meshlab-project'
  version: 1
  exportedAt: number
  project: Omit<Project, 'folderId' | 'tagIds'> & {
    folderName?: string
    tags: Array<{ name: string; color: string }>
  }
}

export const ACCENT_COLORS = [
  '#0b7a6c',
  '#2f6fd6',
  '#6366f1',
  '#8b4fd6',
  '#d9468f',
  '#e08a00',
  '#15803d',
  '#64748b',
] as const

export const DEFAULT_FOLDER_COLOR = ACCENT_COLORS[0]
export const DEFAULT_TAG_COLOR = ACCENT_COLORS[1]

export function blankCircuit(): Circuit {
  return { version: 1, components: [], wires: [], junctions: [] }
}
