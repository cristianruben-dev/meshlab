import { useState } from 'react'
import {
  Clock,
  Download,
  Ellipsis,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Inbox,
  Layers,
  Pencil,
  Plus,
  Star,
  Tag as TagIcon,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Translate } from '../locale'
import {
  ACCENT_COLORS,
  DEFAULT_FOLDER_COLOR,
  DEFAULT_TAG_COLOR,
  type Folder,
  type Project,
  type Tag,
} from '../storage/types'
import { isRecentProject, type NavSelection, type SmartView } from './filters'

type FolderSidebarProps = {
  projects: Project[]
  folders: Folder[]
  tags: Tag[]
  selection: NavSelection
  selectedTagIds: string[]
  storageMode: 'indexeddb' | 'memory'
  mobileOpen: boolean
  t: Translate
  onCloseMobile: () => void
  onSelectNav: (selection: NavSelection) => void
  onToggleTagFilter: (tagId: string) => void
  onClearTagFilters: () => void
  onCreateFolder: (name: string, color: string) => Promise<void>
  onUpdateFolder: (id: string, changes: { name?: string; color?: string }) => Promise<void>
  onDeleteFolder: (folder: Folder) => void
  onExportFolder: (folder: Folder) => void
  onCreateTag: (name: string, color: string) => Promise<void>
  onUpdateTag: (id: string, changes: { name?: string; color?: string }) => Promise<void>
  onDeleteTag: (tag: Tag) => void
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

export function FolderSidebar({
  projects,
  folders,
  tags,
  selection,
  selectedTagIds,
  storageMode,
  mobileOpen,
  t,
  onCloseMobile,
  onSelectNav,
  onToggleTagFilter,
  onClearTagFilters,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onExportFolder,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
}: FolderSidebarProps) {
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [folderColor, setFolderColor] = useState<string>(DEFAULT_FOLDER_COLOR)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editFolderName, setEditFolderName] = useState('')
  const [editFolderColor, setEditFolderColor] = useState<string>(DEFAULT_FOLDER_COLOR)

  const [creatingTag, setCreatingTag] = useState(false)
  const [tagName, setTagName] = useState('')
  const [tagColor, setTagColor] = useState<string>(DEFAULT_TAG_COLOR)
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editTagName, setEditTagName] = useState('')
  const [editTagColor, setEditTagColor] = useState<string>(DEFAULT_TAG_COLOR)

  const smartCounts: Record<SmartView, number> = {
    all: projects.length,
    recent: projects.filter(p => isRecentProject(p)).length,
    pinned: projects.filter(p => p.pinned).length,
    unfiled: projects.filter(p => p.folderId === null).length,
  }

  const folderCounts = new Map<string, number>()
  for (const project of projects) {
    if (project.folderId) folderCounts.set(project.folderId, (folderCounts.get(project.folderId) ?? 0) + 1)
  }

  const smartItems: Array<{ view: SmartView; label: string; icon: React.ReactNode }> = [
    { view: 'all', label: t('All projects'), icon: <Layers size={15} /> },
    { view: 'recent', label: t('Recent'), icon: <Clock size={15} /> },
    { view: 'pinned', label: t('Favorites'), icon: <Star size={15} /> },
    { view: 'unfiled', label: t('Unfiled'), icon: <Inbox size={15} /> },
  ]

  async function submitNewFolder(event: React.FormEvent) {
    event.preventDefault()
    if (!folderName.trim()) return
    await onCreateFolder(folderName.trim(), folderColor)
    setFolderName('')
    setFolderColor(ACCENT_COLORS[(folders.length + 1) % ACCENT_COLORS.length])
    setCreatingFolder(false)
  }

  async function submitEditFolder(event: React.FormEvent) {
    event.preventDefault()
    if (!editingFolderId || !editFolderName.trim()) return
    await onUpdateFolder(editingFolderId, { name: editFolderName.trim(), color: editFolderColor })
    setEditingFolderId(null)
  }

  async function submitNewTag(event: React.FormEvent) {
    event.preventDefault()
    if (!tagName.trim()) return
    await onCreateTag(tagName.trim(), tagColor)
    setTagName('')
    setTagColor(ACCENT_COLORS[(tags.length + 2) % ACCENT_COLORS.length])
    setCreatingTag(false)
  }

  async function submitEditTag(event: React.FormEvent) {
    event.preventDefault()
    if (!editingTagId || !editTagName.trim()) return
    await onUpdateTag(editingTagId, { name: editTagName.trim(), color: editTagColor })
    setEditingTagId(null)
  }

  const sidebarContent = (
    <aside className={mobileOpen ? 'hub-sidebar hub-sidebar-open' : 'hub-sidebar'} aria-label={t('Projects')}>
      <div className="sidebar-mobile-head">
        <strong>{t('Projects')}</strong>
        <Button variant="ghost" size="icon-sm" aria-label={t('Close sidebar')} onClick={onCloseMobile}>
          <X />
        </Button>
      </div>

      <nav className="sidebar-scroll" aria-label={t('Folders')}>
        <section className="sidebar-group">
          {smartItems.map(item => {
            const active = selection.kind === 'smart' && selection.view === item.view
            return (
              <button
                key={item.view}
                type="button"
                className={active ? 'nav-item nav-item-active' : 'nav-item'}
                aria-current={active ? 'page' : undefined}
                onClick={() => { onSelectNav({ kind: 'smart', view: item.view }); onCloseMobile() }}
              >
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
                <span className="nav-count">{smartCounts[item.view]}</span>
              </button>
            )
          })}
        </section>

        <section className="sidebar-group">
          <div className="sidebar-group-head">
            <h2 className="section-label">{t('Folders')}</h2>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('New folder')}
              onClick={() => {
                setCreatingFolder(prev => !prev)
                setFolderName('')
                setFolderColor(ACCENT_COLORS[folders.length % ACCENT_COLORS.length])
              }}
            >
              <FolderPlus size={14} />
            </Button>
          </div>

          {creatingFolder && (
            <form className="inline-editor" onSubmit={submitNewFolder}>
              <Input
                autoFocus
                value={folderName}
                maxLength={80}
                placeholder={t('Folder name')}
                aria-label={t('Folder name')}
                onChange={event => setFolderName(event.target.value)}
              />
              <ColorSwatches value={folderColor} onChange={setFolderColor} t={t} />
              <div className="inline-editor-actions">
                <Button type="button" variant="ghost" size="xs" onClick={() => setCreatingFolder(false)}>{t('Cancel')}</Button>
                <Button type="submit" size="xs" disabled={!folderName.trim()}>{t('Create')}</Button>
              </div>
            </form>
          )}

          {folders.length === 0 && !creatingFolder && (
            <p className="sidebar-empty">{t('No folders yet.')}</p>
          )}

          {folders.map(folder => {
            const active = selection.kind === 'folder' && selection.folderId === folder.id
            const count = folderCounts.get(folder.id) ?? 0
            if (editingFolderId === folder.id) {
              return (
                <form key={folder.id} className="inline-editor" onSubmit={submitEditFolder}>
                  <Input
                    autoFocus
                    value={editFolderName}
                    maxLength={80}
                    aria-label={t('Folder name')}
                    onChange={event => setEditFolderName(event.target.value)}
                  />
                  <ColorSwatches value={editFolderColor} onChange={setEditFolderColor} t={t} />
                  <div className="inline-editor-actions">
                    <Button type="button" variant="ghost" size="xs" onClick={() => setEditingFolderId(null)}>{t('Cancel')}</Button>
                    <Button type="submit" size="xs" disabled={!editFolderName.trim()}>{t('Save')}</Button>
                  </div>
                </form>
              )
            }
            return (
              <div key={folder.id} className={active ? 'nav-row nav-row-active' : 'nav-row'}>
                <button
                  type="button"
                  className={active ? 'nav-item nav-item-active' : 'nav-item'}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => { onSelectNav({ kind: 'folder', folderId: folder.id }); onCloseMobile() }}
                >
                  <span className="nav-icon" style={{ color: folder.color }} aria-hidden="true">
                    {active ? <FolderOpen size={15} /> : <FolderIcon size={15} />}
                  </span>
                  <span className="nav-label">{folder.name}</span>
                  <span className="nav-count">{count}</span>
                </button>
                <Popover>
                  <PopoverTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="nav-menu-trigger"
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
                        setEditingFolderId(folder.id)
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
                    <button
                      type="button"
                      className="action-menu-item action-menu-danger"
                      onClick={() => onDeleteFolder(folder)}
                    >
                      <Trash2 size={13} /> {t('Delete folder')}
                    </button>
                  </PopoverContent>
                </Popover>
              </div>
            )
          })}
        </section>

        <section className="sidebar-group">
          <div className="sidebar-group-head">
            <h2 className="section-label">{t('Tags')}</h2>
            <div className="sidebar-group-tools">
              {selectedTagIds.length > 0 && (
                <button type="button" className="clear-link" onClick={onClearTagFilters}>
                  {t('Clear tag filters')}
                </button>
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t('New tag')}
                onClick={() => {
                  setCreatingTag(prev => !prev)
                  setTagName('')
                  setTagColor(ACCENT_COLORS[(tags.length + 1) % ACCENT_COLORS.length])
                }}
              >
                <Plus size={14} />
              </Button>
            </div>
          </div>

          {creatingTag && (
            <form className="inline-editor" onSubmit={submitNewTag}>
              <Input
                autoFocus
                value={tagName}
                maxLength={40}
                placeholder={t('Tag name')}
                aria-label={t('Tag name')}
                onChange={event => setTagName(event.target.value)}
              />
              <ColorSwatches value={tagColor} onChange={setTagColor} t={t} />
              <div className="inline-editor-actions">
                <Button type="button" variant="ghost" size="xs" onClick={() => setCreatingTag(false)}>{t('Cancel')}</Button>
                <Button type="submit" size="xs" disabled={!tagName.trim()}>{t('Create')}</Button>
              </div>
            </form>
          )}

          {tags.length === 0 && !creatingTag && (
            <p className="sidebar-empty">{t('No tags yet.')}</p>
          )}

          <div className="sidebar-tags">
            {tags.map(tag => {
              const active = selectedTagIds.includes(tag.id)
              if (editingTagId === tag.id) {
                return (
                  <form key={tag.id} className="inline-editor inline-editor-full" onSubmit={submitEditTag}>
                    <Input
                      autoFocus
                      value={editTagName}
                      maxLength={40}
                      aria-label={t('Tag name')}
                      onChange={event => setEditTagName(event.target.value)}
                    />
                    <ColorSwatches value={editTagColor} onChange={setEditTagColor} t={t} />
                    <div className="inline-editor-actions">
                      <Button type="button" variant="ghost" size="xs" onClick={() => setEditingTagId(null)}>{t('Cancel')}</Button>
                      <Button type="submit" size="xs" disabled={!editTagName.trim()}>{t('Save')}</Button>
                    </div>
                  </form>
                )
              }
              return (
                <div key={tag.id} className="sidebar-tag-wrap">
                  <button
                    type="button"
                    aria-pressed={active}
                    className={active ? 'tag-pill tag-pill-active' : 'tag-pill'}
                    style={{ '--tag-color': tag.color } as React.CSSProperties}
                    onClick={() => onToggleTagFilter(tag.id)}
                  >
                    <span className="tag-dot" aria-hidden="true" />
                    <span>{tag.name}</span>
                  </button>
                  <Popover>
                    <PopoverTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="tag-menu-trigger"
                          aria-label={`${t('Tag actions')}: ${tag.name}`}
                        />
                      }
                    >
                      <TagIcon size={11} />
                    </PopoverTrigger>
                    <PopoverContent className="action-menu" align="start">
                      <button
                        type="button"
                        className="action-menu-item"
                        onClick={() => {
                          setEditingTagId(tag.id)
                          setEditTagName(tag.name)
                          setEditTagColor(tag.color)
                        }}
                      >
                        <Pencil size={13} /> {t('Edit tag')}
                      </button>
                      <button
                        type="button"
                        className="action-menu-item action-menu-danger"
                        onClick={() => onDeleteTag(tag)}
                      >
                        <Trash2 size={13} /> {t('Delete tag')}
                      </button>
                    </PopoverContent>
                  </Popover>
                </div>
              )
            })}
          </div>
        </section>
      </nav>

      <footer className="sidebar-footer">
        <span className={storageMode === 'indexeddb' ? 'storage-pill' : 'storage-pill storage-pill-warn'}>
          <HardDrive size={13} />
          {t(storageMode === 'indexeddb' ? '100% local · IndexedDB' : 'Temporary session storage')}
        </span>
      </footer>
    </aside>
  )

  return (
    <>
      {mobileOpen && <div className="sidebar-scrim" onClick={onCloseMobile} />}
      {sidebarContent}
    </>
  )
}
