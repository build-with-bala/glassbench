'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resultAt, type BoardData } from '../../lib/board-data'
import { OUTCOME_STYLE, SPLIT_LABEL, describeResult, formatConfidence } from '../../lib/outcomes'
import { itemHref } from '../../lib/routes'
import { createPlate } from '../world/plate'
import { resolveBoard } from '../world/resolve'
import { RECT_STRIDE, boardBridge, boardStore, effectiveRequest, useBoardState } from '../world/store'
import css from './board.module.css'

/* The board's DOM layer: one real link per glass cell, laid exactly over it.

   The canvas never takes a pointer event (its wrapper is pointer-events:none). These
   links do the hit-testing instead, which makes every piece hoverable, focusable and
   clickable the ordinary way — middle-click, "open in new tab" and screen readers all
   work — and keeps every other DOM control clickable above the world.

   The scene publishes each cell's on-screen rectangle (boardBridge); a rAF loop here
   moves the links to match. One tab stop: arrow keys walk the plate, Enter opens the
   item. The same layer handles dragging the board round. */

const DRAG_THRESHOLD = 6

export function BoardOverlay({ data, system }: { data: BoardData; system: string }) {
  const plate = useMemo(() => createPlate(data.items.map((it) => it.split)), [data])
  const state = useBoardState()
  const { tier, hover } = state
  const resolved = useMemo(() => resolveBoard(data, effectiveRequest(state)), [data, state])
  const refs = useRef<Array<HTMLAnchorElement | null>>([])
  const layerRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useState(0) // the roving tab stop (item index)
  const [pinned, setPinned] = useState<string | null>(null) // coarse pointers: tapped once
  const dragged = useRef(false)
  const live = tier === 'full' || tier === 'reduced'

  /* ---- follow the cells ---- */
  useEffect(() => {
    if (!live) return
    let raf = 0
    let seen = -1
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const rects = boardBridge.rects
      if (!rects || boardBridge.frame === seen) return
      seen = boardBridge.frame
      const els = refs.current
      for (let i = 0; i < els.length; i++) {
        const el = els[i]
        if (!el) continue
        const k = i * RECT_STRIDE
        el.style.transform = `translate3d(${rects[k].toFixed(1)}px,${rects[k + 1].toFixed(1)}px,0)`
        el.style.width = `${rects[k + 2].toFixed(1)}px`
        el.style.height = `${rects[k + 3].toFixed(1)}px`
        el.style.zIndex = String(rects[k + 4])
      }
      if (layerRef.current) layerRef.current.dataset.ready = 'true'
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [live])

  /* ---- the readout card follows the hovered / focused cell ---- */
  const hoverIndex = hover ? data.items.findIndex((it) => it.id === hover) : -1
  useEffect(() => {
    const tip = tipRef.current
    const rects = boardBridge.rects
    if (!tip || !rects || hoverIndex < 0) return
    const k = hoverIndex * RECT_STRIDE
    const w = tip.offsetWidth
    const h = tip.offsetHeight
    const cx = rects[k] + rects[k + 2] / 2
    let left = Math.min(window.innerWidth - w - 12, Math.max(12, cx - w / 2))
    let top = rects[k + 1] - h - 14
    if (top < 76) top = rects[k + 1] + rects[k + 3] + 14
    if (top + h > window.innerHeight - 8) {
      // no room above or below (short viewports): sit beside the cell instead
      top = Math.max(76, Math.min(window.innerHeight - h - 8, rects[k + 1]))
      left = cx - w - 26 > 12 ? cx - w - 26 : cx + 26
    }
    tip.style.transform = `translate3d(${Math.round(left)}px,${Math.round(top)}px,0)`
  }, [hoverIndex, system])

  // leaving the page: nothing stays hovered, and the board goes back to its resting pose
  useEffect(
    () => () => {
      boardStore.setHover(null)
      boardStore.resetTurn()
    },
    [],
  )

  /* ---- drag to turn the board (bounded), on the empty background or on a cell ---- */
  useEffect(() => {
    if (!live) return
    let active = false
    let startX = 0
    let startY = 0
    let lastX = 0
    let lastY = 0
    let pointerId = -1
    const isBackground = (t: EventTarget | null) => {
      if (!(t instanceof Element)) return false
      if (t === document.documentElement || t === document.body) return true
      if (t.classList.contains('content-root')) return true
      return !!t.closest('[data-board-cell]')
    }
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !isBackground(e.target)) return
      active = true
      dragged.current = false
      pointerId = e.pointerId
      startX = lastX = e.clientX
      startY = lastY = e.clientY
    }
    const move = (e: PointerEvent) => {
      if (!active || e.pointerId !== pointerId) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      if (!dragged.current && Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_THRESHOLD) return
      if (!dragged.current) {
        dragged.current = true
        document.documentElement.classList.add('board-dragging')
        boardStore.setHover(null)
      }
      lastX = e.clientX
      lastY = e.clientY
      // a touch drag only turns sideways, so a vertical swipe still scrolls the page
      boardStore.turnBy(dx * 0.006, e.pointerType === 'touch' ? 0 : dy * 0.004)
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      active = false
      pointerId = -1
      document.documentElement.classList.remove('board-dragging')
      // the click that follows this release (if it lands on a cell) belongs to the
      // drag; anything later is a fresh click
      if (dragged.current) window.setTimeout(() => (dragged.current = false), 80)
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    document.documentElement.classList.add('board-live')
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      document.documentElement.classList.remove('board-live', 'board-dragging')
    }
  }, [live])

  /* ---- keyboard: one tab stop, arrows walk the plate ---- */
  const focusItem = useCallback((item: number) => {
    setCursor(item)
    refs.current[item]?.focus()
  }, [])

  const onKeyDown = (e: React.KeyboardEvent, item: number) => {
    const ci = plate.cellOfItem[item]
    const cell = plate.cells[ci]
    if (!cell) return
    const at = (col: number, row: number) => plate.cells.find((c) => c.col === col && c.row === row)
    let next: ReturnType<typeof at>
    switch (e.key) {
      case 'ArrowRight':
        next = at(cell.col + 1, cell.row)
        break
      case 'ArrowLeft':
        next = at(cell.col - 1, cell.row)
        break
      case 'ArrowDown':
        next = at(cell.col, cell.row + 1)
        break
      case 'ArrowUp':
        next = at(cell.col, cell.row - 1)
        break
      case 'Home':
        next = at(0, cell.row)
        break
      case 'End':
        next = [...plate.cells].reverse().find((c) => c.row === cell.row)
        break
      case '[':
        boardStore.turnBy(-0.16)
        e.preventDefault()
        return
      case ']':
        boardStore.turnBy(0.16)
        e.preventDefault()
        return
      case 'Escape':
        boardStore.setHover(null)
        setPinned(null)
        return
      default:
        return
    }
    e.preventDefault()
    if (next) focusItem(next.item)
  }

  if (!live) return null

  const hovered = hoverIndex >= 0 ? data.items[hoverIndex] : null
  const hoveredResult = hovered ? resultAt(data, system, hoverIndex) : undefined

  return (
    <>
      <div
        ref={layerRef}
        className={css.layer}
        role="group"
        aria-label={`The board: ${system} on each of the ${data.items.length} items. Arrow keys move between items, Enter opens one, [ and ] turn the board.`}
      >
        {data.items.map((item, i) => {
          const r = resultAt(data, system, i)
          return (
            <Link
              key={item.id}
              ref={(el) => {
                refs.current[i] = el
              }}
              href={itemHref(item.id)}
              prefetch={false}
              className={css.cell}
              data-board-cell={item.id}
              data-outcome={r?.outcome}
              data-lit={resolved.lit[i]}
              tabIndex={i === cursor ? 0 : -1}
              aria-label={`${item.id}, ${SPLIT_LABEL[item.split]}. ${r ? describeResult(r) : ''}`}
              aria-describedby={hover === item.id ? 'board-tip' : undefined}
              draggable={false}
              onPointerEnter={(e) => {
                if (e.pointerType === 'mouse' && !dragged.current) boardStore.setHover(item.id)
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === 'mouse' && boardStore.get().hover === item.id) boardStore.setHover(null)
              }}
              onFocus={() => {
                setCursor(i)
                boardStore.setHover(item.id)
              }}
              onBlur={() => {
                if (boardStore.get().hover === item.id && pinned !== item.id) boardStore.setHover(null)
              }}
              onKeyDown={(e) => onKeyDown(e, i)}
              onClick={(e) => {
                if (dragged.current) {
                  // the press turned the board; it was not a click on this cell
                  e.preventDefault()
                  dragged.current = false
                  return
                }
                // touch: the first tap shows what the cell is, the second opens it
                // (detail 0 = activated from a keyboard, which has already read the cell)
                const coarse = window.matchMedia('(pointer: coarse)').matches
                if (coarse && e.detail !== 0 && pinned !== item.id) {
                  e.preventDefault()
                  setPinned(item.id)
                  boardStore.setHover(item.id)
                }
              }}
            />
          )
        })}
      </div>

      <div
        ref={tipRef}
        id="board-tip"
        role="tooltip"
        className={css.tip}
        data-open={hovered && hoveredResult ? 'true' : 'false'}
      >
        {hovered && hoveredResult ? (
          <>
            <div className={css.tipTop}>
              <span className={css.tipId}>{hovered.id}</span>
              <span className={css.tipSplit}>{SPLIT_LABEL[hovered.split]}</span>
            </div>
            <p className={css.tipQuery}>{hovered.query}</p>
            <div className={css.tipResult} data-outcome={hoveredResult.outcome}>
              <span className={css.tipGlyph} aria-hidden="true">
                {OUTCOME_STYLE[hoveredResult.outcome].glyph}
              </span>
              <span className={css.tipOutcome}>{OUTCOME_STYLE[hoveredResult.outcome].label}</span>
              <span className={css.tipConf}>
                <span className={css.tipConfLabel}>confidence</span> {formatConfidence(hoveredResult)}
              </span>
            </div>
            <p className={css.tipHint}>
              {pinned === hovered.id ? (
                <Link href={itemHref(hovered.id)} className={css.tipOpen} prefetch={false}>
                  Open item <span aria-hidden="true">→</span>
                </Link>
              ) : (
                <>
                  <span className={css.tipSystem}>{system}</span> · click to open the item
                </>
              )}
            </p>
          </>
        ) : null}
      </div>
    </>
  )
}
