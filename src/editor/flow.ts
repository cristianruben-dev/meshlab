import { useEffect, type RefObject } from 'react'

const REFERENCE = 60 // px/s at 1 mA
const MIN = 4
const MAX = 320

/**
 * Signed dot speed in drawing units per second. Speed grows with the square root of the current, so a branch with
 * four times the current moves twice as fast; tiny currents still crawl and large ones are capped.
 */
export function flowSpeed(amps: number | undefined, setting: number, electrons: boolean) {
  if (!amps || !Number.isFinite(amps)) return 0
  const magnitude = Math.min(MAX, Math.max(MIN, REFERENCE * Math.sqrt(Math.abs(amps) / 1e-3)))
  return magnitude * setting * Math.sign(amps) * (electrons ? -1 : 1)
}

/** Advances every `.flow` dash in the SVG by its `data-speed`, so speed changes never restart or jump the dots. */
export function useFlowAnimation(svg: RefObject<SVGSVGElement | null>, running: boolean) {
  useEffect(() => {
    if (!running || typeof requestAnimationFrame !== 'function') return
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(.1, (now - last) / 1000)
      last = now
      svg.current?.querySelectorAll<SVGPathElement>('path.flow').forEach(path => {
        const speed = Number(path.dataset.speed) || 0
        const offset = (Number(path.dataset.offset) || 0) - speed * dt
        path.dataset.offset = String(offset % 26)
        path.style.strokeDashoffset = String(offset % 26)
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [svg, running])
}
