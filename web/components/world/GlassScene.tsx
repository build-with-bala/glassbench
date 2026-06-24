'use client'

import { useMemo, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTheme } from 'next-themes'
import { createGlassMaterial } from './glassMaterial'
import { useSceneRoute } from './useSceneRoute'

/** The fullscreen glass plane. Scaled to exactly fill the viewport at z=0 so the
 *  shader covers the screen regardless of aspect. */
export function GlassScene() {
  const material = useMemo(() => createGlassMaterial(), [])
  const { viewport, size } = useThree()
  const { resolvedTheme } = useTheme()
  const [reduceMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useSceneRoute(material)

  useFrame((_, dt) => {
    const u = material.uniforms
    // Advance time unless reduced-motion (then hold a frozen, still-pretty frame).
    if (!reduceMotion) u.uTime.value += dt
    u.uResolution.value.set(size.width, size.height)
    const targetTheme = resolvedTheme === 'light' ? 1 : 0
    u.uTheme.value += (targetTheme - u.uTheme.value) * Math.min(1, dt * 3)
  })

  return (
    <mesh scale={[viewport.width, viewport.height, 1]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}
