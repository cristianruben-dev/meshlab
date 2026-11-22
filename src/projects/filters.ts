import type { Language, Translate } from '../locale'
import type { Project, Tag } from '../storage/types'

export type SmartView = 'all' | 'recent' | 'pinned' | 'unfiled'
export type NavSelection = { kind: 'smart'; view: SmartView } | { kind: 'folder'; folderId: string }
export type ProjectSort = 'updated' | 'name' | 'created'

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

export function isRecentProject(project: Project, now = Date.now()): boolean {
  return now - project.updatedAt <= RECENT_WINDOW_MS
}

export function filterAndSortProjects(
  projects: Project[],
  tags: Tag[],
  options: {
    selection: NavSelection
    selectedTagIds: string[]
    query: string
    sort: ProjectSort
    now?: number
  },
): Project[] {
  const now = options.now ?? Date.now()
  const tagNameById = new Map(tags.map(tag => [tag.id, normalizeSearch(tag.name)]))
  const q = normalizeSearch(options.query)

  const filtered = projects.filter(project => {
    if (options.selection.kind === 'folder') {
      if (project.folderId !== options.selection.folderId) return false
    } else if (options.selection.view === 'pinned') {
      if (!project.pinned) return false
    } else if (options.selection.view === 'unfiled') {
      if (project.folderId !== null) return false
    } else if (options.selection.view === 'recent') {
      if (!isRecentProject(project, now)) return false
    }

    if (options.selectedTagIds.length > 0) {
      for (const required of options.selectedTagIds) {
        if (!project.tagIds.includes(required)) return false
      }
    }

    if (q) {
      const haystack = [
        normalizeSearch(project.name),
        normalizeSearch(project.description),
        ...project.tagIds.map(id => tagNameById.get(id) ?? ''),
      ].join(' ')
      if (!haystack.includes(q)) return false
    }

    return true
  })

  const sorted = [...filtered]
  if (options.sort === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  } else if (options.sort === 'created') {
    sorted.sort((a, b) => b.createdAt - a.createdAt || b.updatedAt - a.updatedAt)
  } else {
    sorted.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)
  }
  return sorted
}

export function formatRelativeTime(timestamp: number, language: Language, t: Translate, now = Date.now()): string {
  const diff = Math.max(0, now - timestamp)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return t('Just now')
  if (minutes < 60) return language === 'es' ? `Hace ${minutes} min` : `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return language === 'es' ? `Hace ${hours} h` : `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 14) return language === 'es' ? `Hace ${days} d` : `${days}d ago`
  return new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(timestamp))
}
