import { compile, type Circuit } from '../circuit/model'
import { examples } from '../circuit/examples'
import type { BoardSettings } from './settings'

export const TERMINAL_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const
export const RAIL_ROWS = ['T+', 'T-', 'B+', 'B-'] as const

/** Physical layout of one board: terminal columns and sockets per power rail (0 when the board has no rails). */
export type BoardShape = { columns: number; railLength: number; split: boolean }
/** One mounted part (with `part`) or jumper wire (without it); sockets follow the part's pin order. */
export type Placement = { id: string; part?: string; sockets: string[]; color?: string }
export type Guide = { example: string; place: (shape: BoardShape) => Placement[] }
type Pins = Record<string, string>

export function boardShape({ size, rails, splitRails }: BoardSettings): BoardShape {
  if (size === 'mini') return { columns: 17, railLength: 0, split: false }
  if (size === 'half') return { columns: 30, railLength: rails ? 25 : 0, split: false }
  return { columns: 63, railLength: rails ? 50 : 0, split: rails && splitRails }
}

export const tiePoints = (shape: BoardShape) => shape.columns * TERMINAL_ROWS.length + RAIL_ROWS.length * shape.railLength
export const boardRows = (shape: BoardShape): string[] =>
  shape.railLength ? ['T+', 'T-', ...TERMINAL_ROWS, 'B+', 'B-'] : [...TERMINAL_ROWS]

/** Horizontal position of a rail socket, in pitches from column 1. Rails come in groups of five, centered on the columns. */
export function railPosition(shape: BoardShape, index: number) {
  const offset = (i: number) => Math.floor((i - 1) / 5) * 6 + (i - 1) % 5 + (shape.split && i > shape.railLength / 2 ? 1 : 0)
  return offset(index) + (shape.columns - 1 - offset(shape.railLength)) / 2
}

/** Rail socket closest to a terminal column. */
export function railNear(shape: BoardShape, column: number) {
  let best = 1
  for (let i = 2; i <= shape.railLength; i++)
    if (Math.abs(railPosition(shape, i) - (column - 1)) < Math.abs(railPosition(shape, best) - (column - 1))) best = i
  return best
}

/** Conductive group of a socket, or undefined when the socket does not exist on this board. */
export function holeGroup(shape: BoardShape, hole: string) {
  const match = /^(T[+-]|B[+-]|[A-J])([1-9]\d*)$/.exec(hole)
  if (!match) return undefined
  const [, row, text] = match, index = Number(text)
  if (row.length === 2) {
    if (index > shape.railLength) return undefined
    return shape.split ? `${row}:${index > shape.railLength / 2 ? 2 : 1}` : row
  }
  if (index > shape.columns) return undefined
  return `${row <= 'E' ? 'upper' : 'lower'}:${index}`
}

const part = (id: string, ...sockets: string[]): Placement => ({ id, part: id, sockets })
const jumper = (id: string, color: string, ...sockets: string[]): Placement => ({ id, color, sockets })
const red = '#f77c83', green = '#36c99d', blue = '#619eff'

/** Centers a layout `span` columns wide and wires its supply either to the rails or straight into the strips. */
function layout(span: number, build: (column: (offset: number) => number, power: Power) => Placement[]) {
  return (shape: BoardShape) => {
    const first = Math.floor((shape.columns - span) / 2) + 1
    const column = (offset: number) => first + offset
    const placements = build(column, shape.railLength ? railPower(shape) : stripPower)
    if (shape.split) {
      const half = shape.railLength / 2
      placements.push(jumper('rail-plus', red, `T+${half}`, `T+${half + 1}`), jumper('rail-minus', blue, `B-${half}`, `B-${half + 1}`))
    }
    return placements
  }
}

/** Connects the supply to the first column (upper strip) and the return column (lower strip). */
type Power = (first: number, last: number) => Placement[]
/** Supply and ground on the rails, with a feed jumper to the first column and a return jumper to the negative rail. */
const railPower = (shape: BoardShape): Power => (first, last) => {
  const rail = railNear(shape, first - 1)
  return [
    part('V1', `T+${rail}`, `B-${rail}`), part('GND', `B-${rail + 3}`), jumper('feed', red, `T+${rail + 2}`, `A${first}`),
    jumper('return', blue, `J${last}`, `B-${railNear(shape, last)}`),
  ]
}
/** Without rails, the supply leads and ground go straight into the strips of the first and return columns. */
const stripPower: Power = (first, last) => [part('V1', `A${first}`, `J${last}`), part('GND', `G${last}`)]

/** Assembled reference layouts; each one is generated for the chosen board. */
export const boardGuides: Guide[] = [
  { example: 'Voltage Divider', place: layout(15, (c, power) => [
    ...power(c(0), c(13)), part('R1', `C${c(0)}`, `C${c(6)}`), jumper('bridge', green, `E${c(6)}`, `F${c(6)}`),
    part('R2', `H${c(6)}`, `H${c(13)}`),
  ]) },
  { example: 'LED + Switch', place: layout(13, (c, power) => [
    ...power(c(0), c(10)), part('S1', `C${c(0)}`, `C${c(3)}`), part('R1', `E${c(3)}`, `E${c(8)}`),
    jumper('bridge', green, `D${c(8)}`, `G${c(8)}`), part('D1', `H${c(8)}`, `H${c(10)}`),
  ]) },
]

function groupRoots(shape: BoardShape, placements: Placement[]) {
  const roots = new Map<string, string>()
  function root(group: string): string {
    const parent = roots.get(group)
    return parent ? root(parent) : group
  }
  for (const item of placements) {
    if (item.part || item.sockets.length !== 2) continue
    const a = holeGroup(shape, item.sockets[0]), b = holeGroup(shape, item.sockets[1])
    if (a && b && root(a) !== root(b)) roots.set(root(a), root(b))
  }
  return root
}

const partSockets = (placements: Placement[]) =>
  placements.flatMap(item => item.part ? item.sockets.map((hole, index) => ({ hole, pin: `${item.part}:${index}` })) : [])

function equivalent(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((value, index) =>
    a.every((other, second) => (value === other) === (b[index] === b[second])))
}

/** True when every socket exists and is used once, and the board's conductive groups match the schematic's nodes. */
export function verifyBoard(shape: BoardShape, placements: Placement[], pins: Pins): boolean {
  const holes = placements.flatMap(item => item.sockets)
  if (new Set(holes).size !== holes.length || holes.some(hole => !holeGroup(shape, hole))) return false
  const sockets = partSockets(placements)
  const root = groupRoots(shape, placements)
  return sockets.every(({ pin }) => pins[pin] !== undefined) &&
    equivalent(sockets.map(({ hole }) => root(holeGroup(shape, hole)!)), sockets.map(({ pin }) => pins[pin]))
}

/** Circuit node measured at a socket, or undefined when nothing connects to it or the layout is invalid. */
export function probeNode(shape: BoardShape, placements: Placement[], pins: Pins, hole: string) {
  const group = holeGroup(shape, hole)
  if (!group || !verifyBoard(shape, placements, pins)) return undefined
  const root = groupRoots(shape, placements)
  const match = partSockets(placements).find(socket => root(holeGroup(shape, socket.hole)!) === root(group))
  return match && pins[match.pin]
}

const referenceShape: BoardShape = { columns: 30, railLength: 25, split: false }
/** Guide whose example has the same parts and node structure as the circuit (positions and values may differ). */
export function matchesGuide(circuit: Circuit, pins = compile(circuit).nodeByPin) {
  return boardGuides.find(guide => {
    const original = examples[guide.example]
    if (original.components.length !== circuit.components.length ||
      !original.components.every(c => circuit.components.some(p => c.id === p.id && c.kind === p.kind))) return false
    const current = partSockets(guide.place(referenceShape)).map(({ pin }) => pin)
    const reference = compile(original).nodeByPin
    return current.every(pin => pins[pin] !== undefined && ((pins[pin] === '0') === (reference[pin] === '0'))) &&
      equivalent(current.map(pin => pins[pin]), current.map(pin => reference[pin]))
  })
}
