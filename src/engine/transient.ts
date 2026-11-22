import { solve, type Branch, type BranchReading, type SolveResult } from './solver';

export type DynamicBranch = Branch | (Omit<Branch, 'kind'> & { kind: 'capacitor' });

function invalid(error: string): SolveResult {
  return { ok: false, error };
}

function allocate(used: Set<string>, prefix: string) {
  let next = 0;
  return () => {
    let name: string;
    do name = `${prefix}${next++}`; while (used.has(name));
    used.add(name);
    return name;
  };
}

/**
 * Advance one backward-Euler step in SI units. Previous values are capacitor
 * terminal voltages (Va − Vb), defaulting to 0 V for a missing branch ID.
 * Use the returned capacitor branch voltages as the next step's history.
 */
export function stepTransient(
  branches: DynamicBranch[],
  dt: number,
  previous: Readonly<Record<string, number>>,
): SolveResult {
  if (!Number.isFinite(dt) || dt <= 0) return invalid('Time step must be positive and finite.');

  const ids = new Set(branches.map(({ id }) => id));
  const nodes = new Set(branches.flatMap(({ a, b }) => [a, b]));
  const newSourceId = allocate(ids, '__transient_source_');
  const newNodeId = allocate(new Set(nodes), '__transient_node_');
  const companions = new Map<string, string>();
  const stamps: Branch[] = [];

  for (const branch of branches) {
    if (branch.kind !== 'capacitor') {
      stamps.push(branch);
      continue;
    }

    const { id, a, b, value } = branch;
    if (!id || !a || !b) return invalid(`Invalid or duplicate branch identifier or terminal at ${id}.`);
    if (!Number.isFinite(value) || value <= 0) return invalid(`Capacitance must be positive and finite at ${id}.`);
    const resistance = dt / value;
    if (!Number.isFinite(resistance) || !Number.isFinite(1 / resistance)) {
      return invalid(`Capacitor companion exceeded the numeric range at ${id}.`);
    }
    const memory = Object.hasOwn(previous, id) ? previous[id] : 0;
    if (!Number.isFinite(memory)) return invalid(`Invalid previous voltage at ${id}.`);

    // V_new = V_previous + I_new × dt / C. Place the private node after a
    // public terminal so floating-section diagnostics always name public nodes.
    const internal = newNodeId();
    const source = newSourceId();
    stamps.push(
      { id, kind: 'resistor', a, b: internal, value: resistance },
      { id: source, kind: 'voltage', a: internal, b, value: memory },
    );
    companions.set(id, source);
  }

  const result = solve(stamps);
  if (companions.size === 0) return result;
  if (!result.ok) {
    return { ...result, error: result.error
      .replace(/^Open circuit: ideal current source has no DC return path at node /,
        'Open circuit: ideal current source has no return path at node ')
      .replace(/^Singular or ill-conditioned circuit: the DC equations/,
        'Singular or ill-conditioned circuit: the transient step equations')
      .replace(/^The DC operating point exceeded the numeric range\.$/,
        'The transient step exceeded the numeric range.') };
  }

  const readings = branches.map(({ id, a, b }): [string, BranchReading] => {
    const source = companions.get(id);
    if (source === undefined) return [id, result.branches[id]];
    const voltage = result.nodes[a] - result.nodes[b] + 0;
    const current = result.branches[source].current;
    return [id, { voltage, current, power: voltage * current + 0 }];
  });
  const balance = readings.reduce((sum, [, { power }]) => sum + power, 0);
  if (!Number.isFinite(balance)) return invalid('The transient step exceeded the numeric range.');

  return {
    ok: true,
    nodes: Object.fromEntries([...nodes].map((node) => [node, result.nodes[node]])),
    branches: Object.fromEntries(readings),
    balance,
    warnings: result.warnings,
    ...(result.warningTargets && { warningTargets: result.warningTargets }),
  };
}
