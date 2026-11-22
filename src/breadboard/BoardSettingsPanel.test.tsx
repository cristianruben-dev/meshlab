// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { translate } from '../locale'
import { BoardSettingsPanel } from './BoardSettingsPanel'
import { defaultBoardSettings, type BoardSettings } from './settings'

afterEach(cleanup)
const english = (text: string) => text
const disabled = (element: HTMLElement) => element.getAttribute('aria-disabled') === 'true' || element.hasAttribute('disabled') || element.hasAttribute('data-disabled')

function mount(value: BoardSettings, t = english) {
  const onChange = vi.fn<(value: BoardSettings) => void>()
  render(<BoardSettingsPanel t={t} value={value} onChange={onChange} />)
  return onChange
}

it('offers the three standard sizes with their tie points', () => {
  const onChange = mount(defaultBoardSettings)
  const half = screen.getByRole('radio', { name: /Half.*400 tie points/ }) as HTMLInputElement
  expect(half.checked).toBe(true)
  expect(screen.getByRole('radio', { name: /Mini.*170 tie points/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('radio', { name: /Full.*830 tie points/ }))
  expect(onChange).toHaveBeenCalledWith({ ...defaultBoardSettings, size: 'full' })
})

it('toggles rails and labels and only enables split rails on a full board with rails', () => {
  let onChange = mount(defaultBoardSettings)
  expect(disabled(screen.getByRole('switch', { name: 'Split power rails' }))).toBe(true)
  expect(disabled(screen.getByRole('switch', { name: 'Power rails' }))).toBe(false)
  fireEvent.click(screen.getByRole('switch', { name: 'Power rails' }))
  expect(onChange).toHaveBeenLastCalledWith({ ...defaultBoardSettings, rails: false })
  fireEvent.click(screen.getByRole('switch', { name: 'Socket labels' }))
  expect(onChange).toHaveBeenLastCalledWith({ ...defaultBoardSettings, labels: false })
  cleanup()
  onChange = mount({ ...defaultBoardSettings, size: 'full' })
  fireEvent.click(screen.getByRole('switch', { name: 'Split power rails' }))
  expect(onChange).toHaveBeenLastCalledWith({ ...defaultBoardSettings, size: 'full', splitRails: true })
})

it('explains that a mini board has no power rails', () => {
  mount({ ...defaultBoardSettings, size: 'mini' })
  const rails = screen.getByRole('switch', { name: 'Power rails' })
  expect(rails.getAttribute('aria-checked')).toBe('false')
  expect(disabled(rails)).toBe(true)
})

it('renders in Spanish', () => {
  mount(defaultBoardSettings, text => translate('es', text))
  expect(screen.getByRole('radio', { name: /Media.*400 puntos de conexión/ })).toBeTruthy()
  expect(screen.getByRole('switch', { name: 'Rieles de alimentación' })).toBeTruthy()
})
