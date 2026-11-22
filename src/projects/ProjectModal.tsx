import { useEffect, useRef, useState } from 'react'
import { Check, CircuitBoard, Folder as FolderIcon, Plus, Sparkles, Tag as TagIcon, Waypoints, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { examples } from '../circuit/examples'
import type { Circuit } from '../circuit/model'
import type { Translate } from '../locale'
import type { Palette } from '../palette'
import {
  ACCENT_COLORS,
  blankCircuit,
  type Folder,
  type PreferredView,
  type Project,
  type Tag,
} from '../storage/types'
import { CircuitPreview } from './CircuitPreview'

const templateNames = Object.keys(examples)

export type StartingPoint = 'blank-schematic' | 'blank-board' | 'template'

export type ProjectModalSubmit = {
  name: string
  description: string
  folderId: string | null
  tagIds: string[]
  preferredView: PreferredView
  circuit?: Circuit
}

type ProjectModalProps = {
  open: boolean
  mode: 'create' | 'edit'
  initialProject?: Project
  defaultFolderId?: string | null
  defaultStartingPoint?: StartingPoint
  defaultTemplate?: string
  folders: Folder[]
  tags: Tag[]
  palette: Palette
  t: Translate
  onCreateTag: (name: string, color: string) => Promise<Tag>
  onSubmit: (data: ProjectModalSubmit) => void | Promise<void>
  onClose: () => void
}

export function ProjectModal({
  open,
  mode,
  initialProject,
  defaultFolderId = null,
  defaultStartingPoint = 'blank-schematic',
  defaultTemplate = templateNames[0],
  folders,
  tags,
  palette,
  t,
  onCreateTag,
  onSubmit,
  onClose,
}: ProjectModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [folderId, setFolderId] = useState<string | null>(null)
  const [tagIds, setTagIds] = useState<string[]>([])
  const [startingPoint, setStartingPoint] = useState<StartingPoint>('blank-schematic')
  const [templateName, setTemplateName] = useState<string>(templateNames[0])
  const [preferredView, setPreferredView] = useState<PreferredView>('schematic')
  const [newTagName, setNewTagName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && initialProject) {
      setName(initialProject.name)
      setDescription(initialProject.description)
      setFolderId(initialProject.folderId)
      setTagIds(initialProject.tagIds)
      setPreferredView(initialProject.preferredView)
    } else {
      setName('')
      setDescription('')
      setFolderId(defaultFolderId)
      setTagIds([])
      setStartingPoint(defaultStartingPoint)
      setTemplateName(defaultTemplate && examples[defaultTemplate] ? defaultTemplate : templateNames[0])
      setPreferredView(defaultStartingPoint === 'blank-board' ? 'board' : 'schematic')
    }
    setNewTagName('')
    setSubmitting(false)
    setTimeout(() => nameRef.current?.focus(), 0)
  }, [open, mode, initialProject, defaultFolderId, defaultStartingPoint, defaultTemplate])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  function toggleTag(id: string) {
    setTagIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])
  }

  async function handleQuickCreateTag() {
    const trimmed = newTagName.trim()
    if (!trimmed) return
    const existing = tags.find(tag => tag.name.trim().toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      if (!tagIds.includes(existing.id)) setTagIds(prev => [...prev, existing.id])
      setNewTagName('')
      return
    }
    const color = ACCENT_COLORS[tags.length % ACCENT_COLORS.length]
    const created = await onCreateTag(trimmed, color)
    setTagIds(prev => [...prev, created.id])
    setNewTagName('')
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const resolvedName = name.trim() || (
        mode === 'create' && startingPoint === 'template'
          ? t(templateName)
          : t('Untitled Project')
      )
      if (mode === 'edit') {
        await onSubmit({
          name: resolvedName,
          description,
          folderId,
          tagIds,
          preferredView,
        })
      } else {
        const nextView: PreferredView = startingPoint === 'blank-board' ? 'board' : 'schematic'
        const nextCircuit = startingPoint === 'template'
          ? structuredClone(examples[templateName] ?? blankCircuit())
          : blankCircuit()
        await onSubmit({
          name: resolvedName,
          description,
          folderId,
          tagIds,
          preferredView: nextView,
          circuit: nextCircuit,
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-modal-title"
        className="modal-card"
        onClick={event => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <header className="modal-head">
          <div className="modal-title-group">
            <span className="modal-icon" aria-hidden="true">
              <CircuitBoard size={16} />
            </span>
            <h2 id="project-modal-title">{t(mode === 'create' ? 'New project' : 'Edit project')}</h2>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t('Close dialog')} onClick={onClose}>
            <X />
          </Button>
        </header>

        <div className="modal-body">
          <div className="modal-grid-2">
            <label className="modal-field">
              <span>{t('Project name')}</span>
              <Input
                ref={nameRef}
                value={name}
                maxLength={120}
                placeholder={mode === 'create' && startingPoint === 'template' ? t(templateName) : t('Untitled Project')}
                onChange={event => setName(event.target.value)}
              />
            </label>

            <label className="modal-field">
              <span><FolderIcon size={12} className="inline-icon" /> {t('Folder')}</span>
              <select
                aria-label={t('Folder')}
                className="modal-select"
                value={folderId ?? ''}
                onChange={event => setFolderId(event.target.value || null)}
              >
                <option value="">{t('Unfiled')}</option>
                {folders.map(folder => (
                  <option key={folder.id} value={folder.id}>{folder.name}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="modal-field">
            <span>{t('Description')}</span>
            <textarea
              className="modal-textarea"
              rows={2}
              maxLength={500}
              placeholder={t('Optional notes about this circuit…')}
              value={description}
              onChange={event => setDescription(event.target.value)}
            />
          </label>

          {mode === 'create' ? (
            <div className="modal-field">
              <span>{t('Starting point')}</span>
              <div className="starter-grid" role="radiogroup" aria-label={t('Starting point')}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={startingPoint === 'blank-schematic'}
                  className={startingPoint === 'blank-schematic' ? 'starter-card starter-card-active' : 'starter-card'}
                  onClick={() => setStartingPoint('blank-schematic')}
                >
                  <span className="starter-icon"><Waypoints size={17} /></span>
                  <strong>{t('Blank schematic')}</strong>
                  <small>{t('Start with an empty schematic canvas.')}</small>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={startingPoint === 'blank-board'}
                  className={startingPoint === 'blank-board' ? 'starter-card starter-card-active' : 'starter-card'}
                  onClick={() => setStartingPoint('blank-board')}
                >
                  <span className="starter-icon"><CircuitBoard size={17} /></span>
                  <strong>{t('Blank breadboard')}</strong>
                  <small>{t('Start directly in the 3D breadboard view.')}</small>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={startingPoint === 'template'}
                  className={startingPoint === 'template' ? 'starter-card starter-card-active' : 'starter-card'}
                  onClick={() => setStartingPoint('template')}
                >
                  <span className="starter-icon"><Sparkles size={17} /></span>
                  <strong>{t('From template')}</strong>
                  <small>{t('Start from a ready-to-edit example circuit.')}</small>
                </button>
              </div>

              {startingPoint === 'template' && (
                <div className="template-picker">
                  <span className="section-label">{t('Choose template')}</span>
                  <div className="template-picker-grid">
                    {templateNames.map(key => {
                      const active = templateName === key
                      return (
                        <button
                          key={key}
                          type="button"
                          className={active ? 'template-option template-option-active' : 'template-option'}
                          aria-pressed={active}
                          onClick={() => setTemplateName(key)}
                        >
                          <CircuitPreview circuit={examples[key]} palette={palette} t={t} compact />
                          <span>{t(key)}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="modal-field">
              <span>{t('Default view')}</span>
              <div className="segmented modal-view-switch" role="group" aria-label={t('Default view')}>
                <Button type="button" size="sm" variant="ghost" aria-pressed={preferredView === 'schematic'} onClick={() => setPreferredView('schematic')}>
                  <Waypoints /> {t('Schematic')}
                </Button>
                <Button type="button" size="sm" variant="ghost" aria-pressed={preferredView === 'board'} onClick={() => setPreferredView('board')}>
                  <CircuitBoard /> {t('Breadboard')}
                </Button>
              </div>
            </div>
          )}

          <div className="modal-field">
            <span><TagIcon size={12} className="inline-icon" /> {t('Tags')}</span>
            <div className="modal-tags">
              {tags.map(tag => {
                const selected = tagIds.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    aria-pressed={selected}
                    className={selected ? 'tag-pill tag-pill-active' : 'tag-pill'}
                    style={{ '--tag-color': tag.color } as React.CSSProperties}
                    onClick={() => toggleTag(tag.id)}
                  >
                    <span className="tag-dot" aria-hidden="true" />
                    <span>{tag.name}</span>
                    {selected && <Check size={12} />}
                  </button>
                )
              })}
              <div className="quick-tag-form">
                <Input
                  value={newTagName}
                  maxLength={40}
                  placeholder={t('New tag')}
                  aria-label={t('New tag')}
                  onChange={event => setNewTagName(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void handleQuickCreateTag()
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => void handleQuickCreateTag()} disabled={!newTagName.trim()}>
                  <Plus /> {t('Add tag')}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <footer className="modal-foot">
          <Button type="button" variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" disabled={submitting}>
            {t(mode === 'create' ? 'Create project' : 'Save changes')}
          </Button>
        </footer>
      </form>
    </div>
  )
}
