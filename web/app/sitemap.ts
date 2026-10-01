import type { MetadataRoute } from 'next'
import { SITE_URL, ROUTES } from '../lib/site'
import { getSystemRefs } from '../lib/results-data'
import { systemHref } from '../lib/routes'

/** Every indexable page: the top-level routes and one page per scored system.
 *
 *  Item pages (/explore/<id>) are NOT listed, on purpose: they are `noindex`, because
 *  each sits one click from a gold answer. The JSON endpoints under /api are not pages
 *  and are not listed either. */
export default function sitemap(): MetadataRoute.Sitemap {
  const top = ROUTES.map((path) => ({
    url: `${SITE_URL}${path === '/' ? '' : path}`,
    changeFrequency: (path === '/leaderboard' || path === '/systems' ? 'weekly' : 'monthly') as 'weekly' | 'monthly',
    priority: path === '/' || path === '/leaderboard' ? 1 : 0.7,
  }))
  const systems = getSystemRefs().map((s) => ({
    url: `${SITE_URL}${systemHref(s.system)}`,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))
  return [...top, ...systems]
}
