'use client'

import { useEffect, useId, useRef, useState, type DragEvent } from 'react'
import {
  decodeUtf8Strict,
  validatePredictionsText,
  type ValidationContext,
  type ValidationIssue,
  type ValidationReport,
} from '../../lib/validate-predictions'
import ui from '../platform/ui.module.css'
import css from './checker.module.css'

// A real predictions.json for 96 items is a few tens of kilobytes.
const MAX_BYTES = 5 * 1024 * 1024
// How many issues of one kind to list before folding the rest behind a button.
const FOLD_AT = 25

type Result =
  | { kind: 'idle' }
  | { kind: 'unreadable'; source: string; message: string }
  | { kind: 'report'; source: string; report: ValidationReport }

function IssueList({ title, tint, issues }: { title: string; tint: string; issues: ValidationIssue[] }) {
  const [all, setAll] = useState(false)
  if (issues.length === 0) return null
  const shown = all ? issues : issues.slice(0, FOLD_AT)
  return (
    <div>
      <h4 className={css.issuesHead}>
        {title} ({issues.length})
      </h4>
      <ul className={css.issues}>
        {shown.map((issue, i) => (
          <li key={i} className={css.issue}>
            <span className={`${ui.badge} ${tint}`}>{issue.row === null ? 'file' : `row ${issue.row}`}</span>
            <span className={css.issueMsg}>{issue.message}</span>
          </li>
        ))}
      </ul>
      {issues.length > FOLD_AT ? (
        <button type="button" className={ui.button} style={{ marginTop: '0.6rem' }} onClick={() => setAll((v) => !v)}>
          {all ? `Show the first ${FOLD_AT} only` : `Show all ${issues.length}`}
        </button>
      ) : null}
    </div>
  )
}

/** Check a predictions.json in the browser, with the same rules as
 *  scripts/validate_submission.py. Validation only — nothing is scored and nothing leaves
 *  the page: the file is read locally and never uploaded. */
export function PredictionsChecker({ context }: { context: ValidationContext }) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<Result>({ kind: 'idle' })
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const pasteId = useId()
  const hintId = useId()

  // A monotonically increasing id for "a check just finished" — the effect below moves
  // focus to the verdict after React has rendered it.
  const [checked, setChecked] = useState(0)
  const show = (next: Result) => {
    setResult(next)
    setChecked((n) => n + 1)
  }
  useEffect(() => {
    if (checked > 0) resultRef.current?.focus()
  }, [checked])

  const checkText = (value: string, source: string) => {
    show({ kind: 'report', source, report: validatePredictionsText(value, context) })
  }

  const checkFile = async (file: File) => {
    if (file.size > MAX_BYTES) {
      show({
        kind: 'unreadable',
        source: file.name,
        message: `This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. A predictions.json for ${context.ids.length} items is a few tens of kilobytes — this does not look like one.`,
      })
      return
    }
    const decoded = decodeUtf8Strict(await file.arrayBuffer())
    if (decoded === null) {
      show({ kind: 'unreadable', source: file.name, message: 'This file is not valid UTF-8 text.' })
      return
    }
    setText(decoded)
    checkText(decoded, file.name)
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void checkFile(file)
  }

  const reset = () => {
    setText('')
    setResult({ kind: 'idle' })
    if (fileRef.current) fileRef.current.value = ''
  }

  const report = result.kind === 'report' ? result.report : null
  const source = result.kind === 'idle' ? '' : result.source
  const stats = report?.stats ?? null
  // One short sentence for the always-mounted status line (screen readers).
  const announcement =
    result.kind === 'unreadable'
      ? `Not checked: ${result.message}`
      : report
        ? report.valid
          ? `Valid. ${report.warnings.length} warnings.`
          : `Invalid. ${report.errors.length} errors, ${report.warnings.length} warnings.`
        : ''

  return (
    <div>
      <div
        className={`${css.drop} ${dragging ? css.dropActive : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <p className={css.dropTitle}>Drop your predictions.json here</p>
        <label className={css.fileLabel}>
          <input
            ref={fileRef}
            className={css.fileInput}
            type="file"
            accept=".json,application/json"
            aria-describedby={hintId}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void checkFile(file)
            }}
          />
          <span className={`${ui.button} ${ui.buttonPrimary} ${css.fileButton}`}>Choose a file</span>
        </label>
        <p id={hintId} className={css.dropHint}>
          Checked in your browser. The file is never uploaded, and nothing here scores it.
        </p>
      </div>

      <div className={`${ui.field} ${css.or}`}>
        <label className={ui.label} htmlFor={pasteId}>
          …or paste the JSON
        </label>
        <textarea
          id={pasteId}
          className={ui.textarea}
          spellCheck={false}
          autoComplete="off"
          placeholder={'[\n  {"id": "gb-answerable-…", "answer": "Seattle", "confidence": 0.91},\n  {"id": "gb-contradiction-…", "abstain": true}\n]'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className={ui.buttonRow} style={{ marginTop: '0.7rem' }}>
        <button
          type="button"
          className={`${ui.button} ${ui.buttonPrimary}`}
          disabled={text.trim() === ''}
          onClick={() => checkText(text, 'pasted text')}
        >
          Check pasted JSON
        </button>
        <button type="button" className={ui.button} disabled={text === '' && result.kind === 'idle'} onClick={reset}>
          Clear
        </button>
      </div>

      <p className={ui.srOnly} role="status" aria-live="polite">
        {announcement}
      </p>

      <div
        ref={resultRef}
        tabIndex={-1}
        role="region"
        aria-label="Validation result"
        className={css.result}
        style={{ marginTop: '1.1rem' }}
      >
        {result.kind === 'unreadable' ? (
          <div className={`${css.verdict} ${ui.tintDanger}`} data-testid="verdict" data-verdict="unreadable">
            <span className={css.verdictWord}>
              <span aria-hidden="true">✕ </span>NOT CHECKED
            </span>
            <p className={css.verdictText}>
              {source}: {result.message}
            </p>
          </div>
        ) : null}

        {report ? (
          <>
            <div
              className={`${css.verdict} ${report.valid ? (report.warnings.length ? ui.tintWarn : ui.tintGood) : ui.tintDanger}`}
              data-testid="verdict"
              data-verdict={report.valid ? 'valid' : 'invalid'}
            >
              <span className={css.verdictWord}>
                <span aria-hidden="true">{report.valid ? '✓ ' : '✕ '}</span>
                {report.valid ? 'VALID' : 'INVALID'}
              </span>
              <p className={css.verdictText}>
                {report.valid
                  ? report.warnings.length
                    ? `${source} passes the submission contract, with ${report.warnings.length} ${report.warnings.length === 1 ? 'warning' : 'warnings'}.`
                    : `${source} passes the submission contract.`
                  : `${source} has ${report.errors.length} contract ${report.errors.length === 1 ? 'violation' : 'violations'} and would be rejected.`}
              </p>
            </div>

            {stats ? (
              <ul className={css.stats} aria-label="What the file contains">
                <li>
                  <span className={css.statN}>{stats.rows}</span>
                  <span className={css.statLabel}>rows</span>
                </li>
                <li>
                  <span className={css.statN}>{stats.answerRows}</span>
                  <span className={css.statLabel}>answer rows</span>
                </li>
                <li>
                  <span className={css.statN}>{stats.abstainRows}</span>
                  <span className={css.statLabel}>abstain rows</span>
                </li>
                <li>
                  <span className={css.statN}>
                    {stats.listed} / {stats.total}
                  </span>
                  <span className={css.statLabel}>data ids covered</span>
                </li>
              </ul>
            ) : null}

            {stats && stats.lowConfidenceAnswers > 0 ? (
              <p className={`${ui.small} ${ui.muted}`} style={{ margin: '0.8rem 0 0' }}>
                Note: {stats.lowConfidenceAnswers} answer{' '}
                {stats.lowConfidenceAnswers === 1 ? 'row has' : 'rows have'} a confidence below{' '}
                {context.abstainThreshold}. That is legal, but the scorer treats each as an abstention.
              </p>
            ) : null}

            <IssueList title="Errors" tint={ui.tintDanger} issues={report.errors} />
            <IssueList title="Warnings" tint={ui.tintWarn} issues={report.warnings} />

            <p className={`${ui.small} ${ui.muted}`} style={{ margin: '1rem 0 0' }}>
              {report.valid
                ? 'This is a format check, not a score. Score it locally with the command in step 4; CI runs the same validator and scorer on your pull request.'
                : 'Fix the errors above, then check again. CI runs the same validator on your pull request.'}
            </p>
          </>
        ) : null}
      </div>
    </div>
  )
}
