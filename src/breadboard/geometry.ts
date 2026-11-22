import { COLUMNS, ROWS } from './model'

/** Socket coordinates in the 760 × 435 board drawing, shared by the 2D and 3D views. */
export const columns = Array.from({ length: COLUMNS }, (_, i) => i + 1)
export const rowY = [89, 111, 151, 170, 189, 208, 227, 264, 283, 302, 321, 340, 371, 393]
export const layout = ROWS.flatMap((row, r) => columns.map(col => ({ id: `${row}${col}`, row: r, col, x: 104 + (col - 1) * 29, y: rowY[r] })))
const byId = new Map(layout.map(p => [p.id, p]))
export const hole = (id: string) => byId.get(id)!
/** Socket nearest to a board point, or undefined when farther than `reach` drawing units. */
export function nearestSocket(x: number, y: number, reach = 10) {
  const best = layout.reduce((a, b) => Math.hypot(b.x - x, b.y - y) < Math.hypot(a.x - x, a.y - y) ? b : a)
  return Math.hypot(best.x - x, best.y - y) < reach ? best.id : undefined
}
export const rowLabels = ['T+', 'T−', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'B+', 'B−']
export const BOARD = { width: 760, height: 435 }

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
