'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { BoardData } from '../../lib/board-data'

/* The board's data (items, systems, each system's outcome and confidence per item),
 * handed down once from the server layout so the world, the hero instrument and the
 * command palette all read the same copy. It carries no gold and no answer text. */

const BoardDataContext = createContext<BoardData | null>(null)

export function BoardDataProvider({ data, children }: { data: BoardData; children: ReactNode }) {
  return <BoardDataContext.Provider value={data}>{children}</BoardDataContext.Provider>
}

export function useBoardData(): BoardData {
  const data = useContext(BoardDataContext)
  if (!data) throw new Error('useBoardData must be used inside <BoardDataProvider>')
  return data
}
