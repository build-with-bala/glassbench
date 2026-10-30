'use client'

import { useEffect, useRef, useState } from 'react'
import type { ItemRevealPayload, PublicItemResult } from '../../lib/types'
import { describeResult } from '../../lib/outcomes'
import { OutcomeBadge } from '../platform/Badges'
import ui from '../platform/ui.module.css'
import css from './explore.module.css'

type State =
  | { status: 'hidden' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'shown'; data: ItemRevealPayload }

/** The gold answer, the evidence and what each system actually said — fetched only when
 *  the reader asks. None of it is in the page's HTML, so a crawler that reads the page
 *  does not pick up answers next to the question. */
export function ItemReveal({
  id,
  unanswerable,
  results,
}: {
  id: string
  unanswerable: boolean
  /** Each system's outcome on this item (no answer text), in board order. */
  results: Array<{ system: string; result: PublicItemResult }>
}) {
  const [state, setState] = useState<State>({ status: 'hidden' })
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const wasShown = useRef(false)

  // Revealing replaces the button with the answer panel (and hiding does the reverse), so
  // the focused element disappears. Move focus to what replaced it, after React has
  // committed the new content — otherwise keyboard and screen-reader users are dropped
  // back at the top of the page.
  useEffect(() => {
    if (state.status === 'shown') {
      panelRef.current?.focus()
      wasShown.current = true
    } else if (state.status === 'hidden' && wasShown.current) {
      buttonRef.current?.focus()
      wasShown.current = false
    }
  }, [state.status])

  const reveal = async () => {
    setState({ status: 'loading' })
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(id)}.json`)
      if (!res.ok) throw new Error(`the server answered ${res.status}`)
      const data = (await res.json()) as ItemRevealPayload
      if (data.id !== id || typeof data.gold_answer !== 'string') throw new Error('unexpected response')
      setState({ status: 'shown', data })
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : 'unknown error' })
    }
  }

  if (state.status !== 'shown') {
    return (
      <div>
        <p className={ui.cardSub}>
          Hidden by default. Revealing loads this item’s gold answer, its evidence span and each system’s answer
          text.
        </p>
        <div className={ui.buttonRow}>
          <button
            ref={buttonRef}
            type="button"
            className={`${ui.button} ${ui.buttonPrimary}`}
            onClick={reveal}
            disabled={state.status === 'loading'}
            aria-busy={state.status === 'loading'}
          >
            {state.status === 'loading' ? 'Loading…' : 'Reveal gold answer'}
          </button>
          <p className={ui.status} role="status" aria-live="polite">
            {state.status === 'error' ? `Could not load the answer (${state.message}). Try again.` : ''}
          </p>
        </div>
        <noscript>
          <p className={`${ui.small} ${ui.muted}`}>
            Revealing needs JavaScript. The gold answers are also in data/glassbench_v0.1.jsonl in the repository.
          </p>
        </noscript>
      </div>
    )
  }

  const { data } = state
  return (
    <div ref={panelRef} tabIndex={-1} className={css.revealGrid} aria-label="Gold answer and system answers">
      <div>
        <h3 className={css.revealHead}>The answer</h3>
        <p className={`${css.answer} ${css.gold}`} data-testid="gold-answer">
          {data.gold_answer}
        </p>
        {unanswerable ? (
          <p className={`${ui.small} ${ui.muted}`} style={{ margin: '0.4rem 0 0' }}>
            This item is unanswerable from its history: the only correct move is to abstain, and any answer counts
            as wrong.
          </p>
        ) : null}
      </div>

      <div>
        <h3 className={css.revealHead}>
          Evidence {data.evidence_spans.length === 1 ? 'span' : 'spans'} (verbatim from the history)
        </h3>
        {data.evidence_spans.length ? (
          <ul className={css.spans}>
            {data.evidence_spans.map((span, i) => (
              <li key={i} className={css.answer}>
                {span}
              </li>
            ))}
          </ul>
        ) : (
          <p className={`${ui.small} ${ui.muted}`} style={{ margin: 0 }}>
            None — this label rests on the absence of the queried fact.
          </p>
        )}
        <p className={`${ui.small} ${ui.faint}`} style={{ margin: '0.5rem 0 0' }}>
          answer_topic: <span className={ui.mono}>{data.answer_topic}</span>
        </p>
      </div>

      <div>
        <h3 className={css.revealHead}>What each system said</h3>
        <ul className={css.answers}>
          {results.map(({ system, result }) => {
            const answer = data.answers[system]
            return (
              <li key={system}>
                <div className={css.answerHead}>
                  <span className={ui.mono}>{system}</span>
                  <OutcomeBadge outcome={result.outcome} />
                  <span className={`${ui.small} ${ui.faint}`}>{describeResult(result)}</span>
                </div>
                {answer ? (
                  <p className={css.answer}>{answer}</p>
                ) : (
                  <p className={`${ui.small} ${ui.muted}`} style={{ margin: '0.3rem 0 0' }}>
                    No answer stated.
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <div>
        <button type="button" className={ui.button} onClick={() => setState({ status: 'hidden' })}>
          Hide again
        </button>
      </div>
    </div>
  )
}
