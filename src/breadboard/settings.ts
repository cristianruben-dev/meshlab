// Contract shared by the breadboard unit and the workspace shell. The breadboard unit owns this file.
export type BoardSize = 'mini' | 'half' | 'full'
export type BoardSettings = { size: BoardSize; rails: boolean; splitRails: boolean; labels: boolean }
export const defaultBoardSettings: BoardSettings = { size: 'half', rails: true, splitRails: false, labels: true }
const key = 'meshlab:board'

export function readBoardSettings(): BoardSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null')
    return saved && typeof saved === 'object' ? { ...defaultBoardSettings, ...saved } : defaultBoardSettings
  } catch { return defaultBoardSettings }
}

export function saveBoardSettings(settings: BoardSettings) {
  try { localStorage.setItem(key, JSON.stringify(settings)) } catch { /* Storage is optional. */ }
}
