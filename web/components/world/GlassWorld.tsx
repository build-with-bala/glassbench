'use client'

import { useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { GlassScene } from './GlassScene'
import { sceneForPath, type BoardCounts } from './board'

type Quality = 'full' | 'reduced' | 'poster'

/** The persistent glass world behind every route: a board of frosted slabs, one
 *  per benchmark item. Decorative only — the wrapper is pointer-events:none so it
 *  can never eat a DOM click (pointer response is read from window instead).
 *  Tiered fidelity keeps a data-heavy page fast:
 *    full     desktop: full geometry, bloom, hover + parallax
 *    reduced  coarse pointers: lighter geometry, no post-processing
 *    poster   reduced-motion / save-data: a still of the same scene */
export function GlassWorld({ counts }: { counts: BoardCounts }) {
  const { resolvedTheme } = useTheme()
  const pathname = usePathname()
  const [quality, setQuality] = useState<Quality>('full')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const saveData = (navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData
    const coarse = window.matchMedia('(pointer: coarse)').matches
    if (reduceMotion || saveData) setQuality('poster')
    else if (coarse) setQuality('reduced')
    else setQuality('full')
  }, [])

  const posterTheme = resolvedTheme === 'light' ? 'light' : 'dark'

  return (
    <div className="world-root" aria-hidden="true" data-scene={sceneForPath(pathname)} data-quality={mounted ? quality : undefined}>
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
          orthographic
          flat
          dpr={quality === 'reduced' ? [1, 1.5] : [1, 1.75]}
          gl={{ antialias: quality === 'reduced', alpha: false, powerPreference: 'high-performance' }}
          camera={{ position: [20, 20, 20], zoom: 240, near: 0.1, far: 100 }}
        >
          <GlassScene counts={counts} quality={quality} />
        </Canvas>
      )}
    </div>
  )
}
