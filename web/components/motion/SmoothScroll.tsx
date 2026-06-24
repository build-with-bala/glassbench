'use client'

import { useEffect } from 'react'
import Lenis from 'lenis'
import gsap from 'gsap'

/** Lenis smooth scroll, integrated with the GSAP ticker. Disabled on touch /
 *  reduced-motion so low-power devices keep native momentum scrolling. */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const touch = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 720
    if (reduce || touch) return

    const lenis = new Lenis({ lerp: 0.09, smoothWheel: true })
    const raf = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)
    return () => {
      gsap.ticker.remove(raf)
      lenis.destroy()
    }
  }, [])

  return <>{children}</>
}
