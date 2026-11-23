import { useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  CircuitBoard,
  Clock,
  Download,
  Ellipsis,
  Folder as FolderIcon,
  FolderPlus,
  HardDrive,
  Inbox,
  Layers,
  LayoutGrid,
  LayoutTemplate,
  List,
  Palette as PaletteIcon,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TooltipProvider } from '@/components/ui/tooltip'
import { examples } from '../circuit/examples'
import { diagnostic, type Language, type Translate } from '../locale'
import type { Palette } from '../palette'
import { ACCENT_COLORS, DEFAULT_FOLDER_COLOR, type Folder, type Project } from '../storage/types'
import type { ThemePreference } from '../theme'
import { LanguageSelect, ThemeSwitch } from '../workspace/ChromeControls'
import { ResistorColorModal } from '../tools/ResistorColorTool'
import { CircuitPreview } from './CircuitPreview'
import { ConfirmDialog } from './ConfirmDialog'
import { filterAndSortProjects, isRecentProject, type NavSelection, type ProjectSort, type SmartView } from './filters'
import { ProjectCard } from './ProjectCard'
import { ProjectModal, type ProjectModalSubmit, type StartingPoint } from './ProjectModal'
import { EmptyWorkspaceArt } from './WizardArt'

const templateNames = Object.keys(examples)

type ConfirmState =
  | { kind: 'project'; project: Project }
  | { kind: 'folder'; folder: Folder }
  | null

type ModalState =
  | { mode: 'create'; startingPoint?: StartingPoint; template?: string }
  | { mode: 'edit'; project: Project }
  | null

export type ProjectsHubProps = {
  projects: Project[]
  folders: Folder[]
  openProjectIds: string[]
  storageMode: 'indexeddb' | 'memory'
  language: Language
  preference: ThemePreference
  palette: Palette
  t: Translate
  notice?: { text: string; error?: boolean } | null
  onDismissNotice: () => void
  onLanguageChange: (language: Language) => void
  onThemeChange: (preference: ThemePreference) => void
  onOpenProject: (project: Project) => void
  onReturnToEditor: () => void
  onCreateProject: (data: ProjectModalSubmit) => Promise<void>
  onUpdateProject: (id: string, data: ProjectModalSubmit) => Promise<void>
  onRenameProject: (project: Project, name: string) => Promise<void>
  onTogglePin: (project: Project) => Promise<void>
  onDuplicateProject: (project: Project) => Promise<void>
  onDeleteProject: (project: Project) => Promise<void>
  onExportProject: (project: Project) => void
  onExportBackup: () => void
  onExportFolder: (folder: Folder) => void
  onImportFile: (file: File) => Promise<void>
  onCreateFolder: (name: string, color: string) => Promise<void>
  onUpdateFolder: (id: string, changes: { name?: string; color?: string }) => Promise<void>
  onDeleteFolder: (folder: Folder) => Promise<void>
  onQuickTemplate: (templateName: string, folderId: string | null) => Promise<void>
}

function ColorSwatches({ value, onChange, t }: { value: string; onChange: (color: string) => void; t: Translate }) {
  return (
    <div className="color-swatches" role="radiogroup" aria-label={t('Color')}>
      {ACCENT_COLORS.map(color => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={color}
          className={value === color ? 'swatch swatch-active' : 'swatch'}
          style={{ background: color }}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  )
}

export function ProjectsHub({
  projects,
  folders,
  openProjectIds,
  storageMode,
  language,
  preference,
  palette,
  t,
  notice,
  onDismissNotice,
  onLanguageChange,
  onThemeChange,
  onOpenProject,
  onReturnToEditor,
  onCreateProject,
  onUpdateProject,
  onRenameProject,
  onTogglePin,
  onDuplicateProject,
  onDeleteProject,
  onExportProject,
  onExportBackup,
  onExportFolder,
  onImportFile,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onQuickTemplate,
}: ProjectsHubProps) {
  const [selection, setSelection] = useState<NavSelection>({ kind: 'smart', view: 'all' })
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<ProjectSort>('updated')
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  const [templatesOpen, setTemplatesOpen] = useState(true)
  const [modal, setModal] = useState<ModalState>(null)
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [resistorToolOpen, setResistorToolOpen] = useState(false)
  const [folderPopoverOpen, setFolderPopoverOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderColor, setNewFolderColor] = useState<string>(DEFAULT_FOLDER_COLOR)
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null)
  const [editFolderName, setEditFolderName] = useState('')
  const [editFolderColor, setEditFolderColor] = useState<string>(DEFAULT_FOLDER_COLOR)
  const fileInput = useRef<HTMLInputElement>(null)

  const folderById = useMemo(() => new Map(folders.map(folder => [folder.id, folder])), [folders])
  const openSet = useMemo(() => new Set(openProjectIds), [openProjectIds])

  const activeSelection: NavSelection =
    selection.kind === 'folder' && !folderById.has(selection.folderId)
      ? { kind: 'smart', view: 'all' }
      : selection

  const visibleProjects = useMemo(
    () =>
      filterAndSortProjects(projects, {
        selection: activeSelection,
        query,
        sort,
      }),
    [projects, activeSelection, query, sort],
  )

  const smartCounts: Record<SmartView, number> = useMemo(() => ({
    all: projects.length,
    recent: projects.filter(p => isRecentProject(p)).length,
    pinned: projects.filter(p => p.pinned).length,
    unfiled: projects.filter(p => p.folderId === null).length,
  }), [projects])

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const project of projects) {
      if (project.folderId) counts.set(project.folderId, (counts.get(project.folderId) ?? 0) + 1)
    }
    return counts
  }, [projects])

  const activeFolder = activeSelection.kind === 'folder' ? folderById.get(activeSelection.folderId) : undefined
  const headingTitle = activeFolder
    ? activeFolder.name
    : activeSelection.kind === 'smart'
      ? activeSelection.view === 'all'
        ? t('Projects')
        : activeSelection.view === 'recent'
          ? t('Recent')
          : activeSelection.view === 'pinned'
            ? t('Favorites')
            : t('Unfiled')
      : t('Projects')

  const hasActiveFilters = Boolean(query.trim()) || activeSelection.kind === 'folder' || (activeSelection.kind === 'smart' && activeSelection.view !== 'all')
  const defaultNewFolderId = activeSelection.kind === 'folder' ? activeSelection.folderId : null

  function clearFilters() {
    setQuery('')
    setSelection({ kind: 'smart', view: 'all' })
  }

  async function handleModalSubmit(data: ProjectModalSubmit) {
    if (!modal) return
    const current = modal
    setModal(null)
    if (current.mode === 'create') {
      await onCreateProject(data)
    } else {
      await onUpdateProject(current.project.id, data)
    }
  }

  async function handleCreateFolderSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = newFolderName.trim()
    if (!trimmed) return
    await onCreateFolder(trimmed, newFolderColor)
    setNewFolderName('')
    setNewFolderColor(ACCENT_COLORS[(folders.length + 1) % ACCENT_COLORS.length])
    setFolderPopoverOpen(false)
  }

  async function handleEditFolderSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!editingFolder) return
    const trimmed = editFolderName.trim()
    if (!trimmed) return
    await onUpdateFolder(editingFolder.id, { name: trimmed, color: editFolderColor })
    setEditingFolder(null)
  }

  async function handleConfirmDelete() {
    if (!confirm) return
    const target = confirm
    setConfirm(null)
    if (target.kind === 'project') {
      await onDeleteProject(target.project)
    } else {
      if (selection.kind === 'folder' && selection.folderId === target.folder.id) {
        setSelection({ kind: 'smart', view: 'all' })
      }
      await onDeleteFolder(target.folder)
    }
  }

  const smartItems: Array<{ view: SmartView; label: string; icon: React.ReactNode }> = [
    { view: 'all', label: t('All projects'), icon: <Layers size={13} /> },
    { view: 'recent', label: t('Recent'), icon: <Clock size={13} /> },
    { view: 'pinned', label: t('Favorites'), icon: <Star size={13} /> },
    ...(folders.length > 0 ? [{ view: 'unfiled' as const, label: t('Unfiled'), icon: <Inbox size={13} /> }] : []),
  ]

  return (
    <TooltipProvider>
      <div className="hub hub-no-sidebar">
        <header className="hub-topbar">
          <div className="hub-topbar-left">
            <div className="brand">
              <div className="brand-icon"><CircuitBoard size={17} /></div>
              <div className="brand-text">
                <strong>Meshlab<span>.</span></strong>
                <small>{t('PROJECTS')}</small>
              </div>
            </div>
            {openProjectIds.length > 0 && (
              <Button variant="outline" size="sm" className="return-editor-btn" onClick={onReturnToEditor}>
                <span>{t('Back to editor')}</span>
                <span className="return-count">{openProjectIds.length}</span>
                <ArrowRight size={13} />
              </Button>
            )}
          </div>

          <div className="hub-search">
            <Search size={15} aria-hidden="true" />
            <Input
              type="search"
              value={query}
              aria-label={t('Search projects')}
              placeholder={t('Search projects or descriptions…')}
              onChange={event => setQuery(event.target.value)}
            />
            {query && (
              <button type="button" className="hub-search-clear" aria-label={t('Clear filters')} onClick={() => setQuery('')}>
                <X size={13} />
              </button>
            )}
          </div>

          <div className="hub-topbar-right">
            <Button size="sm" onClick={() => setModal({ mode: 'create', startingPoint: 'blank-schematic' })}>
              <Plus /> {t('New project')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              <Upload /> <span className="hub-btn-label">{t('Import')}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={onExportBackup} disabled={projects.length === 0 && folders.length === 0}>
              <Download /> <span className="hub-btn-label">{t('Export backup')}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setResistorToolOpen(true)}>
              <PaletteIcon /> <span className="hub-btn-label">{t('Color code')}</span>
            </Button>
            <span className="topbar-divider hub-hide-sm" aria-hidden="true" />
            <div className="hub-appearance">
              <ThemeSwitch value={preference} onChange={onThemeChange} t={t} />
              <LanguageSelect value={language} onChange={onLanguageChange} t={t} />
            </div>
          </div>

          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={event => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void onImportFile(file)
            }}
          />
        </header>

        <div className="hub-body hub-body-full">
          <main className="hub-main hub-main-centered">
            {storageMode === 'memory' && (
              <div role="alert" className="hub-banner hub-banner-warn">
                <AlertTriangle size={15} />
                <span>{t('IndexedDB is unavailable in this browser. Projects are kept in memory for this session only — export a backup to keep your work.')}</span>
              </div>
            )}

            {notice && (
              <div role={notice.error ? 'alert' : 'status'} className={notice.error ? 'hub-banner hub-banner-warn' : 'hub-banner hub-banner-ok'}>
                <span>{notice.error ? diagnostic(language, notice.text, true) : t(notice.text)}</span>
                <Button variant="ghost" size="icon-xs" aria-label={t('Close dialog')} onClick={onDismissNotice}>
                  <X size={13} />
                </Button>
              </div>
            )}

            <div className="hub-controls-bar">
              <div className="hub-heading-wrap">
                <h1 className="hub-heading">
                  {activeFolder && <span className="heading-dot" style={{ background: activeFolder.color }} aria-hidden="true" />}
                  {headingTitle}
                </h1>
                <span className="hub-count-badge">
                  {visibleProjects.length} {t(visibleProjects.length === 1 ? 'project' : 'projects')}
                </span>
              </div>

              <div className="hub-view-controls">
                {activeFolder && (
                  <Button variant="outline" size="sm" onClick={() => onExportFolder(activeFolder)}>
                    <Download size={13} /> {t('Export folder')}
                  </Button>
                )}
                <Select
                  items={{
                    updated: t('Last modified'),
                    name: t('Name A–Z'),
                    created: t('Date created'),
                  }}
                  value={sort}
                  onValueChange={next => {
                    if (next === 'updated' || next === 'name' || next === 'created') setSort(next)
                  }}
                >
                  <SelectTrigger size="sm" className="sort-trigger" aria-label={t('Sort projects')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="updated">{t('Last modified')}</SelectItem>
                    <SelectItem value="name">{t('Name A–Z')}</SelectItem>
                    <SelectItem value="created">{t('Date created')}</SelectItem>
                  </SelectContent>
                </Select>

                <div className="segmented layout-switch" role="group" aria-label={t('View layout')}>
                  <Button variant="ghost" size="icon-sm" aria-label={t('Grid view')} aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}>
                    <LayoutGrid size={14} />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={t('List view')} aria-pressed={layout === 'list'} onClick={() => setLayout('list')}>
                    <List size={14} />
                  </Button>
                </div>
              </div>
            </div>

            <nav className="hub-filter-ribbon" aria-label={t('Projects')}>
              <div className="hub-filter-group">
                {smartItems.map(item => {
                  const active = activeSelection.kind === 'smart' && activeSelection.view === item.view
                  return (
                    <button
                      key={item.view}
                      type="button"
                      className={active ? 'hub-pill hub-pill-active' : 'hub-pill'}
                      aria-pressed={active}
                      onClick={() => setSelection({ kind: 'smart', view: item.view })}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                      <span className="hub-pill-count">{smartCounts[item.view]}</span>
                    </button>
                  )
                })}
              </div>

              <span className="hub-ribbon-sep" aria-hidden="true" />

              <div className="hub-filter-group hub-folders-strip">
                {folders.map(folder => {
                  const active = activeSelection.kind === 'folder' && activeSelection.folderId === folder.id
                  const count = folderCounts.get(folder.id) ?? 0
                  return (
                    <div key={folder.id} className={active ? 'folder-pill-wrap folder-pill-wrap-active' : 'folder-pill-wrap'}>
                      <button
                        type="button"
                        className="folder-pill-btn"
                        aria-pressed={active}
                        onClick={() => setSelection({ kind: 'folder', folderId: folder.id })}
                      >
                        <FolderIcon size={13} style={{ color: folder.color }} />
                        <span>{folder.name}</span>
                        <span className="hub-pill-count">{count}</span>
                      </button>
                      <Popover>
                        <PopoverTrigger
                          render={
                            <button
                              type="button"
                              className="folder-pill-more"
                              aria-label={`${t('Folder actions')}: ${folder.name}`}
                            />
                          }
                        >
                          <Ellipsis size={13} />
                        </PopoverTrigger>
                        <PopoverContent className="action-menu" align="end">
                          <button
                            type="button"
                            className="action-menu-item"
                            onClick={() => {
                              setEditingFolder(folder)
                              setEditFolderName(folder.name)
                              setEditFolderColor(folder.color)
                            }}
                          >
                            <Pencil size={13} /> {t('Edit folder')}
                          </button>
                          <button
                            type="button"
                            className="action-menu-item"
                            onClick={() => onExportFolder(folder)}
                          >
                            <Download size={13} /> {t('Export folder')}
                          </button>
                          <div className="action-menu-sep" role="separator" />
                          <button
                            type="button"
                            className="action-menu-item action-menu-danger"
                            onClick={() => setConfirm({ kind: 'folder', folder })}
                          >
                            <Trash2 size={13} /> {t('Delete folder')}
                          </button>
                        </PopoverContent>
                      </Popover>
                    </div>
                  )
                })}

                <Popover open={folderPopoverOpen} onOpenChange={setFolderPopoverOpen}>
                  <PopoverTrigger
                    render={
                      <button type="button" className="hub-pill hub-pill-add">
                        <FolderPlus size={13} />
                        <span>{t('New folder')}</span>
                      </button>
                    }
                  />
                  <PopoverContent className="folder-popover" align="start">
                    <form className="inline-editor" onSubmit={handleCreateFolderSubmit}>
                      <Input
                        autoFocus
                        value={newFolderName}
                        maxLength={80}
                        aria-label={t('Folder name')}
                        placeholder={t('Folder name')}
                        onChange={event => setNewFolderName(event.target.value)}
                      />
                      <ColorSwatches value={newFolderColor} onChange={setNewFolderColor} t={t} />
                      <div className="inline-editor-actions">
                        <Button type="button" variant="ghost" size="xs" onClick={() => setFolderPopoverOpen(false)}>
                          {t('Cancel')}
                        </Button>
                        <Button type="submit" size="xs" disabled={!newFolderName.trim()}>
                          {t('Create')}
                        </Button>
                      </div>
                    </form>
                  </PopoverContent>
                </Popover>
              </div>
            </nav>

            {editingFolder && (
              <div className="modal-backdrop" onClick={() => setEditingFolder(null)}>
                <form
                  role="dialog"
                  aria-modal="true"
                  aria-label={t('Edit folder')}
                  className="confirm-card"
                  onClick={event => event.stopPropagation()}
                  onSubmit={handleEditFolderSubmit}
                >
                  <h2>{t('Edit folder')}</h2>
                  <Input
                    autoFocus
                    value={editFolderName}
                    maxLength={80}
                    aria-label={t('Folder name')}
                    onChange={event => setEditFolderName(event.target.value)}
                  />
                  <ColorSwatches value={editFolderColor} onChange={setEditFolderColor} t={t} />
                  <div className="confirm-actions">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditingFolder(null)}>
                      {t('Cancel')}
                    </Button>
                    <Button type="submit" size="sm" disabled={!editFolderName.trim()}>
                      {t('Save')}
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {projects.length === 0 ? (
              <section className="hub-empty-hero">
                <EmptyWorkspaceArt />
                <h2>{t('No projects yet')}</h2>
                <p>{t('Create a circuit, load a template, or import a JSON file.')}</p>
                <div className="hub-empty-actions">
                  <Button onClick={() => setModal({ mode: 'create', startingPoint: 'blank-schematic' })}>
                    <Plus /> {t('New project')}
                  </Button>
                  <Button variant="outline" onClick={() => setModal({ mode: 'create', startingPoint: 'template' })}>
                    <LayoutTemplate /> {t('From template')}
                  </Button>
                  <Button variant="outline" onClick={() => fileInput.current?.click()}>
                    <Upload /> {t('Import')}
                  </Button>
                </div>
              </section>
            ) : visibleProjects.length === 0 ? (
              <section className="hub-empty-filtered">
                <h2>{t('No projects match your filters')}</h2>
                <p>{t('Try adjusting your search query or selected folder.')}</p>
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    {t('Clear filters')}
                  </Button>
                )}
              </section>
            ) : (
              <section className={layout === 'grid' ? 'project-grid' : 'project-list'} aria-label={t('Projects')}>
                {visibleProjects.map(project => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    folder={project.folderId ? folderById.get(project.folderId) : undefined}
                    layout={layout}
                    isOpenInTab={openSet.has(project.id)}
                    palette={palette}
                    language={language}
                    t={t}
                    onOpen={onOpenProject}
                    onTogglePin={p => void onTogglePin(p)}
                    onRename={onRenameProject}
                    onEditDetails={p => setModal({ mode: 'edit', project: p })}
                    onDuplicate={p => void onDuplicateProject(p)}
                    onExport={onExportProject}
                    onDelete={p => setConfirm({ kind: 'project', project: p })}
                  />
                ))}
              </section>
            )}

            <section className="template-strip" aria-label={t('Templates')}>
              <button
                type="button"
                className="template-strip-toggle"
                aria-expanded={templatesOpen}
                onClick={() => setTemplatesOpen(prev => !prev)}
              >
                <span className="template-strip-heading">
                  <LayoutTemplate size={14} />
                  <span>{t('Templates')}</span>
                </span>
                <span className="template-strip-action">
                  {t(templatesOpen ? 'Hide templates' : 'Show templates')}
                  {templatesOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>

              {templatesOpen && (
                <div className="template-strip-grid">
                  {templateNames.map(name => (
                    <button
                      key={name}
                      type="button"
                      className="template-card"
                      onClick={() => void onQuickTemplate(name, defaultNewFolderId)}
                    >
                      <CircuitPreview circuit={examples[name]} palette={palette} t={t} compact />
                      <div className="template-card-meta">
                        <strong>{t(name)}</strong>
                        <span>{examples[name].components.length} {t('parts')} · {t('Use template')}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <footer className="hub-local-footer">
              <div className={storageMode === 'indexeddb' ? 'storage-pill' : 'storage-pill storage-pill-warn'}>
                <HardDrive size={13} />
                <span>{storageMode === 'indexeddb' ? t('Local · IndexedDB') : t('Temporary session storage')}</span>
              </div>
            </footer>
          </main>
        </div>

        <ProjectModal
          open={Boolean(modal)}
          mode={modal?.mode ?? 'create'}
          initialProject={modal?.mode === 'edit' ? modal.project : undefined}
          defaultFolderId={defaultNewFolderId}
          defaultStartingPoint={modal?.mode === 'create' ? modal.startingPoint : undefined}
          defaultTemplate={modal?.mode === 'create' ? modal.template : undefined}
          folders={folders}
          palette={palette}
          t={t}
          onSubmit={handleModalSubmit}
          onClose={() => setModal(null)}
        />

        <ConfirmDialog
          open={Boolean(confirm)}
          title={confirm?.kind === 'project' ? t('Delete project?') : t('Delete folder?')}
          description={
            confirm?.kind === 'project'
              ? `${confirm.project.name} — ${t('This permanently removes the project from your browser storage.')}`
              : confirm?.kind === 'folder'
                ? `${confirm.folder.name} — ${t('Projects inside this folder will move to Unfiled and will not be deleted.')}`
                : ''
          }
          confirmLabel={confirm?.kind === 'project' ? t('Delete project') : t('Delete folder')}
          t={t}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setConfirm(null)}
        />

        <ResistorColorModal
          open={resistorToolOpen}
          language={language}
          t={t}
          onClose={() => setResistorToolOpen(false)}
        />
      </div>
    </TooltipProvider>
  )
}
