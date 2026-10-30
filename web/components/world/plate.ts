import { SPLIT_KEYS } from '../../lib/outcomes'
import type { Outcome, Split } from '../../lib/types'

/* The plate: one glass cell per benchmark item, close-packed like rods in a rack.

   Pure layout and vocabulary (no three.js, no DOM) so it can be unit-tested.

   What a cell means
     height   the confidence the system stated for that item
     clear    it answered            frosted   it abstained
     blue     the answer was right   ember     it was wrong — and burning when it was
                                               wrong at confidence >= the scorer's threshold
   A frosted cell with a trace of blue behind the frost is an abstention on an item
   that was answerable. Every one of those facts is read from the pipeline's
   item_results.json; this file only decides how each is drawn. */

export const PITCH = 1
export const ROW_PITCH = 0.866
export const CELL_RADIUS = 0.39
/** Body height of a cell at confidence 0 and at confidence 1. */
export const CELL_MIN_HEIGHT = 0.16
export const CELL_MAX_HEIGHT = 1.22
/** Rounded shoulder at the top of every cell (not stretched with the body). */
export const CELL_SHOULDER = 0.11
export const PLATE_MARGIN = 0.62
export const PLATE_THICKNESS = 0.2

export interface PlateCell {
  /** index into the item list (data order) */
  item: number
  col: number
  row: number
  x: number
  z: number
  /** texel centre of this cell in the state textures */
  u: number
  v: number
  split: Split
}

export interface Plate {
  cols: number
  rows: number
  cells: PlateCell[]
  /** item index -> cell index */
  cellOfItem: number[]
  /** footprint of the plate slab (centred on the origin) */
  width: number
  depth: number
}

/** Lay `splits.length` items out on the plate. Items keep their data order within a
 *  split and the splits sit side by side in their canonical order, so the items a
 *  system should answer (answerable, stale) and the ones it should refuse
 *  (contradiction, false-premise) form two readable regions. */
export function createPlate(splits: readonly Split[]): Plate {
  const n = splits.length
  if (n === 0) return { cols: 0, rows: 0, cells: [], cellOfItem: [], width: 0, depth: 0 }
  // 3:2-ish, like a lab plate: 96 items -> 12 x 8
  const cols = Math.max(1, Math.round(Math.sqrt(n * 1.5)))
  const rows = Math.ceil(n / cols)

  const order = splits
    .map((split, item) => ({ split, item }))
    .sort((a, b) => SPLIT_KEYS.indexOf(a.split) - SPLIT_KEYS.indexOf(b.split) || a.item - b.item)

  const cells: PlateCell[] = []
  const cellOfItem: number[] = new Array(n).fill(-1)
  order.forEach(({ split, item }, k) => {
    // column-major, so each split is a band running front to back
    const col = Math.floor(k / rows)
    const row = k % rows
    const stagger = row % 2 === 0 ? -0.25 : 0.25
    cellOfItem[item] = cells.length
    cells.push({
      item,
      col,
      row,
      x: (col - (cols - 1) / 2 + stagger) * PITCH,
      z: (row - (rows - 1) / 2) * ROW_PITCH,
      u: (col + 0.5) / cols,
      v: (row + 0.5) / rows,
      split,
    })
  })

  return {
    cols,
    rows,
    cells,
    cellOfItem,
    width: (cols - 1 + 0.5) * PITCH + 2 * (CELL_RADIUS + PLATE_MARGIN),
    depth: (rows - 1) * ROW_PITCH + 2 * (CELL_RADIUS + PLATE_MARGIN),
  }
}

/** How one cell is drawn. All four are 0..1. */
export interface CellLook {
  height: number
  frost: number
  /** calm blue light inside */
  cool: number
  /** ember inside; 1 = burning */
  heat: number
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)

/** A cell with no system selected: plain smoked glass, all one height. */
export const NEUTRAL_LOOK: CellLook = { height: 0.3, frost: 0, cool: 0, heat: 0 }

/** The look of a scored (system, item) pair. `outcome` is the scorer's label and
 *  `confidence` the submitted value — neither is re-derived here. */
export function lookFor(outcome: Outcome | undefined, confidence: number): CellLook {
  const height = clamp01(confidence)
  switch (outcome) {
    case 'correct':
      return { height, frost: 0, cool: 1, heat: 0 }
    case 'wrong':
      return { height, frost: 0, cool: 0, heat: 0.42 }
    case 'confidently_wrong':
      return { height, frost: 0, cool: 0, heat: 1 }
    case 'abstained_ok':
      return { height, frost: 1, cool: 0, heat: 0 }
    case 'abstained_missed':
      return { height, frost: 1, cool: 0.5, heat: 0 }
    default:
      return NEUTRAL_LOOK
  }
}

export function cellHeight(height01: number): number {
  return CELL_MIN_HEIGHT + (CELL_MAX_HEIGHT - CELL_MIN_HEIGHT) * clamp01(height01)
}
