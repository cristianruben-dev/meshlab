// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { panelsKey, readPanels } from './panels'

afterEach(() => localStorage.clear())

describe('saved panel layouts', () => {
  it('keeps at most one docked side panel on tablets even when the stored data has more', () => {
    const pinned = { open: true, pinned: true }
    localStorage.setItem(panelsKey, JSON.stringify({ tablet: { schematic: { library: pinned, inspector: pinned, results: pinned } } }))
    const tablet = readPanels().tablet.schematic
    expect([tablet.library, tablet.inspector, tablet.display, tablet.board].filter(p => p.pinned)).toHaveLength(1)
    expect(tablet.library.pinned).toBe(true)
    expect(tablet.results.pinned).toBe(true)
  })

  it('falls back to defaults for arrays, numbers, and unknown keys', () => {
    for (const value of ['[1,2]', '42', '{"tablet":{"schematic":[1]},"desk":{}}']) {
      localStorage.setItem(panelsKey, value)
      expect(() => readPanels()).not.toThrow()
      expect(readPanels().desktop.schematic.library).toEqual({ open: true, pinned: true })
    }
  })
})
