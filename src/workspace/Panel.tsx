import { useEffect, useRef, type ReactNode } from 'react'
import { Pin, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { PanelId, PanelSide } from './panels'

type Side = 'top' | 'right' | 'bottom' | 'left'

/** Icon-only button with a tooltip; the label is also its accessible name. */
export function IconTool({ label, tip = label, pressed, disabled, id, className, side, onClick, children }: {
  label: string; tip?: string; pressed?: boolean; disabled?: boolean; id?: string; className?: string; side?: Side; onClick: () => void; children: ReactNode
}) {
  return <Tooltip>
    <TooltipTrigger render={<Button id={id} variant="ghost" size="icon-sm" aria-label={label} aria-pressed={pressed} disabled={disabled}
      className={cn(pressed ? 'tool-active' : 'tool', className)} onClick={onClick} />}>{children}</TooltipTrigger>
    <TooltipContent side={side}>{tip}</TooltipContent>
  </Tooltip>
}

export const launcherId = (id: PanelId) => `launcher-${id}`

export type PanelProps = {
  id: PanelId
  side: PanelSide
  title: string
  icon: ReactNode
  pinned: boolean
  /** Phone layout: panels are bottom sheets and cannot be pinned. */
  compact: boolean
  pinLabel: string
  closeLabel: string
  pinTip: string
  unpinTip: string
  onPin: (pinned: boolean) => void
  onClose: () => void
  meta?: ReactNode
  className?: string
  children: ReactNode
}

/**
 * A workspace drawer or sheet. Floating panels overlay the editor with an elevation shadow; pinned panels dock and
 * the editor makes room for them. Escape closes a floating panel only while focus is inside it, and focus returns to
 * its launcher button. The panel is non-modal, so focus is never trapped.
 */
export function Panel({ id, side, title, icon, pinned, compact, pinLabel, closeLabel, pinTip, unpinTip, onPin, onClose, meta, className, children }: PanelProps) {
  const docked = pinned && !compact
  const element = useRef<HTMLElement>(null)
  function close() {
    document.getElementById(launcherId(id))?.focus()
    onClose()
  }
  useEffect(() => {
    // Capture on window: tooltips and popups inside the panel stop Escape before it bubbles.
    function keyDown(event: KeyboardEvent) {
      const panel = element.current
      const target = event.target
      if (event.key !== 'Escape' || docked || !panel || !(target instanceof Element) || !panel.contains(target)) return
      // Leave Escape to open comboboxes and menus inside the panel.
      if (target.closest('[aria-expanded="true"]')) return
      event.preventDefault()
      close()
    }
    window.addEventListener('keydown', keyDown, true)
    return () => window.removeEventListener('keydown', keyDown, true)
  })
  return <section ref={element} id={`panel-${id}`} className={cn('panel', className)} data-side={side} data-docked={docked}
    aria-labelledby={`panel-${id}-title`}>
    <header className="panel-head">
      <span className="panel-icon" aria-hidden="true">{icon}</span>
      <h2 id={`panel-${id}-title`}>{title}</h2>
      {meta}
      <div className="panel-actions">
        {!compact && <IconTool label={pinLabel} tip={pinned ? unpinTip : pinTip} pressed={pinned} onClick={() => onPin(!pinned)}><Pin /></IconTool>}
        <IconTool label={closeLabel} onClick={close}><X /></IconTool>
      </div>
    </header>
    <div className="panel-body">{children}</div>
  </section>
}

export type LauncherItem = { id: PanelId; label: string; icon: ReactNode; open: boolean }

/** Compact rail of icon buttons that open and close panels; it stays visible so closed panels can be reopened. */
export function Launcher({ label, items, compact, onToggle }: { label: string; items: LauncherItem[]; compact: boolean; onToggle: (id: PanelId) => void }) {
  return <nav className="launcher" aria-label={label}>
    {items.map(item => <IconTool key={item.id} id={launcherId(item.id)} label={item.label} pressed={item.open} side={compact ? 'top' : 'right'}
      onClick={() => onToggle(item.id)}>{item.icon}</IconTool>)}
  </nav>
}
