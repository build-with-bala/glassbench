import type { Metadata } from 'next'
import { SITE_NAME } from './site'

interface PageMeta {
  /** Page title; the root layout's template appends "· GlassBench". */
  title: string
  description: string
  /** Canonical path, e.g. "/systems/agent_llm". Resolved against `metadataBase`. */
  path: string
  /** Keep the page out of search indexes (item pages: they sit next to gold answers). */
  noindex?: boolean
}

/** Per-route metadata: title, description, a canonical URL of its own and matching
 *  Open Graph / Twitter fields.
 *
 *  The root layout declares `alternates.canonical: '/'`, and Next.js merges metadata
 *  shallowly — a page that sets no `alternates` inherits the home page's canonical and
 *  tells search engines it is a duplicate of `/`. Every route therefore sets its own. */
export function pageMetadata({ title, description, path, noindex = false }: PageMeta): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url: path,
      title: `${title} · ${SITE_NAME}`,
      description,
    },
    twitter: { card: 'summary_large_image', title: `${title} · ${SITE_NAME}`, description },
    robots: noindex
      ? { index: false, follow: true, googleBot: { index: false, follow: true } }
      : { index: true, follow: true },
  }
}
