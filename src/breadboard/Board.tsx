import { useState, type KeyboardEvent } from 'react'
import { ArrowRight, Check, ChevronLeft, CircuitBoard, Crosshair, ListChecks, RotateCcw, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Circuit, Component } from '../circuit/model'
import { metric } from '../editor/catalog'
import type { Translate } from '../locale'
import type { Theme } from '../theme'
import { COLUMNS, ROWS, boardGuides, holeGroup, populated, probeNode, validateStep, verifyBoard,
  type Assembly, type BoardStep, type Guide, type PlacementIssue } from './model'
import { hole, layout } from './geometry'
import { BoardDefs, BoardSurface, Mounted, boardPalettes } from './art'
import './board.css'
const feedback: Record<PlacementIssue, string> = {
  incomplete: 'Select all sockets for this step.',
  occupied: 'A socket is already occupied. Choose a free socket in that strip.',
  'same-strip': 'Both leads are in the same conductive strip. Move one lead.',
  'wrong-strip': 'The leads are on the wrong strips or reversed. Follow the numbered targets.',
}

type Props = {
  circuit: Circuit
  theme: Theme
  guide?: Guide
  t: Translate
  pins: Record<string, string>
  readings: Record<string, number> | undefined
  currents: Record<string, number> | undefined
  selected: string[]
  onSelect: (ids: string[]) => void
  onToggle: (part: Component) => void
  onLoad: (name: string) => void
}

export default function Board(props: Props) {
  return props.guide ? <GuidedBoard {...props} guide={props.guide} key={props.guide.example} /> :
    <section className="board-unsupported">
      <div className="board-empty-icon"><CircuitBoard /></div>
      <h2>{props.t('Start with a supported circuit')}</h2>
      <p>{props.t('These guides follow a fixed circuit topology. Load a guided example to see its physical layout.')}</p>
      <div>{boardGuides.map(g => <Button key={g.example} variant="outline" onClick={() => props.onLoad(g.example)}>{props.t(g.example)} <ArrowRight /></Button>)}</div>
    </section>
}

function GuidedBoard({ guide, circuit, theme, t, pins, readings, currents, selected, onSelect, onToggle, onLoad }: Props & { guide: Guide }) {
  const [mode, setMode] = useState<'preview' | 'build'>('preview')
  const c = boardPalettes[theme]
  const [assembly, setAssembly] = useState<Assembly>({})
  const [choice, setChoice] = useState<string[]>([])
  const [issue, setIssue] = useState<PlacementIssue>()
  const [probe, setProbe] = useState('')
  const [focusHole, setFocusHole] = useState('C4')
  const [requested, setRequested] = useState<number>()
  const [cursor, setCursor] = useState<number | undefined>()
  const firstIncomplete = guide.steps.findIndex(step => !assembly[step.id])
  const index = cursor ?? firstIncomplete
  const step = mode === 'build' ? guide.steps[index] : undefined
  const visible = mode === 'preview' ? populated(guide) : assembly
  const verified = verifyBoard(guide, visible, pins)
  const detectedNode = probe ? probeNode(guide, visible, pins, probe) : undefined
  const value = detectedNode !== undefined ? readings?.[detectedNode] : undefined
  const selectedStrip = probe ? holeGroup(probe) : undefined
  const occupied = new Map(Object.entries(visible).flatMap(([id, sockets]) => sockets.map(socket => [socket, id] as const)))
  const parts = new Map(circuit.components.map(part => [part.id, part]))
  const switchPart = circuit.components.find(part => part.kind === 'switch')
  const done = guide.steps.filter(step => !!assembly[step.id]).length
  const targetIndex = step ? Math.min(choice.length, step.sockets.length - 1) : -1
  const target = step?.sockets[targetIndex]
  const canTest = !!step && choice.length === step.sockets.length
  const stepTitle = (step: BoardStep) => {
    const component = step.part && parts.get(step.part)
    return component ? `${component.label} · ${t(step.label)}` : t(step.label)
  }
  function inspect(id: string) {
    const owner = occupied.get(id)
    const part = guide.steps.find(step => step.id === owner)?.part
    if (part) onSelect([part])
    setProbe(id)
  }
  function selectHole(id: string) {
    setFocusHole(id)
    if (!step) { inspect(id); return }
    if (occupied.has(id) && occupied.get(id) !== step.id) {
      setIssue('occupied')
      return
    }
    setIssue(undefined)
    if (choice.includes(id)) setChoice(choice.filter(chosen => chosen !== id))
    else if (choice.length < step.sockets.length) setChoice([...choice, id])
    else setChoice([id])
  }
  function focusSocket(id: string) {
    setFocusHole(id)
    document.getElementById(`board-socket-${id}`)?.focus()
  }
  function keySocket(event: KeyboardEvent<SVGGElement>, id: string) {
    const p = hole(id)
    const delta = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key]
    if (delta) {
      event.preventDefault()
      const row = Math.max(0, Math.min(ROWS.length - 1, p.row + delta[0]))
      const column = Math.max(1, Math.min(COLUMNS, p.col + delta[1]))
      focusSocket(`${ROWS[row]}${column}`)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectHole(id)
    }
  }
  function startStep(i: number) {
    const next = guide.steps[i]
    if (!next || (i > firstIncomplete && firstIncomplete !== -1 && !assembly[next.id])) return
    setCursor(i); setProbe(''); setIssue(undefined); setChoice([])
    setRequested(undefined)
    if (next.part) onSelect([next.part])
  }
  function verify() {
    if (!step) return
    const error = validateStep(step, choice, assembly)
    if (error) { setIssue(error); return }
    setAssembly({ ...assembly, [step.id]: choice })
    setChoice([]); setIssue(undefined); setCursor(undefined); setRequested(undefined)
    const next = guide.steps.find(item => item.id !== step.id && !assembly[item.id])
    if (next?.part) onSelect([next.part])
  }
  function switchMode(next: 'preview' | 'build') {
    setMode(next); setProbe(''); setChoice([]); setIssue(undefined); setCursor(undefined); setRequested(undefined)
    if (next === 'build' && firstIncomplete >= 0) {
      const part = guide.steps[firstIncomplete].part
      if (part) onSelect([part])
    }
  }
  function reset() {
    setAssembly({}); setChoice([]); setIssue(undefined); setProbe(''); setMode('build'); setCursor(undefined); setRequested(undefined)
    if (guide.steps[0].part) onSelect([guide.steps[0].part])
  }

  return <div className="breadboard">
    <div className="board-top">
      <div className="board-kicker"><span><CircuitBoard size={16} /></span><div><strong>{t(guide.example)}</strong><small>{t('20 columns · 4 isolated power rails')}</small></div></div>
      <div className="segmented board-modes" role="group" aria-label={t('Breadboard mode')}>
        <Button size="sm" variant={mode === 'preview' ? 'secondary' : 'ghost'} aria-pressed={mode === 'preview'} onClick={() => switchMode('preview')}><Crosshair />{t('Assembled')}</Button>
        <Button size="sm" variant={mode === 'build' ? 'secondary' : 'ghost'} aria-pressed={mode === 'build'} onClick={() => switchMode('build')}><ListChecks />{t('Guided build')}</Button>
      </div>
    </div>
    <div className="board-stage">
      <svg viewBox="0 0 760 435" role="group" aria-label={t('Interactive breadboard')} className="board-svg">
        <BoardDefs c={c} />
        <BoardSurface c={c} />
        <g pointerEvents="none">
          {selectedStrip && layout.filter(p => holeGroup(p.id) === selectedStrip).map(p => p.id === probe
            ? <g key={p.id}><circle cx={p.x} cy={p.y} r="11" fill={c.strip} fillOpacity=".18" className="board-probe-pulse" /><circle cx={p.x} cy={p.y} r="6.5" fill={c.strip} stroke="#fff" strokeWidth="2" /></g>
            : <rect key={p.id} x={p.x - 5.5} y={p.y - 5.5} width="11" height="11" rx="3" fill={c.strip} fillOpacity=".5" stroke={c.stripEdge} strokeWidth="1.2" />)}
        </g>
        {guide.steps.map(step => {
          const sockets = visible[step.id]
          const part = step.part ? parts.get(step.part) : undefined
          return sockets ? <Mounted key={step.id} step={step} sockets={sockets} part={part} label={t(step.label)}
            lit={!!part && (currents?.[part.id] ?? 0) > .00005}
            selected={!!step.part && selected.includes(step.part)} choose={() => part && onSelect([part.id])} c={c} /> : null
        })}
        {choice.map((id, i) => {
          const p = hole(id)
          return <g key={id} pointerEvents="none"><circle cx={p.x} cy={p.y} r="8.5" fill={c.target} stroke="#fff" strokeWidth="1.5" /><text className="board-index" x={p.x} y={p.y + 3.5} textAnchor="middle" fill="white">{i + 1}</text></g>
        })}
        {step?.sockets.map((id, i) => {
          const p = hole(id)
          return <g key={id} pointerEvents="none">
            <circle cx={p.x} cy={p.y} r={i === targetIndex ? 12 : 8.5} stroke={c.target} strokeOpacity={i === targetIndex ? 1 : .55} strokeWidth="2.4" fill={c.target} fillOpacity=".08" strokeDasharray="3.5 2.5" className={i === targetIndex ? 'board-target' : undefined} />
            {requested === i && <circle cx={p.x} cy={p.y} r="16" stroke={c.target} strokeWidth="1.5" fill="none" />}
          </g>
        })}
        {layout.map(p => <g key={p.id} id={`board-socket-${p.id}`} role="button" tabIndex={p.id === focusHole ? 0 : -1}
          aria-label={`${t('Socket')} ${p.id}`} className="board-hole" onClick={() => selectHole(p.id)} onFocus={() => setFocusHole(p.id)}
          onKeyDown={event => keySocket(event, p.id)}>
          <circle cx={p.x} cy={p.y} r="9" fill="transparent" />
        </g>)}
      </svg>
    </div>
    <div className="board-meta">
      <div className="board-probe"><Crosshair size={17} /><div><small>{t('Voltage to ground')}</small>
        <strong role="status">{probe ? `${probe} · ${value !== undefined ? metric(value, 'V') : t(!verified ? 'Verify the assembly first' : detectedNode === undefined ? 'Not connected' : 'No voltage reading')}` : t('Select a socket')}</strong></div></div>
      <p>{probe && selectedStrip ? (probe.length > 2 && /^[TB][+-]/.test(probe) ? t('Continuous power rail') : t('Connected strip of five sockets'))
        : t('The center gap and the four rails are electrically separate.')}</p>
      {switchPart && (mode === 'preview' || verified) && <Button size="sm" variant="outline" onClick={() => { onSelect([switchPart.id]); onToggle(switchPart) }}>
        <Zap />{t(switchPart.closed ? 'Open the switch' : 'Close the switch')}
      </Button>}
    </div>
    <div className="board-guide">
      {mode === 'preview' ? <div className="guide-callout">
        <div><h2>{t('Build it one connection at a time')}</h2><p>{t('This is the reference layout. Pick any socket to measure it, or start the guided assembly.')}</p></div>
        <Button onClick={() => switchMode('build')}>{t(done ? 'Continue assembly' : 'Start assembly')} <ArrowRight /></Button>
      </div> : <>
        <div className="guide-progress">
          <span>{t('Assembly progress')} <strong>{done}/{guide.steps.length}</strong></span>
          <progress value={done} max={guide.steps.length} aria-label={t('Assembly progress')} />
          <Button size="sm" variant="ghost" onClick={reset}><RotateCcw />{t('Reset assembly')}</Button>
        </div>
        {step ? <div className="guide-callout">
          <div>
            <small className="guide-step-number">{t('Step')} {index + 1} / {guide.steps.length}</small>
            <h2>{stepTitle(step)}</h2>
            <p>{t('Select the sockets in the indicated order, then check the placement.')}</p>
            <div className="guide-targets">{step.sockets.map((id, i) => <Button key={id} size="xs" variant="outline" onClick={() => { setRequested(i); focusSocket(id) }}>
              {i + 1}. {id}{choice[i] && choice[i] !== id ? ` → ${choice[i]}` : ''}</Button>)}</div>
            {issue && <p role="alert" className="guide-error">{t(feedback[issue])}</p>}
            {target && <span className="sr-only">{t('Next target')}: {target}</span>}
          </div>
          <div className="guide-actions">
            {cursor !== undefined && <Button size="sm" variant="ghost" onClick={() => { setCursor(undefined); setChoice([]); setIssue(undefined) }}><ChevronLeft />{t('Back to next step')}</Button>}
            <Button onClick={verify} disabled={!canTest}><Check />{t('Check placement')}</Button>
          </div>
        </div> : <div className="guide-callout"><div>
          <h2>{t(verified ? 'Assembly verified' : 'Assembly does not match the circuit')}</h2>
          <p>{t(verified ? 'The physical connections match the schematic. Select a socket to measure its voltage.' : 'Review the steps or reset the assembly.')}</p>
        </div>{verified && <Check size={24} className="verified-check" />}</div>}
        <div className="guide-steps">{guide.steps.map((item, i) => <Button key={item.id} size="sm" variant={i === index ? 'secondary' : 'ghost'}
          disabled={!assembly[item.id] && i !== firstIncomplete} onClick={() => startStep(i)}>
          {assembly[item.id] ? <Check /> : <span>{i + 1}</span>}{stepTitle(item)}</Button>)}</div>
      </>}
      <div className="board-examples"><span>{t('Guided examples')}</span>{boardGuides.filter(item => item.example !== guide.example).map(item =>
        <Button size="sm" variant="ghost" key={item.example} onClick={() => onLoad(item.example)}>{t(item.example)}<ArrowRight /></Button>)}</div>
    </div>
  </div>
}
