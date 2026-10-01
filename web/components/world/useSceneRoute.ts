'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import gsap from 'gsap'
import { sceneForPath, sceneIndex, type Board, type SceneName } from './board'

/** Everything about the world that changes with the route. Plain numbers so GSAP
 *  can tween the object directly; the scene reads it every frame. */
export interface WorldRig {
  /** scene weights (hero, board, card, submit) — blended in the shader */
  w0: number
  w1: number
  w2: number
  w3: number
  /** where the focus slab sits on screen (fraction from left / from top) */
  ax: number
  ay: number
  /** the same, for portrait viewports */
  pax: number
  pay: number
  /** zoom multiplier on top of the viewport-derived base zoom */
  zoom: number
  /** 0..1 overall presence of the world */
  dim: number
  /** emissive gain */
  glow: number
  /** how strongly the text side of the screen is quietened */
  fade: number
  focusX: number
  focusZ: number
  /** entrance progress, driven once on load */
  intro: number
  glowIntro: number
}

interface Look {
  ax: number
  ay: number
  pax: number
  pay: number
  zoom: number
  dim: number
  glow: number
  fade: number
}

/* Per-route variation. Home carries the full composition: cluster on the right,
   headline side kept quiet. Inner pages push the lit slabs toward a corner, pull
   the camera back and dim everything so nothing competes with the text. */
const LOOK: Record<SceneName, Look> = {
  hero: { ax: 0.67, ay: 0.565, pax: 0.56, pay: 0.25, zoom: 1, dim: 1, glow: 1, fade: 0.84 },
  board: { ax: 0.86, ay: 0.2, pax: 0.8, pay: 0.13, zoom: 0.8, dim: 0.62, glow: 0.6, fade: 0.5 },
  card: { ax: 0.9, ay: 0.7, pax: 0.82, pay: 0.14, zoom: 0.7, dim: 0.52, glow: 0.55, fade: 0.45 },
  submit: { ax: 0.88, ay: 0.3, pax: 0.8, pay: 0.12, zoom: 0.86, dim: 0.62, glow: 0.7, fade: 0.5 },
}

function target(board: Board, scene: SceneName) {
  const i = sceneIndex(scene)
  const f = board.focus[i] ?? { x: 0, z: 0 }
  return {
    ...LOOK[scene],
    w0: i === 0 ? 1 : 0,
    w1: i === 1 ? 1 : 0,
    w2: i === 2 ? 1 : 0,
    w3: i === 3 ? 1 : 0,
    focusX: f.x,
    focusZ: f.z,
  }
}

export function createRig(board: Board, pathname: string | null): WorldRig {
  return { ...target(board, sceneForPath(pathname)), intro: 0, glowIntro: 0 }
}

/** Morphs the world as you move through the site: which slabs are lit, which
 *  layers are raised, and where the camera sits. */
export function useSceneRoute(rig: WorldRig, board: Board) {
  const pathname = usePathname()
  const current = useRef<SceneName | null>(null)
  const tween = useRef<gsap.core.Tween | null>(null)

  useEffect(() => {
    const scene = sceneForPath(pathname)
    if (current.current === null) {
      // first mount: the rig was created already in this scene
      current.current = scene
      return
    }
    // two paths can share a scene; an in-flight tween must be left to finish
    if (current.current === scene) return
    current.current = scene
    tween.current?.kill()
    tween.current = gsap.to(rig, { ...target(board, scene), duration: 1.6, ease: 'power3.inOut' })
  }, [pathname, rig, board])

  useEffect(
    () => () => {
      tween.current?.kill()
    },
    [],
  )
}
