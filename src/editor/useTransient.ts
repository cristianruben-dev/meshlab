import { useEffect, useMemo, useRef, useState } from 'react'
import { stepTransient, type DynamicBranch } from '../engine/transient'
import type { SolveResult } from '../engine/solver'

export type Sample = { time: number; voltages: Record<string, number> }
type Trace = { key: string; time: number; samples: Sample[]; result?: SolveResult }
const step = .02
const capacity = 200

export function useTransient(branches: DynamicBranch[], running: boolean) {
  const capacitors = useMemo(() => branches.filter(branch => branch.kind === 'capacitor'), [branches])
  const enabled = !!capacitors.length && branches.length <= 200
  // Geometry and passive slider/switch edits do not discard compatible charge history.
  const signature = JSON.stringify(branches.map(b => [b.id, b.kind, b.a, b.b, b.kind === 'capacitor' && b.value]))
  const [epoch, setEpoch] = useState(0)
  const key = `${epoch}:${signature}`
  const [trace, setTrace] = useState<Trace>()
  const state = useRef<Trace | undefined>(undefined)
  useEffect(() => {
    if (state.current?.key !== key) {
      state.current = { key, time: 0, samples: [] }
      setTrace(state.current)
    }
    if (!enabled || !running) return
    const tick = () => {
      const before = state.current!
      const prior = before.samples.at(-1)?.voltages ?? {}
      const result = stepTransient(branches, step, prior)
      if (!result.ok) {
        state.current = { ...before, result }
        setTrace(state.current)
        return false
      }
      const time = Math.round((before.time + step) * 100) / 100
      const voltages = Object.fromEntries(Object.entries(result.branches).map(([id, reading]) => [id, reading.voltage]))
      state.current = { key, time, result, samples: [...before.samples.slice(-(capacity - 1)), { time, voltages }] }
      setTrace(state.current)
      return true
    }
    if (!state.current.time && !tick()) return
    const timer = window.setInterval(() => { if (!tick()) window.clearInterval(timer) }, step * 1000)
    return () => window.clearInterval(timer)
  }, [branches, enabled, key, running])
  const active = trace?.key === key ? trace : undefined
  return { enabled, capacitors, time: active?.time ?? 0, samples: active?.samples ?? [], result: active?.result,
    reset: () => setEpoch(n => n + 1) }
}
