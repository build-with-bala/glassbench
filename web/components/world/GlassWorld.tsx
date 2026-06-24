'use client'

import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useTheme } from 'next-themes'
import { GlassScene } from './GlassScene'

type Quality = 'full' | 'reduced' | 'poster'

/** The persistent glass world behind every route. Decorative only: the wrapper is
 *  pointer-events:none so it can never eat a DOM click. Tiered fidelity keeps a
 *  data-heavy page fast: full (desktop) → reduced (mobile) → static poster
 *  (reduced-motion / save-data). */
export function GlassWorld() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const { resolvedTheme } = useTheme()
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

  const poster = `/poster-${resolvedTheme === 'light' ? 'light' : 'dark'}.jpg`

  return (
    <div ref={wrapRef} className="world-root" aria-hidden="true">
      {!mounted ? null : quality === 'poster' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" className="world-poster" />
      ) : (
        <Canvas
          className="world-canvas"
          dpr={quality === 'reduced' ? [1, 1.25] : [1, 1.75]}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          camera={{ position: [0, 0, 1], fov: 50 }}
        >
          <GlassScene />
        </Canvas>
      )}
    </div>
  )
}
