import { REPO_URL } from './site'

/* Minimal, dependency-free Markdown → HTML for the repo's own documents (DATASHEET.md
 * and each submission's system.md). Input is trusted repo content, but every text run is
 * HTML-escaped anyway and only http(s), in-page (#...) and repo-relative links are emitted.
 *
 * Supports: #..###### headings (with slug ids), paragraphs, **bold**, *italic*, `code`,
 * [links](url), nested `-`/`*`/`1.` lists, fenced ``` code blocks, > blockquotes,
 * | tables and --- rules. */

export interface TocEntry {
  id: string
  text: string
  level: number
}

export interface MarkdownResult {
  html: string
  toc: TocEntry[]
}

export interface MarkdownOptions {
  /** Prefix for heading ids, to keep them unique when several documents share a page. */
  idPrefix?: string
  /** Shift heading levels down (1 turns `#` into <h2>), so an embedded document does not
   *  introduce a second <h1>. */
  headingOffset?: number
  /** Base URL that repo-relative links (`CONTRIBUTING.md`, `data/x.jsonl`) resolve to. */
  repoBase?: string
}

/** Escape HTML-significant characters in raw text. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
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

const DEFAULT_REPO_BASE = `${REPO_URL}/blob/main/`

/** Resolve a link target. Returns null for anything that is not http(s), an in-page
 *  anchor or a plain repo-relative path — such a link is left as literal text. */
function resolveHref(target: string, repoBase: string): { href: string; external: boolean } | null {
  const t = target.trim()
  if (/^https?:\/\//i.test(t)) return { href: t, external: true }
  if (/^#[\w-]+$/.test(t)) return { href: t, external: false }
  if (/^[\w./-]+(#[\w-]+)?$/.test(t) && !t.startsWith('/') && !t.includes('..')) {
    return { href: repoBase + t, external: true }
  }
  return null
}

/** Render inline markdown (code, links, bold, italic). Code spans are lifted out first so
 *  their contents are never re-parsed. */
export function renderInline(raw: string, repoBase: string = DEFAULT_REPO_BASE): string {
  const code: string[] = []
  let text = raw.replace(/`([^`]+)`/g, (_m, c: string) => {
    code.push(`<code>${escapeHtml(c)}</code>`)
    return `\u0000${code.length - 1}\u0000`
  })

  text = escapeHtml(text)

  // Links: [label](target)
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label: string, target: string) => {
    const link = resolveHref(target.replace(/&amp;/g, '&'), repoBase)
    if (!link) return m
    const attrs = link.external ? ' target="_blank" rel="noopener noreferrer"' : ''
    return `<a href="${escapeHtml(link.href)}"${attrs}>${label}</a>`
  })
  // Bold: **...**
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // Italic: *...* — not inside a word, and not a spaced-out asterisk ("100 * HM * x").
  text = text.replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/g, '$1<em>$2</em>')

  return text.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => code[Number(i)])
}

interface ListLine {
  indent: number
  ordered: boolean
  content: string
}

const LIST_ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/

function renderList(lines: ListLine[], repoBase: string): string {
  // Lines are items in document order with their indentation; an item is nested under
  // the closest preceding item with a smaller indent.
  const render = (start: number, end: number): string => {
    if (start >= end) return ''
    const base = lines[start].indent
    const tag = lines[start].ordered ? 'ol' : 'ul'
    let html = `<${tag}>`
    let i = start
    while (i < end) {
      let j = i + 1
      while (j < end && lines[j].indent > base) j++
      html += `<li>${renderInline(lines[i].content, repoBase)}${render(i + 1, j)}</li>`
      i = j
    }
    return `${html}</${tag}>`
  }
  return render(0, lines.length)
}

export function renderMarkdown(md: string, options: MarkdownOptions = {}): MarkdownResult {
  const { idPrefix = '', headingOffset = 0, repoBase = DEFAULT_REPO_BASE } = options
  const inline = (s: string) => renderInline(s, repoBase)
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  const toc: TocEntry[] = []
  const usedSlugs = new Set<string>()

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block
    if (/^```/.test(line)) {
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
      // Heading text without inline markup, for the TOC and the anchor slug.
      const plain = text
        .replace(/`/g, '')
        .replace(/\*\*/g, '')
        .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/g, '$1$2')
      const id = idPrefix + slugify(plain, usedSlugs)
      if (level <= 3) toc.push({ id, text: plain, level })
      const tag = `h${Math.min(6, level + headingOffset)}`
      out.push(`<${tag} id="${id}">${inline(text)}</${tag}>`)
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
      const thead = `<thead><tr>${headers.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead>`
      const tbody = `<tbody>${bodyRows
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
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
      out.push(`<blockquote>${inline(quote.join(' ').trim())}</blockquote>`)
      continue
    }

    // Lists (-, * or 1.), nested by indentation
    if (LIST_ITEM.test(line) && !/^\s*\*\*/.test(line)) {
      const items: ListLine[] = []
      while (i < lines.length) {
        const m = lines[i].match(LIST_ITEM)
        if (m && !/^\s*\*\*/.test(lines[i])) {
          items.push({ indent: m[1].length, ordered: /\d/.test(m[2]), content: m[3] })
          i++
          continue
        }
        // Fold continuation lines: indented, non-blank, not a new block.
        if (items.length && lines[i].trim() !== '' && /^\s+/.test(lines[i]) && !/^#{1,6}\s/.test(lines[i])) {
          items[items.length - 1].content += ' ' + lines[i].trim()
          i++
          continue
        }
        break
      }
      out.push(renderList(items, repoBase))
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
      !(LIST_ITEM.test(lines[i]) && !/^\s*\*\*/.test(lines[i])) &&
      !/^\s*\|.*\|\s*$/.test(lines[i])
    ) {
      para.push(lines[i])
      i++
    }
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`)
  }

  return { html: out.join('\n'), toc }
}
