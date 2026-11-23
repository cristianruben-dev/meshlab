import { useCallback, useEffect, useRef, useState } from 'react'
import { examples } from './circuit/examples'
import type { Circuit } from './circuit/model'
import { readLanguage, translate, type Language, type Translate } from './locale'
import { palettes } from './palette'
import { ProjectModal, type ProjectModalSubmit } from './projects/ProjectModal'
import { ProjectsHub } from './projects/ProjectsHub'
import { downloadProjectFile, downloadWorkspaceBundle, importAnyJson } from './storage/io'
import { migrateLegacyCircuit } from './storage/migrate'
import { openWorkspaceRepository, type WorkspaceRepository } from './storage/repository'
import { blankCircuit, boardSettingsForSize, type Folder, type PreferredView, type Project, type Tag } from './storage/types'
import { useTheme } from './theme'
import type { SaveState } from './workspace/ProjectTabs'
import { Workbench } from './workspace/Workbench'

const OPEN_TABS_KEY = 'meshlab:workspace:tabs'

function readOpenTabs(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(OPEN_TABS_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function saveOpenTabs(ids: string[]) {
  try {
    localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(ids))
  } catch { /* Storage is optional. */ }
}

function readHashProjectId(): string | null {
  if (typeof window === 'undefined') return null
  const match = /^#\/project\/([^/?#]+)$/.exec(window.location.hash)
  return match ? decodeURIComponent(match[1]) : null
}

function writeHashProjectId(id: string | null) {
  if (typeof window === 'undefined') return
  const target = id ? `#/project/${encodeURIComponent(id)}` : ''
  if (window.location.hash === target) return
  try {
    window.history.replaceState(null, '', target || `${window.location.pathname}${window.location.search}`)
  } catch {
    window.location.hash = target
  }
}

type EditorModalState =
  | { mode: 'create' }
  | { mode: 'edit'; project: Project }
  | null

export default function App() {
  const [language, setLanguage] = useState<Language>(readLanguage)
  const { preference, setPreference, theme } = useTheme()
  const palette = palettes[theme]
  const t: Translate = useCallback((value: string) => translate(language, value), [language])

  const [ready, setReady] = useState(false)
  const [storageMode, setStorageMode] = useState<'indexeddb' | 'memory'>('indexeddb')
  const [projects, setProjects] = useState<Project[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [openProjectIds, setOpenProjectIds] = useState<string[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [screen, setScreen] = useState<'hub' | 'editor'>('hub')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [hubNotice, setHubNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const [editorModal, setEditorModal] = useState<EditorModalState>(null)

  const repoRef = useRef<WorkspaceRepository | null>(null)
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())
  const pendingCountRef = useRef(0)

  const refreshFromRepo = useCallback(async (repo: WorkspaceRepository) => {
    const snapshot = await repo.loadAll()
    setProjects(snapshot.projects)
    setFolders(snapshot.folders)
    setTags(snapshot.tags)
    return snapshot
  }, [])

  const flushPendingSaves = useCallback(async () => {
    await saveChainRef.current
  }, [])

  useEffect(() => {
    let cancelled = false
    let openedRepo: WorkspaceRepository | null = null

    async function init() {
      const repo = await openWorkspaceRepository()
      if (cancelled) {
        repo.close()
        return
      }
      openedRepo = repo
      repoRef.current = repo
      setStorageMode(repo.mode)
      setSaveState(repo.mode === 'memory' ? 'memory' : 'saved')

      await migrateLegacyCircuit(repo, {
        defaultName: translate(readLanguage(), 'Recovered Circuit'),
        defaultDescription: translate(readLanguage(), 'Migrated from previous local autosave.'),
      })
      if (cancelled) return

      const snapshot = await refreshFromRepo(repo)
      if (cancelled) return

      const existingIds = new Set(snapshot.projects.map(project => project.id))
      const restoredTabs = readOpenTabs().filter(id => existingIds.has(id))
      const hashProjectId = readHashProjectId()

      if (hashProjectId && existingIds.has(hashProjectId)) {
        const tabs = restoredTabs.includes(hashProjectId) ? restoredTabs : [...restoredTabs, hashProjectId]
        setOpenProjectIds(tabs)
        setActiveProjectId(hashProjectId)
        setScreen('editor')
      } else {
        if (hashProjectId) writeHashProjectId(null)
        setOpenProjectIds(restoredTabs)
        setActiveProjectId(restoredTabs[0] ?? null)
        setScreen('hub')
      }
      setReady(true)
    }

    void init()
    return () => {
      cancelled = true
      openedRepo?.close()
      repoRef.current = null
    }
  }, [refreshFromRepo])

  useEffect(() => {
    if (!ready) return
    saveOpenTabs(openProjectIds)
  }, [openProjectIds, ready])

  useEffect(() => {
    const activeProject = activeProjectId ? projects.find(p => p.id === activeProjectId) : undefined
    document.documentElement.lang = language
    document.title = screen === 'editor' && activeProject
      ? `${activeProject.name} — Meshlab`
      : `Meshlab — ${translate(language, 'PROJECTS')}`
    try { localStorage.setItem('meshlab:language', language) } catch { /* Storage is optional. */ }
  }, [language, screen, activeProjectId, projects])

  useEffect(() => {
    const onBeforeUnload = () => { void flushPendingSaves() }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [flushPendingSaves])

  const activeProject = activeProjectId ? projects.find(p => p.id === activeProjectId) ?? null : null

  const openProjectById = useCallback(async (projectId: string) => {
    await flushPendingSaves()
    setOpenProjectIds(prev => prev.includes(projectId) ? prev : [...prev, projectId])
    setActiveProjectId(projectId)
    setScreen('editor')
    writeHashProjectId(projectId)
  }, [flushPendingSaves])

  const backToHub = useCallback(async () => {
    await flushPendingSaves()
    setScreen('hub')
    writeHashProjectId(null)
  }, [flushPendingSaves])

  const returnToEditor = useCallback(() => {
    const targetId = (activeProjectId && projects.some(p => p.id === activeProjectId))
      ? activeProjectId
      : openProjectIds.find(id => projects.some(p => p.id === id)) ?? null
    if (!targetId) return
    setActiveProjectId(targetId)
    setScreen('editor')
    writeHashProjectId(targetId)
  }, [activeProjectId, openProjectIds, projects])

  const closeTab = useCallback(async (projectId: string) => {
    await flushPendingSaves()
    const remaining = openProjectIds.filter(id => id !== projectId)
    setOpenProjectIds(remaining)
    if (activeProjectId === projectId) {
      const nextId = remaining.at(-1) ?? null
      setActiveProjectId(nextId)
      if (nextId) {
        writeHashProjectId(nextId)
      } else {
        setScreen('hub')
        writeHashProjectId(null)
      }
    }
  }, [activeProjectId, flushPendingSaves, openProjectIds])

  const handleCircuitChange = useCallback((projectId: string, nextCircuit: Circuit) => {
    const now = Date.now()
    const cloned = structuredClone(nextCircuit)
    setProjects(prev => prev.map(project =>
      project.id === projectId ? { ...project, circuit: cloned, updatedAt: now } : project,
    ))
    const repo = repoRef.current
    if (!repo) return
    pendingCountRef.current += 1
    setSaveState('saving')
    saveChainRef.current = saveChainRef.current
      .then(() => repo.saveProjectCircuit(projectId, cloned))
      .then(() => {
        pendingCountRef.current = Math.max(0, pendingCountRef.current - 1)
        if (pendingCountRef.current === 0) {
          setSaveState(repo.mode === 'memory' ? 'memory' : 'saved')
        }
      })
      .catch(() => {
        pendingCountRef.current = Math.max(0, pendingCountRef.current - 1)
        setSaveState('error')
      })
  }, [])

  const handleCreateProject = useCallback(async (data: ProjectModalSubmit) => {
    const repo = repoRef.current
    if (!repo) return
    await flushPendingSaves()
    const created = await repo.createProject({
      name: data.name,
      description: data.description,
      folderId: data.folderId,
      preferredView: data.preferredView,
      ...(data.boardSettings ? { boardSettings: data.boardSettings } : {}),
      circuit: data.circuit ?? blankCircuit(),
    })
    await refreshFromRepo(repo)
    setOpenProjectIds(prev => [...prev, created.id])
    setActiveProjectId(created.id)
    setScreen('editor')
    writeHashProjectId(created.id)
  }, [flushPendingSaves, refreshFromRepo])

  const handleQuickCreateBlank = useCallback(async (view: PreferredView = 'schematic') => {
    await handleCreateProject({
      name: t('Untitled Project'),
      description: '',
      folderId: null,
      preferredView: view,
      ...(view === 'board' ? { boardSettings: boardSettingsForSize('half') } : {}),
      circuit: view === 'board'
        ? { ...blankCircuit(), breadboard: { placements: [], jumpers: [] } }
        : blankCircuit(),
    })
  }, [handleCreateProject, t])

  const handleQuickTemplate = useCallback(async (templateName: string, folderId: string | null) => {
    const circuit = examples[templateName]
    if (!circuit) return
    await handleCreateProject({
      name: t(templateName),
      description: '',
      folderId,
      preferredView: 'schematic',
      circuit: structuredClone(circuit),
    })
  }, [handleCreateProject, t])

  const handleUpdateProject = useCallback(async (id: string, data: ProjectModalSubmit) => {
    const repo = repoRef.current
    if (!repo) return
    await flushPendingSaves()
    await repo.updateProject(id, {
      name: data.name,
      description: data.description,
      folderId: data.folderId,
    })
    await refreshFromRepo(repo)
  }, [flushPendingSaves, refreshFromRepo])

  const handleRenameProject = useCallback(async (id: string, name: string) => {
    const repo = repoRef.current
    if (!repo) return
    await repo.updateProject(id, { name })
    await refreshFromRepo(repo)
  }, [refreshFromRepo])

  const handleTogglePin = useCallback(async (project: Project) => {
    const repo = repoRef.current
    if (!repo) return
    await repo.togglePin(project.id)
    await refreshFromRepo(repo)
  }, [refreshFromRepo])

  const handleDuplicateProject = useCallback(async (project: Project) => {
    const repo = repoRef.current
    if (!repo) return
    await flushPendingSaves()
    await repo.duplicateProject(project.id, t('Copy'))
    await refreshFromRepo(repo)
    setHubNotice({ text: 'Project duplicated.' })
  }, [flushPendingSaves, refreshFromRepo, t])

  const handleDeleteProject = useCallback(async (project: Project) => {
    const repo = repoRef.current
    if (!repo) return
    await flushPendingSaves()
    await repo.deleteProject(project.id)
    await refreshFromRepo(repo)
    setOpenProjectIds(prev => prev.filter(id => id !== project.id))
    if (activeProjectId === project.id) {
      setActiveProjectId(null)
      setScreen('hub')
      writeHashProjectId(null)
    }
    setHubNotice({ text: 'Project deleted.' })
  }, [activeProjectId, flushPendingSaves, refreshFromRepo])

  const handleCreateFolder = useCallback(async (name: string, color: string) => {
    const repo = repoRef.current
    if (!repo) return
    await repo.createFolder({ name, color })
    await refreshFromRepo(repo)
  }, [refreshFromRepo])

  const handleUpdateFolder = useCallback(async (id: string, changes: { name?: string; color?: string }) => {
    const repo = repoRef.current
    if (!repo) return
    await repo.updateFolder(id, changes)
    await refreshFromRepo(repo)
  }, [refreshFromRepo])

  const handleDeleteFolder = useCallback(async (folder: Folder) => {
    const repo = repoRef.current
    if (!repo) return
    await flushPendingSaves()
    await repo.deleteFolder(folder.id)
    await refreshFromRepo(repo)
    setHubNotice({ text: 'Folder deleted.' })
  }, [flushPendingSaves, refreshFromRepo])

  const handleExportProject = useCallback((project: Project) => {
    void flushPendingSaves()
    downloadProjectFile(project, folders, tags)
    setHubNotice({ text: 'Project exported.' })
  }, [flushPendingSaves, folders, tags])

  const handleExportBackup = useCallback(() => {
    void flushPendingSaves()
    downloadWorkspaceBundle({ projects, folders, tags })
    setHubNotice({ text: 'Backup exported.' })
  }, [flushPendingSaves, projects, folders, tags])

  const handleExportFolder = useCallback((folder: Folder) => {
    void flushPendingSaves()
    downloadWorkspaceBundle({ projects, folders, tags }, { folderId: folder.id, folderName: folder.name })
    setHubNotice({ text: 'Folder backup exported.' })
  }, [flushPendingSaves, projects, folders, tags])

  const handleImportFile = useCallback(async (file: File) => {
    const repo = repoRef.current
    if (!repo) return
    try {
      await flushPendingSaves()
      const result = await importAnyJson(repo, file, { defaultName: t('Untitled Project') })
      await refreshFromRepo(repo)
      setHubNotice({
        text: result.kind === 'meshlab-bundle'
          ? 'Backup imported.'
          : result.kind === 'meshlab-project'
            ? 'Project imported.'
            : 'Circuit imported.',
      })
    } catch (error) {
      setHubNotice({
        text: error instanceof Error ? error.message : 'The operation failed.',
        error: true,
      })
    }
  }, [flushPendingSaves, refreshFromRepo, t])

  if (!ready) {
    return <div className="hub" aria-busy="true" />
  }

  if (screen === 'editor' && activeProject) {
    return (
      <>
        <Workbench
          key={activeProject.id}
          project={activeProject}
          projects={projects}
          folders={folders}
          openProjectIds={openProjectIds}
          saveState={saveState}
          storageMode={storageMode}
          language={language}
          preference={preference}
          theme={theme}
          t={t}
          onLanguageChange={setLanguage}
          onThemeChange={setPreference}
          onCircuitChange={handleCircuitChange}
          onBackToHub={() => void backToHub()}
          onSelectTab={id => void openProjectById(id)}
          onCloseTab={id => void closeTab(id)}
          onOpenProject={id => void openProjectById(id)}
          onQuickCreateBlank={view => void handleQuickCreateBlank(view)}
          onOpenNewProjectModal={() => setEditorModal({ mode: 'create' })}
          onRenameProject={handleRenameProject}
          onEditProjectDetails={proj => setEditorModal({ mode: 'edit', project: proj })}
          onImportBundleFile={handleImportFile}
        />
        <ProjectModal
          open={Boolean(editorModal)}
          mode={editorModal?.mode ?? 'create'}
          initialProject={editorModal?.mode === 'edit' ? editorModal.project : undefined}
          folders={folders}
          palette={palette}
          t={t}
          onSubmit={async data => {
            const current = editorModal
            setEditorModal(null)
            if (current?.mode === 'edit') {
              await handleUpdateProject(current.project.id, data)
            } else {
              await handleCreateProject(data)
            }
          }}
          onClose={() => setEditorModal(null)}
        />
      </>
    )
  }

  return (
    <ProjectsHub
      projects={projects}
      folders={folders}
      openProjectIds={openProjectIds}
      storageMode={storageMode}
      language={language}
      preference={preference}
      palette={palette}
      t={t}
      notice={hubNotice}
      onDismissNotice={() => setHubNotice(null)}
      onLanguageChange={setLanguage}
      onThemeChange={setPreference}
      onOpenProject={project => void openProjectById(project.id)}
      onReturnToEditor={returnToEditor}
      onCreateProject={handleCreateProject}
      onUpdateProject={handleUpdateProject}
      onRenameProject={(project, name) => handleRenameProject(project.id, name)}
      onTogglePin={handleTogglePin}
      onDuplicateProject={handleDuplicateProject}
      onDeleteProject={handleDeleteProject}
      onExportProject={handleExportProject}
      onExportBackup={handleExportBackup}
      onExportFolder={handleExportFolder}
      onImportFile={handleImportFile}
      onCreateFolder={handleCreateFolder}
      onUpdateFolder={handleUpdateFolder}
      onDeleteFolder={handleDeleteFolder}
      onQuickTemplate={handleQuickTemplate}
    />
  )
}
