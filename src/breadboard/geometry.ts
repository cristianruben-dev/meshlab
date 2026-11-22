import { boardRows, railPosition, type BoardShape } from './model'

/** Distance between neighbouring sockets, in board drawing units (the 3D scene scales these to world units). */
export const PITCH = 24
const MARGIN_X = 64
const RAIL_EDGE = 34
const TERMINAL_EDGE = 46

export type Socket = { id: string; row: string; index: number; x: number; y: number }
export type BoardGeometry = ReturnType<typeof boardGeometry>
export type CursorKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'

/** Socket coordinates for a board shape, in a drawing whose origin is the board's top-left corner. */
export function boardGeometry(shape: BoardShape) {
  const rails = shape.railLength > 0
  const top = rails ? RAIL_EDGE + 3 * PITCH : TERMINAL_EDGE
  const rowY: Record<string, number> = {}
  ;['A', 'B', 'C', 'D', 'E'].forEach((row, i) => { rowY[row] = top + i * PITCH })
  ;['F', 'G', 'H', 'I', 'J'].forEach((row, i) => { rowY[row] = top + (6 + i) * PITCH })
  const terminalBottom = rowY.J
  if (rails) Object.assign(rowY, { 'T+': RAIL_EDGE, 'T-': RAIL_EDGE + PITCH, 'B+': terminalBottom + 2 * PITCH, 'B-': terminalBottom + 3 * PITCH })
  const width = 2 * MARGIN_X + (shape.columns - 1) * PITCH
  const height = (rails ? rowY['B-'] + RAIL_EDGE : terminalBottom + TERMINAL_EDGE)
  const columnX = (column: number) => MARGIN_X + (column - 1) * PITCH
  const rows = boardRows(shape)
  const sockets: Socket[] = rows.flatMap(row => row.length === 2
    ? Array.from({ length: shape.railLength }, (_, i) => ({ id: `${row}${i + 1}`, row, index: i + 1, x: MARGIN_X + railPosition(shape, i + 1) * PITCH, y: rowY[row] }))
    : Array.from({ length: shape.columns }, (_, i) => ({ id: `${row}${i + 1}`, row, index: i + 1, x: columnX(i + 1), y: rowY[row] })))
  const byId = new Map(sockets.map(p => [p.id, p]))
  const byRow = new Map(rows.map(row => [row, sockets.filter(p => p.row === row)]))
  const closest = (list: Socket[], x: number, y: number) =>
    list.reduce((a, b) => Math.hypot(b.x - x, b.y - y) < Math.hypot(a.x - x, a.y - y) ? b : a)

  return {
    shape, width, height, rows, rowY, sockets, columnX,
    /** Vertical center of the gap that separates the upper and lower terminal strips. */
    trenchY: (rowY.E + rowY.F) / 2,
    hole: (id: string) => byId.get(id),
    /** Socket nearest to a board point, or undefined when farther than `reach` drawing units. */
    nearestSocket(x: number, y: number, reach = PITCH * .4) {
      const best = closest(sockets, x, y)
      return Math.hypot(best.x - x, best.y - y) < reach ? best.id : undefined
    },
    /** Neighbouring socket for a keyboard cursor; it stays put at the board's edges. */
    move(id: string, key: CursorKey) {
      const from = byId.get(id) ?? sockets[0]
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const row = byRow.get(from.row)!
        return row[Math.max(0, Math.min(row.length - 1, row.indexOf(from) + (key === 'ArrowLeft' ? -1 : 1)))].id
      }
      const next = rows[Math.max(0, Math.min(rows.length - 1, rows.indexOf(from.row) + (key === 'ArrowUp' ? -1 : 1)))]
      return closest(byRow.get(next)!, from.x, from.y).id
    },
  }
}

const bandColors = ['#1d1d1f', '#7b4a24', '#d1372c', '#ee7a1c', '#f1c232', '#2f9a4a', '#2d62c8', '#7a43b6', '#8b9097', '#f5f5f2']
/** Four-band color code (two significant digits, multiplier, 5 % tolerance) for a resistance in ohms. */
export function resistorBands(ohms: number): string[] {
  if (!(ohms > 0) || !Number.isFinite(ohms)) return [bandColors[0], bandColors[0], bandColors[0], '#c9a23a']
  let exponent = Math.floor(Math.log10(ohms)) - 1
  let digits = Math.round(ohms / 10 ** exponent)
  if (digits >= 100) { digits = Math.round(digits / 10); exponent += 1 }
  const multiplier = exponent === -1 ? '#c9a23a' : exponent === -2 ? '#c0c4c8' : bandColors[Math.max(0, Math.min(9, exponent))]
  return [bandColors[Math.floor(digits / 10)], bandColors[digits % 10], multiplier, '#c9a23a']
}
