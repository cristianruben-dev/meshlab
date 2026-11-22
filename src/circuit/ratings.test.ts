import { expect, it } from 'vitest'
import { ratingsExceeded } from './ratings'
import { validateCircuit, type Component } from './model'

const led: Component = { id: 'd', kind: 'led', label: 'D1', x: 0, y: 0, rotation: 0, value: 2 }

it('checks current magnitude, absorbed power, inclusive limits, and default LED rating', () => {
  const reading = { d: { voltage: -2, current: -.03, power: .06 } }
  expect(ratingsExceeded([led], reading)).toEqual([{ id: 'd', quantity: 'current', actual: .03, limit: .02 }])
  expect(ratingsExceeded([{ ...led, maxCurrent: .03, maxPower: .05 }], reading)).toEqual([
    { id: 'd', quantity: 'power', actual: .06, limit: .05 },
  ])
  expect(ratingsExceeded([{ ...led, maxCurrent: 0, maxPower: .05 }], { d: { ...reading.d, power: -.06 } })).toEqual([])
})

it('preserves nonnegative ratings when importing version 1 and rejects invalid ratings', () => {
  const circuit = { version: 1, components: [{ ...led, maxCurrent: .05, maxPower: .1 }], wires: [], junctions: [] }
  expect(validateCircuit(circuit)).toEqual(circuit)
  expect(() => validateCircuit({ ...circuit, components: [{ ...led, maxCurrent: -1 }] })).toThrow(/current/i)
})
