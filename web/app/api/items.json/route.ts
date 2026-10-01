import { itemsIndexPayload, jsonResponse } from '../../../lib/api'

export const dynamic = 'force-static'

/** GET /api/items.json — every item with each system's outcome. No gold, no answers. */
export function GET() {
  return jsonResponse(itemsIndexPayload(), { noindex: true })
}
