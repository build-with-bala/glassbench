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
import { createBoard, SLAB_HEIGHT, type BoardCounts } from './board'
import { createSlabGeometry } from './slabGeometry'
import { PALETTE, createGroundMaterial, createSlabMaterial, createWorldUniforms } from './slabMaterial'
import { createRig, useSceneRoute } from './useSceneRoute'

export type WorldQuality = 'full' | 'reduced'

interface Props {
  counts: BoardCounts
  quality: WorldQuality
}

/* Isometric-style rig: orthographic, turned a little past 45° so the grid is not
   perfectly symmetric, looking down at roughly the true-isometric elevation. */
const AZIMUTH = THREE.MathUtils.degToRad(49)
const ELEVATION = THREE.MathUtils.degToRad(35.5)
const CAMERA_DISTANCE = 30

const PALETTE_KEYS = ['bg', 'gap', 'top', 'side', 'rim', 'glowHot', 'glowDeep', 'glowOlive', 'glowTint'] as const
const UNIFORM_FOR: Record<(typeof PALETTE_KEYS)[number], string> = {
  bg: 'uBg',
  gap: 'uGap',
  top: 'uTop',
  side: 'uSide',
  rim: 'uRim',
  glowHot: 'uGlowHot',
  glowDeep: 'uGlowDeep',
  glowOlive: 'uGlowOlive',
  glowTint: 'uGlowTint',
}

const damp = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt))

/** The board of frosted-glass slabs. One instanced draw call for every slab and
 *  layer, one for the floor, and (desktop only) a bloom pass. */
export function GlassScene({ counts, quality }: Props) {
  const { answerable, stale, contradiction, false_premise } = counts
  const board = useMemo(
    () => createBoard({ answerable, stale, contradiction, false_premise }),
    [answerable, stale, contradiction, false_premise],
  )
  const pathname = usePathname()
  const { resolvedTheme } = useTheme()
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)

  const uniforms = useMemo(() => createWorldUniforms(), [])
  // created once in the scene of the first pathname; later route changes tween it
  const firstPath = useRef(pathname)
  const rig = useMemo(() => createRig(board, firstPath.current), [board])
  useSceneRoute(rig, board)

  const slabGeometry = useMemo(() => {
    const src = createSlabGeometry(
      quality === 'full' ? { segments: 72, bevelSegments: 5 } : { segments: 44, bevelSegments: 3 },
    )
    const geo = new THREE.InstancedBufferGeometry()
    geo.setIndex(src.getIndex())
    geo.setAttribute('position', src.getAttribute('position'))
    geo.setAttribute('normal', src.getAttribute('normal'))

    const count = board.tiles.length + board.stacks.length
    const offset = new Float32Array(count * 3)
    const lit = new Float32Array(count * 4)
    const lift = new Float32Array(count * 4)
    const show = new Float32Array(count * 4)
    const misc = new Float32Array(count * 4)

    board.tiles.forEach((t, i) => {
      offset.set([t.x, t.y, t.z], i * 3)
      lit.set(t.lit, i * 4)
      lift.set(t.lift, i * 4)
      show.set([1, 1, 1, 1], i * 4)
      misc.set([t.seed, 0, t.split === 'false_premise' ? 1 : 0, t.delay], i * 4)
    })
    board.stacks.forEach((s, n) => {
      const i = board.tiles.length + n
      const t = board.tiles[s.tile]
      offset.set([t.x, t.y, t.z], i * 3)
      lit.set(s.under, i * 4)
      // top of the layer = slab lift + clear gap + its own thickness
      lift.set(
        s.gap.map((g, k) => t.lift[k] + g + SLAB_HEIGHT),
        i * 4,
      )
      show.set(s.show, i * 4)
      misc.set([(t.seed * 7.13) % 1, 1, 0, Math.min(1, t.delay + 0.08)], i * 4)
    })

    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offset, 3))
    geo.setAttribute('aLit', new THREE.InstancedBufferAttribute(lit, 4))
    geo.setAttribute('aLift', new THREE.InstancedBufferAttribute(lift, 4))
    geo.setAttribute('aShow', new THREE.InstancedBufferAttribute(show, 4))
    geo.setAttribute('aMisc', new THREE.InstancedBufferAttribute(misc, 4))
    geo.instanceCount = count
    return geo
  }, [board, quality])

  const slabMaterial = useMemo(() => createSlabMaterial(uniforms), [uniforms])
  const groundMaterial = useMemo(() => createGroundMaterial(uniforms), [uniforms])
  const groundSize = (board.side + 6) * 1

  useEffect(
    () => () => {
      slabGeometry.dispose()
    },
    [slabGeometry],
  )
  useEffect(
    () => () => {
      slabMaterial.dispose()
      groundMaterial.dispose()
    },
    [slabMaterial, groundMaterial],
  )

  // palette endpoints, converted once
  const palette = useMemo(() => {
    const make = (p: Record<(typeof PALETTE_KEYS)[number], string>) =>
      Object.fromEntries(PALETTE_KEYS.map((k) => [k, new THREE.Color(p[k])])) as Record<
        (typeof PALETTE_KEYS)[number],
        THREE.Color
      >
    return { dark: make(PALETTE.dark), light: make(PALETTE.light) }
  }, [])

  // mutable per-frame state — refs, never React state, so nothing re-renders
  const live = useRef({
    theme: -1,
    themeTarget: resolvedTheme === 'light' ? 1 : 0,
    px: 0,
    py: 0,
    parX: 0,
    parY: 0,
    pointerActive: 0,
    hover: 0,
    scroll: 0,
    scrollTarget: 0,
    elapsed: 0,
  })
  live.current.themeTarget = resolvedTheme === 'light' ? 1 : 0

  const tmp = useMemo(
    () => ({
      dir: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      target: new THREE.Vector3(),
      origin: new THREE.Vector3(),
      key: new THREE.Vector3(),
    }),
    [],
  )

  useEffect(() => {
    scene.background = uniforms.uBg.value
    uniforms.uBoardHalf.value = board.side / 2
    return () => {
      scene.background = null
    }
  }, [scene, uniforms, board])

  // entrance: slabs rise in a ripple, then the cluster lights up
  useEffect(() => {
    rig.intro = 0
    rig.glowIntro = 0
    const tl = gsap.timeline()
    tl.to(rig, { intro: 1, duration: 2.1, ease: 'power2.out' }, 0.05)
    tl.to(rig, { glowIntro: 1, duration: 1.7, ease: 'power2.inOut' }, 0.4)
    return () => {
      tl.kill()
    }
  }, [rig])

  // pointer + scroll are read from window: the canvas wrapper stays
  // pointer-events:none, so the world can never swallow a DOM click.
  useEffect(() => {
    const s = live.current
    const onScroll = () => {
      s.scrollTarget = Math.min(1, Math.max(0, window.scrollY / Math.max(1, window.innerHeight * 0.85)))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    if (quality !== 'full') {
      return () => window.removeEventListener('scroll', onScroll)
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      s.px = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1
      s.py = -((e.clientY / Math.max(1, window.innerHeight)) * 2 - 1)
      s.pointerActive = 1
    }
    const onLeave = () => {
      s.pointerActive = 0
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    window.addEventListener('blur', onLeave)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('blur', onLeave)
    }
  }, [quality])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const s = live.current
    const u = uniforms
    s.elapsed += dt

    // safety net: if the entrance tween never ran, do not leave the world hidden
    if (s.elapsed > 5 && (rig.intro < 0.999 || rig.glowIntro < 0.999)) {
      rig.intro = 1
      rig.glowIntro = 1
    }

    // ---- theme ----
    const prevTheme = s.theme
    s.theme = s.theme < 0 ? s.themeTarget : damp(s.theme, s.themeTarget, 3.2, dt)
    if (Math.abs(s.theme - s.themeTarget) < 0.002) s.theme = s.themeTarget
    if (s.theme !== prevTheme) {
      for (const k of PALETTE_KEYS) {
        const uniform = u[UNIFORM_FOR[k]]
        if (uniform) (uniform.value as THREE.Color).lerpColors(palette.dark[k], palette.light[k], s.theme)
      }
      u.uTheme.value = s.theme
    }

    // ---- inputs ----
    s.parX = damp(s.parX, s.px * s.pointerActive, 2.2, dt)
    s.parY = damp(s.parY, s.py * s.pointerActive, 2.2, dt)
    s.hover = damp(s.hover, s.pointerActive, 3, dt)
    s.scroll = damp(s.scroll, s.scrollTarget, 5, dt)

    const { width, height } = state.size
    const portrait = 1 - THREE.MathUtils.smoothstep(width / Math.max(1, height), 0.72, 1.15)
    const t = (u.uTime.value += dt)

    // ---- camera ----
    const az = AZIMUTH + s.parX * 0.03
    const el = ELEVATION - s.parY * 0.018
    const { dir, right, up, target, origin, key } = tmp
    dir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az))
    right.set(Math.cos(az), 0, -Math.sin(az))
    up.crossVectors(dir, right)

    const baseZoom = THREE.MathUtils.clamp(74 + width * 0.176, 130, 410)
    const zoom = baseZoom * rig.zoom * (0.94 + 0.06 * rig.intro)
    const worldW = width / zoom
    const worldH = height / zoom
    const ax =
      THREE.MathUtils.lerp(rig.ax, rig.pax, portrait) + s.parX * 0.01 + Math.sin(t * 0.07) * 0.004
    const ay =
      THREE.MathUtils.lerp(rig.ay, rig.pay, portrait) - s.parY * 0.01 + Math.cos(t * 0.05) * 0.004 - s.scroll * 0.07
    target
      .set(rig.focusX, 0, rig.focusZ)
      .addScaledVector(right, -(ax - 0.5) * worldW)
      .addScaledVector(up, -(0.5 - ay) * worldH)
    camera.position.copy(target).addScaledVector(dir, CAMERA_DISTANCE)
    camera.up.set(0, 1, 0)
    camera.lookAt(target)
    if ((camera as THREE.OrthographicCamera).isOrthographicCamera && camera.zoom !== zoom) {
      camera.zoom = zoom
      camera.updateProjectionMatrix()
    }

    // ---- pointer on the board plane (hover lift) ----
    if (s.hover > 0.001) {
      origin
        .copy(camera.position)
        .addScaledVector(right, s.px * worldW * 0.5)
        .addScaledVector(up, s.py * worldH * 0.5)
      const k = dir.y > 1e-4 ? origin.y / dir.y : 0
      const hx = origin.x - dir.x * k
      const hz = origin.z - dir.z * k
      u.uPointer.value.x = damp(u.uPointer.value.x, hx, 9, dt)
      u.uPointer.value.y = damp(u.uPointer.value.y, hz, 9, dt)
    }
    u.uPointer.value.z = s.hover

    // ---- uniforms ----
    u.uW.value.set(rig.w0, rig.w1, rig.w2, rig.w3)
    u.uIntro.value = rig.intro
    u.uGlow.value = rig.glow * rig.glowIntro * (1 - s.scroll * 0.5)
    u.uDim.value = rig.dim * (1 - s.scroll * 0.42)
    u.uFocus.value.set(rig.focusX, rig.focusZ)
    u.uViewDir.value.copy(dir)
    key.copy(right).multiplyScalar(-0.62).addScaledVector(dir, 0.5)
    key.y += 0.52
    u.uKeyDir.value.copy(key.normalize())
    u.uGradDir.value.set(key.x, key.z).normalize()
    state.gl.getDrawingBufferSize(u.uRes.value)

    const fade = u.uFade.value
    const fl = Math.hypot(1 - portrait, portrait) || 1
    fade.set((1 - portrait) / fl, portrait / fl, rig.fade, THREE.MathUtils.lerp(0, 0.03, portrait))

    const weights = u.uW.value
    const lights = u.uLights.value
    for (let i = 0; i < lights.length; i++) {
      const l = board.lights[i]
      if (!l) {
        lights[i].w = 0
        continue
      }
      lights[i].set(l.x, l.y, l.z, l.intensity * weights.getComponent(l.scene))
    }
  })

  return (
    <>
      <mesh geometry={slabGeometry} material={slabMaterial} frustumCulled={false} />
      <mesh
        material={groundMaterial}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -SLAB_HEIGHT - 0.012, 0]}
        frustumCulled={false}
      >
        <planeGeometry args={[groundSize, groundSize]} />
      </mesh>
      {quality === 'full' ? <Bloom uniforms={uniforms} /> : null}
    </>
  )
}

/** Bloom built from three's own passes (no extra dependency). Rendering goes to a
 *  multisampled half-float target, so only emissive values above 1.0 bloom and
 *  the slab edges stay antialiased. Takes over the render loop (priority 1). */
function Bloom({ uniforms }: { uniforms: ReturnType<typeof createWorldUniforms> }) {
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
      const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.18, 0.9)
      composer.addPass(bloom)
      composer.addPass(new OutputPass())
      return { composer, bloom, target }
    } catch {
      return null
    }
  }, [gl, scene, camera])

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
        // light theme: a pale ground would bloom into white, so the halo backs off
        const theme = uniforms.uTheme.value
        rig.bloom.strength = THREE.MathUtils.lerp(0.3, 0.12, theme)
        rig.bloom.threshold = THREE.MathUtils.lerp(0.9, 0.98, theme)
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
