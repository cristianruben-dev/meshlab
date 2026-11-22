import type { Theme } from '../theme'

/** Literal colors for the physical board; the plastic stays light in both themes but dims in dark mode. */
export type BoardPalette = {
  bodyTop: string; bodyBottom: string; side: string; well: string; wellEdge: string; trenchA: string; trenchB: string
  socket: string; socketRim: string; index: string; selected: string; strip: string; cursor: string
}
export const boardPalettes: Record<Theme, BoardPalette> = {
  light: {
    bodyTop: '#ffffff', bodyBottom: '#e7ebee', side: '#cfd6db', well: '#f6f8f9', wellEdge: '#d3dadf', trenchA: '#b4bec5', trenchB: '#d6dde1',
    socket: '#2a323a', socketRim: '#c3ccd2', index: '#58646e', selected: '#0d8a78', strip: '#14a08b', cursor: '#2563eb',
  },
  dark: {
    bodyTop: '#e3e8eb', bodyBottom: '#c2cbd1', side: '#9aa6ae', well: '#dbe1e4', wellEdge: '#aab5bc', trenchA: '#8f9ba3', trenchB: '#b1bbc1',
    socket: '#1d252d', socketRim: '#a3aeb5', index: '#46525c', selected: '#0f9e88', strip: '#18b89d', cursor: '#2f6cf0',
  },
}
