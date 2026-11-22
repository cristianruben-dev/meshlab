import { useEffect, useState } from 'react'

export type PanelId = 'library' | 'inspector' | 'display' | 'results' | 'scope' | 'board'
export type PanelSide = 'left' | 'right' | 'bottom'
export type PanelState = { open: boolean; pinned: boolean }
export type PanelLayout = Record<PanelId, PanelState>
type Stored = { wide: PanelLayout; compact: PanelLayout }

export const panelSides: Record<PanelId, PanelSide> = {
  library: 'left', inspector: 'right', display: 'right', board: 'right', results: 'bottom', scope: 'bottom',
}
export const panelIds = Object.keys(panelSides) as PanelId[]
export const panelsKey = 'meshlab:panels'
// Phones and portrait tablets: too narrow to dock panels beside the editor, so every panel is a bottom sheet.
const compactQuery = '(max-width: 899px)'

const closed: PanelState = { open: false, pinned: false }
const defaults: Stored = {
  wide: {
    library: { open: true, pinned: true },
    inspector: { open: true, pinned: true },
    display: closed,
    results: { open: true, pinned: false },
    scope: { open: true, pinned: false },
    board: { open: true, pinned: true },
  },
  compact: { library: closed, inspector: closed, display: closed, results: closed, scope: closed, board: closed },
}

function clean(saved: unknown, fallback: PanelLayout): PanelLayout {
  const source = saved && typeof saved === 'object' ? saved as Record<string, unknown> : {}
  return Object.fromEntries(panelIds.map(id => {
    const entry = source[id] as Partial<PanelState> | undefined
    return [id, {
      open: typeof entry?.open === 'boolean' ? entry.open : fallback[id].open,
      pinned: typeof entry?.pinned === 'boolean' ? entry.pinned : fallback[id].pinned,
    }]
  })) as PanelLayout
}

export function readPanels(): Stored {
  try {
    const saved = JSON.parse(localStorage.getItem(panelsKey) ?? 'null') as Partial<Stored> | null
    return { wide: clean(saved?.wide, defaults.wide), compact: clean(saved?.compact, defaults.compact) }
  } catch { return defaults }
}

function matchesCompact() {
  return typeof matchMedia === 'function' && matchMedia(compactQuery).matches
}

/** Open and pinned state of every workspace panel, remembered separately for wide and compact (phone) layouts. */
export function usePanels() {
  const [stored, setStored] = useState<Stored>(readPanels)
  const [compact, setCompact] = useState(matchesCompact)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const media = matchMedia(compactQuery)
    const change = () => setCompact(media.matches)
    media.addEventListener?.('change', change)
    return () => media.removeEventListener?.('change', change)
  }, [])
  useEffect(() => {
    try { localStorage.setItem(panelsKey, JSON.stringify(stored)) } catch { /* Storage is optional. */ }
  }, [stored])
  const layout = compact ? stored.compact : stored.wide
  function patch(id: PanelId, changes: Partial<PanelState>) {
    const key = compact ? 'compact' : 'wide'
    setStored(previous => {
      const current = previous[key]
      // Phone sheets share the bottom of the screen, so opening one closes the others.
      const base = compact && changes.open ? Object.fromEntries(panelIds.map(other => [other, { ...current[other], open: false }])) as PanelLayout : current
      return { ...previous, [key]: { ...base, [id]: { ...current[id], ...changes } } }
    })
  }
  return {
    compact,
    layout,
    setOpen: (id: PanelId, open: boolean) => patch(id, { open }),
    toggle: (id: PanelId) => patch(id, { open: !layout[id].open }),
    setPinned: (id: PanelId, pinned: boolean) => patch(id, { pinned }),
  }
}
