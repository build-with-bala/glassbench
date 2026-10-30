'use client'

import { createElement, type ReactNode } from 'react'
import { boardStore, useBoardBase, type BoardRequest } from '../world/store'

/* Glue between a page and the glass board behind it. Server pages drop these in to
 * say what the board should show; they render nothing of their own (BoardBinding) or
 * only the wrapper element they are asked to be (BoardHover). */

/** While mounted, the board shows this: a system's outcomes, and/or one item singled
 *  out. Omit `system` for the board's default (the leader). */
export function BoardBinding({ system, focus }: { system?: string | null; focus?: string }) {
  useBoardBase({ system, focus: focus ?? null }, `${system}|${focus}`)
  return null
}

/** Wraps a row / card: pointing at it or focusing inside it previews something on the
 *  board (another system's pattern, one item), and leaving it puts the page's own
 *  view back. Purely additive — the wrapped content keeps its own links and controls. */
export function BoardHover({
  as = 'div',
  system,
  focus,
  className,
  style,
  children,
}: {
  as?: 'div' | 'li' | 'span' | 'tr'
  system?: string
  focus?: string
  className?: string
  style?: React.CSSProperties
  children: ReactNode
}) {
  const show = () => {
    const preview: Partial<BoardRequest> = {}
    if (system !== undefined) preview.system = system
    if (focus !== undefined) preview.focus = focus
    boardStore.setPreview(preview)
  }
  const hide = () => boardStore.setPreview(null)
  return createElement(
    as,
    {
      className,
      style,
      onPointerEnter: (e: React.PointerEvent) => {
        if (e.pointerType !== 'touch') show()
      },
      onPointerLeave: hide,
      onFocus: show,
      onBlur: hide,
    },
    children,
  )
}
