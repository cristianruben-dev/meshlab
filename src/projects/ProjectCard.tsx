import { useState } from 'react'
import {
  CircuitBoard,
  Copy,
  Download,
  Ellipsis,
  Folder as FolderIcon,
  FolderOpen,
  Pencil,
  SlidersHorizontal,
  Star,
  Trash2,
  Waypoints,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Language, Translate } from '../locale'
import type { Palette } from '../palette'
import type { Folder, Project } from '../storage/types'
import { CircuitPreview } from './CircuitPreview'
import { formatRelativeTime } from './filters'

type ProjectCardProps = {
  project: Project
  folder?: Folder
  palette: Palette
  language: Language
  t: Translate
  onOpen: (project: Project) => void
  onTogglePin: (project: Project) => void
  onRename: (project: Project, name: string) => Promise<void>
  onEditDetails: (project: Project) => void
  onDuplicate: (project: Project) => void
  onExport: (project: Project) => void
  onDelete: (project: Project) => void
}

export function ProjectCard({
  project,
  folder,
  palette,
  language,
  t,
  onOpen,
  onTogglePin,
  onRename,
  onEditDetails,
  onDuplicate,
  onExport,
  onDelete,
}: ProjectCardProps) {
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(project.name)
  const [menuOpen, setMenuOpen] = useState(false)

  async function commitRename() {
    const trimmed = draftName.trim()
    setRenaming(false)
    if (trimmed && trimmed !== project.name) {
      await onRename(project, trimmed)
    } else {
      setDraftName(project.name)
    }
  }

  const partsCount = project.preferredView === 'board'
    ? (project.circuit.breadboard?.placements.length ?? project.circuit.components.length)
    : project.circuit.components.length
  const wiresCount = project.preferredView === 'board'
    ? (project.circuit.breadboard?.jumpers.length ?? 0)
    : project.circuit.wires.length
  const connectionUnit = project.preferredView === 'board' ? t('jumpers') : t('wires')
  const updatedText = formatRelativeTime(project.updatedAt, language, t)
  const sizeLabels = { mini: 'Mini', half: 'Half', full: 'Full' } as const
  const boardSizeLabel = project.boardSettings ? t(sizeLabels[project.boardSettings.size]) : t('Half')
  const viewLabel = project.preferredView === 'board'
    ? `${t('Breadboard')} · ${boardSizeLabel}`
    : t('Circuit')

  const menu = (
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="card-icon-btn"
            aria-label={`${t('Project actions')}: ${project.name}`}
            onClick={event => event.stopPropagation()}
          />
        }
      >
        <Ellipsis size={15} />
      </PopoverTrigger>
      <PopoverContent className="action-menu" align="end" onClick={event => event.stopPropagation()}>
        <button type="button" className="action-menu-item" onClick={() => { setMenuOpen(false); onOpen(project) }}>
          <FolderOpen size={13} /> {t('Open')}
        </button>
        <button
          type="button"
          className="action-menu-item"
          onClick={() => {
            setMenuOpen(false)
            setDraftName(project.name)
            setRenaming(true)
          }}
        >
          <Pencil size={13} /> {t('Rename')}
        </button>
        <button type="button" className="action-menu-item" onClick={() => { setMenuOpen(false); onEditDetails(project) }}>
          <SlidersHorizontal size={13} /> {t('Edit details')}
        </button>
        <button type="button" className="action-menu-item" onClick={() => { setMenuOpen(false); onDuplicate(project) }}>
          <Copy size={13} /> {t('Duplicate')}
        </button>
        <button type="button" className="action-menu-item" onClick={() => { setMenuOpen(false); onExport(project) }}>
          <Download size={13} /> {t('Export JSON')}
        </button>
        <div className="action-menu-sep" role="separator" />
        <button type="button" className="action-menu-item action-menu-danger" onClick={() => { setMenuOpen(false); onDelete(project) }}>
          <Trash2 size={13} /> {t('Delete')}
        </button>
      </PopoverContent>
    </Popover>
  )

  const pinButton = (
    <Button
      variant="ghost"
      size="icon-sm"
      className={project.pinned ? 'card-icon-btn pin-btn-active' : 'card-icon-btn'}
      aria-label={project.pinned ? `${t('Remove from favorites')}: ${project.name}` : `${t('Pin to favorites')}: ${project.name}`}
      aria-pressed={project.pinned}
      onClick={event => {
        event.stopPropagation()
        onTogglePin(project)
      }}
    >
      <Star size={14} fill={project.pinned ? 'currentColor' : 'none'} />
    </Button>
  )

  const nameBlock = renaming ? (
    <form
      className="card-rename-form"
      onClick={event => event.stopPropagation()}
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
            setDraftName(project.name)
            setRenaming(false)
          }
        }}
      />
    </form>
  ) : (
    <button
      type="button"
      className="card-title-btn"
      onClick={() => onOpen(project)}
    >
      {project.name}
    </button>
  )

  return (
    <article className="project-card" data-project-id={project.id}>
      <div className="project-card-media" onClick={() => onOpen(project)}>
        <CircuitPreview circuit={project.circuit} preferredView={project.preferredView} boardSettings={project.boardSettings} palette={palette} t={t} />
        <div className="project-card-overlay-top">
          <span className="view-chip">
            {project.preferredView === 'board' ? <CircuitBoard size={12} /> : <Waypoints size={12} />}
            {viewLabel}
          </span>
        </div>
      </div>

      <div className="project-card-body">
        <div className="project-card-head">
          {nameBlock}
          <div className="project-card-actions">
            {pinButton}
            {menu}
          </div>
        </div>

        {project.description && <p className="project-desc">{project.description}</p>}

        {folder && (
          <div className="project-badges">
            <span className="folder-chip" style={{ '--folder-color': folder.color } as React.CSSProperties}>
              <FolderIcon size={11} /> {folder.name}
            </span>
          </div>
        )}

        <footer className="project-card-foot">
          <span className="meta-mono">{partsCount} {t('parts')} · {wiresCount} {connectionUnit}</span>
          <span className="meta-time">{updatedText}</span>
        </footer>
      </div>
    </article>
  )
}
