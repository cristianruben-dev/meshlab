import { expect, test, type Page } from '@playwright/test'
import { examples } from '../src/circuit/examples'
import { boardGuides, boardRows, boardShape } from '../src/breadboard/model'
import { defaultBoardSettings, type BoardSettings } from '../src/breadboard/settings'

const scene = (page: Page) => page.getByRole('application', { name: /Breadboard\. Drag to orbit/ })
const probe = (page: Page) => page.locator('.board-probe [role="status"]')

async function openBoard(page: Page, { settings, circuit, language }: { settings?: BoardSettings; circuit?: string; language?: 'es' } = {}) {
  await page.addInitScript(([settings, circuit, language]) => {
    if (settings) localStorage.setItem('meshlab:board', settings)
    if (circuit) localStorage.setItem('meshlab:circuit:v1', circuit)
    if (language) localStorage.setItem('meshlab:language', language)
  }, [settings && JSON.stringify(settings), circuit && JSON.stringify(examples[circuit]), language] as const)
  await page.goto('/')
  await page.getByRole('button', { name: language === 'es' ? 'Protoboard' : 'Breadboard', exact: true }).click()
}

/** Moves the keyboard cursor from A1 to a socket in a terminal row and probes it. */
async function probeWithKeyboard(page: Page, settings: BoardSettings, socket: string) {
  const rows = boardRows(boardShape(settings))
  const [, row, column] = /^([A-J])(\d+)$/.exec(socket)!
  await scene(page).focus()
  await page.keyboard.press('Enter')
  await expect(probe(page)).toContainText('A1 ·')
  for (let i = 1; i < Number(column); i++) await page.keyboard.press('ArrowRight')
  for (let i = rows.indexOf('A'); i < rows.indexOf(row); i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
}

test('probes the divider with the keyboard and selects parts from the 3D board', async ({ page }) => {
  await openBoard(page)
  await expect(scene(page).locator('canvas')).toBeVisible()
  // The results sheet starts closed on the board so it does not cover it; the launcher still opens it.
  await expect(page.getByRole('region', { name: 'Simulation results' })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Panels' }).getByRole('button', { name: 'Results', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(probe(page)).toHaveText('Select a socket')
  const divider = boardGuides.find(guide => guide.example === 'Voltage Divider')!
  const r2 = divider.place(boardShape(defaultBoardSettings)).find(item => item.part === 'R2')!.sockets[0]
  await probeWithKeyboard(page, defaultBoardSettings, r2)
  await expect(probe(page)).toHaveText(`${r2} · 8 V`)
  await expect(page.getByRole('textbox', { name: 'Label' })).toHaveValue('R2')

  const tag = scene(page).locator('.board3d-label', { hasText: 'R1' })
  await expect(tag).toBeVisible()
  const box = (await tag.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height + 9)
  await expect(page.getByRole('textbox', { name: 'Label' })).toHaveValue('R1')
  await page.getByRole('button', { name: 'Orbit right' }).click()
  await page.getByRole('button', { name: 'Reset 3D view' }).click()
  await expect(probe(page)).toHaveText(`${r2} · 8 V`)
})

test('restores the saved board size and changes it from the breadboard settings', async ({ page }) => {
  const full = { ...defaultBoardSettings, size: 'full', splitRails: true } as const
  await openBoard(page, { settings: full })
  await expect(page.locator('.board')).toHaveAttribute('data-size', 'full')
  const mini = page.getByRole('radio', { name: /Mini.*170/ })
  await expect(page.getByRole('radio', { name: /Full.*830/ })).toBeChecked()
  await mini.check()
  await expect(page.locator('.board')).toHaveAttribute('data-size', 'mini')
  const settings = { ...full, size: 'mini' } as const
  const divider = boardGuides.find(guide => guide.example === 'Voltage Divider')!
  const supply = divider.place(boardShape(settings)).find(item => item.part === 'V1')!.sockets[0]
  await probeWithKeyboard(page, settings, supply)
  await expect(probe(page)).toHaveText(`${supply} · 12 V`)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('meshlab:board') ?? '{}').size)).toBe('mini')
})

test('operates the LED example on a narrow Spanish viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openBoard(page, { circuit: 'LED + Switch', language: 'es' })
  await expect(page.getByRole('application', { name: /^Protoboard\./ }).locator('canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Abrir interruptor' }).click()
  await expect(page.getByRole('button', { name: 'Cerrar interruptor' })).toBeVisible()
  await expect(probe(page)).toHaveText('Selecciona un orificio')
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
})

test('explains that the board needs WebGL when the browser has none', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type.startsWith('webgl') ? null : original.call(this, type as '2d', ...(rest as []))
    } as typeof original
  })
  await openBoard(page)
  await expect(page.getByRole('status').filter({ hasText: 'WebGL' })).toHaveText('The 3D breadboard needs WebGL, which is not available in this browser.')
  await expect(scene(page)).toHaveCount(0)
})
