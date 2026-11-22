import { useLayoutEffect, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { endpointPosition, route, terminal, type Circuit, type Component, type Endpoint, type Point, type Wire } from '../circuit/model'
import { metric, catalog } from './catalog'
import type { Translate } from '../locale'
import { Symbol } from './Symbol'
import type { Palette } from '../palette'

type Measurement = { voltage: number; current: number; power: number }
export type View = { x: number; y: number; scale: number }
export type CanvasProps = {
  t: Translate
  palette: Palette
  svg: RefObject<SVGSVGElement | null>
  circuit: Circuit
  selected: string[]
  flagged: string[]
  view: View
  nodes: Record<string, number>
  pins: Record<string, string>
  readings: Record<string, Measurement>
  flows: Record<string, number | undefined>
  grounds: Record<string, number | undefined>
  showGround: boolean
  showNodes: boolean
  showVoltage: boolean
  running: boolean
  reverse: boolean
  speed: number
  wireFrom: Endpoint | null
  cursor: Point | null
  mode: 'select' | 'wire' | 'pan'
  onBackground: (event: ReactPointerEvent) => void
  onComponent: (event: ReactPointerEvent, component: Component) => void
  onEndpoint: (event: ReactPointerEvent, endpoint: Endpoint) => void
  onRoute: (event: ReactPointerEvent, wire: Wire, index: number) => void
  onWire: (event: ReactPointerEvent, wire: Wire) => void
  box: { start: Point; end: Point } | null
  onMove: (event: ReactPointerEvent) => void
  onUp: (event: ReactPointerEvent) => void
  /** Screen pixels covered by floating chrome along each edge; the drawing is centred in the remaining area. */
  inset?: Inset
}
type Inset = { top: number; bottom: number; left?: number; right?: number }
type Frame = { x: number; y: number; width: number; height: number }
const DRAWING = { width: 800, height: 540 }
const MAX_SCALE = 1.25

/**
 * The editor works in an 800 × 540 drawing space. The SVG fills its container, so the view box grows with the
 * screen while keeping the drawing centre (400, 270) in the middle of the uncovered area. Pointer math uses
 * getScreenCTM, so it stays correct for any frame.
 */
export function frameFor(size: { width: number; height: number } | null, inset: Inset = { top: 0, bottom: 0 }): Frame {
  if (!size || size.width <= 0 || size.height <= 0) return { x: 0, y: 0, ...DRAWING }
  const left = inset.left ?? 0, right = inset.right ?? 0
  const usableWidth = Math.max(1, size.width - left - right)
  const usable = Math.max(1, size.height - inset.top - inset.bottom)
  const scale = Math.min(usableWidth / DRAWING.width, usable / DRAWING.height, MAX_SCALE)
  const width = size.width / scale, height = size.height / scale
  return { x: DRAWING.width / 2 - (left + usableWidth / 2) / scale, y: DRAWING.height / 2 - (inset.top + usable / 2) / scale, width, height }
}

function useSize(svg: RefObject<SVGSVGElement | null>) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const element = svg.current
    if (!element) return
    const measure = () => {
      const { width, height } = element.getBoundingClientRect()
      setSize(previous => previous?.width === width && previous.height === height ? previous : { width, height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [svg])
  return size
}
const coord = ({ x, y }: Point) => `${x},${y}`
const pathFor = (points: Point[]) => points.map((p, index) => `${index ? 'L' : 'M'}${coord(p)}`).join(' ')
const endpointKey = (endpoint: Endpoint) => 'component' in endpoint ? `${endpoint.component}:${endpoint.pin}` : endpoint.junction

export default function Canvas(props: CanvasProps) {
  const { t, palette: c, svg, circuit, view, wireFrom, cursor, readings, pins, nodes, showVoltage, showNodes } = props
  const frame = frameFor(useSize(svg), props.inset)
  const draft = wireFrom && cursor ? (() => {
    const start = endpointPosition(circuit, wireFrom)
    return pathFor([start, { x: cursor.x, y: start.y }, cursor])
  })() : ''
  const hidden = new Set(circuit.components.filter(c => c.kind === 'ground' && !props.showGround).map(c => c.id))
  const volts = (endpoint: Endpoint) => nodes[pins[endpointKey(endpoint)]]
  const voltageColor = (value: number | undefined) => value === undefined ? undefined : value === 0 ? c.zero : value > 0 ? c.positive : c.negative
  return <svg ref={svg} className={`schematic mode-${props.mode}`} viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`} xmlns="http://www.w3.org/2000/svg"
    aria-label={t('Interactive circuit schematic')} role="group" onPointerMove={props.onMove} onPointerUp={props.onUp} onPointerCancel={props.onUp}
    onPointerDown={props.onBackground}>
    <defs>
      <pattern id="minor-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill={c.gridMinor} /></pattern>
      <pattern id="major-grid" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#minor-grid)" /><circle cx="1" cy="1" r="1.45" fill={c.gridMajor} /></pattern>
    </defs>
    <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} fill={c.canvas} />
    <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
      <rect x="-20000" y="-20000" width="40000" height="40000" fill="url(#major-grid)" />
      {circuit.wires.map(wire => {
        if ([wire.from, wire.to].some(e => 'component' in e && hidden.has(e.component))) return null
        const points = route(circuit, wire)
        const path = pathFor(points)
        const amps = props.flows[wire.id]
        const voltage = volts(wire.from) ?? volts(wire.to)
        const selected = props.selected.includes(wire.id)
        const delay = (amps ?? 0) * (props.reverse ? -1 : 1) < 0 ? 'reverse' : 'normal'
        const rate = (22 + Math.min(175, Math.log10(1 + Math.abs(amps ?? 0) * 1000) * 34)) * props.speed
        return <g key={wire.id} className="wire">
          <title>{`${t('Node')}: ${metric(voltage, 'V')} · I: ${metric(amps, 'A')} · ΔV: 0 V · P: 0 W`}</title>
          <path d={path} fill="none" stroke={selected ? c.selected : c.wireCasing} strokeWidth={selected ? 8 : 6} strokeOpacity={selected ? .35 : 1} strokeLinejoin="round" />
          <path d={path} fill="none" stroke={(showVoltage && voltageColor(voltage)) || c.wire} strokeWidth="2" strokeLinejoin="round" />
          {!!amps && Math.abs(amps) > 1e-12 && <path d={path} fill="none" stroke={c.current} strokeWidth="3.2" strokeLinecap="round"
            strokeDasharray="1 25" className="flow" style={{ animationDuration: `${26 / rate}s`, animationDirection: delay, animationPlayState: props.running ? 'running' : 'paused' }} />}
          <path data-export="hide" d={path} fill="none" stroke="transparent" strokeWidth="14" onPointerDown={event => props.onWire(event, wire)} />
        </g>
      })}
      {props.mode === 'select' && props.selected.length === 1 && circuit.wires.filter(w => w.id === props.selected[0]).flatMap(wire => {
        if ([wire.from, wire.to].some(e => 'component' in e && hidden.has(e.component))) return []
        const points = route(circuit, wire)
        return points.slice(0, -1).map((a, index) => {
          const b = points[index + 1]
          if (Math.hypot(a.x - b.x, a.y - b.y) < 15) return null
          return <circle key={`${wire.id}:${index}`} data-export="hide" className="route-handle" aria-label={t('Move wire segment')}
            cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} r="7" fill={c.handleFill} stroke={c.selected} strokeWidth="2"
            style={{ cursor: a.x === b.x ? 'ew-resize' : 'ns-resize' }} onPointerDown={event => props.onRoute(event, wire, index)} />
        })
      })}
      {circuit.junctions.map(junction => <g key={junction.id} transform={`translate(${junction.x} ${junction.y})`}>
        <circle r="4" fill={c.junction} />
        <circle data-export="hide" r="10" fill="transparent" className="pin" onPointerDown={event => props.onEndpoint(event, { junction: junction.id })} />
      </g>)}
      {circuit.components.filter(c => !hidden.has(c.id)).map(component => {
        const r = readings[component.id]
        const selected = props.selected.includes(component.id)
        const flagged = props.flagged.includes(component.id)
        const lit = component.kind === 'led' ? Number((r?.current ?? 0) > .00005) : Math.min(1, Math.sqrt(Math.max(0, r?.power ?? 0)))
        const isVertical = component.rotation % 180 !== 0
        const value = component.kind === 'ground' ? metric(props.grounds[component.id], 'A')
          : component.kind === 'switch' ? t(component.closed ? 'CLOSED' : 'OPEN') : metric(component.value, catalog[component.kind].unit)
        return <g key={component.id} transform={`translate(${component.x} ${component.y})`} color={flagged ? c.flagged : selected ? c.selected : c.ink} className="part"
          onPointerDown={event => props.onComponent(event, component)}>
          <title>{`${component.label} · V(a): ${metric(volts({ component: component.id, pin: 0 }), 'V')} · ΔV: ${metric(r?.voltage, 'V')} · I: ${metric(r?.current, 'A')} · P: ${metric(r?.power, 'W')}`}</title>
          <g transform={`rotate(${component.rotation})`}>
            {flagged && <rect data-export="hide" className="flag-outline" x="-36" y="-25" width="72" height="50" rx="8" fill={`${c.flagged}22`} stroke={c.flagged} strokeDasharray="4 3" pointerEvents="none" />}
            <rect data-export="hide" x="-34" y="-23" width="68" height="46" rx="7" fill={selected ? c.selectedFill : 'transparent'} stroke={selected ? c.selectedStroke : 'none'} strokeDasharray="3 3" />
            <Symbol kind={component.kind} closed={component.closed} lit={lit} />
          </g>
          <text x={isVertical ? 33 : 0} y={isVertical ? -2 : -31} textAnchor={isVertical ? 'start' : 'middle'} fill={c.label} fontSize="13" fontWeight="700">{component.label}</text>
          <text x={isVertical ? 33 : 0} y={isVertical ? 14 : 33} textAnchor={isVertical ? 'start' : 'middle'} fill={c.value} fontSize="11">{value}</text>
          {([0, ...(component.kind === 'ground' ? [] : [1])] as (0 | 1)[]).map(pin => {
            const p = terminal(component, pin)
            const x = p.x - component.x, y = p.y - component.y
            const endpoint = { component: component.id, pin }
            const voltage = volts(endpoint)
            return <g key={pin}>
              <circle cx={x} cy={y} r="3.3" fill={voltageColor(voltage) && showVoltage ? voltageColor(voltage) : c.pin} />
              {showNodes && voltage !== undefined && <text x={x + 5} y={y - 8} fill={c.node} fontSize="10">{metric(voltage, 'V')}</text>}
              <circle data-export="hide" className="pin" cx={x} cy={y} r="10" fill="transparent" onPointerDown={event => props.onEndpoint(event, endpoint)} />
            </g>
          })}
        </g>
      })}
      {props.box && <rect data-export="hide" x={Math.min(props.box.start.x, props.box.end.x)} y={Math.min(props.box.start.y, props.box.end.y)} width={Math.abs(props.box.start.x - props.box.end.x)} height={Math.abs(props.box.start.y - props.box.end.y)} fill={c.selectedFill} stroke={c.selected} strokeDasharray="5 4" pointerEvents="none" />}
      {draft && <path data-export="hide" d={draft} fill="none" stroke={c.draft} strokeWidth="2" strokeDasharray="6 4" pointerEvents="none" />}
    </g>
  </svg>
}
