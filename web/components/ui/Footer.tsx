export function Footer() {
  return (
    <footer className="glass-panel site-footer">
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
