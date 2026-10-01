import * as THREE from 'three'
import { SLAB_HALF, SLAB_HEIGHT } from './board'

/** Superellipse exponent of the slab outline. 2 = circle, higher = squarer.
 *  The fragment shader uses the same value to find the distance to the edge. */
export const SLAB_EXPONENT = 4.6
export const SLAB_BEVEL = 0.034

interface SlabOptions {
  /** points around the outline */
  segments?: number
  /** rings across the rounded top edge */
  bevelSegments?: number
}

/** A thick squircle slab with a rounded top edge.

    Built ring by ring with analytic normals instead of ExtrudeGeometry: extrude
    output is non-indexed (so it shades faceted) and smoothing it afterwards smears
    the bevel normals across the flat top. Here the top face is exactly flat, the
    wall exactly vertical, and the bevel between them is a true quarter-round.

    Origin is the centre of the top face; the slab hangs down to -SLAB_HEIGHT. The
    underside is omitted — the camera never sees it. */
export function createSlabGeometry({ segments = 72, bevelSegments = 5 }: SlabOptions = {}): THREE.BufferGeometry {
  const S = Math.max(16, segments)
  const B = Math.max(1, bevelSegments)
  const BB = 2 // rings across the small bottom round-over
  const r = SLAB_BEVEL
  const rb = SLAB_BEVEL * 0.4
  const n = SLAB_EXPONENT
  const a = SLAB_HALF

  // outline + outward 2D normals
  const ox = new Float32Array(S)
  const oz = new Float32Array(S)
  const nx = new Float32Array(S)
  const nz = new Float32Array(S)
  for (let i = 0; i < S; i++) {
    const t = (i / S) * Math.PI * 2
    const c = Math.cos(t)
    const s = Math.sin(t)
    const px = Math.sign(c) * Math.pow(Math.abs(c), 2 / n)
    const pz = Math.sign(s) * Math.pow(Math.abs(s), 2 / n)
    ox[i] = px * a
    oz[i] = pz * a
    let gx = Math.sign(px) * Math.pow(Math.abs(px), n - 1)
    let gz = Math.sign(pz) * Math.pow(Math.abs(pz), n - 1)
    const gl = Math.hypot(gx, gz) || 1
    gx /= gl
    gz /= gl
    nx[i] = gx
    nz[i] = gz
  }

  // profile rings, top → bottom: [inset, y, normal tilt from +Y in radians]
  const rings: [number, number, number][] = []
  for (let k = 0; k <= B; k++) {
    const th = (k / B) * (Math.PI / 2)
    rings.push([r * (1 - Math.sin(th)), -r * (1 - Math.cos(th)), th])
  }
  for (let k = 0; k <= BB; k++) {
    const ph = (k / BB) * (Math.PI / 2)
    rings.push([rb * (1 - Math.cos(ph)), -(SLAB_HEIGHT - rb) - rb * Math.sin(ph), Math.PI / 2 + ph])
  }

  const vertCount = 1 + rings.length * S
  const pos = new Float32Array(vertCount * 3)
  const nor = new Float32Array(vertCount * 3)
  // centre of the top face
  pos[0] = 0
  pos[1] = 0
  pos[2] = 0
  nor[0] = 0
  nor[1] = 1
  nor[2] = 0
  let v = 1
  for (const [inset, y, tilt] of rings) {
    const horiz = Math.sin(tilt)
    const vert = Math.cos(tilt)
    for (let i = 0; i < S; i++) {
      pos[v * 3] = ox[i] - nx[i] * inset
      pos[v * 3 + 1] = y
      pos[v * 3 + 2] = oz[i] - nz[i] * inset
      nor[v * 3] = nx[i] * horiz
      nor[v * 3 + 1] = vert
      nor[v * 3 + 2] = nz[i] * horiz
      v++
    }
  }

  const index: number[] = []
  for (let i = 0; i < S; i++) {
    const j = (i + 1) % S
    index.push(0, 1 + j, 1 + i)
  }
  for (let ring = 0; ring < rings.length - 1; ring++) {
    const top = 1 + ring * S
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
