// Refreshes the deployable data snapshot in web/data/ from the scorer pipeline's output.
//
// The Python scorer pipeline is the single source of truth and the only writer:
//   make leaderboard  ->  results/leaderboard.json   (scripts/gen_leaderboard.py --json)
//                         results/item_results.json  (scripts/export_results.py)
// This script only COPIES bytes — it never computes, rounds or reshapes a number.
//
// When the scorer artifacts aren't reachable (e.g. a Docker build whose context is just
// web/), we keep the committed snapshot in web/data/ instead of failing — so the build
// stays self-contained while local/CI builds always refresh from the scorer.
//
//   node scripts/sync-data.mjs           copy sources over the snapshot
//   node scripts/sync-data.mjs --check   fail (exit 1) if the committed snapshot is stale
import { copyFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const pairs = [
  ['../results/leaderboard.json', 'data/leaderboard.json'],
  ['../results/item_results.json', 'data/item_results.json'],
  ['../data/glassbench_v0.1.jsonl', 'data/glassbench_v0.1.jsonl'],
  ['../DATASHEET.md', 'data/DATASHEET.md'],
]

const check = process.argv.includes('--check')

let refreshed = 0
let stale = 0
for (const [rel, out] of pairs) {
  const src = resolve(process.cwd(), rel)
  const dst = resolve(process.cwd(), out)
  if (check) {
    if (!existsSync(src)) {
      console.log(`[sync-data] ${rel} not present; cannot check ${out}`)
    } else if (!existsSync(dst)) {
      console.error(`[sync-data] STALE: ${out} is missing (source: ${rel})`)
      stale++
    } else if (!readFileSync(src).equals(readFileSync(dst))) {
      console.error(`[sync-data] STALE: ${out} differs from ${rel}`)
      stale++
    } else {
      console.log(`[sync-data] ok: ${out} == ${rel}`)
    }
    continue
  }
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

if (check) {
  if (stale > 0) {
    console.error(
      `[sync-data] ${stale} snapshot file(s) are stale. Run \`make leaderboard\` at the repo ` +
        'root, then `node scripts/sync-data.mjs` in web/, and commit web/data/.',
    )
    process.exit(1)
  }
  console.log('[sync-data] snapshot is in sync with the scorer pipeline')
} else {
  console.log(`[sync-data] done (${refreshed}/${pairs.length} refreshed from scorer)`)
}
