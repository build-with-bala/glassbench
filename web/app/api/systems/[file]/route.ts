import { jsonResponse, stripJson, systemFileNames, systemPayload } from '../../../../lib/api'

export const dynamic = 'force-static'
export const dynamicParams = false

export function generateStaticParams() {
  return systemFileNames().map((file) => ({ file }))
}

/** GET /api/systems/<system>.json — one system's summary, card and per-item outcomes. */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const name = stripJson(file)
  const payload = name ? systemPayload(name) : null
  if (!payload) return new Response('Not found\n', { status: 404 })
  // Per-item data: fine to fetch, not something a search index should hold.
  return jsonResponse(payload, { noindex: true })
}
