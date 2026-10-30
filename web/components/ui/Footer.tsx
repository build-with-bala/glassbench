import Link from 'next/link'

// Every section of the site, so nothing is reachable only through the top nav.
const SECTIONS = [
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/systems', label: 'Systems' },
  { href: '/explore', label: 'Explore items' },
  { href: '/compare', label: 'Compare' },
  { href: '/datasheet', label: 'Datasheet' },
  { href: '/submit', label: 'Submit' },
  { href: '/data', label: 'Data & API' },
]

export function Footer() {
  return (
    <footer className="glass-panel site-footer">
      <nav aria-label="Site sections" style={{ margin: '0 0 0.9rem' }}>
        <ul
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.4rem 1.2rem',
            margin: 0,
            padding: 0,
            listStyle: 'none',
          }}
        >
          {SECTIONS.map((s) => (
            <li key={s.href}>
              <Link href={s.href}>{s.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <p style={{ margin: '0 0 0.5rem' }}>
        GlassBench is released under the MIT License · Derived from{' '}
        <a href="https://github.com/xiaowu0162/longmemeval" rel="noopener noreferrer" target="_blank">
          LongMemEval
        </a>{' '}
        (ICLR 2025, MIT).
      </p>
      <p style={{ margin: 0, color: 'var(--faint)' }}>
        A diagnostic instrument for whether a memory-equipped LLM system knows when it doesn’t know. Every
        number on this site was measured by the open deterministic scorer; nothing here is invented.{' '}
        <a href="https://github.com/build-with-bala/glassbench" rel="noopener noreferrer" target="_blank">
          Source on GitHub
        </a>
        .
      </p>
    </footer>
  )
}
