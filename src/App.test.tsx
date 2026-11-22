// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { examples } from './circuit/examples'

beforeEach(() => { localStorage.clear(); document.documentElement.lang = 'en' })
afterEach(cleanup)

describe('circuit workbench', () => {
  it('loads the saved Spanish interface without changing circuit measurements', () => {
    localStorage.setItem('meshlab:language', 'es')
    render(<App />)
    expect(document.documentElement.lang).toBe('es')
    expect(screen.getByRole('heading', { name: 'Circuito' })).toBeTruthy()
    const branches = within(screen.getByRole('table', { name: 'Mediciones por componente' }))
    expect(branches.getAllByText('4 mA')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Resistencia' }))
    expect(screen.getByRole('alert').textContent).toMatch(/flotante/i)
  })

  it('simulates RC charging, freezes the trace when paused, and resets the scope', () => {
    vi.useFakeTimers()
    try {
      localStorage.setItem('meshlab:circuit:v1', JSON.stringify(examples['RC Charging']))
      render(<App />)
      const trace = screen.getByRole('img', { name: 'Voltage versus time' })
      act(() => vi.advanceTimersByTime(1000))
      expect(trace.querySelector('polyline')?.getAttribute('points')?.split(' ').length).toBeGreaterThan(20)
      fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
      const time = screen.getByLabelText('Simulation time').textContent
      act(() => vi.advanceTimersByTime(1000))
      expect(screen.getByLabelText('Simulation time').textContent).toBe(time)
      fireEvent.click(screen.getByRole('button', { name: 'Reset transient' }))
      expect(screen.getByLabelText('Simulation time').textContent).toBe('0 s')
      expect(screen.getByText('Awaiting a transient sample')).toBeTruthy()
      expect(screen.queryByRole('table', { name: 'Component readings' })).toBeNull()
      expect(screen.queryByRole('img', { name: 'Voltage versus time' })?.querySelector('polyline')).toBeNull()
    } finally { vi.useRealTimers() }
  })

  it('switches light and dark themes, persists the choice, and repaints the schematic', () => {
    localStorage.setItem('meshlab:theme', 'light')
    const { container } = render(<App />)
    const background = () => container.querySelector('svg.schematic > rect')!.getAttribute('fill')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    const light = background()
    const themes = within(screen.getByRole('group', { name: 'Theme' }))
    expect(themes.getByRole('button', { name: 'Light theme' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(themes.getByRole('button', { name: 'Dark theme' }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('meshlab:theme')).toBe('dark')
    expect(background()).not.toBe(light)
    fireEvent.click(themes.getByRole('button', { name: 'System theme' }))
    expect(localStorage.getItem('meshlab:theme')).toBeNull()
    const branches = within(screen.getByRole('table', { name: 'Component readings' }))
    expect(branches.getAllByText('4 mA')).toHaveLength(2)
  })

  it('filters the component library by name and restores all options when cleared', () => {
    render(<App />)
    const search = screen.getByRole('searchbox', { name: 'Find components' })
    fireEvent.change(search, { target: { value: 'resist' } })
    expect(screen.getByRole('button', { name: 'Resistor' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'DC Voltage' })).toBeNull()
    fireEvent.change(search, { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'DC Voltage' })).toBeTruthy()
  })

  it('renders a live divider and freezes the displayed calculation when paused', () => {
    render(<App />)
    const branches = within(screen.getByRole('table', { name: 'Component readings' }))
    expect(branches.getAllByText('4 mA')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    fireEvent.click(screen.getByRole('button', { name: 'Resistor' }))
    expect(screen.getByText('PAUSED')).toBeTruthy()
    expect(branches.getAllByText('4 mA')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Run simulation' }))
    expect(screen.getByRole('alert').textContent).toMatch(/floating/i)
  })

  it('undoes new circuits and autosaves committed edits, not prior snapshots', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'New' }))
    expect(screen.getByText('Start a new circuit')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByText('LIVE DC')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Resistor' }))
    expect(JSON.parse(localStorage.getItem('meshlab:circuit:v1')!).components).toHaveLength(5)
    fireEvent.keyDown(window, { key: 'r' })
    const saved = JSON.parse(localStorage.getItem('meshlab:circuit:v1')!)
    expect(saved.components.at(-1).rotation).toBe(90)
  })

  it('cancels a wire started on a segment without persisting a junction', () => {
    const { container } = render(<App />)
    const svg = container.querySelector('svg.schematic')!
    const hitPath = svg.querySelector('.wire path[data-export="hide"]')!
    const before = localStorage.getItem('meshlab:circuit:v1')
    fireEvent.click(screen.getByRole('button', { name: 'Wire (W)' }))
    fireEvent.pointerDown(hitPath, { button: 0, clientX: 180, clientY: 220 })
    expect(screen.getByText('Select a terminal or wire to connect')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(localStorage.getItem('meshlab:circuit:v1')).toBe(before)
  })

  it('changes the switch and recalculates the LED example without reloading', () => {
    localStorage.setItem('meshlab:circuit:v1', JSON.stringify(examples['LED + Switch']))
    render(<App />)
    const title = screen.getByText(/^S1 · V\(a\)/)
    fireEvent.pointerDown(title.parentElement!, { button: 0, pointerId: 1 })
    const control = screen.getByRole('switch', { name: 'Switch closed' })
    expect(control.getAttribute('aria-checked')).toBe('true')
    fireEvent.pointerUp(title.closest('svg')!, { button: 0, pointerId: 1 })
    expect(control.getAttribute('aria-checked')).toBe('false')
    const row = screen.getByRole('row', { name: /^D1 / })
    expect(within(row).getByText('0 A')).toBeTruthy()
  })

  it('pins and unpins a panel, docking the editor and persisting the layout after a remount', () => {
    const { container, unmount } = render(<App />)
    const workbench = () => container.querySelector<HTMLElement>('.workbench')!
    const pin = screen.getByRole('button', { name: 'Pin Library' })
    expect(pin.getAttribute('aria-pressed')).toBe('true')
    expect(workbench().dataset.dockLeft).toBe('true')
    fireEvent.click(pin)
    expect(screen.getByRole('button', { name: 'Pin Library' }).getAttribute('aria-pressed')).toBe('false')
    expect(workbench().dataset.dockLeft).toBe('false')
    expect(JSON.parse(localStorage.getItem('meshlab:panels')!).wide.library).toEqual({ open: true, pinned: false })
    unmount()
    render(<App />)
    expect(screen.getByRole('button', { name: 'Pin Library' }).getAttribute('aria-pressed')).toBe('false')
    expect(document.querySelector<HTMLElement>('.workbench')!.dataset.dockLeft).toBe('false')
    expect(screen.getByRole('button', { name: 'Pin Inspector' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('closes a panel and reopens it from the launcher', () => {
    render(<App />)
    const launcher = screen.getByRole('button', { name: 'Library' })
    expect(launcher.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Close Library' }))
    expect(screen.queryByRole('searchbox', { name: 'Find components' })).toBeNull()
    expect(launcher.getAttribute('aria-pressed')).toBe('false')
    expect(document.activeElement).toBe(launcher)
    fireEvent.click(launcher)
    expect(screen.getByRole('searchbox', { name: 'Find components' })).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('meshlab:panels')!).wide.library.open).toBe(true)
  })

  it('closes a floating panel with Escape only while focus is inside it', () => {
    render(<App />)
    const results = screen.getByRole('region', { name: 'Simulation results' })
    fireEvent.click(screen.getByRole('button', { name: 'Wire (W)' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('region', { name: 'Simulation results' })).toBe(results)
    expect(screen.getByRole('button', { name: 'Select and move' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(within(results).getByRole('button', { name: 'Pin Results' }), { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Simulation results' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Results' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pin Results' }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Pin Results' }), { key: 'Escape' })
    expect(screen.getByRole('region', { name: 'Simulation results' })).toBeTruthy()
  })
})
