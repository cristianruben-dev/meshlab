import { describe, expect, it } from 'vitest'
import { compile } from '../circuit/model'
import { examples } from '../circuit/examples'
import { boardGuides, boardShape, holeGroup, matchesGuide, probeNode, tiePoints, verifyBoard } from './model'
import type { BoardSettings, BoardSize } from './settings'

const settings = (size: BoardSize, rails = true, splitRails = false): BoardSettings => ({ size, rails, splitRails, labels: true })
const combinations = (['mini', 'half', 'full'] as const).flatMap(size =>
  [true, false].flatMap(rails => [false, true].map(split => settings(size, rails, split))))

describe('board sizes', () => {
  it('counts the standard tie points of each size', () => {
    expect(tiePoints(boardShape(settings('mini')))).toBe(170)
    expect(tiePoints(boardShape(settings('half')))).toBe(400)
    expect(tiePoints(boardShape(settings('full')))).toBe(830)
    expect(tiePoints(boardShape(settings('full', true, true)))).toBe(830)
    expect(tiePoints(boardShape(settings('half', false)))).toBe(300)
    expect(tiePoints(boardShape(settings('full', false)))).toBe(630)
  })

  it('only splits rails on full boards that have rails', () => {
    expect(boardShape(settings('mini', true, true))).toMatchObject({ columns: 17, railLength: 0, split: false })
    expect(boardShape(settings('half', true, true))).toMatchObject({ columns: 30, railLength: 25, split: false })
    expect(boardShape(settings('full', true, true))).toMatchObject({ columns: 63, railLength: 50, split: true })
    expect(boardShape(settings('full', false, true))).toMatchObject({ railLength: 0, split: false })
  })
})

describe('socket groups', () => {
  it('isolates both halves of every column and keeps four separate rails', () => {
    const half = boardShape(settings('half'))
    expect(holeGroup(half, 'A10')).toBe(holeGroup(half, 'E10'))
    expect(holeGroup(half, 'F10')).toBe(holeGroup(half, 'J10'))
    expect(holeGroup(half, 'E10')).not.toBe(holeGroup(half, 'F10'))
    expect(holeGroup(half, 'E10')).not.toBe(holeGroup(half, 'E11'))
    expect(holeGroup(half, 'T+1')).toBe(holeGroup(half, 'T+25'))
    expect(new Set(['T+1', 'T-1', 'B+1', 'B-1'].map(hole => holeGroup(half, hole))).size).toBe(4)
    expect(holeGroup(half, 'A31')).toBeUndefined()
    expect(holeGroup(half, 'T+26')).toBeUndefined()
    expect(holeGroup(half, 'K1')).toBeUndefined()
  })

  it('has no rails on a mini board or when rails are turned off', () => {
    const mini = boardShape(settings('mini'))
    expect(holeGroup(mini, 'J17')).toBeDefined()
    expect(holeGroup(mini, 'A18')).toBeUndefined()
    expect(holeGroup(mini, 'T+1')).toBeUndefined()
    expect(holeGroup(boardShape(settings('half', false)), 'B-1')).toBeUndefined()
  })

  it('splits each full-size rail in the middle only when requested', () => {
    const split = boardShape(settings('full', true, true))
    expect(holeGroup(split, 'T+1')).toBe(holeGroup(split, 'T+25'))
    expect(holeGroup(split, 'T+26')).toBe(holeGroup(split, 'T+50'))
    expect(holeGroup(split, 'T+25')).not.toBe(holeGroup(split, 'T+26'))
    const continuous = boardShape(settings('full'))
    expect(holeGroup(continuous, 'B-1')).toBe(holeGroup(continuous, 'B-50'))
  })
})

describe('reference layouts', () => {
  it.each(combinations)('match both schematics on %o', value => {
    const shape = boardShape(value)
    for (const guide of boardGuides) {
      const pins = compile(examples[guide.example]).nodeByPin
      const placements = guide.place(shape)
      const sockets = placements.flatMap(item => item.sockets)
      expect(sockets.every(hole => holeGroup(shape, hole))).toBe(true)
      expect(new Set(sockets).size).toBe(sockets.length)
      expect(verifyBoard(shape, placements, pins)).toBe(true)
      const supply = placements.find(item => item.part === 'V1')!
      expect(probeNode(shape, placements, pins, supply.sockets[0])).toBe(pins['V1:0'])
      expect(probeNode(shape, placements, pins, supply.sockets[1])).toBe('0')
      if (shape.railLength) {
        expect(probeNode(shape, placements, pins, 'T-1')).toBeUndefined()
        expect(probeNode(shape, placements, pins, `B-${shape.railLength}`)).toBe('0')
      }
    }
  })

  it('rejects a layout that disagrees with the schematic', () => {
    const shape = boardShape(settings('half'))
    const guide = boardGuides.find(item => item.example === 'Voltage Divider')!
    const pins = compile(examples[guide.example]).nodeByPin
    const placements = guide.place(shape)
    const r2 = placements.find(item => item.part === 'R2')!
    const misplaced = placements.map(item => item === r2 ? { ...item, sockets: [r2.sockets[0], r2.sockets[0].replace('H', 'J')] } : item)
    expect(verifyBoard(shape, misplaced, pins)).toBe(false)
    expect(probeNode(shape, misplaced, pins, r2.sockets[0])).toBeUndefined()
    const duplicated = placements.map(item => item === r2 ? { ...item, sockets: [r2.sockets[0], r2.sockets[0]] } : item)
    expect(verifyBoard(shape, duplicated, pins)).toBe(false)
  })

  it('recognizes geometric and value edits but not incompatible netlists', () => {
    const circuit = structuredClone(examples['Voltage Divider'])
    expect(matchesGuide(circuit)?.example).toBe('Voltage Divider')
    circuit.components.find(c => c.id === 'R2')!.value = 4000
    circuit.components[0].rotation = 0
    expect(matchesGuide(circuit)?.example).toBe('Voltage Divider')
    circuit.wires.pop()
    expect(matchesGuide(circuit)).toBeUndefined()
    expect(matchesGuide(structuredClone(examples['LED + Switch']))?.example).toBe('LED + Switch')
  })
})
