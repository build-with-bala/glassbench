'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import * as THREE from 'three'
import gsap from 'gsap'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { OUTCOME_KEYS } from '../../lib/outcomes'
import type { BoardData } from '../../lib/board-data'
import {
  CELL_RADIUS,
  CELL_SHOULDER,
  NEUTRAL_LOOK,
  PLATE_THICKNESS,
  cellHeight,
  createPlate,
  lookFor,
  type CellLook,
} from './plate'
import { createCoreGeometry, createPlateGeometry, createShellGeometry } from './cellGeometry'
import {
  PALETTE,
  PALETTE_KEYS,
  createCoreMaterial,
  createFloorMaterial,
  createPlateMaterial,
  createShellMaterial,
  createWorldUniforms,
  paletteUniform,
  type PaletteKey,
  type WorldUniforms,
} from './materials'
import { resolveBoard } from './resolve'
import { RECT_STRIDE, boardBridge, boardStore, boardTurn, effectiveRequest } from './store'
import { STORY_POSE, createRig, sceneForPath, useSceneRoute, type Pose } from './useSceneRoute'

export type WorldQuality = 'full' | 'reduced'

const FOV = 24
const TAN_HALF_FOV = Math.tan(THREE.MathUtils.degToRad(FOV) / 2)
/** state layout per cell: [height, frost, cool, heat,  emphasis, lift, focus, appear] */
const STRIDE = 8
const RATES = [6.5, 6, 5, 5, 9, 12, 14, 0]

const damp = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt))

function mixPose(out: Pose, a: Pose, b: Pose, t: number): Pose {
  out.az = a.az + (b.az - a.az) * t
  out.el = a.el + (b.el - a.el) * t
  out.fit = a.fit + (b.fit - a.fit) * t
  out.fitH = a.fitH + (b.fitH - a.fitH) * t
  out.ax = a.ax + (b.ax - a.ax) * t
  out.ay = a.ay + (b.ay - a.ay) * t
  out.dim = a.dim + (b.dim - a.dim) * t
  out.glow = a.glow + (b.glow - a.glow) * t
  return out
}
const blankPose = (): Pose => ({ az: 0, el: 0, fit: 1, fitH: 1, ax: 0.5, ay: 0.5, dim: 1, glow: 1 })

/** The glass board: a plate of cells, one per benchmark item, showing one system's
 *  scorer-assigned outcome and stated confidence on each. Four draw calls for the
 *  cells (cores, far glass wall, near glass wall), one each for plate and floor. */
export function GlassScene({ data, quality }: { data: BoardData; quality: WorldQuality }) {
  const plate = useMemo(() => createPlate(data.items.map((it) => it.split)), [data])
  const count = plate.cells.length
  const pathname = usePathname()
  const { resolvedTheme } = useTheme()
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const scene = useThree((s) => s.scene)

  const uniforms = useMemo(() => createWorldUniforms(), [])
  const firstPath = useRef(pathname)
  const rig = useMemo(() => createRig(firstPath.current), [])
  useSceneRoute(rig)
  const sceneName = sceneForPath(pathname)

  /* ---- per-cell state: eased on the CPU, read by every shader ------------- */
  const cells = useMemo(() => {
    const texels = Math.max(1, plate.cols * plate.rows)
    const a = new Float32Array(texels * 4)
    const b = new Float32Array(texels * 4)
    const make = (arr: Float32Array<ArrayBuffer>) => {
      const t = new THREE.DataTexture(arr, Math.max(1, plate.cols), Math.max(1, plate.rows), THREE.RGBAFormat, THREE.FloatType)
      t.minFilter = THREE.NearestFilter
      t.magFilter = THREE.NearestFilter
      t.needsUpdate = true
      return t
    }
    return {
      a,
      b,
      texA: make(a),
      texB: make(b),
      cur: new Float32Array(count * STRIDE),
      tgt: new Float32Array(count * STRIDE),
      next: new Float32Array(count * STRIDE),
      startAt: new Float32Array(count),
      /** entrance order: the wave runs along the plate */
      delay: Float32Array.from(plate.cells, (c) => (c.col / Math.max(1, plate.cols - 1)) * 0.8 + (c.row / Math.max(1, plate.rows - 1)) * 0.2),
    }
  }, [plate, count])

  useEffect(() => {
    uniforms.uStateA.value = cells.texA
    uniforms.uStateB.value = cells.texB
    uniforms.uGrid.value.set(plate.cols, plate.rows)
    uniforms.uCount.value = count
    uniforms.uPlateHalf.value.set(plate.width / 2, plate.depth / 2)
    return () => {
      cells.texA.dispose()
      cells.texB.dispose()
    }
  }, [cells, uniforms, plate, count])

  /* ---- geometry ----------------------------------------------------------- */
  const geo = useMemo(() => {
    const full = quality === 'full'
    const shellSrc = createShellGeometry(full ? 30 : 20)
    const coreSrc = createCoreGeometry(full ? 18 : 12)
    const cell = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2)
    const base = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3)
    const instanced = (src: THREE.BufferGeometry) => {
      const g = new THREE.InstancedBufferGeometry()
      g.setIndex(src.getIndex())
      g.setAttribute('position', src.getAttribute('position'))
      g.setAttribute('normal', src.getAttribute('normal'))
      g.setAttribute('aBody', src.getAttribute('aBody'))
      g.setAttribute('aCell', cell)
      g.setAttribute('aBase', base)
      g.instanceCount = count
      return g
    }
    return {
      shell: instanced(shellSrc),
      core: instanced(coreSrc),
      plate: createPlateGeometry(plate.width, plate.depth),
      cell,
      base,
      order: plate.cells.map((_, i) => i),
      sortedFor: Number.NaN,
    }
  }, [plate, count, quality])

  const mats = useMemo(
    () => ({
      core: createCoreMaterial(uniforms),
      shellBack: createShellMaterial(uniforms, true),
      shellFront: createShellMaterial(uniforms, false),
      plate: createPlateMaterial(uniforms),
      floor: createFloorMaterial(uniforms),
    }),
    [uniforms],
  )

  useEffect(
    () => () => {
      geo.shell.dispose()
      geo.core.dispose()
      geo.plate.dispose()
    },
    [geo],
  )
  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose())
    },
    [mats],
  )

  const palette = useMemo(() => {
    const make = (p: Record<PaletteKey, string>) =>
      Object.fromEntries(PALETTE_KEYS.map((k) => [k, new THREE.Color(p[k])])) as Record<PaletteKey, THREE.Color>
    return { dark: make(PALETTE.dark), light: make(PALETTE.light) }
  }, [])

  // mutable per-frame state — refs, never React state, so nothing re-renders
  const live = useRef({
    theme: -1,
    themeTarget: resolvedTheme === 'light' ? 1 : 0,
    scroll: 0,
    scrollTarget: 0,
    elapsed: 0,
    version: -1,
    system: '' as string | null,
    turnAz: 0,
    turnEl: 0,
    hero: sceneName === 'hero',
    lastView: '',
    lastCam: '',
    settled: false,
    freeFrame: typeof window !== 'undefined' && (window as unknown as { __boardFrame?: string }).__boardFrame === 'free',
  })
  live.current.themeTarget = resolvedTheme === 'light' ? 1 : 0
  live.current.hero = sceneName === 'hero'

  const tmp = useMemo(
    () => ({
      dir: new THREE.Vector3(),
      right: new THREE.Vector3(),
      target: new THREE.Vector3(),
      key: new THREE.Vector3(),
      p: new THREE.Vector3(),
      q: new THREE.Vector3(),
      pose: blankPose(),
      story: blankPose(),
      spill: new THREE.Color(),
    }),
    [],
  )

  useEffect(() => {
    scene.background = paletteUniform(uniforms, 'bg')
    boardBridge.rects = new Float32Array(data.items.length * RECT_STRIDE)
    return () => {
      scene.background = null
      boardBridge.rects = null
      boardBridge.frame++
    }
  }, [scene, uniforms, data])

  // entrance: the cells grow out of the plate in a wave, then the light comes up
  useEffect(() => {
    rig.intro = 0
    rig.glowIntro = 0
    const tl = gsap.timeline()
    tl.to(rig, { intro: 1, duration: 1.9, ease: 'power2.out' }, 0.05)
    tl.to(rig, { glowIntro: 1, duration: 1.5, ease: 'power2.inOut' }, 0.45)
    return () => {
      tl.kill()
    }
  }, [rig])

  // scroll is read from window; the canvas wrapper stays pointer-events:none
  useEffect(() => {
    const s = live.current
    const onScroll = () => {
      s.scrollTarget = Math.min(1, Math.max(0, window.scrollY / Math.max(1, window.innerHeight)))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const s = live.current
    const u = uniforms
    s.elapsed += dt
    const time = (u.uTime.value += dt)

    // safety net: if the entrance tween never ran, do not leave the board hidden
    if (s.elapsed > 5 && (rig.intro < 0.999 || rig.glowIntro < 0.999)) {
      rig.intro = 1
      rig.glowIntro = 1
    }

    /* ---- theme ---- */
    const prevTheme = s.theme
    s.theme = s.theme < 0 ? s.themeTarget : damp(s.theme, s.themeTarget, 3.2, dt)
    if (Math.abs(s.theme - s.themeTarget) < 0.002) s.theme = s.themeTarget
    if (s.theme !== prevTheme) {
      for (const k of PALETTE_KEYS) paletteUniform(u, k).lerpColors(palette.dark[k], palette.light[k], s.theme)
      u.uTheme.value = s.theme
    }

    /* ---- what the DOM asked for -> per-cell targets ---- */
    const store = boardStore.get()
    let dirty = false
    if (store.version !== s.version) {
      s.version = store.version
      const resolved = resolveBoard(data, effectiveRequest(store))
      const res = resolved.system ? data.results[resolved.system] : undefined
      const h = resolved.filtered
      const systemChanged = resolved.system !== s.system
      s.system = resolved.system
      for (let ci = 0; ci < count; ci++) {
        const cell = plate.cells[ci]
        let look: CellLook = res ? lookFor(OUTCOME_KEYS[res.outcome[cell.item]], res.confidence[cell.item]) : NEUTRAL_LOOK
        const match = resolved.lit[cell.item]
        const focus = resolved.focus === cell.item
        // on neutral glass a highlighted cell has no outcome to show, so it simply lights
        if (!res && ((h && match) || focus)) look = { height: 0.62, frost: 0, cool: 1, heat: 0 }
        const o = ci * STRIDE
        const nx = cells.next
        nx[o] = look.height
        nx[o + 1] = look.frost
        nx[o + 2] = look.cool
        nx[o + 3] = look.heat
        nx[o + 4] = focus || match ? 1 : 0
        nx[o + 5] = focus ? 0.2 : h && match ? 0.045 : 0
        nx[o + 6] = focus ? 1 : 0
        // a change of system sweeps across the plate; a highlight answers at once
        cells.startAt[ci] = systemChanged ? time + cell.col * 0.02 + cell.row * 0.012 : 0
      }
      s.settled = false
    }

    /* ---- ease the state and upload it ---- */
    const intro = rig.intro
    if (!s.settled || intro < 1) {
      let moving = 0
      const { cur, tgt, next, startAt, delay, a, b } = cells
      for (let ci = 0; ci < count; ci++) {
        const o = ci * STRIDE
        if (time >= startAt[ci]) {
          for (let k = 0; k < 7; k++) tgt[o + k] = next[o + k]
        } else {
          moving = 1
        }
        for (let k = 0; k < 7; k++) {
          const d = tgt[o + k] - cur[o + k]
          if (Math.abs(d) > 0.0008) {
            cur[o + k] = damp(cur[o + k], tgt[o + k], RATES[k], dt)
            moving = 1
          } else {
            cur[o + k] = tgt[o + k]
          }
        }
        const t = THREE.MathUtils.clamp(intro * 2.1 - delay[ci] * 1.1, 0, 1)
        cur[o + 7] = 1 - Math.pow(1 - t, 3)
        const cell = plate.cells[ci]
        const tx = (cell.row * plate.cols + cell.col) * 4
        a[tx] = cur[o]
        a[tx + 1] = cur[o + 1]
        a[tx + 2] = cur[o + 2]
        a[tx + 3] = cur[o + 3]
        b[tx] = cur[o + 4]
        b[tx + 1] = cur[o + 5]
        b[tx + 2] = cur[o + 6]
        b[tx + 3] = cur[o + 7]
      }
      cells.texA.needsUpdate = true
      cells.texB.needsUpdate = true
      // the light the whole board gives off, for the pool on the table
      let cool = 0
      let heat = 0
      for (let ci = 0; ci < count; ci++) {
        const o = ci * STRIDE
        cool += cur[o + 2] * cur[o + 4] * cur[o + 7]
        heat += cur[o + 3] * cur[o + 4] * cur[o + 7]
      }
      const inv = 1 / Math.max(1, count)
      tmp.spill.copy(paletteUniform(u, 'cool')).multiplyScalar(cool * inv * 0.9)
      u.uSpill.value.copy(tmp.spill).add(tmp.spill.copy(paletteUniform(u, 'hot')).multiplyScalar(heat * inv * 0.9))
      s.settled = !moving && intro >= 1
      dirty = true
    }

    /* ---- pose: route, then the home page's story pose as the reader scrolls ---- */
    s.scroll = damp(s.scroll, s.scrollTarget, 5, dt)
    const { width, height } = state.size
    const aspect = width / Math.max(1, height)
    const portrait = 1 - THREE.MathUtils.smoothstep(aspect, 0.72, 1.15)
    const pose = mixPose(tmp.pose, rig.wide, rig.tall, portrait)
    if (s.hero) {
      // the hero frames the board between its two control panels: on a short window
      // the board gets a smaller share of the height and sits a little lower
      if (s.freeFrame) {
        // stills (scripts/capture-world.mjs): no panels to make room for
        pose.fitH = 0.64
      } else {
        const share = THREE.MathUtils.clamp((height - 430) / Math.max(1, height), 0.26, 0.5)
        pose.fitH = THREE.MathUtils.lerp(Math.min(pose.fitH, share), pose.fitH, portrait)
        pose.ay += (1 - portrait) * (22 / Math.max(1, height))
      }
      const story = mixPose(tmp.story, STORY_POSE.wide, STORY_POSE.tall, portrait)
      mixPose(pose, pose, story, THREE.MathUtils.smoothstep(s.scroll, 0.1, 0.8))
    }

    /* ---- camera ---- */
    s.turnAz = damp(s.turnAz, boardTurn.azimuth, 9, dt)
    s.turnEl = damp(s.turnEl, boardTurn.elevation, 9, dt)
    const az = pose.az + s.turnAz
    const el = THREE.MathUtils.clamp(pose.el - s.turnEl, 0.28, 1.25)
    const { dir, right, target, key, p, q } = tmp
    dir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az))
    right.set(Math.cos(az), 0, -Math.sin(az))
    // framed for the resting pose: turning the board must not also zoom it
    const halfW = (Math.abs(Math.cos(pose.az)) * plate.width + Math.abs(Math.sin(pose.az)) * plate.depth) / 2
    const halfV =
      ((Math.abs(Math.sin(pose.az)) * plate.width + Math.abs(Math.cos(pose.az)) * plate.depth) / 2) * Math.sin(pose.el) +
      0.8 * Math.cos(pose.el)
    const zoomIn = 0.94 + 0.06 * intro
    const dist =
      Math.max(halfW / (pose.fit * TAN_HALF_FOV * aspect), halfV / (pose.fitH * TAN_HALF_FOV)) / zoomIn
    target.set(0, 0.3, 0)
    camera.position.copy(target).addScaledVector(dir, dist)
    camera.up.set(0, 1, 0)
    camera.lookAt(target)
    const view = `${width}|${height}|${pose.ax.toFixed(4)}|${pose.ay.toFixed(4)}`
    if (view !== s.lastView) {
      s.lastView = view
      camera.near = 1
      camera.far = 400
      camera.setViewOffset(width, height, (0.5 - pose.ax) * width, (0.5 - pose.ay) * height, width, height)
    }
    camera.updateMatrixWorld()

    /* ---- draw order: far cells first, re-sorted only when the board has turned ---- */
    if (!(Math.abs(az - geo.sortedFor) < 0.1)) {
      geo.sortedFor = az
      geo.order.sort((i, j) => {
        const ci = plate.cells[i]
        const cj = plate.cells[j]
        return ci.x * dir.x + ci.z * dir.z - (cj.x * dir.x + cj.z * dir.z)
      })
      const cellArr = geo.cell.array as Float32Array
      const baseArr = geo.base.array as Float32Array
      geo.order.forEach((ci, slot) => {
        const c = plate.cells[ci]
        cellArr[slot * 2] = c.u
        cellArr[slot * 2 + 1] = c.v
        baseArr[slot * 3] = c.x
        baseArr[slot * 3 + 1] = c.z
        baseArr[slot * 3 + 2] = ((c.item * 0.61803) % 1) * 0.999
      })
      geo.cell.needsUpdate = true
      geo.base.needsUpdate = true
    }

    /* ---- uniforms ---- */
    u.uGlow.value = pose.glow * rig.glowIntro
    u.uDim.value = pose.dim
    key.copy(right).multiplyScalar(-0.55).addScaledVector(dir, 0.3)
    key.y = 0.72
    u.uKeyDir.value.copy(key.normalize())
    u.uShadowDir.value.set(-key.x, -key.z).normalize()

    /* ---- tell the DOM where each cell is (only when something moved) ---- */
    const rects = boardBridge.rects
    const cam = `${az.toFixed(4)}|${el.toFixed(4)}|${dist.toFixed(3)}|${view}`
    if (rects && (dirty || cam !== s.lastCam)) {
      s.lastCam = cam
      for (let ci = 0; ci < count; ci++) {
        const cell = plate.cells[ci]
        const o = ci * STRIDE
        const lift = cells.cur[o + 5]
        const top = cellHeight(cells.cur[o]) * cells.cur[o + 7] + CELL_SHOULDER + lift
        p.set(cell.x, lift, cell.z).project(camera)
        const bx = (p.x * 0.5 + 0.5) * width
        const by = (0.5 - p.y * 0.5) * height
        const depth = p.z
        p.set(cell.x, top, cell.z).project(camera)
        const ty = (0.5 - p.y * 0.5) * height
        q.set(cell.x, top, cell.z).addScaledVector(right, CELL_RADIUS).project(camera)
        const r = Math.abs((q.x - p.x) * 0.5 * width)
        const k = cell.item * RECT_STRIDE
        rects[k] = bx - r
        rects[k + 1] = ty - r * 0.55
        rects[k + 2] = r * 2
        rects[k + 3] = by - ty + r * 1.1
        rects[k + 4] = Math.round((1 - depth) * 100000)
      }
      boardBridge.frame++
    }
  })

  const floorSize = Math.max(plate.width, plate.depth) + 26

  return (
    <>
      <mesh
        material={mats.floor}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -PLATE_THICKNESS - 0.01, 0]}
        frustumCulled={false}
        renderOrder={0}
      >
        <planeGeometry args={[floorSize, floorSize]} />
      </mesh>
      <mesh geometry={geo.plate} material={mats.plate} frustumCulled={false} renderOrder={1} />
      <mesh geometry={geo.core} material={mats.core} frustumCulled={false} renderOrder={2} />
      <mesh geometry={geo.shell} material={mats.shellBack} frustumCulled={false} renderOrder={3} />
      <mesh geometry={geo.shell} material={mats.shellFront} frustumCulled={false} renderOrder={4} />
      <Post uniforms={uniforms} bloom={quality === 'full'} />
    </>
  )
}

/** Renders through a multisampled half-float target so glass blends in linear light
 *  on every tier, and (desktop) blooms what is brighter than 1.0. Built from three's
 *  own passes — no extra dependency. Takes over the render loop (priority 1) and
 *  falls back to a plain render if a pass ever throws. */
function Post({ uniforms, bloom }: { uniforms: WorldUniforms; bloom: boolean }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const failed = useRef(false)

  const rig = useMemo(() => {
    try {
      const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 })
      const composer = new EffectComposer(gl, target)
      composer.addPass(new RenderPass(scene, camera))
      const pass = bloom ? new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.3, 0.8) : null
      if (pass) composer.addPass(pass)
      composer.addPass(new OutputPass())
      return { composer, pass, target }
    } catch {
      return null
    }
  }, [gl, scene, camera, bloom])

  useEffect(() => {
    if (!rig) return
    rig.composer.setPixelRatio(dpr)
    rig.composer.setSize(size.width, size.height)
  }, [rig, size.width, size.height, dpr])

  useEffect(
    () => () => {
      if (!rig) return
      rig.composer.dispose()
      rig.target.dispose()
    },
    [rig],
  )

  useFrame((state) => {
    if (rig && !failed.current) {
      try {
        if (rig.pass) {
          // light theme: a pale ground would bloom into white, so the halo backs off
          const theme = uniforms.uTheme.value
          rig.pass.strength = THREE.MathUtils.lerp(0.36, 0.1, theme)
          rig.pass.threshold = THREE.MathUtils.lerp(0.8, 0.98, theme)
        }
        rig.composer.render()
        return
      } catch {
        failed.current = true
      }
    }
    state.gl.render(state.scene, state.camera)
  }, 1)

  return null
}
