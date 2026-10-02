'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { defaultSystem } from '../../lib/board-data'
import { legendHighlight, type LegendValue } from '../board/BoardControls'
import { useBoardData } from '../world/BoardDataProvider'
import { boardStore, type BoardRequest } from '../world/store'

/* The home page's hold on the board: which system it shows and which legend chip is
 * pressed. Shared by the hero's controls and the story sections below it, so a system
 * picked in one place is the system shown everywhere on the page. */

interface HomeBoard {
  system: string
  setSystem: (name: string) => void
  legend: LegendValue
  setLegend: (v: LegendValue) => void
}

const Ctx = createContext<HomeBoard | null>(null)

export function HomeBoardProvider({ children }: { children: ReactNode }) {
  const data = useBoardData()
  const [system, setSystem] = useState(() => defaultSystem(data) ?? '')
  const [legend, setLegend] = useState<LegendValue>(null)

  useEffect(() => {
    boardStore.setBase({ system, highlight: legendHighlight(legend) })
  }, [system, legend])
  useEffect(() => () => boardStore.resetBase(), [])

  const value = useMemo(() => ({ system, setSystem, legend, setLegend }), [system, legend])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useHomeBoard(): HomeBoard {
  const v = useContext(Ctx)
  if (!v) throw new Error('useHomeBoard must be used inside <HomeBoardProvider>')
  return v
}

/** A story section. While it is the section being read (it crosses the middle of the
 *  viewport) the board takes `board` on top of the page's own request. */
export function StoryBeat({
  board,
  children,
  className,
}: {
  board: Partial<BoardRequest> | null
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const key = JSON.stringify(board)
  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) return
    let active = false
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !active) {
            active = true
            boardStore.setStory(board)
          } else if (!e.isIntersecting && active) {
            active = false
            // only clear what this beat set; a neighbour may already have taken over
            if (boardStore.get().story === board) boardStore.setStory(null)
          }
        }
      },
      // a thin band across the middle of the viewport: one beat at a time
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      if (active && boardStore.get().story === board) boardStore.setStory(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands in for `board`
  }, [key])
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
