import { useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  CircuitBoard,
  Download,
  LayoutGrid,
  List,
  PanelLeft,
  Plus,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TooltipProvider } from '@/components/ui/tooltip'
import { examples } from '../circuit/examples'
import { diagnostic, type Language, type Translate } from '../locale'
import type { Palette } from '../palette'
import type { Folder, Project, Tag } from '../storage/types'
import type { ThemePreference } from '../theme'
import { LanguageSelect, ThemeSwitch } from '../workspace/ChromeControls'
import { CircuitPreview } from './CircuitPreview'
import { ConfirmDialog } from './ConfirmDialog'
import { filterAndSortProjects, type NavSelection, type ProjectSort } from './filters'
import { FolderSidebar } from './FolderSidebar'
import { ProjectCard } from './ProjectCard'
import { ProjectModal, type ProjectModalSubmit, type StartingPoint } from './ProjectModal'

const templateNames = Object.keys(examples)

type ConfirmState =
  | { kind: 'project'; project: Project }
  | { kind: 'folder'; folder: Folder }
  | { kind: 'tag'; tag: Tag }
  | null

type ModalState =
  | { mode: 'create'; startingPoint?: StartingPoint; template?: string }
  | { mode: 'edit'; project: Project }
  | null

export type ProjectsHubProps = {
  projects: Project[]
  folders: Folder[]
  tags: Tag[]
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
  onCreateTag: (name: string, color: string) => Promise<Tag>
  onUpdateTag: (id: string, changes: { name?: string; color?: string }) => Promise<void>
  onDeleteTag: (tag: Tag) => Promise<void>
  onQuickTemplate: (templateName: string, folderId: string | null) => Promise<void>
}

export function ProjectsHub({
  projects,
  folders,
  tags,
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
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
  onQuickTemplate,
}: ProjectsHubProps) {
  const [selection, setSelection] = useState<NavSelection>({ kind: 'smart', view: 'all' })
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<ProjectSort>('updated')
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  const [templatesOpen, setTemplatesOpen] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [modal, setModal] = useState<ModalState>(null)
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const folderById = useMemo(() => new Map(folders.map(folder => [folder.id, folder])), [folders])
  const tagById = useMemo(() => new Map(tags.map(tag => [tag.id, tag])), [tags])
  const openSet = useMemo(() => new Set(openProjectIds), [openProjectIds])

  // If the currently viewed folder gets deleted, fall back to All projects.
  const activeSelection: NavSelection =
    selection.kind === 'folder' && !folderById.has(selection.folderId)
      ? { kind: 'smart', view: 'all' }
      : selection

  const activeSelectedTagIds = useMemo(
    () => selectedTagIds.filter(id => tagById.has(id)),
    [selectedTagIds, tagById],
  )

  const visibleProjects = useMemo(
    () =>
      filterAndSortProjects(projects, tags, {
        selection: activeSelection,
        selectedTagIds: activeSelectedTagIds,
        query,
        sort,
      }),
    [projects, tags, activeSelection, activeSelectedTagIds, query, sort],
  )

  const activeFolder = activeSelection.kind === 'folder' ? folderById.get(activeSelection.folderId) : undefined
  const headingTitle = activeFolder
    ? activeFolder.name
    : activeSelection.kind === 'smart'
      ? activeSelection.view === 'all'
        ? t('My Projects')
        : activeSelection.view === 'recent'
          ? t('Recent')
          : activeSelection.view === 'pinned'
            ? t('Favorites')
            : t('Unfiled')
      : t('My Projects')

  const hasActiveFilters = Boolean(query.trim()) || activeSelectedTagIds.length > 0 || activeSelection.kind === 'folder' || (activeSelection.kind === 'smart' && activeSelection.view !== 'all')
  const defaultNewFolderId = activeSelection.kind === 'folder' ? activeSelection.folderId : null

  function toggleTagFilter(tagId: string) {
    setSelectedTagIds(prev => prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId])
  }

  function clearFilters() {
    setQuery('')
    setSelectedTagIds([])
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

  async function handleConfirmDelete() {
    if (!confirm) return
    const target = confirm
    setConfirm(null)
    if (target.kind === 'project') {
      await onDeleteProject(target.project)
    } else if (target.kind === 'folder') {
      if (selection.kind === 'folder' && selection.folderId === target.folder.id) {
        setSelection({ kind: 'smart', view: 'all' })
      }
      await onDeleteFolder(target.folder)
    } else {
      setSelectedTagIds(prev => prev.filter(id => id !== target.tag.id))
      await onDeleteTag(target.tag)
    }
  }

  return (
    <TooltipProvider>
      <div className="hub">
        <header className="hub-topbar">
          <div className="hub-topbar-left">
            <Button
              variant="ghost"
              size="icon-sm"
              className="hub-sidebar-toggle"
              aria-label={t('Open folders and tags')}
              onClick={() => setSidebarOpen(true)}
            >
              <PanelLeft size={16} />
            </Button>
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
              placeholder={t('Search projects, descriptions, or tags…')}
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
            <Button variant="ghost" size="sm" onClick={onExportBackup} disabled={projects.length === 0 && folders.length === 0 && tags.length === 0}>
              <Download /> <span className="hub-btn-label">{t('Export backup')}</span>
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

        <div className="hub-body">
          <FolderSidebar
            projects={projects}
            folders={folders}
            tags={tags}
            selection={activeSelection}
            selectedTagIds={activeSelectedTagIds}
            storageMode={storageMode}
            mobileOpen={sidebarOpen}
            t={t}
            onCloseMobile={() => setSidebarOpen(false)}
            onSelectNav={setSelection}
            onToggleTagFilter={toggleTagFilter}
            onClearTagFilters={() => setSelectedTagIds([])}
            onCreateFolder={onCreateFolder}
            onUpdateFolder={onUpdateFolder}
            onDeleteFolder={folder => setConfirm({ kind: 'folder', folder })}
            onExportFolder={onExportFolder}
            onCreateTag={async (name, color) => { await onCreateTag(name, color) }}
            onUpdateTag={onUpdateTag}
            onDeleteTag={tag => setConfirm({ kind: 'tag', tag })}
          />

          <main className="hub-main">
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

            {activeSelectedTagIds.length > 0 && (
              <div className="active-filters">
                {activeSelectedTagIds.map(id => {
                  const tag = tagById.get(id)
                  if (!tag) return null
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      className="tag-pill tag-pill-active"
                      style={{ '--tag-color': tag.color } as React.CSSProperties}
                      onClick={() => toggleTagFilter(tag.id)}
                    >
                      <span className="tag-dot" aria-hidden="true" />
                      <span>{tag.name}</span>
                      <X size={11} />
                    </button>
                  )
                })}
                <button type="button" className="clear-link" onClick={clearFilters}>
                  {t('Clear filters')}
                </button>
              </div>
            )}

            {projects.length === 0 ? (
              <section className="hub-empty-hero">
                <span className="hub-empty-icon" aria-hidden="true"><CircuitBoard size={28} /></span>
                <h2>{t('Your local circuit workspace')}</h2>
                <p>{t('Create a blank circuit, start from a template, or import an existing Meshlab JSON file. Everything stays 100% private in your browser.')}</p>
                <div className="hub-empty-actions">
                  <Button onClick={() => setModal({ mode: 'create', startingPoint: 'blank-schematic' })}>
                    <Plus /> {t('New blank project')}
                  </Button>
                  <Button variant="outline" onClick={() => setModal({ mode: 'create', startingPoint: 'template' })}>
                    <Sparkles /> {t('From template')}
                  </Button>
                  <Button variant="outline" onClick={() => fileInput.current?.click()}>
                    <Upload /> {t('Import')}
                  </Button>
                </div>
              </section>
            ) : visibleProjects.length === 0 ? (
              <section className="hub-empty-filtered">
                <h2>{t('No projects match your filters')}</h2>
                <p>{t('Try adjusting your search query, folder, or selected tags.')}</p>
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
                    tags={project.tagIds.map(id => tagById.get(id)).filter((tag): tag is Tag => Boolean(tag))}
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

            <section className="template-strip" aria-label={t('Quick-start templates')}>
              <button
                type="button"
                className="template-strip-toggle"
                aria-expanded={templatesOpen}
                onClick={() => setTemplatesOpen(prev => !prev)}
              >
                <span className="template-strip-heading">
                  <Sparkles size={14} />
                  <span>{t('Quick-start templates')}</span>
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
          tags={tags}
          palette={palette}
          t={t}
          onCreateTag={onCreateTag}
          onSubmit={handleModalSubmit}
          onClose={() => setModal(null)}
        />

        <ConfirmDialog
          open={Boolean(confirm)}
          title={
            confirm?.kind === 'project'
              ? t('Delete project?')
              : confirm?.kind === 'folder'
                ? t('Delete folder?')
                : t('Delete tag?')
          }
          description={
            confirm?.kind === 'project'
              ? `${confirm.project.name} — ${t('This permanently removes the project from your browser storage.')}`
              : confirm?.kind === 'folder'
                ? `${confirm.folder.name} — ${t('Projects inside this folder will move to Unfiled and will not be deleted.')}`
                : confirm?.kind === 'tag'
                  ? `${confirm.tag.name} — ${t('This tag will be removed from all projects.')}`
                  : ''
          }
          confirmLabel={
            confirm?.kind === 'project'
              ? t('Delete project')
              : confirm?.kind === 'folder'
                ? t('Delete folder')
                : t('Delete tag')
          }
          t={t}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setConfirm(null)}
        />
      </div>
    </TooltipProvider>
  )
}
