import Link from 'next/link'
import { getLeaderboard } from '../../lib/glassbench-data'
import { getResults } from '../../lib/results-data'
import { OUTCOME_STYLE } from '../../lib/outcomes'
import { pageMetadata } from '../../lib/metadata'
import { REPO_URL, SITE_URL } from '../../lib/site'
import { GlassPanel } from '../../components/ui/GlassPanel'
import { CopyButton } from '../../components/ui/CopyButton'
import { PageHead } from '../../components/platform/PageHead'
import { outcomeTintClass } from '../../components/platform/Badges'
import ui from '../../components/platform/ui.module.css'

export const metadata = pageMetadata({
  title: 'Data & API',
  description:
    'Public, static JSON endpoints for the GlassBench leaderboard and per-system, per-item results — so you can consume the numbers without scraping the site.',
  path: '/data',
})

interface Endpoint {
  path: string
  title: string
  what: string
  fields: Array<[string, string]>
  /** Gold-bearing endpoints get an extra caution. */
  gold?: boolean
}

export default function DataPage() {
  const board = getLeaderboard()
  const results = getResults()
  const exampleSystem = results.systems[0]?.system ?? 'agent_llm'
  const exampleItem = results.items[0]?.id ?? ''

  const endpoints: Endpoint[] = [
    {
      path: '/api/leaderboard.json',
      title: 'Leaderboard',
      what: 'The board exactly as the scorer pipeline wrote it — byte-identical to results/leaderboard.json in the repository.',
      fields: [
        ['metrics[]', 'key, label, direction (higher | lower), scored, tooltip — what each column means'],
        ['ranked[]', 'rank, system, every metric at its published precision, answered, abstained, type, description, reproduce'],
        ['references[]', 'constructed-from-gold ceilings, excluded from the ranking, with what_it_is and excluded_reason'],
        ['split_counts, n_items, version', 'the shape of the scored data version'],
      ],
    },
    {
      path: '/api/systems.json',
      title: 'All systems',
      what: 'Every scored system with its summary: board row, outcome counts, Glass Score pillars and per-split breakdown.',
      fields: [
        ['systems[].board', 'the published leaderboard row for the system'],
        ['systems[].outcome_counts', 'items per outcome (see the outcome definitions below)'],
        ['systems[].scores', 'the scorer’s metrics and diagnostics at 6 decimals'],
        ['systems[].pillars', 'answer, safety, harmonic_mean, cwr_penalty — the Glass Score decomposition'],
        ['systems[].by_split', 'per split: n, answered, abstained, outcome_counts, cwr, brier, ece, and accuracy or abstention_recall'],
        ['systems[].results_url', 'where that system’s per-item results live'],
      ],
    },
    {
      path: `/api/systems/${exampleSystem}.json`,
      title: 'One system, item by item',
      what: 'Everything in the systems index for one system, plus its system card and its outcome on each of the items. One document per system: /api/systems/<system>.json.',
      fields: [
        ['items[]', 'id, split, outcome, answered, abstention (explicit | low_confidence | missing | null), confidence, correct, confidently_wrong'],
        ['system_md', 'the submission’s system.md, verbatim'],
        ['predictions_file', 'link to the submitted predictions.json (the answer texts are there, not here)'],
      ],
    },
    {
      path: '/api/items.json',
      title: 'All items, all systems',
      what: 'The item × system outcome matrix: each item’s id, split and query with every system’s outcome on it.',
      fields: [
        ['items[].results.<system>', 'outcome, answered, abstention, confidence, correct, confidently_wrong'],
        ['systems[]', 'the systems, in board order'],
      ],
    },
    {
      path: `/api/items/${exampleItem}.json`,
      title: 'One item, with its gold answer',
      what: 'The detail an item page loads when you press “Reveal gold answer”. One document per item: /api/items/<id>.json.',
      fields: [
        ['gold_answer', 'the gold answer, or the literal "ABSTAIN" for an unanswerable item'],
        ['evidence_spans, answer_topic', 'the label fields of the item'],
        ['answers.<system>', 'the answer text each system stated (null if none)'],
      ],
      gold: true,
    },
  ]

  return (
    <main id="main" className={`${ui.page} ${ui.pageNarrow}`}>
      <PageHead eyebrow={`Data & API · v${board.version} · static JSON`} title="Take the numbers, not a screenshot">
        <p className={ui.lede}>
          Everything this site shows is a file the Python scorer pipeline wrote. The same files are served here as
          plain JSON — no key needed, CORS open — so you can plot, re-rank or audit GlassBench without
          scraping a page.
        </p>
      </PageHead>

      <section className={ui.section} aria-labelledby="endpoints-h">
        <h2 id="endpoints-h" className={ui.srOnly}>
          Endpoints
        </h2>
        <div className={ui.stack}>
          {endpoints.map((e) => {
            const url = `${SITE_URL}${e.path}`
            const curl = `curl -s ${url}`
            return (
              <GlassPanel key={e.path} className={ui.card}>
                <div className={ui.cardHead}>
                  <h3 className={ui.cardTitle}>{e.title}</h3>
                  <span className={`${ui.badge} ${e.gold ? ui.tintWarn : ''}`}>
                    GET · {e.gold ? 'contains gold · noindex' : 'static JSON'}
                  </span>
                </div>
                <p className={ui.cardSub}>{e.what}</p>
                <div className={ui.cmd}>
                  <code>{curl}</code>
                  <CopyButton text={curl} />
                </div>
                <p className={ui.small} style={{ margin: '0.6rem 0 0.9rem' }}>
                  <a className={`${ui.link} ${ui.mono}`} href={e.path}>
                    {e.path}
                  </a>
                </p>
                <dl className={ui.kv}>
                  {e.fields.map(([name, desc]) => (
                    <div key={name} style={{ display: 'contents' }}>
                      <dt>{name}</dt>
                      <dd className={ui.muted}>{desc}</dd>
                    </div>
                  ))}
                </dl>
                {e.gold ? (
                  <p className={`${ui.small} ${ui.muted}`} style={{ margin: '0.9rem 0 0' }}>
                    This is the only endpoint that carries gold answers. It is marked{' '}
                    <code className={ui.mono}>noindex</code> and disallowed in{' '}
                    <code className={ui.mono}>robots.txt</code>. Please do not mirror it into anything a model
                    might be trained on.
                  </p>
                ) : null}
              </GlassPanel>
            )
          })}
        </div>
      </section>

      <section className={ui.section} aria-labelledby="outcomes-h">
        <GlassPanel className={ui.card}>
          <h2 id="outcomes-h" className={ui.cardTitle}>
            Outcome vocabulary
          </h2>
          <p className={ui.cardSub}>
            Each (system, item) pair has exactly one <code className={ui.mono}>outcome</code>. The scorer treats a
            stated confidence below {results.thresholds.abstain_confidence} as an abstention, and counts a wrong
            answer at confidence ≥ {results.thresholds.confidently_wrong_confidence} as confidently wrong.
          </p>
          <dl className={ui.kv}>
            {results.outcomes.map((o) => (
              <div key={o.key} style={{ display: 'contents' }}>
                <dt>
                  <span className={`${ui.badge} ${outcomeTintClass(o.key)}`}>
                    <span className={ui.badgeGlyph} aria-hidden="true">
                      {OUTCOME_STYLE[o.key].glyph}
                    </span>
                    {o.key}
                  </span>
                </dt>
                <dd className={ui.muted}>{o.definition}</dd>
              </div>
            ))}
          </dl>
        </GlassPanel>
      </section>

      <section className={ui.section} aria-labelledby="rules-h">
        <GlassPanel className={ui.card}>
          <h2 id="rules-h" className={ui.cardTitle}>
            What to rely on
          </h2>
          <div className="datasheet-prose" style={{ maxWidth: 'none' }}>
          <ul>
            <li>
              <strong>The scorer is the source of truth.</strong> These documents are generated by{' '}
              <code>scripts/gen_leaderboard.py --json</code> and <code>scripts/export_results.py</code> from the
              committed submissions; the site only re-serves them. CI fails if they drift from the scorer.
            </li>
            <li>
              <strong>v{board.version} is frozen.</strong> The data, the metrics and the Glass Score formula do not
              change. Rows are added when a submission is merged; anything that would change a score ships as a new
              version.
            </li>
            <li>
              <strong>Rounding.</strong> The leaderboard carries each metric at its published precision. The
              per-system documents carry the scorer’s values at 6 decimals under <code>scores</code>; rounding
              those gives the leaderboard’s digits.
            </li>
            <li>
              <strong>No gold in the bulk endpoints.</strong> Outcomes and confidences are public; gold answers,
              histories and answer texts are not in <code>/api/systems*</code> or <code>/api/items.json</code>.
              The full benchmark data is in the{' '}
              <a href={`${REPO_URL}/blob/main/data/glassbench_v0.1.jsonl`} target="_blank" rel="noopener noreferrer">
                repository
              </a>
              .
            </li>
            <li>
              <strong>License.</strong> MIT, like the benchmark. If you publish with these numbers, cite GlassBench
              (BibTeX on the <Link href="/submit">submit page</Link>) and say which version you used.
            </li>
          </ul>
          </div>
        </GlassPanel>
      </section>

      <section className={ui.section} aria-labelledby="files-h">
        <GlassPanel className={ui.card}>
          <h2 id="files-h" className={ui.cardTitle}>
            Prefer files?
          </h2>
          <p className={ui.cardSub}>The same artifacts are committed in the repository:</p>
          <dl className={ui.kv}>
            <dt>results/leaderboard.json</dt>
            <dd className={ui.muted}>the board (what /api/leaderboard.json serves)</dd>
            <dt>results/item_results.json</dt>
            <dd className={ui.muted}>per-item outcomes for every system, including the stated answer texts</dd>
            <dt>LEADERBOARD.md</dt>
            <dd className={ui.muted}>the same board, for reading</dd>
            <dt>submissions/&lt;system&gt;/</dt>
            <dd className={ui.muted}>each system’s predictions.json and system.md</dd>
          </dl>
          <div className={ui.buttonRow} style={{ marginTop: '1rem' }}>
            <a className={ui.button} href={`${REPO_URL}/tree/main/results`} target="_blank" rel="noopener noreferrer">
              results/ on GitHub <span aria-hidden="true">↗</span>
            </a>
            <Link className={ui.button} href="/explore">
              Browse the items
            </Link>
          </div>
        </GlassPanel>
      </section>
    </main>
  )
}
