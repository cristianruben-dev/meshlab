import { compile, type Circuit } from '../circuit/model'
import { examples } from '../circuit/examples'

export const ROWS = ['T+', 'T-', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'B+', 'B-'] as const
export const COLUMNS = 20
export type BoardStep = { id: string; part?: string; label: string; sockets: string[]; color: string }
export type Guide = { example: string; steps: BoardStep[] }
export type Assembly = Record<string, string[]>
export type PlacementIssue = 'incomplete' | 'occupied' | 'same-strip' | 'wrong-strip'

const part = (id: string, label: string, sockets: string[]): BoardStep => ({ id, part: id, label, sockets, color: '#da9f57' })
const jumper = (id: string, label: string, sockets: string[], color: string): BoardStep => ({ id, label, sockets, color })
const supply = () => part('V1', 'Power supply', ['T+2', 'B-2'])
const ground = () => part('GND', 'Ground reference', ['B-4'])
const positive = () => jumper('feed', 'Positive jumper', ['T+4', 'A4'], '#f77c83')
const bridge = (a: string, b: string) => jumper('bridge', 'Bridge the center gap', [a, b], '#36c99d')
const returnLead = (column: number) => jumper('return', 'Return jumper', [`J${column}`, `B-${column}`], '#619eff')

export const boardGuides: Guide[] = [
  { example: 'Voltage Divider', steps: [
    supply(), ground(), positive(), part('R1', 'Upper resistor', ['C4', 'C10']), bridge('E10', 'F10'),
    part('R2', 'Lower resistor', ['H10', 'H17']), returnLead(17),
  ] },
  { example: 'LED + Switch', steps: [
    supply(), ground(), positive(), part('S1', 'Switch module', ['C4', 'C7']),
    part('R1', 'Series resistor', ['E7', 'E12']), bridge('D12', 'G12'),
    part('D1', 'LED (anode first)', ['H12', 'H14']), returnLead(14),
  ] },
]

export function holeGroup(hole: string) {
  const match = /^(T[+-]|B[+-]|[A-J])([1-9]\d*)$/.exec(hole)
  if (!match || Number(match[2]) > COLUMNS) return undefined
  return match[1].length === 2 ? match[1] : `${match[1] <= 'E' ? 'upper' : 'lower'}:${match[2]}`
}

export function populated(guide: Guide): Assembly {
  return Object.fromEntries(guide.steps.map(step => [step.id, [...step.sockets]]))
}

export function validateStep(step: BoardStep, chosen: string[], assembly: Assembly): PlacementIssue | undefined {
  if (chosen.length !== step.sockets.length) return 'incomplete'
  const used = new Set(Object.entries(assembly).filter(([id]) => id !== step.id).flatMap(([, holes]) => holes))
  if (new Set(chosen).size !== chosen.length || chosen.some(hole => used.has(hole))) return 'occupied'
  const groups = chosen.map(holeGroup)
  if (groups.length === 2 && groups[0] && groups[0] === groups[1]) return 'same-strip'
  if (groups.some((group, index) => !group || group !== holeGroup(step.sockets[index]))) return 'wrong-strip'
}

type Pins = Record<string, string>
function groupRoots(guide: Guide, assembly: Assembly) {
  const roots = new Map<string, string>()
  function root(group: string): string {
    const parent = roots.get(group)
    return parent ? root(parent) : group
  }
  for (const step of guide.steps) {
    const holes = assembly[step.id]
    if (step.part || !holes || holes.length !== 2) continue
    const a = holeGroup(holes[0]), b = holeGroup(holes[1])
    if (a && b && root(a) !== root(b)) roots.set(root(a), root(b))
  }
  return root
}

function socketsWithPins(guide: Guide, assembly: Assembly) {
  return guide.steps.flatMap(step => step.part
    ? (assembly[step.id] ?? []).map((hole, index) => ({ hole, pin: `${step.part}:${index}` }))
    : [])
}

function equivalent(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((value, index) =>
    a.every((other, second) => (value === other) === (b[index] === b[second])))
}

export function verifyBoard(guide: Guide, assembly: Assembly, pins: Pins): boolean {
  if (guide.steps.some(step => validateStep(step, assembly[step.id] ?? [], assembly))) return false
  const sockets = socketsWithPins(guide, assembly)
  const root = groupRoots(guide, assembly)
  return sockets.every(({ pin }) => pins[pin] !== undefined) &&
    equivalent(sockets.map(({ hole }) => root(holeGroup(hole)!)), sockets.map(({ pin }) => pins[pin]))
}

export function probeNode(guide: Guide, assembly: Assembly, pins: Pins, hole: string) {
  const group = holeGroup(hole)
  if (!group || !verifyBoard(guide, assembly, pins)) return undefined
  const root = groupRoots(guide, assembly)
  const match = socketsWithPins(guide, assembly).find(socket => root(holeGroup(socket.hole)!) === root(group))
  return match && pins[match.pin]
}

export function matchesGuide(circuit: Circuit, pins = compile(circuit).nodeByPin) {
  return boardGuides.find(guide => {
    const original = examples[guide.example]
    if (original.components.length !== circuit.components.length ||
      !original.components.every(c => circuit.components.some(p => c.id === p.id && c.kind === p.kind))) return false
    const current = socketsWithPins(guide, populated(guide)).map(({ pin }) => pin)
    const reference = compile(original).nodeByPin
    return current.every(pin => pins[pin] !== undefined && ((pins[pin] === '0') === (reference[pin] === '0'))) &&
      equivalent(current.map(pin => pins[pin]), current.map(pin => reference[pin]))
  })
}
