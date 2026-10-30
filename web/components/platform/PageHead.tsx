import type { ReactNode } from 'react'
import { GlassPanel } from '../ui/GlassPanel'
import ui from './ui.module.css'

/** The header panel every platform route opens with: eyebrow, <h1>, lede. */
export function PageHead({
  eyebrow,
  title,
  mono = false,
  children,
  aside,
}: {
  eyebrow: string
  title: ReactNode
  /** Render the title in the mono face (system names, item ids). */
  mono?: boolean
  /** Lede paragraph(s). */
  children?: ReactNode
  /** Extra content under the lede (badges, actions). */
  aside?: ReactNode
}) {
  return (
    <GlassPanel className={ui.headPanel}>
      <header className={ui.head}>
        <p className={ui.eyebrow}>{eyebrow}</p>
        <h1 className={`${ui.title} ${mono ? ui.titleMono : ''}`}>{title}</h1>
        {children}
        {aside}
      </header>
    </GlassPanel>
  )
}
