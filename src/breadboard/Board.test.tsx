// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useState } from 'react'
import type { Circuit } from '../circuit/model'
import { examples } from '../circuit/examples'
import { solve } from '../engine/solver'
import Board from './Board'
import { autoPlaceCircuit, compileBoard } from './compiler'
import { boardShape } from './model'
import { defaultBoardSettings } from './settings'
import type { BreadboardLayout } from './types'
import { useBreadboard } from './useBreadboard'

afterEach(cleanup)

function Harness({ initial, initialLayout }: { initial: Circuit; initialLayout?: BreadboardLayout }) {
  const [circuit, setCircuit] = useState<Circuit>(initial)
  const [selected, setSelected] = useState<string[]>([])
  const shape = boardShape(defaultBoardSettings)
  const layout = circuit.breadboard ?? initialLayout ?? (circuit.wires.length ? autoPlaceCircuit(circuit, shape) : { placements: [], jumpers: [] })
  const net = compileBoard(shape, circuit.components, layout)
  const solved = solve(net.branches)
  const board = useBreadboard({
    circuit,
    layout,
    shape,
    selected,
    onSelect: setSelected,
    onCommit: setCircuit,
  })
  return <Board
    t={text => text}
    theme="light"
    settings={defaultBoardSettings}
    circuit={circuit}
    layout={layout}
    board={board}
    pins={net.nodeByPin}
    readings={solved.ok ? solved.nodes : undefined}
    branchReadings={solved.ok ? solved.branches : undefined}
    selected={selected}
    onSelect={setSelected}
    onToggle={part => setCircuit(prev => ({
      ...prev,
      components: prev.components.map(c => c.id === part.id ? { ...c, closed: !c.closed } : c),
    }))}
  />
}

it('explains that the board needs WebGL instead of drawing a fallback', () => {
  render(<Harness initial={examples['Voltage Divider']} />)
  expect(screen.getByRole('status').textContent).toBe('The 3D breadboard needs WebGL, which is not available in this browser.')
  expect(screen.queryByRole('application')).toBeNull()
})

it('never blocks empty or custom circuits with the old supported-examples gate', () => {
  const empty: Circuit = { version: 1, components: [], wires: [], junctions: [] }
  render(<Harness initial={empty} />)
  expect(screen.queryByText('Start with a supported circuit')).toBeNull()
})

it('shows the unmounted schematic tray and lets the user start placement or auto-mount', () => {
  const unmounted: Circuit = {
    ...examples['Wheatstone Bridge'],
    breadboard: { placements: [], jumpers: [] },
  }
  render(<Harness initial={unmounted} />)
  const tray = screen.getByRole('region', { name: 'Unmounted schematic components' })
  expect(tray).toBeTruthy()
  const r5 = screen.getByRole('button', { name: /R5/ })
  fireEvent.click(r5)
  expect(screen.getByText(/Place Resistor: Select first pin socket/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByText(/Select first pin socket/)).toBeNull()

  // Clicking Auto-mount populates all components on the board and hides the tray.
  fireEvent.click(screen.getByRole('button', { name: 'Auto-mount' }))
  expect(screen.queryByRole('region', { name: 'Unmounted schematic components' })).toBeNull()
})

it('renders without error for circuits with all 13 component types mounted', () => {
  const circuit = examples['RC Charging']
  const onSelect = vi.fn()
  const shape = boardShape(defaultBoardSettings)
  const layout = autoPlaceCircuit(circuit, shape)
  expect(layout.placements).toHaveLength(4)
  render(<Harness initial={{ ...circuit, breadboard: layout }} />)
  expect(onSelect).not.toHaveBeenCalled()
})
