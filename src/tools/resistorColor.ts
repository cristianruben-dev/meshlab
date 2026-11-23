import { parseMetric } from '../editor/catalog'

export type BandCount = 4 | 5

export type ColorId =
  | 'black'
  | 'brown'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'violet'
  | 'gray'
  | 'white'
  | 'gold'
  | 'silver'

export type DigitColorId =
  | 'black'
  | 'brown'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'violet'
  | 'gray'
  | 'white'

export type ToleranceColorId =
  | 'brown'
  | 'red'
  | 'green'
  | 'blue'
  | 'violet'
  | 'gray'
  | 'gold'
  | 'silver'

export type ResistorColorSpec = {
  id: ColorId
  name: string
  hex: string
  /** High-contrast text color when printed on top of this color swatch. */
  contrast: '#ffffff' | '#111827'
  digit: number | null
  multiplier: number
  exponent: number
  multiplierLabel: string
  tolerance: number | null
  toleranceLabel: string | null
  metallic?: boolean
}

/**
 * IEC 60062 resistor color code definitions.
 * Hex values intentionally match Meshlab's 3D breadboard resistors so 2D and 3D visuals stay consistent.
 */
export const RESISTOR_COLORS: readonly ResistorColorSpec[] = [
  { id: 'black', name: 'Black', hex: '#1d1d1f', contrast: '#ffffff', digit: 0, multiplier: 1, exponent: 0, multiplierLabel: '×1 Ω', tolerance: null, toleranceLabel: null },
  { id: 'brown', name: 'Brown', hex: '#7b4a24', contrast: '#ffffff', digit: 1, multiplier: 10, exponent: 1, multiplierLabel: '×10 Ω', tolerance: 1, toleranceLabel: '±1%' },
  { id: 'red', name: 'Red', hex: '#d1372c', contrast: '#ffffff', digit: 2, multiplier: 100, exponent: 2, multiplierLabel: '×100 Ω', tolerance: 2, toleranceLabel: '±2%' },
  { id: 'orange', name: 'Orange', hex: '#ee7a1c', contrast: '#111827', digit: 3, multiplier: 1e3, exponent: 3, multiplierLabel: '×1 kΩ', tolerance: null, toleranceLabel: null },
  { id: 'yellow', name: 'Yellow', hex: '#f1c232', contrast: '#111827', digit: 4, multiplier: 1e4, exponent: 4, multiplierLabel: '×10 kΩ', tolerance: null, toleranceLabel: null },
  { id: 'green', name: 'Green', hex: '#2f9a4a', contrast: '#ffffff', digit: 5, multiplier: 1e5, exponent: 5, multiplierLabel: '×100 kΩ', tolerance: 0.5, toleranceLabel: '±0.5%' },
  { id: 'blue', name: 'Blue', hex: '#2d62c8', contrast: '#ffffff', digit: 6, multiplier: 1e6, exponent: 6, multiplierLabel: '×1 MΩ', tolerance: 0.25, toleranceLabel: '±0.25%' },
  { id: 'violet', name: 'Violet', hex: '#7a43b6', contrast: '#ffffff', digit: 7, multiplier: 1e7, exponent: 7, multiplierLabel: '×10 MΩ', tolerance: 0.1, toleranceLabel: '±0.1%' },
  { id: 'gray', name: 'Gray', hex: '#8b9097', contrast: '#111827', digit: 8, multiplier: 1e8, exponent: 8, multiplierLabel: '×100 MΩ', tolerance: 0.05, toleranceLabel: '±0.05%' },
  { id: 'white', name: 'White', hex: '#f5f5f2', contrast: '#111827', digit: 9, multiplier: 1e9, exponent: 9, multiplierLabel: '×1 GΩ', tolerance: null, toleranceLabel: null },
  { id: 'gold', name: 'Gold', hex: '#c9a23a', contrast: '#111827', digit: null, multiplier: 0.1, exponent: -1, multiplierLabel: '×0.1 Ω', tolerance: 5, toleranceLabel: '±5%', metallic: true },
  { id: 'silver', name: 'Silver', hex: '#c0c4c8', contrast: '#111827', digit: null, multiplier: 0.01, exponent: -2, multiplierLabel: '×0.01 Ω', tolerance: 10, toleranceLabel: '±10%', metallic: true },
] as const

export const COLOR_BY_ID: Record<ColorId, ResistorColorSpec> = Object.fromEntries(
  RESISTOR_COLORS.map(spec => [spec.id, spec]),
) as Record<ColorId, ResistorColorSpec>

export const DIGIT_COLORS: readonly ResistorColorSpec[] = RESISTOR_COLORS.filter(spec => spec.digit !== null)
export const FIRST_DIGIT_COLORS: readonly ResistorColorSpec[] = DIGIT_COLORS.filter(spec => spec.digit !== 0)
export const MULTIPLIER_COLORS: readonly ResistorColorSpec[] = RESISTOR_COLORS
export const TOLERANCE_COLORS: readonly ResistorColorSpec[] = RESISTOR_COLORS.filter(spec => spec.tolerance !== null)

export const DIGIT_IDS: readonly DigitColorId[] = [
  'black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'gray', 'white',
]

export type FourBandCode = {
  bandCount: 4
  digits: [DigitColorId, DigitColorId]
  multiplier: ColorId
  tolerance: ToleranceColorId
}

export type FiveBandCode = {
  bandCount: 5
  digits: [DigitColorId, DigitColorId, DigitColorId]
  multiplier: ColorId
  tolerance: ToleranceColorId
}

export type ResistorBandCode = FourBandCode | FiveBandCode

export type DecodedResistor = {
  ohms: number
  tolerancePercent: number
  deltaOhms: number
  minOhms: number
  maxOhms: number
}

export type EncodedResistor = {
  code: ResistorBandCode
  encodedOhms: number
  isExact: boolean
  clamped: boolean
}

export const E12_BASE = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2] as const
export const E24_BASE = [
  1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0,
  3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1,
] as const

export const COMMON_RESISTOR_VALUES = [220, 330, 470, 1000, 4700, 10000, 47000, 100000] as const

export type StandardMatch = {
  series: 'E12' | 'E24'
  value: number
  diffPercent: number
  isExact: boolean
}

export type StandardLookup = {
  e12: StandardMatch
  e24: StandardMatch
  exactSeries: 'E12' | 'E24' | null
}

function cleanFloat(value: number): number {
  if (!Number.isFinite(value)) return value
  return Number(value.toPrecision(12))
}

function exponentToColor(exponent: number): ColorId {
  if (exponent === -1) return 'gold'
  if (exponent === -2) return 'silver'
  return DIGIT_IDS[Math.max(0, Math.min(9, exponent))]
}

/** Decode a 4- or 5-band color code into nominal resistance, tolerance, and min/max range. */
export function decodeResistorBands(code: ResistorBandCode): DecodedResistor {
  const sigValue = code.digits.reduce((acc, colorId) => acc * 10 + (COLOR_BY_ID[colorId].digit ?? 0), 0)
  const multiplier = COLOR_BY_ID[code.multiplier].multiplier
  const tolerancePercent = COLOR_BY_ID[code.tolerance].tolerance ?? 5
  const ohms = cleanFloat(sigValue * multiplier)
  const deltaOhms = cleanFloat(ohms * (tolerancePercent / 100))
  const minOhms = cleanFloat(ohms - deltaOhms)
  const maxOhms = cleanFloat(ohms + deltaOhms)
  return { ohms, tolerancePercent, deltaOhms, minOhms, maxOhms }
}

/** Encode a resistance in ohms into its closest IEC 60062 4- or 5-band color representation. */
export function encodeResistance(
  ohms: number,
  bandCount: BandCount = 4,
  tolerance?: ToleranceColorId,
): EncodedResistor {
  const defaultTol: ToleranceColorId = tolerance ?? (bandCount === 4 ? 'gold' : 'brown')
  const digitCount = bandCount === 4 ? 2 : 3
  const maxDigits = bandCount === 4 ? 99 : 999
  const minExponent = -2
  const maxExponent = 9

  if (!(ohms > 0) || !Number.isFinite(ohms)) {
    const code: ResistorBandCode = bandCount === 4
      ? { bandCount: 4, digits: ['black', 'black'], multiplier: 'black', tolerance: defaultTol }
      : { bandCount: 5, digits: ['black', 'black', 'black'], multiplier: 'black', tolerance: defaultTol }
    return { code, encodedOhms: 0, isExact: false, clamped: true }
  }

  let exponent = Math.floor(Math.log10(ohms)) - (digitCount - 1)
  let digits = Math.round(ohms / 10 ** exponent)
  if (digits > maxDigits) {
    digits = Math.round(digits / 10)
    exponent += 1
  }

  let clamped = false
  if (exponent < minExponent) {
    exponent = minExponent
    digits = Math.max(1, Math.min(maxDigits, Math.round(ohms / 10 ** minExponent)))
    clamped = ohms < 10 ** minExponent
  } else if (exponent > maxExponent) {
    exponent = maxExponent
    digits = maxDigits
    clamped = true
  }

  const multiplier = exponentToColor(exponent)
  const code: ResistorBandCode = bandCount === 4
    ? {
        bandCount: 4,
        digits: [DIGIT_IDS[Math.floor(digits / 10)], DIGIT_IDS[digits % 10]],
        multiplier,
        tolerance: defaultTol,
      }
    : {
        bandCount: 5,
        digits: [
          DIGIT_IDS[Math.floor(digits / 100)],
          DIGIT_IDS[Math.floor((digits % 100) / 10)],
          DIGIT_IDS[digits % 10],
        ],
        multiplier,
        tolerance: defaultTol,
      }

  const encodedOhms = cleanFloat(digits * COLOR_BY_ID[multiplier].multiplier)
  const relError = Math.abs(encodedOhms - ohms) / ohms
  return {
    code,
    encodedOhms,
    isExact: relError < 1e-6,
    clamped,
  }
}

/** Return the color IDs of a band code in left-to-right visual order. */
export function bandCodeToColors(code: ResistorBandCode): ColorId[] {
  return [...code.digits, code.multiplier, code.tolerance]
}

/** Return the 4-band hex array used by Meshlab's 3D breadboard and mini previews. */
export function resistorHexBands(ohms: number, bandCount: BandCount = 4, tolerance?: ToleranceColorId): string[] {
  if (!(ohms > 0) || !Number.isFinite(ohms)) {
    const tolHex = COLOR_BY_ID[tolerance ?? (bandCount === 4 ? 'gold' : 'brown')].hex
    return bandCount === 4
      ? [COLOR_BY_ID.black.hex, COLOR_BY_ID.black.hex, COLOR_BY_ID.black.hex, tolHex]
      : [COLOR_BY_ID.black.hex, COLOR_BY_ID.black.hex, COLOR_BY_ID.black.hex, COLOR_BY_ID.black.hex, tolHex]
  }
  const { code } = encodeResistance(ohms, bandCount, tolerance)
  return bandCodeToColors(code).map(id => COLOR_BY_ID[id].hex)
}

/** Convert between 4-band and 5-band codes while preserving the resistance as closely as possible. */
export function convertBandCount(code: ResistorBandCode, targetCount: BandCount): ResistorBandCode {
  if (code.bandCount === targetCount) return code
  const { ohms } = decodeResistorBands(code)
  const preferredTolerance: ToleranceColorId =
    targetCount === 5 && code.tolerance === 'gold'
      ? 'brown'
      : targetCount === 4 && code.tolerance === 'brown'
        ? 'gold'
        : code.tolerance
  return encodeResistance(ohms > 0 ? ohms : 1000, targetCount, preferredTolerance).code
}

function findNearestInSeries(ohms: number, base: readonly number[], series: 'E12' | 'E24'): StandardMatch {
  const decade = Math.floor(Math.log10(ohms))
  let best = cleanFloat(base[0] * 10 ** Math.max(-2, Math.min(9, decade)))
  let bestDist = Infinity

  for (let exp = decade - 1; exp <= decade + 1; exp++) {
    if (exp < -2 || exp > 9) continue
    const factor = 10 ** exp
    for (const mantissa of base) {
      const candidate = cleanFloat(mantissa * factor)
      const dist = Math.abs(Math.log(candidate / ohms))
      if (dist < bestDist) {
        bestDist = dist
        best = candidate
      }
    }
  }

  const diffPercent = cleanFloat(((best - ohms) / ohms) * 100)
  return {
    series,
    value: best,
    diffPercent,
    isExact: Math.abs(best - ohms) / ohms < 1e-4,
  }
}

/** Find the closest standard commercial values in E12 and E24 series for a given resistance in ohms. */
export function findNearestStandard(ohms: number): StandardLookup | null {
  if (!(ohms > 0) || !Number.isFinite(ohms)) return null
  const e12 = findNearestInSeries(ohms, E12_BASE, 'E12')
  const e24 = findNearestInSeries(ohms, E24_BASE, 'E24')
  const exactSeries = e12.isExact ? 'E12' : e24.isExact ? 'E24' : null
  return { e12, e24, exactSeries }
}

/**
 * Parse a user-entered resistance string into ohms.
 * Supports SI suffixes (`4.7 kΩ`, `4,7k`, `330`, `1M`, `220mΩ`), word suffixes (`ohm`, `ohms`),
 * and RKM shorthand (`4k7`, `2R2`, `0R47`, `1M5`, `330R`).
 */
export function parseResistanceInput(raw: string): number {
  const trimmed = raw.trim()
  if (!trimmed) return NaN

  // RKM shorthand: e.g. 4k7 -> 4.7k, 2R2 -> 2.2, 330R -> 330, 1M5 -> 1.5M
  const rkm = trimmed.match(/^(\d+)\s*([rRkKmMgG])\s*(\d*)\s*(?:Ω|ohms?)?$/i)
  if (rkm) {
    const [, whole, letter, frac] = rkm
    const num = Number(frac ? `${whole}.${frac}` : whole)
    const scale =
      letter === 'r' || letter === 'R' ? 1
        : letter === 'k' || letter === 'K' ? 1e3
          : letter === 'M' ? 1e6
            : letter === 'm' ? 1e-3
              : 1e9
    return cleanFloat(num * scale)
  }

  // Normalize "ohm"/"ohms" to Ω and handle spaces before suffix
  const normalized = trimmed
    .replace(/\s*(?:ohms?|Ω)\s*$/i, 'Ω')
    .replace(/\s+([GMkKmµμunp]Ω?)$/, '$1')

  const parsed = parseMetric(normalized, 'Ω')
  return Number.isFinite(parsed) && parsed > 0 ? cleanFloat(parsed) : NaN
}

/** Format resistance in human-friendly electronics notation (keeps sub-ohm values like `0.47 Ω` readable). */
export function formatOhms(ohms: number): string {
  if (!Number.isFinite(ohms)) return '—'
  if (ohms === 0) return '0 Ω'
  const abs = Math.abs(ohms)
  const formatNum = (val: number) => Number(val.toPrecision(4)).toString()
  if (abs >= 1e9) return `${formatNum(ohms / 1e9)} GΩ`
  if (abs >= 1e6) return `${formatNum(ohms / 1e6)} MΩ`
  if (abs >= 1e3) return `${formatNum(ohms / 1e3)} kΩ`
  if (abs >= 0.01) return `${formatNum(ohms)} Ω`
  return `${formatNum(ohms * 1e3)} mΩ`
}
