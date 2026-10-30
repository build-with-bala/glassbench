import type { MetadataRoute } from 'next'
import { SITE_URL } from '../lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // The per-item JSON documents carry gold answers; they exist for the explorer's
        // "reveal" button, not for crawlers. (Item *pages* are kept out of indexes with
        // a noindex tag instead, which a crawler has to be able to fetch to see.)
        disallow: '/api/items/',
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
