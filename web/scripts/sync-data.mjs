// Refreshes the deployable data snapshot in web/data/ from the scorer's output.
// The Python scorer pipeline is the source of truth. When the scorer artifacts
// aren't reachable (e.g. a Docker build whose context is just web/), we keep the
// committed snapshot in web/data/ instead of failing — so the build stays
// self-contained while local/CI builds always refresh from the scorer.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const pairs = [
  ['../site/dist/leaderboard.json', 'data/leaderboard.json'],
  ['../DATASHEET.md', 'data/DATASHEET.md'],
]

let refreshed = 0
for (const [rel, out] of pairs) {
  const src = resolve(process.cwd(), rel)
  const dst = resolve(process.cwd(), out)
  if (existsSync(src)) {
    mkdirSync(dirname(dst), { recursive: true })
    copyFileSync(src, dst)
    console.log(`[sync-data] ${rel} → ${out}`)
    refreshed++
  } else if (existsSync(dst)) {
    console.log(`[sync-data] scorer source missing for ${out}; using committed snapshot`)
  } else {
    console.error(`[sync-data] FATAL: no scorer source and no snapshot for ${out}`)
    process.exit(1)
  }
}
console.log(`[sync-data] done (${refreshed}/${pairs.length} refreshed from scorer)`)
