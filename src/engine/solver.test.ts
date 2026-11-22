import { describe, expect, it } from 'vitest';
import { solve, type Branch, type ElementKind } from './solver';

function branch(id: string, kind: ElementKind, a: string, b: string, value: number, settings: Partial<Branch> = {}): Branch {
  return { id, kind, a, b, value, ...settings };
}

function solved(branches: Branch[]) {
  const result = solve(branches);
  if (!result.ok) throw new Error(result.error);
  expect(result.balance).toBeCloseTo(0, 10);
  const net = new Map<string, number>();
  for (const { id, a, b } of branches) {
    const amps = result.branches[id].current;
    net.set(a, (net.get(a) ?? 0) + amps);
    net.set(b, (net.get(b) ?? 0) - amps);
  }
  for (const amps of net.values()) expect(amps).toBeCloseTo(0, 10);
  return result;
}

describe('DC operating point', () => {
  it('solves a divider and follows the passive current and power convention', () => {
    const result = solved([
      branch('source', 'voltage', 'p', '0', 12),
      branch('upper', 'resistor', 'p', 'mid', 1000),
      branch('lower', 'resistor', 'mid', '0', 2000),
    ]);
    expect(result.nodes).toEqual({ '0': 0, p: 12, mid: 8 });
    expect(result.branches.upper).toEqual({ voltage: 4, current: 0.004, power: 0.016 });
    expect(result.branches.source).toEqual({ voltage: 12, current: -0.004, power: -0.048 });
  });

  it('splits a current source into parallel resistors', () => {
    const result = solved([
      branch('source', 'current', '0', 'p', 0.006),
      branch('r1', 'resistor', 'p', '0', 1000),
      branch('r2', 'resistor', 'p', '0', 2000),
    ]);
    expect(result.nodes.p).toBeCloseTo(4, 12);
    expect(result.branches.r1.current).toBeCloseTo(0.004, 12);
    expect(result.branches.r2.current).toBeCloseTo(0.002, 12);
    expect(result.branches.source.power).toBeCloseTo(-0.024, 12);
  });

  it('balances a Wheatstone bridge', () => {
    const result = solved([
      branch('source', 'voltage', 'p', '0', 9),
      branch('r1', 'resistor', 'p', 'l', 100),
      branch('r2', 'resistor', 'l', '0', 200),
      branch('r3', 'resistor', 'p', 'r', 150),
      branch('r4', 'resistor', 'r', '0', 300),
      branch('bridge', 'resistor', 'l', 'r', 47),
    ]);
    expect(result.nodes.l).toBeCloseTo(6, 12);
    expect(result.nodes.r).toBeCloseTo(6, 12);
    expect(result.branches.bridge.current).toBeCloseTo(0, 12);
  });

  it('solves coupled loops with a floating ideal voltage source', () => {
    const result = solved([
      branch('v1', 'voltage', 'p', '0', 10),
      branch('v2', 'voltage', 'q', 'm', 4),
      branch('r1', 'resistor', 'p', 'm', 1000),
      branch('r2', 'resistor', 'm', '0', 1000),
      branch('r3', 'resistor', 'q', '0', 1000),
    ]);
    expect(result.nodes.m).toBeCloseTo(2, 12);
    expect(result.nodes.q).toBeCloseTo(6, 12);
    expect(result.branches.v1.current).toBeCloseTo(-0.008, 12);
    expect(result.branches.v2.current).toBeCloseTo(-0.006, 12);
  });

  it('reports an ideal source bypassed by a closed switch as a short', () => {
    expect(solve([
      branch('v', 'voltage', 'p', '0', 5),
      branch('s', 'switch', 'p', '0', 0, { closed: true }),
    ])).toMatchObject({ ok: false, error: expect.stringMatching(/short circuit/i) });
    expect(solve([branch('v', 'voltage', '0', '0', 5)])).toMatchObject({
      ok: false, error: expect.stringMatching(/short circuit/i),
    });
  });

  it('diagnoses missing ground, disconnected components, and redundant ideal constraints', () => {
    const missing = solve([branch('r', 'resistor', 'p', 'q', 100)]);
    expect(missing).toMatchObject({ ok: false, error: expect.stringMatching(/ground/i) });
    const disconnected = solve([
      branch('v', 'voltage', 'p', '0', 5),
      branch('r', 'resistor', 'x', 'y', 100),
    ]);
    expect(disconnected).toMatchObject({ ok: false, error: expect.stringMatching(/floating/i) });
    const redundant = solve([
      branch('v1', 'voltage', 'p', '0', 5),
      branch('v2', 'voltage', 'p', '0', 5),
    ]);
    expect(redundant).toMatchObject({ ok: false, error: expect.stringMatching(/singular/i) });
    const conflicting = solve([
      branch('v1', 'voltage', 'p', '0', 5),
      branch('v2', 'voltage', 'p', '0', 6),
    ]);
    expect(conflicting).toMatchObject({ ok: false, error: expect.stringMatching(/conflicting/i) });
  });

  it('keeps inactive branches open, with a warning for undefined node voltages', () => {
    const result = solved([
      branch('v', 'voltage', 'p', '0', 5),
      branch('s1', 'switch', 'p', 'x', 0, { closed: false }),
      branch('bulb', 'bulb', 'x', 'y', 100),
      branch('s2', 'switch', 'y', '0', 0, { closed: false }),
    ]);
    expect(result.warnings.join(' ')).toMatch(/floating/i);
    for (const reading of Object.values(result.branches)) expect(reading.current).toBe(0);
    expect(solve([
      branch('i', 'current', '0', 'p', 1),
      branch('s', 'switch', 'p', '0', 0, { closed: false }),
    ])).toMatchObject({ ok: false, error: expect.stringMatching(/return path/i) });
  });

  it('models a rheostat and ideal nonloading voltage and current meters', () => {
    const result = solved([
      branch('v', 'voltage', 'p', '0', 6),
      branch('a', 'ammeter', 'p', 'q', 0),
      branch('pot', 'potentiometer', 'q', 'x', 1000, { position: 0.5 }),
      branch('bulb', 'bulb', 'x', '0', 100),
      branch('m', 'voltmeter', 'x', '0', 0),
    ]);
    expect(result.branches.a.voltage).toBe(0);
    expect(result.branches.a.current).toBeCloseTo(0.01, 12);
    expect(result.branches.pot.voltage).toBeCloseTo(5, 12);
    expect(result.branches.m).toEqual({ voltage: 1, current: 0, power: 0 });
  });

  it('opens an overcurrent fuse and recalculates the operating point', () => {
    const base = [branch('v', 'voltage', 'p', '0', 10), branch('r', 'resistor', 'q', '0', 100)];
    const intact = solved([...base, branch('f', 'fuse', 'p', 'q', 0.2)]);
    expect(intact.branches.f.current).toBeCloseTo(0.1, 12);
    const tripped = solved([...base, branch('f', 'fuse', 'p', 'q', 0.05)]);
    expect(tripped.branches.f).toEqual({ voltage: 10, current: 0, power: 0 });
    expect(tripped.branches.r.current).toBe(0);
    expect(tripped.warnings.join(' ')).toMatch(/fuse f.*tripped/i);
  });

  it('finds the forward operating point of an LED and diode in series', () => {
    const result = solved([
      branch('v', 'voltage', 'p', '0', 5),
      branch('r', 'resistor', 'p', 'x', 230),
      branch('led', 'led', 'x', 'y', 2),
      branch('d', 'diode', 'y', '0', 0.7),
    ]);
    expect(result.branches.led.current).toBeCloseTo(2.3 / 232, 10);
    expect(result.branches.d.current).toBeCloseTo(2.3 / 232, 10);
    const reverse = solved([
      branch('v', 'voltage', 'p', '0', 5),
      branch('d', 'diode', '0', 'p', 0.7),
    ]);
    expect(reverse.branches.d.current).toBeCloseTo(-5e-9, 12);
  });
});
