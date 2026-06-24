import { GlassPanel } from '../../components/ui/GlassPanel'
import { Reveal } from '../../components/motion/Reveal'
import { CopyButton } from '../../components/ui/CopyButton'

export const metadata = { title: 'Submit' }

interface Step {
  no: number
  title: string
  /** Either a shell command or a file path, shown in a mono code chip with copy. */
  code: string
  copyLabel?: string
  note: string
}

const STEPS: Step[] = [
  {
    no: 1,
    title: 'Get the data',
    code: 'python -m glassbench.build_data',
    note: 'Reproduces the committed JSONL byte-for-byte. Use only id, history, query at inference — reading gold_answer is rejected.',
  },
  {
    no: 2,
    title: 'Produce predictions',
    code: 'predictions.json',
    note: 'A JSON array, one row per id: {"id","answer","confidence"} or {"id","abstain":true}. Missing items score as abstentions.',
  },
  {
    no: 3,
    title: 'Validate',
    code: 'python scripts/validate_submission.py submissions/<system>/predictions.json',
    note: 'Catches duplicate ids and malformed rows before you score.',
  },
  {
    no: 4,
    title: 'Score locally',
    code: 'python -m glassbench.score --predictions submissions/<system>/predictions.json',
    note: 'Prints all six components + Glass + diagnostics. Two runs byte-identical.',
  },
  {
    no: 5,
    title: 'Open a PR',
    code: 'submissions/<system>/{predictions.json, system.md}',
    note: 'CI runs the scorer; a maintainer merges when green. Folder name (short, lowercase) becomes the leaderboard row.',
  },
]

const BIBTEX = `@misc{glassbench2025,
  title  = {GlassBench: Does Your Memory System Know When It Didn't Know?},
  author = {build-with-bala},
  year   = {2025},
  note   = {Derived from LongMemEval (Wu et al., ICLR 2025)},
  url    = {https://github.com/build-with-bala/glassbench}
}`

export default function SubmitPage() {
  return (
    <main id="main" style={{ maxWidth: 880, margin: '0 auto', padding: 'clamp(1.6rem, 4vw, 3rem) 1.5rem' }}>
      <Reveal>
        <GlassPanel className="submit-head">
          <div style={{ padding: 'clamp(1.4rem, 4vw, 2.6rem)' }}>
            <p className="mono" style={{ color: 'var(--cyan)', margin: 0, fontSize: '0.82rem', letterSpacing: '0.04em' }}>
              SUBMIT A SYSTEM
            </p>
            <h1 style={{ margin: '0.5rem 0 0.6rem', fontSize: 'clamp(1.9rem, 5vw, 3rem)', lineHeight: 1.06 }}>
              Five steps to the board
            </h1>
            <p style={{ color: 'var(--muted)', margin: 0, maxWidth: '64ch', lineHeight: 1.6 }}>
              Build the data, produce predictions, validate, score locally, open a PR. CI re-runs the
              scorer; a maintainer merges when it is green.
            </p>
          </div>
        </GlassPanel>
      </Reveal>

      <ol className="submit-steps" style={{ listStyle: 'none', margin: '1.4rem 0 0', padding: 0 }}>
        {STEPS.map((step, idx) => (
          <Reveal key={step.no} delay={idx * 60}>
            <GlassPanel className="submit-step">
              <div className="submit-step-inner">
                <div className="step-no mono" aria-hidden="true">
                  {String(step.no).padStart(2, '0')}
                </div>
                <div className="step-content">
                  <h2 className="step-title">{step.title}</h2>
                  <div className="step-cmd">
                    <code className="mono">{step.code}</code>
                    <CopyButton text={step.code} />
                  </div>
                  <p className="step-note">{step.note}</p>
                </div>
              </div>
            </GlassPanel>
          </Reveal>
        ))}
      </ol>

      <Reveal delay={120}>
        <GlassPanel className="submit-cite">
          <div className="submit-cite-inner">
            <div className="submit-cite-head">
              <h2 className="step-title" style={{ margin: 0 }}>
                Cite
              </h2>
              <CopyButton text={BIBTEX} label="copy BibTeX" />
            </div>
            <pre className="cite-pre">
              <code className="mono">{BIBTEX}</code>
            </pre>
            <p className="cite-credit">
              GlassBench · MIT License. Derived from{' '}
              <a href="https://github.com/xiaowu0162/longmemeval" target="_blank" rel="noopener noreferrer">
                LongMemEval
              </a>{' '}
              (ICLR 2025, MIT).
            </p>
          </div>
        </GlassPanel>
      </Reveal>
    </main>
  )
}
