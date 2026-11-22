export type BoardPlacement = { id: string; componentId: string; sockets: string[] }
export type BoardJumper = { id: string; from: string; to: string; color: string }
export type BreadboardLayout = {
  placements: BoardPlacement[]
  jumpers: BoardJumper[]
}

export type JumperColor = { id: string; name: string; hex: string }

export const JUMPER_COLORS: readonly JumperColor[] = [
  { id: 'red', name: 'Red', hex: '#e5484d' },
  { id: 'black', name: 'Black', hex: '#2a323a' },
  { id: 'blue', name: 'Blue', hex: '#3b82f6' },
  { id: 'green', name: 'Green', hex: '#22c55e' },
  { id: 'yellow', name: 'Yellow', hex: '#eab308' },
  { id: 'orange', name: 'Orange', hex: '#f97316' },
  { id: 'white', name: 'White', hex: '#f1f5f9' },
] as const

export const SOCKET_PATTERN = /^(T[+-]|B[+-]|[A-J])[1-9]\d*$/
