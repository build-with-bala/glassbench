import { itemRevealPayload, jsonResponse, stripJson } from '../../../../lib/api'
import { getItems } from '../../../../lib/items-data'

export const dynamic = 'force-static'
export const dynamicParams = false

export function generateStaticParams() {
  return getItems().map((it) => ({ file: `${it.id}.json` }))
}

/** GET /api/items/<id>.json — the gold answer, evidence and each system's answer text for
 *  one item. This is what an item page fetches when the reader presses "reveal"; it is
 *  the only endpoint that carries gold, and it is noindex + disallowed in robots.txt. */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const id = stripJson(file)
  const payload = id ? itemRevealPayload(id) : null
  if (!payload) return new Response('Not found\n', { status: 404 })
  return jsonResponse(payload, { noindex: true })
}
