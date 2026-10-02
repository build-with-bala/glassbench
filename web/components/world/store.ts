'use client'

import { useEffect, useSyncExternalStore } from 'react'
import type { Outcome, Split } from '../../lib/types'

/* What the DOM asks the glass board to show, and what the board reports back.

   A tiny external store instead of React context: pages write to it from effects and
   event handlers, the WebGL scene reads it inside its frame loop without re-rendering,
   and DOM controls subscribe with useSyncExternalStore. */

export type Highlight =
  | null
  | { outcome: Outcome }
  | { splits: readonly Split[] }
  | { items: readonly string[] }

export interface BoardRequest {
  /** The system whose outcomes the cells take. `null` = neutral glass, `undefined` =
   *  the board's default (the leader). */
  system: string | null | undefined
  /** Cells to keep lit; everything else recedes. */
  highlight: Highlight
  /** One item singled out (the current item page, a hovered row). */
  focus: string | null
}

export type WorldTier = 'full' | 'reduced' | 'poster'

export interface BoardState {
  /** What the current page wants. */
  base: BoardRequest
  /** An override while a story section of the home page is the one being read. */
  story: Partial<BoardRequest> | null
  /** A transient override (a hovered row, a hovered legend chip). */
  preview: Partial<BoardRequest> | null
  /** The item under the pointer / keyboard focus on the board itself. */
  hover: string | null
  /** Reported by the world once it has mounted. */
  tier: WorldTier | null
  /** Bumped on every change of what the board shows (not on turn). */
  version: number
}

export const TURN_LIMIT = { azimuth: 0.62, elevation: 0.3 }

const EMPTY: BoardRequest = { system: undefined, highlight: null, focus: null }

let state: BoardState = {
  base: EMPTY,
  story: null,
  preview: null,
  hover: null,
  tier: null,
  version: 0,
}

const listeners = new Set<() => void>()

function commit(next: BoardState) {
  state = next
  listeners.forEach((l) => l())
}

const clamp = (v: number, lim: number) => Math.min(lim, Math.max(-lim, v))

/** How far the reader has turned the board from its resting pose (radians). Read by
 *  the scene every frame and by nothing in React, so it is kept out of the reactive
 *  state: dragging does not re-render anything. */
export const boardTurn = { azimuth: 0, elevation: 0 }

export const boardStore = {
  get: (): BoardState => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  /** Replace what the current page shows. Omitted fields fall back to the default. */
  setBase(request: Partial<BoardRequest>) {
    commit({ ...state, base: { ...EMPTY, ...request }, version: state.version + 1 })
  },
  resetBase() {
    commit({ ...state, base: EMPTY, story: null, preview: null, version: state.version + 1 })
  },
  setStory(story: Partial<BoardRequest> | null) {
    if (story === null && state.story === null) return
    commit({ ...state, story, version: state.version + 1 })
  },
  setPreview(preview: Partial<BoardRequest> | null) {
    if (preview === null && state.preview === null) return
    commit({ ...state, preview, version: state.version + 1 })
  },
  setHover(hover: string | null) {
    if (hover === state.hover) return
    commit({ ...state, hover, version: state.version + 1 })
  },
  turnBy(dAzimuth: number, dElevation = 0) {
    boardTurn.azimuth = clamp(boardTurn.azimuth + dAzimuth, TURN_LIMIT.azimuth)
    boardTurn.elevation = clamp(boardTurn.elevation + dElevation, TURN_LIMIT.elevation)
  },
  resetTurn() {
    boardTurn.azimuth = 0
    boardTurn.elevation = 0
  },
  setTier(tier: WorldTier | null) {
    if (tier === state.tier) return
    commit({ ...state, tier })
  },
}

/** The request the board should draw right now: the page's, with any preview on top. */
export function effectiveRequest(s: BoardState): BoardRequest {
  let merged = s.base
  // a story section fills in what the page has not chosen for itself: an explicit
  // choice (a pressed legend chip) is never overridden by scrolling
  if (s.story) {
    merged = {
      system: merged.system ?? s.story.system,
      highlight: merged.highlight ?? s.story.highlight ?? null,
      focus: merged.focus ?? s.story.focus ?? null,
    }
  }
  if (s.preview) merged = { ...merged, ...s.preview }
  return s.hover ? { ...merged, focus: s.hover } : merged
}

const serverSnapshot = state

export function useBoardState(): BoardState {
  return useSyncExternalStore(boardStore.subscribe, boardStore.get, () => serverSnapshot)
}

/* Scene -> DOM, outside React: where each item's cell is on screen. The scene writes
 * the rectangles when the camera or the heights move; the hero's overlay positions its
 * (real, focusable) links from them, so pieces can be hovered, focused and clicked
 * without the canvas ever taking a pointer event. */
export const boardBridge = {
  /** per item: left, top, width, height in CSS px, then a paint order (nearer = larger) */
  rects: null as Float32Array | null,
  /** bumped whenever `rects` changes */
  frame: 0,
}
export const RECT_STRIDE = 5

/** Declare what a page shows on the board for as long as the component is mounted.
 *  `key` must change whenever the request does (it is the effect dependency). */
export function useBoardBase(request: Partial<BoardRequest>, key: string) {
  useEffect(() => {
    boardStore.setBase(request)
    return () => boardStore.resetBase()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands in for the request's contents
  }, [key])
}
