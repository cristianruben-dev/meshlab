// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { translate, type Language } from '../locale'
import { ResistorColorModal } from './ResistorColorTool'

afterEach(cleanup)

function renderModal(
  overrides: Partial<React.ComponentProps<typeof ResistorColorModal>> = {},
  language: Language = 'en',
) {
  const onClose = vi.fn()
  const props: React.ComponentProps<typeof ResistorColorModal> = {
    open: true,
    language,
    t: text => translate(language, text),
    onClose,
    ...overrides,
  }
  const result = render(<ResistorColorModal {...props} />)
  return { ...result, onClose }
}

describe('ResistorColorModal', () => {
  it('renders 4-band default (4.7 kΩ ±5%), updates nominal value when picking band colors, and switches to 5 bands', () => {
    renderModal()
    const dialog = screen.getByRole('dialog', { name: 'Resistor color code' })
    expect(dialog.textContent).toContain('4.7 kΩ')
    expect(dialog.textContent).toContain('±5%')
    expect(dialog.textContent).toContain('E12 / E24')

    // Click 1st digit tab / change from Yellow (4) to Brown (1) => 1.7 kΩ
    const swatchGroup = screen.getByRole('group', { name: 'Select color: 1st digit' })
    fireEvent.click(within(swatchGroup).getByRole('button', { name: /Brown/ }))
    expect(dialog.textContent).toContain('1.7 kΩ')

    // Switch to 5 bands and verify 5 band tabs appear
    fireEvent.click(screen.getByRole('button', { name: '5 bands' }))
    expect(screen.getAllByRole('tab')).toHaveLength(5)
    expect(dialog.textContent).toContain('1.7 kΩ')
  })

  it('supports Value -> Colors mode with RKM shorthand and nearest E12/E24 standard snapping', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Value → Colors' }))
    const input = screen.getByRole('textbox', { name: 'Resistance value' })

    // Type RKM shorthand 330R
    fireEvent.change(input, { target: { value: '330R' } })
    expect(screen.getByRole('img', { name: /330 Ω/ })).toBeTruthy()

    // Type a non-standard value 5k and snap to E24 (5.1 kΩ)
    fireEvent.change(input, { target: { value: '5k' } })
    const e24Button = screen.getByRole('button', { name: /E24:.*5\.1 kΩ/ })
    fireEvent.click(e24Button)
    expect(screen.getByRole('img', { name: /5\.1 kΩ/ })).toBeTruthy()
  })

  it('supports Spanish translations and editor integration callbacks (Apply & Add)', () => {
    const onApplyToResistor = vi.fn()
    const onAddResistor = vi.fn()
    const { onClose } = renderModal(
      {
        initialOhms: 1000,
        targetResistorLabel: 'R1',
        onApplyToResistor,
        onAddResistor,
      },
      'es',
    )

    const dialog = screen.getByRole('dialog', { name: 'Código de colores de resistencias' })
    expect(dialog.textContent).toContain('1 kΩ')

    // Change 1st digit from Brown (1) to Red (2) => 2 kΩ
    const swatches = screen.getByRole('group', { name: /Seleccionar color/ })
    fireEvent.click(within(swatches).getByRole('button', { name: /Rojo/ }))
    expect(dialog.textContent).toContain('2 kΩ')

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a R1' }))
    expect(onApplyToResistor).toHaveBeenCalledWith(2000)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape key', () => {
    const { onClose } = renderModal()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
