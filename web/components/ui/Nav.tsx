'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from '../theme/ThemeToggle'
import { openCommandPalette } from './CommandPalette'

const LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/explore', label: 'Explore' },
  { href: '/compare', label: 'Compare' },
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
        <button
          type="button"
          className="nav-search"
          onClick={openCommandPalette}
          aria-label="Search pages, systems and items"
          aria-keyshortcuts="Meta+K Control+K /"
          title="Search (⌘K or /)"
        >
          <span className="nav-search-icon" aria-hidden="true" />
          <span className="nav-search-text">Search</span>
          <kbd aria-hidden="true">⌘K</kbd>
        </button>
        <ThemeToggle />
      </div>
    </nav>
  )
}
