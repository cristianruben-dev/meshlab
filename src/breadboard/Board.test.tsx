// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { compile } from '../circuit/model'
import { examples } from '../circuit/examples'
import Board from './Board'
import { matchesGuide } from './model'
import { defaultBoardSettings } from './settings'

afterEach(cleanup)

function mount(name: string) {
  const circuit = examples[name]
  const onLoad = vi.fn()
  render(<Board t={text => text} theme="light" guide={matchesGuide(circuit)} settings={defaultBoardSettings} circuit={circuit}
    pins={compile(circuit).nodeByPin} readings={undefined} currents={undefined} selected={[]} onSelect={vi.fn()} onToggle={vi.fn()} onLoad={onLoad} />)
  return onLoad
}

it('explains that the board needs WebGL instead of drawing a fallback', () => {
  mount('Voltage Divider')
  expect(screen.getByRole('status').textContent).toBe('The 3D breadboard needs WebGL, which is not available in this browser.')
  expect(screen.queryByRole('application')).toBeNull()
})

it('offers the supported examples when the circuit has no breadboard layout', () => {
  const onLoad = mount('Wheatstone Bridge')
  expect(screen.getByRole('heading', { name: 'Start with a supported circuit' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /LED \+ Switch/ }))
  expect(onLoad).toHaveBeenCalledWith('LED + Switch')
})
