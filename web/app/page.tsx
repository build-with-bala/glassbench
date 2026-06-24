import { GlassPanel } from '../components/ui/GlassPanel'

export default function Home() {
  return (
    <main id="main" style={{ maxWidth: 1040, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <GlassPanel>
        <div style={{ padding: 'clamp(1.6rem, 5vw, 3.2rem)' }}>
          <p style={{ color: 'var(--muted)', margin: 0, fontSize: '1.05rem' }}>
            Every memory benchmark asks “did it remember?”
          </p>
          <h1 style={{ margin: '0.4rem 0 0', fontSize: 'clamp(2.2rem, 6vw, 3.6rem)', lineHeight: 1.04 }}>
            GlassBench asks:{' '}
            <span style={{ color: 'var(--cyan)' }}>does it know when it didn’t?</span>
          </h1>
        </div>
      </GlassPanel>
    </main>
  )
}
