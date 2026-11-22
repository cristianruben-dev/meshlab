import { useId } from 'react'
import { CircuitBoard, Waypoints } from 'lucide-react'
import { route, type Circuit } from '../circuit/model'
import { Symbol } from '../editor/Symbol'
import type { Translate } from '../locale'
import type { Palette } from '../palette'
import type { PreferredView } from '../storage/types'

type CircuitPreviewProps = {
  circuit: Circuit
  preferredView?: PreferredView
  palette: Palette
  t: Translate
  compact?: boolean
}

export function CircuitPreview({ circuit, preferredView = 'schematic', palette, t, compact = false }: CircuitPreviewProps) {
  const patternId = useId().replace(/:/g, '')
  const isEmpty = circuit.components.length === 0

  if (isEmpty) {
    return (
      <div className={compact ? 'circuit-preview circuit-preview-empty circuit-preview-compact' : 'circuit-preview circuit-preview-empty'} aria-hidden="true">
        <div className="circuit-preview-empty-badge">
          {preferredView === 'board' ? <CircuitBoard size={compact ? 16 : 20} /> : <Waypoints size={compact ? 16 : 20} />}
          {!compact && <span>{t(preferredView === 'board' ? 'Blank breadboard' : 'Blank schematic')}</span>}
        </div>
      </div>
    )
  }

  const routed = circuit.wires.map(wire => ({
    id: wire.id,
    points: route(circuit, wire),
  }))

  const xs: number[] = []
  const ys: number[] = []
  for (const part of circuit.components) {
    xs.push(part.x - 44, part.x + 44)
    ys.push(part.y - 32, part.y + 32)
  }
  for (const wire of routed) {
    for (const pt of wire.points) {
      xs.push(pt.x)
      ys.push(pt.y)
    }
  }
  for (const junction of circuit.junctions) {
    xs.push(junction.x)
    ys.push(junction.y)
  }

  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const pad = 28
  const rawW = Math.max(120, maxX - minX + pad * 2)
  const rawH = Math.max(80, maxY - minY + pad * 2)
  const targetRatio = 280 / 160
  let boxW = rawW
  let boxH = rawH
  if (rawW / rawH > targetRatio) {
    boxH = rawW / targetRatio
  } else {
    boxW = rawH * targetRatio
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const vx = cx - boxW / 2
  const vy = cy - boxH / 2

  return (
    <div className={compact ? 'circuit-preview circuit-preview-compact' : 'circuit-preview'} aria-hidden="true">
      <svg viewBox={`${vx} ${vy} ${boxW} ${boxH}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id={patternId} width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="20" cy="20" r="1.4" fill={palette.gridMajor} opacity="0.55" />
          </pattern>
        </defs>
        <rect x={vx} y={vy} width={boxW} height={boxH} fill={palette.canvas} />
        <rect x={vx} y={vy} width={boxW} height={boxH} fill={`url(#${patternId})`} />
        {routed.map(({ id, points }) => (
          <path
            key={id}
            d={points.map((pt, index) => `${index === 0 ? 'M' : 'L'}${pt.x} ${pt.y}`).join(' ')}
            fill="none"
            stroke={palette.wire}
            strokeWidth={Math.max(2.2, boxW / 120)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {circuit.junctions.map(junction => (
          <circle
            key={junction.id}
            cx={junction.x}
            cy={junction.y}
            r={Math.max(3.5, boxW / 95)}
            fill={palette.junction}
          />
        ))}
        {circuit.components.map(part => (
          <g
            key={part.id}
            transform={`translate(${part.x} ${part.y}) rotate(${part.rotation})`}
            style={{ color: palette.ink }}
          >
            <Symbol kind={part.kind} closed={part.closed} />
          </g>
        ))}
      </svg>
    </div>
  )
}
