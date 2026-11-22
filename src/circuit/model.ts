import type { Branch, ElementKind } from '../engine/solver'

export const GRID = 20
export type Point = { x: number; y: number }
export type Kind = ElementKind | 'ground'
export type Component = Point & {
  id: string
  kind: Kind
  label: string
  rotation: number
  value: number
  closed?: boolean
  position?: number
}
export type Endpoint = { component: string; pin: 0 | 1 } | { junction: string }
export type Wire = { id: string; from: Endpoint; to: Endpoint; points?: Point[] }
export type Junction = Point & { id: string }
export type Circuit = { version: 1; components: Component[]; wires: Wire[]; junctions: Junction[] }

const pinKey = (id: string, pin: 0 | 1) => `${id}:${pin}`
const pinVertex = (id: string, pin: 0 | 1) => `p:${pinKey(id, pin)}`
const junctionVertex = (id: string) => `j:${id}`
const groundBus = 'ground'
const vertex = (endpoint: Endpoint) => 'component' in endpoint
  ? pinVertex(endpoint.component, endpoint.pin)
  : junctionVertex(endpoint.junction)

export function terminal(component: Component, pin: 0 | 1): Point {
  const offset = pin === 0 ? -2 * GRID : 2 * GRID
  const turn = ((component.rotation % 360) + 360) % 360
  switch (turn) {
    case 90: return { x: component.x, y: component.y + offset }
    case 180: return { x: component.x - offset, y: component.y }
    case 270: return { x: component.x, y: component.y - offset }
    default: return { x: component.x + offset, y: component.y }
  }
}

export function endpointPosition(circuit: Circuit, endpoint: Endpoint): Point {
  if ('component' in endpoint) {
    const component = circuit.components.find(({ id }) => id === endpoint.component)
    if (!component) throw new Error(`Unknown component: ${endpoint.component}`)
    return terminal(component, endpoint.pin)
  }
  const junction = circuit.junctions.find(({ id }) => id === endpoint.junction)
  if (!junction) throw new Error(`Unknown junction: ${endpoint.junction}`)
  return { x: junction.x, y: junction.y }
}

export function route(circuit: Circuit, wire: Wire): Point[] {
  const start = endpointPosition(circuit, wire.from)
  const end = endpointPosition(circuit, wire.to)
  const anchors = [start, ...(wire.points ?? []), end]
  const points = [start]
  const from = wire.from
  const verticalStart = 'component' in from &&
    !!circuit.components.find(({ id, rotation }) => id === from.component && Math.abs(rotation % 180) === 90)
  for (let i = 1; i < anchors.length; i++) {
    const previous = anchors[i - 1]
    const next = anchors[i]
    if (previous.x !== next.x && previous.y !== next.y) {
      points.push(i === 1 && verticalStart ? { x: previous.x, y: next.y } : { x: next.x, y: previous.y })
    }
    if (previous.x !== next.x || previous.y !== next.y) points.push(next)
  }
  return points
}

function pins(component: Component): (0 | 1)[] {
  return component.kind === 'ground' ? [0] : [0, 1]
}

export function compile(circuit: Circuit): { branches: Branch[]; nodeByPin: Record<string, string> } {
  const parent = new Map<string, string>()
  function root(id: string): string {
    let current = id
    while (parent.has(current)) current = parent.get(current)!
    while (id !== current) {
      const next = parent.get(id)!
      parent.set(id, current)
      id = next
    }
    return current
  }
  function join(a: string, b: string) {
    const first = root(a)
    const second = root(b)
    if (first !== second) parent.set(second, first)
  }
  for (const { from, to } of circuit.wires) join(vertex(from), vertex(to))
  for (const component of circuit.components) {
    if (component.kind === 'ground') join(groundBus, pinVertex(component.id, 0))
  }

  const nodeByPin: Record<string, string> = Object.create(null)
  const names = new Map([[groundBus, '0']])
  for (const component of circuit.components) {
    for (const pin of pins(component)) {
      const representative = root(pinVertex(component.id, pin))
      if (!names.has(representative)) names.set(representative, `n${names.size}`)
      nodeByPin[pinKey(component.id, pin)] = names.get(representative)!
    }
  }

  return {
    nodeByPin,
    branches: circuit.components.flatMap(({ id, kind, value, closed, position }): Branch[] => {
      if (kind === 'ground') return []
      return [{
        id, kind, value, a: nodeByPin[pinKey(id, 0)], b: nodeByPin[pinKey(id, 1)],
        ...(closed === undefined ? {} : { closed }),
        ...(position === undefined ? {} : { position }),
      }]
    }),
  }
}

type FlowEdge = { id: string; from: string; to: string; ground?: true }
type FlowState = {
  vertex: string
  parentEdge?: FlowEdge
  order: number
  low: number
  nextEdge: number
  demand: number
  unknown: number
}

function allFlows(circuit: Circuit, currentByBranch: Record<string, number>) {
  const wires: Record<string, number | undefined> = Object.create(null)
  const grounds: Record<string, number | undefined> = Object.create(null)
  const demands = new Map<string, number | undefined>()
  const adjacency = new Map<string, FlowEdge[]>()

  function add(edge: FlowEdge) {
    const result = edge.ground ? grounds : wires
    result[edge.id] = undefined
    for (const endpoint of [edge.from, edge.to]) {
      const edges = adjacency.get(endpoint)
      if (edges) edges.push(edge)
      else adjacency.set(endpoint, [edge])
    }
  }

  for (const { id, from, to } of circuit.wires) add({ id, from: vertex(from), to: vertex(to) })
  for (const { id, kind } of circuit.components) {
    const a = pinVertex(id, 0)
    if (kind === 'ground') {
      add({ id, from: a, to: groundBus, ground: true })
    } else {
      const current = currentByBranch[id]
      demands.set(a, Number.isFinite(current) ? current : undefined)
      demands.set(pinVertex(id, 1), Number.isFinite(current) ? -current : undefined)
    }
  }

  // A conducting cycle has free circulating current. A bridge does not:
  // KCL fixes its signed flow to the net pin demand on either side of the cut.
  const visited = new Map<string, FlowState>()
  function visit(id: string, parentEdge?: FlowEdge): FlowState {
    const order = visited.size
    const demand = demands.get(id)
    const state = {
      vertex: id, parentEdge, order, low: order, nextEdge: 0,
      demand: demand ?? 0, unknown: demands.has(id) && demand === undefined ? 1 : 0,
    }
    visited.set(id, state)
    return state
  }

  for (const id of adjacency.keys()) {
    if (visited.has(id)) continue
    const start = visit(id)
    const stack = [start]
    const bridges: FlowState[] = []
    while (stack.length > 0) {
      const state = stack[stack.length - 1]
      const edge = adjacency.get(state.vertex)![state.nextEdge++]
      if (edge) {
        if (edge === state.parentEdge) continue
        const neighbor = edge.from === state.vertex ? edge.to : edge.from
        const seen = visited.get(neighbor)
        if (seen) state.low = Math.min(state.low, seen.order)
        else stack.push(visit(neighbor, edge))
      } else {
        stack.pop()
        const parent = stack[stack.length - 1]
        if (parent) {
          parent.low = Math.min(parent.low, state.low)
          parent.demand += state.demand
          parent.unknown += state.unknown
          if (state.low > parent.order) bridges.push(state)
        }
      }
    }
    for (const child of bridges) {
      const edge = child.parentEdge!
      const demand = child.unknown === 0 ? child.demand
        : start.unknown === child.unknown ? child.demand - start.demand
          : undefined
      const result = edge.ground ? grounds : wires
      if (demand !== undefined) {
        result[edge.id] = demand === 0 ? 0 : edge.to === child.vertex ? demand : -demand
      }
    }
  }
  return { wires, grounds }
}

export function wireFlows(circuit: Circuit, currentByBranch: Record<string, number>): Record<string, number | undefined> {
  return allFlows(circuit, currentByBranch).wires
}

export function groundFlows(circuit: Circuit, currentByBranch: Record<string, number>): Record<string, number | undefined> {
  return allFlows(circuit, currentByBranch).grounds
}

const kinds = new Set<string>([
  'resistor', 'voltage', 'current', 'switch', 'fuse', 'bulb', 'diode', 'led',
  'voltmeter', 'ammeter', 'potentiometer', 'ground',
])

function object(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`)
  }
  return value as Record<string, unknown>
}

function list(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array.`)
  return value
}

function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be finite.`)
  return value
}

function string(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new Error(`${name} must be a string.`)
  return value
}

function point(value: unknown, name: string): Point {
  const input = object(value, name)
  return { x: finite(input.x, `${name} x`), y: finite(input.y, `${name} y`) }
}

export function validateCircuit(value: unknown): Circuit {
  const input = object(value, 'Circuit')
  if (input.version !== 1) throw new Error('Unsupported circuit version.')

  const ids = new Set<string>()
  function uniqueId(value: unknown, name: string) {
    const id = string(value, `${name} ID`)
    if (!id.trim()) throw new Error(`${name} ID must not be empty.`)
    if (ids.has(id)) throw new Error(`Duplicate ID: ${id}.`)
    ids.add(id)
    return id
  }

  const components = Array.from(list(input.components, 'Components'), (entry): Component => {
    const component = object(entry, 'Component')
    const id = uniqueId(component.id, 'Component')
    const kind = string(component.kind, `Component ${id} kind`)
    if (!kinds.has(kind)) throw new Error(`Unknown component kind: ${kind}.`)
    const label = string(component.label, `Component ${id} label`)
    const rotation = finite(component.rotation, `Component ${id} rotation`)
    if (rotation % 90 !== 0) throw new Error(`Component ${id} rotation must be a multiple of 90°.`)
    const result: Component = {
      id, kind: kind as Kind, label, ...point(component, `Component ${id}`), rotation,
      value: finite(component.value, `Component ${id} value`),
    }
    if (kind !== 'voltage' && kind !== 'current' && result.value < 0) {
      throw new Error(`Component ${id} value must not be negative.`)
    }
    if (component.closed !== undefined) {
      if (typeof component.closed !== 'boolean') throw new Error(`Component ${id} closed must be a boolean.`)
      result.closed = component.closed
    }
    if (component.position !== undefined) {
      const position = finite(component.position, `Component ${id} position`)
      if (position < 0 || position > 1) throw new Error(`Component ${id} position must be between 0 and 1.`)
      result.position = position
    }
    return result
  })
  const junctions = Array.from(list(input.junctions, 'Junctions'), (entry): Junction => {
    const junction = object(entry, 'Junction')
    const id = uniqueId(junction.id, 'Junction')
    return { id, ...point(junction, `Junction ${id}`) }
  })
  const componentById = new Map(components.map((component) => [component.id, component]))
  const junctionIds = new Set(junctions.map(({ id }) => id))

  function endpoint(value: unknown): Endpoint {
    const end = object(value, 'Wire endpoint')
    if ('junction' in end) {
      if ('component' in end || 'pin' in end) throw new Error('Wire endpoint cannot be both a junction and a pin.')
      const junction = string(end.junction, 'Junction ID')
      if (!junctionIds.has(junction)) throw new Error(`Unknown junction: ${junction}.`)
      return { junction }
    }
    const id = string(end.component, 'Endpoint component ID')
    const component = componentById.get(id)
    if (!component) throw new Error(`Unknown endpoint component: ${id}.`)
    const pin = end.pin
    if ((pin !== 0 && pin !== 1) || (component.kind === 'ground' && pin !== 0)) {
      throw new Error(`Invalid pin on component ${id}.`)
    }
    return { component: id, pin }
  }

  const wires = Array.from(list(input.wires, 'Wires'), (entry): Wire => {
    const wire = object(entry, 'Wire')
    const id = uniqueId(wire.id, 'Wire')
    const from = endpoint(wire.from)
    const to = endpoint(wire.to)
    if (vertex(from) === vertex(to)) throw new Error(`Wire ${id} must join distinct endpoints.`)
    const result: Wire = { id, from, to }
    if (wire.points !== undefined) result.points = Array.from(list(wire.points, 'Waypoints'), (p) => point(p, 'Waypoint'))
    return result
  })
  return { version: 1, components, wires, junctions }
}
