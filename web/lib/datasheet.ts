import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface TocEntry {
  id: string
  text: string
  level: number
}

export interface DatasheetResult {
  html: string
  toc: TocEntry[]
}

/** Escape HTML-significant characters in raw text. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Stable, collision-free slug for a heading's anchor id. */
function slugify(text: string, used: Set<string>): string {
  const base =
    text
      .toLowerCase()
      .replace(/`/g, '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-') || 'section'
  let slug = base
  let n = 2
  while (used.has(slug)) slug = `${base}-${n++}`
  used.add(slug)
  return slug
}

/** Render inline markdown (bold, code, links) on already-escaped-safe text.
 *  Order matters: extract code spans first so their contents are not re-parsed. */
function renderInline(raw: string): string {
  // Inline code: `...` — escape inner, do not parse further.
  let out = raw.replace(/`([^`]+)`/g, (_m, code: string) => `<code>${escapeHtml(code)}</code>`)
  // Everything outside code spans still needs escaping, but we already injected
  // <code> tags; escape only the segments between our placeholders. Simpler:
  // we built `out` from raw where non-code text is still un-escaped. Re-escape
  // by splitting on the code tags we just inserted.
  const parts = out.split(/(<code>.*?<\/code>)/g)
  out = parts
    .map((part) => {
      if (part.startsWith('<code>')) return part
      let t = escapeHtml(part)
      // Links: [text](url)
      t = t.replace(
        /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
        (_m, label: string, url: string) =>
          `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`,
      )
      // Bold: **...**
      t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      return t
    })
    .join('')
  return out
}

/** Minimal, dependency-free Markdown → HTML for the datasheet long-form.
 *  Supports: #/##/### headings (with slug ids), **bold**, `code`, paragraphs,
 *  `-` bullet lists, fenced ``` code blocks, > blockquotes, and | tables. */
function renderMarkdown(md: string): DatasheetResult {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  const toc: TocEntry[] = []
  const usedSlugs = new Set<string>()

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block
    const fence = line.match(/^```(.*)$/)
    if (fence) {
      const code: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) {
        code.push(lines[i])
        i++
      }
      i++ // consume closing fence
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }

    // Headings (#, ##, ###, ...)
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      const text = heading[2].trim()
      const plain = text.replace(/`/g, '').replace(/\*\*/g, '')
      const id = slugify(plain, usedSlugs)
      if (level <= 3) toc.push({ id, text: plain, level })
      out.push(`<h${level} id="${id}">${renderInline(text)}</h${level}>`)
      i++
      continue
    }

    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      out.push('<hr />')
      i++
      continue
    }

    // Tables: a header row of | ... | followed by a |---|---| separator
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const splitRow = (row: string): string[] =>
        row
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim())
      const headers = splitRow(line)
      i += 2 // skip header + separator
      const bodyRows: string[][] = []
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        bodyRows.push(splitRow(lines[i]))
        i++
      }
      const thead = `<thead><tr>${headers
        .map((h) => `<th>${renderInline(h)}</th>`)
        .join('')}</tr></thead>`
      const tbody = `<tbody>${bodyRows
        .map((r) => `<tr>${r.map((c) => `<td>${renderInline(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody>`
      out.push(`<table>${thead}${tbody}</table>`)
      continue
    }

    // Blockquote (one or more consecutive > lines)
    if (/^>\s?/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      out.push(`<blockquote>${renderInline(quote.join(' ').trim())}</blockquote>`)
      continue
    }

    // Unordered list (- ) or ordered list (1. )
    const isUl = /^\s*-\s+/.test(line)
    const isOl = /^\s*\d+\.\s+/.test(line)
    if (isUl || isOl) {
      const tag = isUl ? 'ul' : 'ol'
      const items: string[] = []
      const itemRe = isUl ? /^\s*-\s+(.*)$/ : /^\s*\d+\.\s+(.*)$/
      while (i < lines.length && itemRe.test(lines[i])) {
        const m = lines[i].match(itemRe)!
        let content = m[1]
        i++
        // Fold continuation lines (indented, non-blank, not a new list item).
        while (
          i < lines.length &&
          lines[i].trim() !== '' &&
          !/^\s*-\s+/.test(lines[i]) &&
          !/^\s*\d+\.\s+/.test(lines[i]) &&
          !/^#{1,6}\s/.test(lines[i]) &&
          /^\s+/.test(lines[i])
        ) {
          content += ' ' + lines[i].trim()
          i++
        }
        items.push(`<li>${renderInline(content.trim())}</li>`)
      }
      out.push(`<${tag}>${items.join('')}</${tag}>`)
      continue
    }

    // Blank line
    if (line.trim() === '') {
      i++
      continue
    }

    // Paragraph: gather until a blank line or a block-level construct begins.
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^---+\s*$/.test(lines[i]) &&
      !/^\s*-\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*\|.*\|\s*$/.test(lines[i])
    ) {
      para.push(lines[i])
      i++
    }
    if (para.length) out.push(`<p>${renderInline(para.join(' '))}</p>`)
  }

  return { html: out.join('\n'), toc }
}

let cached: DatasheetResult | null = null

/** Read data/DATASHEET.md at build time and render it to HTML + a TOC.
 *  Cached per process so repeated renders in one build are free. */
export function getDatasheetHtml(): DatasheetResult {
  if (cached) return cached
  const path = resolve(process.cwd(), 'data/DATASHEET.md')
  const md = readFileSync(path, 'utf8')
  cached = renderMarkdown(md)
  return cached
}
