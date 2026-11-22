import { useEffect, useState } from 'react'

export type PanelId = 'library' | 'inspector' | 'display' | 'results' | 'scope' | 'board'
export type PanelSide = 'left' | 'right' | 'bottom'
export type PanelState = { open: boolean; pinned: boolean }
export type PanelLayout = Record<PanelId, PanelState>
/** Phone (< 640 px): bottom sheets. Tablet (640–1099 px): floating panels, one docked side panel. Desktop: everything docks. */
export type Tier = 'phone' | 'tablet' | 'desktop'
export type View = 'schematic' | 'board'
type Layouts = Record<View, PanelLayout>
export type Stored = Record<Tier, Layouts>

export const panelSides: Record<PanelId, PanelSide> = {
  library: 'left', inspector: 'right', display: 'right', board: 'right', results: 'bottom', scope: 'bottom',
}
export const panelIds = Object.keys(panelSides) as PanelId[]
export const panelsKey = 'meshlab:panels'
export const tiers: Tier[] = ['phone', 'tablet', 'desktop']
const views: View[] = ['schematic', 'board']
const phoneQuery = '(max-width: 639px)'
const tabletQuery = '(min-width: 640px) and (max-width: 1099px)'
/** A tablet docks a side panel only while the editor keeps at least 420 px beside it. */
const sideDockQuery = '(min-width: 728px)'

const closed: PanelState = { open: false, pinned: false }
const open = (pinned: boolean): PanelState => ({ open: true, pinned })
const layout = (entries: Partial<PanelLayout>): PanelLayout => ({ library: closed, inspector: closed, display: closed, results: closed, scope: closed, board: closed, ...entries })

// Breadboard view starts without the results sheet so the board is not covered, and tablets start with only the
// bottom sheets so the editor keeps its width; everything else opens from the launcher.
export const defaultLayouts: Stored = {
  desktop: {
    schematic: layout({ library: open(true), inspector: open(true), results: open(false), scope: open(false) }),
    board: layout({ inspector: open(true), board: open(true) }),
  },
  tablet: {
    schematic: layout({ results: open(false), scope: open(false) }),
    board: layout({ board: open(false) }),
  },
  phone: { schematic: layout({}), board: layout({}) },
}

const record = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined

function clean(saved: unknown, fallback: PanelLayout): PanelLayout {
  const source = record(saved) ?? {}
  return Object.fromEntries(panelIds.map(id => {
    const entry = record(source[id]) as Partial<PanelState> | undefined
    return [id, {
      open: typeof entry?.open === 'boolean' ? entry.open : fallback[id].open,
      pinned: typeof entry?.pinned === 'boolean' ? entry.pinned : fallback[id].pinned,
    }]
  })) as PanelLayout
}

/**
 * Reads the saved layouts. The earlier two-tier format (`wide` and `compact`, one layout for both views) migrates to
 * the desktop and phone schematic layouts; anything missing or malformed falls back to the defaults.
 */
export function readPanels(): Stored {
  let saved: Record<string, unknown> | undefined
  try { saved = record(JSON.parse(localStorage.getItem(panelsKey) ?? 'null')) } catch { saved = undefined }
  const legacy: Partial<Record<Tier, unknown>> = { desktop: saved?.wide, phone: saved?.compact }
  return Object.fromEntries(tiers.map(tier => {
    const current = record(saved?.[tier])
    return [tier, Object.fromEntries(views.map(view => {
      const layout = clean(current?.[view] ?? (view === 'schematic' ? legacy[tier] : undefined), defaultLayouts[tier][view])
      return [view, tier === 'tablet' ? oneDockedSide(layout) : layout]
    }))]
  })) as Stored
}

/** Tablets dock at most one side panel; extra pins in stored data are dropped, keeping the first. */
function oneDockedSide(layout: PanelLayout): PanelLayout {
  let docked = false
  return Object.fromEntries(panelIds.map(id => {
    if (panelSides[id] === 'bottom' || !layout[id].pinned) return [id, layout[id]]
    const keep = !docked
    docked = true
    return [id, keep ? layout[id] : { ...layout[id], pinned: false }]
  })) as PanelLayout
}

function matches(query: string) {
  return typeof matchMedia === 'function' && matchMedia(query).matches
}
function currentTier(): Tier {
  return matches(phoneQuery) ? 'phone' : matches(tabletQuery) ? 'tablet' : 'desktop'
}

/** Open and pinned state of every workspace panel, remembered separately per screen tier and per editor view. */
export function usePanels(view: View) {
  const [stored, setStored] = useState<Stored>(readPanels)
  const [tier, setTier] = useState<Tier>(currentTier)
  const [sideRoom, setSideRoom] = useState(() => matches(sideDockQuery))
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const queries = [phoneQuery, tabletQuery, sideDockQuery].map(query => matchMedia(query))
    const change = () => { setTier(currentTier()); setSideRoom(matches(sideDockQuery)) }
    for (const media of queries) media.addEventListener?.('change', change)
    return () => { for (const media of queries) media.removeEventListener?.('change', change) }
  }, [])
  useEffect(() => {
    try { localStorage.setItem(panelsKey, JSON.stringify(stored)) } catch { /* Storage is optional. */ }
  }, [stored])
  const compact = tier === 'phone'
  const current = stored[tier][view]
  /** Whether a panel may dock: never on phones, and on tablets only while the editor keeps its room. */
  const canPin = (id: PanelId) => tier === 'desktop' || (tier === 'tablet' && (panelSides[id] === 'bottom' || sideRoom))
  function patch(id: PanelId, changes: Partial<PanelState>) {
    setStored(previous => {
      const before = previous[tier][view]
      let base = before
      // Phone sheets share the bottom of the screen, so opening one closes the others.
      if (compact && changes.open) base = Object.fromEntries(panelIds.map(other => [other, { ...before[other], open: false }])) as PanelLayout
      // A tablet keeps at most one docked side panel so the editor stays usable.
      if (tier === 'tablet' && changes.pinned && panelSides[id] !== 'bottom')
        base = Object.fromEntries(panelIds.map(other => [other, panelSides[other] === 'bottom' ? base[other] : { ...base[other], pinned: false }])) as PanelLayout
      return { ...previous, [tier]: { ...previous[tier], [view]: { ...base, [id]: { ...before[id], ...changes } } } }
    })
  }
  return {
    tier,
    compact,
    layout: current,
    canPin,
    docked: (id: PanelId) => canPin(id) && current[id].pinned,
    setOpen: (id: PanelId, open: boolean) => patch(id, { open }),
    toggle: (id: PanelId) => patch(id, { open: !current[id].open }),
    setPinned: (id: PanelId, pinned: boolean) => patch(id, { pinned }),
  }
}
