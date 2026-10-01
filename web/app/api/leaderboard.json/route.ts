import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { jsonHeaders } from '../../../lib/api'

// Generated once, at build time.
export const dynamic = 'force-static'

/** GET /api/leaderboard.json — the scorer pipeline's leaderboard, byte for byte
 *  (results/leaderboard.json). */
export function GET() {
  const body = readFileSync(resolve(process.cwd(), 'data/leaderboard.json'), 'utf8')
  return new Response(body, { headers: jsonHeaders() })
}
