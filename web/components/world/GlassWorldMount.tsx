'use client'

import dynamic from 'next/dynamic'
import type { BoardCounts } from './board'

/** Client-only mount for the WebGL world. R3F's Canvas references React internals
 *  that crash during server prerender, so it must load with ssr:false — which is
 *  only permitted from a Client Component, hence this thin wrapper. The split
 *  counts are handed down from the server layout so the scorer's JSON never ships
 *  in the client bundle. */
const GlassWorld = dynamic(() => import('./GlassWorld').then((m) => m.GlassWorld), {
  ssr: false,
})

export function GlassWorldMount({ counts }: { counts: BoardCounts }) {
  return <GlassWorld counts={counts} />
}
