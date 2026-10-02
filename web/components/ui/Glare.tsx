'use client'

import { useEffect } from 'react'

/** Pointer-tracked light on the glass panels. One window listener finds the
 *  `.glass-panel` under the pointer and writes where the pointer is inside it to
 *  `--gx` / `--gy`; the panel's CSS draws a soft highlight there (see globals.css).
 *  Fine pointers only, and nothing happens under reduced motion. */
export function Glare() {
  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let lit: HTMLElement | null = null
    let frame = 0
    let x = 0
    let y = 0
    let target: EventTarget | null = null
    const clear = () => {
      if (!lit) return
      lit.style.removeProperty('--gx')
      lit.style.removeProperty('--gy')
      lit = null
    }
    const apply = () => {
      frame = 0
      const panel = target instanceof Element ? (target.closest('.glass-panel') as HTMLElement | null) : null
      if (panel !== lit) clear()
      if (!panel) return
      const r = panel.getBoundingClientRect()
      panel.style.setProperty('--gx', `${(x - r.left).toFixed(0)}px`)
      panel.style.setProperty('--gy', `${(y - r.top).toFixed(0)}px`)
      lit = panel
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      x = e.clientX
      y = e.clientY
      target = e.target
      if (!frame) frame = requestAnimationFrame(apply)
    }
    const onLeave = () => {
      target = null
      if (!frame) frame = requestAnimationFrame(apply)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      cancelAnimationFrame(frame)
      clear()
    }
  }, [])
  return null
}
