'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from '../theme/ThemeToggle'

const LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/datasheet', label: 'Datasheet' },
  { href: '/submit', label: 'Submit' },
]

export function Nav() {
  const pathname = usePathname()
  return (
    <nav className="glass-panel site-nav">
      <Link href="/" className="brand" aria-label="GlassBench home">
        Glass<span>Bench</span>
        <i aria-hidden="true">_</i>
      </Link>
      <div className="nav-links">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={pathname === l.href ? 'page' : undefined}>
            {l.label}
          </Link>
        ))}
        <a
          href="https://github.com/build-with-bala/glassbench"
          className="repo"
          rel="noopener noreferrer"
          target="_blank"
        >
          GitHub <span aria-hidden="true">↗</span>
        </a>
        <ThemeToggle />
      </div>
    </nav>
  )
}
