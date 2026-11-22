import { describe, expect, it } from 'vitest'
import { hole, layout, nearestSocket, resistorBands } from './geometry'

const [black, brown, red, , yellow, , , violet] = ['#1d1d1f', '#7b4a24', '#d1372c', '#ee7a1c', '#f1c232', '#2f9a4a', '#2d62c8', '#7a43b6']
const gold = '#c9a23a'

describe('breadboard geometry', () => {
  it('places every socket once with unique coordinates', () => {
    expect(layout).toHaveLength(14 * 20)
    expect(new Set(layout.map(p => `${p.x},${p.y}`)).size).toBe(layout.length)
    expect(hole('A1')).toMatchObject({ x: 104, y: 151 })
    expect(hole('J20')).toMatchObject({ x: 104 + 19 * 29, y: 340 })
  })

  it('encodes resistor values with the standard four-band color code', () => {
    expect(resistorBands(1000)).toEqual([brown, black, red, gold])
    expect(resistorBands(2000)).toEqual([red, black, red, gold])
    expect(resistorBands(220)).toEqual([red, red, brown, gold])
    expect(resistorBands(4.7)).toEqual([yellow, violet, gold, gold])
    expect(resistorBands(999)).toEqual([brown, black, red, gold])
  })

  it('resolves a 3D pick point to the nearest socket within reach', () => {
    const h10 = hole('H10')
    expect(nearestSocket(h10.x + 4, h10.y - 3)).toBe('H10')
    expect(nearestSocket(h10.x + 14.5, h10.y)).toBeUndefined()
    expect(nearestSocket(10, 10)).toBeUndefined()
  })
})
