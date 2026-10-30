import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderMarkdown, type MarkdownResult, type TocEntry } from './markdown'

export type { TocEntry }
export type DatasheetResult = MarkdownResult

let cached: DatasheetResult | null = null

/** Read data/DATASHEET.md at build time and render it to HTML + a TOC.
 *  The document's own `#` title becomes an <h2>: the page already has its <h1>
 *  ("Dataset card"), and a page should have exactly one.
 *  Cached per process so repeated renders in one build are free. */
export function getDatasheetHtml(): DatasheetResult {
  if (cached) return cached
  const path = resolve(process.cwd(), 'data/DATASHEET.md')
  const md = readFileSync(path, 'utf8')
  cached = renderMarkdown(md, { headingOffset: 1 })
  return cached
}
