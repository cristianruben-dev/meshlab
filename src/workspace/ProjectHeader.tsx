import { useState } from 'react'
import { ArrowLeft, Check, CircleAlert, CircleCheck, Loader2, Pencil, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Translate } from '../locale'
import type { Project } from '../storage/types'

export type SaveState = 'saved' | 'saving' | 'error' | 'memory'

interface ProjectHeaderProps {
  activeProject: Project
  saveState: SaveState
  t: Translate
  onBackToHub: () => void
  onRenameActive: (name: string) => Promise<void>
  onEditActiveDetails: () => void
}

export function ProjectHeader({ activeProject, saveState, t, onBackToHub, onRenameActive, onEditActiveDetails }: ProjectHeaderProps) {
  const [draft, setDraft] = useState<string | null>(null)

  function commitRename() {
    if (draft === null) return
    const name = draft.trim()
    setDraft(null)
    if (name && name !== activeProject.name) void onRenameActive(name)
  }

  return (
    <div className="project-header">
      <Button variant="ghost" size="sm" className="back-projects-btn" aria-label={t('Projects')} onClick={onBackToHub}>
        <ArrowLeft size={15} /> <span>{t('Projects')}</span>
      </Button>
      {draft === null
        ? <h2 className="current-project-name" title={activeProject.name}>{activeProject.name}</h2>
        : <form className="current-project-rename" onSubmit={event => {
          event.preventDefault()
          commitRename()
        }}>
          <Input aria-label={t('Rename project')} autoFocus maxLength={120} value={draft}
            onChange={event => setDraft(event.target.value)}
            onBlur={event => { if (!event.currentTarget.form?.contains(event.relatedTarget)) commitRename() }}
            onKeyDown={event => {
              if (event.key === 'Escape') { event.stopPropagation(); setDraft(null) }
            }} />
          <Button type="submit" variant="ghost" size="icon-xs" aria-label={t('Save')}><Check size={12} /></Button>
        </form>}
      <div className="project-header-actions">
        <Button variant="ghost" size="icon-xs" aria-label={t('Rename project')} onClick={() => setDraft(activeProject.name)}>
          <Pencil size={12} />
        </Button>
        <Button variant="ghost" size="icon-xs" aria-label={t('Project details')} onClick={onEditActiveDetails}>
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
