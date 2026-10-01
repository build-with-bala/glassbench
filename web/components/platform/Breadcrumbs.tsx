import Link from 'next/link'
import ui from './ui.module.css'

export interface Crumb {
  label: string
  /** Omit on the last crumb (the current page). */
  href?: string
}

export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className={ui.crumbs}>
      <ol>
        {trail.map((c, i) => (
          <li key={`${c.label}-${i}`}>
            {c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  )
}
