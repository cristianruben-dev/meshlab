import { useLayoutEffect, useState, type RefObject } from 'react'

/** Screen pixels along each edge of the stage covered by floating chrome. */
export type Insets = { top: number; right: number; bottom: number; left: number }
/** CSS selectors, matched inside the workbench, of the chrome that covers each edge of the stage. */
export type InsetSources = { top: string[]; right: string[]; bottom: string[]; left: string[] }

export const noInsets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
/** Side panels only count while the editor keeps at least this much width between them. */
const MIN_FREE_WIDTH = 320

/**
 * Measures how much of the stage the floating chrome covers: everything above the lower edge of the `top` elements,
 * below the upper edge of the `bottom` ones, and beside the `left` and `right` ones. The editors frame their content
 * in the remaining area.
 */
export function useInsets(stage: RefObject<HTMLElement | null>, sources: InsetSources, key: unknown) {
  const [insets, setInsets] = useState<Insets>(noInsets)
  useLayoutEffect(() => {
    const area = stage.current
    const root = area?.closest('.workbench') ?? area
    if (!area || !root) return
    const find = (selectors: string[]) => selectors.flatMap(selector => [...root.querySelectorAll<HTMLElement>(selector)])
    const measure = () => {
      const box = area.getBoundingClientRect()
      const rects = (selectors: string[]) => find(selectors).map(element => element.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0)
      const reach = (values: number[]) => Math.round(Math.max(0, ...values))
      let left = reach(rects(sources.left).map(rect => rect.right - box.left))
      let right = reach(rects(sources.right).map(rect => box.right - rect.left))
      if (box.width - left - right < MIN_FREE_WIDTH) { left = Math.min(left, 64); right = 0 }
      const next = {
        top: reach(rects(sources.top).map(rect => rect.bottom - box.top)),
        bottom: reach(rects(sources.bottom).map(rect => box.bottom - rect.top)),
        left, right,
      }
      setInsets(previous => previous.top === next.top && previous.bottom === next.bottom && previous.left === next.left && previous.right === next.right ? previous : next)
    }
    measure()
    window.addEventListener('resize', measure)
    // Panels slide in; measure again once they settle.
    root.addEventListener('animationend', measure)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    for (const element of [area, ...find([...sources.top, ...sources.bottom, ...sources.left, ...sources.right])]) observer?.observe(element)
    return () => { window.removeEventListener('resize', measure); root.removeEventListener('animationend', measure); observer?.disconnect() }
    // The selectors are static; `key` re-runs the effect when the measured elements change.
  }, [key])
  return insets
}
