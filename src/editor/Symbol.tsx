import type { Kind } from '../circuit/model'

export function Symbol({ kind, closed, lit = 0 }: { kind: Kind; closed?: boolean; lit?: number }) {
  const resistor = 'M-25 0l4 -7 7 14 7 -14 7 14 7 -14 7 14 7 -14 4 7'
  return <g stroke="currentColor" fill="none" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    {kind === 'ground' ? <path d="M-40 0H-8M-8 -13v26M-2 -9v18M4 -4v8" /> : <>
      <path d={kind === 'resistor' || kind === 'potentiometer' ? 'M-40 0h15M25 0h15' : 'M-40 0h22M18 0h22'} />
      {(kind === 'resistor' || kind === 'potentiometer') && <path d={resistor} />}
      {kind === 'potentiometer' && <path d="M8 -22L0 -9m-1 -6 1 6 6 -2" />}
      {(kind === 'voltage' || kind === 'current' || kind === 'bulb' || kind === 'voltmeter' || kind === 'ammeter') && <circle r="18" fill={kind === 'bulb' ? `rgba(255,205,89,${lit})` : undefined} />}
      {kind === 'voltage' && <path d="M-12 0h10m-5 -5v10M5 0h8" />}
      {kind === 'current' && <path d="M-9 0H9M4 -5l5 5 -5 5" />}
      {kind === 'bulb' && <path d="M-11 -11L11 11M11 -11L-11 11" />}
      {(kind === 'voltmeter' || kind === 'ammeter') && <text y="5" textAnchor="middle" fill="currentColor" stroke="none" fontSize="15">{kind === 'voltmeter' ? 'V' : 'A'}</text>}
      {kind === 'switch' && <><circle cx="-15" r="3" /><circle cx="15" r="3" /><path d={closed ? 'M-12 0H12' : 'M-12 -1L12 -14'} /></>}
      {kind === 'fuse' && <><rect x="-18" y="-7" width="36" height="14" /><path d="M-18 0h36" /></>}
      {(kind === 'led' || kind === 'diode') && <><path d="M-18 0h8M10 0h8M-10 -11L10 0 -10 11ZM10 -12v24" fill={kind === 'led' && lit ? '#ffcf55' : 'none'} />
        {kind === 'led' && <path d="M-4 -16l7 -8m-4 0h4v4m3 5 7 -8m-4 0h4v4" />}</>}
    </>}
  </g>
}
