import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Component } from '../circuit/model'
import type { Translate } from '../locale'
import { metric } from './catalog'
import type { Sample } from './useTransient'
import type { Palette } from '../palette'

export default function Scope({ t, palette: c, samples, time, parts, probe, onProbe, reset }: {
  t: Translate; palette: Palette; samples: Sample[]; time: number; parts: Component[]; probe: string; onProbe: (id: string) => void; reset: () => void
}) {
  const readings = samples.flatMap(sample => sample.voltages[probe] === undefined ? [] : [{ time: sample.time, volts: sample.voltages[probe] }])
  const low = Math.min(0, ...readings.map(p => p.volts))
  const high = Math.max(0, ...readings.map(p => p.volts))
  const min = low === high ? -1 : low
  const max = low === high ? 1 : high
  const from = readings[0]?.time ?? 0
  const to = Math.max(from + .02, time)
  const x = (v: number) => 66 + (v - from) / (to - from) * 635
  const y = (v: number) => 137 - (v - min) / (max - min) * 108
  const points = readings.map(p => `${x(p.time)},${y(p.volts)}`).join(' ')
  const divisions = [0, .25, .5, .75, 1]
  // Rendered inside the Oscilloscope panel, which provides the heading.
  return <div className="scope">
    <div className="scope-controls">
      <output aria-label={t('Simulation time')}>{metric(time, 's')}</output>
      <Select value={probe} items={Object.fromEntries(parts.map(c => [c.id, c.label]))} onValueChange={id => { if (id) onProbe(id) }}>
        <SelectTrigger aria-label={t('Voltage probe')}><SelectValue /></SelectTrigger>
        <SelectContent>{parts.map(c => <SelectItem value={c.id} key={c.id}>{c.label}</SelectItem>)}</SelectContent>
      </Select>
      <Button variant="outline" size="sm" onClick={reset}><RotateCcw />{t('Reset transient')}</Button>
    </div>
    <svg role="img" aria-label={t('Voltage versus time')} viewBox="0 0 720 170">
      <rect width="720" height="170" fill={c.scopeBackground} />
      {divisions.map(fraction => {
        const v = min + (max - min) * fraction
        const at = from + (to - from) * fraction
        return <g key={fraction} className="scope-grid">
          <path d={`M66,${y(v)}H701 M${x(at)},29V137`} stroke={c.scopeGrid} />
          <text x="59" y={y(v) + 4} textAnchor="end" fill={c.scopeText}>{metric(v, 'V')}</text>
          <text x={x(at)} y="155" textAnchor={fraction === 1 ? 'end' : 'middle'} fill={c.scopeText}>{metric(at, 's')}</text>
        </g>
      })}
      {readings.length > 1 && <polyline className="scope-trace" points={points} fill="none" stroke={c.trace} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
    </svg>
  </div>
}
