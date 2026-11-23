import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { ProjectFile, WorkspaceBundle } from '../src/storage/types'

test('organizes projects with inline folders (no sidebar or tags), creates via wizard, edits in tabs, and persists in IndexedDB', async ({ page }) => {
  await page.goto('/')

  // Starts on the sidebar-free, tag-free Projects Hub without forcing a pre-built circuit.
  await expect(page.getByRole('heading', { name: 'My Projects' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your local circuit workspace' })).toBeVisible()
  await expect(page.locator('.hub-sidebar')).toHaveCount(0)
  await expect(page.getByText('Tags', { exact: true })).toHaveCount(0)

  // Create a folder from the inline filter ribbon.
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByRole('textbox', { name: 'Folder name' }).fill('Power Lab')
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Power Lab\b/ })).toBeVisible()

  // Create Project 1: blank schematic inside Power Lab via the 3-step visual wizard.
  await page.getByRole('button', { name: 'New project', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New project' })
  await expect(dialog.getByRole('radio', { name: /Circuit/ })).toBeChecked()
  await dialog.getByRole('button', { name: 'Next' }).click()
  await expect(dialog.getByRole('radio', { name: /Blank schematic/ })).toBeChecked()
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.getByRole('textbox', { name: 'Project name' }).fill('Blank Prototype')
  await dialog.getByRole('combobox', { name: 'Folder' }).selectOption({ label: 'Power Lab' })
  await dialog.getByRole('button', { name: 'Create project' }).click()

  await expect(page.getByText('Start a new circuit')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Blank Prototype' })).toHaveAttribute('aria-selected', 'true')

  // Add a single resistor to Project 1.
  await page.getByRole('button', { name: 'Resistor', exact: true }).click()
  await expect(page.getByText('1 parts · 0 wires')).toBeVisible()
  await expect(page.locator('.save-indicator')).toContainText('Saved locally')

  // Return to Projects Hub and create Project 2 from a template through the wizard.
  await page.getByRole('button', { name: 'Projects', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'My Projects' })).toBeVisible()
  await page.getByRole('button', { name: 'New project', exact: true }).click()
  const dialog2 = page.getByRole('dialog', { name: 'New project' })
  await dialog2.getByRole('button', { name: 'Next' }).click()
  await dialog2.getByRole('radio', { name: /From template/ }).click()
  await dialog2.getByRole('button', { name: 'Voltage Divider' }).click()
  await dialog2.getByRole('button', { name: 'Next' }).click()
  await dialog2.getByRole('textbox', { name: 'Project name' }).fill('Divider Reference')
  await dialog2.getByRole('button', { name: 'Create project' }).click()

  await expect(page.getByRole('tab', { name: 'Divider Reference' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: 'Blank Prototype' })).toHaveAttribute('aria-selected', 'false')
  await expect(page.getByRole('row', { name: /^R1\b/ })).toContainText('4 mA')

  // Switch between both open tabs and verify complete state isolation.
  await page.getByRole('tab', { name: 'Blank Prototype' }).click()
  await expect(page.getByText('1 parts · 0 wires')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText(/Missing ground/i)

  await page.getByRole('tab', { name: 'Divider Reference' }).click()
  await expect(page.getByRole('row', { name: /^R1\b/ })).toContainText('4 mA')
  await expect(page.getByText('4 parts · 6 wires')).toBeVisible()

  // Close one tab without deleting the project, then return to Hub.
  await page.getByRole('button', { name: 'Close tab: Blank Prototype' }).click()
  await expect(page.getByRole('tab', { name: 'Blank Prototype' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Projects', exact: true }).click()

  // Reload page on the Hub and verify 100% local IndexedDB persistence.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'My Projects' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Blank Prototype', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Divider Reference', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Power Lab\b/ })).toBeVisible()

  // Filter by folder pill.
  await page.getByRole('button', { name: /^Power Lab\b/ }).click()
  await expect(page.getByRole('button', { name: 'Blank Prototype', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Divider Reference', exact: true })).toHaveCount(0)

  // Deleting a folder moves projects to Unfiled without deleting them.
  await page.getByRole('button', { name: 'Folder actions: Power Lab' }).click()
  await page.getByRole('button', { name: 'Delete folder' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete folder' }).click()
  await expect(page.getByRole('button', { name: 'Blank Prototype', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Divider Reference', exact: true })).toBeVisible()
})

test('exports and imports both a single project file and a full workspace backup bundle', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'My Projects' })).toBeVisible()

  // Create folder and a project from template via wizard.
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByRole('textbox', { name: 'Folder name' }).fill('Archive Set')
  await page.getByRole('button', { name: 'Create', exact: true }).click()

  await page.getByRole('button', { name: 'New project', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New project' })
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.getByRole('radio', { name: /From template/ }).click()
  await dialog.getByRole('button', { name: 'Wheatstone Bridge' }).click()
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.getByRole('textbox', { name: 'Project name' }).fill('Wheatstone Study')
  await dialog.getByRole('combobox', { name: 'Folder' }).selectOption({ label: 'Archive Set' })
  await dialog.getByRole('button', { name: 'Create project' }).click()

  await expect(page.getByRole('rowheader', { name: 'R5', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Projects', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'My Projects' })).toBeVisible()

  // Export single project JSON (.meshlab.json)
  await page.getByRole('button', { name: 'Project actions: Wheatstone Study' }).click()
  const [projectDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export JSON' }).click(),
  ])
  expect(projectDownload.suggestedFilename()).toBe('wheatstone-study.meshlab.json')
  const projectRaw = (await readFile(await projectDownload.path())).toString()
  const projectPayload: ProjectFile = JSON.parse(projectRaw)
  expect(projectPayload.kind).toBe('meshlab-project')
  expect(projectPayload.version).toBe(1)
  expect(projectPayload.project.folderName).toBe('Archive Set')

  // Export full workspace backup (.meshlab-bundle.json)
  const [backupDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export backup' }).click(),
  ])
  expect(backupDownload.suggestedFilename()).toMatch(/^meshlab-backup-\d{4}-\d{2}-\d{2}\.meshlab-bundle\.json$/)
  const bundleRaw = (await readFile(await backupDownload.path())).toString()
  const bundlePayload: WorkspaceBundle = JSON.parse(bundleRaw)
  expect(bundlePayload.kind).toBe('meshlab-bundle')
  expect(bundlePayload.projects).toHaveLength(1)
  expect(bundlePayload.folders).toHaveLength(1)

  // Import single project back (safe merge without overwriting existing project)
  const [chooser1] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import', exact: true }).click(),
  ])
  await chooser1.setFiles({
    name: 'wheatstone-study.meshlab.json',
    mimeType: 'application/json',
    buffer: Buffer.from(projectRaw),
  })
  await expect(page.getByRole('status')).toContainText('Project imported.')
  await expect(page.getByRole('button', { name: 'Wheatstone Study', exact: true })).toHaveCount(2)

  // Wipe IndexedDB cleanly to simulate a fresh browser, reload, then import the full backup bundle.
  await page.evaluate(async () => {
    localStorage.clear()
    await new Promise<void>(resolve => {
      const req = indexedDB.deleteDatabase('meshlab-workspace')
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
      req.onblocked = () => resolve()
    })
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your local circuit workspace' })).toBeVisible()

  const [chooser2] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('.hub-topbar').getByRole('button', { name: 'Import', exact: true }).click(),
  ])
  await chooser2.setFiles({
    name: 'backup.meshlab-bundle.json',
    mimeType: 'application/json',
    buffer: Buffer.from(bundleRaw),
  })
  await expect(page.getByRole('status')).toContainText('Backup imported.')
  await expect(page.getByRole('button', { name: 'Wheatstone Study', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Archive Set\b/ })).toBeVisible()
})
