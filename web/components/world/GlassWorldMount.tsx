'use client'

import dynamic from 'next/dynamic'
import { useBoardData } from './BoardDataProvider'

/** Client-only mount for the WebGL world. R3F's Canvas references React internals
 *  that crash during server prerender, so it must load with ssr:false — which is
 *  only permitted from a Client Component, hence this thin wrapper. */
const GlassWorld = dynamic(() => import('./GlassWorld').then((m) => m.GlassWorld), {
  ssr: false,
})

export function GlassWorldMount() {
  const data = useBoardData()
  return <GlassWorld data={data} />
}
