// Copies the scorer's generated artifacts into the web app so the build never
// reaches outside web/ at runtime. The Python scorer pipeline is the only writer.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const pairs = [
  ['../site/dist/leaderboard.json', 'data/leaderboard.json'],
  ['../DATASHEET.md', 'data/DATASHEET.md'],
]

for (const [rel, out] of pairs) {
  const src = resolve(process.cwd(), rel)
  const dst = resolve(process.cwd(), out)
  if (!existsSync(src)) {
    console.error(`[sync-data] source not found: ${src}`)
    process.exit(1)
  }
  mkdirSync(dirname(dst), { recursive: true })
  copyFileSync(src, dst)
  console.log(`[sync-data] ${rel} → ${out}`)
}
