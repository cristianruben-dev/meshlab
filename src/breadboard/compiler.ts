import { compile, type Circuit, type Component } from '../circuit/model'
import { examples } from '../circuit/examples'
import type { Branch } from '../engine/solver'
import { boardGuides, holeGroup, matchesGuide, railNear, type BoardShape, type Placement } from './model'
import { JUMPER_COLORS, type BoardJumper, type BoardPlacement, type BreadboardLayout } from './types'

export type BoardNet = {
  branches: Branch[]
  nodeByPin: Record<string, string>
  nodeByGroup: Record<string, string>
}

export type SocketOwner =
  | { kind: 'placement'; id: string; componentId: string; pin: number }
  | { kind: 'jumper'; id: string; end: 'from' | 'to' }

export type SocketValidation =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'occupied' | 'same-socket' | 'same-strip'; message: string }

export type BoardIssues = {
  occupiedConflicts: string[]
  sameStripIds: string[]
  outOfBoundsIds: string[]
}

const GROUND_BUS = '__ground__'
const UPPER_ROWS = ['A', 'B', 'C', 'D', 'E'] as const
const LOWER_ROWS = ['F', 'G', 'H', 'I', 'J'] as const
const RED = '#e5484d'
const BLUE = '#3b82f6'
const GREEN = '#22c55e'

function createUnionFind() {
  const parent = new Map<string, string>()
  function root(id: string): string {
    let current = id
    while (parent.has(current)) current = parent.get(current)!
    let cursor = id
    while (cursor !== current) {
      const next = parent.get(cursor)!
      parent.set(cursor, current)
      cursor = next
    }
    return current
  }
  function join(a: string, b: string) {
    const first = root(a)
    const second = root(b)
    if (first !== second) parent.set(second, first)
  }
  return { root, join }
}

function allBoardGroups(shape: BoardShape): string[] {
  const groups: string[] = []
  for (let col = 1; col <= shape.columns; col++) {
    groups.push(`upper:${col}`, `lower:${col}`)
  }
  if (shape.railLength > 0) {
    for (const row of ['T+', 'T-', 'B+', 'B-'] as const) {
      if (shape.split) groups.push(`${row}:1`, `${row}:2`)
      else groups.push(row)
    }
  }
  return groups
}

function jumperUnionFind(shape: BoardShape, jumpers: readonly BoardJumper[]) {
  const uf = createUnionFind()
  for (const jumper of jumpers) {
    const a = holeGroup(shape, jumper.from)
    const b = holeGroup(shape, jumper.to)
    if (a && b) uf.join(a, b)
  }
  return uf
}

/**
 * Compiles any free-form breadboard layout into a solver-compatible netlist (`branches`, `nodeByPin`, `nodeByGroup`).
 * Conductive strips (`upper:col`, `lower:col`) and rails (`T+`, `T-`, `B+`, `B-`, respecting `splitRails`) are joined
 * via Union-Find across every valid jumper wire, and placed ground parts bind their conductive group to node `'0'`.
 */
export function compileBoard(shape: BoardShape, components: readonly Component[], layout: BreadboardLayout): BoardNet {
  const uf = jumperUnionFind(shape, layout.jumpers)
  const componentById = new Map(components.map(c => [c.id, c]))

  for (const placement of layout.placements) {
    const component = componentById.get(placement.componentId)
    if (!component || component.kind !== 'ground') continue
    const group = placement.sockets[0] ? holeGroup(shape, placement.sockets[0]) : undefined
    if (group) uf.join(GROUND_BUS, group)
  }

  const nodeByPin: Record<string, string> = Object.create(null)
  const names = new Map<string, string>([[uf.root(GROUND_BUS), '0']])

  const placedValid: Array<{ component: Component; placement: BoardPlacement }> = []
  for (const placement of layout.placements) {
    const component = componentById.get(placement.componentId)
    if (!component) continue
    const expected = component.kind === 'ground' ? 1 : 2
    if (placement.sockets.length < expected) continue
    placedValid.push({ component, placement })
    for (let pin = 0; pin < expected; pin++) {
      const socket = placement.sockets[pin]
      const group = holeGroup(shape, socket) ?? `oob:${placement.id}:${pin}`
      const rep = uf.root(group)
      if (!names.has(rep)) names.set(rep, `n${names.size}`)
      nodeByPin[`${component.id}:${pin}`] = names.get(rep)!
    }
  }

  const nodeByGroup: Record<string, string> = Object.create(null)
  for (const group of allBoardGroups(shape)) {
    const rep = uf.root(group)
    const name = names.get(rep)
    if (name !== undefined) nodeByGroup[group] = name
  }

  const branches: Branch[] = placedValid.flatMap(({ component }): Branch[] => {
    if (component.kind === 'ground') return []
    const a = nodeByPin[`${component.id}:0`]
    const b = nodeByPin[`${component.id}:1`]
    if (!a || !b) return []
    return [{
      id: component.id,
      kind: component.kind === 'capacitor' ? 'voltmeter' : component.kind,
      value: component.value,
      a,
      b,
      ...(component.closed === undefined ? {} : { closed: component.closed }),
      ...(component.position === undefined ? {} : { position: component.position }),
    }]
  })

  return { branches, nodeByPin, nodeByGroup }
}

/**
 * Returns the electrical node ID measured at any socket on the breadboard, or undefined when the socket is
 * outside the board or not electrically connected to any placed component pin.
 */
export function probeBoardNode(
  shape: BoardShape,
  layout: BreadboardLayout,
  nodeByPin: Record<string, string>,
  socket: string,
): string | undefined {
  const target = holeGroup(shape, socket)
  if (!target) return undefined
  const uf = jumperUnionFind(shape, layout.jumpers)
  const targetRoot = uf.root(target)
  for (const placement of layout.placements) {
    for (let pin = 0; pin < placement.sockets.length; pin++) {
      const group = holeGroup(shape, placement.sockets[pin])
      if (!group) continue
      if (uf.root(group) === targetRoot) {
        const node = nodeByPin[`${placement.componentId}:${pin}`]
        if (node !== undefined) return node
      }
    }
  }
  return undefined
}

/** Map of every socket currently occupied by a placement or jumper, optionally excluding one item ID (e.g. while moving). */
export function occupiedSockets(layout: BreadboardLayout, ignoreId?: string): Map<string, SocketOwner> {
  const map = new Map<string, SocketOwner>()
  for (const placement of layout.placements) {
    if (placement.id === ignoreId || placement.componentId === ignoreId) continue
    placement.sockets.forEach((socket, pin) => {
      map.set(socket, { kind: 'placement', id: placement.id, componentId: placement.componentId, pin })
    })
  }
  for (const jumper of layout.jumpers) {
    if (jumper.id === ignoreId) continue
    map.set(jumper.from, { kind: 'jumper', id: jumper.id, end: 'from' })
    map.set(jumper.to, { kind: 'jumper', id: jumper.id, end: 'to' })
  }
  return map
}

/** Live validation for picking a socket when placing/moving a component or routing a jumper wire. */
export function validateSocketPick(
  shape: BoardShape,
  layout: BreadboardLayout,
  socket: string,
  firstSocket?: string,
  ignoreId?: string,
): SocketValidation {
  const group = holeGroup(shape, socket)
  if (!group) {
    return { ok: false, reason: 'invalid', message: 'Socket is outside this breadboard.' }
  }
  const occupied = occupiedSockets(layout, ignoreId)
  if (occupied.has(socket)) {
    return { ok: false, reason: 'occupied', message: 'This socket is already occupied.' }
  }
  if (firstSocket) {
    if (socket === firstSocket) {
      return { ok: false, reason: 'same-socket', message: 'Choose a different socket.' }
    }
    if (holeGroup(shape, firstSocket) === group) {
      return { ok: false, reason: 'same-strip', message: 'Both pins cannot share the same conductive strip.' }
    }
  }
  return { ok: true }
}

/** Detects occupied socket collisions, same-strip shorts, and out-of-bounds sockets on the current board shape. */
export function detectBoardIssues(shape: BoardShape, layout: BreadboardLayout): BoardIssues {
  const seen = new Set<string>()
  const occupiedConflicts: string[] = []
  const sameStripIds: string[] = []
  const outOfBoundsIds: string[] = []

  const checkSocket = (socket: string, itemId: string) => {
    if (seen.has(socket) && !occupiedConflicts.includes(socket)) occupiedConflicts.push(socket)
    seen.add(socket)
    if (!holeGroup(shape, socket) && !outOfBoundsIds.includes(itemId)) outOfBoundsIds.push(itemId)
  }

  for (const placement of layout.placements) {
    placement.sockets.forEach(s => checkSocket(s, placement.id))
    if (placement.sockets.length >= 2) {
      const a = holeGroup(shape, placement.sockets[0])
      const b = holeGroup(shape, placement.sockets[1])
      if (a && b && a === b) sameStripIds.push(placement.id)
    }
  }
  for (const jumper of layout.jumpers) {
    checkSocket(jumper.from, jumper.id)
    checkSocket(jumper.to, jumper.id)
    const a = holeGroup(shape, jumper.from)
    const b = holeGroup(shape, jumper.to)
    if (a && b && a === b) sameStripIds.push(jumper.id)
  }
  return { occupiedConflicts, sameStripIds, outOfBoundsIds }
}

/** Converts legacy guide `Placement[]` into a typed `BreadboardLayout`. */
export function placementsToLayout(items: readonly Placement[]): BreadboardLayout {
  const placements: BoardPlacement[] = []
  const jumpers: BoardJumper[] = []
  for (const item of items) {
    if (item.part) {
      placements.push({ id: `p:${item.id}`, componentId: item.part, sockets: [...item.sockets] })
    } else if (item.sockets.length === 2) {
      jumpers.push({ id: `j:${item.id}`, from: item.sockets[0], to: item.sockets[1], color: item.color ?? GREEN })
    }
  }
  return { placements, jumpers }
}

function equivalent(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((value, index) =>
    a.every((other, second) => (value === other) === (b[index] === b[second])))
}

function matchesExampleTopology(circuit: Circuit, exampleName: string, pins: Record<string, string>): boolean {
  const reference = examples[exampleName]
  if (!reference || reference.components.length !== circuit.components.length) return false
  if (!reference.components.every(c => circuit.components.some(p => p.id === c.id && p.kind === c.kind))) return false
  const refPins = compile(reference).nodeByPin
  const keys = reference.components.flatMap(c => c.kind === 'ground' ? [`${c.id}:0`] : [`${c.id}:0`, `${c.id}:1`])
  return keys.every(key => pins[key] !== undefined && ((pins[key] === '0') === (refPins[key] === '0'))) &&
    equivalent(keys.map(k => pins[k]), keys.map(k => refPins[k]))
}

function railBridgeJumpers(shape: BoardShape): BoardJumper[] {
  if (!shape.split) return []
  const half = shape.railLength / 2
  return [
    { id: 'j:rail-plus', from: `T+${half}`, to: `T+${half + 1}`, color: RED },
    { id: 'j:rail-minus', from: `B-${half}`, to: `B-${half + 1}`, color: BLUE },
  ]
}

function placeRcCharging(shape: BoardShape): BreadboardLayout {
  const span = 13
  const first = Math.floor((shape.columns - span) / 2) + 1
  const c = (offset: number) => first + offset
  const placements: BoardPlacement[] = []
  const jumpers: BoardJumper[] = []
  if (shape.railLength) {
    const r = railNear(shape, c(0) - 1)
    const rEnd = railNear(shape, c(11))
    const usedRail = new Set<string>()
    const pickRail = (row: 'T+' | 'B-', preferred: number) => {
      for (let d = 0; d < shape.railLength; d++) {
        for (const cand of [preferred + d, preferred - d]) {
          if (cand >= 1 && cand <= shape.railLength) {
            const key = `${row}${cand}`
            if (!usedRail.has(key)) { usedRail.add(key); return key }
          }
        }
      }
      return `${row}1`
    }
    if (shape.split) {
      const half = shape.railLength / 2
      usedRail.add(`T+${half}`); usedRail.add(`T+${half + 1}`)
      usedRail.add(`B-${half}`); usedRail.add(`B-${half + 1}`)
      jumpers.push(...railBridgeJumpers(shape))
    }
    placements.push(
      { id: 'p:V1', componentId: 'V1', sockets: [pickRail('T+', r), pickRail('B-', r)] },
      { id: 'p:GND', componentId: 'GND', sockets: [pickRail('B-', r + 3)] },
    )
    jumpers.push(
      { id: 'j:feed', from: pickRail('T+', r + 2), to: `A${c(0)}`, color: RED },
      { id: 'j:return', from: `J${c(11)}`, to: pickRail('B-', rEnd), color: BLUE },
    )
  } else {
    placements.push(
      { id: 'p:V1', componentId: 'V1', sockets: [`A${c(0)}`, `J${c(11)}`] },
      { id: 'p:GND', componentId: 'GND', sockets: [`G${c(11)}`] },
    )
  }
  placements.push(
    { id: 'p:R1', componentId: 'R1', sockets: [`C${c(0)}`, `C${c(6)}`] },
    { id: 'p:C1', componentId: 'C1', sockets: [`H${c(6)}`, `H${c(11)}`] },
  )
  jumpers.push({ id: 'j:bridge', from: `E${c(6)}`, to: `F${c(6)}`, color: GREEN })
  return { placements, jumpers }
}

function placeTwoSources(shape: BoardShape): BreadboardLayout {
  const span = 15
  const first = Math.floor((shape.columns - span) / 2) + 1
  const c = (offset: number) => first + offset
  const placements: BoardPlacement[] = []
  const jumpers: BoardJumper[] = []
  if (shape.railLength) {
    const rLeft = railNear(shape, c(0))
    const rRight = Math.min(shape.railLength, Math.max(rLeft + 4, railNear(shape, c(12))))
    const rMid = Math.min(shape.railLength, Math.max(rLeft + 2, railNear(shape, c(6))))
    const usedRail = new Set<string>()
    const pickRail = (row: 'T+' | 'B-', preferred: number) => {
      for (let d = 0; d < shape.railLength; d++) {
        for (const cand of [preferred + d, preferred - d]) {
          if (cand >= 1 && cand <= shape.railLength) {
            const key = `${row}${cand}`
            if (!usedRail.has(key)) { usedRail.add(key); return key }
          }
        }
      }
      return `${row}1`
    }
    if (shape.split) {
      const half = shape.railLength / 2
      usedRail.add(`T+${half}`); usedRail.add(`T+${half + 1}`)
      usedRail.add(`B-${half}`); usedRail.add(`B-${half + 1}`)
      jumpers.push(...railBridgeJumpers(shape))
    }
    const v1Plus = pickRail('T+', rLeft)
    const feed1 = pickRail('T+', rLeft + 2)
    const v1Minus = pickRail('B-', rLeft)
    const gndHole = pickRail('B-', rMid)
    const v2Minus = pickRail('B-', rRight)
    const retHole = pickRail('B-', rRight - 2)
    placements.push(
      { id: 'p:V1', componentId: 'V1', sockets: [v1Plus, v1Minus] },
      { id: 'p:V2', componentId: 'V2', sockets: [`A${c(12)}`, v2Minus] },
      { id: 'p:GND', componentId: 'GND', sockets: [gndHole] },
    )
    jumpers.push(
      { id: 'j:feed', from: feed1, to: `A${c(0)}`, color: RED },
      { id: 'j:return', from: `J${c(12)}`, to: retHole, color: BLUE },
    )
  } else {
    placements.push(
      { id: 'p:V1', componentId: 'V1', sockets: [`A${c(0)}`, `J${c(12)}`] },
      { id: 'p:V2', componentId: 'V2', sockets: [`A${c(12)}`, `I${c(12)}`] },
      { id: 'p:GND', componentId: 'GND', sockets: [`G${c(12)}`] },
    )
  }
  placements.push(
    { id: 'p:R1', componentId: 'R1', sockets: [`C${c(0)}`, `C${c(6)}`] },
    { id: 'p:R2', componentId: 'R2', sockets: [`B${c(12)}`, `B${c(6)}`] },
    { id: 'p:R3', componentId: 'R3', sockets: [`H${c(6)}`, `H${c(12)}`] },
  )
  jumpers.push({ id: 'j:bridge', from: `E${c(6)}`, to: `F${c(6)}`, color: GREEN })
  return { placements, jumpers }
}

function placeWheatstoneBridge(shape: BoardShape): BreadboardLayout {
  const span = 14
  const first = Math.floor((shape.columns - span) / 2) + 1
  const c = (offset: number) => first + offset
  const placements: BoardPlacement[] = []
  const jumpers: BoardJumper[] = []
  if (shape.railLength) {
    const rLeft = railNear(shape, c(0))
    const rRight = Math.min(shape.railLength, Math.max(rLeft + 4, railNear(shape, c(13))))
    const usedRail = new Set<string>()
    const pickRail = (row: 'T+' | 'B-', preferred: number) => {
      for (let d = 0; d < shape.railLength; d++) {
        for (const cand of [preferred + d, preferred - d]) {
          if (cand >= 1 && cand <= shape.railLength) {
            const key = `${row}${cand}`
            if (!usedRail.has(key)) { usedRail.add(key); return key }
          }
        }
      }
      return `${row}1`
    }
    if (shape.split) {
      const half = shape.railLength / 2
      usedRail.add(`T+${half}`); usedRail.add(`T+${half + 1}`)
      usedRail.add(`B-${half}`); usedRail.add(`B-${half + 1}`)
      jumpers.push(...railBridgeJumpers(shape))
    }
    placements.push(
      { id: 'p:V1', componentId: 'V1', sockets: [pickRail('T+', rLeft), pickRail('B-', rLeft)] },
      { id: 'p:GND', componentId: 'GND', sockets: [pickRail('B-', rLeft + 3)] },
    )
    jumpers.push(
      { id: 'j:feed', from: pickRail('T+', rLeft + 2), to: `A${c(0)}`, color: RED },
      { id: 'j:return', from: `J${c(13)}`, to: pickRail('B-', rRight), color: BLUE },
    )
  } else {
    placements.push(
      { id: 'p:V1', componentId: 'V1', sockets: [`A${c(0)}`, `J${c(13)}`] },
      { id: 'p:GND', componentId: 'GND', sockets: [`I${c(13)}`] },
    )
  }
  placements.push(
    { id: 'p:R1', componentId: 'R1', sockets: [`B${c(0)}`, `B${c(4)}`] },
    { id: 'p:R3', componentId: 'R3', sockets: [`D${c(0)}`, `D${c(9)}`] },
    { id: 'p:R5', componentId: 'R5', sockets: [`C${c(4)}`, `C${c(9)}`] },
    { id: 'p:R2', componentId: 'R2', sockets: [`H${c(4)}`, `H${c(13)}`] },
    { id: 'p:R4', componentId: 'R4', sockets: [`G${c(9)}`, `G${c(13)}`] },
  )
  jumpers.push(
    { id: 'j:bridge-left', from: `E${c(4)}`, to: `F${c(4)}`, color: GREEN },
    { id: 'j:bridge-right', from: `E${c(9)}`, to: `F${c(9)}`, color: '#f97316' },
  )
  return { placements, jumpers }
}

/**
 * Generates a collision-free, electrically equivalent breadboard layout for ANY circuit on any board shape.
 * Uses clean textbook layouts for all 5 built-in examples and a general strip/jumper allocator for arbitrary circuits.
 */
export function autoPlaceCircuit(circuit: Circuit, shape: BoardShape): BreadboardLayout {
  if (!circuit.components.length) return { placements: [], jumpers: [] }
  const { nodeByPin } = compile(circuit)

  const guide = matchesGuide(circuit, nodeByPin)
  if (guide) return placementsToLayout(guide.place(shape))
  if (matchesExampleTopology(circuit, 'RC Charging', nodeByPin)) return placeRcCharging(shape)
  if (matchesExampleTopology(circuit, 'Two Sources', nodeByPin)) return placeTwoSources(shape)
  if (matchesExampleTopology(circuit, 'Wheatstone Bridge', nodeByPin)) return placeWheatstoneBridge(shape)

  return autoPlaceGeneral(circuit, shape, nodeByPin)
}

type StripSpec = { half: 'upper' | 'lower'; col: number; sockets: string[] }

function autoPlaceGeneral(circuit: Circuit, shape: BoardShape, nodeByPin: Record<string, string>): BreadboardLayout {
  // Collect pins grouped by schematic node.
  const nodePins = new Map<string, Array<{ componentId: string; pin: 0 | 1 }>>()
  const adj = new Map<string, Set<string>>()
  const ensureNode = (n: string) => {
    if (!nodePins.has(n)) nodePins.set(n, [])
    if (!adj.has(n)) adj.set(n, new Set())
  }

  for (const component of circuit.components) {
    if (component.kind === 'ground') {
      const n = nodeByPin[`${component.id}:0`] ?? '0'
      ensureNode(n)
      nodePins.get(n)!.push({ componentId: component.id, pin: 0 })
    } else {
      const a = nodeByPin[`${component.id}:0`]
      const b = nodeByPin[`${component.id}:1`]
      ensureNode(a); ensureNode(b)
      nodePins.get(a)!.push({ componentId: component.id, pin: 0 })
      nodePins.get(b)!.push({ componentId: component.id, pin: 1 })
      if (a !== b) {
        adj.get(a)!.add(b)
        adj.get(b)!.add(a)
      }
    }
  }

  // Detect any self-loop component (both pins on the exact same node in schematic) so we can give it 2 chained strips.
  const selfLoopNodes = new Set<string>()
  for (const component of circuit.components) {
    if (component.kind !== 'ground' && nodeByPin[`${component.id}:0`] === nodeByPin[`${component.id}:1`]) {
      selfLoopNodes.add(nodeByPin[`${component.id}:0`])
    }
  }

  const jumpers: BoardJumper[] = []
  const usedSockets = new Set<string>()
  const nodeSocketPools = new Map<string, { strips: string[][]; cursor: number }>()

  // Reserve rail bridges on split full boards for ground rail if ground exists.
  const hasRails = shape.railLength > 0
  let jumperSeq = 1
  const addJumper = (from: string, to: string, color: string) => {
    usedSockets.add(from)
    usedSockets.add(to)
    jumpers.push({ id: `j:auto-${jumperSeq++}`, from, to, color })
  }

  // Allocate ground on B- rail when rails exist and ground has no self-loop.
  const groundOnRail = hasRails && nodePins.has('0') && !selfLoopNodes.has('0')
  if (groundOnRail) {
    const railHoles: string[] = []
    if (shape.split) {
      const half = shape.railLength / 2
      addJumper(`B-${half}`, `B-${half + 1}`, BLUE)
    }
    for (let i = 1; i <= shape.railLength; i++) {
      const hole = `B-${i}`
      if (!usedSockets.has(hole)) railHoles.push(hole)
    }
    nodeSocketPools.set('0', { strips: [railHoles], cursor: 0 })
  }

  // Order remaining nodes with BFS starting from sources so connected components stay close together.
  const remainingNodes = [...nodePins.keys()].filter(n => !(groundOnRail && n === '0'))
  const orderedNodes: string[] = []
  const visited = new Set<string>()
  const seeds = circuit.components
    .filter(c => c.kind === 'voltage' || c.kind === 'current')
    .map(c => nodeByPin[`${c.id}:0`])
    .filter(n => remainingNodes.includes(n))
  const queue = [...new Set([...seeds, ...remainingNodes])]
  for (const start of queue) {
    if (visited.has(start)) continue
    const bfs = [start]
    visited.add(start)
    while (bfs.length) {
      const curr = bfs.shift()!
      orderedNodes.push(curr)
      for (const next of adj.get(curr) ?? []) {
        if (!visited.has(next) && remainingNodes.includes(next)) {
          visited.add(next)
          bfs.push(next)
        }
      }
    }
  }

  // Compute how many terminal strips each node needs (each strip holds 5 sockets; chaining reserves 1-2 sockets).
  const stripsNeeded = (node: string) => {
    const count = nodePins.get(node)?.length ?? 0
    const minStrips = selfLoopNodes.has(node) ? 2 : 1
    if (count <= 5) return minStrips
    // First and last strips hold 4 pins each; middle strips hold 3 pins each.
    const extra = Math.max(0, count - 8)
    return Math.max(minStrips, 2 + Math.ceil(extra / 3))
  }

  const totalStripsNeeded = orderedNodes.reduce((sum, n) => sum + stripsNeeded(n), 0)
  // Build available strip slots across upper and lower halves, spaced nicely when there is room.
  const allSlots: StripSpec[] = []
  const useOnlyUpper = totalStripsNeeded <= shape.columns
  const step = useOnlyUpper
    ? (totalStripsNeeded <= 1 ? 1 : Math.max(1, Math.min(4, Math.floor((shape.columns - 1) / Math.max(1, totalStripsNeeded - 1)))))
    : (totalStripsNeeded <= 2 ? 1 : Math.max(1, Math.min(3, Math.floor((shape.columns - 1) / Math.max(1, Math.ceil(totalStripsNeeded / 2) - 1)))))

  if (useOnlyUpper) {
    const usedSpan = (totalStripsNeeded - 1) * step + 1
    const startCol = Math.max(1, Math.floor((shape.columns - usedSpan) / 2) + 1)
    for (let i = 0; i < totalStripsNeeded && startCol + i * step <= shape.columns; i++) {
      const col = startCol + i * step
      allSlots.push({ half: 'upper', col, sockets: UPPER_ROWS.map(r => `${r}${col}`) })
    }
    // Fallback if rounding overshot
    for (let col = 1; col <= shape.columns && allSlots.length < totalStripsNeeded; col++) {
      if (!allSlots.some(s => s.half === 'upper' && s.col === col)) {
        allSlots.push({ half: 'upper', col, sockets: UPPER_ROWS.map(r => `${r}${col}`) })
      }
    }
  } else {
    const colsNeeded = Math.ceil(totalStripsNeeded / 2)
    const usedSpan = (colsNeeded - 1) * step + 1
    const startCol = Math.max(1, Math.floor((shape.columns - usedSpan) / 2) + 1)
    for (let i = 0; i < colsNeeded && startCol + i * step <= shape.columns; i++) {
      const col = startCol + i * step
      allSlots.push({ half: 'upper', col, sockets: UPPER_ROWS.map(r => `${r}${col}`) })
      allSlots.push({ half: 'lower', col, sockets: LOWER_ROWS.map(r => `${r}${col}`) })
    }
    for (let col = 1; col <= shape.columns && allSlots.length < totalStripsNeeded; col++) {
      for (const [half, rows] of [['upper', UPPER_ROWS], ['lower', LOWER_ROWS]] as const) {
        if (!allSlots.some(s => s.half === half && s.col === col)) {
          allSlots.push({ half, col, sockets: rows.map(r => `${r}${col}`) })
        }
      }
    }
  }

  let slotIndex = 0
  let colorIndex = 0
  const jumperPalette = JUMPER_COLORS.filter(c => c.id !== 'white' && c.id !== 'black').map(c => c.hex)
  for (const node of orderedNodes) {
    const count = stripsNeeded(node)
    const assigned = allSlots.slice(slotIndex, slotIndex + count)
    slotIndex += assigned.length
    if (!assigned.length) continue
    const strips = assigned.map(s => [...s.sockets])
    const color = node === '0' ? BLUE : jumperPalette[colorIndex++ % jumperPalette.length]
    for (let i = 0; i < strips.length - 1; i++) {
      // Chain strip i -> strip i+1 using their innermost socket (E/F or bottom of strip).
      const from = strips[i].pop()!
      const to = strips[i + 1].shift()!
      addJumper(from, to, color)
    }
    nodeSocketPools.set(node, { strips, cursor: 0 })
  }

  // Pick a free socket for a node; when avoiding a specific strip (e.g. self-loop), pick from another strip.
  function takeSocket(node: string, avoidGroup?: string): string | undefined {
    const pool = nodeSocketPools.get(node)
    if (!pool) return undefined
    for (let attempt = 0; attempt < pool.strips.length; attempt++) {
      const idx = (pool.cursor + attempt) % pool.strips.length
      const strip = pool.strips[idx]
      const holeIndex = strip.findIndex(h => !usedSockets.has(h) && (!avoidGroup || holeGroup(shape, h) !== avoidGroup))
      if (holeIndex !== -1) {
        const [hole] = strip.splice(holeIndex, 1)
        usedSockets.add(hole)
        pool.cursor = (idx + 1) % pool.strips.length
        return hole
      }
    }
    return undefined
  }

  const placements: BoardPlacement[] = []
  for (const component of circuit.components) {
    if (component.kind === 'ground') {
      const hole = takeSocket(nodeByPin[`${component.id}:0`] ?? '0')
      if (hole) placements.push({ id: `p:${component.id}`, componentId: component.id, sockets: [hole] })
    } else {
      const aNode = nodeByPin[`${component.id}:0`]
      const bNode = nodeByPin[`${component.id}:1`]
      const holeA = takeSocket(aNode)
      if (!holeA) continue
      const holeB = takeSocket(bNode, holeGroup(shape, holeA))
      if (!holeB) continue
      placements.push({ id: `p:${component.id}`, componentId: component.id, sockets: [holeA, holeB] })
    }
  }

  return { placements, jumpers }
}
