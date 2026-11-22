// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { examples } from '../circuit/examples'
import { translate, type Language } from '../locale'
import { palettes } from '../palette'
import { blankCircuit, type Folder, type Project, type Tag } from '../storage/types'
import { filterAndSortProjects } from './filters'
import { ProjectsHub, type ProjectsHubProps } from './ProjectsHub'

afterEach(cleanup)

const foldersFixture: Folder[] = [
  { id: 'f1', name: 'Labs', color: '#0b7a6c', order: 0, createdAt: 1000 },
  { id: 'f2', name: 'Power', color: '#e08a00', order: 1, createdAt: 2000 },
]

const tagsFixture: Tag[] = [
  { id: 't1', name: 'Analog', color: '#2f6fd6', createdAt: 1000 },
  { id: 't2', name: 'RC', color: '#8b4fd6', createdAt: 1000 },
]

const now = Date.now()
const projectsFixture: Project[] = [
  {
    id: 'p1',
    name: 'Beta Filter',
    description: 'Low-pass RC network',
    folderId: 'f1',
    tagIds: ['t1', 't2'],
    pinned: true,
    preferredView: 'schematic',
    circuit: examples['RC Charging'],
    createdAt: now - 300_000,
    updatedAt: now - 60_000,
  },
  {
    id: 'p2',
    name: 'Alpha Supply',
    description: 'Voltage divider test',
    folderId: 'f2',
    tagIds: ['t1'],
    pinned: false,
    preferredView: 'board',
    circuit: examples['Voltage Divider'],
    createdAt: now - 100_000,
    updatedAt: now - 20_000,
  },
  {
    id: 'p3',
    name: 'Scratchpad',
    description: '',
    folderId: null,
    tagIds: [],
    pinned: false,
    preferredView: 'schematic',
    circuit: blankCircuit(),
    createdAt: now - 10 * 24 * 60 * 60 * 1000,
    updatedAt: now - 10 * 24 * 60 * 60 * 1000,
  },
]

function makeProps(overrides: Partial<ProjectsHubProps> = {}, language: Language = 'en'): ProjectsHubProps {
  return {
    projects: projectsFixture,
    folders: foldersFixture,
    tags: tagsFixture,
    openProjectIds: ['p1'],
    storageMode: 'indexeddb',
    language,
    preference: 'system',
    palette: palettes.light,
    t: value => translate(language, value),
    notice: null,
    onDismissNotice: vi.fn(),
    onLanguageChange: vi.fn(),
    onThemeChange: vi.fn(),
    onOpenProject: vi.fn(),
    onReturnToEditor: vi.fn(),
    onCreateProject: vi.fn().mockResolvedValue(undefined),
    onUpdateProject: vi.fn().mockResolvedValue(undefined),
    onRenameProject: vi.fn().mockResolvedValue(undefined),
    onTogglePin: vi.fn().mockResolvedValue(undefined),
    onDuplicateProject: vi.fn().mockResolvedValue(undefined),
    onDeleteProject: vi.fn().mockResolvedValue(undefined),
    onExportProject: vi.fn(),
    onExportBackup: vi.fn(),
    onExportFolder: vi.fn(),
    onImportFile: vi.fn().mockResolvedValue(undefined),
    onCreateFolder: vi.fn().mockResolvedValue(undefined),
    onUpdateFolder: vi.fn().mockResolvedValue(undefined),
    onDeleteFolder: vi.fn().mockResolvedValue(undefined),
    onCreateTag: vi.fn().mockResolvedValue({ id: 't3', name: 'New', color: '#0b7a6c', createdAt: now }),
    onUpdateTag: vi.fn().mockResolvedValue(undefined),
    onDeleteTag: vi.fn().mockResolvedValue(undefined),
    onQuickTemplate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('filterAndSortProjects', () => {
  it('combines smart views, folders, multi-tag filters, search, and sorting', () => {
    expect(filterAndSortProjects(projectsFixture, tagsFixture, {
      selection: { kind: 'smart', view: 'pinned' },
      selectedTagIds: [],
      query: '',
      sort: 'updated',
      now,
    }).map(p => p.id)).toEqual(['p1'])

    expect(filterAndSortProjects(projectsFixture, tagsFixture, {
      selection: { kind: 'smart', view: 'unfiled' },
      selectedTagIds: [],
      query: '',
      sort: 'updated',
      now,
    }).map(p => p.id)).toEqual(['p3'])

    expect(filterAndSortProjects(projectsFixture, tagsFixture, {
      selection: { kind: 'smart', view: 'recent' },
      selectedTagIds: [],
      query: '',
      sort: 'name',
      now,
    }).map(p => p.id)).toEqual(['p2', 'p1'])

    expect(filterAndSortProjects(projectsFixture, tagsFixture, {
      selection: { kind: 'smart', view: 'all' },
      selectedTagIds: ['t1', 't2'],
      query: '',
      sort: 'updated',
      now,
    }).map(p => p.id)).toEqual(['p1'])

    // Search matches tag names and descriptions as well as project titles.
    expect(filterAndSortProjects(projectsFixture, tagsFixture, {
      selection: { kind: 'smart', view: 'all' },
      selectedTagIds: [],
      query: 'analog',
      sort: 'name',
      now,
    }).map(p => p.id)).toEqual(['p2', 'p1'])
  })
})

describe('ProjectsHub UI', () => {
  it('filters by smart view, folder, tag, and search query, and switches between grid and list views', () => {
    const props = makeProps()
    render(<ProjectsHub {...props} />)

    expect(screen.getByRole('heading', { name: 'My Projects' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Beta Filter' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Alpha Supply' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Scratchpad' })).toBeTruthy()

    // Filter by Favorites
    fireEvent.click(screen.getByRole('button', { name: /Favorites/ }))
    expect(screen.getByRole('button', { name: 'Beta Filter' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Alpha Supply' })).toBeNull()

    // Back to All projects and filter by tag + search
    fireEvent.click(screen.getByRole('button', { name: /All projects/ }))
    fireEvent.click(screen.getByRole('button', { name: 'RC' }))
    expect(screen.getByRole('button', { name: 'Beta Filter' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Alpha Supply' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Clear tag filters' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search projects' }), { target: { value: 'divider' } })
    expect(screen.getByRole('button', { name: 'Alpha Supply' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Beta Filter' })).toBeNull()

    // Toggle list view
    fireEvent.click(screen.getByRole('button', { name: 'List view' }))
    expect(screen.getByRole('button', { name: 'List view' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('opens the New Project modal defaulting to Blank schematic and submits a blank circuit', async () => {
    const props = makeProps()
    render(<ProjectsHub {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'New project' }))
    const dialog = screen.getByRole('dialog', { name: 'New project' })
    expect(within(dialog).getByRole('radio', { name: /Blank schematic/ }).getAttribute('aria-checked')).toBe('true')

    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Project name' }), { target: { value: 'My Blank Lab' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create project' }))

    expect(props.onCreateProject).toHaveBeenCalledWith(expect.objectContaining({
      name: 'My Blank Lab',
      preferredView: 'schematic',
      circuit: blankCircuit(),
    }))
  })

  it('creates a folder from the sidebar, shows empty state when no projects exist, and renders Spanish copy', () => {
    const props = makeProps({ projects: [], folders: [], tags: [], openProjectIds: [], storageMode: 'memory' }, 'es')
    render(<ProjectsHub {...props} />)

    expect(screen.getByRole('heading', { name: 'Mis Proyectos' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toMatch(/IndexedDB no está disponible/)
    expect(screen.getByRole('heading', { name: 'Tu espacio local de circuitos' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Nueva carpeta' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre de la carpeta' }), { target: { value: 'Prácticas' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }))
    expect(props.onCreateFolder).toHaveBeenCalledWith('Prácticas', expect.any(String))
  })
})
