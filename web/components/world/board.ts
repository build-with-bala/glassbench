/* The board: one glass slab per benchmark item.

   Pure layout code (no three.js, no DOM) so it can be unit-tested. The counts
   come from the scorer's leaderboard.json — nothing here hardcodes them.

   Split → slab vocabulary
     answerable     a clear slab; the only kind that can be lit from inside
     stale          a slab with a second, older layer that can float above it
     contradiction  asserted then retracted: sits slightly sunk into the board
     false_premise  never stated: a dark, cloudier slab

   Every route shows the same board in a different "scene" (which slabs are lit,
   which layers are raised). Scene values are stored per slab as 4-vectors and the
   shader blends them with a weight uniform, so route changes are a single tween. */

export type Split = 'answerable' | 'stale' | 'contradiction' | 'false_premise'

export interface BoardCounts {
  answerable: number
  stale: number
  contradiction: number
  false_premise: number
}

/** Scene order = component order of every per-slab vec4. */
export const SCENES = ['hero', 'board', 'card', 'submit'] as const
export type SceneName = (typeof SCENES)[number]
export type Vec4 = [number, number, number, number]

export const PITCH = 1
export const SLAB_HALF = 0.468
export const SLAB_HEIGHT = 0.17
export const MAX_LIGHTS = 10

export interface Tile {
  col: number
  row: number
  x: number
  z: number
  /** resting height offset (contradiction slabs sit slightly sunk) */
  y: number
  split: Split
  seed: number
  /** 0..1 entrance delay — ripples outward from the hero cluster */
  delay: number
  lit: Vec4
  lift: Vec4
}

/** The floating upper layer of a stale slab. */
export interface Stack {
  tile: number
  /** 0 hidden .. 1 fully extruded, per scene */
  show: Vec4
  /** clear air between the base slab and this layer, per scene */
  gap: Vec4
  /** how much light reaches it from the slab below, per scene */
  under: Vec4
}

export interface BoardLight {
  x: number
  y: number
  z: number
  intensity: number
  scene: number
}

export interface Board {
  side: number
  tiles: Tile[]
  stacks: Stack[]
  lights: BoardLight[]
  /** world-space point the camera frames, per scene */
  focus: { x: number; z: number }[]
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Role {
  dc: number
  dr: number
  split: Split
  lit: number
  lift: number
  stack?: { gap: number; under: number }
}

/* The hero cluster, as offsets from the focus cell. On screen +col runs down-right
   and -row runs up-right. Composed after the reference: one bright slab, a bright
   slab with a layer floating low over it, a taller floating pair behind, and a few
   half-lit neighbours so the glow has somewhere to fall off. */
const HERO_ROLES: Role[] = [
  { dc: 0, dr: 0, split: 'answerable', lit: 1, lift: 0.05 },
  { dc: 1, dr: 0, split: 'stale', lit: 1, lift: 0, stack: { gap: 0.1, under: 1 } },
  { dc: -1, dr: -1, split: 'answerable', lit: 0.86, lift: 0 },
  { dc: 0, dr: -1, split: 'answerable', lit: 0.2, lift: 0 },
  { dc: -1, dr: -2, split: 'stale', lit: 0.4, lift: 0, stack: { gap: 0.22, under: 0.3 } },
  { dc: 1, dr: -1, split: 'answerable', lit: 0.1, lift: 0 },
  { dc: 0, dr: -2, split: 'answerable', lit: 0.07, lift: 0 },
]

const SCENE_INDEX: Record<SceneName, number> = { hero: 0, board: 1, card: 2, submit: 3 }

export function createBoard(counts: BoardCounts): Board {
  const order: Split[] = ['answerable', 'stale', 'contradiction', 'false_premise']
  const remaining: Record<Split, number> = {
    answerable: Math.max(0, Math.floor(counts.answerable) || 0),
    stale: Math.max(0, Math.floor(counts.stale) || 0),
    contradiction: Math.max(0, Math.floor(counts.contradiction) || 0),
    false_premise: Math.max(0, Math.floor(counts.false_premise) || 0),
  }
  const total = order.reduce((s, k) => s + remaining[k], 0)
  if (total === 0) return { side: 0, tiles: [], stacks: [], lights: [], focus: SCENES.map(() => ({ x: 0, z: 0 })) }

  // Smallest square that holds every item; trim the cells farthest from the
  // centre (the corners) so the board has exactly one slab per item.
  const side = Math.ceil(Math.sqrt(total))
  const mid = (side - 1) / 2
  const cells: { col: number; row: number; d: number }[] = []
  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side; col++) {
      cells.push({ col, row, d: Math.hypot(col - mid, row - mid) })
    }
  }
  cells.sort((a, b) => a.d - b.d || a.row - b.row || a.col - b.col)
  cells.length = total
  cells.sort((a, b) => a.row - b.row || a.col - b.col)

  const key = (c: number, r: number) => `${c},${r}`
  const cellIndex = new Map<string, number>()
  cells.forEach((c, i) => cellIndex.set(key(c.col, c.row), i))

  const rand = mulberry32(0x61a55 ^ (total * 2654435761))
  const fc = Math.floor(side / 2)
  const fr = Math.floor(side / 2)

  const splits: (Split | null)[] = cells.map(() => null)
  const take = (want: Split): Split | null => {
    if (remaining[want] > 0) {
      remaining[want]--
      return want
    }
    return null
  }

  // 1. hero cluster claims its cells first (only while the data has enough items).
  const heroCells: { index: number; role: Role }[] = []
  for (const role of HERO_ROLES) {
    const index = cellIndex.get(key(fc + role.dc, fr + role.dr))
    if (index === undefined || splits[index]) continue
    const got = take(role.split)
    if (!got) continue
    splits[index] = got
    heroCells.push({ index, role })
  }

  // 2. everything else is dealt out by a seeded shuffle.
  const pool: Split[] = []
  for (const k of order) for (let i = 0; i < remaining[k]; i++) pool.push(k)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const t = pool[i]
    pool[i] = pool[j]
    pool[j] = t
  }
  let p = 0
  for (let i = 0; i < splits.length; i++) if (!splits[i]) splits[i] = pool[p++] ?? 'false_premise'

  const focusCell = cells[cellIndex.get(key(fc, fr)) ?? 0]
  const wx = (col: number) => (col - mid) * PITCH
  const wz = (row: number) => (row - mid) * PITCH
  const hx = wx(focusCell.col)
  const hz = wz(focusCell.row)

  const tiles: Tile[] = cells.map((c, i) => {
    const split = splits[i] as Split
    const x = wx(c.col)
    const z = wz(c.row)
    const dist = Math.hypot(x - hx, z - hz)
    return {
      col: c.col,
      row: c.row,
      x,
      z,
      y: split === 'contradiction' ? -0.034 : 0,
      split,
      seed: rand(),
      delay: Math.min(1, dist / (side * 0.62)) * 0.86 + rand() * 0.14,
      lit: [0, 0, 0, 0],
      lift: [0, 0, 0, 0],
    }
  })

  const stackByTile = new Map<number, Stack>()
  const stackFor = (tile: number): Stack => {
    let s = stackByTile.get(tile)
    if (!s) {
      s = { tile, show: [0, 0, 0, 0], gap: [0.12, 0.12, 0.12, 0.12], under: [0, 0, 0, 0] }
      stackByTile.set(tile, s)
    }
    return s
  }
  // every stale slab owns an upper layer, even where no scene raises it
  tiles.forEach((t, i) => {
    if (t.split === 'stale') stackFor(i)
  })

  const lights: BoardLight[] = []
  const addLight = (scene: number, tile: Tile, intensity: number) => {
    if (lights.length >= MAX_LIGHTS) return
    lights.push({ x: tile.x, y: tile.y - SLAB_HEIGHT * 0.45, z: tile.z, intensity, scene })
  }

  /** Nearest slabs of a split to a cell, deterministic. */
  const nearest = (split: Split, col: number, row: number, n: number, skip = new Set<number>()): number[] =>
    tiles
      .map((t, i) => ({ i, d: Math.hypot(t.col - col, t.row - row), ok: t.split === split && !skip.has(i) }))
      .filter((e) => e.ok)
      .sort((a, b) => a.d - b.d || a.i - b.i)
      .slice(0, n)
      .map((e) => e.i)

  // ---- scene 0 · hero: the reference cluster --------------------------------
  const HERO = SCENE_INDEX.hero
  for (const { index, role } of heroCells) {
    const t = tiles[index]
    t.lit[HERO] = role.lit
    t.lift[HERO] = role.lift
    if (role.stack && t.split === 'stale') {
      const s = stackFor(index)
      s.show[HERO] = 1
      s.gap[HERO] = role.stack.gap
      s.under[HERO] = role.stack.under
    }
    if (role.lit >= 0.4) addLight(HERO, t, role.lit)
  }

  // ---- scene 1 · leaderboard: a short, dim run of answered items -------------
  const BOARD = SCENE_INDEX.board
  const boardAnchor = { col: fc + 1, row: fr - 1 }
  nearest('answerable', boardAnchor.col, boardAnchor.row, 3).forEach((i, n) => {
    const level = [0.7, 0.46, 0.26][n] ?? 0.2
    tiles[i].lit[BOARD] = level
    if (level >= 0.4) addLight(BOARD, tiles[i], level)
  })
  nearest('stale', boardAnchor.col, boardAnchor.row, 1).forEach((i) => {
    const s = stackFor(i)
    s.show[BOARD] = 1
    s.gap[BOARD] = 0.14
    s.under[BOARD] = 0.3
    tiles[i].lit[BOARD] = Math.max(tiles[i].lit[BOARD], 0.3)
  })

  // ---- scene 2 · datasheet (and any unknown route): the composition itself ---
  // every answerable slab holds a trace of light, every stale layer is lifted.
  const CARD = SCENE_INDEX.card
  tiles.forEach((t, i) => {
    if (t.split === 'answerable') t.lit[CARD] = 0.1 + t.seed * 0.08
    if (t.split === 'stale') {
      const s = stackFor(i)
      s.show[CARD] = 1
      s.gap[CARD] = 0.07 + t.seed * 0.05
      s.under[CARD] = 0.16
      t.lit[CARD] = 0.14
    }
  })
  const cardAnchor = { col: fc + 1, row: fr }
  nearest('answerable', cardAnchor.col, cardAnchor.row, 1).forEach((i) => {
    tiles[i].lit[CARD] = 0.55
    addLight(CARD, tiles[i], 0.5)
  })

  // ---- scene 3 · submit: one new slab lifting onto the board -----------------
  const SUBMIT = SCENE_INDEX.submit
  const submitAnchor = { col: fc, row: fr - 1 }
  const submitLit = nearest('answerable', submitAnchor.col, submitAnchor.row, 2)
  submitLit.forEach((i, n) => {
    const level = n === 0 ? 0.95 : 0.3
    tiles[i].lit[SUBMIT] = level
    tiles[i].lift[SUBMIT] = n === 0 ? 0.16 : 0
    if (level >= 0.4) addLight(SUBMIT, tiles[i], level)
  })

  const centre = (ids: number[], fallback: { x: number; z: number }) => {
    if (!ids.length) return fallback
    const s = ids.reduce((a, i) => ({ x: a.x + tiles[i].x, z: a.z + tiles[i].z }), { x: 0, z: 0 })
    return { x: s.x / ids.length, z: s.z / ids.length }
  }
  const heroFocus = { x: hx, z: hz }
  const focus = [
    heroFocus,
    centre(
      tiles.map((t, i) => (t.lit[BOARD] > 0.2 ? i : -1)).filter((i) => i >= 0),
      heroFocus,
    ),
    { x: wx(cardAnchor.col), z: wz(cardAnchor.row) },
    centre(submitLit.slice(0, 1), heroFocus),
  ]

  return { side, tiles, stacks: [...stackByTile.values()], lights, focus }
}

/** Which scene a pathname shows. Unknown routes get the calm "card" scene. */
export function sceneForPath(pathname: string | null | undefined): SceneName {
  if (!pathname || pathname === '/') return 'hero'
  if (pathname.startsWith('/leaderboard')) return 'board'
  if (pathname.startsWith('/submit')) return 'submit'
  return 'card'
}

export function sceneIndex(name: SceneName): number {
  return SCENE_INDEX[name]
}
