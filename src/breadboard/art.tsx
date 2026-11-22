import type { Component } from '../circuit/model'
import { metric } from '../editor/catalog'
import type { Theme } from '../theme'
import type { BoardStep } from './model'
import { columns, hole, layout, resistorBands, rowLabels, rowY } from './geometry'

/** Literal SVG colors for the physical board; plastic stays light in both themes, but dims in dark mode. */
export type BoardPalette = {
  bodyTop: string; bodyBottom: string; bodyEdge: string; well: string; wellEdge: string
  trenchA: string; trenchB: string; socket: string; socketRim: string; index: string
  shadow: string; selected: string; strip: string; stripEdge: string; target: string; tag: string; tagText: string
}
export const boardPalettes: Record<Theme, BoardPalette> = {
  light: {
    bodyTop: '#ffffff', bodyBottom: '#e7ebee', bodyEdge: '#c9d1d7', well: '#f6f8f9', wellEdge: '#d3dadf',
    trenchA: '#b4bec5', trenchB: '#d6dde1', socket: '#2a323a', socketRim: '#c3ccd2', index: '#58646e',
    shadow: '#1b2a3a', selected: '#0d8a78', strip: '#14a08b', stripEdge: '#0b7a6c', target: '#2563eb', tag: '#ffffff', tagText: '#1b2633',
  },
  dark: {
    bodyTop: '#e3e8eb', bodyBottom: '#c2cbd1', bodyEdge: '#9aa6ae', well: '#dbe1e4', wellEdge: '#aab5bc',
    trenchA: '#8f9ba3', trenchB: '#b1bbc1', socket: '#1d252d', socketRim: '#a3aeb5', index: '#46525c',
    shadow: '#000000', selected: '#0f9e88', strip: '#18b89d', stripEdge: '#0b7a6c', target: '#2f6cf0', tag: '#f4f7f9', tagText: '#16202b',
  },
}

export function BoardDefs({ c }: { c: BoardPalette }) {
  return <defs>
    <linearGradient id="board-body" x1="0" x2="0" y1="0" y2="1"><stop stopColor={c.bodyTop} /><stop offset="1" stopColor={c.bodyBottom} /></linearGradient>
    <linearGradient id="board-trench" x1="0" x2="0" y1="0" y2="1"><stop stopColor={c.trenchA} /><stop offset=".5" stopColor={c.trenchB} /><stop offset="1" stopColor={c.trenchA} /></linearGradient>
    <linearGradient id="board-resistor" x2="0" y2="1"><stop stopColor="#f1dcb7" /><stop offset=".45" stopColor="#dcb98a" /><stop offset="1" stopColor="#a87b4c" /></linearGradient>
    <linearGradient id="board-lead" x2="0" y2="1"><stop stopColor="#eef2f5" /><stop offset="1" stopColor="#8a949c" /></linearGradient>
    <linearGradient id="board-switch" x2="0" y2="1"><stop stopColor="#4a5866" /><stop offset="1" stopColor="#25303b" /></linearGradient>
    <radialGradient id="board-led-on" cx=".4" cy=".35"><stop stopColor="#fffbe0" /><stop offset=".45" stopColor="#ffb13b" /><stop offset="1" stopColor="#e0532a" /></radialGradient>
    <radialGradient id="board-led-off" cx=".4" cy=".35"><stop stopColor="#ef8a80" /><stop offset=".6" stopColor="#b8332c" /><stop offset="1" stopColor="#7d1f1a" /></radialGradient>
    <radialGradient id="board-glow"><stop stopColor="#ffd36b" stopOpacity=".85" /><stop offset="1" stopColor="#ffb13b" stopOpacity="0" /></radialGradient>
    <filter id="board-shadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="10" stdDeviation="12" floodColor={c.shadow} floodOpacity=".28" /></filter>
    <filter id="part-shadow" x="-30%" y="-50%" width="160%" height="220%"><feDropShadow dx="0" dy="2.5" stdDeviation="1.6" floodColor="#0b1520" floodOpacity=".35" /></filter>
  </defs>
}

/** Static plastic body, rails, indices, and sockets. */
export function BoardSurface({ c }: { c: BoardPalette }) {
  return <g>
    <rect x="25" y="44" width="710" height="373" rx="18" fill="url(#board-body)" stroke={c.bodyEdge} filter="url(#board-shadow)" />
    <rect x="26.5" y="45.5" width="707" height="370" rx="17" fill="none" stroke="#ffffff" strokeOpacity=".7" />
    <rect x="38" y="132" width="685" height="224" rx="10" fill={c.well} stroke={c.wellEdge} />
    <rect x="42" y="239" width="677" height="15" rx="4" fill="url(#board-trench)" />
    {[[80, 362], [120, 402]].map(([a, b], index) => <g key={a} stroke={index ? '#3d6fc0' : '#cc3e3a'} strokeWidth="2.2" strokeLinecap="round">
      <path d={`M85,${a}H674M85,${b}H674`} />
    </g>)}
    <g className="board-index" fill={c.index}>
      {[[80, '+'], [120, '−'], [362, '+'], [402, '−']].map(([y, sign]) => <g key={y}>
        <text x="80" y={Number(y) + 4} textAnchor="middle" fill={sign === '+' ? '#cc3e3a' : '#3d6fc0'} fontSize="12">{sign}</text>
        <text x="680" y={Number(y) + 4} textAnchor="middle" fill={sign === '+' ? '#cc3e3a' : '#3d6fc0'} fontSize="12">{sign}</text>
      </g>)}
      {rowLabels.map((row, index) => <text key={row} x="62" y={rowY[index] + 4} textAnchor="middle">{row}</text>)}
      {columns.map(col => <text key={col} x={hole(`A${col}`).x} y="143" textAnchor="middle">{col}</text>)}
    </g>
    <g pointerEvents="none">
      {layout.map(p => <rect key={p.id} x={p.x - 3.6} y={p.y - 3.6} width="7.2" height="7.2" rx="1.6" fill={c.socket} stroke={c.socketRim} strokeWidth="1.3" />)}
    </g>
  </g>
}

export function Mounted({ step, sockets, part, label, selected, lit, choose, c }: {
  step: BoardStep; sockets: string[]; part?: Component; label: string; selected: boolean; lit: boolean; choose: () => void; c: BoardPalette
}) {
  const a = hole(sockets[0]), b = sockets[1] ? hole(sockets[1]) : a
  const isSource = part?.kind === 'voltage'
  const isGround = part?.kind === 'ground'
  if (isSource || isGround) return <g className="board-mounted" data-selected={selected} onClick={choose}>
    <title>{part.label} · {label}</title>
    {(isSource ? [a, b] : [a]).map((p, i) => {
      const above = p.y < 200
      const y = p.y + (above ? -28 : 20)
      const color = isSource && !i ? '#cc3e3a' : isGround ? '#2c3a48' : '#3d6fc0'
      const text = isGround ? 'GND' : `${part.label.slice(0, 4)}${i ? '−' : '+'}`
      return <g key={p.id}>
        <path d={`M${p.x},${p.y}V${y}`} stroke="#1b2430" strokeOpacity=".35" strokeWidth={selected ? 7 : 5.5} strokeLinecap="round" />
        <path d={`M${p.x},${p.y}V${y}`} stroke={color} strokeWidth={selected ? 4.5 : 3.4} strokeLinecap="round" />
        <circle cx={p.x} cy={p.y} r="2.6" fill="#c9d1d8" stroke="#6b7680" />
        <rect x={p.x - 21} y={y - 9} width="42" height="17" rx="8.5" fill={c.tag} stroke={selected ? c.selected : color} strokeWidth={selected ? 2.4 : 1.4} filter="url(#part-shadow)" />
        <text className="board-index" x={p.x} y={y + 3.5} fill={color} textAnchor="middle">{text}</text>
      </g>
    })}
  </g>
  if (!part) {
    const bend = Math.max(18, Math.abs(b.y - a.y) * .65)
    const path = `M${a.x},${a.y} C${a.x + bend},${a.y} ${b.x + bend},${b.y} ${b.x},${b.y}`
    return <g pointerEvents="none"><title>{label}</title>
      <path d={path} fill="none" stroke="#0e1822" strokeOpacity=".3" strokeWidth="8" strokeLinecap="round" transform="translate(0 2)" />
      <path d={path} fill="none" stroke={step.color} strokeWidth="5" strokeLinecap="round" />
      <path d={path} fill="none" stroke="#ffffff" strokeOpacity=".38" strokeWidth="1.4" strokeLinecap="round" transform="translate(-.6 -1.2)" />
      {[a, b].map(p => <circle key={p.id} cx={p.x} cy={p.y} r="3" fill="#c9d1d8" stroke="#5f6a73" strokeWidth="1" />)}
    </g>
  }
  const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2
  const degrees = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI
  const length = Math.hypot(a.x - b.x, a.y - b.y)
  const ring = selected ? c.selected : undefined
  const tag = `${part.label.length > 5 ? `${part.label.slice(0, 4)}…` : part.label}${part.kind === 'resistor' ? ` · ${metric(part.value, 'Ω')}` : ''}`
  const tagWidth = Math.max(36, tag.length * 6.6 + 14)
  return <g className="board-mounted" data-selected={selected} onClick={choose}>
    <title>{part.label} · {label}</title>
    <g transform={`translate(${x} ${y}) rotate(${degrees})`}>
      <path d={`M${-length / 2},0H${length / 2}`} stroke="#5f6a73" strokeWidth="3.4" strokeLinecap="round" />
      <path d={`M${-length / 2},0H${length / 2}`} stroke="url(#board-lead)" strokeWidth="2" strokeLinecap="round" />
      {part.kind === 'led' ? <g filter="url(#part-shadow)">
        {lit && <circle r="30" fill="url(#board-glow)" className="board-led-glow" />}
        <circle r="13" fill={lit ? 'url(#board-led-on)' : 'url(#board-led-off)'} stroke={ring ?? (lit ? '#d86a22' : '#6e1c17')} strokeWidth={ring ? 3 : 1.2} />
        <path d="M-9 9.5A13 13 0 0 0 9 9.5" fill="none" stroke="#5a1611" strokeOpacity=".55" strokeWidth="2" />
        <ellipse cx="-4.5" cy="-5" rx="4.2" ry="2.8" fill="#ffffff" opacity=".55" transform="rotate(-30 -4.5 -5)" />
      </g> : part.kind === 'switch' ? <g filter="url(#part-shadow)">
        <rect x="-27" y="-13" width="54" height="26" rx="6" fill="url(#board-switch)" stroke={ring ?? '#1a232c'} strokeWidth={ring ? 3 : 1.4} />
        <rect x="-19" y="-6" width="38" height="12" rx="6" fill="#18212a" />
        <rect x={part.closed ? 1 : -18} y="-5" width="17" height="10" rx="5" fill={part.closed ? '#8ff0d6' : '#d7e1e6'} />
      </g> : <g filter="url(#part-shadow)">
        <path d="M-31,-7 Q-31,-10 -27,-10 H-19 Q-16,-7 -12,-7 H12 Q16,-7 19,-10 H27 Q31,-10 31,-7 V7 Q31,10 27,10 H19 Q16,7 12,7 H-12 Q-16,7 -19,10 H-27 Q-31,10 -31,7 Z"
          fill="url(#board-resistor)" stroke={ring ?? '#8d6239'} strokeWidth={ring ? 3 : 1.1} />
        {resistorBands(part.value).map((color, i) => <rect key={i} x={[-22, -12, -4, 17][i]} y={i === 0 || i === 3 ? -9.5 : -7} width="4.2" height={i === 0 || i === 3 ? 19 : 14} fill={color} />)}
        <path d="M-27,-6 H27" stroke="#ffffff" strokeOpacity=".35" strokeWidth="1.6" strokeLinecap="round" />
      </g>}
    </g>
    <g filter="url(#part-shadow)">
      <rect x={x - tagWidth / 2} y={y - 34} width={tagWidth} height="17" rx="8.5" fill={selected ? c.selected : '#1e2a36'} />
      <text className="board-index" x={x} y={y - 22.5} textAnchor="middle" fill="#fff">{tag}</text>
    </g>
  </g>
}
