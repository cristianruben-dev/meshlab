export type ElementKind =
  | 'resistor' | 'voltage' | 'current' | 'switch' | 'fuse' | 'bulb'
  | 'diode' | 'led' | 'voltmeter' | 'ammeter' | 'potentiometer';

export type Branch = {
  id: string;
  kind: ElementKind;
  a: string;
  b: string;
  value: number;
  closed?: boolean;
  position?: number;
};

export type BranchReading = { voltage: number; current: number; power: number };

export type SolveResult =
  | { ok: true; nodes: Record<string, number>; branches: Record<string, BranchReading>; balance: number; warnings: string[] }
  | { ok: false; error: string };

type Model =
  | { type: 'open' }
  | { type: 'ideal'; voltage: number }
  | { type: 'current'; current: number }
  | { type: 'ohmic'; conductance: number }
  | { type: 'diode'; knee: number };
type Device = Branch & { model: Model };
type Adjacency = Map<string, string[]>;
type Solution = { nodes: Record<string, number>; idealCurrents: Map<string, number> };

const OFF_CONDUCTANCE = 1e-9;
const FORWARD_ADDITIONAL_CONDUCTANCE = 1 - OFF_CONDUCTANCE;
const RELATIVE_TOLERANCE = 128 * Number.EPSILON;

function error(message: string): SolveResult & { ok: false } {
  return { ok: false, error: message };
}

function modelBranch(branch: Branch, tripped: Set<string>): Model {
  const { kind, value, closed, position } = branch;
  switch (kind) {
    case 'voltage': return { type: 'ideal', voltage: value };
    case 'current': return { type: 'current', current: value };
    case 'voltmeter': return { type: 'open' };
    case 'ammeter': return { type: 'ideal', voltage: 0 };
    case 'switch': return closed ? { type: 'ideal', voltage: 0 } : { type: 'open' };
    case 'fuse': return closed === false || tripped.has(branch.id) ? { type: 'open' } : { type: 'ideal', voltage: 0 };
    case 'led':
    case 'diode': return { type: 'diode', knee: value };
    case 'resistor':
    case 'bulb':
    case 'potentiometer': {
      const resistance = kind === 'potentiometer' ? value * (position ?? 0.5) : value;
      return resistance === 0 ? { type: 'ideal', voltage: 0 } : { type: 'ohmic', conductance: 1 / resistance };
    }
  }
}

function graph(nodes: string[], branches: Branch[]): Adjacency {
  const neighbors = new Map(nodes.map((node) => [node, [] as string[]]));
  for (const { a, b } of branches) {
    neighbors.get(a)?.push(b);
    neighbors.get(b)?.push(a);
  }
  return neighbors;
}

function connected(neighbors: Adjacency, start: string, visited: Set<string>): string[] {
  const nodes = [start];
  visited.add(start);
  for (const node of nodes) {
    for (const next of neighbors.get(node) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      nodes.push(next);
    }
  }
  return nodes;
}

function checkIdealConstraints(devices: Device[]): string | undefined {
  const edges = new Map<string, { node: string; offset: number }[]>();
  const link = (a: string, b: string, offset: number) => {
    const neighbors = edges.get(a);
    if (neighbors) neighbors.push({ node: b, offset });
    else edges.set(a, [{ node: b, offset }]);
  };

  let redundant: string | undefined;
  for (const { model, a, b, id } of devices) {
    if (model.type !== 'ideal') continue;
    const offsets = new Map([[a, { sum: 0, magnitude: 0 }]]);
    const pending = [a];

    // Existing ideal paths already specify the difference between their endpoints.
    for (const node of pending) {
      if (offsets.has(b)) break;
      const offset = offsets.get(node);
      if (!offset) continue;
      for (const edge of edges.get(node) ?? []) {
        if (offsets.has(edge.node)) continue;
        offsets.set(edge.node, {
          sum: offset.sum + edge.offset,
          magnitude: Math.max(offset.magnitude, Math.abs(edge.offset)),
        });
        pending.push(edge.node);
      }
    }
    const existing = offsets.get(b);
    if (existing !== undefined) {
      if (Math.abs(existing.sum - model.voltage) > RELATIVE_TOLERANCE * Math.max(existing.magnitude, Math.abs(model.voltage))) {
        return `Short circuit: conflicting ideal voltage constraints at ${id}.`;
      }
      redundant ??= id;
    } else {
      link(a, b, model.voltage);
      link(b, a, -model.voltage);
    }
  }
  return redundant === undefined
    ? undefined
    : `Singular circuit: redundant ideal voltage constraint at ${redundant}; branch currents are not uniquely determined.`;
}

function getReferences(nodes: string[], devices: Device[]) {
  const neighbors = graph(nodes, devices.filter(({ model }) => model.type !== 'open' && model.type !== 'current'));
  const visited = new Set<string>();
  const references = new Set(['0']);
  const warnings: string[] = [];
  connected(neighbors, '0', visited);

  for (const node of nodes) {
    if (visited.has(node)) continue;
    const island = connected(neighbors, node, visited);
    const members = new Set(island);
    let net = 0;
    let magnitude = 0;
    for (const { a, b, model } of devices) {
      if (model.type !== 'current' || members.has(a) === members.has(b)) continue;
      net += members.has(a) ? model.current : -model.current;
      magnitude += Math.abs(model.current);
    }
    if (Math.abs(net) > RELATIVE_TOLERANCE * magnitude) {
      return { error: `Open circuit: ideal current source has no DC return path at node ${node}.` };
    }
    // Fix only an arbitrary voltage offset, never add a physical return path.
    references.add(node);
    warnings.push(`Floating section at node ${node}: its voltage relative to ground is undefined; shown with a local 0 V reference.`);
  }
  return { references, warnings };
}

/** Scaled partial pivoting; the last column contains the right-hand side. */
function eliminate(matrix: Float64Array[]): number[] | undefined {
  const n = matrix.length;
  const scales = matrix.map((row) => row.subarray(0, n).reduce((max, value) => Math.max(max, Math.abs(value)), 0));

  for (let k = 0; k < n; k++) {
    let pivot = k;
    let largest = 0;
    for (let i = k; i < n; i++) {
      const scaled = scales[i] > 0 ? Math.abs(matrix[i][k]) / scales[i] : 0;
      if (scaled > largest) {
        pivot = i;
        largest = scaled;
      }
    }
    if (largest <= RELATIVE_TOLERANCE) return undefined;
    [matrix[k], matrix[pivot]] = [matrix[pivot], matrix[k]];
    [scales[k], scales[pivot]] = [scales[pivot], scales[k]];
    for (let i = k + 1; i < n; i++) {
      const factor = matrix[i][k] / matrix[k][k];
      matrix[i][k] = 0;
      for (let j = k + 1; j <= n; j++) matrix[i][j] -= factor * matrix[k][j];
    }
  }

  const result = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    let rhs = matrix[i][n];
    for (let j = i + 1; j < n; j++) rhs -= matrix[i][j] * result[j];
    result[i] = rhs / matrix[i][i];
    if (!Number.isFinite(result[i])) return undefined;
  }
  return result;
}

function solveMna(nodes: string[], devices: Device[], references: Set<string>, forward: Set<string>): Solution | undefined {
  const unknowns = new Map(nodes.filter((node) => !references.has(node)).map((node, index) => [node, index]));
  const ideals = devices.filter(({ model }) => model.type === 'ideal');
  const size = unknowns.size + ideals.length;
  const matrix = Array.from({ length: size }, () => new Float64Array(size + 1));
  let idealIndex = unknowns.size;
  for (const { a, b, id, model } of devices) {
    const i = unknowns.get(a);
    const j = unknowns.get(b);
    const add = (row: number | undefined, col: number | undefined, value: number) => {
      if (row !== undefined && col !== undefined) matrix[row][col] += value;
    };

    if (model.type === 'ideal') {
      add(i, idealIndex, 1);
      add(j, idealIndex, -1);
      add(idealIndex, i, 1);
      add(idealIndex, j, -1);
      add(idealIndex++, size, model.voltage);
    } else if (model.type !== 'open') {
      const on = model.type === 'diode' && forward.has(id);
      const g = model.type === 'ohmic' ? model.conductance
        : model.type === 'diode' ? OFF_CONDUCTANCE + (on ? FORWARD_ADDITIONAL_CONDUCTANCE : 0) : 0;
      const offset = model.type === 'current' ? model.current
        : model.type === 'diode' && on ? -model.knee * FORWARD_ADDITIONAL_CONDUCTANCE : 0;
      add(i, i, g);
      add(j, j, g);
      add(i, j, -g);
      add(j, i, -g);
      add(i, size, -offset);
      add(j, size, offset);
    }
  }
  const values = eliminate(matrix);
  return values && {
    nodes: Object.fromEntries(nodes.map((node) => {
      const index = unknowns.get(node);
      return [node, index === undefined ? 0 : values[index]];
    })),
    idealCurrents: new Map(ideals.map(({ id }, index) => [id, values[unknowns.size + index]])),
  };
}

function current(model: Model, voltage: number): number {
  switch (model.type) {
    case 'ohmic': return voltage * model.conductance;
    case 'current': return model.current;
    // A 1 Ω forward slope and a 1 GΩ reverse slope are a simple DC approximation.
    case 'diode': return voltage * OFF_CONDUCTANCE + Math.max(voltage - model.knee, 0) * FORWARD_ADDITIONAL_CONDUCTANCE;
    default: return 0;
  }
}

function difference({ a, b }: Branch, nodes: Record<string, number>): number {
  return nodes[a] - nodes[b];
}

function solveDevices(nodes: string[], devices: Device[], references: Set<string>) {
  const diodes = devices.filter((device) => device.model.type === 'diode');
  const active = (voltages: Record<string, number>) => new Set(
    diodes.filter((device) => device.model.type === 'diode' && difference(device, voltages) > device.model.knee)
      .map(({ id }) => id),
  );
  let solution = solveMna(nodes, devices, references, new Set());
  if (!solution) return { error: 'Singular or ill-conditioned circuit: the DC equations have no reliable unique solution.' };
  if (diodes.length === 0) return { solution };

  let voltages = solution.nodes;
  for (let iteration = 0; iteration < 64; iteration++) {
    const forward = active(voltages);
    solution = solveMna(nodes, devices, references, forward);
    if (!solution) break;
    const next = solution.nodes;
    const nextForward = active(next);
    if (diodes.every(({ id }) => forward.has(id) === nextForward.has(id))) return { solution };

    // The full Newton step crosses a diode knee. The DC laws are monotone, so
    // bisect the directional derivative of the circuit's convex energy.
    const steps = devices.filter(({ model }) => model.type !== 'ideal' && model.type !== 'open')
      .map((device) => {
        const start = difference(device, voltages);
        return { model: device.model, start, delta: difference(device, next) - start };
      });
    const derivative = (t: number) => steps.reduce((sum, { model, start, delta }) =>
      sum + current(model, start + t * delta) * delta, 0);
    let t = 1;
    if (derivative(t) > 0) {
      let lo = 0;
      let hi = 1;
      for (let step = 0; step < 40; step++) {
        const mid = (lo + hi) / 2;
        if (derivative(mid) > 0) hi = mid;
        else lo = mid;
      }
      t = (lo + hi) / 2;
    }
    voltages = Object.fromEntries(nodes.map((node) => [node, voltages[node] + t * (next[node] - voltages[node])]));
  }
  return { error: 'Diode operating point did not converge.' };
}

/**
 * Solve a static DC netlist in SI units. Voltage is Va − Vb, positive current
 * flows a → b, and positive power is absorbed. A fuse trips for the remainder
 * of this solve; callers may set closed=false to persist the open state.
 */
export function solve(branches: Branch[]): SolveResult {
  const ids = new Set<string>();
  for (const { id, kind, a, b, value, position } of branches) {
    if (!id || ids.has(id) || !a || !b) return error(`Invalid or duplicate branch identifier or terminal at ${id}.`);
    ids.add(id);
    if (!Number.isFinite(value) || (kind !== 'voltage' && kind !== 'current' && value < 0)
      || (kind === 'potentiometer' && position !== undefined && !(position >= 0 && position <= 1))) {
      return error(`Invalid component value at ${id}.`);
    }
  }
  if (branches.length === 0) return { ok: true, nodes: { '0': 0 }, branches: {}, balance: 0, warnings: [] };
  const nodes = [...new Set(branches.flatMap(({ a, b }) => [a, b]))];
  if (!nodes.includes('0')) return error('Missing ground: connect a ground reference to the circuit.');
  const reachable = new Set<string>();
  connected(graph(nodes, branches), '0', reachable);
  const floating = nodes.find((node) => !reachable.has(node));
  if (floating !== undefined) return error(`Floating component at node ${floating}: disconnected from the ground reference.`);

  const trips = new Set<string>();
  const fuseWarnings: string[] = [];
  for (;;) {
    const devices = branches.map((branch) => ({ ...branch, model: modelBranch(branch, trips) }));
    const conflict = checkIdealConstraints(devices);
    if (conflict) return error(conflict);
    const reference = getReferences(nodes, devices);
    if (reference.error !== undefined) return error(reference.error);
    const result = solveDevices(nodes, devices, reference.references);
    if (result.error !== undefined) return error(result.error);
    const { nodes: voltages, idealCurrents } = result.solution;
    const readings = devices.map((device): [string, BranchReading] => {
      // Normalize negative zero for display without hiding nonfinite values.
      const voltage = difference(device, voltages) + 0;
      const amps = (idealCurrents.get(device.id) ?? current(device.model, voltage)) + 0;
      return [device.id, { voltage, current: amps, power: voltage * amps + 0 }];
    });
    const balance = readings.reduce((sum, [, reading]) => sum + reading.power, 0);
    if (!Number.isFinite(balance) || readings.some(([, reading]) =>
      !Number.isFinite(reading.voltage) || !Number.isFinite(reading.current))) {
      return error('The DC operating point exceeded the numeric range.');
    }

    const pending = devices.filter(({ kind, model, id, value }) =>
      kind === 'fuse' && model.type === 'ideal' && Math.abs(idealCurrents.get(id) ?? 0) > value * (1 + RELATIVE_TOLERANCE));
    if (pending.length === 0) {
      return {
        ok: true,
        nodes: voltages,
        branches: Object.fromEntries(readings),
        balance,
        warnings: [...fuseWarnings, ...reference.warnings],
      };
    }
    for (const fuse of pending) {
      trips.add(fuse.id);
      fuseWarnings.push(`Fuse ${fuse.id} tripped (limit ${fuse.value} A).`);
    }
  }
}
