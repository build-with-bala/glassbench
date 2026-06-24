import { GlassPanel } from '../components/ui/GlassPanel'
import { ThemeToggle } from '../components/theme/ThemeToggle'

export default function Home() {
  return (
    <main id="main" style={{ maxWidth: 960, margin: '0 auto', padding: '4rem 1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <ThemeToggle />
      </div>
      <GlassPanel className="" >
        <div style={{ padding: '2rem' }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(2rem, 6vw, 3.4rem)', lineHeight: 1.05 }}>
            Glass<span style={{ color: 'var(--cyan)' }}>Bench</span>
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '1.15rem' }}>
            Does it know when it didn’t? — scaffold online.
          </p>
        </div>
      </GlassPanel>
    </main>
  )
}
