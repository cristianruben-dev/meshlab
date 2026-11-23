import { describe, expect, it } from 'vitest'
import {
  COLOR_BY_ID,
  convertBandCount,
  decodeResistorBands,
  encodeResistance,
  findNearestStandard,
  formatOhms,
  parseResistanceInput,
  resistorHexBands,
} from './resistorColor'

describe('resistorColor IEC 60062 engine', () => {
  it('decodes 4-band resistors with nominal value, tolerance, and min/max range', () => {
    const decoded = decodeResistorBands({
      bandCount: 4,
      digits: ['yellow', 'violet'],
      multiplier: 'red',
      tolerance: 'gold',
    })
    expect(decoded.ohms).toBe(4700)
    expect(decoded.tolerancePercent).toBe(5)
    expect(decoded.deltaOhms).toBe(235)
    expect(decoded.minOhms).toBe(4465)
    expect(decoded.maxOhms).toBe(4935)
  })

  it('decodes 5-band precision resistors including sub-ohm gold and silver multipliers', () => {
    const precision = decodeResistorBands({
      bandCount: 5,
      digits: ['brown', 'black', 'black'],
      multiplier: 'brown',
      tolerance: 'brown',
    })
    expect(precision.ohms).toBe(1000)
    expect(precision.tolerancePercent).toBe(1)
    expect(precision.minOhms).toBe(990)
    expect(precision.maxOhms).toBe(1010)

    const subOhm = decodeResistorBands({
      bandCount: 4,
      digits: ['red', 'red'],
      multiplier: 'silver',
      tolerance: 'gold',
    })
    expect(subOhm.ohms).toBe(0.22)
  })

  it('encodes standard resistances into 4-band and 5-band codes accurately', () => {
    const r4700_4 = encodeResistance(4700, 4)
    expect(r4700_4.code).toEqual({
      bandCount: 4,
      digits: ['yellow', 'violet'],
      multiplier: 'red',
      tolerance: 'gold',
    })
    expect(r4700_4.isExact).toBe(true)

    const r4700_5 = encodeResistance(4700, 5)
    expect(r4700_5.code).toEqual({
      bandCount: 5,
      digits: ['yellow', 'violet', 'black'],
      multiplier: 'brown',
      tolerance: 'brown',
    })
    expect(r4700_5.isExact).toBe(true)

    const r4_7 = encodeResistance(4.7, 4)
    expect(r4_7.code.digits).toEqual(['yellow', 'violet'])
    expect(r4_7.code.multiplier).toBe('gold')

    // Non-2-digit value rounds cleanly in 4-band mode and reports isExact = false
    const rounded = encodeResistance(4750, 4)
    expect(rounded.encodedOhms).toBe(4800)
    expect(rounded.isExact).toBe(false)

    // Same value is exact in 5-band mode
    const exact5 = encodeResistance(4750, 5)
    expect(exact5.encodedOhms).toBe(4750)
    expect(exact5.isExact).toBe(true)
  })

  it('produces hex bands matching Meshlab 3D breadboard expectations', () => {
    expect(resistorHexBands(1000)).toEqual([
      COLOR_BY_ID.brown.hex,
      COLOR_BY_ID.black.hex,
      COLOR_BY_ID.red.hex,
      COLOR_BY_ID.gold.hex,
    ])
    expect(resistorHexBands(999)).toEqual([
      COLOR_BY_ID.brown.hex,
      COLOR_BY_ID.black.hex,
      COLOR_BY_ID.red.hex,
      COLOR_BY_ID.gold.hex,
    ])
  })

  it('converts between 4-band and 5-band modes preserving resistance', () => {
    const four = encodeResistance(330, 4).code
    const five = convertBandCount(four, 5)
    expect(five.bandCount).toBe(5)
    expect(decodeResistorBands(five).ohms).toBe(330)
    expect(five.tolerance).toBe('brown')

    const backToFour = convertBandCount(five, 4)
    expect(backToFour.bandCount).toBe(4)
    expect(decodeResistorBands(backToFour).ohms).toBe(330)
    expect(backToFour.tolerance).toBe('gold')
  })

  it('finds exact and nearest E12 and E24 commercial values', () => {
    const exactE12 = findNearestStandard(4700)!
    expect(exactE12.exactSeries).toBe('E12')
    expect(exactE12.e12.value).toBe(4700)
    expect(exactE12.e24.value).toBe(4700)

    const exactE24 = findNearestStandard(5100)!
    expect(exactE24.exactSeries).toBe('E24')
    expect(exactE24.e24.isExact).toBe(true)
    expect(exactE24.e12.isExact).toBe(false)
    expect(exactE24.e12.value).toBe(4700)

    const custom = findNearestStandard(5000)!
    expect(custom.exactSeries).toBeNull()
    expect(custom.e24.value).toBe(5100)
    expect(custom.e12.value).toBe(4700)
  })

  it('parses metric, Spanish comma decimals, and RKM shorthand inputs', () => {
    expect(parseResistanceInput('4.7 kΩ')).toBe(4700)
    expect(parseResistanceInput('4,7k')).toBe(4700)
    expect(parseResistanceInput('4k7')).toBe(4700)
    expect(parseResistanceInput('330')).toBe(330)
    expect(parseResistanceInput('330R')).toBe(330)
    expect(parseResistanceInput('2R2')).toBe(2.2)
    expect(parseResistanceInput('0R47')).toBe(0.47)
    expect(parseResistanceInput('1M5')).toBe(1500000)
    expect(parseResistanceInput('100 ohms')).toBe(100)
    expect(parseResistanceInput('-5')).toBeNaN()
    expect(parseResistanceInput('abc')).toBeNaN()
  })

  it('formats resistance cleanly across decades including sub-ohm values', () => {
    expect(formatOhms(0.22)).toBe('0.22 Ω')
    expect(formatOhms(4.7)).toBe('4.7 Ω')
    expect(formatOhms(330)).toBe('330 Ω')
    expect(formatOhms(4700)).toBe('4.7 kΩ')
    expect(formatOhms(1_000_000)).toBe('1 MΩ')
    expect(formatOhms(2_200_000_000)).toBe('2.2 GΩ')
  })
})
