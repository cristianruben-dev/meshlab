import { useId } from 'react'
import { CircuitBoard, Waypoints } from 'lucide-react'
import { boardGeometry } from '../breadboard/geometry'
import { boardShape } from '../breadboard/model'
import { defaultBoardSettings, type BoardSettings } from '../breadboard/settings'
import { route, type Circuit } from '../circuit/model'
import { Symbol } from '../editor/Symbol'
import type { Translate } from '../locale'
import type { Palette } from '../palette'
import type { PreferredView } from '../storage/types'

type CircuitPreviewProps = {
  circuit: Circuit
  preferredView?: PreferredView
  boardSettings?: BoardSettings
  palette: Palette
  t: Translate
  compact?: boolean
}

export function CircuitPreview({
  circuit,
  preferredView = 'schematic',
  boardSettings,
  palette,
  t,
  compact = false,
}: CircuitPreviewProps) {
  const patternId = useId().replace(/:/g, '')

  if (preferredView === 'board') {
    const settings = boardSettings ?? defaultBoardSettings
    const shape = boardShape(settings)
    const geo = boardGeometry(shape)
    const layout = circuit.breadboard
    const placements = layout?.placements ?? []
    const jumpers = layout?.jumpers ?? []
    const isEmpty = placements.length === 0 && jumpers.length === 0

    if (isEmpty) {
      return (
        <div className={compact ? 'circuit-preview circuit-preview-empty circuit-preview-compact' : 'circuit-preview circuit-preview-empty'} aria-hidden="true">
          <div className="circuit-preview-empty-badge">
            <CircuitBoard size={compact ? 16 : 20} />
            {!compact && <span>{t('Blank breadboard')}</span>}
          </div>
        </div>
      )
    }

    const pad = 28
    const vx = -pad
    const vy = -pad
    const vw = geo.width + pad * 2
    const vh = geo.height + pad * 2
    const partById = new Map(circuit.components.map(c => [c.id, c]))

    return (
      <div className={compact ? 'circuit-preview circuit-preview-compact' : 'circuit-preview'} aria-hidden="true">
        <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} preserveAspectRatio="xMidYMid meet">
          <rect x={vx} y={vy} width={vw} height={vh} fill={palette.canvas} />
          <rect x="0" y="0" width={geo.width} height={geo.height} rx="18" fill="#eef1f3" stroke="#b9c3cb" strokeWidth="4" />
          <rect x="18" y={geo.trenchY - 9} width={geo.width - 36} height="18" rx="4" fill="#c7d0d6" />
          {shape.railLength > 0 && (
            <>
              <line x1="40" y1={geo.rowY['T+'] - 11} x2={geo.width - 40} y2={geo.rowY['T+'] - 11} stroke="#cc3e3a" strokeWidth="4" />
              <line x1="40" y1={geo.rowY['T-'] + 11} x2={geo.width - 40} y2={geo.rowY['T-'] + 11} stroke="#3d6fc0" strokeWidth="4" />
              <line x1="40" y1={geo.rowY['B+'] - 11} x2={geo.width - 40} y2={geo.rowY['B+'] - 11} stroke="#cc3e3a" strokeWidth="4" />
              <line x1="40" y1={geo.rowY['B-'] + 11} x2={geo.width - 40} y2={geo.rowY['B-'] + 11} stroke="#3d6fc0" strokeWidth="4" />
            </>
          )}
          {geo.sockets.filter((_, i) => shape.columns <= 30 || i % 2 === 0).map(socket => (
            <circle key={socket.id} cx={socket.x} cy={socket.y} r="3.2" fill="#4f5b66" opacity="0.45" />
          ))}
          {jumpers.map(jumper => {
            const a = geo.hole(jumper.from)
            const b = geo.hole(jumper.to)
            if (!a || !b) return null
            const mx = (a.x + b.x) / 2
            const my = (a.y + b.y) / 2 - 18
            return (
              <path
                key={jumper.id}
                d={`M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`}
                fill="none"
                stroke={jumper.color}
                strokeWidth="7"
                strokeLinecap="round"
              />
            )
          })}
          {placements.map(placement => {
            const a = geo.hole(placement.sockets[0])
            const b = placement.sockets[1] ? geo.hole(placement.sockets[1]) : a
            if (!a || !b) return null
            const part = partById.get(placement.componentId)
            if (part?.kind === 'ground' || placement.sockets.length === 1) {
              return <circle key={placement.id} cx={a.x} cy={a.y} r="9" fill="#1e293b" stroke="#ffffff" strokeWidth="2.5" />
            }
            if (part?.kind === 'voltage' || part?.kind === 'current') {
              return (
                <g key={placement.id}>
                  <circle cx={a.x} cy={a.y} r="9" fill="#cc3e3a" stroke="#ffffff" strokeWidth="2.5" />
                  <circle cx={b.x} cy={b.y} r="9" fill="#3d6fc0" stroke="#ffffff" strokeWidth="2.5" />
                </g>
              )
            }
            const cx = (a.x + b.x) / 2
            const cy = (a.y + b.y) / 2
            const angle = Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI)
            const color = part?.kind === 'led'
              ? '#e04f3d'
              : part?.kind === 'capacitor'
                ? '#2d62c8'
                : part?.kind === 'switch'
                  ? '#334155'
                  : part?.kind === 'bulb'
                    ? '#eab308'
                    : '#d6a468'
            return (
              <g key={placement.id}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#748290" strokeWidth="4.5" strokeLinecap="round" />
                {part?.kind === 'led' || part?.kind === 'bulb' ? (
                  <circle cx={cx} cy={cy} r="10.5" fill={color} stroke="#1f2933" strokeWidth="2" />
                ) : (
                  <rect
                    x={cx - 18}
                    y={cy - 7}
                    width="36"
                    height="14"
                    rx="5"
                    transform={`rotate(${angle} ${cx} ${cy})`}
                    fill={color}
                    stroke="#1f2933"
                    strokeWidth="2"
                  />
                )}
              </g>
            )
          })}
        </svg>
      </div>
    )
  }

  const isEmpty = circuit.components.length === 0

  if (isEmpty) {
    return (
      <div className={compact ? 'circuit-preview circuit-preview-empty circuit-preview-compact' : 'circuit-preview circuit-preview-empty'} aria-hidden="true">
        <div className="circuit-preview-empty-badge">
          <Waypoints size={compact ? 16 : 20} />
          {!compact && <span>{t('Blank schematic')}</span>}
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
