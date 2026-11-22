import type { Circuit, Component, Endpoint, Junction, Kind, Point, Wire } from './model'

const part = (id: string, kind: Kind, value: number, x: number, y: number, rotation = 0): Component =>
  ({ id, kind, label: id, value, x, y, rotation })
const pin = (component: string, number: 0 | 1 = 0): Endpoint => ({ component, pin: number })
const node = (junction: string): Endpoint => ({ junction })
const at = (x: number, y: number): Point => ({ x, y })
const circuit = (components: Component[], junctions: Junction[], connections: [Endpoint, Endpoint, ...Point[]][]): Circuit => {
  const wires: Wire[] = connections.map(([from, to, ...points], i) => ({
    id: `wire-${i + 1}`, from, to, ...(points.length ? { points } : {}),
  }))
  return { version: 1, components, wires, junctions }
}

export const examples: Record<string, Circuit> = {
  'Voltage Divider': circuit([
    part('V1', 'voltage', 12, 180, 280, 90),
    part('R1', 'resistor', 1_000, 320, 180),
    part('R2', 'resistor', 2_000, 580, 280, 90),
    part('GND', 'ground', 0, 380, 460, 90),
  ], [
    { id: 'output', x: 480, y: 180 },
    { id: 'return', x: 380, y: 400 },
  ], [
    [pin('V1'), pin('R1'), at(180, 180)],
    [pin('R1', 1), node('output')],
    [node('output'), pin('R2'), at(580, 180)],
    [pin('R2', 1), node('return'), at(580, 400)],
    [node('return'), pin('V1', 1), at(180, 400)],
    [node('return'), pin('GND')],
  ]),

  'Wheatstone Bridge': circuit([
    part('V1', 'voltage', 10, 120, 280, 90),
    part('R1', 'resistor', 1_000, 280, 200, 90),
    part('R2', 'resistor', 2_000, 280, 360, 90),
    part('R3', 'resistor', 1_000, 600, 200, 90),
    part('R4', 'resistor', 2_000, 600, 360, 90),
    part('R5', 'resistor', 1_000, 440, 280),
    part('GND', 'ground', 0, 440, 480, 90),
  ], [
    { id: 'top', x: 280, y: 140 },
    { id: 'left', x: 280, y: 280 },
    { id: 'right', x: 600, y: 280 },
    { id: 'bottom', x: 280, y: 420 },
    { id: 'return', x: 440, y: 420 },
  ], [
    [pin('V1'), node('top'), at(120, 140)],
    [node('top'), pin('R1')],
    [node('top'), pin('R3'), at(600, 140)],
    [pin('R1', 1), node('left')],
    [pin('R3', 1), node('right')],
    [node('left'), pin('R5')],
    [pin('R5', 1), node('right')],
    [node('left'), pin('R2')],
    [node('right'), pin('R4')],
    [pin('R2', 1), node('bottom')],
    [pin('R4', 1), node('return'), at(600, 420)],
    [node('return'), node('bottom')],
    [node('bottom'), pin('V1', 1), at(120, 420)],
    [node('return'), pin('GND')],
  ]),

  'Two Sources': circuit([
    part('V1', 'voltage', 12, 140, 280, 90),
    part('V2', 'voltage', 6, 660, 280, 90),
    part('R1', 'resistor', 1_000, 260, 180),
    part('R2', 'resistor', 2_000, 540, 180, 180),
    part('R3', 'resistor', 1_000, 400, 280, 90),
    part('GND', 'ground', 0, 400, 480, 90),
  ], [
    { id: 'sum', x: 400, y: 180 },
    { id: 'return', x: 400, y: 420 },
  ], [
    [pin('V1'), pin('R1'), at(140, 180)],
    [pin('V2'), pin('R2'), at(660, 180)],
    [pin('R1', 1), node('sum')],
    [pin('R2', 1), node('sum')],
    [node('sum'), pin('R3')],
    [pin('R3', 1), node('return')],
    [node('return'), pin('V1', 1), at(140, 420)],
    [node('return'), pin('V2', 1), at(660, 420)],
    [node('return'), pin('GND')],
  ]),

  'LED + Switch': circuit([
    part('V1', 'voltage', 5, 160, 280, 90),
    { ...part('S1', 'switch', 0, 300, 180), closed: true },
    part('R1', 'resistor', 330, 480, 180),
    part('D1', 'led', 2, 640, 280, 90),
    part('GND', 'ground', 0, 400, 460, 90),
  ], [
    { id: 'return', x: 400, y: 400 },
  ], [
    [pin('V1'), pin('S1'), at(160, 180)],
    [pin('S1', 1), pin('R1')],
    [pin('R1', 1), pin('D1'), at(640, 180)],
    [pin('D1', 1), node('return'), at(640, 400)],
    [node('return'), pin('V1', 1), at(160, 400)],
    [node('return'), pin('GND')],
  ]),
}
