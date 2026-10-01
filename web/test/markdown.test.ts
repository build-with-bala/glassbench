import { describe, it, expect } from 'vitest'
import { escapeHtml, renderInline, renderMarkdown } from '../lib/markdown'
import { getDatasheetHtml } from '../lib/datasheet'
import { getResults } from '../lib/results-data'

const BASE = 'https://example.test/blob/main/'

describe('renderInline', () => {
  it('renders bold, italic and code', () => {
    expect(renderInline('a **b** c')).toBe('a <strong>b</strong> c')
    expect(renderInline('it is *not* tuned')).toBe('it is <em>not</em> tuned')
    expect(renderInline('*Datasheets for Datasets*.')).toBe('<em>Datasheets for Datasets</em>.')
    expect(renderInline('use `a < b`')).toBe('use <code>a &lt; b</code>')
    expect(renderInline('**Every `span` is verbatim.**')).toBe('<strong>Every <code>span</code> is verbatim.</strong>')
  })

  it('leaves arithmetic asterisks and code contents alone', () => {
    expect(renderInline('100 * HM(a, b) * (1 - CWR)')).toBe('100 * HM(a, b) * (1 - CWR)')
    expect(renderInline('`*not italic*` and `**not bold**`')).toBe(
      '<code>*not italic*</code> and <code>**not bold**</code>',
    )
    expect(renderInline('snake_case_name stays')).toBe('snake_case_name stays')
  })

  it('links http(s), in-page and repo-relative targets — and nothing else', () => {
    expect(renderInline('[site](https://example.com/x?a=1&b=2)', BASE)).toBe(
      '<a href="https://example.com/x?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">site</a>',
    )
    expect(renderInline('[`PRE_REGISTRATION.md`](PRE_REGISTRATION.md)', BASE)).toBe(
      `<a href="${BASE}PRE_REGISTRATION.md" target="_blank" rel="noopener noreferrer"><code>PRE_REGISTRATION.md</code></a>`,
    )
    expect(renderInline('[up](#top)', BASE)).toBe('<a href="#top">up</a>')
    // Not linkable: script URLs, absolute paths, parent traversal.
    expect(renderInline('[x](javascript:alert(1))', BASE)).not.toContain('<a')
    expect(renderInline('[x](/etc/passwd)', BASE)).not.toContain('<a')
    expect(renderInline('[x](../secret)', BASE)).not.toContain('<a')
  })

  it('escapes HTML in text', () => {
    expect(renderInline('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;')
    expect(escapeHtml('"a" & <b>')).toBe('&quot;a&quot; &amp; &lt;b&gt;')
  })
})

describe('renderMarkdown', () => {
  it('renders headings with stable, unique ids and a table of contents', () => {
    const { html, toc } = renderMarkdown('# Title\n\n## Part\n\n## Part\n\n#### Deep')
    expect(html).toContain('<h1 id="title">Title</h1>')
    expect(html).toContain('<h2 id="part">Part</h2>')
    expect(html).toContain('<h2 id="part-2">Part</h2>')
    expect(toc).toEqual([
      { id: 'title', text: 'Title', level: 1 },
      { id: 'part', text: 'Part', level: 2 },
      { id: 'part-2', text: 'Part', level: 2 },
    ])
  })

  it('keeps inline markup out of the table of contents', () => {
    const { html, toc } = renderMarkdown('### 4.3 contradiction — gold = `ABSTAIN` *(semi-synthetic)*')
    expect(toc[0].text).toBe('4.3 contradiction — gold = ABSTAIN (semi-synthetic)')
    expect(toc[0].id).toBe('43-contradiction-gold-abstain-semi-synthetic')
    expect(html).toContain('<code>ABSTAIN</code> <em>(semi-synthetic)</em>')
  })

  it('can embed a document under an existing heading', () => {
    const { html, toc } = renderMarkdown('# Card\n\n## Reproducibility', { idPrefix: 'card-', headingOffset: 2 })
    expect(html).toContain('<h3 id="card-card">Card</h3>')
    expect(html).toContain('<h4 id="card-reproducibility">Reproducibility</h4>')
    expect(toc.map((t) => t.id)).toEqual(['card-card', 'card-reproducibility'])
  })

  it('nests lists by indentation and folds continuation lines', () => {
    const { html } = renderMarkdown(
      ['- **Routing:**', '  - Abstains on a cue', '    that overlaps the query.', '  - Otherwise extracts.', '- **Confidence:** fixed'].join('\n'),
    )
    expect(html).toBe(
      '<ul><li><strong>Routing:</strong><ul><li>Abstains on a cue that overlaps the query.</li>' +
        '<li>Otherwise extracts.</li></ul></li><li><strong>Confidence:</strong> fixed</li></ul>',
    )
  })

  it('renders ordered lists, quotes, rules, code fences and tables', () => {
    const { html } = renderMarkdown(
      ['1. one', '2. two', '', '> quoted **text**', '', '---', '', '```', '<b>raw</b>', '```', '', '| a | b |', '|---|---|', '| 1 | `2` |'].join('\n'),
    )
    expect(html).toContain('<ol><li>one</li><li>two</li></ol>')
    expect(html).toContain('<blockquote>quoted <strong>text</strong></blockquote>')
    expect(html).toContain('<hr />')
    expect(html).toContain('<pre><code>&lt;b&gt;raw&lt;/b&gt;</code></pre>')
    expect(html).toContain('<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td><code>2</code></td></tr></tbody></table>')
  })

  it('does not treat a paragraph that starts with bold as a list', () => {
    expect(renderMarkdown('**Known limitations** are listed.').html).toBe(
      '<p><strong>Known limitations</strong> are listed.</p>',
    )
  })
})

describe('the repo documents it renders', () => {
  it('renders the datasheet without leaving raw markdown behind', () => {
    const { html, toc } = getDatasheetHtml()
    expect(toc.length).toBeGreaterThan(5)
    expect(html).toContain('<em>Datasheets for Datasets</em>')
    // Repo-relative links resolve to the repository instead of staying as "[text](path)".
    expect(html).toContain('/blob/main/PRE_REGISTRATION.md"')
    expect(html).not.toMatch(/\]\((?!http)[\w./-]+\)/)
    expect(html).not.toMatch(/\*\*[^*<]+\*\*/)
  })

  it('renders every system card', () => {
    const cards = getResults().systems.filter((s) => s.system_md)
    expect(cards.length).toBeGreaterThan(0)
    for (const s of cards) {
      const { html } = renderMarkdown(s.system_md!, { idPrefix: 'card-', headingOffset: 2 })
      expect(html, s.system).toContain('<h3 id="card-')
      expect(html, s.system).not.toContain('<h1')
      expect(html, s.system).not.toMatch(/\*\*[^*<]+\*\*/)
      expect(html, s.system).not.toContain('<script')
    }
  })
})
