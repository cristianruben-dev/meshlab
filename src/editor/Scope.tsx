import { useLayoutEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Component } from '../circuit/model'
import type { Translate } from '../locale'
import { metric } from './catalog'
import type { Sample } from './useTransient'
import type { Palette } from '../palette'

/** Fallback plot width before the panel is measured (and in environments without layout). */
const FALLBACK_WIDTH = 560

/** Measures the plot area so the chart draws in screen pixels and its labels keep their size at any panel width. */
function useWidth() {
  const element = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(FALLBACK_WIDTH)
  useLayoutEffect(() => {
    const node = element.current
    if (!node) return
    const measure = () => { const next = Math.round(node.getBoundingClientRect().width); if (next > 0) setWidth(next) }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return [element, width] as const
}

export default function Scope({ t, palette: c, samples, time, parts, probe, onProbe, reset }: {
  t: Translate; palette: Palette; samples: Sample[]; time: number; parts: Component[]; probe: string; onProbe: (id: string) => void; reset: () => void
}) {
  const [plot, width] = useWidth()
  const height = Math.round(Math.min(220, Math.max(150, width * .34)))
  const box = { left: 64, right: width - 16, top: 14, bottom: height - 28 }
  const readings = samples.flatMap(sample => sample.voltages[probe] === undefined ? [] : [{ time: sample.time, volts: sample.voltages[probe] }])
  const low = Math.min(0, ...readings.map(p => p.volts))
  const high = Math.max(0, ...readings.map(p => p.volts))
  const min = low === high ? -1 : low
  const max = low === high ? 1 : high
  const from = readings[0]?.time ?? 0
  const to = Math.max(from + .02, time)
  const x = (v: number) => box.left + (v - from) / (to - from) * (box.right - box.left)
  const y = (v: number) => box.bottom - (v - min) / (max - min) * (box.bottom - box.top)
  const points = readings.map(p => `${x(p.time).toFixed(1)},${y(p.volts).toFixed(1)}`).join(' ')
  // Fewer time labels on narrow sheets so they never collide.
  const columns = width < 420 ? [0, .5, 1] : [0, .25, .5, .75, 1]
  const rows = [0, .25, .5, .75, 1]
  // Rendered inside the Oscilloscope panel, which provides the heading.
  return <div className="scope">
    <div className="scope-controls">
      <output aria-label={t('Simulation time')}>{metric(time, 's')}</output>
      <Select value={probe} items={Object.fromEntries(parts.map(c => [c.id, c.label]))} onValueChange={id => { if (id) onProbe(id) }}>
        <SelectTrigger aria-label={t('Voltage probe')}><SelectValue /></SelectTrigger>
        <SelectContent>{parts.map(c => <SelectItem value={c.id} key={c.id}>{c.label}</SelectItem>)}</SelectContent>
      </Select>
      <Button variant="outline" onClick={reset}><RotateCcw />{t('Reset transient')}</Button>
    </div>
    <div className="scope-plot" ref={plot}>
      <svg role="img" aria-label={t('Voltage versus time')} viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
        <rect width={width} height={height} rx="10" fill={c.scopeBackground} />
        <g className="scope-grid">
          {rows.map(fraction => {
            const v = min + (max - min) * fraction
            return <g key={`v${fraction}`}>
              <path d={`M${box.left},${y(v)}H${box.right}`} stroke={c.scopeGrid} />
              <text x={box.left - 8} y={y(v) + 4} textAnchor="end" fill={c.scopeText}>{metric(v, 'V')}</text>
            </g>
          })}
          {columns.map(fraction => {
            const at = from + (to - from) * fraction
            return <g key={`t${fraction}`}>
              <path d={`M${x(at)},${box.top}V${box.bottom}`} stroke={c.scopeGrid} />
              <text x={x(at)} y={height - 9} textAnchor={fraction === 1 ? 'end' : fraction === 0 ? 'start' : 'middle'} fill={c.scopeText}>{metric(at, 's')}</text>
            </g>
          })}
        </g>
        {readings.length > 1 && <polyline className="scope-trace" points={points} fill="none" stroke={c.trace} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      </svg>
    </div>
  </div>
}
