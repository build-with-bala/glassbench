import './globals.css'
import type { Metadata } from 'next'
import { ThemeProvider } from '../components/theme/ThemeProvider'

export const metadata: Metadata = {
  title: 'GlassBench — does it know when it didn’t?',
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
          <div className="content-root">{children}</div>
        </ThemeProvider>
      </body>
    </html>
  )
}
