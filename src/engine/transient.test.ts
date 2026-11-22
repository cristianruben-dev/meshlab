import { describe, expect, it } from 'vitest';
import { solve, type Branch } from './solver';
import { stepTransient, type DynamicBranch } from './transient';

function step(branches: DynamicBranch[], dt: number, previous: Readonly<Record<string, number>> = {}) {
  const result = stepTransient(branches, dt, previous);
  if (!result.ok) throw new Error(result.error);

  expect(result.balance).toBeCloseTo(0, 12);
  const net = new Map<string, number>();
  for (const { id, a, b } of branches) {
    const { current, voltage, power } = result.branches[id];
    expect(voltage).toBeCloseTo(result.nodes[a] - result.nodes[b], 12);
    expect(power).toBeCloseTo(voltage * current, 12);
    net.set(a, (net.get(a) ?? 0) + current);
    net.set(b, (net.get(b) ?? 0) - current);
  }
  for (const amps of net.values()) expect(amps).toBeCloseTo(0, 12);
  expect(Object.keys(result.nodes).sort()).toEqual([...net.keys()].sort());
  expect(Object.keys(result.branches).sort()).toEqual(branches.map(({ id }) => id).sort());
  return result;
}

const capacitor: DynamicBranch = { id: 'c', kind: 'capacitor', a: 'out', b: '0', value: 1e-3 };
const resistor: Branch = { id: 'r', kind: 'resistor', a: 'in', b: 'out', value: 1000 };
const source: Branch = { id: 'v', kind: 'voltage', a: 'in', b: '0', value: 10 };

describe('backward Euler capacitor steps', () => {
  it('matches the RC charging recurrence using prior terminal voltage', () => {
    const circuit = [source, resistor, capacitor];
    const dt = 0.05;
    let previous = {};
    for (let n = 1; n <= 80; n++) {
      const result = step(circuit, dt, previous);
      const reading = result.branches.c;
      const factor = 1 / (1 + dt / (resistor.value * capacitor.value));
      expect(reading.voltage).toBeCloseTo(10 * (1 - factor ** n), 12);
      expect(reading.current).toBeCloseTo((10 - reading.voltage) / resistor.value, 12);
      expect(reading.power).toBeGreaterThan(0);
      previous = { c: reading.voltage };
    }
  });

  it('discharges a precharged capacitor with consistent terminal orientation and no mutation', () => {
    const circuit = [
      Object.freeze({ ...capacitor, a: '0', b: 'out' }),
      Object.freeze({ ...resistor, a: 'out', b: '0' }),
    ];
    Object.freeze(circuit);
    const previous = Object.freeze({ c: -10 });
    const result = step(circuit, 1, previous);
    expect(result.nodes.out).toBeCloseTo(5, 12);
    expect(result.branches.c.voltage).toBeCloseTo(-5, 12);
    expect(result.branches.c.current).toBeCloseTo(0.005, 12);
    expect(result.branches.c.power).toBeCloseTo(-0.025, 12);
    expect(previous).toEqual({ c: -10 });
  });

  it('keeps companions private even when real identifiers use their naming pattern', () => {
    const circuit = [
      { ...source, id: '__transient_source_0', a: '__transient_node_0' },
      { ...resistor, a: '__transient_node_0' },
      capacitor,
      { ...capacitor, id: '__proto__', value: 2e-3 },
    ];
    const result = step(circuit, 1);
    expect(result.nodes.out).toBeCloseTo(2.5, 12);
    expect(result.branches.c.current).toBeCloseTo(0.0025, 12);
    expect(result.branches['__proto__'].current).toBeCloseTo(0.005, 12);
  });

  it('preserves results and diagnostics for netlists with no capacitors', () => {
    const circuit = [source, { ...resistor, b: '0' }];
    expect(stepTransient(circuit, 1, {})).toEqual(solve(circuit));
    expect(stepTransient([resistor], 1, {})).toEqual(solve([resistor]));
  });

  it('reports invalid transient inputs and circuit diagnostics with public identifiers', () => {
    expect(stepTransient([capacitor], 0, {})).toEqual({
      ok: false, error: expect.stringMatching(/time step/i),
    });
    expect(stepTransient([{ ...capacitor, value: 0 }], 1, {})).toEqual({
      ok: false, error: expect.stringMatching(/capacitance.*\bc\b/i),
    });
    expect(stepTransient([{ ...capacitor, value: Number.MIN_VALUE }], 1, {})).toEqual({
      ok: false, error: expect.stringMatching(/numeric range.*\bc\b/i),
    });
    expect(stepTransient([capacitor], 1, { c: Infinity })).toEqual({
      ok: false, error: expect.stringMatching(/previous voltage.*\bc\b/i),
    });
    expect(stepTransient([{ ...capacitor, b: '' }], 1, {})).toEqual({
      ok: false, error: expect.stringMatching(/terminal.*\bc\b/i),
    });
    expect(stepTransient([capacitor, { ...resistor, id: 'c' }], 1, {})).toEqual({
      ok: false, error: expect.stringMatching(/duplicate.*\bc\b/i),
    });
    expect(stepTransient([source, { ...capacitor, a: 'floating', b: 'out' }], 1, {})).toEqual({
      ok: false, error: expect.stringMatching(/floating component at node floating/i), target: { node: 'floating' },
    });
    const switchBranch: Branch = { id: 'off', kind: 'switch', a: 'floating', b: '0', value: 0, closed: false };
    const result = step([switchBranch, { ...capacitor, a: 'floating', b: 'out' }], 1);
    expect(result.warnings).toEqual([expect.stringMatching(/floating section at node floating/i)]);
  });
});
