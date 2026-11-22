import { useMemo, useState } from 'react'
import { ArrowRight, CircuitBoard, Crosshair, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Circuit, Component } from '../circuit/model'
import { metric } from '../editor/catalog'
import type { Translate } from '../locale'
import type { Theme } from '../theme'
import { boardGuides, boardShape, holeGroup, probeNode, type Guide } from './model'
import { boardGeometry } from './geometry'
import type { BoardSettings } from './settings'
import Board3D from './Board3D'
import './board.css'

export type BoardProps = {
  t: Translate
  theme: Theme
  guide?: Guide
  settings: BoardSettings
  circuit: Circuit
  pins: Record<string, string>
  readings: Record<string, number> | undefined
  currents: Record<string, number> | undefined
  selected: string[]
  onSelect: (ids: string[]) => void
  onToggle: (part: Component) => void
  onLoad: (name: string) => void
}

function webgl() {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch { return false }
}

/** Full-size 3D breadboard with the assembled reference layout of a supported example and a voltage probe. */
export default function Board({ t, theme, guide, settings, circuit, pins, readings, currents, selected, onSelect, onToggle, onLoad }: BoardProps) {
  const [available, setAvailable] = useState(webgl)
  const shape = boardShape(settings)
  const shapeKey = `${guide?.example}:${shape.columns}:${shape.railLength}:${shape.split}`
  const geometry = useMemo(() => boardGeometry(shape), [shape.columns, shape.railLength, shape.split])
  const placements = useMemo(() => guide?.place(shape) ?? [], [guide, shape.columns, shape.railLength, shape.split])
  const parts = useMemo(() => new Map(circuit.components.map(part => [part.id, part])), [circuit.components])
  // A probe belongs to one board and layout; changing either clears it.
  const [probed, setProbed] = useState({ key: shapeKey, socket: '' })
  const probe = probed.key === shapeKey ? probed.socket : ''
  const group = probe ? holeGroup(shape, probe) : undefined
  const strip = group ? geometry.sockets.filter(s => holeGroup(shape, s.id) === group).map(s => s.id) : []
  const node = probe ? probeNode(shape, placements, pins, probe) : undefined
  const value = node !== undefined ? readings?.[node] : undefined
  const switchPart = guide && circuit.components.find(part => part.kind === 'switch')

  function inspect(socket: string) {
    const owner = placements.find(item => item.part && item.sockets.includes(socket))?.part
    if (owner) onSelect([owner])
    setProbed({ key: shapeKey, socket })
  }

  return <div className="board" data-size={settings.size}>
    {available
      ? <Board3D t={t} theme={theme} geometry={geometry} labels={settings.labels} placements={placements} parts={parts} currents={currents}
          selected={selected} strip={strip} probe={probe} onSocket={inspect} onPart={id => onSelect([id])} onUnavailable={() => setAvailable(false)} />
      : <p className="board-message" role="status">{t('The 3D breadboard needs WebGL, which is not available in this browser.')}</p>}
    {guide && available && <div className="board-overlay board-overlay-start">
      <div className="board-probe">
        <Crosshair size={16} />
        <div><small>{t('Voltage to ground')}</small>
          <strong role="status">{probe ? `${probe} · ${value !== undefined ? metric(value, 'V') : t(node === undefined ? 'Not connected' : 'No voltage reading')}` : t('Select a socket')}</strong></div>
      </div>
      {switchPart && <Button size="sm" variant="outline" className="board-switch" onClick={() => { onSelect([switchPart.id]); onToggle(switchPart) }}>
        <Zap />{t(switchPart.closed ? 'Open the switch' : 'Close the switch')}
      </Button>}
    </div>}
    {!guide && <section className="board-empty" aria-labelledby="board-empty-title">
      <div className="board-empty-icon"><CircuitBoard /></div>
      <h2 id="board-empty-title">{t('Start with a supported circuit')}</h2>
      <p>{t('The breadboard shows an assembled layout for these examples. Load one to place it on the board.')}</p>
      <div>{boardGuides.map(g => <Button key={g.example} variant="outline" onClick={() => onLoad(g.example)}>{t(g.example)} <ArrowRight /></Button>)}</div>
    </section>}
  </div>
}
