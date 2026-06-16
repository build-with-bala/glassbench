#!/usr/bin/env python3
"""Build the GlassBench static site into ``site/dist/``.

This is *presentation only*. It renders the public GlassBench site as a small,
self-contained static website (HTML + one CSS file + one vanilla JS file + a
committed ``leaderboard.json`` data file). It does **not** import or run the
``glassbench`` package, never touches the scorer / data / pre-registration, and
computes no scores. The leaderboard numbers shown on the site are the
verified-live values that also appear verbatim in the committed ``LEADERBOARD.md``
(the deterministic output of ``scripts/gen_leaderboard.py``), so the site can
never disagree with the repo.

Stdlib only — a deliberately-restricted Markdown subset converter lives here so
the Docker build needs no pip install and no node/bundler. The chart library
(ECharts) is loaded at runtime from a CDN; everything else is shipped static.

Run from anywhere::

    python site/build_site.py            # -> site/dist/{index,leaderboard,datasheet}.html + style.css + app.js + leaderboard.json
    python site/build_site.py --out DIR  # write to a custom output directory

Outputs:
    index.html       hand-authored interactive Overview (the landing page)
    leaderboard.html hand-authored shell + server-rendered static leaderboard table
    datasheet.html   rendered from the committed DATASHEET.md (restyled, slug-promoted)
    style.css        the shared instrument theme
    app.js           vanilla JS: sortable/filterable board, ECharts figures, the dial
    leaderboard.json the verified leaderboard data (no vestigial `weights` field)
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(_HERE)

GITHUB = "https://github.com/build-with-bala/glassbench"
GITHUB_BLOB = GITHUB + "/blob/main/"
LONGMEMEVAL = "https://github.com/xiaowu0162/longmemeval"

# Page registry: (source markdown | None, output html, nav label).
# Overview + Leaderboard are hand-authored (source None); Datasheet is rendered
# from the committed Markdown so it never drifts from the repo.
NAV = [
    ("index.html", "Overview"),
    ("leaderboard.html", "Leaderboard"),
    ("datasheet.html", "Datasheet"),
]

MD_TO_PAGE = {
    "README.md": "index.html",
    "LEADERBOARD.md": "leaderboard.html",
    "DATASHEET.md": "datasheet.html",
}


# ======================================================================================
# 1. THE VERIFIED LEADERBOARD DATA (single source of truth for the site)
# ======================================================================================
# Every number below is verbatim from the live-verified brief and matches LEADERBOARD.md
# exactly. The scorer's vestigial `weights` field is intentionally ABSENT (DATASHEET §10:
# abandoned additive-draft weights NOT used by the v0.1 composite — must never be shown).

LEADERBOARD_DATA: dict = {
    "benchmark": "GlassBench",
    "version": "0.1",
    "data_file": "data/glassbench_v0.1.jsonl",
    "n_items": 96,
    "split_counts": {"answerable": 43, "stale": 11, "contradiction": 12, "false_premise": 30},
    "primary_metric": "glass_score",
    "primary_metric_label": "Glass Score",
    "primary_metric_range": [0, 100],
    "sort": "desc",
    "headline_metric": "cwr",
    "headline_metric_label": "Confidently-Wrong Rate (CWR)",
    "glass_score_formula": "100 * HM(AnswerableAccuracy, mean(AbstRec_contradiction, AbstRec_false_premise)) * (1 - CWR)",
    "metrics": [
        {"key": "glass_score", "label": "Glass Score", "range": [0, 100], "direction": "higher", "primary": True, "scored": True, "tooltip": "Composite 0-100: harmonic mean of answer & safety pillars, scaled by (1-CWR)."},
        {"key": "cwr", "label": "CWR", "direction": "lower", "headline": True, "scored": True, "tooltip": "Confidently-Wrong Rate: fraction wrong/unsupported at confidence >= 0.70, over all items."},
        {"key": "aurc_norm", "label": "AURC_norm", "direction": "lower", "scored": True, "tooltip": "Normalized area under risk-coverage on answerable items (0=perfect ranker, 1=no selectivity)."},
        {"key": "abst_rec_contradiction", "label": "AbstRec_contra", "direction": "higher", "scored": True, "tooltip": "Abstention recall on the contradiction (retracted-fact) split."},
        {"key": "abst_rec_false_premise", "label": "AbstRec_fp", "direction": "higher", "scored": True, "tooltip": "Abstention recall on the false-premise (never-stated) split."},
        {"key": "ece", "label": "ECE", "direction": "lower", "scored": True, "tooltip": "Pooled, equal-mass 15-bin, bias-corrected expected calibration error over answered items."},
        {"key": "brier", "label": "Brier", "direction": "lower", "scored": True, "tooltip": "Mean (confidence - correct)^2 over answered items."},
        {"key": "cwr_macro", "label": "CWR_macro", "direction": "lower", "scored": False, "diagnostic": True, "tooltip": "Split-balanced CWR (each split weighted equally). Reported only - NOT in Glass Score."},
        {"key": "ece_macro", "label": "ECE_macro", "direction": "lower", "scored": False, "diagnostic": True, "tooltip": "Split-balanced ECE. Reported only - NOT in Glass Score."},
        {"key": "brier_macro", "label": "Brier_macro", "direction": "lower", "scored": False, "diagnostic": True, "tooltip": "Split-balanced Brier. Reported only - NOT in Glass Score."},
        {"key": "answerable_accuracy", "label": "AnswerableAccuracy", "direction": "higher", "scored": False, "diagnostic": True, "tooltip": "Fraction of answerable+stale items answered correctly. The answer pillar A. Reported diagnostic."},
    ],
    "ranked": [
        {
            "rank": 1, "system": "agent_llm",
            "glass_score": 54.34, "cwr": 0.062, "aurc_norm": 0.530,
            "abst_rec_contradiction": 0.92, "abst_rec_false_premise": 0.63,
            "ece": 0.176, "brier": 0.271,
            "cwr_macro": 0.057, "ece_macro": 0.491, "brier_macro": 0.351,
            "answerable_accuracy": 0.463, "answered": 58, "abstained": 38,
            "type": "agentic memory baseline (deterministic heuristic; no LLM API / key)",
            "description": "Genuine imperfect abstention-aware agent: reads only history+query, abstains on explicit retraction cues, extracts queried fact by last-write-wins lexical overlap, abstains when no sentence plausibly contains the target.",
            "reproduce": "python baselines/agent_llm.py",
        },
        {
            "rank": 2, "system": "random_confidence",
            "glass_score": 25.20, "cwr": 0.177, "aurc_norm": 0.767,
            "abst_rec_contradiction": 0.83, "abst_rec_false_premise": 0.40,
            "ece": 0.438, "brier": 0.448,
            "cwr_macro": 0.173, "ece_macro": 0.619, "brier_macro": 0.507,
            "answerable_accuracy": 0.204, "answered": 45, "abstained": 51,
            "type": "calibration-floor baseline",
            "description": "Answers all items with uniform-random confidence. Abstention recall on unanswerable splits is incidental (low random conf treated as abstention), not real routing.",
            "reproduce": "python baselines/random_confidence.py",
        },
        {
            "rank": 3, "system": "bm25_retrieval",
            "glass_score": 6.20, "cwr": 0.510, "aurc_norm": 0.904,
            "abst_rec_contradiction": 0.08, "abst_rec_false_premise": 0.07,
            "ece": 0.462, "brier": 0.475,
            "cwr_macro": 0.581, "ece_macro": 0.622, "brier_macro": 0.522,
            "answerable_accuracy": 0.407, "answered": 92, "abstained": 4,
            "type": "retrieval baseline",
            "description": "Retrieves the best-matching history sentence, maps retrieval score to confidence. Almost never abstains, so it answers retracted/false-premise queries confidently.",
            "reproduce": "python baselines/bm25_retrieval.py",
        },
        {
            "rank": 4, "system": "always_answer",
            "glass_score": 0.00, "cwr": 0.698, "aurc_norm": 0.896,
            "abst_rec_contradiction": 0.00, "abst_rec_false_premise": 0.00,
            "ece": 0.523, "brier": 0.568,
            "cwr_macro": 0.781, "ece_macro": 0.653, "brier_macro": 0.635,
            "answerable_accuracy": 0.537, "answered": 96, "abstained": 0,
            "type": "degenerate baseline (recklessly answers all)",
            "description": "Answers every item (recency) at confidence 0.9. Safety pillar = 0, so Glass = 0. Confidently wrong on 69.8% of items.",
            "reproduce": "python baselines/always_answer.py",
        },
        {
            "rank": 4, "system": "always_abstain",
            "glass_score": 0.00, "cwr": 0.000, "aurc_norm": 1.000,
            "abst_rec_contradiction": 1.00, "abst_rec_false_premise": 1.00,
            "ece": 0.000, "brier": 0.000,
            "cwr_macro": 0.000, "ece_macro": 0.000, "brier_macro": 0.000,
            "answerable_accuracy": 0.000, "answered": 0, "abstained": 96,
            "type": "degenerate baseline (abstains everywhere)",
            "description": "Abstains on everything. Perfect-looking abstention recall and CWR, but AnswerableAccuracy = 0 zeroes the answer pillar, so Glass = 0. Silence earns nothing.",
            "reproduce": "python baselines/always_abstain.py",
        },
    ],
    "references": [
        {
            "system": "abstention_aware_llm",
            "glass_score": 99.07, "cwr": 0.000, "aurc_norm": 0.137,
            "abst_rec_contradiction": 1.00, "abst_rec_false_premise": 1.00,
            "ece": 0.143, "brier": 0.047,
            "cwr_macro": 0.000, "ece_macro": 0.235, "brier_macro": 0.078,
            "answerable_accuracy": 0.981, "answered": 54, "abstained": 42,
            "what_it_is": "oracle: perfect answer/abstain routing (constructed from gold labels)",
            "excluded_reason": "Constructed from gold labels; would be rejected as a real submission. Shown only to mark the top of the scale.",
        },
        {
            "system": "verbalized_confidence_llm",
            "glass_score": 92.17, "cwr": 0.031, "aurc_norm": 0.904,
            "abst_rec_contradiction": 1.00, "abst_rec_false_premise": 1.00,
            "ece": 0.122, "brier": 0.091,
            "cwr_macro": 0.017, "ece_macro": 0.262, "brier_macro": 0.126,
            "answerable_accuracy": 0.907, "answered": 54, "abstained": 42,
            "what_it_is": "constructed: confidence keyed to the split label",
            "excluded_reason": "Confidence bands track the gold split label; no real model does this. Excluded from ranking.",
        },
    ],
    "authors_entry": "Not yet listed by design — added only once external entries exist; will report every split including those it fails.",
    "notes": {
        "tie_handling": "Standard competition ranking on 2-decimal Glass; always_answer and always_abstain tie at rank 4 (both 0.00).",
        "sort_tiebreak": "Glass desc, then AnswerableAccuracy desc, then system name asc.",
        "diagnostics_disclaimer": "cwr_macro / ece_macro / brier_macro / answerable_accuracy are reported-only diagnostics and are NOT part of the Glass Score.",
        "vestigial_weights_warning": "The scorer's JSON still emits a 'weights' field. These are ABANDONED additive-draft weights NOT used by the v0.1 composite. Do NOT display them on the site.",
    },
}

# Defensive: this committed literal must never carry the vestigial `weights` field.
LEADERBOARD_DATA.pop("weights", None)


# ======================================================================================
# 2. Markdown subset -> HTML (stdlib only) — used to render DATASHEET.md
# ======================================================================================


def _rewrite_link(href: str) -> str:
    raw = href.strip()
    if raw.startswith(("http://", "https://", "#", "mailto:")):
        return raw
    path, _, anchor = raw.partition("#")
    base = os.path.basename(path)
    if base in MD_TO_PAGE:
        return MD_TO_PAGE[base] + (("#" + anchor) if anchor else "")
    return GITHUB_BLOB + path.lstrip("./") + (("#" + anchor) if anchor else "")


_INLINE_CODE = re.compile(r"`([^`]+)`")
_LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
_BOLD = re.compile(r"\*\*([^*]+)\*\*")
_ITALIC = re.compile(r"(?<![\*\w])\*([^*\n]+)\*(?!\*)")


def _inline(text: str) -> str:
    placeholders: list[str] = []

    def _stash(rendered: str) -> str:
        placeholders.append(rendered)
        return f"\x00{len(placeholders) - 1}\x00"

    def _code(m: re.Match) -> str:
        return _stash(f"<code>{m.group(1)}</code>")

    text = _INLINE_CODE.sub(_code, text)

    def _link(m: re.Match) -> str:
        label = m.group(1)
        href = html.unescape(m.group(2))
        href = _rewrite_link(href)
        label = _BOLD.sub(r"<strong>\1</strong>", label)
        label = _ITALIC.sub(r"<em>\1</em>", label)
        label = re.sub(r"\x00(\d+)\x00", lambda mm: placeholders[int(mm.group(1))], label)
        return _stash(f'<a href="{html.escape(href, quote=True)}">{label}</a>')

    text = _LINK.sub(_link, text)
    text = _BOLD.sub(r"<strong>\1</strong>", text)
    text = _ITALIC.sub(r"<em>\1</em>", text)

    def _restore(m: re.Match) -> str:
        return placeholders[int(m.group(1))]

    return re.sub(r"\x00(\d+)\x00", _restore, text)


def _slugify(text: str) -> str:
    s = re.sub(r"<[^>]+>", "", text)
    s = html.unescape(s)
    s = re.sub(r"[^\w\s-]", "", s).strip().lower()
    return re.sub(r"[\s_]+", "-", s)


def _is_table_sep(line: str) -> bool:
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


# Slugs we visually promote on the datasheet (candid "tolerances" framing). The
# generator post-processes the rendered HTML to wrap these sections without editing
# the source Markdown.
PROMOTE_SLUGS = {
    "5-the-verbatim-span-integrity-rule": ("integrity", "INTEGRITY RULE — LOAD-BEARING"),
    "7-limitations": ("tolerances", "KNOWN MEASUREMENT ERROR / TOLERANCES"),
}


def markdown_to_html(md: str) -> tuple[str, str]:
    lines = md.replace("\r\n", "\n").split("\n")
    out: list[str] = []
    h1_title = ""
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i]

        if line.lstrip().startswith("```"):
            i += 1
            code_lines = []
            while i < n and not lines[i].lstrip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1
            code = html.escape("\n".join(code_lines))
            out.append(f"<pre><code>{code}</code></pre>")
            continue

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

        if line.lstrip().startswith(">"):
            quote_lines = []
            while i < n and lines[i].lstrip().startswith(">"):
                quote_lines.append(re.sub(r"^\s*>\s?", "", lines[i]))
                i += 1
            inner = _inline(html.escape(" ".join(q for q in quote_lines).strip()))
            out.append(f"<blockquote><p>{inner}</p></blockquote>")
            continue

        if re.match(r"^\s*[-*]\s+", line):
            items = []
            while i < n and re.match(r"^\s*[-*]\s+", lines[i]):
                item = re.sub(r"^\s*[-*]\s+", "", lines[i])
                items.append(f"<li>{_inline(html.escape(item))}</li>")
                i += 1
            out.append("<ul>" + "".join(items) + "</ul>")
            continue

        if re.match(r"^\s*\d+\.\s+", line):
            items = []
            while i < n and re.match(r"^\s*\d+\.\s+", lines[i]):
                item = re.sub(r"^\s*\d+\.\s+", "", lines[i])
                items.append(f"<li>{_inline(html.escape(item))}</li>")
                i += 1
            out.append("<ol>" + "".join(items) + "</ol>")
            continue

        if re.fullmatch(r"\s*([-*_])\1{2,}\s*", line):
            out.append("<hr/>")
            i += 1
            continue

        if not line.strip():
            i += 1
            continue

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


def promote_datasheet_sections(body: str) -> str:
    """Wrap the integrity-rule and limitations sections in candid 'tolerances' panels.

    Keyed purely on the auto-generated heading slug (no Markdown edit). We find the
    promoted ``<h2 id="slug">`` and wrap from that heading up to (but not including)
    the next ``<h2`` in a styled panel with a small eyebrow chip.
    """
    for slug, (kind, eyebrow) in PROMOTE_SLUGS.items():
        pat = re.compile(r'(<h2 id="' + re.escape(slug) + r'">.*?</h2>)')
        m = pat.search(body)
        if not m:
            continue
        start = m.start()
        nxt = body.find("<h2 ", m.end())
        end = nxt if nxt != -1 else len(body)
        section = body[start:end]
        chip = (
            f'<div class="promote-chip promote-{kind}">'
            f'<span class="dot"></span>{html.escape(eyebrow)}</div>'
        )
        wrapped = f'<section class="promote-panel promote-{kind}">{chip}{section}</section>\n'
        body = body[:start] + wrapped + body[end:]
    return body


# ======================================================================================
# 3. Shared page shell (mono instrument chrome)
# ======================================================================================


def _nav(active_html: str) -> str:
    links = []
    for out_html, label in NAV:
        cls = ' aria-current="page" class="active"' if out_html == active_html else ""
        links.append(f'<a href="{out_html}"{cls}>{label}</a>')
    repo = f'<a href="{GITHUB}" class="repo" rel="noopener">GitHub <span aria-hidden="true">&#8599;</span></a>'
    return (
        '<a class="skip-link" href="#main">Skip to content</a>'
        '<header class="site-header"><div class="wrap hdr">'
        '<a href="index.html" class="brand">Glass<span>Bench</span><i class="caret" aria-hidden="true">_</i></a>'
        f'<nav aria-label="Primary">{"".join(links)}{repo}</nav>'
        "</div></header>"
    )


def _footer() -> str:
    return (
        '<footer class="site-footer"><div class="wrap">'
        '<p>GlassBench is released under the MIT License &middot; Derived from '
        f'<a href="{LONGMEMEVAL}" rel="noopener">LongMemEval</a> (ICLR 2025, MIT).</p>'
        '<p class="micro">A diagnostic instrument for whether a memory-equipped LLM '
        'system knows when it doesn\'t know. Every number on this site was measured by '
        f'the open deterministic scorer; nothing here is invented. '
        f'<a href="{GITHUB}" rel="noopener">Source on GitHub</a>.</p>'
        "</div></footer>"
    )


def page_shell(*, title: str, subtitle: str, active_html: str, body: str,
               extra_head: str = "", extra_body: str = "", main_class: str = "wrap") -> str:
    nav = _nav(active_html)
    footer = _footer()
    safe_title = html.escape(title)
    safe_sub = html.escape(subtitle)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="color-scheme" content="dark"/>
<meta name="description" content="GlassBench — a benchmark for whether a memory-equipped LLM system knows when it doesn't know. {safe_sub}"/>
<meta property="og:title" content="{safe_title} · GlassBench"/>
<meta property="og:description" content="Every memory benchmark asks did it remember? GlassBench asks: does it know when it didn't?"/>
<title>{safe_title} · GlassBench</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%2311161f'/%3E%3Crect x='7' y='7' width='18' height='18' rx='3' fill='none' stroke='%2357c7e3' stroke-width='2.4'/%3E%3Cpath d='M9 12 L23 20' stroke='%2357c7e3' stroke-width='1.6' opacity='0.55'/%3E%3C/svg%3E"/>
<link rel="stylesheet" href="style.css"/>
{extra_head}</head>
<body>
{nav}
<main id="main" class="{main_class} content">
{body}
</main>
{footer}
{extra_body}</body>
</html>
"""


# ======================================================================================
# 4. Number formatting helpers (precision matched to the JSON exactly)
# ======================================================================================

# 2-dp metrics: glass + abstention recalls. 3-dp metrics: cwr/aurc/ece/brier +
# answerable_accuracy (the answer pillar A — carried at 3-dp in LEADERBOARD.md / the JSON).
_FMT2 = {"glass_score", "abst_rec_contradiction", "abst_rec_false_premise"}
_FMT3 = {"cwr", "aurc_norm", "ece", "brier", "cwr_macro", "ece_macro", "brier_macro", "answerable_accuracy"}


def fmt_metric(key: str, val) -> str:
    if val is None:
        return "—"
    if key in _FMT2:
        return f"{val:.2f}"
    if key in _FMT3:
        return f"{val:.3f}"
    return str(val)


def _system_class(type_str: str) -> str:
    """Map a row's free-text `type` to a category used by the type filter."""
    t = type_str.lower()
    if "degenerate" in t:
        return "degenerate"
    if "agentic" in t:
        return "genuine"
    return "baseline"


# ======================================================================================
# 5. Server-rendered leaderboard table (works with JS off / CDN blocked)
# ======================================================================================

SCORED_COLS = [
    ("glass_score", "Glass", ""),
    ("cwr", "CWR", "↓"),
    ("aurc_norm", "AURC_norm", "↓"),
    ("abst_rec_contradiction", "AbstRec_contra", "↑"),
    ("abst_rec_false_premise", "AbstRec_fp", "↑"),
    ("ece", "ECE", "↓"),
    ("brier", "Brier", "↓"),
]


def _metric_meta() -> dict:
    return {m["key"]: m for m in LEADERBOARD_DATA["metrics"]}


def _col_minmax(rows: list[dict], key: str) -> tuple[float, float]:
    vals = [r[key] for r in rows if r.get(key) is not None]
    if not vals:
        return 0.0, 1.0
    return min(vals), max(vals)


def render_static_table() -> str:
    """Server-render the ranked board as a semantic, accessible static <table>.

    JS later enhances this (sort/filter/charts/cross-highlight) but is NOT required
    to read it. Data-bar widths/goodness are pre-computed here so the bars are
    legible even with JS and the CDN both unavailable.
    """
    meta = _metric_meta()
    rows = LEADERBOARD_DATA["ranked"]

    # Precompute per-column [min,max] over the ranked rows for data-bar scaling.
    bounds = {key: _col_minmax(rows, key) for key, _l, _a in SCORED_COLS}

    head_cells = ['<th class="c-rank" scope="col">#</th>',
                  '<th class="c-sys" scope="col">System</th>']
    for key, label, arrow in SCORED_COLS:
        tip = html.escape(meta[key]["tooltip"], quote=True)
        arr = f' <span class="dir" aria-hidden="true">{arrow}</span>' if arrow else ""
        head_cells.append(
            f'<th class="c-num" scope="col" data-key="{key}" '
            f'aria-sort="none">'
            f'<button type="button" class="th-sort" title="{tip}" aria-describedby="tip-{key}">'
            f'{html.escape(label)}{arr}<span class="sort-ind" aria-hidden="true"></span></button>'
            f'<span id="tip-{key}" class="vh">{tip}</span></th>'
        )
    thead = "<thead><tr>" + "".join(head_cells) + "</tr></thead>"

    body_parts = []
    for r in rows:
        sysname = r["system"]
        is_agent = sysname == "agent_llm"
        cls = "lb-row" + (" is-genuine" if is_agent else "")
        flag = ('<span class="genuine-flag" title="The only genuine selective router">'
                '&#9664; ONLY GENUINE ROUTER</span>') if is_agent else ""
        cat = _system_class(r["type"])
        cells = [f'<td class="c-rank">{r["rank"]}</td>',
                 f'<td class="c-sys"><span class="sys-name">{html.escape(sysname)}</span>{flag}</td>']
        for key, _label, _arrow in SCORED_COLS:
            val = r[key]
            mn, mx = bounds[key]
            span = (mx - mn) or 1.0
            norm = (val - mn) / span  # 0..1 position within column
            direction = meta[key]["direction"]
            goodness = norm if direction == "higher" else 1.0 - norm
            # Bar width: for glass use absolute 0..100 scale; else use column-normalized.
            if key == "glass_score":
                width = max(0.0, min(1.0, val / 100.0))
                ramp = "cyan"
            else:
                width = max(0.04, norm) if mx != mn else 0.5
                ramp = ("good" if goodness >= 0.66 else "warn" if goodness >= 0.33 else "bad")
            disp = fmt_metric(key, val)
            cells.append(
                f'<td class="c-num" data-key="{key}" data-val="{val}" '
                f'data-goodness="{goodness:.4f}">'
                f'<span class="bar bar-{ramp}" style="width:{width * 100:.1f}%"></span>'
                f'<span class="num">{disp}</span></td>'
            )
        row_html = f'<tr class="{cls}" data-system="{html.escape(sysname)}" data-cat="{cat}" tabindex="0" aria-expanded="false">' + "".join(cells) + "</tr>"
        # Detail drawer row (revealed by JS; statically present for no-JS readers).
        detail = (
            f'<tr class="lb-detail" data-detail-for="{html.escape(sysname)}">'
            f'<td colspan="9"><div class="detail-inner">'
            f'<p class="detail-type"><span class="k">type</span> {html.escape(r["type"])}</p>'
            f'<p class="detail-desc">{html.escape(r["description"])}</p>'
            f'<div class="detail-repro"><span class="k">reproduce</span>'
            f'<code class="cmd">{html.escape(r["reproduce"])}</code>'
            f'<button type="button" class="copy-btn" data-copy="{html.escape(r["reproduce"], quote=True)}">copy</button>'
            f'</div></div></td></tr>'
        )
        body_parts.append(row_html + detail)

    # Authors'-absence ghost row.
    ghost = (
        '<tr class="lb-ghost"><td colspan="9">'
        '— AUTHORS&#39; SYSTEM: not listed by design until external entries exist —'
        '</td></tr>'
    )
    tbody = "<tbody>" + "".join(body_parts) + ghost + "</tbody>"

    caption = (
        '<caption class="vh">GlassBench ranked leaderboard, sorted by Glass Score '
        'descending. Higher Glass Score is better.</caption>'
    )
    return (
        '<div class="table-wrap" id="board-wrap">'
        '<table class="lb-table" id="lb-table">'
        + caption + thead + tbody +
        "</table></div>"
    )


def render_diagnostics_table() -> str:
    """Static diagnostics table (hidden by default; revealed by the JS drawer toggle)."""
    rows = LEADERBOARD_DATA["ranked"]
    cols = [("cwr_macro", "CWR_macro", "↓"), ("ece_macro", "ECE_macro", "↓"),
            ("brier_macro", "Brier_macro", "↓"), ("answerable_accuracy", "AnswerableAccuracy", "↑")]
    head = "".join(
        f'<th class="c-num" scope="col">{html.escape(l)} '
        f'<span class="dir" aria-hidden="true">{a}</span></th>' for _k, l, a in cols
    )
    body = []
    for r in rows:
        cells = [f'<td class="c-sys">{html.escape(r["system"])}</td>']
        cells += [f'<td class="c-num"><span class="num">{fmt_metric(k, r[k])}</span></td>' for k, _l, _a in cols]
        cells.append(f'<td class="c-num"><span class="num">{r["answered"]} / {r["abstained"]}</span></td>')
        body.append("<tr>" + "".join(cells) + "</tr>")
    return (
        '<div class="diag-panel" id="diag-panel" hidden>'
        '<div class="diag-tag"><span class="dot"></span>REPORTED — NOT SCORED · '
        'split-balanced diagnostics, not part of the Glass Score</div>'
        '<div class="table-wrap"><table class="lb-table diag-table">'
        '<thead><tr><th scope="col" class="c-sys">System</th>' + head +
        '<th class="c-num" scope="col">answered / abstained</th></tr></thead>'
        '<tbody>' + "".join(body) + '</tbody></table></div></div>'
    )


def render_ceiling_band() -> str:
    """Reference ceilings (constructed-from-gold). Off by default, toggled by a chip."""
    cards = []
    for ref in LEADERBOARD_DATA["references"]:
        cards.append(
            f'<div class="ceiling-card">'
            f'<div class="ceiling-head">'
            f'<span class="ceiling-name">{html.escape(ref["system"])}</span>'
            f'<span class="ceiling-glass">{fmt_metric("glass_score", ref["glass_score"])}'
            f'<small>Glass</small></span></div>'
            f'<span class="not-ranked-tag">NOT RANKED — constructed from gold</span>'
            f'<p class="ceiling-what">{html.escape(ref["what_it_is"])}</p>'
            f'<details class="ceiling-why"><summary>why excluded</summary>'
            f'<p>{html.escape(ref["excluded_reason"])}</p></details>'
            f'</div>'
        )
    return (
        '<section class="ceiling-band" id="ceiling-band" hidden>'
        '<div class="ceiling-bezel">'
        '<h2 class="ceiling-title">Reference ceilings <span class="ceiling-sub">'
        'constructed from gold labels · top of the scale · never ranked</span></h2>'
        '<div class="ceiling-grid">' + "".join(cards) + '</div></div></section>'
    )


# ======================================================================================
# 6. HERO CWR strip (inline SVG/HTML — paints instantly, zero CDN dependency)
# ======================================================================================


def _cwr_ramp_class(cwr: float) -> str:
    # Lower CWR is better. green < ~0.18, amber < ~0.5, red >= ~0.5.
    if cwr < 0.18:
        return "good"
    if cwr < 0.5:
        return "warn"
    return "bad"


def render_cwr_strip() -> str:
    """The hero measurement scale: every ranked system plotted at its CWR on 0.000..0.700.

    Pure HTML/CSS (absolutely-positioned ticks) so it paints with zero dependency.
    Lower is better; agent_llm near 0 (green), always_answer pinned right (red).
    """
    axis_max = 0.70
    rows = sorted(LEADERBOARD_DATA["ranked"], key=lambda r: r["cwr"])
    # Collapse duplicate CWR (the two 0.000? only always_abstain is 0). Stagger labels
    # by alternating above/below to avoid overlap.
    ticks = []
    n_ticks = len(rows)
    for idx, r in enumerate(rows):
        cwr = r["cwr"]
        pct = min(100.0, cwr / axis_max * 100.0)
        ramp = _cwr_ramp_class(cwr)
        side = "above" if idx % 2 == 0 else "below"
        # Anchor the extreme labels to their own edge (left-align the first tick's label,
        # right-align the last tick's) so the centered nowrap labels can't run off the
        # track or overprint the BETTER / WORSE end captions.
        edge = ""
        if idx == 0:
            edge = " cwr-edge-l"
        elif idx == n_ticks - 1:
            edge = " cwr-edge-r"
        ticks.append(
            f'<div class="cwr-tick cwr-{ramp} cwr-{side}{edge}" style="left:{pct:.2f}%" '
            f'data-system="{html.escape(r["system"])}">'
            f'<span class="cwr-dot"></span>'
            f'<span class="cwr-lab"><b>{html.escape(r["system"])}</b>'
            f'<span class="cwr-val">{fmt_metric("cwr", cwr)}</span></span>'
            f'</div>'
        )
    # End captions carry direction only (BETTER / WORSE). The redundant 0.000 / 0.700
    # numerals were dropped: they collided with the extreme tick labels and the green/red
    # direction captions already convey the scale.
    return (
        '<figure class="cwr-strip" aria-labelledby="cwr-cap">'
        '<div class="cwr-scale-wrap">'
        '<div class="cwr-scanline" aria-hidden="true"></div>'
        '<div class="cwr-axis">'
        '<span class="cwr-end cwr-end-l"><small>BETTER</small></span>'
        '<div class="cwr-track">' + "".join(ticks) + '</div>'
        '<span class="cwr-end cwr-end-r"><small>WORSE</small></span>'
        '</div></div>'
        '<figcaption id="cwr-cap" class="figcap">Confidently-Wrong Rate across all '
        'ranked systems, plotted 0.000 (left) to 0.700 (right). Lower is better. '
        'Most systems have never measured this axis.'
        '</figcaption></figure>'
    )


# ======================================================================================
# 7. OVERVIEW page body (hand-authored; verbatim copy; real numbers)
# ======================================================================================


def render_four_splits() -> str:
    sc = LEADERBOARD_DATA["split_counts"]
    cells = [
        ("answerable", sc["answerable"], "fact is determinable from history",
         "ANSWER · high conf", "a string", "ans"),
        ("stale", sc["stale"], "a fact stated long ago that may have drifted; query targets the old value",
         "ANSWER · conf reflects age", "the old string", "stale"),
        ("contradiction", sc["contradiction"], "a fact was asserted then retracted with no replacement",
         "ABSTAIN", "ABSTAIN", "unans"),
        ("false-premise", sc["false_premise"], "query asks about something never stated",
         "ABSTAIN", "ABSTAIN", "unans"),
    ]
    cards = []
    for name, count, defn, chip, gold, kind in cells:
        chip_cls = "chip-abstain" if chip == "ABSTAIN" else ("chip-stale" if kind == "stale" else "chip-answer")
        cards.append(
            f'<div class="split-card split-{kind}">'
            f'<div class="split-top"><span class="split-name">{html.escape(name)}</span>'
            f'<span class="split-count">{count}</span></div>'
            f'<p class="split-def">{html.escape(defn)}</p>'
            f'<div class="split-foot">'
            f'<span class="honest-chip {chip_cls}">{html.escape(chip)}</span>'
            f'<span class="split-gold">gold: <code>{html.escape(gold)}</code></span>'
            f'</div></div>'
        )
    unans = sc["contradiction"] + sc["false_premise"]
    unans_pct = unans / LEADERBOARD_DATA["n_items"] * 100.0
    return (
        '<section id="the-four-splits" class="ov-section">'
        '<div class="eyebrow">04 · THE TASK</div>'
        '<h2>Four ways to be tested</h2>'
        '<p class="lede">Each item is a multi-session conversation plus a query. An honest '
        'system answers two of these splits and stays silent on the other two. '
        'The hard part is knowing which is which.</p>'
        '<div class="split-matrix">'
        f'<div class="split-group answerable-group">{cards[0]}{cards[1]}'
        '<div class="group-label group-answerable">ANSWERABLE GROUP — 54 items</div></div>'
        f'<div class="split-group unanswerable-group">{cards[2]}{cards[3]}'
        f'<div class="group-label group-unanswerable">UNANSWERABLE GROUP — {unans} items ({unans_pct:.1f}%) · these should abstain</div></div>'
        '</div>'
        '<div class="worked-example">'
        '<div class="we-eyebrow">ONE FACT · THREE READINGS</div>'
        '<div class="we-flow">'
        '<div class="we-step we-ans"><span class="we-split">answerable</span>'
        '<p>&ldquo;Where do I keep my old sneakers?&rdquo;</p>'
        '<span class="we-arrow">→</span><b class="we-gold">&ldquo;under my bed&rdquo;</b></div>'
        '<div class="we-step we-stale"><span class="we-split">stale</span>'
        '<p>same fact, asked long after it may have drifted</p>'
        '<span class="we-arrow">→</span><b class="we-gold">the old string, conf should reflect age</b></div>'
        '<div class="we-step we-contra"><span class="we-split">contradiction</span>'
        '<p>that fact is explicitly retracted, no replacement</p>'
        '<span class="we-arrow">→</span><b class="we-gold we-abstain">ABSTAIN</b></div>'
        '</div>'
        '<p class="we-note">Item <code>gb-contradiction-07741c44</code> is the retraction of '
        '<code>gb-stale-07741c44</code>. One input, three correct readings — only one of them '
        'is &ldquo;answer it.&rdquo;</p>'
        '</div>'
        '</section>'
    )


def render_metrics_schematic() -> str:
    return (
        '<section id="metrics" class="ov-section">'
        '<div class="eyebrow">05 · THE INSTRUMENT</div>'
        '<h2>How the Glass Score is computed</h2>'
        '<p class="lede">Two pillars feed a harmonic-mean junction, scaled by a '
        'confident-wrong penalty. The harmonic mean is zero if either pillar is zero, '
        'so you cannot trade one for the other.</p>'
        '<div class="schematic">'
        '<div class="gauge-col">'
        '<div class="gauge"><span class="gauge-eye">ANSWER PILLAR · A</span>'
        '<span class="gauge-formula">AnswerableAccuracy</span>'
        '<span class="gauge-note">did you get the answerable ones right?</span></div>'
        '<div class="gauge"><span class="gauge-eye">SAFETY PILLAR · S</span>'
        '<span class="gauge-formula">mean(AbstRec_contra, AbstRec_fp)</span>'
        '<span class="gauge-note">did you stay silent when you should?</span></div>'
        '</div>'
        '<div class="schematic-flow" aria-hidden="true">'
        '<span class="flow-junction">HM</span>'
        '<span class="flow-mult">× (1 − CWR)</span>'
        '</div>'
        '<div class="glass-out">'
        '<span class="glass-out-eye">GLASS SCORE</span>'
        '<span class="glass-out-range">0 — 100</span>'
        '</div>'
        '</div>'
        '<pre class="formula-block"><code>'
        'A     = AnswerableAccuracy\n'
        'S     = mean(AbstRec_contradiction, AbstRec_false_premise)\n'
        'HM    = 2·A·S / (A + S)        (0 if either pillar is 0)\n'
        'Glass = 100 · HM · (1 − CWR)'
        '</code></pre>'
        '<p class="schematic-note"><b>Harmonic mean → 0 if either pillar is 0.</b> '
        'You cannot trade one for the other.</p>'
        '</section>'
    )


def render_confidence_dial() -> str:
    # Static fallback table (verified facts only).
    return (
        '<section id="game-it" class="ov-section dial-section">'
        '<div class="eyebrow">06 · TRY TO GAME IT</div>'
        '<h2>There is no single confidence that games both pillars</h2>'
        '<p class="lede">Set the dial anywhere. The Glass Score will not move off '
        '<code>0.00</code> for any answer-everything strategy — because the scorer applies a '
        '<b>single answer/abstain decision</b>. Below 0.5 zeroes the answer pillar; at or '
        'above 0.5 zeroes the safety pillar.</p>'
        '<div class="dial-rig">'
        '<div class="dial-left">'
        '<div class="dial-svg-wrap">'
        '<svg id="conf-dial" viewBox="0 0 240 160" role="img" '
        'aria-label="A confidence dial from 0.00 to 1.00 with a needle.">'
        '<!-- rendered/animated by app.js; static arc here for no-JS -->'
        '<path class="dial-arc" d="M30 140 A 90 90 0 0 1 210 140" fill="none"/>'
        '<g class="dial-ticks"></g>'
        '<line class="dial-needle" x1="120" y1="140" x2="120" y2="60"/>'
        '<circle class="dial-hub" cx="120" cy="140" r="6"/>'
        '</svg></div>'
        '<label class="dial-range-lab" for="conf-range">Stated confidence</label>'
        '<input type="range" id="conf-range" min="0" max="1" step="0.01" value="0.69" '
        'aria-label="Stated confidence from 0 to 1"/>'
        '<output id="conf-out" class="dial-output-val">0.69</output>'
        '<div class="dial-presets">'
        '<button type="button" class="preset-btn" data-preset="abstain">ALWAYS ABSTAIN</button>'
        '<button type="button" class="preset-btn" data-preset="answer">ALWAYS ANSWER</button>'
        '<button type="button" class="preset-btn" data-preset="fake">FIXED-CONF FAKE</button>'
        '</div></div>'
        '<div class="dial-right">'
        '<div class="dial-readout" id="dial-readout">'
        '<span class="dial-readout-eye">GLASS SCORE</span>'
        '<span class="dial-readout-num" id="dial-glass">0.00</span></div>'
        '<p class="dial-explain" id="dial-explain">'
        'answers everything confidently → safety pillar = 0 → Glass 0.00</p>'
        '<div class="dial-detents"><span>detents:</span> '
        '<code>0.49</code> <code>0.60</code> <code>0.69</code> — all verified 0.00</div>'
        '</div></div>'
        '<p class="dial-thesis">There is no single confidence that games both pillars. '
        '<b>Try.</b></p>'
        '<noscript><table class="dial-fallback"><caption>Verified results without JavaScript'
        '</caption><thead><tr><th>strategy</th><th>Glass</th><th>why</th></tr></thead><tbody>'
        '<tr><td>always_abstain</td><td>0.00</td><td>answer pillar = 0 — silence earns nothing</td></tr>'
        '<tr><td>always_answer</td><td>0.00</td><td>safety pillar = 0 — reckless answering earns nothing</td></tr>'
        '<tr><td>fixed conf 0.49</td><td>0.00</td><td>&lt; 0.5 counts as abstain everywhere → answer pillar = 0</td></tr>'
        '<tr><td>fixed conf 0.60 / 0.69</td><td>0.00</td><td>&ge; 0.5 → answers everything → safety pillar = 0</td></tr>'
        '</tbody></table></noscript>'
        '</section>'
    )


def render_trust_band() -> str:
    bullets = [
        ('real public data', 'Derived entirely from LongMemEval (Wu et al., ICLR 2025, MIT) — established, peer-reviewed.'),
        ('hard for everyone', 'Includes splits hard across architectures: false-premise stresses calibration, not just retrieval.'),
        ('standard metrics', 'CWR, AURC, ECE, Brier, abstention recall — nothing invented to flatter one architecture.'),
        ('frozen before scoring', 'The design was pre-registered and git-tagged before any system was scored.'),
        ('open deterministic scorer', 'Two runs are byte-identical. You can reproduce every number on this page.'),
        ('authors not on the board', "The authors' own system is intentionally excluded until external entries exist."),
    ]
    items = "".join(
        f'<li><b>{html.escape(h)}</b><span>{html.escape(d)}</span></li>' for h, d in bullets
    )
    return (
        '<section id="why-this-is-fair-read-this-first" class="ov-section trust-band">'
        '<div class="cert-plate">'
        '<div class="cert-head"><div class="eyebrow">03 · READ THIS FIRST</div>'
        '<h2>Why you can trust the number</h2>'
        f'<a class="serial-sticker" href="{GITHUB_BLOB}PRE_REGISTRATION.md" rel="noopener">'
        '<span class="serial-eye">CALIBRATION TAG</span>'
        '<span class="serial-no">v0.1-prereg</span></a></div>'
        f'<ul class="cert-list">{items}</ul>'
        '</div></section>'
    )


def render_methodology() -> str:
    steps = [
        ("Get the data", "python -m glassbench.build_data",
         "Reproduces the committed JSONL byte-for-byte. Use only id, history, query at inference — reading gold_answer is rejected."),
        ("Produce predictions", "predictions.json",
         "A JSON array, one row per id: {\"id\",\"answer\",\"confidence\"} or {\"id\",\"abstain\":true}. Missing items score as abstentions."),
        ("Validate", "python scripts/validate_submission.py submissions/<system>/predictions.json",
         "Catches duplicate ids and malformed rows before you score."),
        ("Score locally", "python -m glassbench.score --predictions submissions/<system>/predictions.json",
         "Prints all six components + Glass + diagnostics. Two runs byte-identical."),
        ("Open a PR", "submissions/<system>/{predictions.json, system.md}",
         "CI runs the scorer; a maintainer merges when green. Folder name (short, lowercase, hyphenless) becomes the leaderboard row."),
    ]
    rows = []
    for idx, (title, cmd, desc) in enumerate(steps, 1):
        is_cmd = cmd.startswith("python")
        cmd_html = (
            f'<div class="step-cmd"><code class="cmd">{html.escape(cmd)}</code>'
            f'<button type="button" class="copy-btn" data-copy="{html.escape(cmd, quote=True)}">copy</button></div>'
            if is_cmd else f'<div class="step-cmd"><code class="cmd cmd-file">{html.escape(cmd)}</code></div>'
        )
        rows.append(
            f'<li class="step"><span class="step-no">{idx:02d}</span>'
            f'<div class="step-body"><h3 class="step-title">{html.escape(title)}</h3>'
            f'{cmd_html}<p class="step-desc">{html.escape(desc)}</p></div></li>'
        )
    bibtex = (
        "@misc{glassbench2025,\n"
        "  title  = {GlassBench: Does Your Memory System Know When It Didn't Know?},\n"
        "  author = {build-with-bala},\n"
        "  year   = {2025},\n"
        "  note   = {Derived from LongMemEval (Wu et al., ICLR 2025)},\n"
        "  url    = {https://github.com/build-with-bala/glassbench}\n"
        "}"
    )
    return (
        '<section id="the-task" class="ov-section method-section">'
        '<span id="quickstart"></span><span id="submit"></span>'
        '<div class="eyebrow">07 · METHODOLOGY</div>'
        '<h2>How to submit a system</h2>'
        '<p class="lede">Five steps, fully reproducible, deterministic end to end. '
        'You read only the conversation and the query — never the gold label.</p>'
        f'<ol class="step-list">{"".join(rows)}</ol>'
        '<div class="cite-block">'
        '<div class="cite-head"><span class="eyebrow">CITE</span>'
        '<button type="button" class="copy-btn" data-copy="' + html.escape(bibtex, quote=True) + '">copy BibTeX</button></div>'
        f'<pre><code>{html.escape(bibtex)}</code></pre>'
        '<p class="cite-credit">GlassBench &middot; MIT License. Derived from '
        f'<a href="{LONGMEMEVAL}" rel="noopener">LongMemEval</a> (ICLR 2025, MIT).</p>'
        '</div></section>'
    )


def render_hero() -> str:
    lead = LEADERBOARD_DATA["ranked"][0]
    # Best CWR among systems that actually answer (always_abstain's 0.000 is trivial — it
    # never answers, so it has nothing to be confidently wrong about). This surfaces the
    # genuine leader's 0.062, matching the headline-failure story.
    best_cwr = min(r["cwr"] for r in LEADERBOARD_DATA["ranked"] if r["answered"] > 0)
    return (
        '<section id="top" class="hero">'
        '<div class="hero-panel">'
        '<div class="hero-q">'
        '<p class="hero-q1">Every memory benchmark asks &ldquo;did it remember?&rdquo;</p>'
        '<h1 class="hero-q2">GlassBench asks: <span class="hl">does it know when it didn&rsquo;t?</span></h1>'
        '</div>'
        + render_cwr_strip() +
        '<div class="hero-stats">'
        f'<div class="stat stat-cyan"><span class="stat-eye">GLASS LEADER</span>'
        f'<span class="stat-num" data-countup="{lead["glass_score"]}" data-dp="2">0.00</span></div>'
        f'<div class="stat stat-good"><span class="stat-eye">BEST CWR</span>'
        f'<span class="stat-num" data-countup="{best_cwr}" data-dp="3">0.000</span></div>'
        f'<div class="stat"><span class="stat-eye">ITEMS</span>'
        f'<span class="stat-num" data-countup="{LEADERBOARD_DATA["n_items"]}" data-dp="0">0</span></div>'
        '</div>'
        '<div class="hero-cta">'
        '<a class="btn btn-primary" href="leaderboard.html">VIEW LEADERBOARD <span aria-hidden="true">→</span></a>'
        '<a class="btn btn-ghost" href="#submit">SUBMIT A SYSTEM <span aria-hidden="true">→</span></a>'
        '</div>'
        '</div></section>'
    )


def render_overview() -> str:
    body = (
        render_hero()
        + render_trust_band()
        + render_four_splits()
        + render_metrics_schematic()
        + render_confidence_dial()
        + render_methodology()
    )
    return body


# ======================================================================================
# 8. LEADERBOARD page body (hand-authored shell + server-rendered table + figures)
# ======================================================================================


def render_leaderboard_body() -> str:
    n = LEADERBOARD_DATA["n_items"]
    sc = LEADERBOARD_DATA["split_counts"]
    return (
        '<section class="lb-intro">'
        '<div class="eyebrow">GLASSBENCH v0.1 · RANKED BOARD</div>'
        '<h1>The Leaderboard</h1>'
        f'<p class="lede">Scored by the open deterministic scorer on {n} items '
        f'(answerable {sc["answerable"]}, stale {sc["stale"]}, contradiction '
        f'{sc["contradiction"]}, false-premise {sc["false_premise"]}). '
        'Sorted by <b>Glass Score</b>, descending — higher is better. '
        'Every numeric cell is a data-bar: best reads green, worst reads red, '
        'regardless of whether the metric is higher- or lower-is-better.</p>'
        '</section>'
        '<section id="board" class="lb-board-section">'
        '<div class="lb-controls" role="group" aria-label="Leaderboard filters">'
        '<div class="chip-row">'
        '<span class="chip-label">show</span>'
        '<button type="button" class="chip chip-on" data-filter="ranked" aria-pressed="true">ranked</button>'
        '<button type="button" class="chip" id="chip-diag" aria-pressed="false">+ diagnostics</button>'
        '<button type="button" class="chip" id="chip-ceilings" aria-pressed="false">show ceilings</button>'
        '</div>'
        '<div class="chip-row">'
        '<span class="chip-label">type</span>'
        '<button type="button" class="chip chip-cat chip-on" data-cat="all" aria-pressed="true">all</button>'
        '<button type="button" class="chip chip-cat" data-cat="genuine" aria-pressed="false">genuine</button>'
        '<button type="button" class="chip chip-cat" data-cat="baseline" aria-pressed="false">baseline</button>'
        '<button type="button" class="chip chip-cat" data-cat="degenerate" aria-pressed="false">degenerate</button>'
        '</div>'
        '</div>'
        + render_ceiling_band()
        + render_static_table()
        + render_diagnostics_table()
        + '<p class="lb-tiebreak"><b>Tie-break:</b> Glass desc → AnswerableAccuracy desc → '
        'system name asc. <code>always_answer</code> and <code>always_abstain</code> tie at '
        'rank 4 (both 0.00) by standard competition ranking. Click a row for its '
        'description and a one-line reproduce command.</p>'
        '</section>'
        + render_figures()
    )


def render_figures() -> str:
    """ECharts figures (Fig 1 scatter, Fig 2 CWR bars). Fig 3 donut lives on datasheet.

    Each chart has a mono <figcaption> and a visually-hidden data <table> fallback so
    the page degrades gracefully if the CDN is blocked or JS is off.
    """
    # Visually-hidden data tables for accessibility / no-JS.
    rows = LEADERBOARD_DATA["ranked"]
    scatter_fallback_rows = "".join(
        f'<tr><td>{html.escape(r["system"])}</td>'
        f'<td>{fmt_metric("answerable_accuracy", r["answerable_accuracy"])}</td>'
        f'<td>{(r["abst_rec_contradiction"] + r["abst_rec_false_premise"]) / 2:.3f}</td>'
        f'<td>{fmt_metric("glass_score", r["glass_score"])}</td></tr>'
        for r in rows
    )
    cwr_fallback_rows = "".join(
        f'<tr><td>{html.escape(r["system"])}</td><td>{fmt_metric("cwr", r["cwr"])}</td></tr>'
        for r in rows
    )
    return (
        '<section id="figures" class="lb-figures">'
        '<div class="eyebrow">ANALYTICAL READOUTS</div>'
        '<h2>What the board looks like</h2>'
        '<figure class="fig fig-scatter">'
        '<div class="fig-chart" id="fig-scatter" role="img" '
        'aria-label="Scatter of answer pillar versus safety pillar. agent_llm sits alone '
        'in the interior; degenerate systems collapse to the axes.">'
        '<noscript><p class="fig-noscript">Enable JavaScript (or load the chart CDN) to see '
        'the interactive scatter. The data is in the table below.</p></noscript>'
        '</div>'
        '<figcaption class="figcap"><b>Fig 1 — Two-pillar scatter.</b> Answer pillar '
        '(AnswerableAccuracy) vs safety pillar (mean abstention recall). Faint contours are '
        'lines of constant Glass. Degenerates collapse to the axes; <b>agent_llm sits alone '
        'in the interior</b> — the only balanced system.</figcaption>'
        '<table class="vh"><caption>Two-pillar data</caption><thead><tr><th>system</th>'
        '<th>answer pillar A</th><th>safety pillar S</th><th>Glass</th></tr></thead>'
        f'<tbody>{scatter_fallback_rows}</tbody></table>'
        '</figure>'
        '<figure class="fig fig-cwr">'
        '<div class="fig-chart" id="fig-cwr" role="img" '
        'aria-label="Horizontal bar chart of Confidently-Wrong Rate per system, with the '
        'confidently-wrong threshold marked.">'
        '<noscript><p class="fig-noscript">Enable JavaScript (or load the chart CDN) to see '
        'the CWR chart. The data is in the table below.</p></noscript>'
        '</div>'
        '<figcaption class="figcap"><b>Fig 2 — CWR spread.</b> Confidently-Wrong Rate per '
        'system, lower is better. Bars in the red zone are confidently wrong on the majority '
        'of items — the deployed failure accuracy-only benchmarks never catch.</figcaption>'
        '<table class="vh"><caption>CWR data</caption><thead><tr><th>system</th>'
        '<th>CWR</th></tr></thead>'
        f'<tbody>{cwr_fallback_rows}</tbody></table>'
        '</figure>'
        '</section>'
    )


# ======================================================================================
# 9. Datasheet split-count donut figure (Fig 3) — injected after the rendered Markdown
# ======================================================================================


def render_split_donut() -> str:
    sc = LEADERBOARD_DATA["split_counts"]
    n = LEADERBOARD_DATA["n_items"]
    unans = sc["contradiction"] + sc["false_premise"]
    fb = "".join(
        f'<tr><td>{html.escape(k)}</td><td>{v}</td></tr>' for k, v in sc.items()
    )
    return (
        '<figure class="fig fig-donut" id="datasheet-donut">'
        '<div class="fig-chart" id="fig-donut" role="img" '
        'aria-label="Donut chart of split counts: answerable 43, stale 11, contradiction 12, '
        'false-premise 30. The unanswerable group is 42 of 96 items.">'
        '<noscript><p class="fig-noscript">Enable JavaScript to see the split-count donut. '
        'The counts are in the table below.</p></noscript>'
        '</div>'
        f'<figcaption class="figcap"><b>Fig 3 — Split counts.</b> {n} items total: '
        f'answerable {sc["answerable"]}, stale {sc["stale"]}, contradiction '
        f'{sc["contradiction"]}, false-premise {sc["false_premise"]}. The unanswerable '
        f'group is {unans} items ({unans / n * 100:.1f}%). Small N — read the board as '
        'directional, not definitive.</figcaption>'
        '<table class="vh"><caption>Split counts</caption><thead><tr><th>split</th>'
        f'<th>count</th></tr></thead><tbody>{fb}</tbody></table>'
        '</figure>'
    )


# ======================================================================================
# 10. STYLE_CSS — the shared instrument theme
# ======================================================================================

STYLE_CSS = r""":root{
  /* substrate */
  --bg:#0c0f14; --panel:#11161f; --panel-2:#161d28; --border:#243040;
  --ink:#e7ecf3; --muted:#9fb0c3; --faint:#7d8ea3;
  /* signal colors — roles are fixed */
  --accent:#57c7e3;     /* CYAN  = measured data / primary metric / selected */
  --accent-2:#8fe3a8;   /* GREEN = honest / safe / good-for-direction */
  --warn:#f0a868;       /* AMBER = caution / hedge / stale / reported-not-scored */
  --danger:#e3576b;     /* RED   = confidently-wrong / extreme failure ONLY */
  --accent-dim:rgba(87,199,227,.14);
  --danger-dim:rgba(227,87,107,.16);
  --good-dim:rgba(143,227,168,.14);
  --warn-dim:rgba(240,168,104,.14);
  --grid:rgba(36,48,64,.55);
  --max:1100px; --max-prose:760px; --radius:12px;
  --mono:"SF Mono",ui-monospace,SFMono-Regular,"JetBrains Mono",Menlo,Consolas,monospace;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
}
*{box-sizing:border-box;}
html{scroll-behavior:smooth;}
body{
  margin:0; background:var(--bg); color:var(--ink);
  font:16px/1.65 var(--sans); -webkit-font-smoothing:antialiased;
}
.vh{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip:rect(0 0 0 0);white-space:nowrap;border:0;}
.skip-link{position:absolute;left:-999px;top:0;background:var(--accent);color:#06222b;
  padding:8px 14px;border-radius:0 0 8px 0;z-index:100;font:600 .85rem/1 var(--mono);}
.skip-link:focus{left:0;}
a{color:var(--accent);text-decoration:none;}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px;}
.wrap{max-width:var(--max);margin:0 auto;padding:0 24px;}
.eyebrow{font:600 .76rem/1 var(--mono);letter-spacing:.16em;color:var(--accent);
  text-transform:uppercase;margin-bottom:14px;}

/* ---- Header ---- */
.site-header{position:sticky;top:0;z-index:30;background:rgba(12,15,20,.82);
  backdrop-filter:saturate(140%) blur(10px);border-bottom:1px solid var(--border);}
.hdr{display:flex;align-items:center;justify-content:space-between;height:60px;}
.brand{font:700 1.22rem/1 var(--mono);letter-spacing:-.01em;color:var(--ink);
  display:inline-flex;align-items:baseline;}
.brand span{color:var(--accent);}
.brand .caret{color:var(--accent);font-style:normal;margin-left:1px;
  animation:blink 1.06s step-end infinite;}
@keyframes blink{50%{opacity:0;}}
.site-header nav{display:flex;gap:2px;align-items:center;flex-wrap:wrap;}
.site-header nav a{color:var(--muted);padding:7px 13px;border-radius:8px;
  font:500 .82rem/1 var(--mono);letter-spacing:.04em;transition:none;}
.site-header nav a:hover{color:var(--ink);background:var(--panel-2);}
.site-header nav a.active{color:var(--ink);background:var(--panel-2);}
.site-header nav a.repo{color:var(--accent);}

.content{padding:48px 24px 90px;}

/* ---- Panel primitive (instrument bezel) ---- */
.panel,.hero-panel,.cert-plate,.schematic,.dial-rig,.cite-block,.ceiling-bezel,
.promote-panel{
  background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);
}
.ov-section{margin:72px 0;}
.ov-section>h2{font:600 1.5rem/1.15 var(--sans);letter-spacing:-.02em;margin:0 0 .5em;}
.lede{color:var(--muted);font-size:1.04rem;max-width:64ch;margin:.2em 0 1.6em;}

/* numbers everywhere */
.stat-num,.num,.cwr-val,.glass-out-range,.dial-output-val,.dial-readout-num,.step-no,
.split-count,.cmd,.formula-block code,.gauge-formula,.ceiling-glass{
  font-variant-numeric:tabular-nums;font-family:var(--mono);}

/* ============ HERO ============ */
.hero{margin:18px 0 0;}
.hero-panel{padding:34px 30px 30px;position:relative;overflow:hidden;}
.hero-q1{font:500 .98rem/1.4 var(--mono);color:var(--muted);margin:0 0 8px;letter-spacing:.01em;}
.hero-q2{font:700 clamp(1.7rem,4.6vw,2.6rem)/1.12 var(--sans);letter-spacing:-.03em;margin:0 0 6px;}
.hero-q2 .hl{color:var(--accent);}
/* CWR strip */
.cwr-strip{margin:34px 0 8px;}
.cwr-scale-wrap{position:relative;padding:46px 0;}
.cwr-scanline{position:absolute;left:0;top:0;width:100%;height:1px;
  background:linear-gradient(90deg,transparent,var(--accent),transparent);
  opacity:.05;animation:scan 2.4s ease-out 1;}
@keyframes scan{0%{transform:translateY(0);opacity:.5;}100%{transform:translateY(92px);opacity:0;}}
.cwr-axis{display:flex;align-items:center;gap:14px;}
.cwr-end{font:600 .82rem/1.2 var(--mono);color:var(--faint);text-align:center;flex:0 0 auto;}
.cwr-end small{font-size:.62rem;letter-spacing:.1em;color:var(--faint);}
.cwr-end-l small{color:var(--accent-2);}
.cwr-end-r small{color:var(--danger);}
.cwr-track{position:relative;flex:1;height:4px;border-radius:3px;
  background:linear-gradient(90deg,var(--accent-2) 0%,var(--warn) 55%,var(--danger) 100%);
  opacity:.9;}
.cwr-tick{position:absolute;top:50%;transform:translate(-50%,-50%);}
.cwr-dot{display:block;width:13px;height:13px;border-radius:50%;border:2px solid var(--bg);
  box-shadow:0 0 0 1.5px currentColor;background:currentColor;}
.cwr-good{color:var(--accent-2);}.cwr-warn{color:var(--warn);}.cwr-bad{color:var(--danger);}
.cwr-lab{position:absolute;left:50%;transform:translateX(-50%);white-space:nowrap;
  font:600 .7rem/1.1 var(--mono);text-align:center;}
.cwr-lab b{display:block;color:var(--ink);font-weight:600;}
.cwr-lab .cwr-val{color:currentColor;font-size:.72rem;}
.cwr-above .cwr-lab{bottom:18px;}
.cwr-below .cwr-lab{top:18px;}
/* Anchor the first/last tick labels to their own edge so they clear the BETTER /
   WORSE end captions instead of overprinting them (centered nowrap would overflow). */
.cwr-edge-l .cwr-lab{left:0;transform:none;text-align:left;}
.cwr-edge-r .cwr-lab{left:auto;right:0;transform:none;text-align:right;}
.figcap{font:500 .8rem/1.5 var(--mono);color:var(--faint);margin-top:14px;letter-spacing:.01em;}
.figcap b{color:var(--muted);font-weight:600;}
/* hero stats */
.hero-stats{display:flex;gap:14px;flex-wrap:wrap;margin:22px 0 4px;}
.stat{flex:1 1 140px;background:var(--panel-2);border:1px solid var(--border);
  border-radius:10px;padding:14px 16px;}
.stat-eye{display:block;font:600 .68rem/1 var(--mono);letter-spacing:.12em;color:var(--faint);margin-bottom:8px;}
.stat-num{font-size:1.9rem;font-weight:600;color:var(--ink);}
.stat-cyan .stat-num{color:var(--accent);}
.stat-good .stat-num{color:var(--accent-2);}
.hero-cta{display:flex;gap:12px;flex-wrap:wrap;margin-top:22px;}
.btn{font:600 .82rem/1 var(--mono);letter-spacing:.06em;padding:13px 20px;border-radius:9px;
  display:inline-flex;align-items:center;gap:8px;border:1px solid transparent;}
.btn-primary{background:var(--accent);color:#06222b;}
.btn-primary:hover{background:#7fd6ec;}
.btn-ghost{background:transparent;border-color:var(--border);color:var(--ink);}
.btn-ghost:hover{border-color:var(--accent);}

/* ============ TRUST BAND ============ */
.cert-plate{padding:28px 30px;}
.cert-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap;}
.cert-head h2{margin:0;font:600 1.5rem/1.15 var(--sans);letter-spacing:-.02em;}
.serial-sticker{flex:0 0 auto;border:1px dashed var(--accent);border-radius:8px;
  padding:8px 14px;text-align:center;background:var(--accent-dim);}
.serial-eye{display:block;font:600 .6rem/1 var(--mono);letter-spacing:.14em;color:var(--accent);}
.serial-no{font:600 .98rem/1.4 var(--mono);color:var(--ink);}
.cert-list{list-style:none;padding:0;margin:22px 0 0;display:grid;
  grid-template-columns:repeat(2,1fr);gap:1px;background:var(--border);
  border:1px solid var(--border);border-radius:10px;overflow:hidden;}
.cert-list li{background:var(--panel);padding:16px 18px;}
.cert-list b{display:block;font:600 .82rem/1.3 var(--mono);color:var(--accent-2);
  letter-spacing:.02em;margin-bottom:5px;}
.cert-list span{color:var(--muted);font-size:.92rem;}

/* ============ FOUR SPLITS ============ */
.split-matrix{display:grid;grid-template-columns:1fr 1fr;gap:18px;}
.split-group{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:16px;border-radius:14px;position:relative;}
.answerable-group{border:1px solid var(--accent-dim);background:rgba(87,199,227,.04);}
.unanswerable-group{border:1px solid var(--danger-dim);background:rgba(227,87,107,.045);}
.split-card{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:16px;}
.split-card:hover{border-color:var(--accent);}
.split-ans{border-top:2px solid var(--accent);}
.split-stale{border-top:2px solid var(--warn);}
.split-unans{border-top:2px solid var(--danger);}
.split-top{display:flex;justify-content:space-between;align-items:baseline;}
.split-name{font:600 .94rem/1 var(--mono);color:var(--ink);}
.split-count{font-size:1.3rem;font-weight:600;color:var(--muted);}
.split-def{color:var(--muted);font-size:.86rem;margin:10px 0 14px;min-height:3em;}
.split-foot{display:flex;flex-direction:column;gap:8px;}
.honest-chip{align-self:flex-start;font:600 .68rem/1 var(--mono);letter-spacing:.06em;
  padding:6px 9px;border-radius:6px;}
.chip-answer{background:var(--accent-dim);color:var(--accent);}
.chip-stale{background:var(--warn-dim);color:var(--warn);}
.chip-abstain{background:var(--danger-dim);color:var(--danger);}
.split-gold{font-size:.76rem;color:var(--faint);font-family:var(--mono);}
.group-label{grid-column:1/-1;font:600 .68rem/1.3 var(--mono);letter-spacing:.08em;
  text-align:center;padding-top:4px;}
.group-answerable{color:var(--accent);}
.group-unanswerable{color:var(--danger);}
.worked-example{margin-top:22px;background:var(--panel);border:1px solid var(--border);
  border-radius:12px;padding:20px;}
.we-eyebrow{font:600 .68rem/1 var(--mono);letter-spacing:.14em;color:var(--faint);margin-bottom:14px;}
.we-flow{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;}
.we-step{background:var(--panel-2);border:1px solid var(--border);border-radius:9px;padding:14px;}
.we-ans{border-left:3px solid var(--accent);}
.we-stale{border-left:3px solid var(--warn);}
.we-contra{border-left:3px solid var(--danger);}
.we-split{font:600 .7rem/1 var(--mono);letter-spacing:.06em;color:var(--muted);text-transform:uppercase;}
.we-step p{font-size:.86rem;color:var(--ink);margin:8px 0;}
.we-arrow{color:var(--faint);font-family:var(--mono);}
.we-gold{display:block;margin-top:6px;font:600 .84rem/1.3 var(--mono);color:var(--accent-2);}
.we-abstain{color:var(--danger);}
.we-note{font-size:.84rem;color:var(--muted);margin:16px 0 0;}

/* ============ METRICS SCHEMATIC ============ */
.schematic{padding:24px;display:grid;grid-template-columns:1.2fr .8fr 1fr;gap:18px;align-items:center;}
.gauge-col{display:flex;flex-direction:column;gap:14px;}
.gauge{background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:16px;}
.gauge-eye{display:block;font:600 .68rem/1 var(--mono);letter-spacing:.1em;color:var(--accent);margin-bottom:8px;}
.gauge-formula{display:block;font-size:.96rem;color:var(--ink);}
.gauge-note{display:block;font-size:.78rem;color:var(--faint);margin-top:6px;font-family:var(--sans);}
.schematic-flow{text-align:center;}
.flow-junction{display:inline-block;font:700 1.2rem/1 var(--mono);color:var(--accent);
  border:1px solid var(--accent);border-radius:50%;width:54px;height:54px;line-height:52px;
  background:var(--accent-dim);}
.flow-mult{display:block;margin-top:12px;font:600 .82rem/1 var(--mono);color:var(--warn);}
.glass-out{background:var(--accent-dim);border:1px solid var(--accent);border-radius:10px;
  padding:20px;text-align:center;}
.glass-out-eye{display:block;font:600 .72rem/1 var(--mono);letter-spacing:.1em;color:var(--accent);}
.glass-out-range{display:block;font-size:1.6rem;font-weight:600;color:var(--ink);margin-top:8px;}
.formula-block{margin:22px 0 14px;}
.schematic-note{color:var(--muted);font-size:.94rem;}
.schematic-note b{color:var(--ink);}

/* ============ CONFIDENCE DIAL ============ */
.dial-section{}
.dial-rig{padding:26px;display:grid;grid-template-columns:1fr 1fr;gap:26px;align-items:center;}
.dial-svg-wrap{max-width:300px;margin:0 auto;}
#conf-dial{width:100%;height:auto;}
.dial-arc{stroke:var(--border);stroke-width:8;stroke-linecap:round;}
.dial-tick{stroke:var(--faint);stroke-width:1.5;}
.dial-tick-lab{fill:var(--faint);font:600 8px var(--mono);text-anchor:middle;}
.dial-needle{stroke:var(--accent);stroke-width:3;stroke-linecap:round;
  transition:transform .12s linear;transform-origin:120px 140px;}
.dial-hub{fill:var(--accent);}
.dial-range-lab{display:block;font:600 .7rem/1 var(--mono);letter-spacing:.08em;
  color:var(--faint);margin:18px 0 8px;text-align:center;}
#conf-range{width:100%;accent-color:var(--accent);}
.dial-output-val{display:block;text-align:center;font-size:1.4rem;font-weight:600;
  color:var(--accent);margin-top:8px;}
.dial-presets{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:18px;}
.preset-btn{font:600 .7rem/1 var(--mono);letter-spacing:.04em;padding:9px 12px;border-radius:7px;
  background:var(--panel-2);border:1px solid var(--border);color:var(--muted);}
.preset-btn:hover{border-color:var(--accent);color:var(--ink);}
.dial-readout{background:var(--panel-2);border:1px solid var(--border);border-radius:12px;
  padding:22px;text-align:center;transition:border-color .12s,background .12s;}
.dial-readout-eye{display:block;font:600 .72rem/1 var(--mono);letter-spacing:.12em;color:var(--faint);}
.dial-readout-num{display:block;font-size:3.2rem;font-weight:700;color:var(--ink);margin-top:8px;line-height:1;}
.dial-readout.zone-amber{border-color:var(--warn);background:var(--warn-dim);}
.dial-readout.zone-amber .dial-readout-num{color:var(--warn);}
.dial-readout.zone-red{border-color:var(--danger);background:var(--danger-dim);}
.dial-readout.zone-red .dial-readout-num{color:var(--danger);}
.dial-explain{font:500 .9rem/1.5 var(--mono);color:var(--muted);margin:16px 0;min-height:2.6em;}
.dial-detents{font:.78rem/1.5 var(--mono);color:var(--faint);}
.dial-detents code{margin:0 2px;}
.dial-thesis{text-align:center;font-size:1.1rem;color:var(--ink);margin:24px 0 0;}
.dial-thesis b{color:var(--accent);}
.dial-fallback{width:100%;border-collapse:collapse;margin-top:18px;font-size:.86rem;}
.dial-fallback caption{font:600 .8rem var(--mono);color:var(--faint);text-align:left;margin-bottom:8px;}
.dial-fallback th,.dial-fallback td{border:1px solid var(--border);padding:8px 12px;text-align:left;}

/* ============ METHODOLOGY ============ */
.step-list{list-style:none;padding:0;margin:0;counter-reset:none;}
.step{display:flex;gap:18px;padding:18px 0;border-bottom:1px solid var(--border);}
.step:last-child{border-bottom:0;}
.step-no{flex:0 0 auto;font-size:1rem;font-weight:600;color:var(--accent);
  border:1px solid var(--accent);border-radius:50%;width:38px;height:38px;line-height:36px;
  text-align:center;background:var(--accent-dim);}
.step-body{flex:1;min-width:0;}
.step-title{font:600 1.05rem/1.2 var(--sans);margin:2px 0 10px;}
.step-cmd{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;}
.cmd{background:var(--panel-2);border:1px solid var(--border);border-radius:6px;
  padding:6px 10px;font-size:.82rem;color:var(--accent-2);overflow-x:auto;max-width:100%;}
.cmd-file{color:var(--warn);}
.copy-btn{font:600 .68rem/1 var(--mono);letter-spacing:.04em;padding:6px 10px;border-radius:6px;
  background:transparent;border:1px solid var(--border);color:var(--muted);}
.copy-btn:hover{border-color:var(--accent);color:var(--accent);}
.copy-btn.copied{border-color:var(--accent-2);color:var(--accent-2);}
.step-desc{color:var(--muted);font-size:.9rem;margin:0;}
.cite-block{margin-top:28px;padding:20px;}
.cite-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
.cite-block pre{margin:0;}
.cite-credit{color:var(--faint);font-size:.84rem;margin:14px 0 0;}

/* ============ Shared code/pre ============ */
code{font-family:var(--mono);font-size:.86em;background:var(--panel-2);border:1px solid var(--border);
  border-radius:5px;padding:.1em .4em;color:var(--accent-2);}
pre{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);
  padding:16px 18px;overflow-x:auto;margin:1.2em 0;}
pre code{background:none;border:0;padding:0;color:var(--ink);font-size:.84rem;line-height:1.6;}
.formula-block code{color:var(--ink);}

/* ============ LEADERBOARD ============ */
.lb-intro h1{font:700 2.1rem/1.12 var(--sans);letter-spacing:-.03em;margin:.1em 0 .4em;}
.lb-controls{display:flex;flex-wrap:wrap;gap:18px 32px;margin:24px 0 18px;}
.chip-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.chip-label{font:600 .68rem/1 var(--mono);letter-spacing:.1em;color:var(--faint);text-transform:uppercase;}
.chip{font:600 .76rem/1 var(--mono);letter-spacing:.03em;padding:8px 13px;border-radius:7px;
  background:var(--panel-2);border:1px solid var(--border);color:var(--muted);}
.chip:hover{border-color:var(--accent);color:var(--ink);}
.chip.chip-on{background:var(--accent-dim);border-color:var(--accent);color:var(--accent);}

/* table */
.table-wrap{overflow-x:auto;margin:1.3em 0;border:1px solid var(--border);border-radius:var(--radius);}
.lb-table{border-collapse:collapse;width:100%;font-size:.88rem;min-width:760px;}
.lb-table thead th{background:var(--panel-2);color:var(--muted);font-weight:600;text-align:left;
  padding:0;border-bottom:1px solid var(--border);white-space:nowrap;}
.lb-table thead th.c-num{text-align:right;}
.th-sort{width:100%;background:none;border:0;color:inherit;font:600 .76rem/1 var(--mono);
  letter-spacing:.03em;padding:12px 14px;cursor:pointer;text-align:inherit;
  display:inline-flex;align-items:center;gap:5px;}
.c-num .th-sort{justify-content:flex-end;width:100%;}
.th-sort:hover{color:var(--ink);}
.dir{color:var(--faint);}
.sort-ind{font-size:.7em;color:var(--accent);min-width:9px;}
.lb-table tbody td{padding:0;border-bottom:1px solid rgba(36,48,64,.6);position:relative;}
.lb-table tbody tr:last-child td{border-bottom:0;}
.lb-row{cursor:pointer;}
.lb-row:hover,.lb-row.hl{background:rgba(87,199,227,.07);}
.lb-row.is-genuine{box-shadow:inset 3px 0 0 var(--accent);}
.c-rank{padding:11px 14px!important;color:var(--faint);font-family:var(--mono);width:42px;}
.c-sys{padding:11px 14px!important;}
.sys-name{font-weight:600;color:var(--ink);font-family:var(--mono);font-size:.9rem;}
.is-genuine .sys-name{color:var(--accent);}
.genuine-flag{display:block;font:600 .62rem/1.2 var(--mono);letter-spacing:.04em;color:var(--accent);margin-top:3px;}
.c-num{text-align:right;}
.c-num .bar{position:absolute;left:0;top:0;bottom:0;opacity:.16;}
.c-num .num{position:relative;display:block;padding:11px 14px;font-family:var(--mono);}
.bar-cyan{background:var(--accent);}
.bar-good{background:var(--accent-2);}
.bar-warn{background:var(--warn);}
.bar-bad{background:var(--danger);opacity:.22;}
.c-num[data-key="glass_score"] .num{color:var(--accent);font-weight:600;}
.lb-detail{display:none;}
.lb-detail.open{display:table-row;}
.lb-detail td{padding:0!important;background:var(--panel-2);}
.detail-inner{padding:16px 18px;border-left:3px solid var(--accent);}
.detail-type .k,.detail-repro .k{font:600 .66rem/1 var(--mono);letter-spacing:.1em;
  color:var(--faint);text-transform:uppercase;margin-right:8px;}
.detail-type{font-size:.84rem;color:var(--muted);margin:0 0 8px;}
.detail-desc{font-size:.9rem;color:var(--ink);margin:0 0 12px;}
.detail-repro{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.lb-ghost td{text-align:center;padding:14px!important;color:var(--faint);
  font:.82rem/1.4 var(--mono);border:1px dashed var(--border)!important;}
.lb-tiebreak{font-size:.84rem;color:var(--faint);margin-top:14px;}
.lb-tiebreak b{color:var(--muted);}

/* diagnostics */
.diag-panel{margin:18px 0;}
.diag-tag{display:inline-flex;align-items:center;gap:8px;font:600 .7rem/1 var(--mono);
  letter-spacing:.06em;color:var(--warn);background:var(--warn-dim);border:1px solid var(--warn);
  border-radius:7px;padding:9px 12px;margin-bottom:12px;}
.diag-tag .dot{width:8px;height:8px;border-radius:50%;background:var(--warn);}
.diag-table td,.diag-table th{padding:10px 14px;}
.diag-table .c-num{text-align:right;color:var(--muted);}

/* ceiling band */
.ceiling-bezel{padding:22px;margin:8px 0 18px;border-top:2px dashed var(--warn);}
.ceiling-title{font:600 1.1rem/1.2 var(--sans);margin:0 0 16px;}
.ceiling-sub{display:block;font:500 .74rem/1.4 var(--mono);color:var(--faint);letter-spacing:.04em;margin-top:4px;}
.ceiling-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.ceiling-card{background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:16px;opacity:.92;}
.ceiling-head{display:flex;justify-content:space-between;align-items:baseline;}
.ceiling-name{font:600 .9rem/1 var(--mono);color:var(--muted);}
.ceiling-glass{font-size:1.4rem;font-weight:600;color:var(--faint);}
.ceiling-glass small{font-size:.62rem;color:var(--faint);margin-left:4px;letter-spacing:.08em;}
.not-ranked-tag{display:inline-block;font:600 .64rem/1 var(--mono);letter-spacing:.06em;
  color:var(--warn);background:var(--warn-dim);border-radius:5px;padding:5px 8px;margin:10px 0;}
.ceiling-what{font-size:.84rem;color:var(--muted);margin:6px 0;}
.ceiling-why summary{cursor:pointer;font:600 .74rem/1 var(--mono);color:var(--accent);}
.ceiling-why p{font-size:.82rem;color:var(--faint);margin:8px 0 0;}

/* figures */
.lb-figures{margin:64px 0;}
.lb-figures h2{font:600 1.5rem/1.15 var(--sans);letter-spacing:-.02em;margin:0 0 24px;}
.fig{margin:0 0 40px;background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:20px;}
.fig-chart{width:100%;height:420px;}
.fig-cwr .fig-chart{height:360px;}
.fig-donut .fig-chart{height:340px;}
.fig-noscript{color:var(--faint);font-size:.86rem;padding:40px 0;text-align:center;}

/* ============ generic doc/prose (datasheet) ============ */
.prose{max-width:var(--max-prose);margin-inline:auto;}
.prose h1{font:700 2.1rem/1.15 var(--sans);letter-spacing:-.03em;margin:.2em 0 .5em;}
.prose h2{font:600 1.5rem/1.2 var(--sans);letter-spacing:-.02em;margin:1.8em 0 .6em;
  padding-bottom:.3em;border-bottom:1px solid var(--border);}
.prose h3{font:600 1.16rem/1.2 var(--sans);margin:1.5em 0 .5em;}
.prose h4{font:600 1rem/1.2 var(--mono);margin:1.3em 0 .4em;color:var(--muted);}
.prose p{color:var(--ink);}
.prose a{border-bottom:1px solid transparent;}
.prose a:hover{border-bottom-color:var(--accent);}
.prose ul,.prose ol{padding-left:1.4em;}
.prose li{margin:.25em 0;}
.prose strong{color:#fff;}
.prose em{color:var(--muted);}
.prose hr{border:0;border-top:1px solid var(--border);margin:2.4em 0;}
.prose blockquote{margin:1.4em 0;padding:2px 18px;border-left:3px solid var(--accent);
  background:linear-gradient(90deg,rgba(87,199,227,.08),transparent);border-radius:0 8px 8px 0;}
.prose blockquote p{color:var(--muted);}
.prose table{border-collapse:collapse;width:100%;font-size:.88rem;}
.prose thead th{background:var(--panel-2);color:var(--muted);font-weight:600;text-align:left;
  padding:10px 13px;border-bottom:1px solid var(--border);}
.prose tbody td{padding:9px 13px;border-bottom:1px solid rgba(36,48,64,.6);}
.prose td.a-right,.prose th.a-right{text-align:right;font-variant-numeric:tabular-nums;}
.prose td.a-center,.prose th.a-center{text-align:center;}

/* promoted datasheet panels */
.promote-panel{padding:8px 22px 18px;margin:1.8em 0;border-left:3px solid var(--warn);}
.promote-panel.promote-integrity{border-left-color:var(--accent-2);}
.promote-chip{display:inline-flex;align-items:center;gap:8px;font:600 .68rem/1 var(--mono);
  letter-spacing:.1em;padding:8px 12px;border-radius:0 0 8px 0;margin:0 0 4px -22px;}
.promote-tolerances .promote-chip{color:var(--warn);background:var(--warn-dim);}
.promote-integrity .promote-chip{color:var(--accent-2);background:var(--good-dim);}
.promote-chip .dot{width:7px;height:7px;border-radius:50%;background:currentColor;}
.promote-panel h2{border-bottom:0;margin-top:.3em;}

/* ============ footer ============ */
.site-footer{border-top:1px solid var(--border);padding:30px 0;color:var(--faint);font-size:.85rem;}
.site-footer a{color:var(--muted);}
.site-footer p{margin:.4em 0;}
.site-footer .micro{font-size:.78rem;}

/* ============ responsive ============ */
@media(max-width:999px){
  .schematic{grid-template-columns:1fr;}
  .dial-rig{grid-template-columns:1fr;}
  .cert-list{grid-template-columns:1fr;}
  .ceiling-grid{grid-template-columns:1fr;}
  .fig-chart{height:360px;}
}
@media(max-width:760px){
  .split-matrix{grid-template-columns:1fr;}
  .we-flow{grid-template-columns:1fr;}
}
@media(max-width:640px){
  .content{padding:32px 16px 70px;}
  .ov-section{margin:48px 0;}
  .hdr{height:auto;padding:8px 0;flex-direction:column;gap:6px;}
  /* Let the nav wrap and centre so every item (incl. "GitHub ↗") stays fully
     visible instead of the last item being clipped at the right edge. */
  .site-header nav{flex-wrap:wrap;justify-content:center;gap:2px 4px;width:100%;}
  .site-header nav a{padding:7px 9px;}
  .split-group{grid-template-columns:1fr;}
  .fig-chart{height:300px;}
  .stat-num{font-size:1.5rem;}
  /* CWR strip: the percentage-positioned horizontal scale collides badly at phone
     widths, so swap it for a stacked vertical readout — one row per system, dot +
     name + value — which stays legible with no overlap or clipping. */
  .cwr-scale-wrap{padding:6px 0;}
  .cwr-scanline{display:none;}
  .cwr-axis{flex-direction:column;align-items:stretch;gap:8px;}
  .cwr-end{text-align:left;flex:0 0 auto;font-size:.7rem;}
  .cwr-end small{font-size:.7rem;}
  .cwr-end-r{order:3;text-align:right;}
  .cwr-track{order:2;flex:none;height:auto;background:none;opacity:1;
    display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--grid);
    border-bottom:1px solid var(--grid);padding:8px 0;}
  .cwr-tick{position:static;transform:none;display:flex;align-items:center;gap:10px;
    width:100%;}
  .cwr-dot{flex:0 0 auto;width:10px;height:10px;box-shadow:0 0 0 1.5px currentColor;}
  .cwr-lab{position:static!important;left:auto!important;right:auto!important;
    transform:none!important;white-space:nowrap;text-align:left!important;
    display:flex;align-items:baseline;gap:8px;flex:1;}
  .cwr-lab b{display:inline;}
  .cwr-lab .cwr-val{margin-left:auto;}
}

/* ============ reduced motion (mandatory) ============ */
@media(prefers-reduced-motion:reduce){
  *{scroll-behavior:auto!important;}
  .brand .caret{animation:none;}
  .cwr-scanline{animation:none;display:none;}
  .dial-needle{transition:none;}
}
"""


# ======================================================================================
# 11. APP_JS — vanilla JS (count-up, dial, sortable/filterable board, ECharts figures)
# ======================================================================================
# No bundler, no framework. ECharts is loaded from a CDN <script src> on the pages that
# need it; this file guards on `window.echarts` so it degrades cleanly if the CDN is
# blocked (the server-rendered table + the visually-hidden data tables remain usable).

APP_JS = r"""/* GlassBench site — vanilla enhancement layer. Degrades to static HTML if absent. */
(function(){
  "use strict";
  var RM = window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches;

  /* ---- palette (kept in sync with style.css) ---- */
  var C = {
    bg:"#0c0f14", panel:"#11161f", panel2:"#161d28", border:"#243040",
    ink:"#e7ecf3", muted:"#9fb0c3", faint:"#6b7c91",
    cyan:"#57c7e3", green:"#8fe3a8", warn:"#f0a868", danger:"#e3576b",
    grid:"rgba(36,48,64,.55)"
  };
  var MONO = '"SF Mono",ui-monospace,SFMono-Regular,"JetBrains Mono",Menlo,Consolas,monospace';

  function rampColor(goodness){
    if(goodness>=0.66) return C.green;
    if(goodness>=0.33) return C.warn;
    return C.danger;
  }
  function $(s,r){return (r||document).querySelector(s);}
  function $all(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}

  /* ============ count-up (needles settle) ============ */
  function countUp(el){
    var target=parseFloat(el.getAttribute("data-countup"));
    var dp=parseInt(el.getAttribute("data-dp")||"0",10);
    if(RM||isNaN(target)){el.textContent=target.toFixed(dp);return;}
    var dur=700,t0=null;
    function frame(ts){
      if(t0===null)t0=ts;
      var p=Math.min(1,(ts-t0)/dur);
      // critically-damped-ish ease with tiny overshoot then lock
      var e=1-Math.pow(1-p,3);
      var ov=p<1?Math.sin(p*Math.PI)*0.012:0;
      el.textContent=(target*(e+ov)).toFixed(dp);
      if(p<1)requestAnimationFrame(frame); else el.textContent=target.toFixed(dp);
    }
    requestAnimationFrame(frame);
  }
  function observeCountUps(){
    var els=$all("[data-countup]");
    if(!els.length)return;
    if(!("IntersectionObserver" in window)){els.forEach(countUp);return;}
    var io=new IntersectionObserver(function(es){
      es.forEach(function(e){if(e.isIntersecting){countUp(e.target);io.unobserve(e.target);}});
    },{threshold:0.4});
    els.forEach(function(el){io.observe(el);});
  }

  /* ============ copy buttons ============ */
  function wireCopy(){
    document.addEventListener("click",function(ev){
      var b=ev.target.closest(".copy-btn");
      if(!b)return;
      var txt=b.getAttribute("data-copy");
      if(!txt)return;
      var done=function(){var o=b.textContent;b.textContent="copied";b.classList.add("copied");
        setTimeout(function(){b.textContent=o;b.classList.remove("copied");},1400);};
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(txt).then(done,done);
      }else{
        var ta=document.createElement("textarea");ta.value=txt;document.body.appendChild(ta);
        ta.select();try{document.execCommand("copy");}catch(e){}document.body.removeChild(ta);done();
      }
    });
  }

  /* ============ confidence dial ============ */
  function initDial(){
    var range=$("#conf-range"); if(!range)return;
    var out=$("#conf-out"), needle=$(".dial-needle"), readout=$("#dial-readout"),
        explain=$("#dial-explain"), ticksG=$(".dial-ticks");
    // draw dial ticks 0..1
    if(ticksG){
      var cx=120,cy=140,r=90,html="";
      for(var k=0;k<=10;k++){
        var frac=k/10, ang=Math.PI*(1-frac); // 180deg .. 0deg
        var x1=cx+Math.cos(ang)*(r-6), y1=cy-Math.sin(ang)*(r-6);
        var x2=cx+Math.cos(ang)*(r+4), y2=cy-Math.sin(ang)*(r+4);
        html+='<line class="dial-tick" x1="'+x1.toFixed(1)+'" y1="'+y1.toFixed(1)+'" x2="'+x2.toFixed(1)+'" y2="'+y2.toFixed(1)+'"/>';
        if(k%5===0){
          var lx=cx+Math.cos(ang)*(r+14), ly=cy-Math.sin(ang)*(r+14)+3;
          html+='<text class="dial-tick-lab" x="'+lx.toFixed(1)+'" y="'+ly.toFixed(1)+'">'+frac.toFixed(1)+'</text>';
        }
      }
      ticksG.innerHTML=html;
    }
    function render(v){
      v=Math.max(0,Math.min(1,v));
      if(out)out.textContent=v.toFixed(2);
      if(needle){
        var ang=Math.PI*(1-v); // radians from +x axis
        var deg=90-(ang*180/Math.PI); // needle points up at v=0.5
        needle.style.transform="rotate("+deg+"deg)";
      }
      // Glass is ALWAYS 0.00 for any answer-everything strategy. Narrate only.
      $("#dial-glass").textContent="0.00";
      readout.classList.remove("zone-amber","zone-red");
      if(v<0.5){
        readout.classList.add("zone-amber");
        explain.textContent="confidence < 0.5 counts as abstain everywhere → answer pillar = 0 → Glass 0.00";
      }else{
        readout.classList.add("zone-red");
        explain.textContent="answers everything confidently → safety pillar = 0 → Glass 0.00";
      }
    }
    range.addEventListener("input",function(){render(parseFloat(range.value));});
    $all(".preset-btn").forEach(function(btn){
      btn.addEventListener("click",function(){
        var p=btn.getAttribute("data-preset");
        if(p==="abstain"){range.value="0";render(0);
          explain.textContent="abstains on everything → answer pillar = 0 → Glass 0.00 (silence earns nothing)";
          readout.classList.remove("zone-red");readout.classList.add("zone-amber");}
        else if(p==="answer"){range.value="0.9";render(0.9);}
        else{range.value="0.49";render(0.49);}
      });
    });
    render(parseFloat(range.value));
  }

  /* ============ leaderboard table: sort / filter / detail / cross-highlight ============ */
  var DATA=null, CHARTS={};

  function meanSafety(r){return (r.abst_rec_contradiction+r.abst_rec_false_premise)/2;}

  function fmt(key,v){
    var two={glass_score:1,abst_rec_contradiction:1,abst_rec_false_premise:1};
    var three={cwr:1,aurc_norm:1,ece:1,brier:1,cwr_macro:1,ece_macro:1,brier_macro:1,answerable_accuracy:1};
    if(two[key])return v.toFixed(2);
    if(three[key])return v.toFixed(3);
    return ""+v;
  }

  function metaByKey(){
    var m={}; (DATA.metrics||[]).forEach(function(x){m[x.key]=x;}); return m;
  }

  function initBoard(){
    var table=$("#lb-table"); if(!table||!DATA)return;
    var meta=metaByKey();
    var SCORED=["glass_score","cwr","aurc_norm","abst_rec_contradiction","abst_rec_false_premise","ece","brier"];
    var sortKey="glass_score", sortDir="desc"; // desc default
    var catFilter="all";

    function tiebreak(a,b){
      // Glass desc, then AnswerableAccuracy desc, then name asc.
      if(b.glass_score!==a.glass_score)return b.glass_score-a.glass_score;
      if(b.answerable_accuracy!==a.answerable_accuracy)return b.answerable_accuracy-a.answerable_accuracy;
      return a.system<b.system?-1:1;
    }
    function sysCat(t){t=(t||"").toLowerCase();
      if(t.indexOf("degenerate")>=0)return"degenerate";
      if(t.indexOf("agentic")>=0)return"genuine";return"baseline";}

    function bounds(rows,key){
      var vs=rows.map(function(r){return r[key];}).filter(function(x){return x!=null;});
      var mn=Math.min.apply(null,vs),mx=Math.max.apply(null,vs);
      return [mn,mx];
    }

    function render(){
      var rows=DATA.ranked.filter(function(r){return catFilter==="all"||sysCat(r.type)===catFilter;});
      // sort
      rows.sort(function(a,b){
        if(sortKey==="glass_score")return sortDir==="desc"?tiebreak(a,b):-tiebreak(a,b);
        var d=meta[sortKey]?meta[sortKey].direction:"higher";
        var av=a[sortKey],bv=b[sortKey];
        var cmp=av-bv;
        // one click = "best on top": best = high for higher-is-better, low for lower
        var best=(d==="higher")? -cmp : cmp;
        if(best!==0)return sortDir==="desc"?best:-best;
        return tiebreak(a,b);
      });
      var bnd={}; SCORED.forEach(function(k){bnd[k]=bounds(DATA.ranked,k);});
      var tb=table.tBodies[0];
      // clear existing data + detail rows but keep ghost
      $all(".lb-row,.lb-detail",tb).forEach(function(n){n.remove();});
      var ghost=$(".lb-ghost",tb);
      rows.forEach(function(r){
        var tr=document.createElement("tr");
        tr.className="lb-row"+(r.system==="agent_llm"?" is-genuine":"");
        tr.setAttribute("data-system",r.system);
        tr.setAttribute("tabindex","0");
        tr.setAttribute("aria-expanded","false");
        var flag=r.system==="agent_llm"?'<span class="genuine-flag">◀ ONLY GENUINE ROUTER</span>':"";
        var cells='<td class="c-rank">'+r.rank+'</td><td class="c-sys"><span class="sys-name">'+r.system+'</span>'+flag+'</td>';
        SCORED.forEach(function(k){
          var b=bnd[k],mn=b[0],mx=b[1],span=(mx-mn)||1,norm=(r[k]-mn)/span;
          var d=meta[k]?meta[k].direction:"higher";
          var good=d==="higher"?norm:1-norm;
          var width,rampCls;
          if(k==="glass_score"){width=Math.max(0,Math.min(1,r[k]/100));rampCls="cyan";}
          else{width=mx!==mn?Math.max(0.04,norm):0.5;
            rampCls=good>=0.66?"good":good>=0.33?"warn":"bad";}
          cells+='<td class="c-num" data-key="'+k+'"><span class="bar bar-'+rampCls+'" style="width:'+(width*100).toFixed(1)+'%"></span><span class="num">'+fmt(k,r[k])+'</span></td>';
        });
        tr.innerHTML=cells;
        var det=document.createElement("tr");
        det.className="lb-detail";det.setAttribute("data-detail-for",r.system);
        det.innerHTML='<td colspan="9"><div class="detail-inner"><p class="detail-type"><span class="k">type</span>'+esc(r.type)+'</p><p class="detail-desc">'+esc(r.description)+'</p><div class="detail-repro"><span class="k">reproduce</span><code class="cmd">'+esc(r.reproduce)+'</code><button type="button" class="copy-btn" data-copy="'+esc(r.reproduce)+'">copy</button></div></div></td>';
        tb.insertBefore(tr,ghost);
        tb.insertBefore(det,ghost);
        wireRow(tr,det);
      });
      updateSortIndicators();
    }
    function esc(s){var d=document.createElement("div");d.textContent=s;return d.innerHTML;}

    function wireRow(tr,det){
      function toggle(){
        var open=det.classList.toggle("open");
        tr.setAttribute("aria-expanded",open?"true":"false");
      }
      tr.addEventListener("click",function(e){if(e.target.closest(".copy-btn"))return;toggle();});
      tr.addEventListener("keydown",function(e){
        if(e.key==="Enter"||e.key===" "){e.preventDefault();toggle();}
      });
      tr.addEventListener("mouseenter",function(){highlight(tr.getAttribute("data-system"),true);});
      tr.addEventListener("mouseleave",function(){highlight(tr.getAttribute("data-system"),false);});
      tr.addEventListener("focus",function(){highlight(tr.getAttribute("data-system"),true);});
      tr.addEventListener("blur",function(){highlight(tr.getAttribute("data-system"),false);});
    }

    function updateSortIndicators(){
      $all("thead th.c-num",table).forEach(function(th){
        var key=th.getAttribute("data-key");
        var ind=$(".sort-ind",th); if(ind)ind.textContent="";
        th.setAttribute("aria-sort","none");
        if(key===sortKey){
          if(ind)ind.textContent=sortDir==="desc"?"▼":"▲";
          th.setAttribute("aria-sort",sortDir==="desc"?"descending":"ascending");
        }
      });
    }

    $all("thead th.c-num .th-sort",table).forEach(function(btn){
      btn.addEventListener("click",function(){
        var key=btn.closest("th").getAttribute("data-key");
        if(key===sortKey){sortDir=sortDir==="desc"?"asc":"desc";}
        else{sortKey=key;sortDir="desc";}
        render();
      });
    });

    // category chips
    $all(".chip-cat").forEach(function(chip){
      chip.addEventListener("click",function(){
        $all(".chip-cat").forEach(function(c){c.classList.remove("chip-on");c.setAttribute("aria-pressed","false");});
        chip.classList.add("chip-on");chip.setAttribute("aria-pressed","true");
        catFilter=chip.getAttribute("data-cat");
        render();
        if(window.echarts)drawCharts();
      });
    });
    // diagnostics toggle
    var diagChip=$("#chip-diag"),diagPanel=$("#diag-panel");
    if(diagChip&&diagPanel){
      diagChip.addEventListener("click",function(){
        var on=diagPanel.hidden;diagPanel.hidden=!on;
        diagChip.classList.toggle("chip-on",on);diagChip.setAttribute("aria-pressed",on?"true":"false");
      });
    }
    // ceilings toggle
    var ceilChip=$("#chip-ceilings"),ceilBand=$("#ceiling-band");
    if(ceilChip&&ceilBand){
      ceilChip.addEventListener("click",function(){
        var on=ceilBand.hidden;ceilBand.hidden=!on;
        ceilChip.classList.toggle("chip-on",on);ceilChip.setAttribute("aria-pressed",on?"true":"false");
        if(window.echarts)drawCharts();
      });
    }
    render();
  }

  function highlight(system,on){
    $all('.lb-row[data-system="'+CSS.escape(system)+'"]').forEach(function(tr){
      tr.classList.toggle("hl",on);
    });
    if(window.echarts){
      ["scatter","cwr"].forEach(function(id){
        var ch=CHARTS[id]; if(!ch)return;
        ch.dispatchAction({type:on?"highlight":"downplay",seriesIndex:ch._sysSeriesIndex||0});
      });
    }
  }

  /* ============ ECharts figures ============ */
  function baseGrid(){return{left:54,right:24,top:30,bottom:48};}
  function txt(c){return{color:c||C.muted,fontFamily:MONO,fontSize:11};}

  function drawScatter(){
    var el=$("#fig-scatter"); if(!el)return;
    var ch=CHARTS.scatter||echarts.init(el,null,{renderer:"canvas"});
    CHARTS.scatter=ch;
    var rows=DATA.ranked.slice();
    // iso-Glass contours: HM(A,S)*(1-CWR_ref)=const, use CWR=0 ceiling => Glass=100*HM(A,S)
    var contours=[];
    [20,40,60,80].forEach(function(g){
      var pts=[]; var target=g/100; // HM target
      for(var a=0.01;a<=1.001;a+=0.01){
        // HM=2aS/(a+S)=target -> S = target*a/(2a-target)
        var denom=2*a-target;
        if(denom<=0)continue;
        var s=target*a/denom;
        if(s>=0&&s<=1.02)pts.push([a,s]);
      }
      contours.push({type:"line",data:pts,showSymbol:false,smooth:true,silent:true,
        lineStyle:{color:C.border,width:1,type:"dashed"},
        endLabel:{show:false},z:1,
        markPoint:undefined});
    });
    function ptColor(r){
      if(r.system==="agent_llm")return C.cyan;
      var g=meanSafety(r); var a=r.answerable_accuracy;
      // color by glass-ish goodness
      var good=Math.min(1,(r.glass_score/60));
      return good>=0.66?C.green:good>=0.33?C.warn:C.danger;
    }
    var pts=rows.map(function(r){
      return {value:[r.answerable_accuracy,meanSafety(r),r.glass_score],name:r.system,
        itemStyle:{color:ptColor(r),borderColor:C.bg,borderWidth:1.5},
        symbolSize:r.system==="agent_llm"?20:14};
    });
    var refs=[];
    var ceilOn=$("#ceiling-band")&&!$("#ceiling-band").hidden;
    if(ceilOn){
      refs=(DATA.references||[]).map(function(r){
        return {value:[r.answerable_accuracy,meanSafety(r),r.glass_score],name:r.system,
          itemStyle:{color:"transparent",borderColor:C.faint,borderWidth:1.5},symbolSize:16};
      });
    }
    var series=contours.concat([
      {type:"scatter",data:pts,z:5,
        label:{show:true,formatter:function(p){return p.data.name;},position:"top",
          color:C.muted,fontFamily:MONO,fontSize:10},
        emphasis:{focus:"self",itemStyle:{borderColor:C.cyan,borderWidth:2},
          label:{color:C.ink}}}
    ]);
    ch._sysSeriesIndex=contours.length;
    if(refs.length)series.push({type:"scatter",data:refs,z:4,symbol:"diamond",
      label:{show:true,formatter:function(p){return p.data.name;},position:"top",color:C.faint,fontFamily:MONO,fontSize:9}});
    ch.setOption({
      backgroundColor:"transparent",
      animation:!RM,animationDuration:700,animationEasing:"cubicOut",
      grid:baseGrid(),
      tooltip:{trigger:"item",backgroundColor:C.panel2,borderColor:C.border,
        textStyle:{color:C.ink,fontFamily:MONO,fontSize:11},
        formatter:function(p){
          if(p.seriesType!=="scatter")return"";
          return "<b>"+p.data.name+"</b><br/>answer A: "+p.data.value[0].toFixed(3)+
            "<br/>safety S: "+p.data.value[1].toFixed(3)+
            "<br/>Glass: "+p.data.value[2].toFixed(2);
        }},
      xAxis:{name:"answer pillar  A",nameLocation:"middle",nameGap:30,
        nameTextStyle:txt(C.faint),min:0,max:1,
        axisLine:{lineStyle:{color:C.border}},axisLabel:txt(),
        splitLine:{lineStyle:{color:C.grid}}},
      yAxis:{name:"safety pillar  S",nameLocation:"middle",nameGap:36,
        nameTextStyle:txt(C.faint),min:0,max:1,
        axisLine:{lineStyle:{color:C.border}},axisLabel:txt(),
        splitLine:{lineStyle:{color:C.grid}}},
      series:series
    },true);
  }

  function drawCwr(){
    var el=$("#fig-cwr"); if(!el)return;
    var ch=CHARTS.cwr||echarts.init(el,null,{renderer:"canvas"});
    CHARTS.cwr=ch;
    var rows=DATA.ranked.slice().sort(function(a,b){return a.cwr-b.cwr;});
    var names=rows.map(function(r){return r.system;});
    var data=rows.map(function(r){
      var col=r.cwr<0.18?C.green:r.cwr<0.5?C.warn:C.danger;
      return {value:r.cwr,itemStyle:{color:col}};
    });
    ch._sysSeriesIndex=0;
    ch.setOption({
      backgroundColor:"transparent",
      animation:!RM,animationDuration:700,animationEasing:"cubicOut",
      grid:{left:130,right:40,top:20,bottom:40},
      tooltip:{trigger:"item",backgroundColor:C.panel2,borderColor:C.border,
        textStyle:{color:C.ink,fontFamily:MONO,fontSize:11},
        formatter:function(p){return "<b>"+p.name+"</b><br/>CWR: "+p.value.toFixed(3);}},
      xAxis:{type:"value",min:0,max:0.72,name:"Confidently-Wrong Rate (lower better)",
        nameLocation:"middle",nameGap:28,nameTextStyle:txt(C.faint),
        axisLine:{lineStyle:{color:C.border}},axisLabel:txt(),
        splitLine:{lineStyle:{color:C.grid}}},
      yAxis:{type:"category",data:names,axisLine:{lineStyle:{color:C.border}},
        axisLabel:txt(C.muted)},
      series:[{type:"bar",data:data,barWidth:"55%",
        markLine:{silent:true,symbol:"none",
          lineStyle:{color:C.danger,type:"dashed",width:1.5},
          label:{formatter:"confidently-wrong line (conf ≥ 0.70)",color:C.danger,
            fontFamily:MONO,fontSize:9,position:"insideEndTop"},
          data:[{xAxis:0.70}]},
        emphasis:{itemStyle:{borderColor:C.cyan,borderWidth:2}}}]
    },true);
  }

  function drawDonut(){
    var el=$("#fig-donut"); if(!el||!DATA.split_counts)return;
    var ch=CHARTS.donut||echarts.init(el,null,{renderer:"canvas"});
    CHARTS.donut=ch;
    var sc=DATA.split_counts;
    var n=DATA.n_items, unans=sc.contradiction+sc.false_premise;
    var data=[
      {name:"answerable",value:sc.answerable,itemStyle:{color:C.cyan}},
      {name:"stale",value:sc.stale,itemStyle:{color:C.warn}},
      {name:"contradiction",value:sc.contradiction,itemStyle:{color:C.danger}},
      {name:"false_premise",value:sc.false_premise,itemStyle:{color:"#b6455a"}}
    ];
    ch.setOption({
      backgroundColor:"transparent",animation:!RM,animationDuration:700,
      tooltip:{trigger:"item",backgroundColor:C.panel2,borderColor:C.border,
        textStyle:{color:C.ink,fontFamily:MONO,fontSize:11},
        formatter:function(p){return "<b>"+p.name+"</b>: "+p.value+" ("+p.percent+"%)";}},
      legend:{bottom:0,textStyle:txt(C.muted),icon:"circle"},
      series:[{type:"pie",radius:["52%","78%"],center:["50%","44%"],
        avoidLabelOverlap:true,
        label:{show:true,position:"center",
          formatter:"{a|"+unans+" / "+n+"}\n{b|unanswerable}",
          rich:{a:{color:C.danger,fontFamily:MONO,fontSize:24,fontWeight:600},
            b:{color:C.faint,fontFamily:MONO,fontSize:11,padding:[6,0,0,0]}}},
        labelLine:{show:false},
        itemStyle:{borderColor:C.bg,borderWidth:2},
        data:data}]
    },true);
  }

  function drawCharts(){
    if(!window.echarts||!DATA)return;
    drawScatter();drawCwr();drawDonut();
  }

  function initCharts(){
    if(!DATA)return;
    if(!window.echarts){
      // CDN blocked: reveal the visually-hidden data tables so the page is still useful.
      $all(".fig table.vh").forEach(function(t){t.classList.remove("vh");});
      return;
    }
    drawCharts();
    window.addEventListener("resize",function(){
      Object.keys(CHARTS).forEach(function(k){if(CHARTS[k])CHARTS[k].resize();});
    });
  }

  /* ============ data load + boot ============ */
  function boot(){
    observeCountUps();
    wireCopy();
    initDial();
    var needsData=$("#lb-table")||$("#fig-scatter")||$("#fig-donut");
    if(!needsData)return;
    // Prefer inlined data (instant, offline-safe); fall back to fetch.
    if(window.GLASSBENCH_DATA){
      DATA=window.GLASSBENCH_DATA; delete DATA.weights;
      initBoard(); initCharts(); return;
    }
    fetch("leaderboard.json").then(function(r){return r.json();}).then(function(j){
      DATA=j; delete DATA.weights; initBoard(); initCharts();
    }).catch(function(){ /* static table already renders; nothing to do */ });
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);
  else boot();
})();
"""


# ======================================================================================
# 12. Build orchestration
# ======================================================================================

ECHARTS_CDN = '<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js" defer></script>\n'
APP_JS_TAG = '<script src="app.js" defer></script>\n'


def _inline_data_tag() -> str:
    """Inline the verified data so the board/charts work instantly and offline.

    app.js prefers this over fetch(); the committed leaderboard.json is still emitted
    for direct download / external consumers. Both are byte-derived from the same
    Python literal, so they cannot disagree.
    """
    payload = json.dumps(LEADERBOARD_DATA, separators=(",", ":"))
    payload = payload.replace("</", "<\\/")  # be safe inside a <script> block
    return f'<script id="gb-data">window.GLASSBENCH_DATA={payload};</script>\n'


def build_overview() -> str:
    body = render_overview()
    extra_body = APP_JS_TAG
    return page_shell(
        title="GlassBench",
        subtitle="Does it know when it didn't?",
        active_html="index.html",
        body=body,
        extra_body=extra_body,
        main_class="wrap",
    )


def build_leaderboard() -> str:
    body = render_leaderboard_body()
    extra_body = _inline_data_tag() + ECHARTS_CDN + APP_JS_TAG
    return page_shell(
        title="Leaderboard",
        subtitle="GlassBench v0.1 — the ranked board",
        active_html="leaderboard.html",
        body=body,
        extra_body=extra_body,
        main_class="wrap",
    )


def build_datasheet() -> str:
    src_path = os.path.join(_REPO_ROOT, "DATASHEET.md")
    with open(src_path, "r", encoding="utf-8") as fh:
        md = fh.read()
    body, h1 = markdown_to_html(md)
    body = promote_datasheet_sections(body)
    # Inject the split-count donut right after the "## 1. At a glance" section so the
    # small-N caveat is grounded by the chart, without editing the Markdown source.
    donut = render_split_donut()
    m = re.search(r'(<h2 id="2-motivation">)', body)
    if m:
        body = body[: m.start()] + donut + "\n" + body[m.start():]
    else:
        body = body + "\n" + donut
    body = f'<div class="prose">{body}</div>'
    extra_body = _inline_data_tag() + ECHARTS_CDN + APP_JS_TAG
    return page_shell(
        title=h1 or "Datasheet",
        subtitle="Dataset card & construction",
        active_html="datasheet.html",
        body=body,
        extra_body=extra_body,
        main_class="wrap",
    )


def build(out_dir: str) -> None:
    os.makedirs(out_dir, exist_ok=True)

    pages = {
        "index.html": build_overview(),
        "leaderboard.html": build_leaderboard(),
        "datasheet.html": build_datasheet(),
    }
    for name, content in pages.items():
        with open(os.path.join(out_dir, name), "w", encoding="utf-8") as fh:
            fh.write(content)
        sys.stderr.write(f"wrote {name}\n")

    with open(os.path.join(out_dir, "style.css"), "w", encoding="utf-8") as fh:
        fh.write(STYLE_CSS)
    sys.stderr.write("wrote style.css\n")

    with open(os.path.join(out_dir, "app.js"), "w", encoding="utf-8") as fh:
        fh.write(APP_JS)
    sys.stderr.write("wrote app.js\n")

    # The verified leaderboard data as a committed static file (no vestigial weights).
    data = dict(LEADERBOARD_DATA)
    data.pop("weights", None)
    with open(os.path.join(out_dir, "leaderboard.json"), "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
        fh.write("\n")
    sys.stderr.write("wrote leaderboard.json\n")


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
