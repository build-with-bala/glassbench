'use client'

import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import type { BoardData } from '../../lib/board-data'
import { GlassScene } from './GlassScene'
import { resolveBoard } from './resolve'
import { boardStore, effectiveRequest, useBoardState } from './store'
import { sceneForPath } from './useSceneRoute'

type Quality = 'full' | 'reduced' | 'poster'

/** The persistent glass board behind every route: a plate of glass cells, one per
 *  benchmark item. The wrapper is pointer-events:none, so it can never eat a DOM
 *  click; pieces are hovered, focused and clicked through real links the hero lays
 *  over them (BoardOverlay). Tiered fidelity keeps a data-heavy page fast:
 *    full     desktop: full geometry and bloom
 *    reduced  coarse pointers: lighter geometry, no bloom
 *    poster   reduced-motion / save-data: a still of the same scene */
/** Writes what the board is showing onto the world's root as data attributes: the
 *  canvas is opaque to the DOM, so this is how a test (or a curious reader in
 *  devtools) can tell. A leaf component, so store changes never re-render the canvas. */
function BoardAttributes({ data, target }: { data: BoardData; target: React.RefObject<HTMLDivElement | null> }) {
  const state = useBoardState()
  useEffect(() => {
    const el = target.current
    if (!el) return
    const board = resolveBoard(data, effectiveRequest(state))
    el.dataset.system = board.system ?? 'none'
    el.dataset.lit = String(board.litCount)
    if (board.focus >= 0) el.dataset.focus = data.items[board.focus].id
    else delete el.dataset.focus
  }, [data, state, target])
  return null
}

export function GlassWorld({ data }: { data: BoardData }) {
  const { resolvedTheme } = useTheme()
  const pathname = usePathname()
  const [quality, setQuality] = useState<Quality>('full')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const saveData = (navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const tier: Quality = reduceMotion || saveData ? 'poster' : coarse ? 'reduced' : 'full'
    setQuality(tier)
    setMounted(true)
    boardStore.setTier(tier)
    return () => boardStore.setTier(null)
  }, [])

  const posterTheme = resolvedTheme === 'light' ? 'light' : 'dark'
  const rootRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={rootRef}
      className="world-root"
      aria-hidden="true"
      data-scene={sceneForPath(pathname)}
      data-quality={mounted ? quality : undefined}
    >
      <BoardAttributes data={data} target={rootRef} />
      {!mounted ? null : quality === 'poster' ? (
        // a still of the same scene, art-directed for phones
        <picture>
          <source media="(max-width: 720px)" srcSet={`/poster-${posterTheme}-portrait.jpg`} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/poster-${posterTheme}.jpg`} alt="" className="world-poster" />
        </picture>
      ) : (
        <Canvas
          className="world-canvas"
          flat
          dpr={quality === 'reduced' ? [1, 1.5] : [1, 1.75]}
          gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
          camera={{ fov: 24, position: [-12, 14, 20], near: 1, far: 400 }}
        >
          <GlassScene data={data} quality={quality} />
        </Canvas>
      )}
    </div>
  )
}
