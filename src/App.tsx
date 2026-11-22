import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Activity, ArrowDownToLine, ArrowRight, ChevronDown, CircuitBoard, Crosshair, Hand, MousePointer2, Pause, Play, Plus, Minus, Redo2, RotateCw, Trash2, Undo2, Upload, Waypoints } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { compile, groundFlows, wireFlows, type Circuit, type Component, type Kind } from './circuit/model'
import { examples } from './circuit/examples'
import { solve } from './engine/solver'
import Canvas from './editor/Canvas'
import { useEditor } from './editor/useEditor'
import { catalog, metric, parseMetric } from './editor/catalog'
import { Symbol } from './editor/Symbol'
import { exportJson, exportPng, importJson } from './editor/io'

const exampleNames = Object.keys(examples)
const kinds = Object.keys(catalog) as Kind[]
const groups = [...new Set(kinds.map(kind => catalog[kind].group))]
const blank: Circuit = { version: 1, components: [], wires: [], junctions: [] }
const one = (n: number | readonly number[]) => typeof n === 'number' ? n : n[0]

function Tool({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} aria-pressed={active} disabled={disabled} className={active ? 'tool-active' : 'tool'} onClick={onClick} />}>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
}
function Setting({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="setting"><span>{label}</span><Switch size="sm" checked={checked} onCheckedChange={onChange} /></label>
}
function Reading({ label, value }: { label: string; value: string }) {
  return <div className="reading"><span>{label}</span><strong>{value}</strong></div>
}

export default function App() {
  const editor = useEditor(examples[exampleNames[0]] ?? blank)
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
  const solved = useMemo(() => net.branches.length > 200
    ? { ok: false as const, error: 'This DC workbench supports up to 200 electrical branches per simulation.' }
    : solve(net.branches), [net])
  // Pausing freezes the displayed measurements as well as the animation.
  const [held, setHeld] = useState<{ net: typeof net; solved: typeof solved; circuit: Circuit } | null>(null)
  const active = running || !held ? { net, solved, circuit: editor.circuit } : held
  const valid = active.solved.ok ? active.solved : null
  const currents = useMemo(() => Object.fromEntries(Object.entries(valid?.branches ?? {}).map(([id, branch]) => [id, branch.current])), [valid])
  const flows = useMemo(() => valid ? wireFlows(active.circuit, currents) : {}, [active.circuit, currents, valid])
  const grounds = useMemo(() => valid ? groundFlows(active.circuit, currents) : {}, [active.circuit, currents, valid])
  const inspected = editor.selected.length === 1 ? editor.circuit.components.find(c => c.id === editor.selected[0]) : undefined
  const read = inspected ? valid?.branches[inspected.id] : undefined
  const wire = editor.selected.length === 1 ? editor.circuit.wires.find(w => w.id === editor.selected[0]) : undefined
  const hasCircuit = editor.circuit.components.length > 0
  const fault = !active.solved.ok && hasCircuit ? active.solved.error : ''
  const delivered = Object.values(valid?.branches ?? {}).reduce((total, b) => total + Math.max(0, -b.power), 0)

  function toggleRun() {
    if (running) setHeld({ net, solved, circuit: editor.circuit })
    else setHeld(null)
    setRunning(!running)
  }
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement && (event.target.closest('input, textarea, select, button, [contenteditable], [role="slider"]') || event.target.isContentEditable)) return
      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && (key === 'z' || key === 'y')) { event.preventDefault(); editor.history(key === 'y' || event.shiftKey) }
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
    editor.replace(next); setRunning(true); setHeld(null)
  }
  async function handleIo(action: () => void | Promise<void>, success: string) {
    try { await action(); setImportError(false); setMessage(success) }
    catch (error) { setImportError(true); setMessage(error instanceof Error ? error.message : 'The operation failed.') }
  }

  return <TooltipProvider>
    <div className="workbench">
      <header className="topbar">
        <div className="brand"><div className="brand-icon"><CircuitBoard size={21} /></div><div><strong>Meshlab<span>.</span></strong><small>DC CIRCUIT WORKBENCH</small></div></div>
        <div className="top-actions">
          <Select items={Object.fromEntries(exampleNames.map(n => [n, n]))} value={null} onValueChange={name => {
            if (name && examples[name]) { openCircuit(examples[name]); setMessage('') }
          }}>
            <SelectTrigger aria-label="Circuit examples"><SelectValue placeholder="Load an example" /></SelectTrigger>
            <SelectContent>{exampleNames.map(name => <SelectItem value={name} key={name}>{name}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => { openCircuit(blank); setMessage('') }}><Plus /> New</Button>
          <Button variant="outline" size="sm" onClick={() => file.current?.click()}><Upload /> Import</Button>
          <Button variant="outline" size="sm" onClick={() => handleIo(() => exportJson(editor.circuit), 'JSON exported.')}><ArrowDownToLine /> JSON</Button>
          <Button variant="outline" size="sm" onClick={() => handleIo(async () => { if (editor.svg.current) await exportPng(editor.svg.current, editor.view) }, 'PNG exported.')}><ArrowDownToLine /> PNG</Button>
          <input type="file" accept=".json,application/json" hidden ref={file} onChange={event => {
            const chosen = event.target.files?.[0]; event.target.value = ''
            if (chosen) void handleIo(async () => { openCircuit(await importJson(chosen)) }, 'Circuit imported.')
          }} />
        </div>
        <Button className="run-button" onClick={toggleRun}>{running ? <Pause /> : <Play />}{running ? 'Pause' : 'Run simulation'}</Button>
      </header>

      <div className="workspace">
        <aside className="library">
          <div className="panel-header"><span className="eyebrow">01 / LIBRARY</span><h2>Components</h2><p>Click to add to the canvas.</p></div>
          <div className="library-content">
            {groups.map(group => <section key={group}>
              <h3>{group}</h3>
              {kinds.filter(kind => catalog[kind].group === group).map(kind => <Button key={kind} variant="ghost" className="library-part" onClick={() => editor.add(kind)}>
                <span className="part-icon"><svg viewBox="-42 -27 84 54" aria-hidden="true"><Symbol kind={kind} /></svg></span>
                <span>{catalog[kind].name}</span><Plus className="add-icon" />
              </Button>)}
            </section>)}
          </div>
        </aside>

        <main className="center">
          <div className="surface">
            <div className="canvas-head">
              <div><span className="eyebrow">02 / SCHEMATIC</span><h1>Circuit canvas</h1></div>
              <Badge variant="outline" className={fault ? 'state-fault' : running && hasCircuit ? 'state-live' : 'state-idle'}><i />{fault ? 'CHECK CIRCUIT' : !hasCircuit ? 'EMPTY' : running ? 'LIVE DC' : 'PAUSED'}</Badge>
            </div>
            <div className="toolbar">
              <div className="tool-group">
                <Tool label="Select and move" active={editor.mode === 'select'} onClick={() => editor.setTool('select')}><MousePointer2 /></Tool>
                <Tool label="Wire (W)" active={editor.mode === 'wire'} onClick={() => editor.setTool('wire')}><Waypoints /></Tool>
                <Tool label="Pan" active={editor.mode === 'pan'} onClick={() => editor.setTool('pan')}><Hand /></Tool>
              </div>
              <div className="tool-group">
                <Tool label="Undo" disabled={!editor.canUndo} onClick={() => editor.history(false)}><Undo2 /></Tool>
                <Tool label="Redo" disabled={!editor.canRedo} onClick={() => editor.history(true)}><Redo2 /></Tool>
                <Tool label="Rotate (R)" disabled={!editor.selected.length} onClick={editor.rotate}><RotateCw /></Tool>
                <Tool label="Delete (Del)" disabled={!editor.selected.length} onClick={editor.remove}><Trash2 /></Tool>
              </div>
              <div className="tool-group zoom-tools">
                <Tool label="Zoom out" onClick={() => editor.zoom(1 / 1.2)}><Minus /></Tool>
                <span>{Math.round(editor.view.scale * 100)}%</span>
                <Tool label="Zoom in" onClick={() => editor.zoom(1.2)}><Plus /></Tool>
                <Tool label="Fit to circuit" onClick={editor.fit}><Crosshair /></Tool>
              </div>
            </div>
            <div className="canvas-wrap">
              <Canvas svg={editor.svg} circuit={editor.drawn} view={editor.view} selected={editor.selected}
                pins={active.net.nodeByPin} nodes={valid?.nodes ?? {}} readings={valid?.branches ?? {}} flows={flows} grounds={grounds}
                mode={editor.mode} cursor={editor.cursor} wireFrom={editor.wireFrom} running={running} speed={speed} reverse={reverse}
                showGround={showGround} showNodes={showNodes} showVoltage={showVoltage} onBackground={editor.backgroundDown}
                onComponent={editor.componentDown} onEndpoint={editor.endpointDown} onWire={editor.wireDown}
                onMove={editor.move} onUp={editor.up} box={editor.box} />
              {!hasCircuit && <div className="canvas-empty"><CircuitBoard /><strong>Start a new circuit</strong><span>Add components or load an example.</span></div>}
            </div>
            <div className="canvas-foot"><span><i /> {editor.wireFrom ? 'Select a terminal or wire to connect' : editor.mode === 'wire' ? 'Start at a terminal or wire' : '20 px snap grid'}</span>
              <span>{editor.circuit.components.length} parts · {editor.circuit.wires.length} wires</span></div>
          </div>
          {(fault || valid?.warnings.length || message || editor.storageError) ? <div role={fault || importError ? 'alert' : 'status'} className={fault || importError || valid?.warnings.length ? 'notice warning' : 'notice'}>
            {fault && <div>{fault}</div>}{valid?.warnings.map(warning => <div key={warning}>{warning}</div>)}{message && <div>{message}</div>}
            {editor.storageError && <div>Autosave is unavailable in this browser.</div>}
          </div> : null}
          <Collapsible className="results surface" open={resultsOpen} onOpenChange={setResultsOpen}>
            <CollapsibleTrigger render={<button className="results-trigger" />}><Activity size={17} /><span>Simulation results</span><small>{valid ? `Residual ${metric(valid.balance, 'W')}` : 'No solution'}</small><ChevronDown className={resultsOpen ? 'open' : ''} size={16} /></CollapsibleTrigger>
            <CollapsibleContent>
              <div className="result-summary"><Reading label="Nodes" value={String(Object.keys(valid?.nodes ?? {}).length)} /><Reading label="Power delivered" value={valid ? metric(delivered, 'W') : '—'} /><Reading label="Power absorbed" value={valid ? metric(delivered + valid.balance, 'W') : '—'} /></div>
              <div className="tables">
                <table><caption>Component readings</caption><thead><tr><th>Branch</th><th>ΔV</th><th>Current</th><th>Power</th></tr></thead>
                  <tbody>{Object.entries(valid?.branches ?? {}).map(([id, r]) => <tr key={id}><th>{active.circuit.components.find(c => c.id === id)?.label ?? id}</th><td>{metric(r.voltage, 'V')}</td><td>{metric(r.current, 'A')}</td><td>{metric(r.power, 'W')}</td></tr>)}</tbody></table>
                <table><caption>Node potentials</caption><thead><tr><th>Node</th><th>Voltage</th></tr></thead><tbody>{Object.entries(valid?.nodes ?? {}).map(([node, volts]) => <tr key={node}><th>{node === '0' ? 'GND' : node}</th><td>{metric(volts, 'V')}</td></tr>)}</tbody></table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </main>

        <aside className="inspector">
          <div className="panel-header"><span className="eyebrow">03 / INSPECTOR</span><h2>Properties</h2><p>Parameters and measurements.</p></div>
          <div className="inspector-body">
            {inspected ? <Properties key={inspected.id} part={inspected} update={(changes, preview) => editor.update(inspected, changes, preview)} /> :
              <div className="empty-inspector"><MousePointer2 size={18} /><span>{wire ? 'Wire selected' : editor.selected.length ? `${editor.selected.length} items selected` : 'Nothing selected'}</span>
                <small>{wire ? `Current: ${metric(flows[wire.id], 'A')}` : 'Select a component to edit its parameters.'}</small></div>}
            {inspected && <div className="measurements"><Reading label="Voltage drop" value={metric(read?.voltage, 'V')} /><Reading label="Current" value={metric(inspected.kind === 'ground' ? grounds[inspected.id] : read?.current, 'A')} /><Reading label="Power" value={metric(read?.power, 'W')} /></div>}
            <div className="settings"><h3>Visualization</h3>
              <Setting label="Node voltages" checked={showNodes} onChange={setShowNodes} />
              <Setting label="Voltage colors" checked={showVoltage} onChange={setShowVoltage} />
              <Setting label="Ground returns" checked={showGround} onChange={setShowGround} />
              <Setting label="Electron flow" checked={reverse} onChange={setReverse} />
              <div className="speed"><div><label htmlFor="flow-speed">Animation speed</label><span>{speed.toFixed(1)}×</span></div>
                <Slider id="flow-speed" value={[speed]} min={.2} max={3} step={.1} onValueChange={v => setSpeed(one(v))} /></div>
            </div>
            <div className="key-guide"><h3>Shortcuts</h3><span><kbd>R</kbd> Rotate</span><span><kbd>Del</kbd> Delete</span><span><kbd>Space</kbd> Play / pause</span><span><kbd>Esc</kbd> Cancel</span></div>
          </div>
        </aside>
      </div>
      <footer className="app-footer"><span><Activity size={13} /> Modified nodal analysis</span><span>{editor.storageError ? 'Autosave unavailable' : 'Local autosave enabled'} <ArrowRight size={12} /></span></footer>
    </div>
  </TooltipProvider>
}

function Properties({ part, update }: { part: Component; update: (changes: Partial<Component>, preview?: boolean) => void }) {
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
    <div className="part-heading"><span className="part-icon"><svg viewBox="-42 -27 84 54" aria-hidden="true"><Symbol kind={part.kind} closed={part.closed} /></svg></span><strong>{meta.name}</strong></div>
    <label className="field">Label<Input value={label} maxLength={40} onChange={e => setLabel(e.target.value)} onBlur={() => { if (label.trim()) update({ label: label.trim() }); else setLabel(part.label) }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} /></label>
    {meta.unit && <>
      <label className="field">Value<Input value={draft} aria-invalid={invalid} onChange={e => { setDraft(e.target.value); setInvalid(false) }} onBlur={setValue} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} /></label>
      {invalid && <small className="form-error">Enter a valid value in {meta.unit}{signed ? '' : ' greater than zero'}.</small>}
      <Slider aria-label="Component value" min={signed ? -extent : 0} max={extent} step={extent / 1000} value={[liveValue ?? part.value]}
        onValueChange={v => onValue(one(v), true)} onValueCommitted={v => onValue(one(v), false)} />
    </>}
    {part.kind === 'potentiometer' && <div className="speed"><div><span>Wiper</span><span>{Math.round((livePosition ?? part.position ?? .5) * 100)}%</span></div>
      <Slider aria-label="Wiper position" min={0} max={1} step={.01} value={[livePosition ?? part.position ?? .5]} onValueChange={v => onPosition(one(v), true)} onValueCommitted={v => onPosition(one(v), false)} /></div>}
    {part.kind === 'switch' && <Setting label="Switch closed" checked={!!part.closed} onChange={closed => update({ closed })} />}
  </div>
}
