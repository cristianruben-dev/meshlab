import { useState } from 'react'
import {
  ArrowLeft,
  Check,
  CircleAlert,
  CircleCheck,
  CircuitBoard,
  Folder as FolderIcon,
  Loader2,
  Pencil,
  Plus,
  SlidersHorizontal,
  Waypoints,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Translate } from '../locale'
import type { Folder, PreferredView, Project, Tag } from '../storage/types'

export type SaveState = 'saved' | 'saving' | 'error' | 'memory'

type ProjectTabsProps = {
  activeProject: Project
  projects: Project[]
  folders: Folder[]
  tags: Tag[]
  openProjectIds: string[]
  saveState: SaveState
  t: Translate
  onBackToHub: () => void
  onSelectTab: (projectId: string) => void
  onCloseTab: (projectId: string) => void
  onOpenProject: (projectId: string) => void
  onQuickCreateBlank: (view?: PreferredView) => void
  onOpenNewProjectModal: () => void
  onRenameActive: (name: string) => Promise<void>
  onEditActiveDetails: () => void
}

export function ProjectTabs({
  activeProject,
  projects,
  folders,
  tags,
  openProjectIds,
  saveState,
  t,
  onBackToHub,
  onSelectTab,
  onCloseTab,
  onOpenProject,
  onQuickCreateBlank,
  onOpenNewProjectModal,
  onRenameActive,
  onEditActiveDetails,
}: ProjectTabsProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [switcherOpen, setSwitcherOpen] = useState(false)

  const projectById = new Map(projects.map(project => [project.id, project]))
  const folderById = new Map(folders.map(folder => [folder.id, folder]))
  const tagById = new Map(tags.map(tag => [tag.id, tag]))
  const openProjects = openProjectIds
    .map(id => projectById.get(id))
    .filter((project): project is Project => Boolean(project))
  const otherProjects = projects.filter(project => !openProjectIds.includes(project.id))
  const activeTags = activeProject.tagIds
    .map(id => tagById.get(id))
    .filter((tag): tag is Tag => Boolean(tag))

  async function commitRename() {
    const trimmed = draftName.trim()
    setRenamingId(null)
    if (trimmed && trimmed !== activeProject.name) {
      await onRenameActive(trimmed)
    }
  }

  return (
    <div className="project-tabs-bar" aria-label={t('Open tabs')}>
      <Button
        variant="ghost"
        size="xs"
        className="back-projects-btn"
        onClick={onBackToHub}
      >
        <ArrowLeft size={14} />
        <span>{t('Projects')}</span>
      </Button>

      <span className="tabs-divider" aria-hidden="true" />

      <div className="project-tablist" role="tablist" aria-label={t('Open tabs')}>
        {openProjects.map(project => {
          const isActive = project.id === activeProject.id
          const folder = project.folderId ? folderById.get(project.folderId) : undefined
          if (isActive && renamingId === project.id) {
            return (
              <form
                key={project.id}
                className="project-tab project-tab-active project-tab-editing"
                onSubmit={event => {
                  event.preventDefault()
                  void commitRename()
                }}
              >
                <Input
                  autoFocus
                  value={draftName}
                  maxLength={120}
                  aria-label={t('Rename project')}
                  onChange={event => setDraftName(event.target.value)}
                  onBlur={() => void commitRename()}
                  onKeyDown={event => {
                    if (event.key === 'Escape') {
                      event.stopPropagation()
                      setRenamingId(null)
                    }
                  }}
                />
                <Button type="submit" variant="ghost" size="icon-xs" aria-label={t('Save')}>
                  <Check size={12} />
                </Button>
              </form>
            )
          }
          return (
            <div
              key={project.id}
              className={isActive ? 'project-tab project-tab-active' : 'project-tab'}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                className="project-tab-trigger"
                onClick={() => onSelectTab(project.id)}
                onDoubleClick={() => {
                  if (isActive) {
                    setDraftName(project.name)
                    setRenamingId(project.id)
                  }
                }}
              >
                {folder && (
                  <span
                    className="tab-folder-dot"
                    style={{ background: folder.color }}
                    title={folder.name}
                    aria-hidden="true"
                  />
                )}
                <span className="tab-type-icon" aria-hidden="true">
                  {project.preferredView === 'board' ? <CircuitBoard size={12} /> : <Waypoints size={12} />}
                </span>
                <span className="project-tab-name">{project.name}</span>
              </button>
              <button
                type="button"
                className="project-tab-close"
                aria-label={`${t('Close tab')}: ${project.name}`}
                onClick={event => {
                  event.stopPropagation()
                  onCloseTab(project.id)
                }}
              >
                <X size={12} />
              </button>
            </div>
          )
        })}

        <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="project-tab-add"
                aria-label={t('Open or create project')}
              />
            }
          >
            <Plus size={14} />
          </PopoverTrigger>
          <PopoverContent className="tab-switcher-menu" align="start">
            <div className="tab-switcher-actions">
              <button
                type="button"
                className="action-menu-item"
                onClick={() => {
                  setSwitcherOpen(false)
                  onOpenNewProjectModal()
                }}
              >
                <Plus size={13} /> {t('New project')}…
              </button>
              <button
                type="button"
                className="action-menu-item"
                onClick={() => {
                  setSwitcherOpen(false)
                  onQuickCreateBlank('schematic')
                }}
              >
                <Waypoints size={13} /> {t('New blank circuit')}
              </button>
              <button
                type="button"
                className="action-menu-item"
                onClick={() => {
                  setSwitcherOpen(false)
                  onQuickCreateBlank('board')
                }}
              >
                <CircuitBoard size={13} /> {t('New blank breadboard')}
              </button>
            </div>

            {otherProjects.length > 0 && (
              <>
                <div className="action-menu-sep" role="separator" />
                <div className="tab-switcher-label">{t('Open another project')}</div>
                <div className="tab-switcher-list">
                  {otherProjects.map(project => {
                    const folder = project.folderId ? folderById.get(project.folderId) : undefined
                    return (
                      <button
                        key={project.id}
                        type="button"
                        className="action-menu-item"
                        onClick={() => {
                          setSwitcherOpen(false)
                          onOpenProject(project.id)
                        }}
                      >
                        <FolderIcon size={13} style={{ color: folder?.color }} />
                        <span className="switcher-item-name">{project.name}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </PopoverContent>
        </Popover>
      </div>

      <div className="project-tabs-meta">
        {activeTags.slice(0, 2).map(tag => (
          <span key={tag.id} className="tab-tag-chip" style={{ '--tag-color': tag.color } as React.CSSProperties}>
            <span className="tag-dot" aria-hidden="true" />
            <span>{tag.name}</span>
          </span>
        ))}
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t('Rename project')}
          onClick={() => {
            setDraftName(activeProject.name)
            setRenamingId(activeProject.id)
          }}
        >
          <Pencil size={12} />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t('Project details')}
          onClick={onEditActiveDetails}
        >
          <SlidersHorizontal size={12} />
        </Button>
        <span
          className={
            saveState === 'error' || saveState === 'memory'
              ? 'save-indicator save-indicator-warn'
              : saveState === 'saving'
                ? 'save-indicator save-indicator-busy'
                : 'save-indicator'
          }
          aria-live="polite"
        >
          {saveState === 'saving' ? (
            <Loader2 size={12} className="spin" />
          ) : saveState === 'error' || saveState === 'memory' ? (
            <CircleAlert size={12} />
          ) : (
            <CircleCheck size={12} />
          )}
          <span className="save-indicator-label">
            {saveState === 'saving'
              ? t('Saving…')
              : saveState === 'error'
                ? t('Save error')
                : saveState === 'memory'
                  ? t('Session only')
                  : t('Saved locally')}
          </span>
        </span>
      </div>
    </div>
  )
}
