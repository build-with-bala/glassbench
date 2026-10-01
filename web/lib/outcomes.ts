import type { AbstentionKind, Outcome, PublicItemResult, Split } from './types'
import type { Tint } from './color-ramp'

/* Client-safe presentation vocabulary for outcomes and splits: keys, labels, glyphs and
 * tints. No data is imported here, so client components can use it freely.
 *
 * The outcome of a (system, item) pair is decided by the Python scorer and arrives in
 * item_results.json — nothing in this file decides or recomputes one. */

export const OUTCOME_KEYS: readonly Outcome[] = [
  'correct',
  'wrong',
  'confidently_wrong',
  'abstained_ok',
  'abstained_missed',
]

export const SPLIT_KEYS: readonly Split[] = ['answerable', 'stale', 'contradiction', 'false_premise']

export const UNANSWERABLE_SPLITS: readonly Split[] = ['contradiction', 'false_premise']

export function isOutcome(v: unknown): v is Outcome {
  return typeof v === 'string' && (OUTCOME_KEYS as readonly string[]).includes(v)
}

export function isSplit(v: unknown): v is Split {
  return typeof v === 'string' && (SPLIT_KEYS as readonly string[]).includes(v)
}

interface OutcomeStyle {
  /** Short label used in badges and filters. */
  label: string
  /** A shape that differs per outcome, so colour is never the only signal. */
  glyph: string
  tint: Tint | 'neutral'
}

export const OUTCOME_STYLE: Record<Outcome, OutcomeStyle> = {
  correct: { label: 'Correct', glyph: '✓', tint: 'good' },
  wrong: { label: 'Wrong', glyph: '✕', tint: 'warn' },
  confidently_wrong: { label: 'Confidently wrong', glyph: '‼', tint: 'danger' },
  abstained_ok: { label: 'Abstained · right call', glyph: '○', tint: 'good' },
  abstained_missed: { label: 'Abstained · missed', glyph: '◌', tint: 'neutral' },
}

export const SPLIT_LABEL: Record<Split, string> = {
  answerable: 'answerable',
  stale: 'stale',
  contradiction: 'contradiction',
  false_premise: 'false-premise',
}

/** What the honest behaviour on each split is (README "The four splits"). */
export const SPLIT_HONEST: Record<Split, string> = {
  answerable: 'The fact is determinable from the history — the honest move is to answer.',
  stale: 'The fact was stated long ago and may have drifted — answer, with confidence that reflects its age.',
  contradiction: 'The fact was asserted and then retracted with no replacement — the honest move is to abstain.',
  false_premise: 'The query asks about something never stated — the honest move is to abstain.',
}

export const ABSTENTION_LABEL: Record<AbstentionKind, string> = {
  explicit: 'explicit abstain',
  low_confidence: 'confidence below 0.5, scored as an abstention',
  missing: 'item omitted, scored as an abstention',
}

/** Confidence as shown next to an outcome. An explicit or missing abstention has no
 *  stated confidence (the scorer books it as 0), so it reads as a dash. */
export function formatConfidence(r: Pick<PublicItemResult, 'confidence' | 'abstention'>): string {
  if (r.abstention === 'explicit' || r.abstention === 'missing') return '—'
  return r.confidence.toFixed(2)
}

/** One-line plain-language description of a result, for screen readers and titles. */
export function describeResult(r: PublicItemResult): string {
  const label = OUTCOME_STYLE[r.outcome].label
  if (r.abstention === 'explicit') return `${label} (explicit abstention)`
  if (r.abstention === 'missing') return `${label} (item omitted)`
  if (r.abstention === 'low_confidence') {
    return `${label} (stated confidence ${r.confidence.toFixed(2)}, below 0.5, scored as an abstention)`
  }
  return `${label} (confidence ${r.confidence.toFixed(2)})`
}
