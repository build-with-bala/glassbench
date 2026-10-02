'use client'

import { useRef } from 'react'
import type { BoardData, BoardSystem } from '../../lib/board-data'
import { formatMetric } from '../../lib/format'
import { OUTCOME_KEYS, OUTCOME_STYLE, SPLIT_KEYS, SPLIT_LABEL } from '../../lib/outcomes'
import type { Outcome, Split } from '../../lib/types'
import { boardStore, type Highlight } from '../world/store'
import css from './board.module.css'

/* The controls of the board as an instrument: which system it shows, that system's
 * published numbers, a legend that doubles as a filter, and the view. Everything shown
 * is a value the pipeline wrote; nothing is computed here. */

/* ---- system picker: a radio group, one tab stop, arrows move ---------------- */
export function SystemPicker({
  systems,
  value,
  onChange,
  label = 'System on the board',
}: {
  systems: BoardSystem[]
  value: string
  onChange: (system: string) => void
  label?: string
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const move = (from: number, delta: number) => {
    const next = (from + delta + systems.length) % systems.length
    // the keyboard is choosing now: drop any preview left by a resting pointer
    boardStore.setPreview(null)
    onChange(systems[next].name)
    refs.current[next]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} className={css.systems}>
      {systems.map((s, i) => (
        <button
          key={s.name}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="button"
          role="radio"
          aria-checked={s.name === value}
          tabIndex={s.name === value ? 0 : -1}
          className={css.system}
          onClick={() => onChange(s.name)}
          onPointerEnter={(e) => {
            if (e.pointerType === 'mouse') boardStore.setPreview({ system: s.name })
          }}
          onPointerLeave={() => boardStore.setPreview(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault()
              move(i, 1)
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault()
              move(i, -1)
            }
          }}
        >
          {s.name}
          <span className={css.systemRank}>
            {s.kind === 'ranked' ? `#${s.rank}` : 'ref'}
            <span className="sr-only">{s.kind === 'ranked' ? ` rank ${s.rank}` : ' reference, not ranked'}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

/* ---- the selected system's published numbers -------------------------------- */
export function Readout({ system, items }: { system: BoardSystem; items: number }) {
  return (
    <dl className={css.readout} aria-label={`${system.name}: published results`}>
      <div className={css.cool}>
        <dt>Glass score</dt>
        <dd>{formatMetric('glass_score', system.glass_score)}</dd>
      </div>
      <div className={css.hot}>
        <dt>Confidently wrong</dt>
        <dd>{formatMetric('cwr', system.cwr)}</dd>
      </div>
      <div>
        <dt>Answered</dt>
        <dd>
          {system.answered}
          <span style={{ fontSize: '0.55em', color: 'var(--faint)', letterSpacing: 0 }}> / {items}</span>
        </dd>
      </div>
      <div>
        <dt>{system.kind === 'ranked' ? 'Rank' : 'Standing'}</dt>
        <dd>{system.kind === 'ranked' ? system.rank : 'ref'}</dd>
      </div>
    </dl>
  )
}

/* ---- legend chips: read the board, and filter it ---------------------------- */
export type LegendValue = { kind: 'outcome'; key: Outcome } | { kind: 'split'; key: Split } | null

export function legendHighlight(v: LegendValue): Highlight {
  if (!v) return null
  return v.kind === 'outcome' ? { outcome: v.key } : { splits: [v.key] }
}

const TONE: Record<Outcome, string> = {
  correct: 'cool',
  wrong: 'warn',
  confidently_wrong: 'hot',
  abstained_ok: 'frost',
  abstained_missed: 'frost',
}

/** What a cell with this outcome looks like on the board, in words (for titles). */
export const OUTCOME_ON_BOARD: Record<Outcome, string> = {
  correct: 'clear glass, blue light inside',
  wrong: 'clear glass, a dull warm coal',
  confidently_wrong: 'clear glass, burning',
  abstained_ok: 'frosted glass, dark',
  abstained_missed: 'frosted glass, a trace of blue behind the frost',
}

export function Legend({
  data,
  system,
  value,
  onChange,
}: {
  data: BoardData
  system: BoardSystem
  value: LegendValue
  onChange: (v: LegendValue) => void
}) {
  const splitCounts: Record<Split, number> = { answerable: 0, stale: 0, contradiction: 0, false_premise: 0 }
  for (const it of data.items) splitCounts[it.split]++
  const is = (v: LegendValue) => !!value && !!v && value.kind === v.kind && value.key === v.key
  const chip = (v: NonNullable<LegendValue>, glyph: string | null, label: string, count: number, tone: string, title: string) => (
    <li key={`${v.kind}-${v.key}`}>
      <button
        type="button"
        className={css.chip}
        data-tone={tone}
        aria-pressed={is(v)}
        title={title}
        onClick={() => onChange(is(v) ? null : v)}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') boardStore.setPreview({ highlight: legendHighlight(v) })
        }}
        onPointerLeave={() => boardStore.setPreview(null)}
        onFocus={() => boardStore.setPreview({ highlight: legendHighlight(v) })}
        onBlur={() => boardStore.setPreview(null)}
      >
        {glyph ? (
          <span className={css.chipGlyph} aria-hidden="true">
            {glyph}
          </span>
        ) : null}
        {label}
        <span className={css.chipCount}>
          <span className="sr-only">, </span>
          {count}
          <span className="sr-only"> items</span>
        </span>
      </button>
    </li>
  )
  return (
    <div style={{ display: 'grid', gap: '0.4rem' }}>
      <ul className={css.chips} aria-label="Outcomes: press to keep only these cells lit">
        {OUTCOME_KEYS.map((o) =>
          chip({ kind: 'outcome', key: o }, OUTCOME_STYLE[o].glyph, OUTCOME_STYLE[o].label, system.counts[o], TONE[o], `On the board: ${OUTCOME_ON_BOARD[o]}`),
        )}
      </ul>
      <ul className={css.chips} aria-label="Splits: press to keep only these cells lit">
        {SPLIT_KEYS.map((s) => chip({ kind: 'split', key: s }, null, SPLIT_LABEL[s], splitCounts[s], 'split', `The ${SPLIT_LABEL[s]} items`))}
      </ul>
    </div>
  )
}

/* ---- view: the keyboard / touch path for turning the board ------------------ */
export function ViewControls() {
  return (
    <div className={css.view} role="group" aria-label="Turn the board">
      <button type="button" className={css.viewBtn} aria-label="Turn the board left" title="Turn left" onClick={() => boardStore.turnBy(-0.2)}>
        <span aria-hidden="true">↺</span>
      </button>
      <button type="button" className={css.viewBtn} aria-label="Reset the view" title="Reset view" onClick={() => boardStore.resetTurn()}>
        <span aria-hidden="true">◎</span>
      </button>
      <button type="button" className={css.viewBtn} aria-label="Turn the board right" title="Turn right" onClick={() => boardStore.turnBy(0.2)}>
        <span aria-hidden="true">↻</span>
      </button>
    </div>
  )
}
