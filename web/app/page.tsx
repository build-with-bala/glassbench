import { getLeaderboard } from '../lib/glassbench-data'
import { Hero } from '../components/story/Hero'
import { CwrStrip } from '../components/story/CwrStrip'
import { SplitMatrix } from '../components/story/SplitMatrix'
import { FormulaSchematic } from '../components/story/FormulaSchematic'
import { ConfidenceDial } from '../components/story/ConfidenceDial'
import { Reveal } from '../components/motion/Reveal'

export default function Home() {
  const d = getLeaderboard()
  const glassLeader = d.ranked.reduce((m, r) => Math.max(m, r.glass_score), 0)
  // Best CWR among systems that actually answer — a system that never answers
  // trivially scores CWR 0, which would understate the difficulty.
  const answerers = d.ranked.filter((r) => r.answered > 0)
  const bestCwr = (answerers.length ? answerers : d.ranked).reduce((m, r) => Math.min(m, r.cwr), Infinity)
  const systems = d.ranked.map((r) => ({ system: r.system, cwr: r.cwr }))

  return (
    <main id="main" style={{ maxWidth: 1080, margin: '0 auto', padding: '1rem clamp(0.8rem, 3vw, 1.6rem) 0' }}>
      <Hero glassLeader={glassLeader} bestCwr={bestCwr} items={d.n_items} />
      <Reveal>
        <CwrStrip systems={systems} max={0.7} />
      </Reveal>
      <Reveal>
        <SplitMatrix counts={d.split_counts} />
      </Reveal>
      <Reveal>
        <FormulaSchematic formula={d.glass_score_formula} />
      </Reveal>
      <Reveal>
        <ConfidenceDial />
      </Reveal>
    </main>
  )
}
