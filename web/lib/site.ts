/** Canonical site origin. Override at deploy time with NEXT_PUBLIC_SITE_URL. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://glassbench.buildwithbala.in'

export const SITE_NAME = 'GlassBench'
export const SITE_TAGLINE = 'does it know when it didn’t?'
export const REPO_URL = 'https://github.com/build-with-bala/glassbench'

/** The indexable, static top-level routes (the sitemap adds one page per system).
 *  Item pages (/explore/<id>) are deliberately absent: they are noindex. */
export const ROUTES = [
  '/',
  '/leaderboard',
  '/systems',
  '/explore',
  '/compare',
  '/datasheet',
  '/submit',
  '/data',
] as const
