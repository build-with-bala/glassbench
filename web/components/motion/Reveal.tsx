'use client'

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

/** Scroll-reveal via IntersectionObserver. Adds `.is-in` when in view; a 3.5s
 *  safety net reveals anything still hidden (deep-links, headless captures). */
export function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || !('IntersectionObserver' in window)) {
      el.classList.add('is-in')
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            window.setTimeout(() => el.classList.add('is-in'), delay)
            io.unobserve(entry.target)
          }
        })
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.1 },
    )
    io.observe(el)
    const safety = window.setTimeout(() => el.classList.add('is-in'), 3500)
    return () => {
      io.disconnect()
      window.clearTimeout(safety)
    }
  }, [delay])

  return (
    <div ref={ref} data-reveal className={className}>
      {children}
    </div>
  )
}
