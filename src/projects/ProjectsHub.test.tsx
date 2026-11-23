// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { examples } from '../circuit/examples'
import { translate, type Language } from '../locale'
import { palettes } from '../palette'
import { blankCircuit, type Folder, type Project } from '../storage/types'
import { filterAndSortProjects } from './filters'
import { ProjectsHub, type ProjectsHubProps } from './ProjectsHub'

afterEach(cleanup)

const foldersFixture: Folder[] = [
  { id: 'f1', name: 'Labs', color: '#0b7a6c', order: 0, createdAt: 1000 },
  { id: 'f2', name: 'Power', color: '#e08a00', order: 1, createdAt: 2000 },
]

const now = Date.now()
const projectsFixture: Project[] = [
  {
    id: 'p1',
    name: 'Beta Filter',
    description: 'Low-pass RC network',
    folderId: 'f1',
    tagIds: [],
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
    tagIds: [],
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
    onQuickTemplate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('filterAndSortProjects', () => {
  it('combines smart views, folders, search, and sorting', () => {
    expect(filterAndSortProjects(projectsFixture, {
      selection: { kind: 'smart', view: 'pinned' },
      query: '',
      sort: 'updated',
      now,
    }).map(p => p.id)).toEqual(['p1'])

    expect(filterAndSortProjects(projectsFixture, {
      selection: { kind: 'smart', view: 'unfiled' },
      query: '',
      sort: 'updated',
      now,
    }).map(p => p.id)).toEqual(['p3'])

    expect(filterAndSortProjects(projectsFixture, {
      selection: { kind: 'smart', view: 'recent' },
      query: '',
      sort: 'name',
      now,
    }).map(p => p.id)).toEqual(['p2', 'p1'])

    expect(filterAndSortProjects(projectsFixture, {
      selection: { kind: 'folder', folderId: 'f1' },
      query: '',
      sort: 'updated',
      now,
    }).map(p => p.id)).toEqual(['p1'])

    expect(filterAndSortProjects(projectsFixture, {
      selection: { kind: 'smart', view: 'all' },
      query: 'divider',
      sort: 'name',
      now,
    }).map(p => p.id)).toEqual(['p2'])
  })
})

describe('ProjectsHub UI (sidebar-free, tag-free, wizard modal)', () => {
  it('filters by smart view, folder, and search without sidebar or tags, and switches grid/list views', () => {
    const props = makeProps()
    const { container } = render(<ProjectsHub {...props} />)

    expect(container.querySelector('.hub-sidebar')).toBeNull()
    expect(screen.queryByText('Tags')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Beta Filter' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Alpha Supply' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Scratchpad' })).toBeTruthy()

    // Filter by Favorites
    fireEvent.click(screen.getByRole('button', { name: /Favorites/ }))
    expect(screen.getByRole('button', { name: 'Beta Filter' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Alpha Supply' })).toBeNull()

    // Filter by folder pill
    fireEvent.click(screen.getByRole('button', { name: /^Power\b/ }))
    expect(screen.getByRole('button', { name: 'Alpha Supply' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Beta Filter' })).toBeNull()

    // Back to All projects and search
    fireEvent.click(screen.getByRole('button', { name: /All projects/ }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search projects' }), { target: { value: 'divider' } })
    expect(screen.getByRole('button', { name: 'Alpha Supply' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Beta Filter' })).toBeNull()

    // Toggle list view
    fireEvent.click(screen.getByRole('button', { name: 'List view' }))
    expect(screen.getByRole('button', { name: 'List view' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('walks through the 3-step Circuit wizard and submits a blank schematic', () => {
    const props = makeProps()
    render(<ProjectsHub {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'New project' }))
    const dialog = screen.getByRole('dialog', { name: 'New project' })

    // Step 1: Type (defaults to Circuit with SVG artwork)
    expect(within(dialog).getByRole('radio', { name: /Circuit/ }).getAttribute('aria-checked')).toBe('true')
    expect(dialog.querySelector('svg.wizard-art')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }))

    // Step 2: Start (defaults to Blank schematic)
    expect(within(dialog).getByRole('radio', { name: /Blank schematic/ }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }))

    // Step 3: Details (no tags field)
    expect(within(dialog).queryByText('Tags')).toBeNull()
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Project name' }), { target: { value: 'My Blank Lab' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create project' }))

    expect(props.onCreateProject).toHaveBeenCalledWith(expect.objectContaining({
      name: 'My Blank Lab',
      preferredView: 'schematic',
      circuit: blankCircuit(),
    }))
  })

  it('walks through the 4-step Breadboard wizard choosing Full size with SVG board previews', () => {
    const props = makeProps()
    render(<ProjectsHub {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'New project' }))
    const dialog = screen.getByRole('dialog', { name: 'New project' })

    // Step 1: Select Breadboard
    fireEvent.click(within(dialog).getByRole('radio', { name: /Breadboard/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }))

    // Step 2: Select Full breadboard size
    expect(dialog.querySelectorAll('svg.wizard-size-art')).toHaveLength(3)
    fireEvent.click(within(dialog).getByRole('radio', { name: /Full.*830/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }))

    // Step 3: Keep Blank breadboard
    expect(within(dialog).getByRole('radio', { name: /Blank breadboard/ }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }))

    // Step 4: Details
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Project name' }), { target: { value: 'Full Proto' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create project' }))

    expect(props.onCreateProject).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Full Proto',
      preferredView: 'board',
      boardSettings: { size: 'full', rails: true, splitRails: false, labels: true },
      circuit: { version: 1, components: [], wires: [], junctions: [], breadboard: { placements: [], jumpers: [] } },
    }))
  })

  it('creates a folder from the inline ribbon popover, shows empty state hero SVG, and renders Spanish copy', () => {
    const props = makeProps({ projects: [], folders: [], openProjectIds: [], storageMode: 'memory' }, 'es')
    const { container } = render(<ProjectsHub {...props} />)

    expect(screen.getByRole('heading', { name: 'Proyectos' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toMatch(/IndexedDB no está disponible/)
    expect(screen.getByRole('heading', { name: 'Sin proyectos' })).toBeTruthy()
    expect(container.querySelector('svg.hub-hero-art')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Nueva carpeta' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre de la carpeta' }), { target: { value: 'Prácticas' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }))
    expect(props.onCreateFolder).toHaveBeenCalledWith('Prácticas', expect.any(String))
  })

  it('opens the About & release notes modal from the Hub footer and dismisses the Home-only GitHub star pill', () => {
    localStorage.clear()
    sessionStorage.clear()
    const props = makeProps({}, 'es')
    render(<ProjectsHub {...props} />)

    // GitHub star pill appears on first Home visit and can be dismissed
    const starLink = screen.getByRole('link', { name: /Apoyar en GitHub/ })
    expect(starLink.getAttribute('href')).toBe('https://github.com/cristianruben-dev/meshlab')
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar' }))
    expect(screen.queryByRole('link', { name: /Apoyar en GitHub/ })).toBeNull()

    // Open About modal from footer (minimal, no release notes or DB badges)
    fireEvent.click(screen.getByRole('button', { name: /v1\.0\.0.*Acerca de/ }))
    const dialog = screen.getByRole('dialog', { name: 'Acerca de Meshlab' })
    expect(dialog.textContent).toContain('v1.0.0')
    expect(dialog.textContent).not.toContain('IndexedDB')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Acerca de Meshlab' })).toBeNull()
  })
})
