import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { Component, Kind } from '../circuit/model'
import { metric } from '../editor/catalog'
import type { BranchReading } from '../engine/solver'
import { resistorBands, type BoardGeometry } from './geometry'
import type { BoardJumper } from './types'

/** World units per board drawing unit; top face sits at y = 0 and drawing y maps to world z. */
export const WORLD_SCALE = 0.1

export type PartRenderContext = {
  geometry: BoardGeometry
  highlight: string
  glowTexture: THREE.Texture
  reading?: BranchReading
  tripped?: boolean
  selected?: boolean
  ghost?: { valid: boolean }
}

export function createGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.28, 'rgba(255,255,255,0.58)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
}

export function toWorld(geometry: BoardGeometry, x: number, y: number, height = 0): THREE.Vector3 {
  return new THREE.Vector3((x - geometry.width / 2) * WORLD_SCALE, height, (y - geometry.height / 2) * WORLD_SCALE)
}

function metalMaterial() {
  return new THREE.MeshStandardMaterial({ color: '#c3cbd2', metalness: 0.85, roughness: 0.3 })
}

function leadTube(points: THREE.Vector3[], radius = 0.11, material: THREE.Material = metalMaterial(), castShadow = true) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.08)
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 8), material)
  mesh.castShadow = castShadow
  return mesh
}

function createLabel(text: string, tone: 'dark' | 'plus' | 'minus' | 'selected' | 'meter' = 'dark') {
  const node = document.createElement('span')
  node.className = `board3d-label board3d-label-${tone}`
  node.textContent = text
  return new CSS2DObject(node)
}

function applyGhostStyle(group: THREE.Group, valid: boolean) {
  const tintColor = valid ? '#14b8a6' : '#ef4444'
  group.traverse(node => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = false
      const materials = Array.isArray(node.material) ? node.material : [node.material]
      for (const material of materials) {
        if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
          material.transparent = true
          material.opacity = valid ? 0.58 : 0.48
          material.depthWrite = false
          material.emissive.set(tintColor)
          material.emissiveIntensity = valid ? 0.35 : 0.65
          if (!valid) material.color.lerp(new THREE.Color('#ef4444'), 0.45)
        }
      }
    }
  })
}

/** Renders a subtle glowing anchor pin marker on the first chosen socket during 2-click placement or wiring. */
export function buildAnchorPin(socket: string, geometry: BoardGeometry, color = '#14b8a6'): THREE.Group | null {
  const hole = geometry.hole(socket)
  if (!hole) return null
  const group = new THREE.Group()
  const pos = toWorld(geometry, hole.x, hole.y)
  const pin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.14, 2.2, 16),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, roughness: 0.35 }),
  )
  pin.position.set(pos.x, 1.1, pos.z)
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.65, 0.12, 10, 24),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.4 }),
  )
  ring.rotation.x = Math.PI / 2
  ring.position.set(pos.x, 0.16, pos.z)
  group.add(pin, ring)
  return group
}

/** Builds a smooth arched jumper wire with socket boots and optional selection or ghost highlight. */
export function buildJumperMesh(
  jumper: Pick<BoardJumper, 'id' | 'from' | 'to' | 'color'>,
  geometry: BoardGeometry,
  selected: boolean,
  highlight: string,
  ghost?: { valid: boolean },
): THREE.Group | null {
  const a = geometry.hole(jumper.from)
  const b = geometry.hole(jumper.to)
  if (!a || !b) return null
  const A = toWorld(geometry, a.x, a.y)
  const B = toWorld(geometry, b.x, b.y)
  const distance = A.distanceTo(B)
  const lift = Math.min(1.55 + distance * 0.17, 4.9) + (selected ? 0.35 : 0)
  const mid = A.clone().lerp(B, 0.5).setY(lift)
  const q1 = A.clone().lerp(B, 0.15).setY(Math.min(lift * 0.72, 1.4))
  const q2 = A.clone().lerp(B, 0.85).setY(Math.min(lift * 0.72, 1.4))

  const group = new THREE.Group()
  const wireMat = new THREE.MeshStandardMaterial({
    color: jumper.color || '#22c55e',
    roughness: 0.38,
    metalness: 0.06,
  })
  if (selected) {
    wireMat.emissive.set(highlight)
    wireMat.emissiveIntensity = 0.45
  }
  const radius = selected ? 0.34 : 0.28
  group.add(leadTube([A, A.clone().setY(0.75), q1, mid, q2, B.clone().setY(0.75), B], radius, wireMat, !ghost))

  // Insulated connector boots at each socket end.
  for (const end of [A, B]) {
    const bootMat = new THREE.MeshStandardMaterial({ color: '#1f262e', roughness: 0.55 })
    if (selected) {
      bootMat.emissive.set(highlight)
      bootMat.emissiveIntensity = 0.35
    }
    const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.9, 12), bootMat)
    boot.position.set(end.x, 0.45, end.z)
    boot.castShadow = !ghost
    group.add(boot)
  }

  if (ghost) {
    applyGhostStyle(group, ghost.valid)
  } else {
    group.traverse(object => { object.userData.jumper = jumper.id })
  }
  return group
}

/** Builds a realistic 3D mesh group for any of the 13 catalog component types. */
export function buildComponentMesh(
  part: Component,
  sockets: readonly string[],
  ctx: PartRenderContext,
): THREE.Group | null {
  const { geometry, highlight, glowTexture, reading, tripped, selected = false, ghost } = ctx
  const holeA = sockets[0] ? geometry.hole(sockets[0]) : undefined
  if (!holeA) return null
  const holeB = sockets[1] ? geometry.hole(sockets[1]) : holeA
  if (!holeB) return null

  const A = toWorld(geometry, holeA.x, holeA.y)
  const B = toWorld(geometry, holeB.x, holeB.y)
  const group = new THREE.Group()
  const isGhost = !!ghost
  const tint = <T extends THREE.MeshStandardMaterial>(material: T): T => {
    if (selected && !isGhost) {
      material.emissive.set(highlight)
      material.emissiveIntensity = 0.35
    }
    return material
  }

  // 1-pin / header-lead components: voltage source and ground.
  if (part.kind === 'voltage' || part.kind === 'ground') {
    const ends = part.kind === 'voltage' ? [holeA, holeB] : [holeA]
    ends.forEach((p, i) => {
      const isGround = part.kind === 'ground'
      const color = isGround ? '#2c3a48' : i ? '#3b6fc2' : '#d93f3b'
      const out = p.y < geometry.height / 2 ? -1 : 1
      const base = toWorld(geometry, p.x, p.y)
      const top = toWorld(geometry, p.x, p.y + out * 6, 4.2)
      group.add(
        leadTube(
          [base, toWorld(geometry, p.x, p.y, 0.6), toWorld(geometry, p.x, p.y + out * 2, 2.6), top],
          0.24,
          tint(new THREE.MeshStandardMaterial({ color, roughness: 0.42 })),
          !isGhost,
        ),
      )
      const housing = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 2, 0.95),
        tint(new THREE.MeshStandardMaterial({ color: '#1f252c', roughness: 0.5 })),
      )
      housing.position.copy(toWorld(geometry, p.x, p.y, 1))
      housing.castShadow = !isGhost
      group.add(housing)
      if (isGround) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.55, 0.14, 10, 20),
          tint(new THREE.MeshStandardMaterial({ color: '#22c55e', roughness: 0.4, metalness: 0.25 })),
        )
        ring.position.copy(top)
        ring.castShadow = !isGhost
        group.add(ring)
      }
      if (!isGhost) {
        const tag = createLabel(
          isGround ? 'GND' : `${part.label.slice(0, 5)}${i ? '−' : '+'}`,
          selected ? 'selected' : isGround ? 'dark' : i ? 'minus' : 'plus',
        )
        tag.position.copy(top).add(new THREE.Vector3(0, 1.25, 0))
        group.add(tag)
      }
    })
    if (isGhost) applyGhostStyle(group, ghost.valid)
    else group.traverse(object => { object.userData.part = part.id })
    return group
  }

  // Two-terminal components placed across sockets A (pin 0) and B (pin 1).
  const center = A.clone().lerp(B, 0.5)
  const delta = B.clone().sub(A).setY(0)
  const dist = Math.max(delta.length(), 0.001)
  const dir = delta.clone().divideScalar(dist)
  const yaw = -Math.atan2(dir.z, dir.x)

  const bodyHeight: Record<Exclude<Kind, 'voltage' | 'ground'>, number> = {
    resistor: 1.6,
    led: 2.3,
    switch: 1.6,
    current: 1.9,
    capacitor: 1.8,
    potentiometer: 1.7,
    diode: 1.6,
    bulb: 1.8,
    fuse: 1.7,
    voltmeter: 1.8,
    ammeter: 1.8,
  }
  const defaultSpan: Record<Exclude<Kind, 'voltage' | 'ground'>, number> = {
    resistor: 3.1,
    led: 0.85,
    switch: 2.5,
    current: 2.2,
    capacitor: 0.9,
    potentiometer: 1.9,
    diode: 2.2,
    bulb: 1.1,
    fuse: 2.8,
    voltmeter: 2.3,
    ammeter: 2.3,
  }
  const height = bodyHeight[part.kind]
  const span = Math.min(defaultSpan[part.kind], dist * 0.44)
  const leftEnd = center.clone().addScaledVector(dir, -span).setY(height)
  const rightEnd = center.clone().addScaledVector(dir, span).setY(height)

  group.add(leadTube([A, A.clone().setY(height * 0.82), leftEnd], 0.11, metalMaterial(), !isGhost))
  group.add(leadTube([B, B.clone().setY(height * 0.82), rightEnd], 0.11, metalMaterial(), !isGhost))

  const body = new THREE.Group()
  body.position.copy(center).setY(height)
  body.rotation.y = yaw

  let labelOffset = 2.6
  let labelText = part.label
  let labelTone: 'dark' | 'selected' | 'meter' = selected ? 'selected' : 'dark'

  switch (part.kind) {
    case 'resistor': {
      const ceramic = tint(new THREE.MeshStandardMaterial({ color: '#dcbf92', roughness: 0.55 }))
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.6, 24), ceramic)
      core.rotation.z = Math.PI / 2
      body.add(core)
      for (const side of [-1, 1]) {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 16), ceramic)
        bulb.scale.set(1.2, 1, 1)
        bulb.position.x = side * 2.1
        body.add(bulb)
      }
      resistorBands(part.value).forEach((color, i) => {
        const radius = i === 0 || i === 3 ? 1.14 : 0.93
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, 0.38, 24),
          new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: i === 3 ? 0.6 : 0 }),
        )
        band.rotation.z = Math.PI / 2
        band.position.x = [-2.15, -1, -0.1, 2.15][i]
        body.add(band)
      })
      labelText = `${part.label} · ${metric(part.value, 'Ω')}`
      labelOffset = 3.5
      break
    }

    case 'led': {
      const current = Math.max(0, reading?.current ?? 0)
      const glowLevel = current > 5e-5 ? Math.min(1, Math.sqrt(current / 0.015)) : 0
      const lit = glowLevel > 0 && !isGhost
      const epoxy = tint(new THREE.MeshPhysicalMaterial({
        color: lit ? '#ff5a3a' : '#b3261e',
        roughness: 0.14,
        clearcoat: 1,
        transparent: true,
        opacity: 0.9,
        emissive: lit ? '#ff2e12' : '#000000',
        emissiveIntensity: lit ? 0.65 + glowLevel * 1.45 : 0,
      }))
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.35, 32), epoxy)
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 2.35, 32), epoxy)
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1.75, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), epoxy)
      shell.position.y = 1.32
      dome.position.y = 2.5
      // Cathode flat-edge indicator on pin 1 (+x) side.
      const cathodeMark = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.42, 1.7),
        new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.35, metalness: 0.5 }),
      )
      cathodeMark.position.set(1.9, 0.08, 0)
      body.add(rim, shell, dome, cathodeMark)
      if (lit) {
        const light = new THREE.PointLight('#ff6a3d', 12 + glowLevel * 24, 22, 2)
        light.position.y = 3
        body.add(light)
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTexture,
          color: '#ff7a45',
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          opacity: 0.38 + glowLevel * 0.52,
        }))
        const haloSize = 7.5 + glowLevel * 5.5
        halo.scale.set(haloSize, haloSize, 1)
        halo.position.y = 2.4
        body.add(halo)
      }
      labelOffset = 6.1
      break
    }

    case 'switch': {
      const housing = new THREE.Mesh(
        new THREE.BoxGeometry(5.2, 1.8, 2.6),
        tint(new THREE.MeshStandardMaterial({ color: '#33404c', roughness: 0.52 })),
      )
      const track = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 0.16, 1.1),
        new THREE.MeshStandardMaterial({ color: '#1b232b', roughness: 0.7 }),
      )
      track.position.y = 0.92
      const knob = new THREE.Mesh(
        new THREE.BoxGeometry(1.45, 1.05, 1.05),
        new THREE.MeshStandardMaterial({ color: part.closed ? '#5ee6c4' : '#d7e1e6', roughness: 0.38 }),
      )
      knob.position.set(part.closed ? 0.95 : -0.95, 1.32, 0)
      body.add(housing, track, knob)
      labelOffset = 2.9
      break
    }

    case 'current': {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(4.4, 2.1, 2.8),
        tint(new THREE.MeshStandardMaterial({ color: '#1f3a44', roughness: 0.45, metalness: 0.12 })),
      )
      const dial = new THREE.Mesh(
        new THREE.CylinderGeometry(1.05, 1.05, 0.25, 24),
        new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.5 }),
      )
      dial.position.y = 1.12
      const arrowMat = new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0284c7', emissiveIntensity: 0.35, roughness: 0.3 })
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.24), arrowMat)
      shaft.position.set(-0.22, 1.28, 0)
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.65, 12), arrowMat)
      head.rotation.z = -Math.PI / 2
      head.position.set(0.55, 1.28, 0)
      const plusCap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.12, 2.84), new THREE.MeshStandardMaterial({ color: '#d93f3b', roughness: 0.45 }))
      plusCap.position.x = -2.15
      const minusCap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.12, 2.84), new THREE.MeshStandardMaterial({ color: '#3b6fc2', roughness: 0.45 }))
      minusCap.position.x = 2.15
      body.add(box, dial, shaft, head, plusCap, minusCap)
      labelText = `${part.label} · ${metric(part.value, 'A')}`
      labelOffset = 3.2
      break
    }

    case 'capacitor': {
      const can = new THREE.Mesh(
        new THREE.CylinderGeometry(1.65, 1.65, 4.2, 28),
        tint(new THREE.MeshStandardMaterial({ color: '#1b3b6f', roughness: 0.35, metalness: 0.25 })),
      )
      can.position.y = 2.1
      const topCap = new THREE.Mesh(
        new THREE.CylinderGeometry(1.58, 1.62, 0.24, 28),
        new THREE.MeshStandardMaterial({ color: '#d2dae2', metalness: 0.85, roughness: 0.25 }),
      )
      topCap.position.y = 4.25
      // Silver cathode stripe on the pin 1 (+x) side.
      const stripe = new THREE.Mesh(
        new THREE.CylinderGeometry(1.68, 1.68, 3.85, 16, 1, true, Math.PI * 0.32, Math.PI * 0.36),
        new THREE.MeshStandardMaterial({ color: '#dce4ec', roughness: 0.38, metalness: 0.45, side: THREE.DoubleSide }),
      )
      stripe.position.y = 2.1
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(1.62, 1.62, 0.25, 24),
        new THREE.MeshStandardMaterial({ color: '#181c22', roughness: 0.7 }),
      )
      base.position.y = 0.08
      body.add(can, topCap, stripe, base)
      labelText = `${part.label} · ${metric(part.value, 'F')}`
      labelOffset = 6.0
      break
    }

    case 'potentiometer': {
      const caseMat = tint(new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.42 }))
      const housing = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.2, 3.8), caseMat)
      housing.position.y = 0.8
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(1.35, 1.4, 0.35, 24),
        new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.4 }),
      )
      collar.position.y = 2.02
      const knobGroup = new THREE.Group()
      knobGroup.position.y = 2.25
      const pos = part.position ?? 0.5
      // Sweep 270 degrees clockwise as wiper moves from 0 to 1.
      knobGroup.rotation.y = -(pos - 0.5) * Math.PI * 1.5
      const dial = new THREE.Mesh(
        new THREE.CylinderGeometry(1.12, 1.16, 0.45, 24),
        new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.35 }),
      )
      const slot = new THREE.Mesh(
        new THREE.BoxGeometry(1.55, 0.16, 0.28),
        new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.6 }),
      )
      slot.position.y = 0.22
      const pointerDot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 0.18, 12),
        new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.35 }),
      )
      pointerDot.position.set(0, 0.24, -0.78)
      knobGroup.add(dial, slot, pointerDot)
      body.add(housing, collar, knobGroup)
      labelText = `${part.label} · ${Math.round(pos * 100)}%`
      labelOffset = 4.4
      break
    }

    case 'diode': {
      const bodyMat = tint(new THREE.MeshStandardMaterial({ color: '#1b1f24', roughness: 0.48 }))
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 4.1, 24), bodyMat)
      barrel.rotation.z = Math.PI / 2
      const cathodeBand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.98, 0.98, 0.72, 24),
        new THREE.MeshStandardMaterial({ color: '#dce3ea', metalness: 0.65, roughness: 0.32 }),
      )
      cathodeBand.rotation.z = Math.PI / 2
      cathodeBand.position.x = 1.25
      body.add(barrel, cathodeBand)
      labelOffset = 2.5
      break
    }

    case 'bulb': {
      const watts = Math.abs(reading?.power ?? 0)
      const glowLevel = watts > 1e-4 ? Math.min(1, Math.sqrt(watts / 0.5)) : 0
      const lit = glowLevel > 0 && !isGhost
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(1.15, 1.05, 1.35, 24),
        tint(new THREE.MeshStandardMaterial({ color: '#c9a23a', metalness: 0.78, roughness: 0.32 })),
      )
      base.position.y = 0.6
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(1.22, 1.22, 0.28, 24),
        new THREE.MeshStandardMaterial({ color: '#272e36', roughness: 0.6 }),
      )
      collar.position.y = 1.35
      const globe = new THREE.Mesh(
        new THREE.SphereGeometry(2.05, 28, 20),
        tint(new THREE.MeshPhysicalMaterial({
          color: lit ? '#fff0b3' : '#e8eef5',
          roughness: 0.1,
          clearcoat: 1,
          transparent: true,
          opacity: lit ? 0.88 : 0.45,
          emissive: lit ? '#ffbe3b' : '#000000',
          emissiveIntensity: lit ? 0.5 + glowLevel * 1.1 : 0,
        })),
      )
      globe.position.y = 3.25
      const filament = leadTube(
        [new THREE.Vector3(-0.45, 1.5, 0), new THREE.Vector3(-0.4, 3.1, 0), new THREE.Vector3(0, 3.55, 0), new THREE.Vector3(0.4, 3.1, 0), new THREE.Vector3(0.45, 1.5, 0)],
        0.09,
        new THREE.MeshStandardMaterial({
          color: lit ? '#fff4c2' : '#8b95a1',
          emissive: lit ? '#ffb703' : '#000000',
          emissiveIntensity: lit ? 1.8 + glowLevel * 1.6 : 0,
          roughness: 0.3,
        }),
        false,
      )
      body.add(base, collar, globe, filament)
      if (lit) {
        const light = new THREE.PointLight('#ffd26a', 10 + glowLevel * 28, 24, 2)
        light.position.y = 3.5
        body.add(light)
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTexture,
          color: '#ffd166',
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          opacity: 0.32 + glowLevel * 0.55,
        }))
        const haloSize = 8 + glowLevel * 6
        halo.scale.set(haloSize, haloSize, 1)
        halo.position.y = 3.3
        body.add(halo)
      }
      labelOffset = 6.9
      break
    }

    case 'fuse': {
      const blown = !!tripped || part.closed === false
      const capMat = tint(new THREE.MeshStandardMaterial({ color: '#cfd6de', metalness: 0.85, roughness: 0.25 }))
      for (const side of [-1, 1]) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 1.05, 24), capMat)
        cap.rotation.z = Math.PI / 2
        cap.position.x = side * 2.15
        body.add(cap)
      }
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.92, 0.92, 3.3, 24),
        new THREE.MeshPhysicalMaterial({
          color: blown ? '#a89f91' : '#e6f2ff',
          roughness: 0.12,
          clearcoat: 1,
          transparent: true,
          opacity: blown ? 0.52 : 0.35,
        }),
      )
      glass.rotation.z = Math.PI / 2
      body.add(glass)
      if (blown) {
        // Visually open/broken filament stubs with a dark center gap.
        const stubMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.65 })
        for (const side of [-1, 1]) {
          const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.95, 10), stubMat)
          stub.rotation.z = Math.PI / 2 + side * 0.18
          stub.position.set(side * 1.15, -0.06, 0)
          body.add(stub)
        }
      } else {
        const wire = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 3.4, 10),
          new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.9, roughness: 0.2 }),
        )
        wire.rotation.z = Math.PI / 2
        body.add(wire)
      }
      labelText = `${part.label} · ${metric(part.value, 'A')}`
      labelOffset = 2.6
      break
    }

    case 'voltmeter':
    case 'ammeter': {
      const isVolt = part.kind === 'voltmeter'
      const accent = isVolt ? '#14b8a6' : '#f59e0b'
      const casing = new THREE.Mesh(
        new THREE.BoxGeometry(4.6, 2.0, 3.2),
        tint(new THREE.MeshStandardMaterial({ color: '#27323f', roughness: 0.45 })),
      )
      const bezel = new THREE.Mesh(
        new THREE.BoxGeometry(3.8, 0.18, 2.3),
        new THREE.MeshStandardMaterial({ color: accent, roughness: 0.38 }),
      )
      bezel.position.y = 1.02
      const screen = new THREE.Mesh(
        new THREE.BoxGeometry(3.35, 0.2, 1.85),
        new THREE.MeshStandardMaterial({ color: '#0b1220', emissive: accent, emissiveIntensity: 0.14, roughness: 0.25 }),
      )
      screen.position.y = 1.06
      const plusPost = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 0.45, 14),
        new THREE.MeshStandardMaterial({ color: '#e5484d', roughness: 0.4 }),
      )
      plusPost.position.set(-2.0, 1.05, 1.1)
      const minusPost = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 0.45, 14),
        new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5 }),
      )
      minusPost.position.set(2.0, 1.05, 1.1)
      body.add(casing, bezel, screen, plusPost, minusPost)
      const readingText = isVolt ? metric(reading?.voltage, 'V') : metric(reading?.current, 'A')
      labelText = `${part.label} · ${readingText}`
      labelTone = selected ? 'selected' : 'meter'
      labelOffset = 3.2
      break
    }
  }

  body.traverse(node => {
    if (node instanceof THREE.Mesh) node.castShadow = !isGhost
  })
  group.add(body)

  if (isGhost) {
    applyGhostStyle(group, ghost.valid)
  } else {
    const tag = createLabel(labelText, labelTone)
    tag.position.copy(center).setY(height + labelOffset)
    group.add(tag)
    group.traverse(object => { object.userData.part = part.id })
  }
  return group
}
