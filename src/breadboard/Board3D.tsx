import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { RotateCcw, RotateCw, Scan } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Component } from '../circuit/model'
import { metric } from '../editor/catalog'
import type { Translate } from '../locale'
import type { Theme } from '../theme'
import { boardPalettes, type BoardPalette } from './art'
import { columns, hole, layout, nearestSocket, resistorBands, rowLabels, rowY } from './geometry'
import type { Assembly, BoardStep } from './model'

/** World units per SVG unit; the board plane sits at y = 0 and SVG y maps to world z. */
const S = 0.1
const world = (x: number, y: number, height = 0) => new THREE.Vector3((x - 380) * S, height, (y - 230.5) * S)
const BODY = { x: 25, y: 44, w: 710, h: 373 }

export type Board3DProps = {
  t: Translate
  theme: Theme
  steps: BoardStep[]
  visible: Assembly
  parts: Map<string, Component>
  currents: Record<string, number> | undefined
  selected: string[]
  strip: string[]
  probe: string
  choice: string[]
  targets: string[]
  targetIndex: number
  onSocket: (id: string) => void
  onPart: (id: string) => void
  onUnavailable: () => void
}

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch { return false }
}

/** Paints sockets, rails, indices, and guide markers on the board's top face. */
function paintSurface(ctx: CanvasRenderingContext2D, c: BoardPalette, props: Pick<Board3DProps, 'strip' | 'probe' | 'choice' | 'targets' | 'targetIndex'>) {
  const k = ctx.canvas.width / BODY.w
  ctx.setTransform(k, 0, 0, k, -BODY.x * k, -BODY.y * k)
  const body = ctx.createLinearGradient(0, BODY.y, 0, BODY.y + BODY.h)
  body.addColorStop(0, c.bodyTop); body.addColorStop(1, c.bodyBottom)
  ctx.fillStyle = body; ctx.fillRect(BODY.x, BODY.y, BODY.w, BODY.h)
  ctx.fillStyle = c.well; ctx.strokeStyle = c.wellEdge; ctx.lineWidth = 1
  ctx.beginPath(); ctx.roundRect(38, 132, 685, 224, 10); ctx.fill(); ctx.stroke()
  const trench = ctx.createLinearGradient(0, 239, 0, 254)
  trench.addColorStop(0, c.trenchA); trench.addColorStop(.5, c.trenchB); trench.addColorStop(1, c.trenchA)
  ctx.fillStyle = trench; ctx.beginPath(); ctx.roundRect(42, 239, 677, 15, 4); ctx.fill()
  ctx.lineWidth = 2.2; ctx.lineCap = 'round'
  for (const [y, color] of [[80, '#cc3e3a'], [120, '#3d6fc0'], [362, '#cc3e3a'], [402, '#3d6fc0']] as const) {
    ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(85, y); ctx.lineTo(674, y); ctx.stroke()
  }
  ctx.fillStyle = c.index; ctx.font = '600 10px "Geist Mono Variable", ui-monospace, monospace'; ctx.textAlign = 'center'
  rowLabels.forEach((row, i) => ctx.fillText(row, 62, rowY[i] + 4))
  columns.forEach(col => ctx.fillText(String(col), hole(`A${col}`).x, 143))
  const strip = new Set(props.strip)
  for (const p of layout) {
    ctx.fillStyle = c.socket; ctx.strokeStyle = c.socketRim; ctx.lineWidth = 1.3
    ctx.beginPath(); ctx.roundRect(p.x - 3.6, p.y - 3.6, 7.2, 7.2, 1.6); ctx.fill(); ctx.stroke()
    if (strip.has(p.id)) {
      ctx.fillStyle = c.strip; ctx.globalAlpha = p.id === props.probe ? .95 : .55
      ctx.beginPath(); ctx.roundRect(p.x - 5.5, p.y - 5.5, 11, 11, 3); ctx.fill(); ctx.globalAlpha = 1
    }
  }
  ctx.setLineDash([3.5, 2.5]); ctx.lineWidth = 2.4; ctx.strokeStyle = c.target
  props.targets.forEach((id, i) => {
    const p = hole(id)
    ctx.globalAlpha = i === props.targetIndex ? 1 : .55
    ctx.beginPath(); ctx.arc(p.x, p.y, i === props.targetIndex ? 12 : 8.5, 0, Math.PI * 2); ctx.stroke()
  })
  ctx.setLineDash([]); ctx.globalAlpha = 1
  props.choice.forEach((id, i) => {
    const p = hole(id)
    ctx.fillStyle = c.target; ctx.beginPath(); ctx.arc(p.x, p.y, 8.5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.fillText(String(i + 1), p.x, p.y + 3.5)
  })
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

/** Builds the meshes for one mounted step and returns them tagged with the owning part. */
function buildStep(step: BoardStep, sockets: string[], part: Component | undefined, lit: boolean, selected: boolean, highlight: string) {
  const group = new THREE.Group()
  const a = hole(sockets[0]), b = sockets[1] ? hole(sockets[1]) : a
  const A = world(a.x, a.y), B = world(b.x, b.y)
  const tint = (material: THREE.MeshStandardMaterial) => { if (selected) { material.emissive.set(highlight); material.emissiveIntensity = .35 } return material }
  if (part?.kind === 'voltage' || part?.kind === 'ground') {
    const ends = part.kind === 'voltage' ? [a, b] : [a]
    ends.forEach((p, i) => {
      const color = part.kind === 'ground' ? '#2c3a48' : i ? '#3d6fc0' : '#cc3e3a'
      const out = p.y < 200 ? -1 : 1
      const base = world(p.x, p.y), top = world(p.x, p.y + out * 6, 4.2)
      group.add(lead([base, world(p.x, p.y, .6), world(p.x, p.y + out * 2, 2.6), top], .24, tint(new THREE.MeshStandardMaterial({ color, roughness: .45 }))))
      const housing = new THREE.Mesh(new THREE.BoxGeometry(.95, 2, .95), tint(new THREE.MeshStandardMaterial({ color: '#1f252c', roughness: .5 })))
      housing.position.copy(world(p.x, p.y, 1)); housing.castShadow = true
      group.add(housing)
      const tag = label(part.kind === 'ground' ? 'GND' : `${part.label.slice(0, 4)}${i ? '−' : '+'}`, selected ? 'selected' : part.kind === 'ground' ? 'dark' : i ? 'minus' : 'plus')
      tag.position.copy(top).add(new THREE.Vector3(0, 1.2, 0))
      group.add(tag)
    })
  } else if (!part) {
    const lift = 1.6 + A.distanceTo(B) * .18
    const mid = A.clone().lerp(B, .5).setY(lift)
    group.add(lead([A, A.clone().setY(.9), mid, B.clone().setY(.9), B], .3, new THREE.MeshStandardMaterial({ color: step.color, roughness: .38 })))
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
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ff7a45', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .85 }))
        glow.scale.set(11, 11, 1); glow.position.y = 2.4
        body.add(glow)
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
        const band = new THREE.Mesh(new THREE.CylinderGeometry(i === 0 || i === 3 ? 1.14 : .93, i === 0 || i === 3 ? 1.14 : .93, .38, 24), new THREE.MeshStandardMaterial({ color, roughness: .5, metalness: i === 3 ? .6 : 0 }))
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

export default function Board3D(props: Board3DProps) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{ rebuild: (p: Board3DProps) => void; orbit: (angle: number) => void; reset: () => void } | null>(null)
  const latest = useRef(props)
  latest.current = props
  const [ready, setReady] = useState(false)

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

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, 1, 400)
    const home = new THREE.Vector3(0, 56, 50)
    camera.position.copy(home)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.minDistance = 30; controls.maxDistance = 140
    controls.maxPolarAngle = Math.PI * .46
    controls.target.set(0, 0, -2)
    scene.add(new THREE.HemisphereLight('#ffffff', '#3a4652', 1.5))
    const sun = new THREE.DirectionalLight('#ffffff', 2.2)
    sun.position.set(-22, 50, 26); sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 30, bottom: -30, near: 1, far: 140 })
    sun.shadow.bias = -.0004; sun.shadow.radius = 4
    scene.add(sun)

    const surfaceCanvas = document.createElement('canvas')
    surfaceCanvas.width = 2048; surfaceCanvas.height = Math.round(2048 * BODY.h / BODY.w)
    const surface = new THREE.CanvasTexture(surfaceCanvas)
    surface.colorSpace = THREE.SRGBColorSpace
    surface.anisotropy = renderer.capabilities.getMaxAnisotropy()
    const side = new THREE.MeshStandardMaterial({ color: '#c9d0d5', roughness: .7 })
    const board = new THREE.Mesh(new RoundedSlab(BODY.w * S, BODY.h * S, 1.6, 1.4), [new THREE.MeshStandardMaterial({ map: surface, roughness: .72 }), side])
    board.position.copy(world(BODY.x + BODY.w / 2, BODY.y + BODY.h / 2, -1.85))
    board.receiveShadow = true
    scene.add(board)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: .22 }))
    floor.rotation.x = -Math.PI / 2; floor.position.y = -2.12; floor.receiveShadow = true
    scene.add(floor)

    const mounted = new THREE.Group()
    scene.add(mounted)
    let dirty = true
    function dispose(object: THREE.Object3D) {
      object.traverse(node => {
        if (node instanceof THREE.Mesh) { node.geometry.dispose(); [node.material].flat().forEach(m => m.dispose()) }
        if (node instanceof THREE.Sprite) node.material.dispose()
        if (node instanceof CSS2DObject) node.element.remove()
      })
    }
    function rebuild(p: Board3DProps) {
      const c = boardPalettes[p.theme]
      paintSurface(surfaceCanvas.getContext('2d')!, c, p)
      surface.needsUpdate = true
      side.color.set(p.theme === 'dark' ? '#9aa6ae' : '#cfd6db')
      dispose(mounted); mounted.clear()
      for (const step of p.steps) {
        const sockets = p.visible[step.id]
        if (!sockets) continue
        const part = step.part ? p.parts.get(step.part) : undefined
        mounted.add(buildStep(step, sockets, part, !!part && (p.currents?.[part.id] ?? 0) > .00005, !!part && p.selected.includes(part.id), c.selected))
      }
      dirty = true
    }
    function resize() {
      const width = element!.clientWidth
      if (!width) return
      const height = Math.round(Math.min(Math.max(width * .54, 300), 600))
      renderer.setSize(width, height); labels.setSize(width, height)
      camera.aspect = width / height
      // Fit the board width (plus margin) inside the horizontal field of view.
      const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect)
      const offset = camera.position.clone().sub(controls.target).setLength(41 / Math.tan(halfFov) * 1.08)
      camera.position.copy(controls.target).add(offset)
      camera.updateProjectionMatrix(); dirty = true
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()
    controls.addEventListener('change', () => { dirty = true })
    renderer.setAnimationLoop(() => {
      if (controls.update() || dirty) { renderer.render(scene, camera); labels.render(scene, camera); dirty = false }
    })

    const pointer = new THREE.Vector2(), ray = new THREE.Raycaster()
    let down: { x: number; y: number } | null = null
    const onDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY } }
    const onUp = (event: PointerEvent) => {
      if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) { down = null; return }
      down = null
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
      ray.setFromCamera(pointer, camera)
      const hit = ray.intersectObjects([...mounted.children, board], true)[0]
      if (!hit) return
      if (hit.object.userData.part) { latest.current.onPart(hit.object.userData.part); return }
      const x = hit.point.x / S + 380, y = hit.point.z / S + 230.5
      const socket = nearestSocket(x, y)
      if (socket) latest.current.onSocket(socket)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    api.current = {
      rebuild,
      orbit(angle) {
        const offset = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
        camera.position.copy(controls.target).add(offset); dirty = true
      },
      reset() { controls.target.set(0, 0, -2); camera.position.copy(home); resize() },
    }
    rebuild(latest.current)
    setReady(true)
    return () => {
      api.current = null
      renderer.setAnimationLoop(null)
      observer.disconnect(); controls.dispose()
      dispose(scene); surface.dispose()
      renderer.dispose(); renderer.forceContextLoss()
      renderer.domElement.remove(); labels.domElement.remove()
    }
  }, [])

  useEffect(() => { api.current?.rebuild(props) })

  const { t } = props
  return <div className="board3d" ref={host} role="img" aria-roledescription={t('3D model')}
    aria-label={t('3D breadboard. Drag to orbit, scroll to zoom, click a socket to probe it.')}>
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
