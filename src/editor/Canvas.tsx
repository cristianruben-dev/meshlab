import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { endpointPosition, route, terminal, type Circuit, type Component, type Endpoint, type Point, type Wire } from '../circuit/model'
import { metric, catalog } from './catalog'
import { Symbol } from './Symbol'

type Measurement = { voltage: number; current: number; power: number }
export type View = { x: number; y: number; scale: number }
export type CanvasProps = {
  svg: RefObject<SVGSVGElement | null>
  circuit: Circuit
  selected: string[]
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
  onWire: (event: ReactPointerEvent, wire: Wire) => void
  box: { start: Point; end: Point } | null
  onMove: (event: ReactPointerEvent) => void
  onUp: (event: ReactPointerEvent) => void
}
const coord = ({ x, y }: Point) => `${x},${y}`
const pathFor = (points: Point[]) => points.map((p, index) => `${index ? 'L' : 'M'}${coord(p)}`).join(' ')
const endpointKey = (endpoint: Endpoint) => 'component' in endpoint ? `${endpoint.component}:${endpoint.pin}` : endpoint.junction

export default function Canvas(props: CanvasProps) {
  const { svg, circuit, view, wireFrom, cursor, readings, pins, nodes, showVoltage, showNodes } = props
  const draft = wireFrom && cursor ? (() => {
    const start = endpointPosition(circuit, wireFrom)
    return pathFor([start, { x: cursor.x, y: start.y }, cursor])
  })() : ''
  const hidden = new Set(circuit.components.filter(c => c.kind === 'ground' && !props.showGround).map(c => c.id))
  const volts = (endpoint: Endpoint) => nodes[pins[endpointKey(endpoint)]]
  const voltageColor = (value: number | undefined) => value === undefined ? undefined : value === 0 ? '#4c8890' : value > 0 ? '#5bd9ad' : '#c890ff'
  return <svg ref={svg} className={`schematic mode-${props.mode}`} viewBox="0 0 800 540" xmlns="http://www.w3.org/2000/svg"
    aria-label="Interactive circuit schematic" role="group" onPointerMove={props.onMove} onPointerUp={props.onUp} onPointerCancel={props.onUp}
    onPointerDown={props.onBackground}>
    <defs>
      <pattern id="minor-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#29364b" /></pattern>
      <pattern id="major-grid" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#minor-grid)" /><circle cx="1" cy="1" r="1.45" fill="#45556e" /></pattern>
    </defs>
    <rect width="100%" height="100%" fill="#0a1019" />
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
          <title>{`Node: ${metric(voltage, 'V')} · I: ${metric(amps, 'A')} · ΔV: 0 V · P: 0 W`}</title>
          <path d={path} fill="none" stroke={selected ? '#f6be61' : '#0a1019'} strokeWidth={selected ? 7 : 6} />
          <path d={path} fill="none" stroke={(showVoltage && voltageColor(voltage)) || '#56838f'} strokeWidth="2" strokeLinejoin="round" />
          {!!amps && Math.abs(amps) > 1e-12 && <path d={path} fill="none" stroke="#ffd363" strokeWidth="3.2" strokeLinecap="round"
            strokeDasharray="1 25" className="flow" style={{ animationDuration: `${26 / rate}s`, animationDirection: delay, animationPlayState: props.running ? 'running' : 'paused' }} />}
          <path data-export="hide" d={path} fill="none" stroke="transparent" strokeWidth="14" onPointerDown={event => props.onWire(event, wire)} />
        </g>
      })}
      {circuit.junctions.map(junction => <g key={junction.id} transform={`translate(${junction.x} ${junction.y})`}>
        <circle r="4" fill="#70d8c2" />
        <circle data-export="hide" r="10" fill="transparent" className="pin" onPointerDown={event => props.onEndpoint(event, { junction: junction.id })} />
      </g>)}
      {circuit.components.filter(c => !hidden.has(c.id)).map(component => {
        const r = readings[component.id]
        const selected = props.selected.includes(component.id)
        const lit = component.kind === 'led' ? Number((r?.current ?? 0) > .00005) : Math.min(1, Math.sqrt(Math.max(0, r?.power ?? 0)))
        const isVertical = component.rotation % 180 !== 0
        const value = component.kind === 'ground' ? metric(props.grounds[component.id], 'A')
          : component.kind === 'switch' ? (component.closed ? 'CLOSED' : 'OPEN') : metric(component.value, catalog[component.kind].unit)
        return <g key={component.id} transform={`translate(${component.x} ${component.y})`} color={selected ? '#73efd2' : '#cad5e7'} className="part"
          onPointerDown={event => props.onComponent(event, component)}>
          <title>{`${component.label} · V(a): ${metric(volts({ component: component.id, pin: 0 }), 'V')} · ΔV: ${metric(r?.voltage, 'V')} · I: ${metric(r?.current, 'A')} · P: ${metric(r?.power, 'W')}`}</title>
          <g transform={`rotate(${component.rotation})`}>
            <rect data-export="hide" x="-34" y="-23" width="68" height="46" rx="7" fill={selected ? '#11312e' : 'transparent'} stroke={selected ? '#3dc0a5' : 'none'} strokeDasharray="3 3" />
            <Symbol kind={component.kind} closed={component.closed} lit={lit} />
          </g>
          <text x={isVertical ? 33 : 0} y={isVertical ? -2 : -31} textAnchor={isVertical ? 'start' : 'middle'} fill="#e6edf8" fontSize="13" fontWeight="700">{component.label}</text>
          <text x={isVertical ? 33 : 0} y={isVertical ? 14 : 33} textAnchor={isVertical ? 'start' : 'middle'} fill="#8da3ba" fontSize="11">{value}</text>
          {([0, ...(component.kind === 'ground' ? [] : [1])] as (0 | 1)[]).map(pin => {
            const p = terminal(component, pin)
            const x = p.x - component.x, y = p.y - component.y
            const endpoint = { component: component.id, pin }
            const voltage = volts(endpoint)
            return <g key={pin}>
              <circle cx={x} cy={y} r="3.3" fill={voltageColor(voltage) && showVoltage ? voltageColor(voltage) : '#7ba8ac'} />
              {showNodes && voltage !== undefined && <text x={x + 5} y={y - 8} fill="#82d8c2" fontSize="10">{metric(voltage, 'V')}</text>}
              <circle data-export="hide" className="pin" cx={x} cy={y} r="10" fill="transparent" onPointerDown={event => props.onEndpoint(event, endpoint)} />
            </g>
          })}
        </g>
      })}
      {props.box && <rect data-export="hide" x={Math.min(props.box.start.x, props.box.end.x)} y={Math.min(props.box.start.y, props.box.end.y)} width={Math.abs(props.box.start.x - props.box.end.x)} height={Math.abs(props.box.start.y - props.box.end.y)} fill="#61e6c81a" stroke="#61e6c8" strokeDasharray="5 4" pointerEvents="none" />}
      {draft && <path data-export="hide" d={draft} fill="none" stroke="#65efcf" strokeWidth="2" strokeDasharray="6 4" pointerEvents="none" />}
    </g>
  </svg>
}
