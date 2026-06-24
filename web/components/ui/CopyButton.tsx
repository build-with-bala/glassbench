'use client'

import { useState } from 'react'

export function CopyButton({ text, label = 'copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* clipboard blocked — swallow, still flash feedback */
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <button type="button" className="copy-btn" onClick={onClick} aria-label={`Copy: ${text}`}>
      {copied ? 'copied' : label}
      <style jsx>{`
        .copy-btn {
          font-family: var(--mono);
          font-size: 0.74rem;
          padding: 0.25rem 0.6rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--glass-bg-2);
          color: var(--muted);
          cursor: pointer;
          transition: color 0.2s ease, border-color 0.2s ease;
        }
        .copy-btn:hover {
          color: var(--ink);
          border-color: var(--cyan);
        }
      `}</style>
    </button>
  )
}
