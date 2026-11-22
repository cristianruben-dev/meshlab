import { useMemo, useState, type CSSProperties } from 'react'
import { Crosshair, FlipHorizontal2, Move, Sparkles, Trash2, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Circuit, Component } from '../circuit/model'
import { catalog, metric } from '../editor/catalog'
import type { BranchReading } from '../engine/solver'
import type { Translate } from '../locale'
import type { Theme } from '../theme'
import { probeBoardNode } from './compiler'
import { boardGeometry } from './geometry'
import { boardShape, holeGroup } from './model'
import type { BoardSettings } from './settings'
import { JUMPER_COLORS, type BreadboardLayout } from './types'
import type { useBreadboard } from './useBreadboard'
import Board3D, { type Insets } from './Board3D'
import './board.css'

export type BoardController = ReturnType<typeof useBreadboard>

export type BoardProps = {
  t: Translate
  theme: Theme
  settings: BoardSettings
  circuit: Circuit
  layout: BreadboardLayout
  board: BoardController
  pins: Record<string, string>
  readings: Record<string, number> | undefined
  branchReadings: Record<string, BranchReading> | undefined
  trippedFuses?: Set<string>
  selected: string[]
  onSelect: (ids: string[]) => void
  onToggle: (part: Component) => void
  /** Screen pixels covered by floating chrome along each edge; the camera and overlays stay in the free area. */
  insets?: Insets
}

function webgl() {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch { return false }
}

const none: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

/** Interactive free-form 3D breadboard supporting all 13 catalog components, jumpers, probing, and live simulation. */
export default function Board({
  t,
  theme,
  settings,
  circuit,
  layout,
  board,
  pins,
  readings,
  branchReadings,
  trippedFuses,
  selected,
  onSelect,
  onToggle,
  insets = none,
}: BoardProps) {
  const [available, setAvailable] = useState(webgl)
  const shape = useMemo(() => boardShape(settings), [settings.size, settings.rails, settings.splitRails])
  const geometry = useMemo(() => boardGeometry(shape), [shape])
  const parts = useMemo(() => new Map(circuit.components.map(part => [part.id, part])), [circuit.components])

  const strip = useMemo(() => {
    if (!board.activeStripGroup) return []
    return geometry.sockets.filter(s => holeGroup(shape, s.id) === board.activeStripGroup).map(s => s.id)
  }, [board.activeStripGroup, geometry.sockets, shape])

  const probe = board.probedSocket
  const node = probe ? probeBoardNode(shape, layout, pins, probe) : undefined
  const value = node !== undefined ? readings?.[node] : undefined

  const selectedPart = selected.length === 1 ? parts.get(selected[0]) : undefined
  const mountedSwitch = useMemo(() => {
    if (selectedPart?.kind === 'switch') return selectedPart
    return layout.placements
      .map(p => parts.get(p.componentId))
      .find((part): part is Component => part?.kind === 'switch')
  }, [layout.placements, parts, selectedPart])

  const pendingPrompt = useMemo(() => {
    const { pending, tool } = board
    if (pending) {
      if (pending.type === 'wire') {
        return `${t('Jumper wire')}: ${pending.from} → ${t('Select destination socket')}`
      }
      const name = t(catalog[pending.kind].name)
      if (pending.kind === 'ground') {
        return `${pending.type === 'move' ? t('Move') : t('Place')} ${name}: ${t('Select a socket')}`
      }
      if (!pending.firstSocket) {
        return `${pending.type === 'move' ? t('Move') : t('Place')} ${name}: ${t('Select first pin socket')}`
      }
      return `${name} (${pending.firstSocket}): ${t('Select second pin socket')}`
    }
    if (tool === 'wire') return t('Jumper wire: select start socket')
    if (tool === 'probe') return t('Voltage probe: click any socket to measure')
    return ''
  }, [board.pending, board.tool, t])

  const free = {
    '--inset-top': `${insets.top}px`,
    '--inset-right': `${insets.right}px`,
    '--inset-bottom': `${insets.bottom}px`,
    '--inset-left': `${insets.left}px`,
  } as CSSProperties

  return <div className="board" data-size={settings.size} data-tool={board.tool} style={free}>
    {available
      ? <Board3D
          t={t}
          theme={theme}
          geometry={geometry}
          labels={settings.labels}
          layout={layout}
          parts={parts}
          branchReadings={branchReadings}
          trippedFuses={trippedFuses}
          selected={selected}
          selectedJumperId={board.selectedJumper?.id ?? null}
          strip={strip}
          probe={probe}
          hoveredSocket={board.hoveredSocket}
          anchorSocket={board.anchorSocket}
          ghost={board.ghostState}
          cameraMode={board.cameraMode}
          interactiveSocketMode={board.interactiveSocketMode}
          insets={insets}
          onSocket={board.handleSocketClick}
          onHoverSocket={board.setHoveredSocket}
          onPart={board.selectPart}
          onJumper={board.selectJumper}
          onUnavailable={() => setAvailable(false)}
        />
      : <p className="board-message" role="status">{t('The 3D breadboard needs WebGL, which is not available in this browser.')}</p>}

    {(pendingPrompt || board.feedback) && <div className="board-banner-host">
      {pendingPrompt && <div className="board-banner" role="status">
        <span>{pendingPrompt}</span>
        {board.pending && <Button size="xs" variant="ghost" onClick={board.cancelPending} aria-label={t('Cancel')}>
          <X size={14} />{t('Cancel')}
        </Button>}
      </div>}
      {board.feedback && <div className="board-feedback" role={board.feedback.tone === 'error' ? 'alert' : 'status'}>
        {t(board.feedback.message)}
      </div>}
    </div>}

    {board.unmountedParts.length > 0 && <div className="board-tray" role="region" aria-label={t('Unmounted schematic components')}>
      <span className="board-tray-label">{t('Unmounted')}:</span>
      <div className="board-tray-chips">
        {board.unmountedParts.map(part => {
          const active = board.pending?.type === 'place-existing' && board.pending.componentId === part.id
          return <Button
            key={part.id}
            size="xs"
            variant={active ? 'default' : 'outline'}
            className="board-tray-chip"
            onClick={() => board.startPlaceExisting(part)}
          >
            {part.label}
            {catalog[part.kind].unit ? ` · ${metric(part.value, catalog[part.kind].unit)}` : ''}
          </Button>
        })}
      </div>
      <Button size="xs" variant="secondary" className="board-tray-auto" onClick={board.autoMount}>
        <Sparkles size={13} />{t('Auto-mount')}
      </Button>
    </div>}

    {available && <div className="board-overlay board-overlay-start">
      <div className="board-probe">
        <Crosshair size={16} />
        <div>
          <small>{t('Voltage to ground')}</small>
          <strong role="status">
            {probe
              ? `${probe} · ${value !== undefined ? metric(value, 'V') : t(node === undefined ? 'Not connected' : 'No voltage reading')}`
              : t('Select a socket')}
          </strong>
        </div>
      </div>

      {mountedSwitch && <Button size="sm" variant="outline" className="board-switch" onClick={() => { onSelect([mountedSwitch.id]); onToggle(mountedSwitch) }}>
        <Zap />{t(mountedSwitch.closed ? 'Open the switch' : 'Close the switch')}
      </Button>}

      {board.selectedPlacement && <div className="board-context" role="group" aria-label={t('Selected component actions')}>
        <Button size="sm" variant="outline" className="board-action-pill" onClick={board.startMoveSelected}>
          <Move size={14} />{t('Relocate')}
        </Button>
        {board.canFlip && <Button size="sm" variant="outline" className="board-action-pill" onClick={board.flipSelected}>
          <FlipHorizontal2 size={14} />{t('Flip polarity')}
        </Button>}
      </div>}

      {board.selectedJumper && <div className="board-context board-jumper-bar" role="group" aria-label={t('Selected jumper wire')}>
        <span className="board-jumper-endpoints">{board.selectedJumper.from} ↔ {board.selectedJumper.to}</span>
        <div className="board-color-dots" role="group" aria-label={t('Jumper color')}>
          {JUMPER_COLORS.map(swatch => (
            <button
              key={swatch.id}
              type="button"
              className="board-color-dot"
              data-active={board.selectedJumper?.color === swatch.hex || undefined}
              style={{ '--swatch': swatch.hex } as CSSProperties}
              aria-label={t(swatch.name)}
              aria-pressed={board.selectedJumper?.color === swatch.hex}
              onClick={() => board.setJumperColor(swatch.hex)}
            />
          ))}
        </div>
        <Button size="icon-sm" variant="ghost" aria-label={t('Delete jumper')} onClick={board.deleteSelected}>
          <Trash2 size={14} />
        </Button>
      </div>}
    </div>}
  </div>
}
