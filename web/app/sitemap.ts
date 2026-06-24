import type { MetadataRoute } from 'next'
import { SITE_URL, ROUTES } from '../lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((path) => ({
    url: `${SITE_URL}${path === '/' ? '' : path}`,
    changeFrequency: path === '/leaderboard' ? 'weekly' : 'monthly',
    priority: path === '/' || path === '/leaderboard' ? 1 : 0.7,
  }))
}
