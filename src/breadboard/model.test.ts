import { expect, it } from 'vitest'
import { compile } from '../circuit/model'
import { examples } from '../circuit/examples'
import { boardGuides, holeGroup, matchesGuide, populated, probeNode, validateStep, verifyBoard } from './model'

it('isolates both halves and all four power rails', () => {
  expect(holeGroup('A10')).toBe(holeGroup('E10'))
  expect(holeGroup('F10')).toBe(holeGroup('J10'))
  expect(holeGroup('E10')).not.toBe(holeGroup('F10'))
  expect(holeGroup('E10')).not.toBe(holeGroup('E11'))
  expect(holeGroup('T+1')).toBe(holeGroup('T+20'))
  expect(new Set(['T+1', 'T-1', 'B+1', 'B-1'].map(holeGroup)).size).toBe(4)
  expect(holeGroup('A21')).toBeUndefined()
})

it('validates both complete mounts against electrical nodes instead of coordinates', () => {
  for (const guide of boardGuides) {
    const circuit = examples[guide.example]
    const pins = compile(circuit).nodeByPin
    expect(verifyBoard(guide, populated(guide), pins)).toBe(true)
    expect(verifyBoard(guide, {}, pins)).toBe(false)
    expect(probeNode(guide, populated(guide), pins, 'T+20')).toBe(pins['V1:0'])
    expect(probeNode(guide, populated(guide), pins, 'B-20')).toBe('0')
    expect(probeNode(guide, populated(guide), pins, 'T-10')).toBeUndefined()
  }
})

it('rejects duplicate sockets, same-strip shorts and the wrong side of the gap', () => {
  const guide = boardGuides[0]
  expect(validateStep(guide.steps.find(step => step.part === 'R1')!, ['B4', 'C4'], {})).toBe('same-strip')
  const step = guide.steps.find(step => step.part === 'R2')!
  expect(validateStep(step, ['E10', 'H17'], {})).toBe('wrong-strip')
  expect(validateStep(step, ['H10', 'H17'], { other: ['H10'] })).toBe('occupied')
  expect(validateStep(step, ['J10', 'J17'], {})).toBeUndefined()
  const circuit = examples[guide.example]
  const pins = compile(circuit).nodeByPin
  const misplaced = { ...populated(guide), R2: ['H10', 'J10'] }
  expect(verifyBoard(guide, misplaced, pins)).toBe(false)
  expect(probeNode(guide, misplaced, pins, 'H10')).toBeUndefined()
})

it('recognizes geometric and value edits but not incompatible netlists', () => {
  const circuit = structuredClone(examples['Voltage Divider'])
  expect(matchesGuide(circuit)?.example).toBe('Voltage Divider')
  circuit.components.find(c => c.id === 'R2')!.value = 4000
  circuit.components[0].rotation = 0
  expect(matchesGuide(circuit)?.example).toBe('Voltage Divider')
  circuit.wires.pop()
  expect(matchesGuide(circuit)).toBeUndefined()
})
