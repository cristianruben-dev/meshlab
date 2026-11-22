import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { GRID, endpointPosition, route, type Circuit, type Component, type Endpoint, type Kind, type Point, type Wire } from '../circuit/model'
import { copyBlock, pasteBlock, offsetWireSegment } from '../circuit/editing'
import { loadCircuit, saveCircuit } from './io'
import { catalog } from './catalog'
import type { View } from './Canvas'

const id = () => crypto.randomUUID()
const snap = (n: number) => Math.round(n / GRID) * GRID
const initialView: View = { x: 0, y: 0, scale: 1 }
type Gesture =
  | { kind: 'pan'; start: Point; view: View }
  | { kind: 'move'; start: Point; circuit: Circuit; selection: string[]; component: Component }
  | { kind: 'route'; start: Point; wire: Wire; index: number; circuit: Circuit }
  | { kind: 'box'; start: Point; additive: boolean }

export function useEditor(fallback: Circuit) {
  const [circuit, setCircuit] = useState(() => loadCircuit(fallback))
  const [clipboard, setClipboard] = useState<Circuit | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [mode, setMode] = useState<'select' | 'wire' | 'pan'>('select')
  const [wireFrom, setWireFrom] = useState<Endpoint | null>(null)
  const [wireDraft, setWireDraft] = useState<Circuit | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)
  const [view, setView] = useState(initialView)
  const [gestureView, setGestureView] = useState<Circuit | null>(null)
  const [propertyPreview, setPropertyPreview] = useState<Circuit | null>(null)
  const [box, setBox] = useState<{ start: Point; end: Point } | null>(null)
  const [past, setPast] = useState<Circuit[]>([])
  const [future, setFuture] = useState<Circuit[]>([])
  const [storageError, setStorageError] = useState(false)
  const svg = useRef<SVGSVGElement>(null)
  const gesture = useRef<Gesture | null>(null)

  useEffect(() => {
    try { saveCircuit(circuit); setStorageError(false) }
    catch { setStorageError(true) }
  }, [circuit])

  function svgPoint(event: Pick<ReactPointerEvent, 'clientX' | 'clientY'>): Point {
    const matrix = svg.current?.getScreenCTM()
    if (!matrix) return { x: 400, y: 270 }
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  }
  function world(p: Point): Point {
    return { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale }
  }
  function zoom(multiplier: number, anchor: Point = { x: 400, y: 270 }) {
    setView(previous => {
      const scale = Math.min(4, Math.max(.25, previous.scale * multiplier))
      return { x: anchor.x - (anchor.x - previous.x) * scale / previous.scale, y: anchor.y - (anchor.y - previous.y) * scale / previous.scale, scale }
    })
  }
  useEffect(() => {
    const element = svg.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      zoom(Math.exp(-event.deltaY * .0015), svgPoint(event))
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [])

  function commit(next: Circuit) {
    setWireFrom(null)
    setWireDraft(null)
    setPropertyPreview(null)
    setPast(previous => [...previous.slice(-99), circuit])
    setFuture([])
    setCircuit(next)
  }
  function clearTransient() {
    setWireFrom(null); setWireDraft(null); setCursor(null); setGestureView(null); setPropertyPreview(null); setBox(null); gesture.current = null
  }
  function setTool(tool: typeof mode) { clearTransient(); setMode(tool) }
  function history(redo: boolean) {
    const stack = redo ? future : past
    const next = stack.at(-1)
    if (!next) return
    setSelected([]); clearTransient()
    if (redo) { setFuture(future.slice(0, -1)); setPast([...past, circuit]) }
    else { setPast(past.slice(0, -1)); setFuture([...future, circuit]) }
    setCircuit(next)
  }
  function replace(next: Circuit) {
    commit(next); setSelected([]); setView(initialView); setTool('select')
  }
  function reveal(ids: string[]) {
    const parts = circuit.components.filter(c => ids.includes(c.id))
    if (!parts.length) return
    const x = (Math.min(...parts.map(c => c.x)) + Math.max(...parts.map(c => c.x))) / 2
    const y = (Math.min(...parts.map(c => c.y)) + Math.max(...parts.map(c => c.y))) / 2
    setSelected(ids)
    svg.current?.scrollIntoView?.({ block: 'nearest' })
    setTool('select')
    setView(previous => ({ ...previous, x: 400 - x * previous.scale, y: 270 - y * previous.scale }))
  }
  function fit() {
    if (!circuit.components.length) { setView(initialView); return }
    const positions = [...circuit.components, ...circuit.wires.flatMap(wire => route(circuit, wire))]
    const xs = positions.map(c => c.x), ys = positions.map(c => c.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
    const scale = Math.min(2, 680 / (maxX - minX + 110), 450 / (maxY - minY + 110))
    setView({ scale, x: 400 - (minX + maxX) / 2 * scale, y: 270 - (minY + maxY) / 2 * scale })
  }
  function add(kind: Kind, at = world({ x: 400, y: 260 })) {
    const meta = catalog[kind]
    let number = 1
    while (circuit.components.some(c => c.label === `${meta.prefix}${number}`)) number++
    let x = snap(at.x), y = snap(at.y)
    while (circuit.components.some(c => c.x === x && c.y === y)) { x += GRID; y += GRID }
    const component: Component = { id: id(), kind, x, y, rotation: kind === 'ground' ? 90 : 0, label: `${meta.prefix}${number}`, value: meta.value,
      ...(kind === 'switch' ? { closed: false } : {}), ...(kind === 'potentiometer' ? { position: .5 } : {}) }
    commit({ ...circuit, components: [...circuit.components, component] })
    setSelected([component.id]); setTool('select')
  }
  function update(component: Component, changes: Partial<Component>, preview = false) {
    const unchanged = Object.entries(changes).every(([key, value]) => component[key as keyof Component] === value)
    const next = unchanged ? null : { ...circuit, components: circuit.components.map(c => c.id === component.id ? { ...c, ...changes } : c) }
    if (preview) setPropertyPreview(next)
    else if (next) commit(next)
    else setPropertyPreview(null)
  }
  function copy() {
    const block = copyBlock(circuit, selected)
    if (block.components.length) setClipboard(block)
  }
  function paste(block = clipboard) {
    if (!block?.components.length) return
    const next = pasteBlock(circuit, block, id)
    commit(next.circuit)
    setSelected(next.selected)
    setTool('select')
  }
  function duplicate() { paste(copyBlock(circuit, selected)) }
  function routeDown(event: ReactPointerEvent, wire: Wire, index: number) {
    if (mode !== 'select' || event.button !== 0) return
    event.stopPropagation()
    gesture.current = { kind: 'route', start: world(svgPoint(event)), wire, index, circuit }
    svg.current?.setPointerCapture(event.pointerId)
  }
  function movedRoute(g: Extract<Gesture, { kind: 'route' }>, point: Point) {
    const wire = offsetWireSegment(g.circuit, g.wire, g.index, { x: snap(point.x - g.start.x), y: snap(point.y - g.start.y) })
    if (wire === g.wire) return null
    return { ...g.circuit, wires: g.circuit.wires.map(w => w.id === wire.id ? wire : w) }
  }
  function rotate() {
    if (!circuit.components.some(c => selected.includes(c.id))) return
    commit({ ...circuit, components: circuit.components.map(c => selected.includes(c.id) ? { ...c, rotation: (c.rotation + 90) % 360 } : c) })
  }
  function remove() {
    if (!selected.length) return
    const touchesSelection = (endpoint: Endpoint) => 'component' in endpoint ? selected.includes(endpoint.component) : selected.includes(endpoint.junction)
    const wires = circuit.wires.filter(w => !selected.includes(w.id) && !touchesSelection(w.from) && !touchesSelection(w.to))
    const junctions = circuit.junctions.filter(j => wires.some(w => [w.from, w.to].some(e => 'junction' in e && e.junction === j.id)))
    const components = circuit.components.filter(c => !selected.includes(c.id))
    const breadboard = circuit.breadboard
      ? {
          placements: circuit.breadboard.placements.filter(p => !selected.includes(p.componentId) && !selected.includes(p.id)),
          jumpers: circuit.breadboard.jumpers.filter(j => !selected.includes(j.id)),
        }
      : undefined
    commit({ ...circuit, components, wires, junctions, ...(breadboard ? { breadboard } : {}) })
    setSelected([]); clearTransient()
  }
  function connect(from: Endpoint, to: Endpoint, source = wireDraft ?? circuit) {
    const endpointId = (e: Endpoint) => 'component' in e ? `c:${e.component}:${e.pin}` : `j:${e.junction}`
    const a = endpointId(from), b = endpointId(to)
    if (a !== b && !source.wires.some(w => {
      const x = endpointId(w.from), y = endpointId(w.to)
      return (a === x && b === y) || (a === y && b === x)
    })) commit({ ...source, wires: [...source.wires, { id: id(), from, to }] })
    setWireFrom(null)
    setWireDraft(null)
  }
  function endpointDown(event: ReactPointerEvent, endpoint: Endpoint) {
    if (mode === 'pan' || event.button !== 0) return
    event.stopPropagation()
    if (wireFrom) connect(wireFrom, endpoint)
    else { setWireFrom(endpoint); setCursor(endpointPosition(circuit, endpoint)); setMode('wire') }
  }
  function wireDown(event: ReactPointerEvent, wire: Wire) {
    if (mode === 'pan' || event.button !== 0) return
    event.stopPropagation()
    if (mode !== 'wire') {
      setSelected(event.shiftKey ? toggleId(selected, wire.id) : [wire.id])
      return
    }
    const p = world(svgPoint(event))
    const base = wireDraft ?? circuit
    const points = route(base, wire)
    let closest: (Point & { index: number; distance: number }) | undefined
    for (let index = 0; index < points.length - 1; index++) {
      const a = points[index], b = points[index + 1]
      const clamp = (value: number, x: number, y: number) => Math.max(Math.min(x, y), Math.min(Math.max(x, y), value))
      const x = a.x === b.x ? a.x : clamp(snap(p.x), a.x, b.x)
      const y = a.y === b.y ? a.y : clamp(snap(p.y), a.y, b.y)
      const distance = Math.hypot(x - p.x, y - p.y)
      if (!closest || distance < closest.distance) closest = { x, y, index, distance }
    }
    if (!closest) return
    const { x, y, index } = closest
    const same = (p: Point) => p.x === x && p.y === y
    if (same(points[0]) || same(points.at(-1)!)) {
      endpointDown(event, same(points[0]) ? wire.from : wire.to)
      return
    }
    const junction = { id: id(), x, y }
    const endpoint = { junction: junction.id }
    const next = { ...base, junctions: [...base.junctions, junction], wires: [
      ...base.wires.filter(w => w.id !== wire.id),
      { id: id(), from: wire.from, to: endpoint, points: points.slice(1, index + 1).filter(p => !same(p)) },
      { id: id(), from: endpoint, to: wire.to, points: points.slice(index + 1, -1).filter(p => !same(p)) },
    ] }
    if (wireFrom) connect(wireFrom, endpoint, next)
    else { setWireDraft(next); setWireFrom(endpoint); setCursor(junction) }
  }
  function backgroundDown(event: ReactPointerEvent) {
    if (event.button === 1 || (event.button === 0 && mode === 'pan')) {
      event.preventDefault()
      gesture.current = { kind: 'pan', start: svgPoint(event), view }
    } else if (event.button === 0 && mode === 'select') {
      const start = world(svgPoint(event))
      gesture.current = { kind: 'box', start, additive: event.shiftKey }
      if (!event.shiftKey) setSelected([])
      setBox({ start, end: start })
    } else return
    svg.current?.setPointerCapture(event.pointerId)
  }
  function componentDown(event: ReactPointerEvent, component: Component) {
    if (event.button !== 0 || mode === 'pan') return
    event.stopPropagation()
    if (mode === 'wire') return
    const ids = event.shiftKey ? toggleId(selected, component.id) : selected.includes(component.id) ? selected : [component.id]
    setSelected(ids)
    gesture.current = { kind: 'move', start: world(svgPoint(event)), circuit, selection: ids, component }
    svg.current?.setPointerCapture(event.pointerId)
  }
  function movedCircuit(g: Extract<Gesture, { kind: 'move' }>, point: Point) {
    const dx = snap(point.x - g.start.x), dy = snap(point.y - g.start.y)
    if (!dx && !dy) return null
    return { ...g.circuit, components: g.circuit.components.map(c => g.selection.includes(c.id) ? { ...c, x: c.x + dx, y: c.y + dy } : c) }
  }
  function move(event: ReactPointerEvent) {
    const pos = svgPoint(event)
    const point = world(pos)
    if (wireFrom) setCursor({ x: snap(point.x), y: snap(point.y) })
    const g = gesture.current
    if (g?.kind === 'pan') setView({ ...g.view, x: g.view.x + pos.x - g.start.x, y: g.view.y + pos.y - g.start.y })
    if (g?.kind === 'route') setGestureView(movedRoute(g, point))
    if (g?.kind === 'move') setGestureView(movedCircuit(g, point))
    if (g?.kind === 'box') setBox({ start: g.start, end: point })
  }
  function up(event: ReactPointerEvent) {
    const g = gesture.current
    const point = world(svgPoint(event))
    if (event.type !== 'pointercancel' && g?.kind === 'route') {
      const next = movedRoute(g, point)
      if (next) commit(next)
    }
    if (event.type !== 'pointercancel' && g?.kind === 'move') {
      const next = movedCircuit(g, point)
      if (next) commit(next)
      else if (!event.shiftKey && g.component.kind === 'switch') update(g.component, { closed: !g.component.closed })
    }
    if (event.type !== 'pointercancel' && g?.kind === 'box' && Math.hypot(point.x - g.start.x, point.y - g.start.y) > 5) {
      const inside = (value: number, a: number, b: number) => value >= Math.min(a, b) && value <= Math.max(a, b)
      const ids = circuit.components.filter(c => inside(c.x, g.start.x, point.x) && inside(c.y, g.start.y, point.y)).map(c => c.id)
      setSelected(g.additive ? [...new Set([...selected, ...ids])] : ids)
    }
    gesture.current = null; setGestureView(null); setBox(null)
  }
  return { circuit, simulated: propertyPreview ?? circuit, drawn: gestureView ?? wireDraft ?? propertyPreview ?? circuit, selected, view, svg, wireFrom, cursor, mode, box, storageError,
    canCopy: circuit.components.some(c => selected.includes(c.id)), canPaste: !!clipboard, copy, paste, duplicate, routeDown,
    canUndo: !!past.length, canRedo: !!future.length, history, commit, replace, reveal, fit, zoom, add, update, rotate, remove, setTool,
    select: setSelected, endpointDown, wireDown, backgroundDown, componentDown, move, up, svgPoint, world }
}
function toggleId(list: string[], key: string) {
  return list.includes(key) ? list.filter(id => id !== key) : [...list, key]
}
