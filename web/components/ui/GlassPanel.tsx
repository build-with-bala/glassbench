import type { ReactNode } from 'react'

interface GlassPanelProps {
  children: ReactNode
  className?: string
}

/** Reusable CSS backdrop-filter glass surface. Content lives in DOM (legible,
 *  selectable, indexable) and floats over the WebGL world. For semantic elements
 *  (nav/footer/section) apply the `glass-panel` class directly instead. */
export function GlassPanel({ children, className = '' }: GlassPanelProps) {
  return <div className={`glass-panel ${className}`}>{children}</div>
}
