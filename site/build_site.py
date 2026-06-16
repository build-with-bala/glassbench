#!/usr/bin/env python3
"""Build the GlassBench static site into ``site/dist/``.

This is *presentation only*. It reads the committed Markdown the benchmark already
ships — ``LEADERBOARD.md``, ``DATASHEET.md`` and ``README.md`` — and renders them into
a small, self-contained static website (HTML + one CSS file, no JS framework). It does
**not** import or run the ``glassbench`` package, never touches the scorer / data /
pre-registration, and computes nothing: the leaderboard shown on the site is exactly the
committed ``LEADERBOARD.md`` (which is itself the deterministic output of
``scripts/gen_leaderboard.py``), so the site can never disagree with the repo.

Stdlib only — a tiny, deliberately-restricted Markdown subset converter lives here so the
Docker build needs no pip install. Run from anywhere::

    python site/build_site.py            # writes site/dist/{index,leaderboard,datasheet}.html + style.css
    python site/build_site.py --out DIR  # write to a custom output directory

The three source documents map to three pages:
    README.md      -> index.html      (Overview / landing)
    LEADERBOARD.md -> leaderboard.html (the ranked board + diagnostics)
    DATASHEET.md   -> datasheet.html   (the dataset card)
"""

from __future__ import annotations

import argparse
import html
import os
import re
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(_HERE)

# Page registry: (source markdown, output html, nav label, short subtitle).
PAGES = [
    ("README.md", "index.html", "Overview", "Does it know when it didn't?"),
    ("LEADERBOARD.md", "leaderboard.html", "Leaderboard", "GlassBench v0.1 — ranked baselines"),
    ("DATASHEET.md", "datasheet.html", "Datasheet", "Dataset card & construction"),
]

# Links between the source .md files get rewritten so the site cross-links its own pages
# instead of pointing at raw Markdown. Anything not listed keeps its href (and external
# links / repo files just go to GitHub).
MD_TO_PAGE = {
    "README.md": "index.html",
    "LEADERBOARD.md": "leaderboard.html",
    "DATASHEET.md": "datasheet.html",
}

# Repo files that have no site page of their own: link to the source on GitHub so the
# references stay live rather than dangling.
GITHUB_BLOB = "https://github.com/build-with-bala/glassbench/blob/main/"


# --------------------------------------------------------------------------------------
# A small, safe Markdown subset -> HTML converter (stdlib only).
# Supports: ATX headings, GFM tables, fenced code blocks, blockquotes, unordered tables,
# inline code, bold, italic, links, and paragraphs. Everything is HTML-escaped first.
# --------------------------------------------------------------------------------------


def _rewrite_link(href: str) -> str:
    """Point intra-repo Markdown links at the right site page or GitHub source."""
    raw = href.strip()
    if raw.startswith(("http://", "https://", "#", "mailto:")):
        return raw
    # Split off any anchor (e.g. "PRE_REGISTRATION.md#metrics").
    path, _, anchor = raw.partition("#")
    base = os.path.basename(path)
    if base in MD_TO_PAGE:
        return MD_TO_PAGE[base] + (("#" + anchor) if anchor else "")
    # Other repo files (LICENSE, PRE_REGISTRATION.md, data/*, glassbench/*, etc.)
    # -> link to the file on GitHub so the reference is not dead.
    return GITHUB_BLOB + path.lstrip("./") + (("#" + anchor) if anchor else "")


_INLINE_CODE = re.compile(r"`([^`]+)`")
_LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
_BOLD = re.compile(r"\*\*([^*]+)\*\*")
_ITALIC = re.compile(r"(?<![\*\w])\*([^*\n]+)\*(?!\*)")


def _inline(text: str) -> str:
    """Render inline Markdown on an already-HTML-escaped string.

    Code spans are protected first (their content is not re-parsed for bold/italic), then
    links, then bold, then italic. We escape *before* calling this, so the regexes operate
    on escaped text and we only inject our own tags.
    """
    placeholders: list[str] = []

    def _stash(rendered: str) -> str:
        placeholders.append(rendered)
        return f"\x00{len(placeholders) - 1}\x00"

    # Inline code first — its interior must not be touched by the other rules.
    def _code(m: re.Match) -> str:
        return _stash(f"<code>{m.group(1)}</code>")

    text = _INLINE_CODE.sub(_code, text)

    # Links: [label](href) — label may itself contain bold/italic or an already-stashed
    # code span (e.g. [`PRE_REGISTRATION.md`](...)), so render bold/italic and then
    # restore any stashed fragments *inside* the label before emitting the anchor.
    def _link(m: re.Match) -> str:
        label = m.group(1)
        href = html.unescape(m.group(2))  # href was escaped; restore for attribute use
        href = _rewrite_link(href)
        label = _BOLD.sub(r"<strong>\1</strong>", label)
        label = _ITALIC.sub(r"<em>\1</em>", label)
        label = re.sub(r"\x00(\d+)\x00", lambda mm: placeholders[int(mm.group(1))], label)
        return _stash(f'<a href="{html.escape(href, quote=True)}">{label}</a>')

    text = _LINK.sub(_link, text)

    text = _BOLD.sub(r"<strong>\1</strong>", text)
    text = _ITALIC.sub(r"<em>\1</em>", text)

    # Restore stashed code/link fragments.
    def _restore(m: re.Match) -> str:
        return placeholders[int(m.group(1))]

    return re.sub(r"\x00(\d+)\x00", _restore, text)


def _slugify(text: str) -> str:
    s = re.sub(r"<[^>]+>", "", text)  # strip any tags
    s = html.unescape(s)
    s = re.sub(r"[^\w\s-]", "", s).strip().lower()
    return re.sub(r"[\s_]+", "-", s)


def _is_table_sep(line: str) -> bool:
    """A GFM table separator row: | --- | :--: | etc."""
    s = line.strip().strip("|")
    cells = [c.strip() for c in s.split("|")]
    return bool(cells) and all(re.fullmatch(r":?-{1,}:?", c) for c in cells if c != "")


def _split_row(line: str) -> list[str]:
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|"):
        s = s[:-1]
    return [c.strip() for c in s.split("|")]


def _col_aligns(sep_line: str) -> list[str]:
    aligns = []
    for c in _split_row(sep_line):
        left = c.startswith(":")
        right = c.endswith(":")
        if left and right:
            aligns.append("center")
        elif right:
            aligns.append("right")
        else:
            aligns.append("left")
    return aligns


def markdown_to_html(md: str) -> tuple[str, str]:
    """Convert a Markdown subset to an HTML fragment. Returns (html_body, h1_title)."""
    # Escape first; the converter only ever injects its own tags afterwards.
    lines = md.replace("\r\n", "\n").split("\n")
    out: list[str] = []
    h1_title = ""
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i]

        # Fenced code block.
        if line.lstrip().startswith("```"):
            fence_indent = len(line) - len(line.lstrip())
            i += 1
            code_lines = []
            while i < n and not lines[i].lstrip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1  # skip closing fence
            code = html.escape("\n".join(code_lines))
            out.append(f"<pre><code>{code}</code></pre>")
            continue

        # GFM table: a header row followed by a separator row.
        if "|" in line and i + 1 < n and _is_table_sep(lines[i + 1]):
            header = _split_row(line)
            aligns = _col_aligns(lines[i + 1])
            i += 2
            body_rows = []
            while i < n and "|" in lines[i] and lines[i].strip():
                body_rows.append(_split_row(lines[i]))
                i += 1
            out.append('<div class="table-wrap"><table>')
            out.append("<thead><tr>")
            for idx, cell in enumerate(header):
                a = aligns[idx] if idx < len(aligns) else "left"
                out.append(f'<th class="a-{a}">{_inline(html.escape(cell))}</th>')
            out.append("</tr></thead><tbody>")
            for row in body_rows:
                out.append("<tr>")
                for idx, cell in enumerate(row):
                    a = aligns[idx] if idx < len(aligns) else "left"
                    out.append(f'<td class="a-{a}">{_inline(html.escape(cell))}</td>')
                out.append("</tr>")
            out.append("</tbody></table></div>")
            continue

        # Headings.
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            level = len(m.group(1))
            text = _inline(html.escape(m.group(2).strip()))
            slug = _slugify(m.group(2))
            if level == 1 and not h1_title:
                h1_title = re.sub(r"<[^>]+>", "", text)
            out.append(f'<h{level} id="{slug}">{text}</h{level}>')
            i += 1
            continue

        # Blockquote (consume consecutive > lines).
        if line.lstrip().startswith(">"):
            quote_lines = []
            while i < n and lines[i].lstrip().startswith(">"):
                quote_lines.append(re.sub(r"^\s*>\s?", "", lines[i]))
                i += 1
            inner = _inline(html.escape(" ".join(q for q in quote_lines).strip()))
            out.append(f"<blockquote><p>{inner}</p></blockquote>")
            continue

        # Unordered list (consume consecutive - / * items).
        if re.match(r"^\s*[-*]\s+", line):
            items = []
            while i < n and re.match(r"^\s*[-*]\s+", lines[i]):
                item = re.sub(r"^\s*[-*]\s+", "", lines[i])
                items.append(f"<li>{_inline(html.escape(item))}</li>")
                i += 1
            out.append("<ul>" + "".join(items) + "</ul>")
            continue

        # Ordered list.
        if re.match(r"^\s*\d+\.\s+", line):
            items = []
            while i < n and re.match(r"^\s*\d+\.\s+", lines[i]):
                item = re.sub(r"^\s*\d+\.\s+", "", lines[i])
                items.append(f"<li>{_inline(html.escape(item))}</li>")
                i += 1
            out.append("<ol>" + "".join(items) + "</ol>")
            continue

        # Horizontal rule.
        if re.fullmatch(r"\s*([-*_])\1{2,}\s*", line):
            out.append("<hr/>")
            i += 1
            continue

        # Blank line.
        if not line.strip():
            i += 1
            continue

        # Paragraph (gather consecutive non-blank, non-structural lines).
        para = [line]
        i += 1
        while i < n and lines[i].strip() and not (
            lines[i].lstrip().startswith(("#", ">", "```"))
            or re.match(r"^\s*[-*]\s+", lines[i])
            or re.match(r"^\s*\d+\.\s+", lines[i])
            or ("|" in lines[i] and i + 1 < n and _is_table_sep(lines[i + 1]))
        ):
            para.append(lines[i])
            i += 1
        text = _inline(html.escape(" ".join(p.strip() for p in para)))
        out.append(f"<p>{text}</p>")

    return "\n".join(out), h1_title


# --------------------------------------------------------------------------------------
# Page shell
# --------------------------------------------------------------------------------------


def _nav(active_html: str) -> str:
    links = []
    for _src, out_html, label, _sub in PAGES:
        cls = ' class="active"' if out_html == active_html else ""
        links.append(f'<a href="{out_html}"{cls}>{label}</a>')
    repo = '<a href="https://github.com/build-with-bala/glassbench" class="repo">GitHub ↗</a>'
    return (
        '<header class="site-header"><div class="wrap">'
        '<a href="index.html" class="brand">Glass<span>Bench</span></a>'
        f'<nav>{"".join(links)}{repo}</nav>'
        "</div></header>"
    )


def page_shell(*, title: str, subtitle: str, active_html: str, body: str) -> str:
    nav = _nav(active_html)
    safe_title = html.escape(title)
    safe_sub = html.escape(subtitle)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="description" content="GlassBench — a benchmark for whether a memory-equipped LLM system knows when it doesn't know. {safe_sub}"/>
<title>{safe_title} · GlassBench</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%2311161f'/%3E%3Crect x='7' y='7' width='18' height='18' rx='3' fill='none' stroke='%2357c7e3' stroke-width='2.4'/%3E%3Cpath d='M9 12 L23 20' stroke='%2357c7e3' stroke-width='1.6' opacity='0.55'/%3E%3C/svg%3E"/>
<link rel="stylesheet" href="style.css"/>
</head>
<body>
{nav}
<main class="wrap content">
{body}
</main>
<footer class="site-footer"><div class="wrap">
<p>GlassBench is released under the MIT License · Derived from
<a href="https://github.com/xiaowu0162/LongMemEval">LongMemEval</a> (ICLR 2025, MIT).</p>
<p>This page renders the committed <code>{html.escape(active_html.replace('.html', '.md').replace('index.md', 'README.md'))}</code>
verbatim — it does not recompute any score.</p>
</div></footer>
</body>
</html>
"""


STYLE_CSS = """\
/* GlassBench static site — single stylesheet, no framework. */
:root {
  --bg: #0c0f14;
  --panel: #11161f;
  --panel-2: #161d28;
  --border: #243040;
  --ink: #e7ecf3;
  --muted: #9fb0c3;
  --faint: #6b7c91;
  --accent: #57c7e3;
  --accent-2: #8fe3a8;
  --warn: #f0a868;
  --max: 900px;
  --radius: 12px;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: radial-gradient(1200px 600px at 50% -200px, #16202e 0%, var(--bg) 60%) no-repeat;
  background-attachment: fixed;
  color: var(--ink);
  font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: var(--max); margin: 0 auto; padding: 0 20px; }

/* Header / nav */
.site-header {
  position: sticky; top: 0; z-index: 10;
  background: rgba(12,15,20,0.82);
  backdrop-filter: saturate(140%) blur(10px);
  border-bottom: 1px solid var(--border);
}
.site-header .wrap { display: flex; align-items: center; justify-content: space-between; height: 60px; }
.brand { font-weight: 700; font-size: 1.25rem; letter-spacing: -0.02em; text-decoration: none; color: var(--ink); }
.brand span { color: var(--accent); }
.site-header nav { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.site-header nav a {
  color: var(--muted); text-decoration: none; padding: 7px 12px; border-radius: 8px;
  font-size: 0.95rem; transition: background .15s, color .15s;
}
.site-header nav a:hover { color: var(--ink); background: var(--panel-2); }
.site-header nav a.active { color: var(--ink); background: var(--panel-2); }
.site-header nav a.repo { color: var(--accent); }

/* Content */
.content { padding: 40px 20px 80px; }
.content h1 { font-size: 2.1rem; line-height: 1.15; letter-spacing: -0.03em; margin: 0.2em 0 0.5em; }
.content h2 { font-size: 1.5rem; letter-spacing: -0.02em; margin: 2em 0 0.6em; padding-bottom: 0.3em; border-bottom: 1px solid var(--border); }
.content h3 { font-size: 1.18rem; margin: 1.6em 0 0.5em; color: var(--ink); }
.content h4 { font-size: 1.02rem; margin: 1.4em 0 0.4em; color: var(--muted); text-transform: none; }
.content p { color: var(--ink); }
.content a { color: var(--accent); text-decoration: none; border-bottom: 1px solid transparent; }
.content a:hover { border-bottom-color: var(--accent); }
.content ul, .content ol { padding-left: 1.4em; }
.content li { margin: 0.25em 0; }
.content strong { color: #fff; }
.content em { color: var(--muted); }
hr { border: 0; border-top: 1px solid var(--border); margin: 2.4em 0; }

/* Code */
code {
  font-family: "SF Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.86em; background: var(--panel-2); border: 1px solid var(--border);
  border-radius: 5px; padding: 0.1em 0.4em; color: var(--accent-2);
}
pre {
  background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 16px 18px; overflow-x: auto; margin: 1.2em 0;
}
pre code { background: none; border: 0; padding: 0; color: var(--ink); font-size: 0.84rem; line-height: 1.55; }

/* Blockquote */
blockquote {
  margin: 1.4em 0; padding: 2px 18px; border-left: 3px solid var(--accent);
  background: linear-gradient(90deg, rgba(87,199,227,0.08), transparent);
  border-radius: 0 8px 8px 0;
}
blockquote p { color: var(--muted); }
blockquote strong { color: var(--ink); }

/* Tables (leaderboard) */
.table-wrap { overflow-x: auto; margin: 1.3em 0; border: 1px solid var(--border); border-radius: var(--radius); }
table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
thead th {
  background: var(--panel-2); color: var(--muted); font-weight: 600; text-align: left;
  padding: 11px 14px; border-bottom: 1px solid var(--border); white-space: nowrap;
}
tbody td { padding: 10px 14px; border-bottom: 1px solid rgba(36,48,64,0.6); }
tbody tr:last-child td { border-bottom: 0; }
tbody tr:nth-child(odd) { background: rgba(255,255,255,0.012); }
tbody tr:hover { background: rgba(87,199,227,0.06); }
td.a-right, th.a-right { text-align: right; font-variant-numeric: tabular-nums; }
td.a-center, th.a-center { text-align: center; }
tbody tr td:first-child { color: var(--faint); }
tbody tr td:nth-child(2) { color: var(--ink); font-weight: 600; }
tbody tr td code { font-size: 0.82em; }

/* Hero (overview page) */
.hero {
  text-align: center; padding: 30px 0 10px;
}
.hero .eyebrow { color: var(--accent); font-size: 0.85rem; letter-spacing: 0.12em; text-transform: uppercase; }

@media (max-width: 620px) {
  .content h1 { font-size: 1.7rem; }
  .site-header .wrap { height: auto; padding-top: 8px; padding-bottom: 8px; flex-direction: column; gap: 6px; }
}

/* Footer */
.site-footer { border-top: 1px solid var(--border); padding: 28px 0; color: var(--faint); font-size: 0.85rem; }
.site-footer a { color: var(--muted); }
.site-footer p { margin: 0.3em 0; }
"""


def build(out_dir: str) -> None:
    os.makedirs(out_dir, exist_ok=True)

    for src_name, out_html, label, subtitle in PAGES:
        src_path = os.path.join(_REPO_ROOT, src_name)
        if not os.path.exists(src_path):
            sys.stderr.write(f"::warning:: source {src_name} missing — skipping {out_html}\n")
            continue
        with open(src_path, "r", encoding="utf-8") as fh:
            md = fh.read()
        body, h1 = markdown_to_html(md)
        title = h1 or label
        page = page_shell(
            title=title or label,
            subtitle=subtitle,
            active_html=out_html,
            body=body,
        )
        with open(os.path.join(out_dir, out_html), "w", encoding="utf-8") as fh:
            fh.write(page)
        sys.stderr.write(f"wrote {out_html} from {src_name}\n")

    with open(os.path.join(out_dir, "style.css"), "w", encoding="utf-8") as fh:
        fh.write(STYLE_CSS)
    sys.stderr.write("wrote style.css\n")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Build the GlassBench static site.")
    p.add_argument(
        "--out",
        default=os.path.join(_HERE, "dist"),
        help="output directory (default: site/dist)",
    )
    args = p.parse_args(argv)
    build(args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
