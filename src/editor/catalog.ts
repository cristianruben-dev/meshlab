import type { Kind } from '../circuit/model'

export const catalog: Record<Kind, { name: string; prefix: string; value: number; unit: string; group: string }> = {
  voltage: { name: 'DC Voltage', prefix: 'V', value: 12, unit: 'V', group: 'Sources' },
  current: { name: 'DC Current', prefix: 'I', value: .01, unit: 'A', group: 'Sources' },
  ground: { name: 'Ground', prefix: 'GND', value: 0, unit: '', group: 'Sources' },
  resistor: { name: 'Resistor', prefix: 'R', value: 1000, unit: 'Ω', group: 'Passive & control' },
  potentiometer: { name: 'Potentiometer', prefix: 'RV', value: 10000, unit: 'Ω', group: 'Passive & control' },
  switch: { name: 'SPST Switch', prefix: 'SW', value: 0, unit: '', group: 'Passive & control' },
  fuse: { name: 'Fuse', prefix: 'F', value: .1, unit: 'A', group: 'Passive & control' },
  bulb: { name: 'Bulb', prefix: 'L', value: 120, unit: 'Ω', group: 'Indicators & meters' },
  diode: { name: 'Diode', prefix: 'D', value: .7, unit: 'V', group: 'Indicators & meters' },
  led: { name: 'LED', prefix: 'LED', value: 2, unit: 'V', group: 'Indicators & meters' },
  voltmeter: { name: 'Voltmeter', prefix: 'VM', value: 0, unit: '', group: 'Indicators & meters' },
  ammeter: { name: 'Ammeter', prefix: 'AM', value: 0, unit: '', group: 'Indicators & meters' },
}
const scales = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']] as const
export function metric(value: number | undefined, unit: string) {
  if (value === undefined || !Number.isFinite(value)) return '—'
  if (value === 0) return `0 ${unit}`.trim()
  const [scale, prefix] = scales.find(([size]) => Math.abs(value) >= size) ?? scales[scales.length - 1]
  return `${Number((value / scale).toPrecision(4))} ${prefix}${unit}`.trim()
}
export function parseMetric(raw: string, unit: string) {
  const match = raw.trim().match(/^([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?)\s*(.*)$/i)
  if (!match) return NaN
  const suffix = unit && match[2].endsWith(unit) ? match[2].slice(0, -unit.length) : match[2]
  const scale = ({ G: 1e9, M: 1e6, k: 1e3, K: 1e3, '': 1, m: 1e-3, 'µ': 1e-6, 'μ': 1e-6, u: 1e-6, n: 1e-9, p: 1e-12 } as Record<string, number>)[suffix]
  return Number(match[1].replace(',', '.')) * scale
}
