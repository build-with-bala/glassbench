'use client'

import { useEffect, useRef, useState } from 'react'

/** Counts up to `value` when scrolled into view (the "needle settles" effect from
 *  the original site). Honors reduced-motion by snapping to the final value. */
export function CountUp({ value, dp = 0, className = '' }: { value: number; dp?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [display, setDisplay] = useState(value.toFixed(dp))

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || !('IntersectionObserver' in window)) {
      setDisplay(value.toFixed(dp))
      return
    }

    let raf = 0
    const run = () => {
      const dur = 750
      let t0: number | null = null
      const frame = (ts: number) => {
        if (t0 === null) t0 = ts
        const p = Math.min(1, (ts - t0) / dur)
        const eased = 1 - Math.pow(1 - p, 3)
        const overshoot = p < 1 ? Math.sin(p * Math.PI) * 0.012 : 0
        setDisplay((value * (eased + overshoot)).toFixed(dp))
        if (p < 1) raf = requestAnimationFrame(frame)
        else setDisplay(value.toFixed(dp))
      }
      raf = requestAnimationFrame(frame)
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            run()
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [value, dp])

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  )
}
