import { GlassPanel } from '../../components/ui/GlassPanel'
import { Reveal } from '../../components/motion/Reveal'
import { getDatasheetHtml } from '../../lib/datasheet'

export const metadata = { title: 'Datasheet' }

export default function DatasheetPage() {
  const { html, toc } = getDatasheetHtml()

  return (
    <main id="main" style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(1.6rem, 4vw, 3rem) 1.5rem' }}>
      <Reveal>
        <GlassPanel className="datasheet-head">
          <div style={{ padding: 'clamp(1.4rem, 4vw, 2.6rem)' }}>
            <p className="mono" style={{ color: 'var(--cyan)', margin: 0, fontSize: '0.82rem', letterSpacing: '0.04em' }}>
              DATASHEET · GlassBench v0.1
            </p>
            <h1 style={{ margin: '0.5rem 0 0.6rem', fontSize: 'clamp(1.9rem, 5vw, 3rem)', lineHeight: 1.06 }}>
              Dataset card
            </h1>
            <p style={{ color: 'var(--muted)', margin: 0, maxWidth: '70ch', lineHeight: 1.6 }}>
              What the dataset is, where it comes from, exactly how each split was built, and what it
              does not support — written to the spirit of Gebru et al., <em>Datasheets for Datasets</em>.
            </p>
          </div>
        </GlassPanel>
      </Reveal>

      <div className="datasheet-layout">
        <Reveal className="datasheet-body" delay={80}>
          <GlassPanel>
            <article className="datasheet-prose" dangerouslySetInnerHTML={{ __html: html }} />
          </GlassPanel>
        </Reveal>

        <aside className="datasheet-toc" aria-label="On this page">
          <GlassPanel>
            <nav>
              <p className="datasheet-toc-title mono">On this page</p>
              <ol>
                {toc.map((entry) => (
                  <li key={entry.id} data-level={entry.level}>
                    <a href={`#${entry.id}`}>{entry.text}</a>
                  </li>
                ))}
              </ol>
            </nav>
          </GlassPanel>
        </aside>
      </div>
    </main>
  )
}
