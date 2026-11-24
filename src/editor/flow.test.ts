import { describe, expect, it } from 'vitest'
import { flowSpeed } from './flow'

describe('current-flow dot speed', () => {
  it('grows with the square root of the current, 60 px/s at 1 mA', () => {
    expect(flowSpeed(1e-3, 1, false)).toBeCloseTo(60)
    expect(flowSpeed(4e-3, 1, false)).toBeCloseTo(120)
    expect(flowSpeed(.25e-3, 1, false)).toBeCloseTo(30)
  })

  it('scales with the animation speed setting and follows the current direction', () => {
    expect(flowSpeed(1e-3, 2, false)).toBeCloseTo(120)
    expect(flowSpeed(-1e-3, 1, false)).toBeCloseTo(-60)
    expect(flowSpeed(1e-3, 1, true)).toBeCloseTo(-60)
  })

  it('keeps tiny currents visibly moving, caps large ones, and stops at zero', () => {
    expect(flowSpeed(1e-7, 1, false)).toBe(4)
    expect(flowSpeed(5, 1, false)).toBe(320)
    expect(flowSpeed(0, 1, false)).toBe(0)
    expect(flowSpeed(undefined, 1, false)).toBe(0)
  })
})
