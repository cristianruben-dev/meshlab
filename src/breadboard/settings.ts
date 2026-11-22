// Contract shared by the breadboard unit and the workspace shell.
export type BoardSize = 'mini' | 'half' | 'full'
export type BoardSettings = { size: BoardSize; rails: boolean; splitRails: boolean; labels: boolean }
export const boardSizes: readonly BoardSize[] = ['mini', 'half', 'full']
export const defaultBoardSettings: BoardSettings = { size: 'half', rails: true, splitRails: false, labels: true }
const key = 'meshlab:board'

/** Saved board settings; each missing or invalid field falls back to its default. */
export function readBoardSettings(): BoardSettings {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return defaultBoardSettings
    const value = saved as Record<string, unknown>
    const flag = (name: 'rails' | 'splitRails' | 'labels') => typeof value[name] === 'boolean' ? value[name] : defaultBoardSettings[name]
    return {
      size: boardSizes.includes(value.size as BoardSize) ? value.size as BoardSize : defaultBoardSettings.size,
      rails: flag('rails'), splitRails: flag('splitRails'), labels: flag('labels'),
    }
  } catch { return defaultBoardSettings }
}

export function saveBoardSettings(settings: BoardSettings) {
  try { localStorage.setItem(key, JSON.stringify(settings)) } catch { /* Storage is optional. */ }
}
