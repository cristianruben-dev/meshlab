import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { RotateCcw, RotateCw, Scan } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Component, Kind } from '../circuit/model'
import { catalog } from '../editor/catalog'
import type { BranchReading } from '../engine/solver'
import type { Translate } from '../locale'
import type { Theme } from '../theme'
import { boardPalettes, type BoardPalette } from './palette'
import type { BoardGeometry, CursorKey } from './geometry'
import { TERMINAL_ROWS } from './model'
import {
  WORLD_SCALE as S,
  buildAnchorPin,
  buildComponentMesh,
  buildJumperMesh,
  createGlowTexture,
} from './parts3d'
import type { BreadboardLayout } from './types'
import type { CameraMode } from './useBreadboard'

const HOME_3D = new THREE.Vector3(0, 56, 50).normalize()
const HOME_TOP = new THREE.Vector3(0, 1, 0.0008).normalize()
/** Screen pixels kept clear below the board for the probe readout and camera controls. */
const OVERLAY_ROOM = 60

export type Insets = { top: number; right: number; bottom: number; left: number }

export type GhostPreview =
  | { kind: 'component'; componentKind: Kind; sockets: string[]; valid: boolean }
  | { kind: 'jumper'; from: string; to: string; color: string; valid: boolean }
  | { kind: 'anchor'; socket: string; valid: boolean }

export type Board3DProps = {
  t: Translate
  theme: Theme
  geometry: BoardGeometry
  labels: boolean
  layout: BreadboardLayout
  parts: Map<string, Component>
  branchReadings: Record<string, BranchReading> | undefined
  trippedFuses?: Set<string>
  selected: string[]
  selectedJumperId?: string | null
  strip: string[]
  probe: string
  hoveredSocket?: string
  anchorSocket?: string
  ghost?: GhostPreview | null
  cameraMode: CameraMode
  interactiveSocketMode: boolean
  /** Screen pixels covered by floating chrome; the board is centred and fitted in the remaining area. */
  insets?: Insets
  onSocket: (id: string) => void
  onHoverSocket?: (id: string | undefined) => void
  onPart: (id: string) => void
  onJumper: (id: string) => void
  onUnavailable: () => void
}
type Scene = Board3DProps & { cursor?: string }

/** Paints the body, rails, indices, sockets, conductive strip, hover/anchor rings, and keyboard cursor on the board's top face. */
function paintSurface(ctx: CanvasRenderingContext2D, c: BoardPalette, p: Scene) {
  const g = p.geometry, { width: W, height: H, rowY } = g
  const k = ctx.canvas.width / W
  ctx.setTransform(k, 0, 0, k, 0, 0)
  const body = ctx.createLinearGradient(0, 0, 0, H)
  body.addColorStop(0, c.bodyTop); body.addColorStop(1, c.bodyBottom)
  ctx.fillStyle = body; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = c.well; ctx.strokeStyle = c.wellEdge; ctx.lineWidth = 1
  ctx.beginPath(); ctx.roundRect(16, rowY.A - 28, W - 32, rowY.J - rowY.A + 56, 10); ctx.fill(); ctx.stroke()
  const trench = ctx.createLinearGradient(0, g.trenchY - 8, 0, g.trenchY + 8)
  trench.addColorStop(0, c.trenchA); trench.addColorStop(.5, c.trenchB); trench.addColorStop(1, c.trenchA)
  ctx.fillStyle = trench; ctx.beginPath(); ctx.roundRect(20, g.trenchY - 8, W - 40, 16, 4); ctx.fill()

  const { railLength, split } = g.shape
  if (railLength) {
    const x = (row: string, i: number) => g.hole(`${row}${i}`)!.x
    const spans = split ? [[1, railLength / 2], [railLength / 2 + 1, railLength]] : [[1, railLength]]
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'
    for (const [row, dy, color] of [['T+', -12, '#cc3e3a'], ['T-', 12, '#3d6fc0'], ['B+', -12, '#cc3e3a'], ['B-', 12, '#3d6fc0']] as const)
      for (const [a, b] of spans) {
        ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(x(row, a) - 10, rowY[row] + dy); ctx.lineTo(x(row, b) + 10, rowY[row] + dy); ctx.stroke()
      }
  }
  if (p.labels) {
    ctx.fillStyle = c.index; ctx.font = '600 10px "Geist Mono", ui-monospace, monospace'; ctx.textAlign = 'center'
    for (const row of g.rows) {
      const text = row.length === 2 ? (row.endsWith('+') ? '+' : '−') : row
      ctx.fillText(text, 30, rowY[row] + 3.5); ctx.fillText(text, W - 30, rowY[row] + 3.5)
    }
    const { columns } = g.shape
    for (let col = 1; col <= columns; col++) {
      if (columns > 30 && col !== 1 && col % 5) continue
      ctx.fillText(String(col), g.columnX(col), rowY.A - 13); ctx.fillText(String(col), g.columnX(col), rowY.J + 20)
    }
  }
  const strip = new Set(p.strip)
  const invalidHover = p.ghost && !p.ghost.valid
  for (const s of g.sockets) {
    ctx.fillStyle = c.socket; ctx.strokeStyle = c.socketRim; ctx.lineWidth = 1.3
    ctx.beginPath(); ctx.roundRect(s.x - 4, s.y - 4, 8, 8, 1.8); ctx.fill(); ctx.stroke()
    if (strip.has(s.id)) {
      const isFocus = s.id === p.probe || s.id === p.hoveredSocket
      ctx.fillStyle = invalidHover && s.id === p.hoveredSocket ? '#ef4444' : c.strip
      ctx.globalAlpha = isFocus ? .92 : .45
      ctx.beginPath(); ctx.roundRect(s.x - 6.5, s.y - 6.5, 13, 13, 3.5); ctx.fill(); ctx.globalAlpha = 1
    }
  }
  const anchor = p.anchorSocket && g.hole(p.anchorSocket)
  if (anchor) {
    ctx.strokeStyle = c.selected; ctx.lineWidth = 2.8
    ctx.beginPath(); ctx.arc(anchor.x, anchor.y, 9.5, 0, Math.PI * 2); ctx.stroke()
  }
  const hovered = p.hoveredSocket && g.hole(p.hoveredSocket)
  if (hovered) {
    ctx.strokeStyle = invalidHover ? '#ef4444' : c.cursor; ctx.lineWidth = 2.6
    ctx.beginPath(); ctx.arc(hovered.x, hovered.y, 9.5, 0, Math.PI * 2); ctx.stroke()
  }
  const cursor = p.cursor && g.hole(p.cursor)
  if (cursor) {
    ctx.strokeStyle = c.cursor; ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(cursor.x, cursor.y, 10.5, 0, Math.PI * 2); ctx.stroke()
  }
}

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch { return false }
}

const CURSOR_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])

function ghostPartStub(kind: Kind): Component {
  const meta = catalog[kind]
  return {
    id: '__ghost__',
    kind,
    label: meta.prefix,
    value: meta.value,
    x: 0,
    y: 0,
    rotation: 0,
    ...(kind === 'switch' ? { closed: false } : {}),
    ...(kind === 'potentiometer' ? { position: 0.5 } : {}),
  }
}

export default function Board3D(props: Board3DProps) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{
    rebuild: (p: Scene) => void
    orbit: (angle: number) => void
    reset: () => void
    resize: () => void
    setCameraMode: (mode: CameraMode) => void
  } | null>(null)
  const [ready, setReady] = useState(false)
  const [cursor, setCursor] = useState<string>()
  const [keyboard, setKeyboard] = useState(false)
  const scene: Scene = { ...props, cursor: keyboard ? cursor : undefined }
  const latest = useRef(scene)
  latest.current = scene
  const { t, geometry, onSocket } = props

  useEffect(() => {
    const element = host.current
    if (!element) return
    if (!webglAvailable()) { latest.current.onUnavailable(); return }
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }) } catch { latest.current.onUnavailable(); return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.domElement.setAttribute('aria-hidden', 'true')
    element.prepend(renderer.domElement)
    const labels = new CSS2DRenderer()
    labels.domElement.className = 'board3d-labels'
    element.appendChild(labels.domElement)

    const world = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, 1, 1000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI * .46
    world.add(new THREE.HemisphereLight('#ffffff', '#3a4652', 1.5))
    const sun = new THREE.DirectionalLight('#ffffff', 2.2)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.bias = -.0004; sun.shadow.radius = 4
    world.add(sun)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: .22 }))
    floor.rotation.x = -Math.PI / 2; floor.position.y = -2.12; floor.receiveShadow = true
    world.add(floor)
    const side = new THREE.MeshStandardMaterial({ color: '#cfd6db', roughness: .7 })
    const glowTexture = createGlowTexture()
    const surfaceCanvas = document.createElement('canvas')
    const mounted = new THREE.Group()
    const ghostGroup = new THREE.Group()
    world.add(mounted)
    world.add(ghostGroup)

    let board: THREE.Mesh | undefined, surface: THREE.CanvasTexture | undefined
    let fitDistance = 100, boardKey = '', paintKey = '', mountKey = '', ghostKey = '', dirty = true
    let activeCameraMode: CameraMode = latest.current.cameraMode

    function dispose(object: THREE.Object3D) {
      object.traverse(node => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose()
          ;[node.material].flat().forEach(m => { if (m !== side) m.dispose() })
        }
        if (node instanceof THREE.Sprite) node.material.dispose()
        if (node instanceof CSS2DObject) node.element.remove()
      })
    }

    function applyControlsForMode(mode: CameraMode) {
      activeCameraMode = mode
      if (mode === 'top') {
        controls.enableRotate = false
        controls.mouseButtons.LEFT = THREE.MOUSE.PAN
      } else {
        controls.enableRotate = true
        controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
      }
    }

    function fit() {
      const { width, height } = latest.current.geometry
      const viewWidth = element!.clientWidth, viewHeight = element!.clientHeight
      const inset = latest.current.insets ?? { top: 0, right: 0, bottom: 0, left: 0 }
      const bottom = inset.bottom + OVERLAY_ROOM
      const freeWidth = viewWidth - inset.left - inset.right, freeHeight = viewHeight - inset.top - bottom
      const framed = viewWidth > 0 && viewHeight > 0 && freeWidth > viewWidth * .3 && freeHeight > viewHeight * .3
      const fw = framed ? freeWidth / viewWidth : 1, fh = framed ? freeHeight / viewHeight : 1
      if (framed) camera.setViewOffset(viewWidth, viewHeight, (inset.right - inset.left) / 2, (bottom - inset.top) / 2, viewWidth, viewHeight)
      else camera.clearViewOffset()
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * camera.aspect
      if (activeCameraMode === 'top') {
        fitDistance = Math.max(width * S / 2 * 1.08 / (tanH * fw), height * S / 2 * 1.12 / (tanV * fh)) * 1.05
      } else {
        fitDistance = Math.max(width * S / 2 * 1.14 / (tanH * fw), height * S / 2 * .95 / (tanV * fh)) * 1.1
      }
      controls.minDistance = fitDistance * .28; controls.maxDistance = fitDistance * 2.6
      camera.far = fitDistance * 8; camera.updateProjectionMatrix()
    }

    function reset() {
      controls.target.set(0, 0, 0)
      fit()
      const home = activeCameraMode === 'top' ? HOME_TOP : HOME_3D
      camera.position.copy(home).multiplyScalar(fitDistance)
      controls.update()
      dirty = true
    }

    function setCameraMode(mode: CameraMode) {
      if (mode === activeCameraMode) return
      applyControlsForMode(mode)
      reset()
    }

    function buildBoard(geometry: BoardGeometry) {
      if (board) { world.remove(board); dispose(board); surface?.dispose() }
      const { width, height } = geometry
      surfaceCanvas.width = Math.min(renderer.capabilities.maxTextureSize, 4096, Math.round(width * 3))
      surfaceCanvas.height = Math.round(surfaceCanvas.width * height / width)
      surface = new THREE.CanvasTexture(surfaceCanvas)
      surface.colorSpace = THREE.SRGBColorSpace
      surface.anisotropy = renderer.capabilities.getMaxAnisotropy()
      board = new THREE.Mesh(new RoundedSlab(width * S, height * S, 1.6, 1.4), [new THREE.MeshStandardMaterial({ map: surface, roughness: .72 }), side])
      board.position.y = -1.85
      board.receiveShadow = true
      world.add(board)
      const reach = Math.max(width, height) * S / 2 + 12
      Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 400 })
      sun.shadow.camera.updateProjectionMatrix()
      sun.position.set(-reach * .5, 60, 30)
      floor.scale.setScalar(reach * 8)
      reset()
    }

    function rebuild(p: Scene) {
      const c = boardPalettes[p.theme]
      const nextBoard = `${p.geometry.width}x${p.geometry.height}`
      if (nextBoard !== boardKey) { boardKey = nextBoard; paintKey = mountKey = ghostKey = ''; buildBoard(p.geometry) }

      const nextPaint = JSON.stringify([p.theme, p.geometry.shape, p.labels, p.strip, p.probe, p.hoveredSocket, p.anchorSocket, p.ghost?.valid, p.cursor])
      if (nextPaint !== paintKey) {
        paintKey = nextPaint
        paintSurface(surfaceCanvas.getContext('2d')!, c, p)
        surface!.needsUpdate = true
        side.color.set(c.side)
        dirty = true
      }

      const nextMount = JSON.stringify([
        p.theme,
        p.layout,
        p.selected,
        p.selectedJumperId ?? null,
        p.layout.placements.map(item => {
          const part = p.parts.get(item.componentId)
          const r = part ? p.branchReadings?.[part.id] : undefined
          const tripped = part ? !!p.trippedFuses?.has(part.id) : false
          return part && [
            part.kind, part.label, part.value, part.closed, part.position, tripped,
            part.kind === 'led' ? Math.round((r?.current ?? 0) * 1e5)
              : part.kind === 'bulb' ? Math.round(Math.abs(r?.power ?? 0) * 1e4)
              : part.kind === 'voltmeter' ? (r ? Number(r.voltage.toPrecision(4)) : null)
              : part.kind === 'ammeter' ? (r ? Number(r.current.toPrecision(4)) : null)
              : 0,
          ]
        }),
      ])
      if (nextMount !== mountKey) {
        mountKey = nextMount
        dispose(mounted); mounted.clear()
        for (const item of p.layout.placements) {
          const part = p.parts.get(item.componentId)
          if (!part) continue
          const mesh = buildComponentMesh(part, item.sockets, {
            geometry: p.geometry,
            highlight: c.selected,
            glowTexture,
            reading: p.branchReadings?.[part.id],
            tripped: p.trippedFuses?.has(part.id),
            selected: p.selected.includes(part.id),
          })
          if (mesh) mounted.add(mesh)
        }
        for (const jumper of p.layout.jumpers) {
          const mesh = buildJumperMesh(jumper, p.geometry, p.selectedJumperId === jumper.id, c.selected)
          if (mesh) mounted.add(mesh)
        }
        dirty = true
      }

      const nextGhost = JSON.stringify([p.theme, p.anchorSocket ?? null, p.ghost ?? null])
      if (nextGhost !== ghostKey) {
        ghostKey = nextGhost
        dispose(ghostGroup); ghostGroup.clear()
        if (p.anchorSocket) {
          const anchor = buildAnchorPin(p.anchorSocket, p.geometry, c.selected)
          if (anchor) ghostGroup.add(anchor)
        }
        if (p.ghost) {
          if (p.ghost.kind === 'component') {
            const stub = ghostPartStub(p.ghost.componentKind)
            const mesh = buildComponentMesh(stub, p.ghost.sockets, {
              geometry: p.geometry,
              highlight: c.selected,
              glowTexture,
              ghost: { valid: p.ghost.valid },
            })
            if (mesh) ghostGroup.add(mesh)
          } else if (p.ghost.kind === 'jumper') {
            const mesh = buildJumperMesh(
              { id: '__ghost_jumper__', from: p.ghost.from, to: p.ghost.to, color: p.ghost.color },
              p.geometry,
              false,
              c.selected,
              { valid: p.ghost.valid },
            )
            if (mesh) ghostGroup.add(mesh)
          } else if (p.ghost.kind === 'anchor') {
            const pin = buildAnchorPin(p.ghost.socket, p.geometry, p.ghost.valid ? c.selected : '#ef4444')
            if (pin) ghostGroup.add(pin)
          }
        }
        dirty = true
      }
    }

    function resize() {
      const width = element!.clientWidth
      if (!width) return
      const height = element!.clientHeight || Math.round(width * .56)
      renderer.setSize(width, height); labels.setSize(width, height)
      camera.aspect = width / height
      const distance = camera.position.distanceTo(controls.target)
      const ratio = distance / fitDistance
      fit()
      camera.position.sub(controls.target).setLength((Number.isFinite(ratio) && ratio > 0 ? ratio : 1) * fitDistance).add(controls.target)
      dirty = true
    }

    applyControlsForMode(activeCameraMode)
    rebuild(latest.current)
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()
    controls.addEventListener('change', () => { dirty = true })
    renderer.setAnimationLoop(() => {
      if (controls.update() || dirty) { renderer.render(world, camera); labels.render(world, camera); dirty = false }
    })

    const pointer = new THREE.Vector2(), ray = new THREE.Raycaster()
    let down: { x: number; y: number } | null = null
    let lastHover: string | undefined

    function pickBoardSocket(clientX: number, clientY: number): string | undefined {
      if (!board) return undefined
      const rect = renderer.domElement.getBoundingClientRect()
      if (!rect.width || !rect.height) return undefined
      pointer.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1)
      ray.setFromCamera(pointer, camera)
      const hit = ray.intersectObject(board, false)[0]
      if (!hit) return undefined
      const { geometry } = latest.current
      return geometry.nearestSocket(hit.point.x / S + geometry.width / 2, hit.point.z / S + geometry.height / 2)
    }

    const onMove = (event: PointerEvent) => {
      if (!latest.current.onHoverSocket) return
      const socket = pickBoardSocket(event.clientX, event.clientY)
      if (socket !== lastHover) {
        lastHover = socket
        latest.current.onHoverSocket(socket)
      }
    }
    const onLeave = () => {
      if (lastHover !== undefined) {
        lastHover = undefined
        latest.current.onHoverSocket?.(undefined)
      }
    }
    const onDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY }; setKeyboard(false) }
    const onUp = (event: PointerEvent) => {
      if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) { down = null; return }
      down = null
      const current = latest.current
      if (current.interactiveSocketMode) {
        const socket = pickBoardSocket(event.clientX, event.clientY)
        if (socket) { setCursor(socket); current.onSocket(socket) }
        return
      }
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
      ray.setFromCamera(pointer, camera)
      const hit = ray.intersectObjects(board ? [...mounted.children, board] : mounted.children, true)[0]
      if (!hit) return
      if (hit.object.userData.part) { current.onPart(hit.object.userData.part); return }
      if (hit.object.userData.jumper) { current.onJumper(hit.object.userData.jumper); return }
      const { geometry } = current
      const socket = geometry.nearestSocket(hit.point.x / S + geometry.width / 2, hit.point.z / S + geometry.height / 2)
      if (socket) { setCursor(socket); current.onSocket(socket) }
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerleave', onLeave)

    api.current = {
      rebuild,
      orbit(angle) {
        if (activeCameraMode === 'top') return
        const offset = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
        camera.position.copy(controls.target).add(offset); dirty = true
      },
      reset,
      resize,
      setCameraMode,
    }
    setReady(true)
    return () => {
      api.current = null
      renderer.setAnimationLoop(null)
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerleave', onLeave)
      observer.disconnect(); controls.dispose()
      dispose(world); side.dispose(); surface?.dispose(); glowTexture.dispose()
      renderer.dispose(); renderer.forceContextLoss()
      renderer.domElement.remove(); labels.domElement.remove()
    }
  }, [])

  useEffect(() => { api.current?.rebuild(latest.current) })
  useEffect(() => { api.current?.setCameraMode(props.cameraMode) }, [props.cameraMode])
  const { top = 0, right = 0, bottom = 0, left = 0 } = props.insets ?? {}
  useEffect(() => { api.current?.resize() }, [top, right, bottom, left])

  const active = cursor && geometry.hole(cursor) ? cursor : props.probe && geometry.hole(props.probe) ? props.probe : `${TERMINAL_ROWS[0]}1`
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (CURSOR_KEYS.has(event.key)) {
      event.preventDefault()
      setKeyboard(true)
      const next = keyboard ? geometry.move(active, event.key as CursorKey) : active
      setCursor(next)
      props.onHoverSocket?.(next)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setKeyboard(true); setCursor(active)
      onSocket(active)
    }
  }

  return <div className="board3d" data-interactive={props.interactiveSocketMode || undefined} data-camera={props.cameraMode}>
    <div className="board3d-scene" ref={host} tabIndex={0} role="application" aria-roledescription={t('3D breadboard')}
      aria-label={t('Breadboard. Drag to orbit and scroll to zoom. Use the arrow keys to choose a socket and Enter to probe it.')}
      onKeyDown={onKeyDown} onFocus={event => { setCursor(active); if (event.currentTarget.matches(':focus-visible')) setKeyboard(true) }} onBlur={() => setKeyboard(false)} />
    <span className="sr-only" aria-live="polite">{keyboard && cursor ? `${t('Socket')} ${cursor}` : ''}</span>
    <div className="board3d-controls" data-ready={ready}>
      {props.cameraMode === '3d' && <>
        <Button size="icon-sm" variant="outline" aria-label={t('Orbit left')} onClick={() => api.current?.orbit(-Math.PI / 12)}><RotateCcw /></Button>
        <Button size="icon-sm" variant="outline" aria-label={t('Orbit right')} onClick={() => api.current?.orbit(Math.PI / 12)}><RotateCw /></Button>
      </>}
      <Button size="icon-sm" variant="outline" aria-label={t('Reset 3D view')} onClick={() => api.current?.reset()}><Scan /></Button>
    </div>
  </div>
}

/** Box with rounded vertical edges; group 0 is the top face, group 1 the sides and bottom. */
class RoundedSlab extends THREE.ExtrudeGeometry {
  constructor(width: number, depth: number, height: number, radius: number) {
    const shape = new THREE.Shape()
    const w = width / 2, d = depth / 2
    shape.moveTo(-w + radius, -d)
    shape.lineTo(w - radius, -d); shape.quadraticCurveTo(w, -d, w, -d + radius)
    shape.lineTo(w, d - radius); shape.quadraticCurveTo(w, d, w - radius, d)
    shape.lineTo(-w + radius, d); shape.quadraticCurveTo(-w, d, -w, d - radius)
    shape.lineTo(-w, -d + radius); shape.quadraticCurveTo(-w, -d, -w + radius, -d)
    super(shape, { depth: height, bevelEnabled: true, bevelThickness: .25, bevelSize: .25, bevelSegments: 3, curveSegments: 8 })
    this.rotateX(-Math.PI / 2)
    const uv = this.attributes.uv, pos = this.attributes.position
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + w) / width, (pos.getZ(i) + d) / depth * -1 + 1)
    uv.needsUpdate = true
  }
}
