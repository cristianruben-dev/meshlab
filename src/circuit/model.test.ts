import { describe, expect, it } from 'vitest'
import { stepTransient } from '../engine/transient'
import { solve } from '../engine/solver'
import { examples } from './examples'
import {
  compile, transientBranches, groundFlows, route, terminal, validateCircuit, wireFlows,
  type Circuit, type Component, type Endpoint, type Wire,
} from './model'

const pin = (component: string, number: 0 | 1 = 0): Endpoint => ({ component, pin: number })
const junction = (id: string): Endpoint => ({ junction: id })
const component = (
  id: string, kind: Component['kind'], x = 0, y = 0, rotation = 0,
): Component => ({ id, kind, label: id, value: 100, x, y, rotation })
const wire = (id: string, from: Endpoint, to: Endpoint): Wire => ({ id, from, to })
const circuit = (components: Circuit['components'], wires: Wire[], junctions: Circuit['junctions'] = []): Circuit =>
  ({ version: 1, components, wires, junctions })

describe('circuit topology', () => {
  it('rotates terminals and keeps routes orthogonal when endpoints move around fixed waypoints', () => {
    const first = component('R1', 'resistor', 200, 120, 90)
    const second = component('R2', 'resistor', 440, 180, 180)
    const connection = { ...wire('w1', pin('R1', 1), pin('R2')), points: [{ x: 320, y: 200 }] }
    const model = circuit([first, second], [connection])
    expect(terminal(first, 0)).toEqual({ x: 200, y: 80 })
    expect(terminal(component('g', 'ground', 200, 120, 270), 0)).toEqual({ x: 200, y: 160 })
    const points = route(model, connection)
    expect(points[0]).toEqual({ x: 200, y: 160 })
    expect(points.at(-1)).toEqual({ x: 480, y: 180 })
    expect(points).toContainEqual({ x: 320, y: 200 })
    expect(points.slice(1).every((p, i) => p.x === points[i].x || p.y === points[i].y)).toBe(true)
  })

  it('joins T branches and ground references by identity without joining crossing wires', () => {
    const model = circuit([
      component('V', 'voltage', 120, 120), component('R1', 'resistor', 320, 120),
      component('R2', 'resistor', 220, 60, 90), component('R3', 'resistor', 220, 260, 90),
      component('g1', 'ground'), component('g2', 'ground'),
    ], [
      wire('left', pin('V'), junction('t')),
      wire('right', junction('t'), pin('R1')),
      wire('tee', junction('t'), pin('R2', 1)),
      wire('cross', pin('R2'), pin('R3')),
      wire('ground-v', pin('V', 1), pin('g1')),
      wire('ground-r', pin('R1', 1), pin('g2')),
    ], [{ id: 't', x: 200, y: 120 }])
    const compiled = compile(model)
    expect(compiled.nodeByPin['V:0']).toBe(compiled.nodeByPin['R1:0'])
    expect(compiled.nodeByPin['V:0']).toBe(compiled.nodeByPin['R2:1'])
    expect(compiled.nodeByPin['R2:0']).toBe(compiled.nodeByPin['R3:0'])
    expect(compiled.nodeByPin['R2:0']).not.toBe(compiled.nodeByPin['V:0'])
    expect(compiled.nodeByPin['V:1']).toBe('0')
    expect(compiled.nodeByPin['R1:1']).toBe('0')
    expect(compiled.branches.map(({ id }) => id)).toEqual(['V', 'R1', 'R2', 'R3'])
  })

  it('uses KCL for signed branch, common-wire, and shared ground returns', () => {
    const model = circuit([
      component('V', 'voltage'), component('R1', 'resistor'), component('R2', 'resistor'),
      component('g1', 'ground'), component('g2', 'ground'),
    ], [
      wire('common', pin('V'), junction('split')),
      wire('backward', pin('R1'), junction('split')),
      wire('forward', junction('split'), pin('R2')),
      wire('return1', pin('R1', 1), junction('return')),
      wire('return2', pin('R2', 1), junction('return')),
      wire('sink', junction('return'), pin('g2')),
      wire('source', pin('g1'), pin('V', 1)),
    ], [{ id: 'split', x: 20, y: 20 }, { id: 'return', x: 40, y: 40 }])
    const currents = { V: -3, R1: 2, R2: 1 }
    expect(wireFlows(model, currents)).toEqual({
      common: 3, backward: -2, forward: 1, return1: 2, return2: 1, sink: 3, source: 3,
    })
    expect(groundFlows(model, currents)).toEqual({ g1: -3, g2: 3 })
  })

  it('leaves ideal wire cycle currents unknown while finding a bridge attached to the cycle', () => {
    const model = circuit([
      component('V', 'voltage'), component('R', 'resistor'),
    ], [
      wire('a', pin('V'), junction('top')), wire('b', junction('top'), pin('R')),
      wire('parallel', pin('V'), pin('R')), wire('return', pin('R', 1), pin('V', 1)),
      wire('load', junction('top'), pin('R2')),
    ], [{ id: 'top', x: 100, y: 100 }])
    model.components.push(component('R2', 'resistor'))
    expect(wireFlows(model, { V: -2, R: 1, R2: 1 })).toEqual({
      a: undefined, b: undefined, parallel: undefined, return: 2, load: 1,
    })
  })

  it('rejects unsupported JSON versions, invalid pins, nonfinite values, and duplicate IDs', () => {
    const model = circuit([component('g', 'ground'), component('R', 'resistor')], [
      wire('w', pin('g'), pin('R')),
    ])
    expect(validateCircuit(JSON.parse(JSON.stringify(model)))).toEqual(model)
    expect(() => validateCircuit({ ...model, version: 2 })).toThrow(/version/i)
    expect(() => validateCircuit({ ...model, wires: [wire('w', pin('g', 1), pin('R'))] })).toThrow(/pin/i)
    expect(() => validateCircuit({ ...model, wires: [wire('w', junction('missing'), pin('R'))] })).toThrow(/junction/i)
    expect(() => validateCircuit({ ...model, components: [component('g', 'ground'), component('g', 'resistor')] })).toThrow(/duplicate/i)
    expect(() => validateCircuit({ ...model, components: [{ ...model.components[0], x: Infinity }] })).toThrow(/finite/i)
    expect(() => validateCircuit({ ...model, components: [model.components[0], { ...model.components[1], value: -1 }] })).toThrow(/value/i)
  })

  it('round trips four named example circuits and solves their expected operating points', () => {
    expect(Object.keys(examples)).toEqual(['Voltage Divider', 'Wheatstone Bridge', 'Two Sources', 'LED + Switch', 'RC Charging'])
    for (const example of Object.values(examples)) {
      expect(validateCircuit(JSON.parse(JSON.stringify(example)))).toEqual(example)
      const { branches, nodeByPin } = compile(example)
      expect(solve(branches)).toMatchObject({ ok: true })
      expect(Object.values(nodeByPin)).toContain('0')
      expect(example.components.every((c) => example.wires.some(({ from, to }) =>
        ('component' in from && from.component === c.id) || ('component' in to && to.component === c.id)))).toBe(true)
    }
    const divider = solve(compile(examples['Voltage Divider']).branches)
    const bridge = solve(compile(examples['Wheatstone Bridge']).branches)
    const twoSources = solve(compile(examples['Two Sources']).branches)
    const led = solve(compile(examples['LED + Switch']).branches)
    if (!divider.ok || !bridge.ok || !twoSources.ok || !led.ok) throw new Error('Example did not solve.')
    expect(divider.branches.R2.voltage).toBeCloseTo(8)
    expect(bridge.branches.R5.current).toBeCloseTo(0, 12)
    expect(twoSources.branches.R3.voltage).toBeCloseTo(6)
    expect(led.branches.D1.current).toBeCloseTo(3 / 331, 7)
  })

  it('validates optional breadboard layouts while remaining backward compatible with v1 circuits', () => {
    const base = circuit(
      [component('V1', 'voltage'), component('R1', 'resistor'), component('GND', 'ground')],
      [],
    )
    const legacy = validateCircuit(JSON.parse(JSON.stringify(base)))
    expect(legacy).toEqual(base)
    expect('breadboard' in legacy).toBe(false)

    const withBoard: Circuit = {
      ...base,
      breadboard: {
        placements: [
          { id: 'p1', componentId: 'V1', sockets: ['T+1', 'B-1'] },
          { id: 'p2', componentId: 'R1', sockets: ['C5', 'C10'] },
          { id: 'p3', componentId: 'GND', sockets: ['B-3'] },
        ],
        jumpers: [
          { id: 'j1', from: 'T+2', to: 'A5', color: '#e5484d' },
          { id: 'j2', from: 'A10', to: 'B-5', color: '#3b82f6' },
        ],
      },
    }
    expect(validateCircuit(JSON.parse(JSON.stringify(withBoard)))).toEqual(withBoard)

    expect(() => validateCircuit({
      ...base,
      breadboard: { placements: [{ id: 'p1', componentId: 'MISSING', sockets: ['A1', 'A2'] }], jumpers: [] },
    })).toThrow(/unknown breadboard component/i)
    expect(() => validateCircuit({
      ...base,
      breadboard: { placements: [{ id: 'p1', componentId: 'GND', sockets: ['A1', 'A2'] }], jumpers: [] },
    })).toThrow(/1 socket/i)
    expect(() => validateCircuit({
      ...base,
      breadboard: { placements: [{ id: 'p1', componentId: 'R1', sockets: ['A1'] }], jumpers: [] },
    })).toThrow(/2 sockets/i)
    expect(() => validateCircuit({
      ...base,
      breadboard: { placements: [{ id: 'p1', componentId: 'R1', sockets: ['Z99', 'A2'] }], jumpers: [] },
    })).toThrow(/invalid breadboard socket/i)
    expect(() => validateCircuit({
      ...base,
      breadboard: {
        placements: [{ id: 'p1', componentId: 'R1', sockets: ['A1', 'A2'] }],
        jumpers: [{ id: 'j1', from: 'A1', to: 'B3', color: '#e5484d' }],
      },
    })).toThrow(/duplicate breadboard socket/i)
    expect(() => validateCircuit({
      ...base,
      breadboard: {
        placements: [],
        jumpers: [{ id: 'j1', from: 'A1', to: 'B3', color: '   ' }],
      },
    })).toThrow(/color/i)
  })
})

it('charges and discharges the RC example through the public compiler', () => {
  const circuit = examples['RC Charging']
  const branches = transientBranches(circuit, compile(circuit).branches)
  let previous: Record<string, number> = {}
  for (let i = 0; i < 50; i++) {
    const result = stepTransient(branches, .02, previous)
    if (!result.ok) throw new Error(result.error)
    previous = { C1: result.branches.C1.voltage }
  }
  expect(previous.C1).toBeCloseTo(5 * (1 - (1 / 1.02) ** 50), 9)
  const off = branches.map(b => b.kind === 'voltage' ? { ...b, value: 0 } : b)
  const discharge = stepTransient(off, .02, previous)
  if (!discharge.ok) throw new Error(discharge.error)
  expect(discharge.branches.C1.voltage).toBeCloseTo(previous.C1 / 1.02, 9)
  expect(discharge.branches.C1.current).toBeLessThan(0)
})
