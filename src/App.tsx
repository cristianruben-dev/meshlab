import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Activity, Languages, Monitor, Moon, Sun, Search, ArrowDownToLine, ChevronDown, CircleCheck, CircuitBoard, ClipboardPaste, Copy, CopyPlus, Crosshair, Hand, MousePointer2, Pause, Play, Plus, Minus, Redo2, RotateCw, Trash2, Undo2, Upload, Waypoints } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { compile, transientBranches, groundFlows, wireFlows, type Circuit, type Component, type Kind } from './circuit/model'
import { currentLimit, ratingsExceeded } from './circuit/ratings'
import { matchesGuide } from './breadboard/model'
import { examples } from './circuit/examples'
import { solve, type DiagnosticTarget } from './engine/solver'
import Canvas from './editor/Canvas'
import { useTransient } from './editor/useTransient'
import Scope from './editor/Scope'
import { useEditor } from './editor/useEditor'
import { catalog, metric, parseMetric } from './editor/catalog'
import { Symbol } from './editor/Symbol'
import { readLanguage, translate, diagnostic, type Language, type Translate } from './locale'
import { exportJson, exportPng, importJson } from './editor/io'
import { useTheme, type ThemePreference } from './theme'
import { palettes } from './palette'

const Board = lazy(() => import('./breadboard/Board'))
const exampleNames = Object.keys(examples)
const kinds = Object.keys(catalog) as Kind[]
const groups = [...new Set(kinds.map(kind => catalog[kind].group))]
const blank: Circuit = { version: 1, components: [], wires: [], junctions: [] }
const one = (n: number | readonly number[]) => typeof n === 'number' ? n : n[0]

function Tool({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} aria-pressed={active} disabled={disabled} className={active ? 'tool-active' : 'tool'} onClick={onClick} />}>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
}
const themeOptions = [['system', Monitor, 'System theme'], ['light', Sun, 'Light theme'], ['dark', Moon, 'Dark theme']] as const
function ThemeSwitch({ value, onChange, t }: { value: ThemePreference; onChange: (value: ThemePreference) => void; t: Translate }) {
  return <div className="segmented theme-switch" role="group" aria-label={t('Theme')}>
    {themeOptions.map(([option, Icon, label]) => <Tooltip key={option}><TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t(label)}
      aria-pressed={value === option} onClick={() => onChange(option)} />}><Icon /></TooltipTrigger><TooltipContent>{t(label)}</TooltipContent></Tooltip>)}
  </div>
}
function Setting({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="setting"><span>{label}</span><Switch size="sm" checked={checked} onCheckedChange={onChange} /></label>
}
function Reading({ label, value }: { label: string; value: string }) {
  return <div className="reading"><span>{label}</span><strong>{value}</strong></div>
}

export default function App() {
  const [language, setLanguage] = useState<Language>(readLanguage)
  const { preference, setPreference, theme } = useTheme()
  const palette = palettes[theme]
  const [query, setQuery] = useState('')
  const t: Translate = value => translate(language, value)
  useEffect(() => {
    document.documentElement.lang = language
    document.title = `Meshlab — ${translate(language, 'DC CIRCUIT WORKBENCH')}`
    try { localStorage.setItem('meshlab:language', language) } catch { /* Storage is optional. */ }
  }, [language])
  const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const matches = kinds.filter(kind => normalize(`${t(catalog[kind].name)} ${catalog[kind].prefix}`).includes(normalize(query.trim())))
  const editor = useEditor(examples[exampleNames[0]] ?? blank)
  const [viewMode, setViewMode] = useState<'schematic' | 'board'>('schematic')
  const [boardOpened, setBoardOpened] = useState(false)
  const [probe, setProbe] = useState('')
  const [running, setRunning] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [reverse, setReverse] = useState(false)
  const [showGround, setShowGround] = useState(true)
  const [showNodes, setShowNodes] = useState(true)
  const [showVoltage, setShowVoltage] = useState(false)
  const [resultsOpen, setResultsOpen] = useState(true)
  const [message, setMessage] = useState('')
  const [importError, setImportError] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const net = useMemo(() => compile(editor.simulated), [editor.simulated])
  const guide = useMemo(() => matchesGuide(editor.circuit), [editor.circuit])
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
  const flows = useMemo(() => valid ? wireFlows(active.circuit, currents) : {}, [active.circuit, currents, valid])
  const grounds = useMemo(() => valid ? groundFlows(active.circuit, currents) : {}, [active.circuit, currents, valid])
  const inspected = editor.selected.length === 1 ? editor.circuit.components.find(c => c.id === editor.selected[0]) : undefined
  const read = inspected ? valid?.branches[inspected.id] : undefined
  const wire = editor.selected.length === 1 ? editor.circuit.wires.find(w => w.id === editor.selected[0]) : undefined
  const hasCircuit = editor.circuit.components.length > 0
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

  function toggleRun() {
    if (running) setHeld({ net, solved, circuit: editor.circuit })
    else setHeld(null)
    setRunning(!running)
  }
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      const key = event.key.toLowerCase()
      if (event.defaultPrevented) return
      if (event.target instanceof HTMLElement && (event.target.closest('input, textarea, select, [contenteditable], [role="slider"], [role="option"], [role="listbox"], [aria-expanded="true"]') || event.target.isContentEditable || (key === ' ' && event.target.closest('button')))) return
      if ((event.metaKey || event.ctrlKey) && (key === 'z' || key === 'y')) { event.preventDefault(); editor.history(key === 'y' || event.shiftKey) }
      else if ((event.metaKey || event.ctrlKey) && key === 'c' && editor.canCopy && !window.getSelection()?.toString()) { event.preventDefault(); editor.copy() }
      else if ((event.metaKey || event.ctrlKey) && key === 'v' && editor.canPaste) { event.preventDefault(); editor.paste() }
      else if ((event.metaKey || event.ctrlKey) && key === 'd' && editor.canCopy) { event.preventDefault(); editor.duplicate() }
      else if (key === 'r') editor.rotate()
      else if (key === 'delete' || key === 'backspace') { event.preventDefault(); editor.remove() }
      else if (key === ' ') { event.preventDefault(); if (!event.repeat) toggleRun() }
      else if (key === 'escape') { editor.setTool('select'); editor.select([]) }
      else if (key === 'w') editor.setTool('wire')
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  })
  function openCircuit(next: Circuit) {
    editor.replace(next); setRunning(true); setHeld(null); transient.reset(); setProbe('')
  }
  async function handleIo(action: () => void | Promise<void>, success: string) {
    try { await action(); setImportError(false); setMessage(success) }
    catch (error) { setImportError(true); setMessage(error instanceof Error ? error.message : 'The operation failed.') }
  }

  return <TooltipProvider>
    <div className="workbench">
      <header className="topbar">
        <div className="brand"><div className="brand-icon"><CircuitBoard size={19} /></div><div><strong>Meshlab<span>.</span></strong><small>{t('DC CIRCUIT WORKBENCH')}</small></div></div>
        <div className="top-actions">
          <Select items={Object.fromEntries(exampleNames.map(n => [n, t(n)]))} value={null} onValueChange={name => {
            if (name && examples[name]) { openCircuit(examples[name]); setMessage('') }
          }}>
            <SelectTrigger aria-label={t('Circuit examples')}><SelectValue placeholder={t('Load an example')} /></SelectTrigger>
            <SelectContent>{exampleNames.map(name => <SelectItem value={name} key={name}>{t(name)}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => { openCircuit(blank); setMessage('') }}><Plus /> {t('New')}</Button>
          <Button variant="outline" size="sm" onClick={() => file.current?.click()}><Upload /> {t('Import')}</Button>
          <div className="export-group" role="group" aria-label={t('Export')}>
            <Button variant="outline" size="sm" onClick={() => handleIo(() => exportJson(editor.circuit), 'JSON exported.')}><ArrowDownToLine /> JSON</Button>
            <Button variant="outline" size="sm" onClick={() => handleIo(async () => { if (editor.svg.current) await exportPng(editor.svg.current, editor.view) }, 'PNG exported.')}><ArrowDownToLine /> PNG</Button>
          </div>
          <input type="file" accept=".json,application/json" hidden ref={file} onChange={event => {
            const chosen = event.target.files?.[0]; event.target.value = ''
            if (chosen) void handleIo(async () => { openCircuit(await importJson(chosen)) }, 'Circuit imported.')
          }} />
        </div>
        <div className="session-actions">
          <ThemeSwitch value={preference} onChange={setPreference} t={t} />
          <Select items={{ en: 'English', es: 'Español' }} value={language} onValueChange={value => { if (value === 'en' || value === 'es') { setLanguage(value); setQuery('') } }}>
            <SelectTrigger className="locale-trigger" aria-label={t('Language')}><Languages size={15} /><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="en" lang="en">English</SelectItem><SelectItem value="es" lang="es">Español</SelectItem></SelectContent>
          </Select>
          <Button className="run-button" data-running={running} onClick={toggleRun}>{running ? <Pause /> : <Play />}{running ? t('Pause') : t('Run simulation')}</Button>
        </div>
      </header>

      <div className="workspace">
        <aside className="library">
          <div className="panel-header"><span className="eyebrow">{t('01 / LIBRARY')}</span><h2>{t('Components')}</h2><p>{t('Click to add to the canvas.')}</p></div>
          <div className="library-search"><Search size={15} /><Input type="search" aria-label={t('Find components')} placeholder={t('Find components')} value={query} onChange={event => setQuery(event.target.value)} /></div>
          <div className="library-content">
            {!matches.length && <p className="library-empty">{t('No matching components.')}</p>}
            {groups.filter(group => matches.some(kind => catalog[kind].group === group)).map(group => <section key={group}>
              <h3>{t(group)}</h3>
              {matches.filter(kind => catalog[kind].group === group).map(kind => <Button key={kind} variant="ghost" className="library-part" onClick={() => editor.add(kind)}>
                <span className="part-icon"><svg viewBox="-42 -27 84 54" aria-hidden="true"><Symbol kind={kind} /></svg></span>
                <span>{t(catalog[kind].name)}</span><Plus className="add-icon" />
              </Button>)}
            </section>)}
          </div>
        </aside>

        <main className="center">
          <div className="surface schematic-panel">
            <div className="canvas-head">
              <div><span className="eyebrow">{t(viewMode === 'board' ? '02 / BREADBOARD' : '02 / SCHEMATIC')}</span><h1>{t(viewMode === 'board' ? 'Breadboard' : 'Circuit canvas')}</h1></div>
              <div className="canvas-head-actions">
                <div className="segmented board-view-control" role="group" aria-label={t('Circuit view')}>
                  <Button size="sm" variant="ghost" aria-pressed={viewMode === 'schematic'} onClick={() => setViewMode('schematic')}>{t('Schematic')}</Button>
                  <Button size="sm" variant="ghost" aria-pressed={viewMode === 'board'} onClick={() => { setBoardOpened(true); setViewMode('board') }}>{t('Breadboard')}</Button>
                </div>
              <Badge variant="outline" className={fault ? 'state-fault' : running && hasCircuit ? 'state-live' : 'state-idle'}><i />{fault ? t('CHECK CIRCUIT') : !hasCircuit ? t('EMPTY') : running ? t(transient.enabled ? 'TRANSIENT LIVE' : 'LIVE DC') : t('PAUSED')}</Badge>
              </div>
            </div>
            <div hidden={viewMode === 'board'}>
            <div className="toolbar" role="group" aria-label={t('SCHEMATIC TOOLS')}>
              <div className="tool-group">
                <Tool label={t('Select and move')} active={editor.mode === 'select'} onClick={() => editor.setTool('select')}><MousePointer2 /></Tool>
                <Tool label={t('Wire (W)')} active={editor.mode === 'wire'} onClick={() => editor.setTool('wire')}><Waypoints /></Tool>
                <Tool label={t('Pan')} active={editor.mode === 'pan'} onClick={() => editor.setTool('pan')}><Hand /></Tool>
              </div>
              <div className="tool-group">
                <Tool label={t('Undo')} disabled={!editor.canUndo} onClick={() => editor.history(false)}><Undo2 /></Tool>
                <Tool label={t('Redo')} disabled={!editor.canRedo} onClick={() => editor.history(true)}><Redo2 /></Tool>
                <Tool label={t('Rotate (R)')} disabled={!editor.selected.length} onClick={editor.rotate}><RotateCw /></Tool>
                <Tool label={t('Delete (Del)')} disabled={!editor.selected.length} onClick={editor.remove}><Trash2 /></Tool>
              </div>
              <div className="tool-group">
                <Tool label={t('Copy selection')} disabled={!editor.canCopy} onClick={editor.copy}><Copy /></Tool>
                <Tool label={t('Paste')} disabled={!editor.canPaste} onClick={() => editor.paste()}><ClipboardPaste /></Tool>
                <Tool label={t('Duplicate selection')} disabled={!editor.canCopy} onClick={editor.duplicate}><CopyPlus /></Tool>
              </div>
              <div className="tool-group zoom-tools">
                <Tool label={t('Zoom out')} onClick={() => editor.zoom(1 / 1.2)}><Minus /></Tool>
                <span>{Math.round(editor.view.scale * 100)}%</span>
                <Tool label={t('Zoom in')} onClick={() => editor.zoom(1.2)}><Plus /></Tool>
                <Tool label={t('Fit to circuit')} onClick={editor.fit}><Crosshair /></Tool>
              </div>
            </div>
            <div className="canvas-wrap">
              <Canvas t={t} palette={palette} svg={editor.svg} circuit={editor.drawn} view={editor.view} selected={editor.selected} flagged={flagged}
                pins={active.net.nodeByPin} nodes={valid?.nodes ?? {}} readings={valid?.branches ?? {}} flows={flows} grounds={grounds}
                mode={editor.mode} cursor={editor.cursor} wireFrom={editor.wireFrom} running={running} speed={speed} reverse={reverse}
                showGround={showGround} showNodes={showNodes} showVoltage={showVoltage} onBackground={editor.backgroundDown}
                onComponent={editor.componentDown} onEndpoint={editor.endpointDown} onWire={editor.wireDown} onRoute={editor.routeDown}
                onMove={editor.move} onUp={editor.up} box={editor.box} />
              {!hasCircuit && <div className="canvas-empty"><span className="canvas-empty-icon"><CircuitBoard /></span><strong>{t('Start a new circuit')}</strong><span>{t('Add components or load an example.')}</span></div>}
            </div>
            <div className="canvas-foot"><span><i /> {editor.wireFrom ? t('Select a terminal or wire to connect') : editor.mode === 'wire' ? t('Start at a terminal or wire') : wire ? t('Drag a wire handle to reroute') : t('Click a terminal to start wiring')}</span>
              <span>{editor.circuit.components.length} {t('parts')} · {editor.circuit.wires.length} {t('wires')}</span></div>
            </div>
            {boardOpened && <div hidden={viewMode !== 'board'}>
              <Suspense fallback={<div className="board-unsupported" role="status">{t('Loading breadboard…')}</div>}>
                <Board t={t} theme={theme} guide={guide} circuit={editor.circuit} pins={active.net.nodeByPin} readings={valid?.nodes} currents={currents}
                  selected={editor.selected} onSelect={editor.select} onToggle={part => editor.update(part, { closed: !part.closed })}
                  onLoad={name => { openCircuit(examples[name]); setMessage('') }} />
              </Suspense>
            </div>}
          </div>
          {(fault || valid?.warnings.length || alerts.length || message || editor.storageError) ? <div role={fault || importError ? 'alert' : 'status'} className={fault || importError || valid?.warnings.length || alerts.length ? 'notice warning' : 'notice'}>
            {fault && <div className="diagnostic-row"><span>{diagnostic(language, fault)}</span>{faultIds.length > 0 && <Button size="xs" variant="outline" onClick={() => editor.reveal(faultIds)}>{t('Locate')}</Button>}</div>}
            {alerts.map(alert => {
              const unit = alert.quantity === 'current' ? 'A' : 'W'
              const label = active.circuit.components.find(c => c.id === alert.id)?.label ?? alert.id
              return <div key={`${alert.id}:${alert.quantity}`} className="diagnostic-row">
                <span><strong>{label}</strong> · {t(alert.quantity === 'current' ? 'Overcurrent' : 'Power limit exceeded')}: {metric(alert.actual, unit)} ({t('Limit')}: {metric(alert.limit, unit)})</span>
                <Button size="xs" variant="outline" onClick={() => editor.reveal([alert.id])}>{t('Locate')}</Button>
              </div>
            })}{warnings.map(({ message, ids }) => <div key={message} className="diagnostic-row">
              <span>{diagnostic(language, message)}</span>
              {ids.length > 0 && <Button size="xs" variant="outline" onClick={() => editor.reveal(ids)}>{t('Locate')}</Button>}
            </div>)}{message && <div>{importError ? diagnostic(language, message, true) : t(message)}</div>}
            {editor.storageError && <div>{t('Autosave is unavailable in this browser.')}</div>}
          </div> : null}
          {transient.enabled && <Scope t={t} palette={palette} samples={transient.samples} time={transient.time} parts={probeParts}
            probe={activeProbe} onProbe={setProbe} reset={transient.reset} />}
          <Collapsible className="results surface" open={resultsOpen} onOpenChange={setResultsOpen}>
            <CollapsibleTrigger render={<button className="results-trigger" />}><Activity size={17} /><span>{t('Simulation results')}</span><small>{valid ? `${t('Residual')} ${metric(valid.balance, 'W')}` : t(pendingSample ? 'Awaiting a transient sample' : 'No solution')}</small><ChevronDown className={resultsOpen ? 'open' : ''} size={16} /></CollapsibleTrigger>
            <CollapsibleContent>
              <div className="result-summary"><Reading label={t('Nodes')} value={String(Object.keys(valid?.nodes ?? {}).length)} /><Reading label={t('Power delivered')} value={valid ? metric(delivered, 'W') : '—'} /><Reading label={t('Power absorbed')} value={valid ? metric(delivered + valid.balance, 'W') : '—'} /></div>
              {!valid || !hasCircuit ? <p className="result-empty">{t('Reading unavailable')}</p> : <div className="tables">
                <table><caption>{t('Component readings')}</caption><thead><tr><th>{t('Branch')}</th><th>ΔV</th><th>{t('Current')}</th><th>{t('Power')}</th></tr></thead>
                  <tbody>{Object.entries(valid?.branches ?? {}).map(([id, r]) => <tr key={id}><th scope="row">{active.circuit.components.find(c => c.id === id)?.label ?? id}</th><td>{metric(r.voltage, 'V')}</td><td>{metric(r.current, 'A')}</td><td>{metric(r.power, 'W')}</td></tr>)}</tbody></table>
                <table><caption>{t('Node potentials')}</caption><thead><tr><th>{t('Node')}</th><th>{t('Voltage')}</th></tr></thead><tbody>{Object.entries(valid?.nodes ?? {}).map(([node, volts]) => <tr key={node}><th scope="row">{node === '0' ? 'GND' : node}</th><td>{metric(volts, 'V')}</td></tr>)}</tbody></table>
              </div>}
            </CollapsibleContent>
          </Collapsible>
        </main>

        <aside className="inspector">
          <div className="panel-header"><span className="eyebrow">{t('03 / INSPECTOR')}</span><h2>{t('Properties')}</h2><p>{t('Parameters and measurements.')}</p></div>
          <div className="inspector-body">
            {inspected ? <Properties t={t} key={inspected.id} part={inspected} update={(changes, preview) => editor.update(inspected, changes, preview)} /> :
              <div className="empty-inspector"><span className="empty-inspector-icon"><MousePointer2 size={16} /></span><span>{wire ? t('Wire selected') : editor.selected.length ? `${editor.selected.length} ${t('items selected')}` : t('Nothing selected')}</span>
                <small>{wire ? `${t('Current')}: ${metric(flows[wire.id], 'A')}` : t('Select a component to edit its parameters.')}</small></div>}
            {inspected && <div className="measurements"><Reading label={t('Voltage drop')} value={metric(read?.voltage, 'V')} /><Reading label={t('Current')} value={metric(inspected.kind === 'ground' ? grounds[inspected.id] : read?.current, 'A')} /><Reading label={t('Power')} value={metric(read?.power, 'W')} /></div>}
            <div className="settings"><h3>{t('Visualization')}</h3>
              <Setting label={t('Node voltages')} checked={showNodes} onChange={setShowNodes} />
              <Setting label={t('Voltage colors')} checked={showVoltage} onChange={setShowVoltage} />
              <Setting label={t('Ground returns')} checked={showGround} onChange={setShowGround} />
              <Setting label={t('Electron flow')} checked={reverse} onChange={setReverse} />
              <div className="speed"><div><label htmlFor="flow-speed">{t('Animation speed')}</label><span>{speed.toLocaleString(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×</span></div>
                <Slider id="flow-speed" value={[speed]} min={.2} max={3} step={.1} onValueChange={v => setSpeed(one(v))} /></div>
            </div>
            <div className="key-guide"><h3>{t('Shortcuts')}</h3><span><kbd>R</kbd> {t('Rotate')}</span><span><kbd>{language === 'es' ? 'Supr' : 'Del'}</kbd> {t('Delete')}</span><span><kbd>{language === 'es' ? 'Espacio' : 'Space'}</kbd> {t('Play / pause')}</span><span><kbd>Esc</kbd> {t('Cancel')}</span></div>
          </div>
        </aside>
      </div>
      <footer className="app-footer"><span><Activity size={13} /> {t('Modified nodal analysis')}</span><span>{editor.storageError ? t('Autosave unavailable') : t('Local autosave enabled')} {!editor.storageError && <CircleCheck size={13} />}</span></footer>
    </div>
  </TooltipProvider>
}

function Properties({ part, update, t }: { t: Translate; part: Component; update: (changes: Partial<Component>, preview?: boolean) => void }) {
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
