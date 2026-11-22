import { GRID, route, type Circuit, type Endpoint, type Point, type Wire } from './model'

export function copyBlock(circuit: Circuit, selected: string[]): Circuit {
  const components = circuit.components.filter(c => selected.includes(c.id))
  const vertex = (e: Endpoint) => 'component' in e ? `p:${e.component}:${e.pin}` : `j:${e.junction}`
  const included = (e: Endpoint) => 'junction' in e || components.some(c => c.id === e.component)
  let wires = circuit.wires.filter(w => included(w.from) && included(w.to))
  const reached = new Set(components.flatMap(c => [vertex({ component: c.id, pin: 0 }), vertex({ component: c.id, pin: 1 })]))
  const neighbors = new Map<string, string[]>()
  for (const { from, to } of wires) {
    const a = vertex(from), b = vertex(to)
    neighbors.set(a, [...(neighbors.get(a) ?? []), b])
    neighbors.set(b, [...(neighbors.get(b) ?? []), a])
  }
  for (const key of reached) for (const adjacent of neighbors.get(key) ?? []) reached.add(adjacent)
  wires = wires.filter(w => reached.has(vertex(w.from)))
  // Strip junction stubs that led only to terminals outside the copied selection.
  for (;;) {
    const degree = new Map<string, number>()
    for (const w of wires) for (const endpoint of [w.from, w.to]) {
      if ('junction' in endpoint) degree.set(endpoint.junction, (degree.get(endpoint.junction) ?? 0) + 1)
    }
    const next = wires.filter(w => [w.from, w.to].every(e => !('junction' in e) || (degree.get(e.junction) ?? 0) > 1))
    if (next.length === wires.length) break
    wires = next
  }
  const junctions = circuit.junctions.filter(j => wires.some(w => [w.from, w.to].some(e => 'junction' in e && e.junction === j.id)))
  return { version: 1, components, junctions, wires }
}

export function pasteBlock(circuit: Circuit, block: Circuit, id: () => string): { circuit: Circuit; selected: string[] } {
  let offset = GRID
  const occupied = new Set([...circuit.components, ...circuit.junctions].map(p => `${p.x},${p.y}`))
  const move = (p: Point) => ({ x: p.x + offset, y: p.y + offset })
  while ([...block.components, ...block.junctions].some(p => {
    const target = move(p)
    return occupied.has(`${target.x},${target.y}`)
  })) offset += GRID
  const ids = new Map([...block.components, ...block.junctions].map(c => [c.id, id()]))
  const labels = new Set(circuit.components.map(c => c.label))
  const components = block.components.map(c => {
    let n = 2
    let label = c.label
    while (labels.has(label)) label = `${c.label}-${n++}`
    labels.add(label)
    return { ...c, ...move(c), id: ids.get(c.id)!, label }
  })
  const junctions = block.junctions.map(j => ({ ...j, ...move(j), id: ids.get(j.id)! }))
  const endpoint = (e: Endpoint): Endpoint => 'component' in e ? { ...e, component: ids.get(e.component)! } : { junction: ids.get(e.junction)! }
  const wires = block.wires.map(w => ({ ...w, id: id(), from: endpoint(w.from), to: endpoint(w.to), ...(w.points && { points: w.points.map(move) }) }))
  return { selected: components.map(c => c.id), circuit: { ...circuit,
    components: [...circuit.components, ...components], junctions: [...circuit.junctions, ...junctions], wires: [...circuit.wires, ...wires] } }
}

export function offsetWireSegment(circuit: Circuit, wire: Wire, index: number, delta: Point): Wire {
  const points = route(circuit, wire)
  const a = points[index], b = points[index + 1]
  if (!a || !b) return wire
  const offset = a.x === b.x ? { x: delta.x, y: 0 } : { x: 0, y: delta.y }
  if (!offset.x && !offset.y) return wire
  const move = (p: Point) => ({ x: p.x + offset.x, y: p.y + offset.y })
  return { ...wire, points: [...points.slice(0, index + 1), move(a), move(b), ...points.slice(index + 1)].slice(1, -1) }
}
