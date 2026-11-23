import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Activity,
  AudioWaveform,
  Blocks,
  Box,
  Cable,
  Ellipsis,
  EllipsisVertical,
  Eraser,
  Eye,
  FlipHorizontal2,
  Grid2x2,
  Move,
  Search,
  ArrowDownToLine,
  CircleCheck,
  CircuitBoard,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Crosshair,
  Hand,
  MousePointer2,
  Palette,
  Pause,
  Play,
  Plus,
  Minus,
  Redo2,
  RotateCw,
  SlidersHorizontal,
  Table2,
  Trash2,
  Undo2,
  Waypoints,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { compile, transientBranches, groundFlows, wireFlows, type BreadboardLayout, type Circuit, type Component, type Kind } from '../circuit/model'
import { currentLimit, ratingsExceeded } from '../circuit/ratings'
import { autoPlaceCircuit, compileBoard } from '../breadboard/compiler'
import { boardShape } from '../breadboard/model'
import { defaultBoardSettings, type BoardSize } from '../breadboard/settings'
import { JUMPER_COLORS } from '../breadboard/types'
import { useBreadboard } from '../breadboard/useBreadboard'
import { solve, type DiagnosticTarget } from '../engine/solver'
import Canvas from '../editor/Canvas'
import { useTransient } from '../editor/useTransient'
import Scope from '../editor/Scope'
import { useEditor } from '../editor/useEditor'
import { catalog, metric, parseMetric } from '../editor/catalog'
import { Symbol } from '../editor/Symbol'
import { diagnostic, type Language, type Translate } from '../locale'
import { exportJson, exportPng } from '../editor/io'
import { blankCircuit, type Project } from '../storage/types'
import type { Theme, ThemePreference } from '../theme'
import { palettes } from '../palette'
import { ResistorColorModal, ResistorMiniPreview } from '../tools/ResistorColorTool'
import { ThemeSwitch } from './ChromeControls'
import { IconTool, Launcher, Panel } from './Panel'
import { panelSides, usePanels, type PanelId } from './panels'
import { ProjectHeader, type SaveState } from './ProjectHeader'
import { useInsets, type InsetSources } from './useInsets'

const Board = lazy(() => import('../breadboard/Board'))
const kinds = Object.keys(catalog) as Kind[]
const groups = [...new Set(kinds.map(kind => catalog[kind].group))]
const one = (n: number | readonly number[]) => typeof n === 'number' ? n : n[0]
const sizeNames: Record<BoardSize, string> = { mini: 'Mini', half: 'Half', full: 'Full' }

function Setting({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="setting"><span>{label}</span><Switch size="sm" checked={checked} onCheckedChange={onChange} /></label>
}
function Reading({ label, value }: { label: string; value: string }) {
  return <div className="reading"><span>{label}</span><strong>{value}</strong></div>
}
/** Text that collapses to an icon on narrow top bars while staying the button's accessible name. */
function Label({ children }: { children: ReactNode }) {
  return <span className="action-label">{children}</span>
}

/** Launcher label, icon, and panel title of every workspace panel, in launcher order. */
const panelMeta: { id: PanelId; label: string; title: string; icon: ReactNode }[] = [
  { id: 'library', label: 'Library', title: 'Components', icon: <Blocks /> },
  { id: 'inspector', label: 'Inspector', title: 'Properties', icon: <SlidersHorizontal /> },
  { id: 'display', label: 'Display', title: 'Visualization', icon: <Eye /> },
  { id: 'results', label: 'Results', title: 'Simulation results', icon: <Table2 /> },
  { id: 'scope', label: 'Oscilloscope', title: 'Oscilloscope', icon: <AudioWaveform /> },
]

export type WorkbenchProps = {
  project: Project
  saveState: SaveState
  storageMode: 'indexeddb' | 'memory'
  language: Language
  preference: ThemePreference
  theme: Theme
  t: Translate
  onThemeChange: (preference: ThemePreference) => void
  onCircuitChange: (projectId: string, circuit: Circuit) => void
  onBackToHub: () => void
  onRenameProject: (projectId: string, name: string) => Promise<void>
  onEditProjectDetails: (project: Project) => void
}

export function Workbench({
  project,
  saveState,
  storageMode,
  language,
  preference,
  theme,
  t,
  onThemeChange,
  onCircuitChange,
  onBackToHub,
  onRenameProject,
  onEditProjectDetails,
}: WorkbenchProps) {
  const palette = palettes[theme]
  const viewMode = project.preferredView
  const schematic = viewMode === 'schematic'
  const boardSettings = project.boardSettings ?? defaultBoardSettings

  const [query, setQuery] = useState('')
  const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const matches = kinds.filter(kind => normalize(`${t(catalog[kind].name)} ${catalog[kind].prefix}`).includes(normalize(query.trim())))
  const editor = useEditor(project.circuit, {
    onCircuitChange: next => onCircuitChange(project.id, next),
    externalStorageError: storageMode === 'memory' || saveState === 'error',
  })
  const panels = usePanels(viewMode)
  const [menuOpen, setMenuOpen] = useState(false)
  const [resistorTool, setResistorTool] = useState<{ open: boolean; initialOhms?: number; targetId?: string }>({ open: false })
  const [probe, setProbe] = useState('')
  const [running, setRunning] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [reverse, setReverse] = useState(false)
  const [showGround, setShowGround] = useState(true)
  const [showNodes, setShowNodes] = useState(true)
  const [showVoltage, setShowVoltage] = useState(false)
  const [message, setMessage] = useState('')
  const [ioError, setIoError] = useState(false)
  const stage = useRef<HTMLElement>(null)
  // Circuits fit the free editor area when they open: on first load and after clearing the circuit.
  const [fitRequest, setFitRequest] = useState(0)

  const shape = useMemo(
    () => boardShape(boardSettings),
    [boardSettings.size, boardSettings.rails, boardSettings.splitRails],
  )
  const simulatedBoardLayout = useMemo<BreadboardLayout>(() => {
    if (editor.simulated.breadboard) return editor.simulated.breadboard
    if (!schematic && editor.simulated.wires.length > 0) return autoPlaceCircuit(editor.simulated, shape)
    return { placements: [], jumpers: [] }
  }, [editor.simulated, schematic, shape])
  const boardLayout = useMemo<BreadboardLayout>(() => {
    if (editor.circuit.breadboard) return editor.circuit.breadboard
    if (!schematic && editor.circuit.wires.length > 0) return autoPlaceCircuit(editor.circuit, shape)
    return { placements: [], jumpers: [] }
  }, [editor.circuit, schematic, shape])
  const breadboard = useBreadboard({
    circuit: editor.circuit,
    layout: boardLayout,
    shape,
    selected: editor.selected,
    onSelect: editor.select,
    onCommit: editor.commit,
  })

  const net = useMemo(() => schematic
    ? compile(editor.simulated)
    : compileBoard(shape, editor.simulated.components, simulatedBoardLayout),
  [schematic, shape, editor.simulated, simulatedBoardLayout])

  const solved = useMemo<ReturnType<typeof solve>>(() => net.branches.length > 200
    ? { ok: false as const, error: 'This DC workbench supports up to 200 electrical branches per simulation.' }
    : solve(net.branches), [net])
  const dynamicBranches = useMemo(() => transientBranches(editor.simulated, net.branches), [editor.simulated, net])
  const transient = useTransient(dynamicBranches, running)
  const probeParts = editor.circuit.components.filter(c => c.kind !== 'ground')
  const activeProbe = probeParts.some(c => c.id === probe) ? probe : transient.capacitors[0]?.id ?? ''
  // Pausing freezes the displayed measurements as well as the animation.
  const [held, setHeld] = useState<{ net: typeof net; solved: typeof solved; circuit: Circuit } | null>(null)
  const active = transient.enabled ? { net, solved: transient.result ?? solved, circuit: editor.circuit }
    : running || !held ? { net, solved, circuit: editor.circuit } : held
  const pendingSample = transient.enabled && !transient.result
  const valid = !pendingSample && active.solved.ok ? active.solved : null
  const currents = useMemo(() => Object.fromEntries(Object.entries(valid?.branches ?? {}).map(([id, branch]) => [id, branch.current])), [valid])
  const trippedFuses = useMemo(() => {
    const tripped = new Set<string>()
    if (!valid) return tripped
    for (const warning of valid.warnings) {
      const targetId = valid.warningTargets?.[warning]?.branchId
      if (targetId && warning.startsWith('Fuse ')) tripped.add(targetId)
    }
    return tripped
  }, [valid])
  const flows = useMemo(() => valid && schematic ? wireFlows(active.circuit, currents) : {}, [active.circuit, currents, schematic, valid])
  const grounds = useMemo(() => valid && schematic ? groundFlows(active.circuit, currents) : {}, [active.circuit, currents, schematic, valid])
  const inspected = editor.selected.length === 1 ? editor.circuit.components.find(c => c.id === editor.selected[0]) : undefined
  const read = inspected ? valid?.branches[inspected.id] : undefined
  const wire = schematic && editor.selected.length === 1 ? editor.circuit.wires.find(w => w.id === editor.selected[0]) : undefined
  const hasCircuit = schematic ? editor.circuit.components.length > 0 : boardLayout.placements.length > 0
  const fault = !pendingSample && !active.solved.ok && hasCircuit ? active.solved.error : ''
  const alerts = valid ? ratingsExceeded(active.circuit.components, valid.branches) : []
  const target = !active.solved.ok ? active.solved.target : undefined
  const targets = (item?: DiagnosticTarget) => item?.branchId ? [item.branchId] : item?.node
    ? active.circuit.components.filter(c => [0, 1].some(pin => active.net.nodeByPin[`${c.id}:${pin}`] === item.node)).map(c => c.id)
    : []
  const faultIds = targets(target)
  const warnings = valid?.warnings.map(message => ({ message, ids: targets(valid.warningTargets?.[message]) })) ?? []
  const flagged = [...new Set([...alerts.map(a => a.id), ...faultIds, ...warnings.flatMap(w => w.ids)])]
  const delivered = Object.values(valid?.branches ?? {}).reduce((total, b) => total + Math.max(0, -b.power), 0)

  // Panels: each project type shows only the panels relevant to it (no board settings panel in the editor).
  const available = (id: PanelId) => {
    if (id === 'board') return false
    if (id === 'scope') return transient.enabled
    if (id === 'display') return schematic
    return true
  }
  const shown = panelMeta.filter(panel => available(panel.id) && panels.layout[panel.id].open)
  // A tablet docks at most one side panel; any other pinned side panel floats.
  const dockedSide = shown.find(panel => panelSides[panel.id] !== 'bottom' && panels.docked(panel.id))?.id
  const docked = (id: PanelId) => panels.docked(id) && (panels.tier !== 'tablet' || panelSides[id] === 'bottom' || id === dockedSide)
  const placed = (side: 'left' | 'right' | 'bottom', dock: boolean) => shown.filter(panel => panelSides[panel.id] === side && docked(panel.id) === dock)
  const dock = { left: placed('left', true).length > 0, right: placed('right', true).length > 0, bottom: placed('bottom', true).length > 0 }
  const wide = panels.tier === 'desktop'
  // The editors frame their content in the area left free by the floating chrome. Phone sheets are transient, so only
  // the status line and the launcher count there.
  const insetSources: InsetSources = panels.compact
    ? { top: ['.project-header', '.topbar', '.hud-top > .toolbar'], bottom: ['.statusbar', '.launcher-host'], left: [], right: [] }
    : { top: ['.project-header', '.topbar', '.hud-top > .toolbar'], bottom: ['.statusbar', '.float-bottom'], left: ['.launcher-host', '.float-left'], right: ['.float-right'] }
  const insets = useInsets(stage, insetSources, `${viewMode}:${panels.tier}:${shown.map(panel => `${panel.id}${docked(panel.id) ? '+' : ''}`)}`)

  function toggleRun() {
    if (running) setHeld({ net, solved, circuit: editor.circuit })
    else setHeld(null)
    setRunning(!running)
  }
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      const key = event.key.toLowerCase()
      if (event.defaultPrevented) return
      if (event.target instanceof HTMLElement && (event.target.closest('input, textarea, select, [contenteditable], [role="slider"], [role="option"], [role="listbox"], [role="dialog"], [role="alertdialog"], [aria-expanded="true"]') || event.target.isContentEditable || (key === ' ' && event.target.closest('button')))) return
      if ((event.metaKey || event.ctrlKey) && (key === 'z' || key === 'y')) { event.preventDefault(); editor.history(key === 'y' || event.shiftKey) }
      else if (schematic && (event.metaKey || event.ctrlKey) && key === 'c' && editor.canCopy && !window.getSelection()?.toString()) { event.preventDefault(); editor.copy() }
      else if (schematic && (event.metaKey || event.ctrlKey) && key === 'v' && editor.canPaste) { event.preventDefault(); editor.paste() }
      else if (schematic && (event.metaKey || event.ctrlKey) && key === 'd' && editor.canCopy) { event.preventDefault(); editor.duplicate() }
      else if (key === 'r' && schematic) editor.rotate()
      else if (key === 'f' && !schematic && breadboard.canFlip) { event.preventDefault(); breadboard.flipSelected() }
      else if (key === 'delete' || key === 'backspace') {
        event.preventDefault()
        if (schematic) editor.remove()
        else breadboard.deleteSelected()
      }
      else if (key === ' ') { event.preventDefault(); if (!event.repeat) toggleRun() }
      else if (key === 'escape') {
        if (schematic) { editor.setTool('select'); editor.select([]) }
        else { breadboard.cancelPending(); breadboard.setTool('select'); editor.select([]) }
      }
      else if (key === 'w') {
        if (schematic) editor.setTool('wire')
        else breadboard.setTool('wire')
      }
      else if (key === 'p' && !schematic) breadboard.setTool('probe')
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  })
  // Runs once the opened circuit has rendered; the view is not part of the circuit or its undo history.
  useEffect(() => { if (schematic) editor.fit() }, [fitRequest, schematic])

  function openCircuit(next: Circuit) {
    setFitRequest(request => request + 1)
    editor.replace(next); setRunning(true); setHeld(null); transient.reset(); setProbe('')
    breadboard.cancelPending()
  }
  function newCircuit() {
    openCircuit(schematic ? blankCircuit() : { ...blankCircuit(), breadboard: { placements: [], jumpers: [] } })
    setMessage('')
    setMenuOpen(false)
  }
  function exportAs(kind: 'JSON' | 'PNG') {
    setMenuOpen(false)
    return kind === 'JSON' ? handleIo(() => exportJson(editor.circuit), 'JSON exported.') : handleIo(exportImage, 'PNG exported.')
  }
  async function handleIo(action: () => void | Promise<void>, success: string) {
    try { await action(); setIoError(false); setMessage(success) }
    catch (error) { setIoError(true); setMessage(error instanceof Error ? error.message : 'The operation failed.') }
  }
  function exportImage() {
    const svg = editor.svg.current
    if (!svg) return
    // The on-screen view box grows with the window; the PNG keeps the 800 × 540 drawing frame.
    const copy = svg.cloneNode(true) as SVGSVGElement
    copy.setAttribute('viewBox', '0 0 800 540')
    return exportPng(copy, editor.view)
  }

  function openColorTool(part?: Component) {
    setMenuOpen(false)
    setResistorTool({
      open: true,
      initialOhms: part?.kind === 'resistor' ? part.value : undefined,
      targetId: part?.kind === 'resistor' ? part.id : undefined,
    })
  }
  const targetResistor = resistorTool.targetId
    ? editor.circuit.components.find(c => c.id === resistorTool.targetId && c.kind === 'resistor')
    : inspected?.kind === 'resistor' ? inspected : undefined

  function handleLibraryPartClick(kind: Kind) {
    if (schematic) {
      editor.add(kind)
    } else {
      breadboard.startPlaceNew(kind)
      if (panels.compact) panels.setOpen('library', false)
    }
  }

  const content: Record<PanelId, ReactNode> = {
    library: <>
      <div className="library-search"><Search size={15} /><Input type="search" aria-label={t('Find components')} placeholder={t('Find components')} value={query} onChange={event => setQuery(event.target.value)} /></div>
      <div className="library-content">
        {!matches.length && <p className="panel-empty">{t('No matching components.')}</p>}
        {groups.filter(group => matches.some(kind => catalog[kind].group === group)).map(group => <section key={group}>
          <h3 className="section-label">{t(group)}</h3>
          {matches.filter(kind => catalog[kind].group === group).map(kind => {
            const placing = !schematic && breadboard.pending?.type === 'place-new' && breadboard.pending.kind === kind
            return <Button key={kind} variant="ghost" className="library-part" aria-pressed={placing || undefined} onClick={() => handleLibraryPartClick(kind)}>
              <span className="part-icon"><svg viewBox="-42 -27 84 54" aria-hidden="true"><Symbol kind={kind} /></svg></span>
              <span>{t(catalog[kind].name)}</span><Plus className="add-icon" />
            </Button>
          })}
        </section>)}
      </div>
    </>,
    inspector: <div className="inspector-body">
      {inspected ? (
        <Properties
          t={t}
          key={inspected.id}
          part={inspected}
          update={(changes, preview) => editor.update(inspected, changes, preview)}
          onOpenColorTool={inspected.kind === 'resistor' ? () => openColorTool(inspected) : undefined}
        />
      ) :
        <div className="empty-state"><span className="empty-state-icon"><MousePointer2 size={16} /></span><strong>{wire ? t('Wire selected') : breadboard.selectedJumper ? t('Selected jumper wire') : editor.selected.length ? `${editor.selected.length} ${t('items selected')}` : t('Nothing selected')}</strong>
          <small>{wire ? `${t('Current')}: ${metric(flows[wire.id], 'A')}` : breadboard.selectedJumper ? `${breadboard.selectedJumper.from} ↔ ${breadboard.selectedJumper.to}` : t('Select a component to edit its parameters.')}</small></div>}
      {inspected && <div className="measurements"><Reading label={t('Voltage drop')} value={metric(read?.voltage, 'V')} /><Reading label={t('Current')} value={metric(inspected.kind === 'ground' ? grounds[inspected.id] : read?.current, 'A')} /><Reading label={t('Power')} value={metric(read?.power, 'W')} /></div>}
    </div>,
    display: <div className="display-body">
      <section className="panel-section">
        <h3 className="section-label">{t('Canvas overlays')}</h3>
        <Setting label={t('Node voltages')} checked={showNodes} onChange={setShowNodes} />
        <Setting label={t('Voltage colors')} checked={showVoltage} onChange={setShowVoltage} />
        <Setting label={t('Ground returns')} checked={showGround} onChange={setShowGround} />
        <Setting label={t('Electron flow')} checked={reverse} onChange={setReverse} />
        <div className="speed"><div><label htmlFor="flow-speed">{t('Animation speed')}</label><span>{speed.toLocaleString(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×</span></div>
          <Slider id="flow-speed" value={[speed]} min={.2} max={3} step={.1} onValueChange={v => setSpeed(one(v))} /></div>
      </section>
      <section className="panel-section key-guide"><h3 className="section-label">{t('Shortcuts')}</h3><span><kbd>R</kbd> {t('Rotate')}</span><span><kbd>{language === 'es' ? 'Supr' : 'Del'}</kbd> {t('Delete')}</span><span><kbd>{language === 'es' ? 'Espacio' : 'Space'}</kbd> {t('Play / pause')}</span><span><kbd>Esc</kbd> {t('Cancel')}</span></section>
    </div>,
    board: null,
    results: <>
      <div className="result-summary"><Reading label={t('Nodes')} value={String(Object.keys(valid?.nodes ?? {}).length)} /><Reading label={t('Power delivered')} value={valid ? metric(delivered, 'W') : '—'} />
        <Reading label={t('Power absorbed')} value={valid ? metric(delivered + valid.balance, 'W') : '—'} /><Reading label={t('Residual')} value={valid ? metric(valid.balance, 'W') : '—'} /></div>
      {!valid || !hasCircuit ? <div className="empty-state result-empty"><strong>{t('Reading unavailable')}</strong>
        <small>{t(!hasCircuit ? 'Add components from the library.' : pendingSample ? 'Awaiting a transient sample' : 'No solution')}</small></div> : <div className="tables">
        <div className="table-wrap"><table><caption className="section-label">{t('Component readings')}</caption><thead><tr><th>{t('Branch')}</th><th>ΔV</th><th>{t('Current')}</th><th>{t('Power')}</th></tr></thead>
          <tbody>{Object.entries(valid?.branches ?? {}).map(([id, r]) => <tr key={id}><th scope="row">{active.circuit.components.find(c => c.id === id)?.label ?? id}</th><td>{metric(r.voltage, 'V')}</td><td>{metric(r.current, 'A')}</td><td>{metric(r.power, 'W')}</td></tr>)}</tbody></table></div>
        <div className="table-wrap"><table><caption className="section-label">{t('Node potentials')}</caption><thead><tr><th>{t('Node')}</th><th>{t('Voltage')}</th></tr></thead><tbody>{Object.entries(valid?.nodes ?? {}).map(([node, volts]) => <tr key={node}><th scope="row">{node === '0' ? 'GND' : node}</th><td>{metric(volts, 'V')}</td></tr>)}</tbody></table></div>
      </div>}
    </>,
    scope: <Scope t={t} palette={palette} samples={transient.samples} time={transient.time} parts={probeParts} probe={activeProbe} onProbe={setProbe} reset={transient.reset} />,
  }
  const renderPanel = ({ id, label, title, icon }: typeof panelMeta[number]) => <Panel key={id} id={id} side={panelSides[id]} title={t(title)} icon={icon}
    pinned={docked(id)} pinnable={panels.canPin(id)} pinLabel={t(`Pin ${label}`)} closeLabel={t(`Close ${label}`)}
    pinTip={t('Pin panel')} unpinTip={t('Unpin panel')} onPin={pinned => panels.setPinned(id, pinned)} onClose={() => panels.setOpen(id, false)}
    className={`panel-${id}`}>{content[id]}</Panel>
  const notice = fault || valid?.warnings.length || alerts.length || message || editor.storageError

  const fileButtons = (size: 'sm' | 'default') => <>
    <Button variant="ghost" size={size} onClick={newCircuit}><Plus /><Label>{t('New')}</Label></Button>
    <div className="export-group" role="group" aria-label={t('Export')}>
      <Button variant="ghost" size={size} onClick={() => exportAs('JSON')}><ArrowDownToLine /> JSON</Button>
      {schematic && <Button variant="ghost" size={size} onClick={() => exportAs('PNG')}><ArrowDownToLine /> PNG</Button>}
    </div>
  </>
  const themeSwitch = <ThemeSwitch value={preference} onChange={onThemeChange} t={t} />
  const tool = (label: string, icon: ReactNode, onClick: () => void, options: { pressed?: boolean; disabled?: boolean } = {}) =>
    <IconTool side="bottom" label={t(label)} pressed={options.pressed} disabled={options.disabled} onClick={onClick}>{icon}</IconTool>
  const clipboardTools = <>
    {tool('Copy selection', <Copy />, editor.copy, { disabled: !editor.canCopy })}
    {tool('Paste', <ClipboardPaste />, () => editor.paste(), { disabled: !editor.canPaste })}
    {tool('Duplicate selection', <CopyPlus />, editor.duplicate, { disabled: !editor.canCopy })}
  </>
  const zoomTools = <>
    {tool('Zoom out', <Minus />, () => editor.zoom(1 / 1.2))}
    <span className="zoom-level">{Math.round(editor.view.scale * 100)}%</span>
    {tool('Zoom in', <Plus />, () => editor.zoom(1.2))}
  </>

  const modeLabel = schematic
    ? t('Circuit')
    : `${t('Breadboard')} · ${t(sizeNames[boardSettings.size])}`

  return <TooltipProvider>
    <div className="workbench" data-project-header data-view={viewMode} data-tier={panels.tier} data-compact={panels.compact}
      data-dock-left={dock.left} data-dock-right={dock.right} data-dock-bottom={dock.bottom} data-sheet-open={panels.compact && shown.length > 0}>
      <ProjectHeader
        activeProject={project}
        saveState={saveState}
        t={t}
        onBackToHub={onBackToHub}
        onRenameActive={name => onRenameProject(project.id, name)}
        onEditActiveDetails={() => onEditProjectDetails(project)}
      />

      <header className="topbar">
        <div className="brand"><div className="brand-icon">{schematic ? <Waypoints size={17} /> : <CircuitBoard size={17} />}</div><div className="brand-text"><strong>Meshlab<span>.</span></strong><small>{t('DC CIRCUIT WORKBENCH')}</small></div></div>
        <span className="workspace-mode-pill" aria-label={t('Project type')}>
          {schematic ? <Waypoints size={13} /> : <CircuitBoard size={13} />}
          <span>{modeLabel}</span>
        </span>
        <Badge variant="outline" className={`state ${fault ? 'state-fault' : running && hasCircuit ? 'state-live' : 'state-idle'}`}><i />{fault ? t('CHECK CIRCUIT') : !hasCircuit ? t('EMPTY') : running ? t(transient.enabled ? 'TRANSIENT LIVE' : 'LIVE DC') : t('PAUSED')}</Badge>
        {wide && <div className="file-actions">
          {fileButtons('sm')}
          <Button variant="ghost" size="sm" onClick={() => openColorTool(inspected?.kind === 'resistor' ? inspected : undefined)}>
            <Palette /><Label>{t('Color code')}</Label>
          </Button>
          <span className="topbar-divider" aria-hidden="true" />
          {themeSwitch}
        </div>}
        <Button className="run-button" data-running={running} onClick={toggleRun}>{running ? <Pause /> : <Play />}<Label>{running ? t('Pause') : t('Run simulation')}</Label></Button>
        {!wide && <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger render={<Button variant="ghost" size="icon" className="more-trigger" aria-label={t('More actions')} />}><Ellipsis /></PopoverTrigger>
          <PopoverContent className="more-menu" aria-label={t('More actions')}>
            <section className="more-section">
              <h3 className="section-label">{t('Circuit file')}</h3>
              <div className="more-grid">{fileButtons('default')}</div>
            </section>
            <section className="more-section">
              <h3 className="section-label">{t('Tools')}</h3>
              <Button variant="ghost" size="default" onClick={() => openColorTool(inspected?.kind === 'resistor' ? inspected : undefined)}>
                <Palette /><Label>{t('Color code')}</Label>
              </Button>
            </section>
            <section className="more-section">
              <h3 className="section-label">{t('Appearance')}</h3>
              <div className="more-row"><span>{t('Theme')}</span>{themeSwitch}</div>
            </section>
          </PopoverContent>
        </Popover>}
      </header>

      {placed('left', true).length > 0 && <aside className="dock dock-left">{placed('left', true).map(renderPanel)}</aside>}

      <main className="stage" ref={stage}>
        <h1 className="sr-only">{t(schematic ? 'Circuit canvas' : 'Breadboard')}</h1>
        {schematic ? (
          <div className="editor">
            <Canvas t={t} palette={palette} svg={editor.svg} circuit={editor.drawn} view={editor.view} selected={editor.selected} flagged={flagged}
              pins={active.net.nodeByPin} nodes={valid?.nodes ?? {}} readings={valid?.branches ?? {}} flows={flows} grounds={grounds}
              mode={editor.mode} cursor={editor.cursor} wireFrom={editor.wireFrom} running={running} speed={speed} reverse={reverse}
              showGround={showGround} showNodes={showNodes} showVoltage={showVoltage} onBackground={editor.backgroundDown}
              onComponent={editor.componentDown} onEndpoint={editor.endpointDown} onWire={editor.wireDown} onRoute={editor.routeDown}
              onMove={editor.move} onUp={editor.up} box={editor.box} inset={insets} />
            {!hasCircuit && <div className="canvas-empty" style={{ paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }}>
              <span className="canvas-empty-icon"><CircuitBoard /></span><strong>{t('Start a new circuit')}</strong><span>{t('Add components from the library.')}</span></div>}
          </div>
        ) : (
          <div className="editor">
            <Suspense fallback={<div className="board-loading" role="status">{t('Loading breadboard…')}</div>}>
              <Board t={t} theme={theme} settings={boardSettings} circuit={editor.circuit} layout={boardLayout} board={breadboard}
                pins={active.net.nodeByPin} readings={valid?.nodes} branchReadings={valid?.branches} trippedFuses={trippedFuses}
                selected={editor.selected} onSelect={editor.select} onToggle={part => editor.update(part, { closed: !part.closed })}
                insets={insets} />
            </Suspense>
          </div>
        )}

        <div className="hud-top">
          {schematic ? (
            <div className="toolbar" role="group" aria-label={t('SCHEMATIC TOOLS')}>
              <div className="tool-group">
                {tool('Select and move', <MousePointer2 />, () => editor.setTool('select'), { pressed: editor.mode === 'select' })}
                {tool('Wire (W)', <Waypoints />, () => editor.setTool('wire'), { pressed: editor.mode === 'wire' })}
                {tool('Pan', <Hand />, () => editor.setTool('pan'), { pressed: editor.mode === 'pan' })}
              </div>
              <div className="tool-group">
                {tool('Undo', <Undo2 />, () => editor.history(false), { disabled: !editor.canUndo })}
                {tool('Redo', <Redo2 />, () => editor.history(true), { disabled: !editor.canRedo })}
                {tool('Rotate (R)', <RotateCw />, editor.rotate, { disabled: !editor.selected.length })}
                {tool('Delete (Del)', <Trash2 />, editor.remove, { disabled: !editor.selected.length })}
              </div>
              <div className="tool-group tools-extra">{clipboardTools}</div>
              <div className="tool-group">
                <span className="tools-extra">{zoomTools}</span>
                {tool('Fit to circuit', <Crosshair />, editor.fit)}
                {/* Narrow stages keep the less frequent tools in an overflow so the toolbar never scrolls sideways. */}
                <span className="tools-more"><Popover>
                  <PopoverTrigger render={<Button variant="ghost" size="icon-sm" className="tool" aria-label={t('More tools')} />}><EllipsisVertical /></PopoverTrigger>
                  <PopoverContent className="tools-menu" align="end" aria-label={t('More tools')}>
                    <div className="tool-group">{clipboardTools}</div>
                    <div className="tool-group">{zoomTools}</div>
                  </PopoverContent>
                </Popover></span>
              </div>
            </div>
          ) : (
            <div className="toolbar board-toolbar" role="group" aria-label={t('BREADBOARD TOOLS')}>
              <div className="tool-group">
                {tool('Select and move', <MousePointer2 />, () => breadboard.setTool('select'), { pressed: breadboard.tool === 'select' && !breadboard.pending })}
                {tool('Jumper wire (W)', <Cable />, () => breadboard.setTool('wire'), { pressed: breadboard.tool === 'wire' })}
                {tool('Voltage probe (P)', <Crosshair />, () => breadboard.setTool('probe'), { pressed: breadboard.tool === 'probe' })}
              </div>
              <div className="tool-group board-toolbar-colors tools-extra" role="group" aria-label={t('Jumper color')}>
                {JUMPER_COLORS.map(swatch => (
                  <button
                    key={swatch.id}
                    type="button"
                    className="board-color-dot"
                    data-active={breadboard.jumperColor === swatch.hex || undefined}
                    style={{ '--swatch': swatch.hex } as CSSProperties}
                    aria-label={t(swatch.name)}
                    aria-pressed={breadboard.jumperColor === swatch.hex}
                    onClick={() => breadboard.setJumperColor(swatch.hex)}
                  />
                ))}
              </div>
              <div className="tool-group">
                {tool('Undo', <Undo2 />, () => editor.history(false), { disabled: !editor.canUndo })}
                {tool('Redo', <Redo2 />, () => editor.history(true), { disabled: !editor.canRedo })}
                {tool('Flip polarity (F)', <FlipHorizontal2 />, breadboard.flipSelected, { disabled: !breadboard.canFlip })}
                <span className="tools-extra">{tool('Relocate', <Move />, breadboard.startMoveSelected, { disabled: !breadboard.canMove })}</span>
                {tool('Delete (Del)', <Trash2 />, breadboard.deleteSelected, { disabled: !breadboard.canDelete })}
              </div>
              <div className="tool-group">
                {tool(
                  breadboard.cameraMode === 'top' ? 'Free 3D view' : 'Top-down 2D view',
                  breadboard.cameraMode === 'top' ? <Box /> : <Grid2x2 />,
                  () => breadboard.setCameraMode(mode => mode === 'top' ? '3d' : 'top'),
                  { pressed: breadboard.cameraMode === 'top' },
                )}
                <span className="tools-extra">
                  {tool('Clear breadboard', <Eraser />, breadboard.clearBoard, { disabled: boardLayout.placements.length === 0 && boardLayout.jumpers.length === 0 })}
                </span>
                <span className="tools-more"><Popover>
                  <PopoverTrigger render={<Button variant="ghost" size="icon-sm" className="tool" aria-label={t('More tools')} />}><EllipsisVertical /></PopoverTrigger>
                  <PopoverContent className="tools-menu" align="end" aria-label={t('More tools')}>
                    <div className="board-toolbar-colors" role="group" aria-label={t('Jumper color')}>
                      {JUMPER_COLORS.map(swatch => (
                        <button
                          key={swatch.id}
                          type="button"
                          className="board-color-dot"
                          data-active={breadboard.jumperColor === swatch.hex || undefined}
                          style={{ '--swatch': swatch.hex } as CSSProperties}
                          aria-label={t(swatch.name)}
                          aria-pressed={breadboard.jumperColor === swatch.hex}
                          onClick={() => breadboard.setJumperColor(swatch.hex)}
                        />
                      ))}
                    </div>
                    <div className="tool-group">
                      {tool('Relocate', <Move />, breadboard.startMoveSelected, { disabled: !breadboard.canMove })}
                      {tool('Clear breadboard', <Eraser />, breadboard.clearBoard, { disabled: boardLayout.placements.length === 0 && boardLayout.jumpers.length === 0 })}
                    </div>
                  </PopoverContent>
                </Popover></span>
              </div>
            </div>
          )}
          {notice ? <div role={fault || ioError ? 'alert' : 'status'} className={fault || ioError || valid?.warnings.length || alerts.length ? 'notice warning' : 'notice'}>
            {fault && <div className="diagnostic-row"><span>{diagnostic(language, fault)}</span>{faultIds.length > 0 && <Button size="xs" variant="outline" onClick={() => schematic ? editor.reveal(faultIds) : editor.select(faultIds)}>{t('Locate')}</Button>}</div>}
            {alerts.map(alert => {
              const unit = alert.quantity === 'current' ? 'A' : 'W'
              const label = active.circuit.components.find(c => c.id === alert.id)?.label ?? alert.id
              return <div key={`${alert.id}:${alert.quantity}`} className="diagnostic-row">
                <span><strong>{label}</strong> · {t(alert.quantity === 'current' ? 'Overcurrent' : 'Power limit exceeded')}: {metric(alert.actual, unit)} ({t('Limit')}: {metric(alert.limit, unit)})</span>
                <Button size="xs" variant="outline" onClick={() => schematic ? editor.reveal([alert.id]) : editor.select([alert.id])}>{t('Locate')}</Button>
              </div>
            })}{warnings.map(({ message, ids }) => <div key={message} className="diagnostic-row">
              <span>{diagnostic(language, message)}</span>
              {ids.length > 0 && <Button size="xs" variant="outline" onClick={() => schematic ? editor.reveal(ids) : editor.select(ids)}>{t('Locate')}</Button>}
            </div>)}{message && <div>{ioError ? diagnostic(language, message, true) : t(message)}</div>}
            {editor.storageError && <div>{t('Autosave is unavailable in this browser.')}</div>}
          </div> : null}
        </div>

        <div className="launcher-host">
          <Launcher label={t('Panels')} compact={panels.compact} onToggle={panels.toggle}
            items={panelMeta.filter(panel => available(panel.id)).map(({ id, label, icon }) => ({ id, label: t(label), icon, open: panels.layout[id].open }))} />
        </div>
        {placed('left', false).length > 0 && <div className="float float-left">{placed('left', false).map(renderPanel)}</div>}
        {placed('right', false).length > 0 && <div className="float float-right">{placed('right', false).map(renderPanel)}</div>}
        {placed('bottom', false).length > 0 && <div className="float float-bottom">{placed('bottom', false).map(renderPanel)}</div>}

        {schematic && <div className="statusbar">
          <span className="status-hint"><i />{editor.wireFrom ? t('Select a terminal or wire to connect') : editor.mode === 'wire' ? t('Start at a terminal or wire') : wire ? t('Drag a wire handle to reroute') : t('Click a terminal to start wiring')}</span>
          <span className="status-meta">{editor.circuit.components.length} {t('parts')} · {editor.circuit.wires.length} {t('wires')}</span>
          <span className="status-meta status-save">{editor.storageError ? t('Autosave unavailable') : <><CircleCheck size={12} />{t('Saved locally')}</>}</span>
          <span className="status-meta status-engine"><Activity size={12} />{t('Modified nodal analysis')}</span>
        </div>}
      </main>

      {placed('right', true).length > 0 && <aside className="dock dock-right">{placed('right', true).map(renderPanel)}</aside>}
      {placed('bottom', true).length > 0 && <section className="dock dock-bottom" aria-label={t('Pinned sheets')}>{placed('bottom', true).map(renderPanel)}</section>}
    </div>
    <ResistorColorModal
      open={resistorTool.open}
      initialOhms={resistorTool.initialOhms ?? targetResistor?.value}
      targetResistorLabel={targetResistor?.label}
      language={language}
      t={t}
      onClose={() => setResistorTool({ open: false })}
      onApplyToResistor={targetResistor ? ohms => editor.update(targetResistor, { value: ohms }) : undefined}
      onAddResistor={ohms => {
        if (schematic) {
          editor.add('resistor', undefined, ohms)
        } else {
          breadboard.startPlaceNew('resistor', ohms)
        }
      }}
    />
  </TooltipProvider>
}

function Properties({
  part,
  update,
  onOpenColorTool,
  t,
}: {
  t: Translate
  part: Component
  update: (changes: Partial<Component>, preview?: boolean) => void
  onOpenColorTool?: () => void
}) {
  const meta = catalog[part.kind]
  const [label, setLabel] = useState(part.label)
  const [draft, setDraft] = useState(metric(part.value, meta.unit))
  const [invalid, setInvalid] = useState(false)
  const [liveValue, setLiveValue] = useState<number>()
  const [livePosition, setLivePosition] = useState<number>()
  useEffect(() => { setDraft(metric(part.value, meta.unit)) }, [part.value, meta.unit])
  useEffect(() => { setLabel(part.label) }, [part.label])
  const signed = part.kind === 'voltage' || part.kind === 'current'
  function setValue() {
    const number = parseMetric(draft, meta.unit)
    if (!Number.isFinite(number) || (!signed && number <= 0)) { setInvalid(true); return }
    setInvalid(false)
    update({ value: number })
    setDraft(metric(number, meta.unit))
  }
  function onValue(value: number, preview: boolean) {
    const next = signed ? value : Math.max(extent / 1000, value)
    setLiveValue(preview ? value : undefined)
    setDraft(metric(next, meta.unit))
    setInvalid(false)
    update({ value: next }, preview)
  }
  function onPosition(position: number, preview: boolean) {
    setLivePosition(preview ? position : undefined)
    update({ position }, preview)
  }
  const extent = Math.max(Math.abs(meta.value) * 10, Math.abs(part.value), .001)
  return <div className="properties">
    <div className="part-heading"><span className="part-icon"><svg viewBox="-42 -27 84 54" aria-hidden="true"><Symbol kind={part.kind} closed={part.closed} /></svg></span><strong>{t(meta.name)}</strong></div>
    <label className="field">{t('Label')}<Input value={label} maxLength={40} onChange={e => setLabel(e.target.value)} onBlur={() => { if (label.trim()) update({ label: label.trim() }); else setLabel(part.label) }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} /></label>
    {meta.unit && <>
      <label className="field">{t('Value')}<Input value={draft} aria-invalid={invalid} onChange={e => { setDraft(e.target.value); setInvalid(false) }} onBlur={setValue} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} /></label>
      {invalid && <small className="form-error">{t(signed ? 'Enter a valid value in' : 'Enter a positive value in')} {meta.unit}.</small>}
      <Slider aria-label={t('Component value')} min={signed ? -extent : 0} max={extent} step={extent / 1000} value={[liveValue ?? part.value]}
        onValueChange={v => onValue(one(v), true)} onValueCommitted={v => onValue(one(v), false)} />
    </>}
    {part.kind === 'resistor' && onOpenColorTool && (
      <ResistorMiniPreview ohms={liveValue ?? part.value} t={t} onClick={onOpenColorTool} />
    )}
    {part.kind === 'potentiometer' && <div className="speed"><div><span>{t('Wiper')}</span><span>{Math.round((livePosition ?? part.position ?? .5) * 100)}%</span></div>
      <Slider aria-label={t('Wiper position')} min={0} max={1} step={.01} value={[livePosition ?? part.position ?? .5]} onValueChange={v => onPosition(one(v), true)} onValueCommitted={v => onPosition(one(v), false)} /></div>}
    {part.kind !== 'ground' && <details className="ratings">
      <summary>{t('Electrical limits')}</summary>
      <RatingField label={t('Current limit')} unit="A" value={currentLimit(part)} t={t} commit={maxCurrent => update({ maxCurrent })} />
      <RatingField label={t('Power limit')} unit="W" value={part.maxPower ?? 0} t={t} commit={maxPower => update({ maxPower })} />
      <small>{t('Set 0 to disable a limit.')}</small>
    </details>}
    {part.kind === 'switch' && <Setting label={t('Switch closed')} checked={!!part.closed} onChange={closed => update({ closed })} />}
  </div>
}

function RatingField({ label, unit, value, t, commit }: { label: string; unit: string; value: number; t: Translate; commit: (value: number) => void }) {
  const [draft, setDraft] = useState(metric(value, unit))
  const [invalid, setInvalid] = useState(false)
  useEffect(() => { setDraft(metric(value, unit)); setInvalid(false) }, [value, unit])
  function finish() {
    const parsed = parseMetric(draft, unit)
    if (!Number.isFinite(parsed) || parsed < 0) { setInvalid(true); return }
    setDraft(metric(parsed, unit))
    if (parsed !== value) commit(parsed)
  }
  return <label className="field">{label}
    <Input value={draft} aria-invalid={invalid} onChange={event => { setDraft(event.target.value); setInvalid(false) }}
      onBlur={finish} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
    {invalid && <span className="form-error">{t('Enter a nonnegative limit.')}</span>}
  </label>
}
