import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ThemeProvider } from '../components/theme/ThemeProvider'
import { GlassWorldMount } from '../components/world/GlassWorldMount'
import { SmoothScroll } from '../components/motion/SmoothScroll'
import { Nav } from '../components/ui/Nav'
import { Footer } from '../components/ui/Footer'
import { CommandPalette } from '../components/ui/CommandPalette'
import { Glare } from '../components/ui/Glare'
import { SITE_URL, REPO_URL } from '../lib/site'
import { getBoardData } from '../lib/world-data'
import { BoardDataProvider } from '../components/world/BoardDataProvider'

/* Self-hosted by next/font: the files are fetched at build time and served from
   this origin — no runtime request to a font CDN, no external stylesheet. */
const sans = Geist({ subsets: ['latin'], display: 'swap', variable: '--font-sans' })
const mono = Geist_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-mono' })

const DESCRIPTION =
  'A benchmark for whether a memory-equipped LLM system knows when it doesn’t know. Headline metric: Confidently-Wrong Rate (CWR).'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'GlassBench — does it know when it didn’t?',
    template: '%s · GlassBench',
  },
  description: DESCRIPTION,
  applicationName: 'GlassBench',
  keywords: [
    'GlassBench',
    'LLM memory benchmark',
    'Confidently-Wrong Rate',
    'calibration',
    'abstention',
    'LongMemEval',
    'RAG',
    'memory systems',
  ],
  alternates: { canonical: '/' },
  openGraph: { type: 'website', siteName: 'GlassBench', url: SITE_URL, title: 'GlassBench — does it know when it didn’t?', description: DESCRIPTION },
  twitter: { card: 'summary_large_image', title: 'GlassBench', description: DESCRIPTION },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b0d12' },
    { media: '(prefers-color-scheme: light)', color: '#edf0f5' },
  ],
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Dataset',
      name: 'GlassBench',
      description: DESCRIPTION,
      url: SITE_URL,
      license: 'https://opensource.org/licenses/MIT',
      creator: { '@type': 'Organization', name: 'build-with-bala', url: REPO_URL },
      isBasedOn: 'https://github.com/xiaowu0162/longmemeval',
      keywords: ['LLM memory', 'calibration', 'abstention', 'Confidently-Wrong Rate', 'ECE', 'Brier'],
    },
    {
      '@type': 'SoftwareSourceCode',
      name: 'GlassBench',
      codeRepository: REPO_URL,
      programmingLanguage: ['Python', 'TypeScript'],
      license: 'https://opensource.org/licenses/MIT',
      about: 'Deterministic scorer for the Confidently-Wrong Rate of memory-equipped LLM systems.',
    },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // the glass board draws one cell per benchmark item and shows each system's
  // scorer-assigned outcome on it; this is the pipeline's export, reshaped, with no gold
  const board = getBoardData()
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <ThemeProvider>
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <BoardDataProvider data={board}>
            <GlassWorldMount />
            <SmoothScroll>
              <div className="content-root">
                <Nav />
                {children}
                <Footer />
              </div>
            </SmoothScroll>
            <CommandPalette />
            <Glare />
          </BoardDataProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
