import { getLeaderboard } from '../lib/glassbench-data'
import { Hero } from '../components/story/Hero'
import { HomeBoardProvider, StoryBeat } from '../components/story/HomeBoard'
import { CwrStrip } from '../components/story/CwrStrip'
import { SplitMatrix } from '../components/story/SplitMatrix'
import { FormulaSchematic } from '../components/story/FormulaSchematic'
import { ConfidenceDial } from '../components/story/ConfidenceDial'
import { Reveal } from '../components/motion/Reveal'

export default function Home() {
  const d = getLeaderboard()
  const systems = d.ranked.map((r) => ({ system: r.system, cwr: r.cwr }))

  return (
    <main id="main" className="home-main">
      <HomeBoardProvider>
        <Hero items={d.n_items} />
        {/* The story runs down the left and the board stays beside it. While the CWR
            section is being read the board keeps only the confidently-wrong cells lit;
            the cards and formula inputs further down are toggles for the same board. */}
        <div className="story">
          <StoryBeat board={{ highlight: { outcome: 'confidently_wrong' } }}>
            <Reveal>
              <CwrStrip systems={systems} max={0.7} />
            </Reveal>
          </StoryBeat>
          <Reveal>
            <SplitMatrix counts={d.split_counts} />
          </Reveal>
          <Reveal>
            <FormulaSchematic formula={d.glass_score_formula} />
          </Reveal>
          <Reveal>
            <ConfidenceDial />
          </Reveal>
        </div>
      </HomeBoardProvider>
    </main>
  )
}
