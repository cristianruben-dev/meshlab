import { useLayoutEffect, useState, type RefObject } from 'react'

type Insets = { top: number; bottom: number }

/**
 * Screen pixels of the stage covered by floating chrome: everything above the lower edge of the `top` elements and
 * below the upper edge of the `bottom` elements. The schematic centres its drawing in the uncovered band.
 */
export function useInsets(stage: RefObject<HTMLElement | null>, top: RefObject<HTMLElement | null>[], bottom: RefObject<HTMLElement | null>[], key: unknown) {
  const [insets, setInsets] = useState<Insets>({ top: 0, bottom: 0 })
  useLayoutEffect(() => {
    const area = stage.current
    if (!area) return
    const measure = () => {
      const box = area.getBoundingClientRect()
      const lower = top.flatMap(ref => ref.current ? [ref.current.getBoundingClientRect().bottom] : [])
      const upper = bottom.flatMap(ref => ref.current ? [ref.current.getBoundingClientRect().top] : [])
      const next = {
        top: Math.round(Math.max(0, ...lower.map(edge => edge - box.top))),
        bottom: Math.round(Math.max(0, ...upper.map(edge => box.bottom - edge))),
      }
      setInsets(previous => previous.top === next.top && previous.bottom === next.bottom ? previous : next)
    }
    measure()
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    for (const element of [area, ...top.map(ref => ref.current), ...bottom.map(ref => ref.current)]) if (element) observer?.observe(element)
    return () => { window.removeEventListener('resize', measure); observer?.disconnect() }
    // The refs are stable; `key` re-runs the effect when the measured elements change.
  }, [key])
  return insets
}
