import { describe, expect, it } from 'vitest'
import { compile, transientBranches, type Circuit, type Component, type Kind } from '../circuit/model'
import { examples } from '../circuit/examples'
import { solve } from '../engine/solver'
import { stepTransient } from '../engine/transient'
import { autoPlaceCircuit, compileBoard, detectBoardIssues, probeBoardNode, validateSocketPick } from './compiler'
import { boardShape, holeGroup } from './model'
import type { BoardSettings, BoardSize } from './settings'
import type { BreadboardLayout } from './types'

const settings = (size: BoardSize, rails = true, splitRails = false): BoardSettings => ({ size, rails, splitRails, labels: true })
const part = (id: string, kind: Kind, value: number, extra: Partial<Component> = {}): Component => ({
  id, kind, label: id, value, x: 0, y: 0, rotation: 0, ...extra,
})

describe('compileBoard', () => {
  it('compiles free-form strips, jumpers, and split rails accurately', () => {
    const split = boardShape(settings('full', true, true))
    const components: Component[] = [
      part('V1', 'voltage', 10),
      part('R1', 'resistor', 1000),
      part('R2', 'resistor', 1000),
      part('GND', 'ground', 0),
    ]
    // Without bridging the split T+ rail, R1 on the right half is disconnected from V1 on the left half.
    const unbridged: BreadboardLayout = {
      placements: [
        { id: 'p1', componentId: 'V1', sockets: ['T+5', 'B-5'] },
        { id: 'p2', componentId: 'GND', sockets: ['B-6'] },
        { id: 'p3', componentId: 'R1', sockets: ['A40', 'A45'] },
        { id: 'p4', componentId: 'R2', sockets: ['B45', 'B50'] },
      ],
      jumpers: [
        { id: 'j1', from: 'T+40', to: 'C40', color: '#e5484d' },
        { id: 'j2', from: 'C50', to: 'B-40', color: '#3b82f6' },
      ],
    }
    const unbridgedNet = compileBoard(split, components, unbridged)
    expect(unbridgedNet.nodeByPin['V1:0']).not.toBe(unbridgedNet.nodeByPin['R1:0'])
    expect(solve(unbridgedNet.branches).ok).toBe(false)

    // Adding rail bridges across T+25..T+26 and B-25..B-26 completes the 10 V divider (5 V midpoint).
    const bridged: BreadboardLayout = {
      ...unbridged,
      jumpers: [
        ...unbridged.jumpers,
        { id: 'j3', from: 'T+25', to: 'T+26', color: '#e5484d' },
        { id: 'j4', from: 'B-25', to: 'B-26', color: '#3b82f6' },
      ],
    }
    const net = compileBoard(split, components, bridged)
    const result = solve(net.branches)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.branches.R1.voltage).toBeCloseTo(5)
    expect(result.branches.R2.voltage).toBeCloseTo(5)
    expect(probeBoardNode(split, bridged, net.nodeByPin, 'E45')).toBe(net.nodeByPin['R2:0'])
    expect(result.nodes[probeBoardNode(split, bridged, net.nodeByPin, 'E45')!]).toBeCloseTo(5)
    expect(probeBoardNode(split, bridged, net.nodeByPin, 'T+49')).toBe(net.nodeByPin['V1:0'])
    expect(probeBoardNode(split, bridged, net.nodeByPin, 'B-49')).toBe('0')
    expect(probeBoardNode(split, bridged, net.nodeByPin, 'T-10')).toBeUndefined()
  })

  it('compiles and solves all 13 component types mounted on one breadboard', () => {
    const full = boardShape(settings('full'))
    const components: Component[] = [
      part('V1', 'voltage', 12),
      part('I1', 'current', 0.01),
      part('GND', 'ground', 0),
      part('R1', 'resistor', 1000),
      part('C1', 'capacitor', 0.001),
      part('RV1', 'potentiometer', 2000, { position: 0.5 }),
      part('SW1', 'switch', 0, { closed: true }),
      part('F1', 'fuse', 10.0),
      part('L1', 'bulb', 120),
      part('D1', 'diode', 0.7),
      part('LED1', 'led', 2.0),
      part('VM1', 'voltmeter', 0),
      part('AM1', 'ammeter', 0),
    ]
    // Chain V1 -> SW1 -> F1 -> AM1 -> (parallel loads R1, RV1, L1, C1, VM1, D1->LED1) -> GND, plus I1 feeding the bus.
    const layout: BreadboardLayout = {
      placements: [
        { id: 'pV', componentId: 'V1', sockets: ['T+1', 'B-1'] },
        { id: 'pG', componentId: 'GND', sockets: ['B-2'] },
        { id: 'pSW', componentId: 'SW1', sockets: ['A2', 'A5'] },
        { id: 'pF', componentId: 'F1', sockets: ['B5', 'B8'] },
        { id: 'pAM', componentId: 'AM1', sockets: ['C8', 'C12'] },
        { id: 'pR', componentId: 'R1', sockets: ['A12', 'F12'] },
        { id: 'pRV', componentId: 'RV1', sockets: ['B12', 'G12'] },
        { id: 'pL', componentId: 'L1', sockets: ['A15', 'F15'] },
        { id: 'pC', componentId: 'C1', sockets: ['B15', 'G15'] },
        { id: 'pVM', componentId: 'VM1', sockets: ['C15', 'H15'] },
        { id: 'pD', componentId: 'D1', sockets: ['A18', 'A21'] },
        { id: 'pLED', componentId: 'LED1', sockets: ['B21', 'F21'] },
        { id: 'pI', componentId: 'I1', sockets: ['F18', 'B18'] },
      ],
      jumpers: [
        { id: 'jFeed', from: 'T+2', to: 'B2', color: '#e5484d' },
        { id: 'jBus1', from: 'D12', to: 'D15', color: '#22c55e' },
        { id: 'jBus2', from: 'E15', to: 'E18', color: '#22c55e' },
        { id: 'jGnd1', from: 'J12', to: 'B-12', color: '#3b82f6' },
        { id: 'jGnd2', from: 'J15', to: 'B-15', color: '#3b82f6' },
        { id: 'jGnd3', from: 'J18', to: 'B-18', color: '#3b82f6' },
        { id: 'jGnd4', from: 'J21', to: 'B-21', color: '#3b82f6' },
      ],
    }
    expect(detectBoardIssues(full, layout)).toEqual({ occupiedConflicts: [], sameStripIds: [], outOfBoundsIds: [] })
    const net = compileBoard(full, components, layout)
    expect(net.branches).toHaveLength(12)
    const result = solve(net.branches)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.branches.VM1.voltage).toBeCloseTo(12, 4)
    expect(result.branches.R1.current).toBeCloseTo(0.012, 4)
    expect(result.branches.RV1.current).toBeCloseTo(0.012, 4)
    expect(result.branches.L1.power).toBeCloseTo(1.2, 4)
    expect(result.branches.LED1.current).toBeGreaterThan(0)
    expect(result.branches.AM1.current).toBeGreaterThan(0)

    // Lowering the fuse limit to 0.05 A trips F1 cleanly through the solver.
    const lowFuse = components.map(c => c.id === 'F1' ? { ...c, value: 0.05 } : c)
    const trippedResult = solve(compileBoard(full, lowFuse, layout).branches)
    expect(trippedResult.ok).toBe(true)
    if (!trippedResult.ok) throw new Error(trippedResult.error)
    expect(trippedResult.warnings.some(w => /Fuse F1 tripped/.test(w))).toBe(true)
  })

  it('simulates RC transient charging and discharging directly from a breadboard layout', () => {
    const shape = boardShape(settings('half'))
    const circuit = examples['RC Charging']
    const layout = autoPlaceCircuit(circuit, shape)
    const net = compileBoard(shape, circuit.components, layout)
    const dynamic = transientBranches(circuit, net.branches)
    let previous: Record<string, number> = {}
    for (let i = 0; i < 50; i++) {
      const step = stepTransient(dynamic, 0.02, previous)
      if (!step.ok) throw new Error(step.error)
      previous = { C1: step.branches.C1.voltage }
    }
    expect(previous.C1).toBeCloseTo(5 * (1 - (1 / 1.02) ** 50), 9)
  })
})

describe('validateSocketPick & detectBoardIssues', () => {
  const half = boardShape(settings('half'))
  const layout: BreadboardLayout = {
    placements: [{ id: 'p1', componentId: 'R1', sockets: ['C5', 'C10'] }],
    jumpers: [{ id: 'j1', from: 'A5', to: 'T+4', color: '#e5484d' }],
  }

  it('rejects invalid, occupied, duplicate, and same-strip socket picks', () => {
    expect(validateSocketPick(half, layout, 'A99')).toMatchObject({ ok: false, reason: 'invalid' })
    expect(validateSocketPick(half, layout, 'C5')).toMatchObject({ ok: false, reason: 'occupied' })
    expect(validateSocketPick(half, layout, 'T+4')).toMatchObject({ ok: false, reason: 'occupied' })
    expect(validateSocketPick(half, layout, 'D5', 'D5')).toMatchObject({ ok: false, reason: 'same-socket' })
    expect(validateSocketPick(half, layout, 'D5', 'B5')).toMatchObject({ ok: false, reason: 'same-strip' })
    expect(validateSocketPick(half, layout, 'F5', 'B5')).toEqual({ ok: true })
    // Moving R1 ignores its own previously occupied sockets.
    expect(validateSocketPick(half, layout, 'C5', undefined, 'p1')).toEqual({ ok: true })
  })

  it('reports occupied conflicts, same-strip shorts, and out-of-bounds sockets', () => {
    const mini = boardShape(settings('mini'))
    const broken: BreadboardLayout = {
      placements: [
        { id: 'p1', componentId: 'R1', sockets: ['A2', 'E2'] }, // same strip
        { id: 'p2', componentId: 'R2', sockets: ['A2', 'A25'] }, // occupied A2 + out-of-bounds A25
      ],
      jumpers: [
        { id: 'j1', from: 'F3', to: 'J3', color: '#22c55e' }, // same strip
      ],
    }
    const issues = detectBoardIssues(mini, broken)
    expect(issues.occupiedConflicts).toEqual(['A2'])
    expect(issues.sameStripIds).toEqual(['p1', 'j1'])
    expect(issues.outOfBoundsIds).toEqual(['p2'])
  })
})

describe('autoPlaceCircuit', () => {
  const shapes = [
    boardShape(settings('mini')),
    boardShape(settings('half')),
    boardShape(settings('half', false)),
    boardShape(settings('full')),
    boardShape(settings('full', true, true)),
  ]

  it('auto-places all 5 built-in examples cleanly with matching electrical solutions on every board size', () => {
    for (const [name, circuit] of Object.entries(examples)) {
      const expected = solve(compile(circuit).branches)
      if (!expected.ok) throw new Error(`Example ${name} did not solve`)
      for (const shape of shapes) {
        const layout = autoPlaceCircuit(circuit, shape)
        expect(layout.placements).toHaveLength(circuit.components.length)
        expect(detectBoardIssues(shape, layout)).toEqual({ occupiedConflicts: [], sameStripIds: [], outOfBoundsIds: [] })
        const net = compileBoard(shape, circuit.components, layout)
        const actual = solve(net.branches)
        expect(actual.ok, `${name} on cols=${shape.columns} rails=${shape.railLength} split=${shape.split}`).toBe(true)
        if (!actual.ok) throw new Error(actual.error)
        for (const [id, reading] of Object.entries(expected.branches)) {
          expect(actual.branches[id].voltage).toBeCloseTo(reading.voltage, 6)
          expect(actual.branches[id].current).toBeCloseTo(reading.current, 6)
        }
      }
    }
  })

  it('auto-places arbitrary custom circuits including high-degree nodes that chain multiple strips', () => {
    // 6 resistors in parallel across V1 -> 7 pins on node n1 (requires chaining two strips with a jumper!).
    const circuit: Circuit = {
      version: 1,
      components: [
        part('V1', 'voltage', 12),
        part('GND', 'ground', 0),
        ...Array.from({ length: 6 }, (_, i) => part(`R${i + 1}`, 'resistor', 1200)),
      ],
      junctions: [{ id: 'top', x: 0, y: 0 }, { id: 'bot', x: 0, y: 100 }],
      wires: [
        { id: 'wV0', from: { component: 'V1', pin: 0 }, to: { junction: 'top' } },
        { id: 'wV1', from: { component: 'V1', pin: 1 }, to: { junction: 'bot' } },
        { id: 'wG', from: { component: 'GND', pin: 0 }, to: { junction: 'bot' } },
        ...Array.from({ length: 6 }, (_, i) => ([
          { id: `wT${i}`, from: { component: `R${i + 1}`, pin: 0 as const }, to: { junction: 'top' } },
          { id: `wB${i}`, from: { component: `R${i + 1}`, pin: 1 as const }, to: { junction: 'bot' } },
        ])).flat(),
      ],
    }
    const shape = boardShape(settings('half'))
    const layout = autoPlaceCircuit(circuit, shape)
    expect(layout.placements).toHaveLength(circuit.components.length)
    expect(detectBoardIssues(shape, layout)).toEqual({ occupiedConflicts: [], sameStripIds: [], outOfBoundsIds: [] })
    const net = compileBoard(shape, circuit.components, layout)
    const result = solve(net.branches)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    for (let i = 1; i <= 6; i++) {
      expect(result.branches[`R${i}`].current).toBeCloseTo(0.01, 6)
    }
    expect(result.branches.V1.current).toBeCloseTo(-0.06, 6)
    // Verify all sockets belong to the board
    for (const p of layout.placements) {
      for (const s of p.sockets) expect(holeGroup(shape, s)).toBeDefined()
    }
  })

  it('returns an empty layout for a blank circuit', () => {
    const empty: Circuit = { version: 1, components: [], wires: [], junctions: [] }
    expect(autoPlaceCircuit(empty, boardShape(settings('half')))).toEqual({ placements: [], jumpers: [] })
  })
})
