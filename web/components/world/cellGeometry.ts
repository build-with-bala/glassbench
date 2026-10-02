import * as THREE from 'three'
import { CELL_RADIUS, CELL_SHOULDER, PLATE_THICKNESS } from './plate'

/* Geometry for the glass cells and the plate they stand in.

   A cell is a lathe: a straight wall, a quarter-round shoulder and a faintly domed
   top. Its height changes with the data, so the wall is not baked in: every vertex
   carries `aBody` (0 at the foot, 1 from the top of the wall upward) and `position.y`
   holds only the offset above the wall. The vertex shader computes
   `y = aBody * bodyHeight + position.y`, which stretches the wall and leaves the
   shoulder round. Normals are analytic, so the glass shades smoothly. */

interface Ring {
  r: number
  y: number
  body: number
  /** normal: radial and vertical components */
  nr: number
  ny: number
}

function lathe(rings: Ring[], segments: number, closeTop: boolean): THREE.BufferGeometry {
  const S = Math.max(8, segments)
  const count = rings.length * S + (closeTop ? 1 : 0)
  const pos = new Float32Array(count * 3)
  const nor = new Float32Array(count * 3)
  const body = new Float32Array(count)
  let v = 0
  for (const ring of rings) {
    for (let i = 0; i < S; i++) {
      const a = (i / S) * Math.PI * 2
      const c = Math.cos(a)
      const s = Math.sin(a)
      pos[v * 3] = c * ring.r
      pos[v * 3 + 1] = ring.y
      pos[v * 3 + 2] = s * ring.r
      nor[v * 3] = c * ring.nr
      nor[v * 3 + 1] = ring.ny
      nor[v * 3 + 2] = s * ring.nr
      body[v] = ring.body
      v++
    }
  }
  const index: number[] = []
  for (let k = 0; k < rings.length - 1; k++) {
    const lo = k * S
    const hi = lo + S
    for (let i = 0; i < S; i++) {
      const j = (i + 1) % S
      // outward-facing for a ring order that runs bottom -> top
      index.push(lo + i, hi + i, lo + j, lo + j, hi + i, hi + j)
    }
  }
  if (closeTop) {
    const last = (rings.length - 1) * S
    const top = rings[rings.length - 1]
    pos[v * 3] = 0
    pos[v * 3 + 1] = top.y + top.r * 0.02
    pos[v * 3 + 2] = 0
    nor[v * 3 + 1] = 1
    body[v] = 1
    for (let i = 0; i < S; i++) {
      const j = (i + 1) % S
      index.push(last + i, v, last + j)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  geo.setAttribute('aBody', new THREE.BufferAttribute(body, 1))
  geo.setIndex(index)
  return geo
}

/** Wall + round shoulder + shallow dome, for a rod of the given radius. */
function rodRings(radius: number, shoulder: number, dome: number, shoulderSteps: number, topSteps: number): Ring[] {
  const rings: Ring[] = [
    { r: radius, y: 0, body: 0, nr: 1, ny: 0 },
    { r: radius, y: 0, body: 1, nr: 1, ny: 0 },
  ]
  for (let k = 1; k <= shoulderSteps; k++) {
    const th = (k / shoulderSteps) * (Math.PI / 2)
    rings.push({
      r: radius - shoulder * (1 - Math.cos(th)),
      y: shoulder * Math.sin(th),
      body: 1,
      nr: Math.cos(th),
      ny: Math.sin(th),
    })
  }
  const flat = radius - shoulder
  for (let k = 1; k <= topSteps; k++) {
    const t = k / (topSteps + 1)
    // a lens-like top: slope falls to zero at the centre
    const slope = (dome / flat) * 2 * (1 - t)
    const len = Math.hypot(slope, 1)
    rings.push({ r: flat * (1 - t), y: shoulder + dome * (1 - (1 - t) * (1 - t)), body: 1, nr: slope / len, ny: 1 / len })
  }
  return rings
}

export const CORE_RADIUS = 0.15
export const CORE_SHOULDER = 0.11

export function createShellGeometry(segments: number): THREE.BufferGeometry {
  return lathe(rodRings(CELL_RADIUS, CELL_SHOULDER, 0.03, segments > 20 ? 6 : 4, 2), segments, true)
}

/** The column of light inside a cell. */
export function createCoreGeometry(segments: number): THREE.BufferGeometry {
  return lathe(rodRings(CORE_RADIUS, CORE_SHOULDER, 0.045, segments > 14 ? 5 : 3, 2), segments, true)
}

/** The plate: a thick rounded slab whose top face is at y = 0. Sockets, shadows and
 *  light pools are drawn by its shader, so the mesh is just the slab. */
export function createPlateGeometry(width: number, depth: number, corner = 0.7, bevel = 0.05): THREE.BufferGeometry {
  const hw = width / 2
  const hd = depth / 2
  const rad = Math.min(corner, hw, hd)
  const perCorner = 14
  const outline: Array<{ x: number; z: number; nx: number; nz: number }> = []
  const corners: Array<[number, number, number]> = [
    [hw - rad, hd - rad, 0],
    [-(hw - rad), hd - rad, Math.PI / 2],
    [-(hw - rad), -(hd - rad), Math.PI],
    [hw - rad, -(hd - rad), (3 * Math.PI) / 2],
  ]
  for (const [cx, cz, start] of corners) {
    for (let k = 0; k <= perCorner; k++) {
      const a = start + (k / perCorner) * (Math.PI / 2)
      outline.push({ x: cx + Math.cos(a) * rad, z: cz + Math.sin(a) * rad, nx: Math.cos(a), nz: Math.sin(a) })
    }
  }
  const S = outline.length
  // profile, top -> bottom: [inset, y, tilt of the normal from +Y]
  const profile: Array<[number, number, number]> = []
  const steps = 5
  for (let k = 0; k <= steps; k++) {
    const th = (k / steps) * (Math.PI / 2)
    profile.push([bevel * (1 - Math.sin(th)), -bevel * (1 - Math.cos(th)), th])
  }
  profile.push([0, -PLATE_THICKNESS, Math.PI / 2])

  const count = 1 + profile.length * S
  const pos = new Float32Array(count * 3)
  const nor = new Float32Array(count * 3)
  nor[1] = 1
  let v = 1
  for (const [inset, y, tilt] of profile) {
    for (const p of outline) {
      pos[v * 3] = p.x - p.nx * inset
      pos[v * 3 + 1] = y
      pos[v * 3 + 2] = p.z - p.nz * inset
      nor[v * 3] = p.nx * Math.sin(tilt)
      nor[v * 3 + 1] = Math.cos(tilt)
      nor[v * 3 + 2] = p.nz * Math.sin(tilt)
      v++
    }
  }
  const index: number[] = []
  for (let i = 0; i < S; i++) index.push(0, 1 + ((i + 1) % S), 1 + i)
  for (let k = 0; k < profile.length - 1; k++) {
    const top = 1 + k * S
    const bot = top + S
    for (let i = 0; i < S; i++) {
      const j = (i + 1) % S
      index.push(top + i, top + j, bot + i, top + j, bot + j, bot + i)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  geo.setIndex(index)
  return geo
}
