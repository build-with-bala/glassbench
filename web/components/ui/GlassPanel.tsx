import type { ElementType, ReactNode } from 'react'

interface GlassPanelProps {
  children: ReactNode
  className?: string
  as?: ElementType
}

/** Reusable CSS backdrop-filter glass surface. Content lives in DOM (legible,
 *  selectable, indexable) and floats over the WebGL world. */
export function GlassPanel({ children, className = '', as: Tag = 'div' }: GlassPanelProps) {
  return <Tag className={`glass-panel ${className}`}>{children}</Tag>
}
