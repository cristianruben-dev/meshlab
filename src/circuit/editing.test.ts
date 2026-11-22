import { expect, it } from 'vitest'
import { examples } from './examples'
import { copyBlock, pasteBlock, offsetWireSegment } from './editing'
import { compile, route, validateCircuit } from './model'

it('duplicates a connected subgraph without wiring it back to the original', () => {
  const circuit = examples['Voltage Divider']
  const block = copyBlock(circuit, ['R1', 'R2'])
  expect(block.components.map(c => c.id)).toEqual(['R1', 'R2'])
  expect(block.junctions.map(j => j.id)).toEqual(['output'])
  expect(block.wires).toHaveLength(2)
  let serial = 0
  const copied = pasteBlock(circuit, block, () => `copy-${++serial}`)
  expect(() => validateCircuit(copied.circuit)).not.toThrow()
  expect(copied.selected).toHaveLength(2)
  for (const wire of copied.circuit.wires.slice(circuit.wires.length)) {
    expect([wire.from, wire.to].every(e => 'component' in e ? copied.selected.includes(e.component) : e.junction.startsWith('copy-'))).toBe(true)
  }
})

it('moves a wire run without changing endpoints or netlist', () => {
  const circuit = examples['Voltage Divider']
  const wire = circuit.wires[0]
  const moved = offsetWireSegment(circuit, wire, 0, { x: 40, y: 0 })
  expect(moved).not.toBe(wire)
  expect(moved.from).toEqual(wire.from)
  expect(moved.to).toEqual(wire.to)
  const next = { ...circuit, wires: [moved, ...circuit.wires.slice(1)] }
  expect(compile(next)).toEqual(compile(circuit))
  const points = route(next, moved)
  expect(points.some(p => p.x === 220)).toBe(true)
  expect(points.every((p, i) => !i || p.x === points[i - 1].x || p.y === points[i - 1].y)).toBe(true)
})

it('preserves ratings and all connections when duplicating a complete RC example', () => {
  const circuit = structuredClone(examples['RC Charging'])
  circuit.components.find(c => c.id === 'C1')!.maxCurrent = .05
  let serial = 0
  const block = copyBlock(circuit, circuit.components.map(c => c.id))
  const next = pasteBlock(circuit, block, () => `copy-${++serial}`).circuit
  expect(next.wires).toHaveLength(circuit.wires.length * 2)
  expect(next.components.find(c => c.label === 'C1-2')?.maxCurrent).toBe(.05)
  expect(validateCircuit(next)).toEqual(next)
  expect(next.wires.slice(circuit.wires.length).every(w =>
    [w.from, w.to].every(e => ('component' in e ? e.component : e.junction).startsWith('copy-')),
  )).toBe(true)
})
