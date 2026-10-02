'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import gsap from 'gsap'

/* Where the board sits and how present it is, per route.

   Home gives it the right of the viewport as the hero's instrument. Pages about the
   results keep it as a smaller instrument beside the page head (top right), where it
   mirrors what the page is showing. Narrow, text-first pages (submit, data, anything
   unknown) hold it small in the right margin. */

export type SceneName = 'hero' | 'side' | 'quiet'

export interface Pose {
  /** camera azimuth / elevation around the plate, radians */
  az: number
  el: number
  /** share of the viewport's width / height the plate may span */
  fit: number
  fitH: number
  /** where the plate's centre sits on screen (fraction from left / from top) */
  ax: number
  ay: number
  /** 0..1 presence and emissive gain */
  dim: number
  glow: number
}

interface ScenePoses {
  wide: Pose
  /** portrait viewports */
  tall: Pose
}

export const POSES: Record<SceneName, ScenePoses> = {
  hero: {
    wide: { az: -0.6, el: 0.56, fit: 0.62, fitH: 0.5, ax: 0.7, ay: 0.5, dim: 1, glow: 1 },
    tall: { az: -0.5, el: 0.66, fit: 0.98, fitH: 0.3, ax: 0.5, ay: 0.235, dim: 1, glow: 1 },
  },
  side: {
    wide: { az: -0.4, el: 0.74, fit: 0.32, fitH: 0.27, ax: 0.805, ay: 0.225, dim: 0.95, glow: 0.95 },
    tall: { az: -0.4, el: 0.8, fit: 0.96, fitH: 0.2, ax: 0.5, ay: 0.17, dim: 0.3, glow: 0.5 },
  },
  quiet: {
    wide: { az: -0.32, el: 0.84, fit: 0.185, fitH: 0.2, ax: 0.9, ay: 0.2, dim: 0.8, glow: 0.8 },
    tall: { az: -0.3, el: 0.86, fit: 0.96, fitH: 0.2, ax: 0.5, ay: 0.17, dim: 0.22, glow: 0.4 },
  },
}

/** The home page once the reader scrolls into the story: the board steps aside and
 *  stays beside the sections, still live. */
export const STORY_POSE: ScenePoses = {
  wide: { az: -0.34, el: 0.82, fit: 0.36, fitH: 0.5, ax: 0.79, ay: 0.5, dim: 1, glow: 1 },
  tall: { az: -0.4, el: 0.8, fit: 1.0, fitH: 0.24, ax: 0.5, ay: 0.2, dim: 0.24, glow: 0.4 },
}

export function sceneForPath(pathname: string | null | undefined): SceneName {
  if (!pathname || pathname === '/') return 'hero'
  if (
    pathname.startsWith('/leaderboard') ||
    pathname.startsWith('/systems') ||
    pathname.startsWith('/explore') ||
    pathname.startsWith('/compare') ||
    pathname.startsWith('/datasheet')
  ) {
    return 'side'
  }
  return 'quiet'
}

/** Mutable, tweened copy of the active scene's poses. Plain numbers so GSAP can drive
 *  the object directly; the scene reads it every frame. */
export interface WorldRig {
  wide: Pose
  tall: Pose
  /** entrance progress, driven once on load */
  intro: number
  glowIntro: number
}

export function createRig(pathname: string | null): WorldRig {
  const p = POSES[sceneForPath(pathname)]
  return { wide: { ...p.wide }, tall: { ...p.tall }, intro: 0, glowIntro: 0 }
}

/** Moves the board between poses as you move through the site. */
export function useSceneRoute(rig: WorldRig) {
  const pathname = usePathname()
  const current = useRef<SceneName | null>(null)
  const tweens = useRef<gsap.core.Tween[]>([])

  useEffect(() => {
    const scene = sceneForPath(pathname)
    if (current.current === null) {
      current.current = scene // first mount: the rig was created in this scene
      return
    }
    // several paths share a scene; an in-flight tween must be left to finish
    if (current.current === scene) return
    current.current = scene
    tweens.current.forEach((t) => t.kill())
    tweens.current = [
      gsap.to(rig.wide, { ...POSES[scene].wide, duration: 1.5, ease: 'power3.inOut' }),
      gsap.to(rig.tall, { ...POSES[scene].tall, duration: 1.5, ease: 'power3.inOut' }),
    ]
  }, [pathname, rig])

  useEffect(
    () => () => {
      tweens.current.forEach((t) => t.kill())
    },
    [],
  )
}
