import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { Circuit } from '../src/circuit/model'

const schematic = (page: Page) => page.getByRole('group', { name: 'Interactive circuit schematic' })

async function screenPoint(canvas: Locator, x: number, y: number) {
  return canvas.locator(':scope > g').evaluate((layer: SVGGElement, point) => {
    const matrix = layer.getScreenCTM()
    if (!matrix) throw new Error('The schematic is not rendered.')
    const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix)
    return { x: screen.x, y: screen.y }
  }, { x, y })
}

async function clickAt(page: Page, x: number, y: number) {
  const point = await screenPoint(schematic(page), x, y)
  await page.mouse.click(point.x, point.y)
}

async function downloadFile(page: Page, button: 'JSON' | 'PNG', filename: string) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: button, exact: true }).click(),
  ])
  expect(download.suggestedFilename()).toBe(filename)
  return readFile(await download.path())
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(schematic(page)).toBeVisible()
})

test('probes the divider on the breadboard and synchronizes selected components', async ({ page }) => {
  await page.getByRole('button', { name: 'Breadboard', exact: true }).click()
  const board = page.getByRole('group', { name: 'Interactive breadboard' })
  await expect(board).toBeVisible()
  await board.getByRole('button', { name: 'Socket H10', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'H10' })).toHaveText('H10 · 8 V')
  await expect(page.getByRole('textbox', { name: 'Label' })).toHaveValue('R2')
  await board.getByRole('button', { name: 'Socket E10', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'E10' })).toHaveText('E10 · 8 V')
  const value = page.getByRole('textbox', { name: 'Value', exact: true })
  await value.fill('1 kΩ')
  await value.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'E10' })).toHaveText('E10 · 6 V')
  await board.getByRole('button', { name: 'Socket T-10', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'T-10' })).toHaveText('T-10 · Not connected')
  await page.getByRole('button', { name: 'Schematic', exact: true }).click()
  await expect(schematic(page)).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Label' })).toHaveValue('R2')
})

test('finds same-strip faults, retains progress when switching views, then verifies a divider build', async ({ page }) => {
  await page.getByRole('button', { name: 'Breadboard', exact: true }).click()
  await page.getByRole('button', { name: 'Start assembly' }).click()
  const board = page.getByRole('group', { name: 'Interactive breadboard' })
  const click = (socket: string) => board.getByRole('button', { name: `Socket ${socket}`, exact: true }).click()
  const check = page.getByRole('button', { name: 'Check placement' })
  await click('T+2')
  await click('T+3')
  await check.click()
  await expect(page.getByRole('alert')).toContainText('same conductive strip')
  await click('T+3')
  await click('B-2')
  await check.click()
  const progress = page.getByRole('progressbar', { name: 'Assembly progress' })
  await expect(progress).toHaveAttribute('value', '1')
  await page.getByRole('button', { name: 'Schematic', exact: true }).click()
  await page.getByRole('button', { name: 'Breadboard', exact: true }).click()
  await expect(progress).toHaveAttribute('value', '1')
  for (const group of [['B-4'], ['T+4', 'A4'], ['C4', 'C10'], ['E10', 'F10'], ['H10', 'H17'], ['J17', 'B-17']]) {
    for (const socket of group) await click(socket)
    await check.click()
  }
  await expect(page.getByRole('heading', { name: 'Assembly verified' })).toBeVisible()
  await click('I10')
  await expect(page.getByRole('status').filter({ hasText: 'I10' })).toHaveText('I10 · 8 V')
})

test('loads and operates the LED guide on a narrow Spanish viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('combobox', { name: 'Language' }).click()
  await page.getByRole('option', { name: 'Español' }).click()
  await page.getByRole('button', { name: 'Protoboard', exact: true }).click()
  await page.getByRole('button', { name: 'LED e interruptor' }).click()
  const board = page.getByRole('group', { name: 'Protoboard interactiva' })
  await expect(board).toBeVisible()
  await page.getByRole('button', { name: 'Abrir interruptor' }).click()
  await expect(page.getByRole('button', { name: 'Cerrar interruptor' })).toBeVisible()
  await expect(page.getByRole('row', { name: /^D1\b/ })).toContainText('0 A')
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
})

test('renders the optional 3D breadboard, selects a part from it, and returns to the 2D probe', async ({ page }) => {
  await page.getByRole('button', { name: 'Breadboard', exact: true }).click()
  const board = page.getByRole('group', { name: 'Interactive breadboard' })
  await board.getByRole('button', { name: 'Socket H10', exact: true }).click()
  await page.getByRole('button', { name: '3D view', exact: true }).click()
  const model = page.getByRole('img', { name: /3D breadboard/ })
  await expect(model.locator('canvas')).toBeVisible()
  await expect(board).toBeHidden()
  const tag = model.locator('.board3d-label', { hasText: 'R1' })
  await expect(tag).toBeVisible()
  const box = (await tag.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height + 9)
  await expect(page.getByRole('textbox', { name: 'Label' })).toHaveValue('R1')
  await page.getByRole('button', { name: 'Orbit right' }).click()
  await page.getByRole('button', { name: 'Reset 3D view' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'H10' })).toHaveText('H10 · 8 V')
  await page.getByRole('button', { name: '2D view', exact: true }).click()
  await expect(board.getByRole('button', { name: 'Socket H10', exact: true })).toBeVisible()
})
