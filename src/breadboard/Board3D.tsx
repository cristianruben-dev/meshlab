import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { RotateCcw, RotateCw, Scan } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Component } from '../circuit/model'
import { metric } from '../editor/catalog'
import type { Translate } from '../locale'
import type { Theme } from '../theme'
import { boardPalettes, type BoardPalette } from './palette'
import { resistorBands, type BoardGeometry, type CursorKey } from './geometry'
import { TERMINAL_ROWS, type Placement } from './model'

/** World units per drawing unit; the board's top face sits at y = 0 and drawing y maps to world z. */
const S = 0.1
const HOME = new THREE.Vector3(0, 56, 50).normalize()
/** Screen pixels kept clear below the board for the probe readout and camera controls. */
const OVERLAY_ROOM = 60

export type Insets = { top: number; right: number; bottom: number; left: number }

export type Board3DProps = {
  t: Translate
  theme: Theme
  geometry: BoardGeometry
  labels: boolean
  placements: Placement[]
  parts: Map<string, Component>
  currents: Record<string, number> | undefined
  selected: string[]
  strip: string[]
  probe: string
  /** Screen pixels covered by floating chrome; the board is centred and fitted in the remaining area. */
  insets?: Insets
  onSocket: (id: string) => void
  onPart: (id: string) => void
  onUnavailable: () => void
}
type Scene = Board3DProps & { cursor?: string }

const isLit = (part: Component | undefined, currents: Record<string, number> | undefined) => !!part && (currents?.[part.id] ?? 0) > .00005

/** Paints the body, rails, indices, sockets, probe strip, and keyboard cursor on the board's top face. */
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
    ctx.fillStyle = c.index; ctx.font = '600 10px "Geist Mono Variable", ui-monospace, monospace'; ctx.textAlign = 'center'
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
  for (const s of g.sockets) {
    ctx.fillStyle = c.socket; ctx.strokeStyle = c.socketRim; ctx.lineWidth = 1.3
    ctx.beginPath(); ctx.roundRect(s.x - 4, s.y - 4, 8, 8, 1.8); ctx.fill(); ctx.stroke()
    if (strip.has(s.id)) {
      ctx.fillStyle = c.strip; ctx.globalAlpha = s.id === p.probe ? .95 : .55
      ctx.beginPath(); ctx.roundRect(s.x - 6.5, s.y - 6.5, 13, 13, 3.5); ctx.fill(); ctx.globalAlpha = 1
    }
  }
  const cursor = p.cursor && g.hole(p.cursor)
  if (cursor) {
    ctx.strokeStyle = c.cursor; ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(cursor.x, cursor.y, 10.5, 0, Math.PI * 2); ctx.stroke()
  }
}

const metal = () => new THREE.MeshStandardMaterial({ color: '#c3cbd2', metalness: .85, roughness: .32 })
function lead(points: THREE.Vector3[], radius = .11, material: THREE.Material = metal()) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', .05)
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 8), material)
  mesh.castShadow = true
  return mesh
}
let glow: THREE.Texture | undefined
function glowTexture() {
  if (glow) return glow
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(255,255,255,1)'); gradient.addColorStop(.25, 'rgba(255,255,255,.55)'); gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128)
  return (glow = new THREE.CanvasTexture(canvas))
}
function label(text: string, tone: 'dark' | 'plus' | 'minus' | 'selected' = 'dark') {
  const node = document.createElement('span')
  node.className = `board3d-label board3d-label-${tone}`
  node.textContent = text
  return new CSS2DObject(node)
}

/** Builds the meshes for one placement and tags them with the owning part. */
function buildPlacement(item: Placement, geometry: BoardGeometry, part: Component | undefined, lit: boolean, selected: boolean, highlight: string) {
  const world = (x: number, y: number, height = 0) => new THREE.Vector3((x - geometry.width / 2) * S, height, (y - geometry.height / 2) * S)
  const group = new THREE.Group()
  const a = geometry.hole(item.sockets[0])!, b = item.sockets[1] ? geometry.hole(item.sockets[1])! : a
  const A = world(a.x, a.y), B = world(b.x, b.y)
  const tint = (material: THREE.MeshStandardMaterial) => { if (selected) { material.emissive.set(highlight); material.emissiveIntensity = .35 } return material }
  if (part?.kind === 'voltage' || part?.kind === 'ground') {
    const ends = part.kind === 'voltage' ? [a, b] : [a]
    ends.forEach((p, i) => {
      const color = part.kind === 'ground' ? '#2c3a48' : i ? '#3d6fc0' : '#cc3e3a'
      const out = p.y < geometry.height / 2 ? -1 : 1
      const top = world(p.x, p.y + out * 6, 4.2)
      group.add(lead([world(p.x, p.y), world(p.x, p.y, .6), world(p.x, p.y + out * 2, 2.6), top], .24, tint(new THREE.MeshStandardMaterial({ color, roughness: .45 }))))
      const housing = new THREE.Mesh(new THREE.BoxGeometry(.95, 2, .95), tint(new THREE.MeshStandardMaterial({ color: '#1f252c', roughness: .5 })))
      housing.position.copy(world(p.x, p.y, 1)); housing.castShadow = true
      group.add(housing)
      const tag = label(part.kind === 'ground' ? 'GND' : `${part.label.slice(0, 4)}${i ? '−' : '+'}`, selected ? 'selected' : part.kind === 'ground' ? 'dark' : i ? 'minus' : 'plus')
      tag.position.copy(top).add(new THREE.Vector3(0, 1.2, 0))
      group.add(tag)
    })
  } else if (!part) {
    const lift = Math.min(1.6 + A.distanceTo(B) * .18, 4.5)
    const mid = A.clone().lerp(B, .5).setY(lift)
    group.add(lead([A, A.clone().setY(.9), mid, B.clone().setY(.9), B], .3, new THREE.MeshStandardMaterial({ color: item.color ?? '#da9f57', roughness: .38 })))
  } else {
    const height = part.kind === 'led' ? 2.4 : 1.6
    const center = A.clone().lerp(B, .5)
    const dir = B.clone().sub(A).setY(0).normalize()
    const span = part.kind === 'led' ? .9 : part.kind === 'switch' ? 2.6 : 3.3
    const leftEnd = center.clone().addScaledVector(dir, -span).setY(height), rightEnd = center.clone().addScaledVector(dir, span).setY(height)
    group.add(lead([A, A.clone().setY(height * .8), leftEnd]))
    group.add(lead([B, B.clone().setY(height * .8), rightEnd]))
    const body = new THREE.Group()
    body.position.copy(center).setY(height)
    body.rotation.y = -Math.atan2(dir.z, dir.x)
    if (part.kind === 'led') {
      const material = tint(new THREE.MeshPhysicalMaterial({ color: lit ? '#ff5a3a' : '#b3261e', roughness: .12, clearcoat: 1, transparent: true, opacity: .9,
        emissive: lit ? '#ff2e12' : '#000000', emissiveIntensity: lit ? 1.6 : 0 }))
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.05, .35, 32), material)
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 2.4, 32), material)
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1.8, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), material)
      shell.position.y = 1.35; dome.position.y = 2.55
      ;[rim, shell, dome].forEach(m => { m.castShadow = true; body.add(m) })
      if (lit) {
        const light = new THREE.PointLight('#ff6a3d', 30, 22, 2)
        light.position.y = 3
        body.add(light)
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ff7a45', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .85 }))
        halo.scale.set(11, 11, 1); halo.position.y = 2.4
        body.add(halo)
      }
    } else if (part.kind === 'switch') {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(5.4, 1.8, 2.6), tint(new THREE.MeshStandardMaterial({ color: '#33404c', roughness: .55 })))
      const knob = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, 1), new THREE.MeshStandardMaterial({ color: part.closed ? '#5ee6c4' : '#d7e1e6', roughness: .4 }))
      knob.position.set(part.closed ? 1 : -1, 1.3, 0)
      ;[housing, knob].forEach(m => { m.castShadow = true; body.add(m) })
    } else {
      const ceramic = tint(new THREE.MeshStandardMaterial({ color: '#dcbf92', roughness: .55 }))
      const core = new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, 3.6, 24), ceramic)
      core.rotation.z = Math.PI / 2
      body.add(core)
      for (const side of [-1, 1]) {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 16), ceramic)
        bulb.scale.set(1.2, 1, 1); bulb.position.x = side * 2.1
        body.add(bulb)
      }
      resistorBands(part.value).forEach((color, i) => {
        const radius = i === 0 || i === 3 ? 1.14 : .93
        const band = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, .38, 24), new THREE.MeshStandardMaterial({ color, roughness: .5, metalness: i === 3 ? .6 : 0 }))
        band.rotation.z = Math.PI / 2
        band.position.x = [-2.15, -1, -.1, 2.15][i]
        body.add(band)
      })
      body.traverse(m => { if (m instanceof THREE.Mesh) m.castShadow = true })
    }
    group.add(body)
    const tag = label(`${part.label}${part.kind === 'resistor' ? ` · ${metric(part.value, 'Ω')}` : ''}`, selected ? 'selected' : 'dark')
    tag.position.copy(center).setY(height + (part.kind === 'led' ? 6.2 : 2.6))
    group.add(tag)
  }
  if (part) group.traverse(object => { object.userData.part = part.id })
  return group
}

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch { return false }
}

const CURSOR_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])

export default function Board3D(props: Board3DProps) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{ rebuild: (p: Scene) => void; orbit: (angle: number) => void; reset: () => void; resize: () => void } | null>(null)
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
    const surfaceCanvas = document.createElement('canvas')
    const mounted = new THREE.Group()
    world.add(mounted)

    let board: THREE.Mesh | undefined, surface: THREE.CanvasTexture | undefined
    let fitDistance = 100, boardKey = '', paintKey = '', mountKey = '', dirty = true
    function dispose(object: THREE.Object3D) {
      object.traverse(node => {
        if (node instanceof THREE.Mesh) { node.geometry.dispose(); [node.material].flat().forEach(m => { if (m !== side) m.dispose() }) }
        if (node instanceof THREE.Sprite) node.material.dispose()
        if (node instanceof CSS2DObject) node.element.remove()
      })
    }
    /**
     * Camera distance that fits the whole board in the part of the viewport left free by floating chrome and the
     * board overlays. A view offset moves the projection centre to the middle of that area, so orbiting still turns
     * around the board while it stays clear of the panels.
     */
    function fit() {
      const { width, height } = latest.current.geometry
      const viewWidth = element!.clientWidth, viewHeight = element!.clientHeight
      const inset = latest.current.insets ?? { top: 0, right: 0, bottom: 0, left: 0 }
      const bottom = inset.bottom + OVERLAY_ROOM
      const freeWidth = viewWidth - inset.left - inset.right, freeHeight = viewHeight - inset.top - bottom
      // Too little room left: frame the whole viewport instead.
      const framed = viewWidth > 0 && viewHeight > 0 && freeWidth > viewWidth * .3 && freeHeight > viewHeight * .3
      const fw = framed ? freeWidth / viewWidth : 1, fh = framed ? freeHeight / viewHeight : 1
      if (framed) camera.setViewOffset(viewWidth, viewHeight, (inset.right - inset.left) / 2, (bottom - inset.top) / 2, viewWidth, viewHeight)
      else camera.clearViewOffset()
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * camera.aspect
      fitDistance = Math.max(width * S / 2 * 1.14 / (tanH * fw), height * S / 2 * .95 / (tanV * fh)) * 1.1
      controls.minDistance = fitDistance * .3; controls.maxDistance = fitDistance * 2.6
      camera.far = fitDistance * 8; camera.updateProjectionMatrix()
    }
    function reset() {
      controls.target.set(0, 0, 0)
      fit()
      camera.position.copy(HOME).multiplyScalar(fitDistance)
      dirty = true
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
      if (nextBoard !== boardKey) { boardKey = nextBoard; paintKey = mountKey = ''; buildBoard(p.geometry) }
      const nextPaint = JSON.stringify([p.theme, p.geometry.shape, p.labels, p.strip, p.probe, p.cursor])
      if (nextPaint !== paintKey) {
        paintKey = nextPaint
        paintSurface(surfaceCanvas.getContext('2d')!, c, p)
        surface!.needsUpdate = true
        side.color.set(c.side)
        dirty = true
      }
      const nextMount = JSON.stringify([p.theme, p.placements, p.selected, p.placements.map(item => {
        const part = item.part ? p.parts.get(item.part) : undefined
        return part && [part.kind, part.label, part.value, part.closed, isLit(part, p.currents)]
      })])
      if (nextMount !== mountKey) {
        mountKey = nextMount
        dispose(mounted); mounted.clear()
        for (const item of p.placements) {
          const part = item.part ? p.parts.get(item.part) : undefined
          mounted.add(buildPlacement(item, p.geometry, part, isLit(part, p.currents), !!part && p.selected.includes(part.id), c.selected))
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
    const onDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY }; setKeyboard(false) }
    const onUp = (event: PointerEvent) => {
      if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) { down = null; return }
      down = null
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
      ray.setFromCamera(pointer, camera)
      const hit = ray.intersectObjects(board ? [...mounted.children, board] : mounted.children, true)[0]
      if (!hit) return
      if (hit.object.userData.part) { latest.current.onPart(hit.object.userData.part); return }
      const { geometry } = latest.current
      const socket = geometry.nearestSocket(hit.point.x / S + geometry.width / 2, hit.point.z / S + geometry.height / 2)
      if (socket) { setCursor(socket); latest.current.onSocket(socket) }
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    api.current = {
      rebuild,
      orbit(angle) {
        const offset = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
        camera.position.copy(controls.target).add(offset); dirty = true
      },
      reset,
      resize,
    }
    setReady(true)
    return () => {
      api.current = null
      renderer.setAnimationLoop(null)
      observer.disconnect(); controls.dispose()
      dispose(world); side.dispose(); surface?.dispose()
      renderer.dispose(); renderer.forceContextLoss()
      renderer.domElement.remove(); labels.domElement.remove()
    }
  }, [])

  useEffect(() => { api.current?.rebuild(latest.current) })
  const { top = 0, right = 0, bottom = 0, left = 0 } = props.insets ?? {}
  // Panels opening or closing change the free area; refit the camera to it.
  useEffect(() => { api.current?.resize() }, [top, right, bottom, left])

  const active = cursor && geometry.hole(cursor) ? cursor : props.probe && geometry.hole(props.probe) ? props.probe : `${TERMINAL_ROWS[0]}1`
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (CURSOR_KEYS.has(event.key)) {
      event.preventDefault()
      setKeyboard(true)
      setCursor(keyboard ? geometry.move(active, event.key as CursorKey) : active)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setKeyboard(true); setCursor(active)
      onSocket(active)
    }
  }

  return <div className="board3d">
    <div className="board3d-scene" ref={host} tabIndex={0} role="application" aria-roledescription={t('3D breadboard')}
      aria-label={t('Breadboard. Drag to orbit and scroll to zoom. Use the arrow keys to choose a socket and Enter to probe it.')}
      onKeyDown={onKeyDown} onFocus={event => { setCursor(active); if (event.currentTarget.matches(':focus-visible')) setKeyboard(true) }} onBlur={() => setKeyboard(false)} />
    <span className="sr-only" aria-live="polite">{keyboard && cursor ? `${t('Socket')} ${cursor}` : ''}</span>
    <div className="board3d-controls" data-ready={ready}>
      <Button size="icon-sm" variant="outline" aria-label={t('Orbit left')} onClick={() => api.current?.orbit(-Math.PI / 12)}><RotateCcw /></Button>
      <Button size="icon-sm" variant="outline" aria-label={t('Orbit right')} onClick={() => api.current?.orbit(Math.PI / 12)}><RotateCw /></Button>
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
    // Map the top-face UVs to the painted surface: x across, depth down.
    const uv = this.attributes.uv, pos = this.attributes.position
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + w) / width, (pos.getZ(i) + d) / depth * -1 + 1)
    uv.needsUpdate = true
  }
}
