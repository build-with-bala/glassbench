import './globals.css'
import type { Metadata } from 'next'
import { ThemeProvider } from '../components/theme/ThemeProvider'
import { GlassWorldMount } from '../components/world/GlassWorldMount'
import { SmoothScroll } from '../components/motion/SmoothScroll'
import { Nav } from '../components/ui/Nav'
import { Footer } from '../components/ui/Footer'

export const metadata: Metadata = {
  metadataBase: new URL('https://glassbench.build-with-bala.com'),
  title: {
    default: 'GlassBench — does it know when it didn’t?',
    template: '%s · GlassBench',
  },
  description:
    'A benchmark for whether a memory-equipped LLM system knows when it doesn’t know. Headline metric: Confidently-Wrong Rate (CWR).',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <GlassWorldMount />
          <SmoothScroll>
            <div className="content-root">
              <Nav />
              {children}
              <Footer />
            </div>
          </SmoothScroll>
        </ThemeProvider>
      </body>
    </html>
  )
}
