import { defaultSystem, outcomeAt, type BoardData } from '../../lib/board-data'
import type { BoardRequest } from './store'

/* What a board request means for this data: which system's outcomes the cells take
 * and which items stay lit. Pure, so the scene, the DOM overlay and the tests all
 * agree on it. It only selects among outcomes the pipeline wrote. */

export interface ResolvedBoard {
  /** The system shown, or null for neutral glass. */
  system: string | null
  /** Per item (data order): does it stay lit? All true when nothing is highlighted. */
  lit: boolean[]
  litCount: number
  /** True when a highlight is narrowing the board. */
  filtered: boolean
  /** Index of the singled-out item, or -1. */
  focus: number
}

export function resolveBoard(data: BoardData, req: BoardRequest): ResolvedBoard {
  const wanted = req.system === undefined ? defaultSystem(data) : req.system
  const system = wanted && data.results[wanted] ? wanted : null
  const h = req.highlight
  let ids: Set<string> | null = null
  if (h && 'items' in h) ids = new Set(h.items)
  const lit = data.items.map((item, i) => {
    if (!h) return true
    if ('outcome' in h) return system !== null && outcomeAt(data, system, i) === h.outcome
    if ('splits' in h) return h.splits.includes(item.split)
    return ids!.has(item.id)
  })
  return {
    system,
    lit,
    litCount: lit.reduce((n, v) => n + (v ? 1 : 0), 0),
    filtered: h !== null,
    focus: req.focus ? data.items.findIndex((it) => it.id === req.focus) : -1,
  }
}
