// @vitest-environment happy-dom

import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { examples } from './circuit/examples'
import { WORKSPACE_DB_NAME } from './storage/db'
import { LEGACY_CIRCUIT_KEY } from './storage/migrate'

/** Screen tiers follow the viewport width: phone < 640 px, tablet 640–1099 px, desktop from 1100 px. */
const viewport = (width: number) =>
  (window as unknown as { happyDOM: { setViewport: (size: { width: number; height: number }) => void } }).happyDOM.setViewport({ width, height: 800 })

async function clearWorkspaceDb() {
  await new Promise<void>(resolve => {
    const req = indexedDB.deleteDatabase(WORKSPACE_DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

async function openTemplateFromHub(template: string, language: 'en' | 'es' = 'en') {
  const result = render(<App />)
  const title = language === 'es' ? 'Mis Proyectos' : 'My Projects'
  await screen.findByRole('heading', { name: title })
  const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  fireEvent.click(screen.getByRole('button', { name: new RegExp(escaped) }))
  await screen.findByRole('group', { name: language === 'es' ? 'HERRAMIENTAS DEL ESQUEMA' : 'SCHEMATIC TOOLS' })
  return result
}

beforeEach(async () => {
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  document.documentElement.lang = 'en'
  viewport(1280)
  await clearWorkspaceDb()
})

afterEach(cleanup)

describe('local projects hub & multi-project workspace', () => {
  it('starts on the Projects Hub without forcing an example circuit and allows creating and switching two open projects', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'My Projects' })
    expect(screen.getByRole('heading', { name: 'Your local circuit workspace' })).toBeTruthy()

    // Create blank project A
    fireEvent.click(screen.getByRole('button', { name: 'New project' }))
    const dialog = screen.getByRole('dialog', { name: 'New project' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Project name' }), { target: { value: 'Blank Project' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create project' }))

    await screen.findByText('Start a new circuit')
    expect(screen.getByRole('tab', { name: 'Blank Project' }).getAttribute('aria-selected')).toBe('true')

    // Return to Hub and open Voltage Divider template as a second project
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }))
    await screen.findByRole('heading', { name: 'My Projects' })
    expect(screen.getByRole('button', { name: 'Blank Project' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Voltage Divider/ }))

    await screen.findByRole('table', { name: 'Component readings' })
    expect(screen.getByRole('tab', { name: 'Voltage Divider' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Blank Project' }).getAttribute('aria-selected')).toBe('false')

    // Switch back to Blank Project tab — state must remain isolated
    fireEvent.click(screen.getByRole('tab', { name: 'Blank Project' }))
    await screen.findByText('Start a new circuit')
    expect(screen.queryByRole('table', { name: 'Component readings' })).toBeNull()

    // Switch back to Voltage Divider tab — readings are intact
    fireEvent.click(screen.getByRole('tab', { name: 'Voltage Divider' }))
    const branches = within(await screen.findByRole('table', { name: 'Component readings' }))
    expect(branches.getAllByText('4 mA')).toHaveLength(2)
  })

  it('migrates legacy localStorage circuit automatically into the Projects Hub', async () => {
    localStorage.setItem(LEGACY_CIRCUIT_KEY, JSON.stringify(examples['LED + Switch']))
    render(<App />)
    await screen.findByRole('heading', { name: 'My Projects' })
    const recovered = await screen.findByRole('button', { name: 'Recovered Circuit' })
    fireEvent.click(recovered)
    const row = await screen.findByRole('row', { name: /^D1 / })
    expect(row).toBeTruthy()
  })
})

describe('circuit workbench', () => {
  it('loads the saved Spanish interface without changing circuit measurements', async () => {
    localStorage.setItem('meshlab:language', 'es')
    await openTemplateFromHub('Divisor de tensión', 'es')
    expect(document.documentElement.lang).toBe('es')
    expect(screen.getByRole('heading', { name: 'Circuito' })).toBeTruthy()
    const branches = within(screen.getByRole('table', { name: 'Mediciones por componente' }))
    expect(branches.getAllByText('4 mA')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Resistencia' }))
    expect(screen.getByRole('alert').textContent).toMatch(/flotante/i)
  })

  it('simulates RC charging, freezes the trace when paused, and resets the scope', async () => {
    localStorage.setItem(LEGACY_CIRCUIT_KEY, JSON.stringify(examples['RC Charging']))
    render(<App />)
    const recovered = await screen.findByRole('button', { name: 'Recovered Circuit' })
    vi.useFakeTimers()
    try {
      await act(async () => { fireEvent.click(recovered) })
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

  it('switches light and dark themes, persists the choice, and repaints the schematic', async () => {
    localStorage.setItem('meshlab:theme', 'light')
    const { container } = await openTemplateFromHub('Voltage Divider')
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

  it('filters the component library by name and restores all options when cleared', async () => {
    await openTemplateFromHub('Voltage Divider')
    const search = screen.getByRole('searchbox', { name: 'Find components' })
    fireEvent.change(search, { target: { value: 'resist' } })
    expect(screen.getByRole('button', { name: 'Resistor' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'DC Voltage' })).toBeNull()
    fireEvent.change(search, { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'DC Voltage' })).toBeTruthy()
  })

  it('renders a live divider and freezes the displayed calculation when paused', async () => {
    await openTemplateFromHub('Voltage Divider')
    const branches = within(screen.getByRole('table', { name: 'Component readings' }))
    expect(branches.getAllByText('4 mA')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    fireEvent.click(screen.getByRole('button', { name: 'Resistor' }))
    expect(screen.getByText('PAUSED')).toBeTruthy()
    expect(branches.getAllByText('4 mA')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Run simulation' }))
    expect(screen.getByRole('alert').textContent).toMatch(/floating/i)
  })

  it('undoes new circuits and autosaves committed edits to IndexedDB', async () => {
    const { unmount } = await openTemplateFromHub('Voltage Divider')
    fireEvent.click(screen.getByRole('button', { name: 'New' }))
    expect(screen.getByText('Start a new circuit')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByText('LIVE DC')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Resistor' }))
    fireEvent.keyDown(window, { key: 'r' })
    // Return to Hub flushes pending IndexedDB writes immediately
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }))
    await screen.findByRole('heading', { name: 'My Projects' })
    expect(screen.getByText('5 parts · 6 wires')).toBeTruthy()
    unmount()
  })

  it('cancels a wire started on a segment without persisting a junction', async () => {
    const { container } = await openTemplateFromHub('Voltage Divider')
    const svg = container.querySelector('svg.schematic')!
    const hitPath = svg.querySelector('.wire path[data-export="hide"]')!
    fireEvent.click(screen.getByRole('button', { name: 'Wire (W)' }))
    fireEvent.pointerDown(hitPath, { button: 0, clientX: 180, clientY: 220 })
    expect(screen.getByText('Select a terminal or wire to connect')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByText('4 parts · 6 wires')).toBeTruthy()
  })

  it('changes the switch and recalculates the LED example without reloading', async () => {
    await openTemplateFromHub('LED + Switch')
    const title = screen.getByText(/^S1 · V\(a\)/)
    fireEvent.pointerDown(title.parentElement!, { button: 0, pointerId: 1 })
    const control = screen.getByRole('switch', { name: 'Switch closed' })
    expect(control.getAttribute('aria-checked')).toBe('true')
    fireEvent.pointerUp(title.closest('svg')!, { button: 0, pointerId: 1 })
    expect(control.getAttribute('aria-checked')).toBe('false')
    const row = screen.getByRole('row', { name: /^D1 / })
    expect(within(row).getByText('0 A')).toBeTruthy()
  })

  it('pins and unpins a panel, docking the editor and persisting the layout after a remount', async () => {
    const { container, unmount } = await openTemplateFromHub('Voltage Divider')
    const workbench = () => container.querySelector<HTMLElement>('.workbench')!
    const pin = screen.getByRole('button', { name: 'Pin Library' })
    expect(pin.getAttribute('aria-pressed')).toBe('true')
    expect(workbench().dataset.dockLeft).toBe('true')
    fireEvent.click(pin)
    expect(screen.getByRole('button', { name: 'Pin Library' }).getAttribute('aria-pressed')).toBe('false')
    expect(workbench().dataset.dockLeft).toBe('false')
    expect(JSON.parse(localStorage.getItem('meshlab:panels')!).desktop.schematic.library).toEqual({ open: true, pinned: false })
    unmount()
    render(<App />)
    await screen.findByRole('button', { name: 'Pin Library' })
    expect(screen.getByRole('button', { name: 'Pin Library' }).getAttribute('aria-pressed')).toBe('false')
    expect(document.querySelector<HTMLElement>('.workbench')!.dataset.dockLeft).toBe('false')
    expect(screen.getByRole('button', { name: 'Pin Inspector' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('closes a panel and reopens it from the launcher', async () => {
    await openTemplateFromHub('Voltage Divider')
    const launcher = screen.getByRole('button', { name: 'Library' })
    expect(launcher.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Close Library' }))
    expect(screen.queryByRole('searchbox', { name: 'Find components' })).toBeNull()
    expect(launcher.getAttribute('aria-pressed')).toBe('false')
    expect(document.activeElement).toBe(launcher)
    fireEvent.click(launcher)
    expect(screen.getByRole('searchbox', { name: 'Find components' })).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('meshlab:panels')!).desktop.schematic.library.open).toBe(true)
  })

  it('closes a floating panel with Escape only while focus is inside it', async () => {
    await openTemplateFromHub('Voltage Divider')
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

  it('keeps a separate tablet layout with at most one pinned side panel and restores it after a remount', async () => {
    viewport(1024)
    const { container, unmount } = await openTemplateFromHub('Voltage Divider')
    const workbench = () => container.querySelector<HTMLElement>('.workbench')!
    expect(workbench().dataset.tier).toBe('tablet')
    expect(screen.queryByRole('region', { name: 'Components' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    expect(screen.getByRole('button', { name: 'Pin Library' }).getAttribute('aria-pressed')).toBe('false')
    expect(workbench().dataset.dockLeft).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Pin Library' }))
    expect(workbench().dataset.dockLeft).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Inspector' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pin Inspector' }))
    expect(workbench().dataset.dockRight).toBe('true')
    expect(workbench().dataset.dockLeft).toBe('false')
    expect(screen.getByRole('button', { name: 'Pin Library' }).getAttribute('aria-pressed')).toBe('false')
    const saved = JSON.parse(localStorage.getItem('meshlab:panels')!)
    expect(saved.tablet.schematic.inspector).toEqual({ open: true, pinned: true })
    expect(saved.tablet.schematic.library).toEqual({ open: true, pinned: false })
    expect(saved.desktop.schematic.library).toEqual({ open: true, pinned: true })
    unmount()
    render(<App />)
    await screen.findByRole('button', { name: 'Pin Inspector' })
    expect(screen.getByRole('button', { name: 'Pin Inspector' }).getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector<HTMLElement>('.workbench')!.dataset.dockRight).toBe('true')
  })

  it('migrates the earlier wide and compact layouts and falls back to defaults for invalid saved state', async () => {
    localStorage.setItem('meshlab:panels', JSON.stringify({ wide: { library: { open: false, pinned: true }, inspector: 'broken' }, compact: null }))
    const { unmount } = await openTemplateFromHub('Voltage Divider')
    expect(screen.queryByRole('region', { name: 'Components' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Library' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Pin Inspector' }).getAttribute('aria-pressed')).toBe('true')
    unmount()
    localStorage.setItem('meshlab:panels', '{not json')
    render(<App />)
    await screen.findByRole('button', { name: 'Pin Library' })
    expect(screen.getByRole('button', { name: 'Pin Library' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('opens the More actions menu on narrow screens with file, theme, and language controls, and closes it with Escape', async () => {
    viewport(390)
    await openTemplateFromHub('Voltage Divider')
    expect(screen.queryByRole('combobox', { name: 'Circuit examples' })).toBeNull()
    const more = screen.getByRole('button', { name: 'More actions' })
    await act(async () => { fireEvent.click(more) })
    const menu = await screen.findByRole('dialog', { name: 'More actions' })
    for (const name of ['New', 'Import', 'JSON', 'PNG']) expect(within(menu).getByRole('button', { name })).toBeTruthy()
    expect(within(menu).getByRole('combobox', { name: 'Circuit examples' })).toBeTruthy()
    expect(within(menu).getByRole('combobox', { name: 'Language' })).toBeTruthy()
    const themes = within(within(menu).getByRole('group', { name: 'Theme' }))
    fireEvent.click(themes.getByRole('button', { name: 'Dark theme' }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    await act(async () => { fireEvent.keyDown(themes.getByRole('button', { name: 'Light theme' }), { key: 'Escape' }) })
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'More actions' })).toBeNull())
  })
})
