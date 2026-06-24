'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const isDark = resolvedTheme === 'dark'
  const label = mounted ? (isDark ? 'Switch to light' : 'Switch to dark') : 'Toggle theme'

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      <span aria-hidden="true">{mounted ? (isDark ? '☾' : '☀') : '◐'}</span>
      <style jsx>{`
        .theme-toggle {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          font-size: 16px;
          border-radius: 12px;
          background: var(--glass-bg-2);
          border: 1px solid var(--border);
          color: var(--ink);
          cursor: pointer;
          -webkit-backdrop-filter: blur(10px);
          backdrop-filter: blur(10px);
          transition: transform 0.2s ease, background 0.3s ease;
        }
        .theme-toggle:hover {
          transform: translateY(-1px);
        }
      `}</style>
    </button>
  )
}
