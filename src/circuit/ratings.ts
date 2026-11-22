import type { BranchReading } from '../engine/solver'
import type { Component } from './model'

export type RatingAlert = { id: string; quantity: 'current' | 'power'; actual: number; limit: number }

export const currentLimit = (component: Component) =>
  component.maxCurrent ?? (component.kind === 'led' ? 0.02 : 0)

export function ratingsExceeded(components: Component[], readings: Record<string, BranchReading>): RatingAlert[] {
  return components.flatMap(component => {
    const reading = readings[component.id]
    if (!reading) return []
    const checks = [
      { quantity: 'current' as const, actual: Math.abs(reading.current), limit: currentLimit(component) },
      { quantity: 'power' as const, actual: reading.power, limit: component.maxPower ?? 0 },
    ]
    return checks.filter(({ actual, limit }) => limit > 0 && actual > limit * (1 + 1e-10))
      .map(check => ({ ...check, id: component.id }))
  })
}
