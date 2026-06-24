'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import gsap from 'gsap'
import type * as THREE from 'three'

/** Per-route baseline cloudiness — the world morphs as you move through the site.
 *  The story page sits cloudy (the question), the leaderboard clears (the answer). */
const ROUTE_CLOUD: Record<string, number> = {
  '/': 0.82,
  '/leaderboard': 0.1,
  '/datasheet': 0.32,
  '/submit': 0.22,
}

export function useSceneRoute(material: THREE.ShaderMaterial | null) {
  const pathname = usePathname()

  useEffect(() => {
    if (!material) return
    const target = ROUTE_CLOUD[pathname] ?? 0.4
    const proxy = { v: material.uniforms.uCloud.value as number }
    const tween = gsap.to(proxy, {
      v: target,
      duration: 1.4,
      ease: 'power2.inOut',
      onUpdate: () => {
        material.uniforms.uCloud.value = proxy.v
      },
    })
    return () => {
      tween.kill()
    }
  }, [pathname, material])
}
