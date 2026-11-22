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
  await expect(page.getByRole('heading', { name: 'My Projects' })).toBeVisible()
  await page.getByRole('button', { name: /Voltage Divider/ }).click()
  await expect(schematic(page)).toBeVisible()
})

test('loads a predefined example and persists both the circuit and the language', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Circuit examples' }).click()
  await page.getByRole('option', { name: 'Wheatstone Bridge' }).click()
  await expect(page.getByRole('rowheader', { name: 'R5', exact: true })).toBeVisible()

  await page.getByRole('combobox', { name: 'Language' }).click()
  await page.getByRole('option', { name: 'Español' }).click()
  await expect(page.getByRole('heading', { name: 'Circuito', exact: true })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Mediciones por componente' })).toBeVisible()

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  await expect(page.getByRole('table', { name: 'Mediciones por componente' })
    .getByRole('rowheader', { name: 'R5', exact: true })).toBeVisible()
})

test('drags and rotates a component, then undoes both changes', async ({ page }) => {
  const canvas = schematic(page)
  const resistor = canvas.locator('g.part').filter({ has: page.getByText('R1', { exact: true }) })
  const rotation = resistor.locator(':scope > g[transform^="rotate("]')
  await expect(resistor).toHaveAttribute('transform', 'translate(320 180)')
  const start = await screenPoint(canvas, 320, 180)
  const end = await screenPoint(canvas, 340, 220)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 5 })
  await page.mouse.up()
  await expect(resistor).toHaveAttribute('transform', 'translate(340 220)')

  await page.getByRole('button', { name: 'Rotate (R)' }).click()
  await expect(rotation).toHaveAttribute('transform', 'rotate(90)')
  const undo = page.getByRole('button', { name: 'Undo', exact: true })
  await undo.click()
  await expect(rotation).toHaveAttribute('transform', 'rotate(0)')
  await expect(resistor).toHaveAttribute('transform', 'translate(340 220)')
  await undo.click()
  await expect(resistor).toHaveAttribute('transform', 'translate(320 180)')
})

test('joins a terminal to a wire at a T-junction and downloads a full-size PNG', async ({ page }) => {
  const canvas = schematic(page)
  await expect(canvas.locator('g.wire')).toHaveCount(6)
  await page.getByRole('button', { name: 'Wire (W)' }).click()
  await clickAt(page, 580, 240)
  await expect(page.getByText('Select a terminal or wire to connect')).toBeVisible()
  await clickAt(page, 180, 200)
  await expect(canvas.locator('g.wire')).toHaveCount(8)
  await expect(canvas.locator('g[transform="translate(180 200)"] circle[r="4"]')).toBeVisible()

  const exported = await downloadFile(page, 'JSON', 'meshlab-circuit.json')
  const circuit: Circuit = JSON.parse(exported.toString())
  const junction = circuit.junctions.find(node => node.x === 180 && node.y === 200)
  expect(junction).toBeDefined()
  const endpoints = circuit.wires.flatMap(({ from, to }) => {
    if ('junction' in from && from.junction === junction?.id) return [to]
    if ('junction' in to && to.junction === junction?.id) return [from]
    return []
  })
  expect(endpoints).toHaveLength(3)
  expect(endpoints).toEqual(expect.arrayContaining([
    { component: 'V1', pin: 0 }, { component: 'R1', pin: 0 }, { component: 'R2', pin: 0 },
  ]))

  const png = await downloadFile(page, 'PNG', 'meshlab-circuit.png')
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const size = await page.evaluate(async (encoded) => {
    const image = new Image()
    image.src = `data:image/png;base64,${encoded}`
    await image.decode()
    return { width: image.naturalWidth, height: image.naturalHeight }
  }, png.toString('base64'))
  expect(size).toEqual({ width: 2400, height: 1620 })
})

test('imports a valid JSON file and preserves it after invalid JSON is rejected', async ({ page }) => {
  const original = await downloadFile(page, 'JSON', 'meshlab-circuit.json')
  const circuit: Circuit = JSON.parse(original.toString())
  const resistor = circuit.components.find(part => part.id === 'R1')!
  resistor.label = 'Imported resistor'

  async function importFile(payload: object) {
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Import', exact: true }).click(),
    ])
    await chooser.setFiles({ name: 'circuit.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) })
  }

  await importFile(circuit)
  await expect(page.getByRole('status')).toContainText('Circuit imported.')
  const reading = page.getByRole('rowheader', { name: 'Imported resistor' })
  await expect(reading).toBeVisible()
  await importFile({ ...circuit, version: 99, components: [] })
  await expect(page.getByRole('alert')).toContainText('Unsupported circuit version.')
  await expect(reading).toBeVisible()
  expect(JSON.parse((await downloadFile(page, 'JSON', 'meshlab-circuit.json')).toString())).toEqual(circuit)
})

test('fits the workbench in a narrow viewport without horizontal document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(schematic(page)).toBeVisible()
  const panels = page.getByRole('navigation', { name: 'Panels' })
  await panels.getByRole('button', { name: 'Inspector', exact: true }).click()
  const inspector = page.getByRole('region', { name: 'Properties' })
  await expect(inspector.getByRole('heading', { name: 'Properties' })).toBeVisible()
  // Phone panels are bottom sheets that cannot be pinned and stay inside the viewport.
  await expect(inspector.getByRole('button', { name: 'Pin Inspector' })).toHaveCount(0)
  const box = (await inspector.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  await panels.getByRole('button', { name: 'Results', exact: true }).click()
  await expect(inspector).toHaveCount(0)
  await expect(page.getByRole('table', { name: 'Component readings' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const { clientWidth, scrollWidth } = document.documentElement
    return scrollWidth - clientWidth
  })).toBe(0)
})

test('fills the viewport with the editor and keeps the page itself from scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const size = await schematic(page).boundingBox()
  const dockLeft = await page.getByRole('region', { name: 'Components' }).boundingBox()
  expect(size!.height).toBe(900)
  expect(size!.x).toBeGreaterThanOrEqual(dockLeft!.x + dockLeft!.width - 1)
  expect(await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)).toBe(0)
})

test('pins and unpins panels, docking the editor, and restores the layout after reload', async ({ page }) => {
  const canvas = schematic(page)
  const docked = (await canvas.boundingBox())!
  const pin = page.getByRole('button', { name: 'Pin Library' })
  await expect(pin).toHaveAttribute('aria-pressed', 'true')
  await pin.click()
  await expect(pin).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(async () => (await canvas.boundingBox())!.x).toBeLessThan(docked.x)
  const library = page.getByRole('region', { name: 'Components' })
  // A floating panel overlays the editor instead of pushing it aside.
  expect((await library.boundingBox())!.x).toBeGreaterThan((await canvas.boundingBox())!.x)

  await page.reload()
  await expect(page.getByRole('button', { name: 'Pin Library' })).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(async () => (await canvas.boundingBox())!.x).toBeLessThan(docked.x)
  await page.getByRole('button', { name: 'Pin Library' }).click()
  await expect.poll(async () => (await canvas.boundingBox())!.x).toBe(docked.x)
})

test('closes panels and reopens them from the launcher, with Escape closing only a focused floating panel', async ({ page }) => {
  const panels = page.getByRole('navigation', { name: 'Panels' })
  await page.getByRole('button', { name: 'Close Library' }).click()
  await expect(page.getByRole('searchbox', { name: 'Find components' })).toHaveCount(0)
  const launcher = panels.getByRole('button', { name: 'Library', exact: true })
  await expect(launcher).toBeFocused()
  await expect(launcher).toHaveAttribute('aria-pressed', 'false')
  await launcher.click()
  await expect(page.getByRole('searchbox', { name: 'Find components' })).toBeVisible()

  const results = page.getByRole('region', { name: 'Simulation results' })
  await page.getByRole('button', { name: 'Wire (W)' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Select and move' })).toHaveAttribute('aria-pressed', 'true')
  await expect(results).toBeVisible()
  await results.getByRole('button', { name: 'Pin Results' }).focus()
  await page.keyboard.press('Escape')
  await expect(results).toHaveCount(0)
  await expect(panels.getByRole('button', { name: 'Results', exact: true })).toBeFocused()

  await page.reload()
  await expect(page.getByRole('region', { name: 'Simulation results' })).toHaveCount(0)
  await expect(page.getByRole('searchbox', { name: 'Find components' })).toBeVisible()
})

test('edits a component rating and locates the resulting alert', async ({ page }) => {
  await clickAt(page, 580, 280)
  await page.getByText('Electrical limits', { exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Power limit' })
  await input.fill('10 mW')
  await input.press('Enter')
  const notice = page.getByRole('status').filter({ hasText: 'Power limit exceeded' })
  await expect(notice).toContainText('R2')
  await expect(notice).toContainText('32 mW')
  await notice.getByRole('button', { name: 'Locate' }).click()
  await expect(schematic(page).locator('.part').filter({ hasText: /R2/ }).locator('rect.flag-outline')).toBeVisible()
  await expect(input).toHaveValue('10 mW')
})

test('reroutes a selected wire and copies, pastes, and duplicates selected parts', async ({ page }) => {
  await clickAt(page, 180, 210)
  const handle = schematic(page).locator('.route-handle[cx="180"][cy="210"]')
  await expect(handle).toBeVisible()
  const start = await screenPoint(schematic(page), 180, 210)
  const end = await screenPoint(schematic(page), 220, 210)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 5 })
  await page.mouse.up()
  let saved: Circuit = JSON.parse((await downloadFile(page, 'JSON', 'meshlab-circuit.json')).toString())
  expect(saved.wires[0].points).toContainEqual({ x: 220, y: 240 })
  expect(saved.wires[0].from).toEqual({ component: 'V1', pin: 0 })
  await expect(page.getByRole('row', { name: /^R1\b/ })).toContainText('4 mA')

  await clickAt(page, 320, 180)
  await page.getByRole('button', { name: 'Copy selection' }).click()
  await page.getByRole('button', { name: 'Paste', exact: true }).click()
  await page.getByRole('button', { name: 'Duplicate selection' }).click()
  saved = JSON.parse((await downloadFile(page, 'JSON', 'meshlab-circuit.json')).toString())
  expect(saved.components).toHaveLength(6)
  expect(new Set(saved.components.map(c => c.id)).size).toBe(6)
})

test('records an RC voltage trace and resets it while paused', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Circuit examples' }).click()
  await page.getByRole('option', { name: 'RC Charging' }).click()
  await expect(page.getByText('TRANSIENT LIVE')).toBeVisible()
  const scope = page.getByRole('img', { name: 'Voltage versus time' })
  await expect(scope.locator('polyline')).toBeVisible()
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.getByRole('button', { name: 'Reset transient' }).click()
  await expect(page.getByLabel('Simulation time')).toHaveText('0 s')
  await expect(scope.locator('polyline')).toHaveCount(0)
  await expect(page.getByText('Awaiting a transient sample')).toBeVisible()
  await page.getByRole('button', { name: 'Run simulation' }).click()
  await expect(scope.locator('polyline')).toBeVisible()
})

test('follows the system color scheme until a theme is chosen, then keeps the choice after reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.reload()
  const html = page.locator('html')
  await expect(html).toHaveClass(/dark/)
  const themes = page.getByRole('group', { name: 'Theme' })
  await expect(themes.getByRole('button', { name: 'System theme' })).toHaveAttribute('aria-pressed', 'true')
  await themes.getByRole('button', { name: 'Light theme' }).click()
  await expect(html).not.toHaveClass(/dark/)
  await page.reload()
  await expect(html).not.toHaveClass(/dark/)
  await expect(page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Light theme' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('row', { name: /^R1\b/ })).toContainText('4 mA')
})

test('keeps phone chrome on one row and moves file, theme, and language controls into the More menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const topbar = page.locator('.topbar')
  await expect.poll(async () => (await topbar.boundingBox())!.height).toBe(52)
  const toolbar = page.getByRole('group', { name: 'SCHEMATIC TOOLS' })
  expect(await toolbar.evaluate(element => element.scrollWidth - element.clientWidth)).toBe(0)
  await expect(page.getByRole('combobox', { name: 'Circuit examples' })).toHaveCount(0)

  const more = page.getByRole('button', { name: 'More actions' })
  await more.click()
  const menu = page.getByRole('dialog', { name: 'More actions' })
  await menu.getByRole('combobox', { name: 'Circuit examples' }).click()
  await page.getByRole('option', { name: 'Wheatstone Bridge' }).click()
  await expect(menu).toHaveCount(0)
  await page.getByRole('navigation', { name: 'Panels' }).getByRole('button', { name: 'Results', exact: true }).click()
  await expect(page.getByRole('rowheader', { name: 'R5', exact: true })).toBeVisible()

  await more.click()
  await menu.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Dark theme' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(menu.getByRole('combobox', { name: 'Language' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(more).toBeFocused()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
})
