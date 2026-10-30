import { jsonResponse, systemsIndexPayload } from '../../../lib/api'

export const dynamic = 'force-static'

/** GET /api/systems.json — every scored system with its summary. */
export function GET() {
  return jsonResponse(systemsIndexPayload())
}
