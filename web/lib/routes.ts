import type { Outcome, Split } from './types'
import { isOutcome, isSplit } from './outcomes'

/* URL builders and URL-state parsing for the platform routes. Client-safe (no data). */

/** A system's page. System names are submission folder names. */
export function systemHref(system: string): string {
  return `/systems/${encodeURIComponent(system)}`
}

/** An item's page in the explorer. */
export function itemHref(id: string): string {
  return `/explore/${encodeURIComponent(id)}`
}

/** The compare view for two systems. */
export function compareHref(a: string, b: string): string {
  return `/compare?${new URLSearchParams({ a, b }).toString()}`
}

/* ---- /explore filter state <-> query string ------------------------------- */

export interface ExploreFilters {
  split: Split | 'all'
  outcome: Outcome | 'all'
  /** A system name, or 'any' = at least one system had that outcome. */
  system: string
  q: string
}

export const DEFAULT_EXPLORE_FILTERS: ExploreFilters = { split: 'all', outcome: 'all', system: 'any', q: '' }

type ParamSource = { get(name: string): string | null }

/** Read explorer filters from a query string, ignoring anything unrecognised. */
export function parseExploreFilters(params: ParamSource, systems: readonly string[]): ExploreFilters {
  const split = params.get('split')
  const outcome = params.get('outcome')
  const system = params.get('system')
  return {
    split: isSplit(split) ? split : 'all',
    outcome: isOutcome(outcome) ? outcome : 'all',
    system: system && systems.includes(system) ? system : 'any',
    q: (params.get('q') ?? '').slice(0, 200),
  }
}

/** Query string for a filter state; defaults are omitted so the plain URL stays clean. */
export function exploreQuery(f: ExploreFilters): string {
  const p = new URLSearchParams()
  if (f.split !== 'all') p.set('split', f.split)
  if (f.outcome !== 'all') p.set('outcome', f.outcome)
  if (f.system !== 'any') p.set('system', f.system)
  if (f.q.trim()) p.set('q', f.q.trim())
  const s = p.toString()
  return s ? `?${s}` : ''
}

export function exploreHref(f: Partial<ExploreFilters>): string {
  return `/explore${exploreQuery({ ...DEFAULT_EXPLORE_FILTERS, ...f })}`
}

/* ---- /compare state <-> query string -------------------------------------- */

export type DisagreementMode = 'all' | 'a_right' | 'b_right' | 'routing'

export const DISAGREEMENT_MODES: readonly DisagreementMode[] = ['all', 'a_right', 'b_right', 'routing']

export interface CompareState {
  a: string
  b: string
  show: DisagreementMode
}

/** Read the compared pair from a query string. Unknown or missing names fall back to
 *  the first two systems on the board, and A and B are never the same system. */
export function parseCompareState(params: ParamSource, systems: readonly string[]): CompareState {
  const known = (v: string | null): v is string => v !== null && systems.includes(v)
  const rawA = params.get('a')
  const rawB = params.get('b')
  let a = known(rawA) ? rawA : (systems[0] ?? '')
  let b = known(rawB) ? rawB : (systems.find((s) => s !== a) ?? '')
  if (a === b) {
    const other = systems.find((s) => s !== a) ?? ''
    if (known(rawB) && !known(rawA)) a = other
    else b = other
  }
  const show = params.get('show')
  return {
    a,
    b,
    show: (DISAGREEMENT_MODES as readonly string[]).includes(show ?? '') ? (show as DisagreementMode) : 'all',
  }
}

export function compareQuery(s: CompareState): string {
  const p = new URLSearchParams({ a: s.a, b: s.b })
  if (s.show !== 'all') p.set('show', s.show)
  return `?${p.toString()}`
}
