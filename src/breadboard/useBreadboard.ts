import { useCallback, useEffect, useMemo, useState } from 'react'
import { GRID, type Circuit, type Component, type Kind } from '../circuit/model'
import { catalog } from '../editor/catalog'
import { autoPlaceCircuit, validateSocketPick } from './compiler'
import { holeGroup, type BoardShape } from './model'
import { JUMPER_COLORS, type BoardJumper, type BoardPlacement, type BreadboardLayout } from './types'

export type BoardTool = 'select' | 'wire' | 'probe'
export type CameraMode = '3d' | 'top'

export type PendingBoardAction =
  | { type: 'place-new'; kind: Kind; firstSocket?: string }
  | { type: 'place-existing'; componentId: string; kind: Kind; firstSocket?: string }
  | { type: 'move'; placementId: string; componentId: string; kind: Kind; firstSocket?: string }
  | { type: 'wire'; from: string }

export type BoardFeedback = { tone: 'error' | 'info'; message: string } | null

export type UseBreadboardOptions = {
  circuit: Circuit
  layout: BreadboardLayout
  shape: BoardShape
  selected: string[]
  onSelect: (ids: string[]) => void
  onCommit: (next: Circuit) => void
}

const makeId = () => crypto.randomUUID()

function nextLabel(circuit: Circuit, kind: Kind) {
  const prefix = catalog[kind].prefix
  let number = 1
  while (circuit.components.some(c => c.label === `${prefix}${number}`)) number++
  return `${prefix}${number}`
}

function nextSchematicPoint(circuit: Circuit) {
  let x = 200
  let y = 200
  while (circuit.components.some(c => c.x === x && c.y === y)) {
    x += GRID * 4
    if (x > 680) { x = 200; y += GRID * 4 }
  }
  return { x, y }
}

/**
 * Manages interactive free-form breadboard editing: component placement (all 13 types),
 * jumper wiring with selectable colors, polarity flipping, relocation, deletion, probing,
 * camera mode toggling, and live validation feedback.
 */
export function useBreadboard({ circuit, layout, shape, selected, onSelect, onCommit }: UseBreadboardOptions) {
  const [tool, setToolState] = useState<BoardTool>('select')
  const [jumperColor, setJumperColorState] = useState<string>(JUMPER_COLORS[0].hex)
  const [cameraMode, setCameraMode] = useState<CameraMode>('3d')
  const [pending, setPending] = useState<PendingBoardAction | null>(null)
  const [hoveredSocket, setHoveredSocket] = useState<string | undefined>(undefined)
  const [selectedJumperId, setSelectedJumperId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<BoardFeedback>(null)
  const shapeKey = `${shape.columns}:${shape.railLength}:${shape.split}`
  const [probed, setProbed] = useState({ key: shapeKey, socket: '' })
  const probedSocket = probed.key === shapeKey ? probed.socket : ''

  // Clear stale jumper selection when layout changes and that jumper no longer exists.
  const selectedJumper = useMemo(
    () => (selectedJumperId ? layout.jumpers.find(j => j.id === selectedJumperId) : undefined),
    [layout.jumpers, selectedJumperId],
  )
  useEffect(() => {
    if (selectedJumperId && !selectedJumper) setSelectedJumperId(null)
  }, [selectedJumperId, selectedJumper])

  // Clear jumper selection whenever a component gets selected.
  useEffect(() => {
    if (selected.length > 0 && selectedJumperId) setSelectedJumperId(null)
  }, [selected, selectedJumperId])

  const selectedPlacement = useMemo(
    () => (selected.length === 1 ? layout.placements.find(p => p.componentId === selected[0]) : undefined),
    [layout.placements, selected],
  )

  const placedIds = useMemo(() => new Set(layout.placements.map(p => p.componentId)), [layout.placements])
  const unmountedParts = useMemo(
    () => circuit.components.filter(c => !placedIds.has(c.id)),
    [circuit.components, placedIds],
  )

  const commitLayout = useCallback((nextLayout: BreadboardLayout, nextComponents = circuit.components) => {
    onCommit({ ...circuit, components: nextComponents, breadboard: nextLayout })
  }, [circuit, onCommit])

  const cancelPending = useCallback(() => {
    setPending(null)
    setFeedback(null)
  }, [])

  const setTool = useCallback((next: BoardTool) => {
    setPending(null)
    setFeedback(null)
    setToolState(next)
  }, [])

  const startPlaceNew = useCallback((kind: Kind) => {
    setSelectedJumperId(null)
    setFeedback(null)
    setToolState('select')
    setPending({ type: 'place-new', kind })
  }, [])

  const startPlaceExisting = useCallback((component: Component) => {
    setSelectedJumperId(null)
    setFeedback(null)
    setToolState('select')
    setPending({ type: 'place-existing', componentId: component.id, kind: component.kind })
  }, [])

  const startMoveSelected = useCallback(() => {
    if (!selectedPlacement) return
    const part = circuit.components.find(c => c.id === selectedPlacement.componentId)
    if (!part) return
    setSelectedJumperId(null)
    setFeedback(null)
    setToolState('select')
    setPending({ type: 'move', placementId: selectedPlacement.id, componentId: part.id, kind: part.kind })
  }, [circuit.components, selectedPlacement])

  const setJumperColor = useCallback((color: string) => {
    setJumperColorState(color)
    if (selectedJumper) {
      commitLayout({
        ...layout,
        jumpers: layout.jumpers.map(j => j.id === selectedJumper.id ? { ...j, color } : j),
      })
    }
  }, [commitLayout, layout, selectedJumper])

  const selectPart = useCallback((componentId: string) => {
    setSelectedJumperId(null)
    setFeedback(null)
    onSelect([componentId])
  }, [onSelect])

  const selectJumper = useCallback((jumperId: string) => {
    onSelect([])
    setSelectedJumperId(jumperId)
    setFeedback(null)
    const jumper = layout.jumpers.find(j => j.id === jumperId)
    if (jumper) setJumperColorState(jumper.color)
  }, [layout.jumpers, onSelect])

  const flipSelected = useCallback(() => {
    if (!selectedPlacement || selectedPlacement.sockets.length !== 2) return
    const [a, b] = selectedPlacement.sockets
    commitLayout({
      ...layout,
      placements: layout.placements.map(p => p.id === selectedPlacement.id ? { ...p, sockets: [b, a] } : p),
    })
    setFeedback(null)
  }, [commitLayout, layout, selectedPlacement])

  const deleteSelected = useCallback(() => {
    if (selectedJumper) {
      commitLayout({
        ...layout,
        jumpers: layout.jumpers.filter(j => j.id !== selectedJumper.id),
      })
      setSelectedJumperId(null)
      setFeedback(null)
      return true
    }
    if (selected.length > 0) {
      const removedSet = new Set(selected)
      const touches = (endpoint: { component: string; pin: 0 | 1 } | { junction: string }) =>
        'component' in endpoint ? removedSet.has(endpoint.component) : removedSet.has(endpoint.junction)
      const wires = circuit.wires.filter(w => !removedSet.has(w.id) && !touches(w.from) && !touches(w.to))
      const junctions = circuit.junctions.filter(j => wires.some(w => [w.from, w.to].some(e => 'junction' in e && e.junction === j.id)))
      const components = circuit.components.filter(c => !removedSet.has(c.id))
      const nextBoard: BreadboardLayout = {
        placements: layout.placements.filter(p => !removedSet.has(p.componentId) && !removedSet.has(p.id)),
        jumpers: layout.jumpers.filter(j => !removedSet.has(j.id)),
      }
      onCommit({ ...circuit, components, wires, junctions, breadboard: nextBoard })
      onSelect([])
      setFeedback(null)
      return true
    }
    return false
  }, [circuit, commitLayout, layout, onCommit, onSelect, selected, selectedJumper])

  const autoMount = useCallback(() => {
    setPending(null)
    setSelectedJumperId(null)
    setFeedback(null)
    const next = autoPlaceCircuit(circuit, shape)
    commitLayout(next)
  }, [circuit, commitLayout, shape])

  const clearBoard = useCallback(() => {
    setPending(null)
    setSelectedJumperId(null)
    setFeedback(null)
    setProbed({ key: shapeKey, socket: '' })
    onSelect([])
    onCommit({ version: 1, components: [], wires: [], junctions: [], breadboard: { placements: [], jumpers: [] } })
  }, [onCommit, onSelect, shapeKey])

  const handleSocketClick = useCallback((socket: string) => {
    // 1. Active placement or move action
    if (pending && (pending.type === 'place-new' || pending.type === 'place-existing' || pending.type === 'move')) {
      const ignoreId = pending.type === 'move' ? pending.placementId : undefined
      const check = validateSocketPick(shape, layout, socket, pending.firstSocket, ignoreId)
      if (!check.ok) {
        setFeedback({ tone: 'error', message: check.message })
        return
      }
      const isGround = pending.kind === 'ground'
      if (!isGround && !pending.firstSocket) {
        setPending({ ...pending, firstSocket: socket })
        setFeedback(null)
        return
      }
      const sockets = isGround ? [socket] : [pending.firstSocket!, socket]
      if (pending.type === 'place-new') {
        const meta = catalog[pending.kind]
        const point = nextSchematicPoint(circuit)
        const component: Component = {
          id: makeId(),
          kind: pending.kind,
          label: nextLabel(circuit, pending.kind),
          value: meta.value,
          x: point.x,
          y: point.y,
          rotation: pending.kind === 'ground' ? 90 : 0,
          ...(pending.kind === 'switch' ? { closed: false } : {}),
          ...(pending.kind === 'potentiometer' ? { position: 0.5 } : {}),
        }
        const placement: BoardPlacement = { id: makeId(), componentId: component.id, sockets }
        commitLayout(
          { placements: [...layout.placements, placement], jumpers: layout.jumpers },
          [...circuit.components, component],
        )
        onSelect([component.id])
        setProbed({ key: shapeKey, socket: sockets[0] })
      } else if (pending.type === 'place-existing') {
        const placement: BoardPlacement = { id: makeId(), componentId: pending.componentId, sockets }
        commitLayout({ placements: [...layout.placements, placement], jumpers: layout.jumpers })
        onSelect([pending.componentId])
        setProbed({ key: shapeKey, socket: sockets[0] })
      } else {
        commitLayout({
          placements: layout.placements.map(p => p.id === pending.placementId ? { ...p, sockets } : p),
          jumpers: layout.jumpers,
        })
        onSelect([pending.componentId])
        setProbed({ key: shapeKey, socket: sockets[0] })
      }
      setPending(null)
      setFeedback(null)
      return
    }

    // 2. Active jumper wiring mode
    if (tool === 'wire') {
      const from = pending?.type === 'wire' ? pending.from : undefined
      const check = validateSocketPick(shape, layout, socket, from)
      if (!check.ok) {
        setFeedback({ tone: 'error', message: check.message })
        return
      }
      if (!from) {
        setPending({ type: 'wire', from: socket })
        setFeedback(null)
        return
      }
      const jumper: BoardJumper = { id: makeId(), from, to: socket, color: jumperColor }
      commitLayout({ placements: layout.placements, jumpers: [...layout.jumpers, jumper] })
      setPending(null)
      setFeedback(null)
      return
    }

    // 3. Probe or Select mode
    setFeedback(null)
    if (tool === 'select') {
      const ownerPlacement = layout.placements.find(p => p.sockets.includes(socket))
      if (ownerPlacement) {
        setSelectedJumperId(null)
        onSelect([ownerPlacement.componentId])
      } else {
        const ownerJumper = layout.jumpers.find(j => j.from === socket || j.to === socket)
        if (ownerJumper) {
          selectJumper(ownerJumper.id)
        }
      }
    }
    setProbed({ key: shapeKey, socket })
  }, [circuit, commitLayout, jumperColor, layout, onSelect, pending, selectJumper, shape, shapeKey, tool])

  // Compute live ghost validation for hovered socket
  const ghostState = useMemo(() => {
    if (!hoveredSocket) return null
    if (pending && (pending.type === 'place-new' || pending.type === 'place-existing' || pending.type === 'move')) {
      const ignoreId = pending.type === 'move' ? pending.placementId : undefined
      const check = validateSocketPick(shape, layout, hoveredSocket, pending.firstSocket, ignoreId)
      if (pending.kind === 'ground') {
        return { kind: 'component' as const, componentKind: pending.kind, sockets: [hoveredSocket], valid: check.ok }
      }
      if (pending.firstSocket) {
        return { kind: 'component' as const, componentKind: pending.kind, sockets: [pending.firstSocket, hoveredSocket], valid: check.ok }
      }
      return { kind: 'anchor' as const, socket: hoveredSocket, valid: check.ok }
    }
    if (tool === 'wire') {
      const from = pending?.type === 'wire' ? pending.from : undefined
      const check = validateSocketPick(shape, layout, hoveredSocket, from)
      if (from) {
        return { kind: 'jumper' as const, from, to: hoveredSocket, color: jumperColor, valid: check.ok }
      }
      return { kind: 'anchor' as const, socket: hoveredSocket, valid: check.ok }
    }
    return null
  }, [hoveredSocket, jumperColor, layout, pending, shape, tool])

  const anchorSocket = pending
    ? pending.type === 'wire' ? pending.from : pending.firstSocket
    : undefined

  // Highlighted conductive strip: hovered socket during placement/wiring/probing, or probed socket.
  const activeStripSocket = (pending || tool === 'wire' || tool === 'probe') && hoveredSocket
    ? hoveredSocket
    : probedSocket
  const activeStripGroup = activeStripSocket ? holeGroup(shape, activeStripSocket) : undefined

  const canFlip = !!selectedPlacement && selectedPlacement.sockets.length === 2
  const canMove = !!selectedPlacement
  const canDelete = !!selectedJumper || selected.length > 0
  const interactiveSocketMode = !!pending || tool === 'wire' || tool === 'probe'

  return {
    tool,
    setTool,
    jumperColor,
    setJumperColor,
    cameraMode,
    setCameraMode,
    pending,
    cancelPending,
    hoveredSocket,
    setHoveredSocket,
    probedSocket,
    selectedJumper,
    selectedPlacement,
    unmountedParts,
    feedback,
    ghostState,
    anchorSocket,
    activeStripGroup,
    interactiveSocketMode,
    canFlip,
    canMove,
    canDelete,
    startPlaceNew,
    startPlaceExisting,
    startMoveSelected,
    selectPart,
    selectJumper,
    flipSelected,
    deleteSelected,
    autoMount,
    clearBoard,
    handleSocketClick,
  }
}
