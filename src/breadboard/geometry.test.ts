import { describe, expect, it } from 'vitest'
import { boardGeometry, PITCH, resistorBands } from './geometry'
import { boardShape } from './model'
import type { BoardSize } from './settings'

const [black, brown, red, , yellow, , , violet] = ['#1d1d1f', '#7b4a24', '#d1372c', '#ee7a1c', '#f1c232', '#2f9a4a', '#2d62c8', '#7a43b6']
const gold = '#c9a23a'
const geometry = (size: BoardSize, rails = true, splitRails = false) => boardGeometry(boardShape({ size, rails, splitRails, labels: true }))

describe('breadboard geometry', () => {
  it.each([['mini', 170], ['half', 400], ['full', 830]] as const)('places all %s sockets once at unique coordinates', (size, count) => {
    const board = geometry(size)
    expect(board.sockets).toHaveLength(count)
    expect(new Set(board.sockets.map(p => `${p.x},${p.y}`)).size).toBe(count)
    expect(board.sockets.every(p => p.x > 0 && p.x < board.width && p.y > 0 && p.y < board.height)).toBe(true)
  })

  it('grows the board with its columns and drops the rail bands without rails', () => {
    const [mini, half, full] = [geometry('mini'), geometry('half'), geometry('full')]
    expect(mini.width).toBeLessThan(half.width)
    expect(half.width).toBeLessThan(full.width)
    expect(full.hole('A63')!.x - full.hole('A1')!.x).toBe(62 * PITCH)
    expect(mini.height).toBeLessThan(half.height)
    expect(geometry('half', false).height).toBe(mini.height)
    expect(geometry('half', false).hole('T+1')).toBeUndefined()
  })

  it('resolves a 3D pick point to the nearest socket within reach', () => {
    const board = geometry('half')
    const h10 = board.hole('H10')!
    expect(board.nearestSocket(h10.x + 4, h10.y - 3)).toBe('H10')
    expect(board.nearestSocket(h10.x + PITCH / 2, h10.y + PITCH / 2)).toBeUndefined()
    expect(board.nearestSocket(1, 1)).toBeUndefined()
  })

  it('moves the keyboard cursor between neighbouring sockets and stops at the edges', () => {
    const board = geometry('half')
    expect(board.move('H10', 'ArrowRight')).toBe('H11')
    expect(board.move('H10', 'ArrowUp')).toBe('G10')
    expect(board.move('E10', 'ArrowDown')).toBe('F10')
    expect(board.move('A1', 'ArrowLeft')).toBe('A1')
    expect(board.move('A30', 'ArrowRight')).toBe('A30')
    expect(board.move('A1', 'ArrowUp')).toMatch(/^T-\d+$/)
    expect(board.move('T+1', 'ArrowUp')).toBe('T+1')
    expect(board.move('J30', 'ArrowDown')).toMatch(/^B\+\d+$/)
    expect(geometry('mini').move('A1', 'ArrowUp')).toBe('A1')
  })

  it('encodes resistor values with the standard four-band color code', () => {
    expect(resistorBands(1000)).toEqual([brown, black, red, gold])
    expect(resistorBands(2000)).toEqual([red, black, red, gold])
    expect(resistorBands(220)).toEqual([red, red, brown, gold])
    expect(resistorBands(4.7)).toEqual([yellow, violet, gold, gold])
    expect(resistorBands(999)).toEqual([brown, black, red, gold])
  })
})
